import { supabaseAdmin } from './admin-client'
import { loadAiConfig } from './config'
import { buildConversationContext } from './context'
import { retrieveKnowledge } from './knowledge'
import { generateReply } from './generate'
import { buildSystemPrompt } from './defaults'
import { buildHandoffSummary } from './handoff'
import { logAiUsage } from './usage'
import { latestUserMessage } from './query'
import { resolveActiveAgent } from './agents'
import type { AiConfig } from './types'
import {
  engineSendText,
  loadAccountMetaCredentials,
} from '@/lib/flows/meta-send'
import { sendTypingIndicator } from '@/lib/whatsapp/meta-api'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit'

interface DispatchArgs {
  /** Tenancy key — drives config, contact, and whatsapp_config lookups. */
  accountId: string
  conversationId: string
  contactId: string
  /** The account's WhatsApp config owner, used for the outbound send's
   *  audit columns (mirrors how the flow runner passes it through). */
  configOwnerUserId: string
  /** Meta's wamid of the customer message we're replying to. When set,
   *  a typing indicator (which also marks it read) is shown while the
   *  reply is generated. Optional so older callers keep working. */
  inboundMessageId?: string
  /** Inbound customer text, used for agent intent / trigger code resolution. */
  inboundText?: string
  /** Customer phone number, used for support session resolution. */
  contactPhone?: string | null
}

/**
 * AI auto-reply for a freshly-arrived inbound message.
 *
 * Invoked from the WhatsApp webhook's `after()` block, only when no
 * deterministic flow consumed the message (flows win). Mirrors the flow
 * runner's contract: it owns its try/catch and NEVER throws — a failing
 * or slow LLM call must not affect the webhook's 200 to Meta.
 *
 * Multi-Agent routing:
 *   - Resolves whether inbound is for Support (trigger code / button session / phrase)
 *     or Sales (default).
 *   - If contact has 'Cliente' tag and is NOT in a support session, the bots remain
 *     dormant (never send existing clients to sales).
 *   - Applies the active agent's system prompt, knowledge base, reply caps, and handoff.
 */
