import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

type Params = { params: Promise<{ id: string }> }

function bad(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

/**
 * GET /api/ai/agents/[id]
 */
export async function GET(request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { id } = await params

    const { data: agent, error } = await supabase
      .from('ai_agents')
      .select('*')
      .eq('account_id', accountId)
      .eq('id', id)
      .maybeSingle()

    if (error || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    return NextResponse.json({ agent })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * PATCH /api/ai/agents/[id]
 */
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const { id } = await params

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return bad('Invalid request body')

    const update: Record<string, unknown> = {}

    if ('name' in body && typeof body.name === 'string') {
      update.name = body.name.trim()
    }

    if ('system_prompt' in body) {
      update.system_prompt = typeof body.system_prompt === 'string' && body.system_prompt.trim()
        ? body.system_prompt.trim()
        : null
    }

    if ('model' in body) {
      update.model = typeof body.model === 'string' && body.model.trim()
        ? body.model.trim()
        : null
    }

    if ('is_active' in body && typeof body.is_active === 'boolean') {
      update.is_active = body.is_active
    }

    if ('auto_reply_enabled' in body && typeof body.auto_reply_enabled === 'boolean') {
      update.auto_reply_enabled = body.auto_reply_enabled
    }

    if ('auto_reply_max_per_conversation' in body) {
      const maxPer = Number(body.auto_reply_max_per_conversation)
      if (Number.isFinite(maxPer)) {
        update.auto_reply_max_per_conversation = Math.min(20, Math.max(1, Math.floor(maxPer)))
      }
    }

    if ('session_ttl_hours' in body) {
      const ttl = Number(body.session_ttl_hours)
      if (Number.isFinite(ttl) && ttl > 0) {
        update.session_ttl_hours = Math.floor(ttl)
      }
    }

    if ('trigger_phrases' in body && Array.isArray(body.trigger_phrases)) {
      update.trigger_phrases = body.trigger_phrases.filter(
        (p: unknown) => typeof p === 'string' && p.trim().length > 0,
      )
    }

    if ('handoff_agent_id' in body) {
      const rawHandoff = typeof body.handoff_agent_id === 'string' ? body.handoff_agent_id.trim() : ''
      if (rawHandoff) {
        const { data: member } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('account_id', accountId)
          .eq('user_id', rawHandoff)
          .maybeSingle()
        if (!member) return bad('handoff_agent_id must be a member of this account')
        update.handoff_agent_id = rawHandoff
      } else {
        update.handoff_agent_id = null
      }
    }

    const { data: agent, error } = await supabase
      .from('ai_agents')
      .update(update)
      .eq('account_id', accountId)
      .eq('id', id)
      .select('*')
      .maybeSingle()

    if (error || !agent) {
      return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 })
    }

    return NextResponse.json({ success: true, agent })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * DELETE /api/ai/agents/[id]
 */
export async function DELETE(request: Request, { params }: Params) {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const { id } = await params

    const { error } = await supabase
      .from('ai_agents')
      .delete()
      .eq('account_id', accountId)
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: 'Failed to delete agent' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return toErrorResponse(err)
  }
}

