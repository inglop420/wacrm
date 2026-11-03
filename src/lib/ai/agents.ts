import type { SupabaseClient } from '@supabase/supabase-js'

export const CLIENT_TAG_NAME = 'Cliente'
export const SUPPORT_AGENT_SLUG = 'support'
export const DEFAULT_SESSION_TTL_HOURS = 24

export interface AiAgent {
  id: string
  accountId: string
  slug: string
  name: string
  systemPrompt: string | null
  model: string | null
  isActive: boolean
  autoReplyEnabled: boolean
  autoReplyMaxPerConversation: number
  handoffAgentId: string | null
  triggerPhrases: string[]
  sessionTtlHours: number
}

export interface SupportSession {
  id: string
  accountId: string
  code: string
  phone: string | null
  clientName: string | null
  clientEmail: string | null
  firmName: string | null
  plan: string | null
  externalUserId: string | null
  metadata: Record<string, unknown> | null
  expiresAt: string
  consumedAt: string | null
  conversationId: string | null
}

export type AgentResolution =
  | {
      kind: 'support'
      agent: AiAgent
      isNewSession: boolean
      session?: SupportSession | null
    }
  | {
      kind: 'client_dormant' // Client is tagged Cliente, no active support session -> do not reply with sales bot!
      agent: null
    }
  | {
      kind: 'sales'
      agent: null // Uses existing ai_configs
    }

/**
 * Maps DB row to AiAgent model.
 */
function toAiAgent(row: any): AiAgent {
  return {
    id: row.id,
    accountId: row.account_id,
    slug: row.slug,
    name: row.name,
    systemPrompt: row.system_prompt ?? null,
    model: row.model ?? null,
    isActive: row.is_active ?? true,
    autoReplyEnabled: row.auto_reply_enabled ?? true,
    autoReplyMaxPerConversation: row.auto_reply_max_per_conversation ?? 4,
    handoffAgentId: row.handoff_agent_id ?? null,
    triggerPhrases: Array.isArray(row.trigger_phrases) ? row.trigger_phrases : [],
    sessionTtlHours: row.session_ttl_hours ?? DEFAULT_SESSION_TTL_HOURS,
  }
}

/**
 * Loads an agent by slug for an account.
 */
export async function loadAgentBySlug(
  db: SupabaseClient,
  accountId: string,
  slug: string,
): Promise<AiAgent | null> {
  try {
    const q1 = db.from('ai_agents').select('*').eq('account_id', accountId)
    const q2 = typeof (q1 as any)?.eq === 'function' ? (q1 as any).eq('slug', slug) : q1
    const { data, error } = typeof (q2 as any)?.maybeSingle === 'function'
      ? await (q2 as any).maybeSingle()
      : { data: null, error: null }

    if (error || !data) return null
    return toAiAgent(data)
  } catch {
    return null
  }
}

/**
 * Loads an agent by ID for an account.
 */
export async function loadAgentById(
  db: SupabaseClient,
  accountId: string,
  agentId: string,
): Promise<AiAgent | null> {
  try {
    const { data, error } = await db
      .from('ai_agents')
      .select('*')
      .eq('account_id', accountId)
      .eq('id', agentId)
      .maybeSingle()

    if (error || !data) return null
    return toAiAgent(data)
  } catch {
    return null
  }
}

/**
 * Lists all agents for an account.
 */
export async function listAgents(
  db: SupabaseClient,
  accountId: string,
): Promise<AiAgent[]> {
  try {
    const { data, error } = await db
      .from('ai_agents')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: true })

    if (error || !data) return []
    return data.map(toAiAgent)
  } catch {
    return []
  }
}

/**
 * Checks if a contact has the Cliente tag (case-insensitive).
 */