export async function dispatchInboundToAiReply(
  args: DispatchArgs,
): Promise<void> {
  const {
    accountId,
    conversationId,
    contactId,
    configOwnerUserId,
    inboundMessageId,
    inboundText,
    contactPhone,
  } = args

  try {
    const db = supabaseAdmin()

    // Base account AI config: provides shared API credentials (BYO key, provider, embeddings)
    const config = await loadAiConfig(db, accountId)
    if (!config || !config.isActive) return

    // Deterministic, user-configured responders win over the LLM — the
    // caller already excludes messages a Flow consumed. Message-level
    // automations (`new_message_received` / `keyword_match`) are
    // dispatched independently for this same inbound and may send their
    // own reply, so if the account has any active one we stand down to
    // avoid double-texting the customer. (Relationship triggers like
    // `first_inbound_message` don't count — they're not per-message
    // auto-responders.)
    const { data: autoResponders } = await db
      .from('automations')
      .select('id')
      .eq('account_id', accountId)
      .eq('is_active', true)
      .in('trigger_type', ['new_message_received', 'keyword_match'])
      .limit(1)
    if (autoResponders && autoResponders.length > 0) return

    // Resolve active agent (Support vs Sales vs Dormant)
    const resolution = await resolveActiveAgent({
      db,
      accountId,
      conversationId,
      contactId,
      inboundText: inboundText ?? '',
      contactPhone,
    })

    if (resolution.kind === 'client_dormant') {
      // Existing client messaging outside support button session -> no bot replies!
      return
    }

    let effectiveConfig: AiConfig
    let agentId: string | null = null

    if (resolution.kind === 'support') {
      const supportAgent = resolution.agent
      if (!supportAgent.isActive || !supportAgent.autoReplyEnabled) return

      agentId = supportAgent.id
      effectiveConfig = {
        ...config,
        model: supportAgent.model?.trim() || config.model,
        systemPrompt: supportAgent.systemPrompt,
        isActive: supportAgent.isActive,
        autoReplyEnabled: supportAgent.autoReplyEnabled,
        autoReplyMaxPerConversation: supportAgent.autoReplyMaxPerConversation,
        handoffAgentId: supportAgent.handoffAgentId,
      }
    } else {
      // Sales agent (existing configuration in ai_configs)
      if (!config.autoReplyEnabled) return
      effectiveConfig = config
    }

    const { data: conv, error: convErr } = await db
      .from('conversations')
      .select('assigned_agent_id, ai_autoreply_disabled, ai_reply_count, active_agent_since')
      .eq('id', conversationId)
      .maybeSingle()
    if (convErr || !conv) return
    if (conv.assigned_agent_id) return // a human owns this thread
    if (conv.ai_autoreply_disabled) return // handed off / turned off here
    // Cheap early-out; the authoritative cap check is the atomic claim
    // below (this read can race a concurrent inbound).
    if (conv.ai_reply_count >= effectiveConfig.autoReplyMaxPerConversation) return

    const sinceTimestamp = resolution.kind === 'support' ? conv.active_agent_since : null
    const messages = await buildConversationContext(db, conversationId, undefined, sinceTimestamp)
    if (messages.length === 0) return

    // Account-wide throttle on the shared BYO key.
    const acctLimit = checkRateLimit(
      `ai-autoreply:${accountId}`,
      RATE_LIMITS.aiAutoReplyAccount,
    )
    if (!acctLimit.success) {
      console.warn(
        `[ai auto-reply] account ${accountId} hit the per-account rate limit — skipping this inbound.`,
      )
      return
    }

    // Every gate has passed — we're committed to attempting a reply, so
    // show the customer "typing…" (and mark their message read) while the
    // retrieval + LLM round trips run.
    if (inboundMessageId) {
      await showTypingIndicator(db, accountId, inboundMessageId)
    }

    // Ground the reply in the agent's scoped knowledge base.
    const knowledge = await retrieveKnowledge(
      db,
      accountId,
      effectiveConfig,
      latestUserMessage(messages),
      5,
      agentId,
    )

    const systemPrompt = buildSystemPrompt({
      userPrompt: effectiveConfig.systemPrompt,
      mode: 'auto_reply',
      knowledge,
    })

    const { text, handoff, usage } = await generateReply({
      config: effectiveConfig,
      systemPrompt,
      messages,
    })

    // Record token spend on the account's BYO key.
    void logAiUsage(db, {
      accountId,
      conversationId,
      mode: 'auto_reply',
      provider: effectiveConfig.provider,
      model: effectiveConfig.model,
      usage,
      agentId,
    })

    if (handoff || !text) {
      // The model can't (or shouldn't) answer — stop auto-replying on
      // this thread and hand it to a human.
      const summary = buildHandoffSummary({
        messages,
        replyCount: conv.ai_reply_count ?? 0,
      })
      const update: Record<string, unknown> = {
        ai_autoreply_disabled: true,
        ai_handoff_summary: summary,
      }
      // Set the assignee to the agent's configured handoff person
      if (effectiveConfig.handoffAgentId && !conv.assigned_agent_id) {
        update.assigned_agent_id = effectiveConfig.handoffAgentId
      }
      await db.from('conversations').update(update).eq('id', conversationId)
      return
    }

    // Atomically claim a reply slot with the agent's configured max replies cap.
    const { data: claimed, error: claimErr } = await db.rpc(
      'claim_ai_reply_slot',
      {
        conversation_id: conversationId,
        max_replies: effectiveConfig.autoReplyMaxPerConversation,
      },
    )
    if (claimErr) {
      console.error('[ai auto-reply] claim_ai_reply_slot failed:', claimErr)
      return
    }
    if (claimed !== true) return // lost the per-conversation cap race

    await engineSendText({
      accountId,
      userId: configOwnerUserId,
      conversationId,
      contactId,
      text,
      aiGenerated: true,
    })
  } catch (err) {
    console.error('[ai auto-reply] dispatch failed:', err)
  }
}

/**
 * Best-effort "typing…" for the inbound we're about to answer. Swallows
 * every failure (no WhatsApp config, bad token, Meta 4xx) with a warning
 * — the indicator is cosmetic, the reply is not.
 */
async function showTypingIndicator(
  db: ReturnType<typeof supabaseAdmin>,
  accountId: string,
  inboundMessageId: string,
): Promise<void> {
  try {
    const { phoneNumberId, accessToken } = await loadAccountMetaCredentials(
      db,
      accountId,
    )
    await sendTypingIndicator({
      phoneNumberId,
      accessToken,
      messageId: inboundMessageId,
    })
  } catch (err) {
    console.warn('[ai auto-reply] typing indicator failed (continuing):', err)
  }
}
