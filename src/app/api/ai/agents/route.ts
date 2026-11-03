import { NextResponse } from 'next/server'
import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { listAgents } from '@/lib/ai/agents'

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

/**
 * GET /api/ai/agents
 *
 * Lists all agents available in the account (both the base Sales agent
 * from ai_configs and any specialized agents from ai_agents like Support).
 */
export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount()

    // 1. Fetch base sales config
    const { data: salesConfig, error: salesErr } = await supabase
      .from('ai_configs')
      .select('provider, model, system_prompt, is_active, auto_reply_enabled, auto_reply_max_per_conversation, handoff_agent_id, api_key')
      .eq('account_id', accountId)
      .maybeSingle()

    if (salesErr) {
      console.error('[ai/agents GET] sales fetch error:', salesErr)
    }

    // 2. Fetch specialized agents (e.g. Support)
    const customAgents = await listAgents(supabase, accountId)
    if (!customAgents.some((a) => a.slug === 'support')) {
      const defaultSupport = await loadAgentBySlug(supabase, accountId, 'support')
      if (defaultSupport) customAgents.push(defaultSupport)
    }

    const salesAgent = salesConfig
      ? {
          id: 'sales',
          slug: 'sales',
          name: 'Ventas (Principal)',
          systemPrompt: salesConfig.system_prompt,
          model: salesConfig.model,
          isActive: salesConfig.is_active,
          autoReplyEnabled: salesConfig.auto_reply_enabled,
          autoReplyMaxPerConversation: salesConfig.auto_reply_max_per_conversation,
          handoffAgentId: salesConfig.handoff_agent_id,
          triggerPhrases: [],
          sessionTtlHours: 24,
          isPrimary: true,
          hasKey: !!salesConfig.api_key,
        }
      : null

    return NextResponse.json({
      configured: !!salesConfig?.api_key,
      salesAgent,
      customAgents,
    })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * POST /api/ai/agents  (admin+)
 *
 * Create or upsert a specialized AI agent (e.g. Support).
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

    const limit = checkRateLimit(`ai-agents:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return bad('Invalid request body')

    const slug = typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
    if (!slug) return bad('slug is required (e.g. "support")')
    if (slug === 'sales') return bad('slug "sales" is reserved for the primary sales agent')

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return bad('name is required')

    const systemPrompt = typeof body.system_prompt === 'string' && body.system_prompt.trim()
      ? body.system_prompt.trim()
      : null

    const model = typeof body.model === 'string' && body.model.trim()
      ? body.model.trim()
      : null

    const isActive = body.is_active !== false
    const autoReplyEnabled = body.auto_reply_enabled !== false

    let maxPer = Number(body.auto_reply_max_per_conversation)
    if (!Number.isFinite(maxPer)) maxPer = 4
    maxPer = Math.min(20, Math.max(1, Math.floor(maxPer)))

    let sessionTtlHours = Number(body.session_ttl_hours)
    if (!Number.isFinite(sessionTtlHours) || sessionTtlHours <= 0) sessionTtlHours = 24

    const triggerPhrases = Array.isArray(body.trigger_phrases)
      ? body.trigger_phrases.filter((p: unknown) => typeof p === 'string' && p.trim().length > 0)
      : []

    // Validate handoffAgentId if provided
    let handoffAgentId: string | null = null
    const rawHandoff = typeof body.handoff_agent_id === 'string' ? body.handoff_agent_id.trim() : ''
    if (rawHandoff) {
      const { data: member } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('account_id', accountId)
        .eq('user_id', rawHandoff)
        .maybeSingle()

      if (!member) return bad('handoff_agent_id must be a member of this account')
      handoffAgentId = rawHandoff
    }

    const { data: agent, error: upsertErr } = await supabase
      .from('ai_agents')
      .upsert(
        {
          account_id: accountId,
          created_by: userId,
          slug,
          name,
          system_prompt: systemPrompt,
          model,
          is_active: isActive,
          auto_reply_enabled: autoReplyEnabled,
          auto_reply_max_per_conversation: maxPer,
          handoff_agent_id: handoffAgentId,
          trigger_phrases: triggerPhrases,
          session_ttl_hours: sessionTtlHours,
        },
        { onConflict: 'account_id,slug' },
      )
      .select('*')
      .single()

    if (upsertErr) {
      console.error('[ai/agents POST] upsert error:', upsertErr)
      return bad('Failed to save agent')
    }

    return NextResponse.json({ success: true, agent })
  } catch (err) {
    return toErrorResponse(err)
  }
}