export async function contactHasClientTag(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
): Promise<boolean> {
  try {
    const q1 = db.from('contact_tags').select('id, tags!inner(name, account_id)').eq('contact_id', contactId)
    const q2 = typeof (q1 as any)?.eq === 'function' ? (q1 as any).eq('tags.account_id', accountId) : q1
    const q3 = typeof (q2 as any)?.ilike === 'function' ? (q2 as any).ilike('tags.name', CLIENT_TAG_NAME) : q2
    const { data, error } = typeof (q3 as any)?.limit === 'function'
      ? await (q3 as any).limit(1)
      : { data: null, error: null }

    if (error || !data) return false
    return data.length > 0
  } catch {
    return false
  }
}

/**
 * Ensures the 'Cliente' tag exists and is assigned to the contact.
 */
export async function ensureClientTag(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
): Promise<void> {
  try {
    let tagId: string | null = null
    const { data: existingTag } = await db
      .from('tags')
      .select('id')
      .eq('account_id', accountId)
      .ilike('name', CLIENT_TAG_NAME)
      .maybeSingle()

    if (existingTag) {
      tagId = existingTag.id
    } else {
      const { data: newTag, error: tagErr } = await db
        .from('tags')
        .insert({
          account_id: accountId,
          name: CLIENT_TAG_NAME,
          color: '#10b981', // green badge
        })
        .select('id')
        .maybeSingle()

      if (!tagErr && newTag) {
        tagId = newTag.id
      }
    }

    if (!tagId) return

    await db
      .from('contact_tags')
      .upsert(
        { contact_id: contactId, tag_id: tagId },
        { onConflict: 'contact_id,tag_id', ignoreDuplicates: true },
      )
  } catch (err) {
    console.warn('[agents] ensureClientTag failed (continuing):', err)
  }
}

/**
 * Extracts a support code pattern from text (e.g. "Ref: SOP-123456" or "SOP-123456").
 */
export function extractSupportCode(text: string): string | null {
  if (!text) return null
  const match = text.match(/\b(SOP-[A-Za-z0-9_-]{4,20})\b/i)
  return match ? match[1].toUpperCase() : null
}

/**
 * Finds and marks as consumed a support session by code or phone.
 */
export async function claimSupportSession(
  db: SupabaseClient,
  accountId: string,
  conversationId: string,
  criteria: { code?: string | null; phone?: string | null },
): Promise<SupportSession | null> {
  const now = new Date().toISOString()

  try {
    // 1. Code match
    if (criteria.code) {
      const { data: session, error } = await db
        .from('support_sessions')
        .select('*')
        .eq('account_id', accountId)
        .ilike('code', criteria.code)
        .is('consumed_at', null)
        .gt('expires_at', now)
        .maybeSingle()

      if (!error && session) {
        await db
          .from('support_sessions')
          .update({
            consumed_at: now,
            conversation_id: conversationId,
          })
          .eq('id', session.id)

        return session as SupportSession
      }
    }

    // 2. Phone match if phone is provided and session was created recently
    if (criteria.phone) {
      const cleanPhone = criteria.phone.replace(/[^0-9]/g, '')
      const { data: sessions, error } = await db
        .from('support_sessions')
        .select('*')
        .eq('account_id', accountId)
        .is('consumed_at', null)
        .gt('expires_at', now)
        .order('created_at', { ascending: false })
        .limit(5)

      if (!error && sessions && sessions.length > 0) {
        const matched = sessions.find((s) => {
          if (!s.phone) return false
          const sClean = s.phone.replace(/[^0-9]/g, '')
          return cleanPhone.endsWith(sClean) || sClean.endsWith(cleanPhone)
        })

        if (matched) {
          await db
            .from('support_sessions')
            .update({
              consumed_at: now,
              conversation_id: conversationId,
            })
            .eq('id', matched.id)

          return matched as SupportSession
        }
      }
    }
  } catch {
    return null
  }

  return null
}

/**
 * Determines whether inbound text matches any trigger phrases configured on the support agent.
 */
export function matchesSupportTriggerPhrases(
  text: string,
  triggerPhrases: string[],
): boolean {
  if (!text || !triggerPhrases || triggerPhrases.length === 0) return false
  const lower = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return triggerPhrases.some((phrase) => {
    const p = phrase.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
    return p.length > 0 && lower.includes(p)
  })
}

