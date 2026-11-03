-- ============================================================
-- 046_ai_agents.sql — Multi-Agent Architecture (Sales & Support)
--
-- Enables multiple specialized AI agents per account (e.g. Sales vs. Support),
-- while preserving the existing ai_configs table as the source of truth for
-- shared provider credentials (API key, embeddings key) and the default
-- Sales agent configuration.
--
-- Design rules:
--   1. Zero regressions: existing sales configuration and threads behave identically.
--   2. Support agent gets its own prompt, knowledge base, handoff target, and
--      reply limits.
--   3. Support sessions allow single-use code tracking from LEGMA.
--   4. Knowledge documents and chunks are optionally partitioned by agent_id
--      (NULL = Sales agent / legacy).
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- 1. Table for specialized agents (Support, etc.)
CREATE TABLE IF NOT EXISTS ai_agents (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id                        uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by                        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  slug                              text NOT NULL,               -- e.g. 'support'
  name                              text NOT NULL,               -- e.g. 'Soporte Técnico'
  system_prompt                     text,                        -- Persona and specialized instructions
  model                             text,                        -- Optional model override (NULL inherits from ai_configs)
  is_active                         boolean NOT NULL DEFAULT true,
  auto_reply_enabled                boolean NOT NULL DEFAULT true,
  auto_reply_max_per_conversation   integer NOT NULL DEFAULT 4
                                      CHECK (auto_reply_max_per_conversation BETWEEN 1 AND 20),
  handoff_agent_id                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  trigger_phrases                   text[] NOT NULL DEFAULT ARRAY[]::text[],
  session_ttl_hours                 integer NOT NULL DEFAULT 24,
  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_ai_agents_account_slug ON ai_agents(account_id, slug);

ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_agents_select ON ai_agents;
CREATE POLICY ai_agents_select ON ai_agents FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS ai_agents_insert ON ai_agents;
CREATE POLICY ai_agents_insert ON ai_agents FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS ai_agents_update ON ai_agents;
CREATE POLICY ai_agents_update ON ai_agents FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS ai_agents_delete ON ai_agents;
CREATE POLICY ai_agents_delete ON ai_agents FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION public.update_ai_agents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_agents_updated_at ON ai_agents;
CREATE TRIGGER ai_agents_updated_at
  BEFORE UPDATE ON ai_agents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ai_agents_updated_at();

-- 2. Single-use support sessions (created by LEGMA API before redirecting to WhatsApp)
CREATE TABLE IF NOT EXISTS support_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  code              text NOT NULL UNIQUE,                       -- e.g. 'SOP-A1B2C3'
  phone             text,                                       -- E.164 phone if known by LEGMA
  client_name       text,
  client_email      text,
  firm_name         text,
  plan              text,
  external_user_id  text,
  metadata          jsonb,
  expires_at        timestamptz NOT NULL,
  consumed_at       timestamptz,
  conversation_id   uuid REFERENCES conversations(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_sessions_code ON support_sessions(code);
CREATE INDEX IF NOT EXISTS idx_support_sessions_phone_unconsumed
  ON support_sessions(account_id, phone, expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE support_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_sessions_select ON support_sessions;
CREATE POLICY support_sessions_select ON support_sessions FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS support_sessions_insert ON support_sessions;
CREATE POLICY support_sessions_insert ON support_sessions FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

-- 3. Conversation state extensions
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS active_agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS active_agent_since timestamptz;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS entry_point text;

-- 4. Knowledge documents and chunks partitioned by agent
ALTER TABLE ai_knowledge_documents
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES ai_agents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_docs_agent ON ai_knowledge_documents(agent_id);

ALTER TABLE ai_knowledge_chunks
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES ai_agents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_chunks_agent ON ai_knowledge_chunks(agent_id);

-- 5. Track agent in AI usage logs
ALTER TABLE ai_usage_log
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES ai_agents(id) ON DELETE SET NULL;

-- 6. Agent-scoped knowledge retrieval RPCs
-- Lexical matching (FTS)
CREATE OR REPLACE FUNCTION public.match_ai_knowledge_fts_scoped(
  p_account_id  uuid,
  p_agent_id    uuid,
  p_query       text,
  p_match_count integer
)
RETURNS TABLE (id uuid, content text, rank real) AS $$
  SELECT c.id,
         c.content,
         ts_rank(c.fts, plainto_tsquery('simple', p_query)) AS rank
  FROM ai_knowledge_chunks c
  WHERE c.account_id = p_account_id
    AND (
      (p_agent_id IS NULL AND c.agent_id IS NULL)
      OR (p_agent_id IS NOT NULL AND c.agent_id = p_agent_id)
    )
    AND c.fts @@ plainto_tsquery('simple', p_query)
  ORDER BY rank DESC
  LIMIT GREATEST(p_match_count, 0);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Semantic matching (pgvector)
CREATE OR REPLACE FUNCTION public.match_ai_knowledge_semantic_scoped(
  p_account_id      uuid,
  p_agent_id        uuid,
  p_query_embedding text,
  p_match_count     integer
)
RETURNS TABLE (id uuid, content text, distance real) AS $$
  SELECT c.id,
         c.content,
         (c.embedding <=> p_query_embedding::vector(1536)) AS distance
  FROM ai_knowledge_chunks c
  WHERE c.account_id = p_account_id
    AND (
      (p_agent_id IS NULL AND c.agent_id IS NULL)
      OR (p_agent_id IS NOT NULL AND c.agent_id = p_agent_id)
    )
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_query_embedding::vector(1536)
  LIMIT GREATEST(p_match_count, 0);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.match_ai_knowledge_fts_scoped(uuid, uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.match_ai_knowledge_semantic_scoped(uuid, uuid, text, integer) TO authenticated, service_role;

