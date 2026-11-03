import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { loadAiConfig } from '@/lib/ai/config'
import { buildConversationContext } from '@/lib/ai/context'
import { retrieveKnowledge } from '@/lib/ai/knowledge'
import { generateReply } from '@/lib/ai/generate'
import { buildSystemPrompt } from '@/lib/ai/defaults'
import { latestUserMessage } from '@/lib/ai/query'
import { logAiUsage } from '@/lib/ai/usage'
import { supabaseAdmin } from '@/lib/ai/admin-client'
import { AiError, type AiConfig } from '@/lib/ai/types'

/**
 * POST /api/ai/draft  (agent+)
 *
 * Body: { conversation_id }
 * Returns: { draft } — a suggested reply for the agent to edit + send.
 *
 * Uses the account's configured provider/key (BYO) and grounds with the active
 * agent's knowledge base and persona (Sales vs Support).
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('agent')

    const userLimit = checkRateLimit(`ai-draft:${userId}`, RATE_LIMITS.aiDraft)
    if (!userLimit.success) return rateLimitResponse(userLimit)
    // Also cap the whole team's draws on the shared BYO provider key.
    const accountLimit = checkRateLimit(
      `ai-draft-acct:${accountId}`,
      RATE_LIMITS.aiDraftAccount,
    )
    if (!accountLimit.success) return rateLimitResponse(accountLimit)

    const body = await request.json().catch(() => null)
    const conversationId =
      body && typeof body.conversation_id === 'string' ? body.conversation_id : ''
    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversation_id is required' },
        { status: 400 },
      )
    }

    const { data: conversation, error: convErr } = await supabase
      .from('conversations')
      .select('id, active_agent_id, active_agent_since')
      .eq('id', conversationId)
      .maybeSingle()
    if (convErr) {
      console.error('[ai/draft] conversation lookup error:', convErr)
      return NextResponse.json({ error: 'Failed to load conversation' }, { status: 500 })
    }
    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    const config = await loadAiConfig(supabase, accountId).catch((err) => {
      console.error('[ai/draft] loadAiConfig error:', err)
      throw new AiError('Stored API key could not be decrypted.', {
        code: 'key_decrypt_failed',
        status: 400,
      })
    })
    if (!config) {
      return NextResponse.json(
        {
          error: 'AI assistant is not set up. Enable it in Settings → AI Assistant.',
          code: 'ai_not_configured',
        },
        { status: 400 },
      )
    }

    let effectiveConfig: AiConfig = config
    let agentId: string | null = null

    if (conversation.active_agent_id) {
      const { data: agent } = await supabase
        .from('ai_agents')
        .select('*')
        .eq('account_id', accountId)
        .eq('id', conversation.active_agent_id)
        .maybeSingle()

      if (agent) {
        agentId = agent.id
        effectiveConfig = {
          ...config,
          model: agent.model?.trim() || config.model,
          systemPrompt: agent.system_prompt,
        }
      }
    }

    const messages = await buildConversationContext(supabase, conversationId)
    if (messages.length === 0) {
      return NextResponse.json(
        {
          error: 'No messages to draft from yet.',
          code: 'no_messages',
        },
        { status: 400 },
      )
    }

    const knowledge = await retrieveKnowledge(
      supabase,
      accountId,
      effectiveConfig,
      latestUserMessage(messages),
      5,
      agentId,
    )

    const systemPrompt = buildSystemPrompt({
      userPrompt: effectiveConfig.systemPrompt,
      mode: 'draft',
      knowledge,
    })

    const { text, usage } = await generateReply({ config: effectiveConfig, systemPrompt, messages })

    try {
      void logAiUsage(supabaseAdmin(), {
        accountId,
        conversationId,
        mode: 'draft',
        provider: effectiveConfig.provider,
        model: effectiveConfig.model,
        usage,
        agentId,
      })
    } catch (logErr) {
      console.warn('[ai/draft] usage log failed (continuing):', logErr)
    }

    return NextResponse.json({ draft: text })
  } catch (err) {
    if (err instanceof AiError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.status },
      )
    }
    return toErrorResponse(err)
  }
}