/**
 * Resolves which agent should handle an incoming message, managing state transitions.
 *
 * Rules:
 *   1. Support trigger (code match, pending phone session, or trigger phrase)
 *      -> Switches conversation to Support agent.
 *      -> Tags contact as 'Cliente'.
 *      -> Resets ai_reply_count = 0, ai_autoreply_disabled = false.
 *      -> UNASSIGNS any previously assigned human agent (since they were from Sales).
 *   2. Active Support Session within TTL and not handed off
 *      -> Continues with Support agent.
 *   3. If contact is tagged 'Cliente' (paid customer) and NOT in a support session
 *      -> Dormant (no bot replies; leaves thread for human team, NEVER sends to Sales).
 *   4. Otherwise
 *      -> Sales agent (default behavior).
 */
export async function resolveActiveAgent(args: {
  db: SupabaseClient
  accountId: string
  conversationId: string
  contactId: string
  inboundText: string
  contactPhone?: string | null
}): Promise<AgentResolution> {
  const { db, accountId, conversationId, contactId, inboundText, contactPhone } = args

  try {
    // 1. Check if the account has a configured Support agent
    const supportAgent = await loadAgentBySlug(db, accountId, SUPPORT_AGENT_SLUG)

    if (supportAgent && supportAgent.isActive) {
      const code = extractSupportCode(inboundText)
      const phraseMatched = matchesSupportTriggerPhrases(
        inboundText,
        supportAgent.triggerPhrases,
      )

      let claimedSession: SupportSession | null = null
      if (code || contactPhone) {
        claimedSession = await claimSupportSession(db, accountId, conversationId, {
          code,
          phone: contactPhone,
        })
      }

      const isExplicitSupportTrigger =
        claimedSession !== null ||
        (code !== null && code.startsWith('SOP-')) ||
        phraseMatched

      if (isExplicitSupportTrigger) {
        // Transition to Support!
        await ensureClientTag(db, accountId, contactId)

        const nowIso = new Date().toISOString()
        await db
          .from('conversations')
          .update({
            active_agent_id: supportAgent.id,
            active_agent_since: nowIso,
            entry_point: 'support_button',
            ai_reply_count: 0,
            ai_autoreply_disabled: false,
            assigned_agent_id: null, // Unassign previous (sales) human owner
            ai_handoff_summary: null,
          })
          .eq('id', conversationId)

        return {
          kind: 'support',
          agent: supportAgent,
          isNewSession: true,
          session: claimedSession,
        }
      }
    }

    // 2. Fetch current conversation state
    const { data: conv } = await db
      .from('conversations')
      .select('active_agent_id, active_agent_since, ai_autoreply_disabled, assigned_agent_id')
      .eq('id', conversationId)
      .maybeSingle()

    if (conv?.active_agent_id && supportAgent && conv.active_agent_id === supportAgent.id) {
      // Check TTL
      const since = conv.active_agent_since ? new Date(conv.active_agent_since).getTime() : 0
      const ttlMs = (supportAgent.sessionTtlHours ?? DEFAULT_SESSION_TTL_HOURS) * 3600 * 1000
      const isWithinTtl = Date.now() - since < ttlMs

      if (isWithinTtl) {
        return {
          kind: 'support',
          agent: supportAgent,
          isNewSession: false,
        }
      }

      // TTL expired: clear active_agent_id
      await db
        .from('conversations')
        .update({ active_agent_id: null })
        .eq('id', conversationId)
    }

    // 3. Check if contact is tagged 'Cliente'
    const isClient = await contactHasClientTag(db, accountId, contactId)
    if (isClient) {
      // Paid client who messaged directly from WhatsApp without clicking the support button:
      // Do NOT trigger Sales agent! Leave for human team in inbox.
      return {
        kind: 'client_dormant',
        agent: null,
      }
    }
  } catch (err) {
    console.warn('[agents] resolveActiveAgent fallback to sales:', err)
  }

  // 4. Default to Sales Agent
  return {
    kind: 'sales',
    agent: null,
  }
}
