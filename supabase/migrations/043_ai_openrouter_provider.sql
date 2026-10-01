-- ============================================================
-- 043_ai_openrouter_provider
--
-- Support OpenRouter as an AI provider alongside OpenAI and Anthropic.
-- Allows accounts to bring their OpenRouter API key and select any
-- LLM model available through OpenRouter.
--
-- Idempotent — safe to re-run.
-- ============================================================

DO $$
BEGIN
  -- 1. Update constraint on ai_configs.provider
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'ai_configs'::regclass
      AND conname = 'ai_configs_provider_check'
  ) THEN
    ALTER TABLE ai_configs DROP CONSTRAINT ai_configs_provider_check;
  END IF;

  ALTER TABLE ai_configs
    ADD CONSTRAINT ai_configs_provider_check
    CHECK (provider IN ('openai', 'anthropic', 'openrouter'));

  -- 2. Update constraint on ai_usage_log.provider (if table exists)
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE schemaname = 'public' AND tablename = 'ai_usage_log'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'ai_usage_log'::regclass
        AND conname = 'ai_usage_log_provider_check'
    ) THEN
      ALTER TABLE ai_usage_log DROP CONSTRAINT ai_usage_log_provider_check;
    END IF;

    ALTER TABLE ai_usage_log
      ADD CONSTRAINT ai_usage_log_provider_check
      CHECK (provider IN ('openai', 'anthropic', 'openrouter'));
  END IF;
END $$;
