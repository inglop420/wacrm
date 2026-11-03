import { NextResponse } from 'next/server'
import {
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit'
import { loadEmbeddingsKey } from '@/lib/ai/config'
import { ingestDocument } from '@/lib/ai/knowledge'
import { AiError } from '@/lib/ai/types'

async function resolveAgentUuid(
  supabase: any,
  accountId: string,
  raw: string | null,
): Promise<{ uuid: string | null; isSales: boolean }> {
  if (!raw || raw === 'sales' || raw === 'default') {
    return { uuid: null, isSales: true }
  }
  if (raw === 'all') {
    return { uuid: null, isSales: false }
  }
  // Check if it's already a valid UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    return { uuid: raw, isSales: false }
  }
  // Resolve slug (e.g. 'support')
  const { data } = await supabase
    .from('ai_agents')
    .select('id')
    .eq('account_id', accountId)
    .eq('slug', raw)
    .maybeSingle()

  if (data?.id) {
    return { uuid: data.id, isSales: false }
  }

  // If looking for support and not yet in DB, auto-create it
  if (raw === 'support') {
    const { data: created } = await supabase
      .from('ai_agents')
      .insert({
        account_id: accountId,
        slug: 'support',
        name: 'Soporte Técnico',
        system_prompt: 'Eres el Agente de Soporte Técnico de LEGMA. Tu objetivo es asistir a socios y abogados postulantes en el uso diario de la plataforma: consulta de acuerdos judiciales, boletines, expedientes y fallas técnicas. Si un problema requiere escalamiento o el usuario solicita atención humana, responde exactamente [[HANDOFF]]. Mantén un tono formal, profesional, empático y resolutivo.',
        is_active: true,
        auto_reply_enabled: true,
        auto_reply_max_per_conversation: 4,
      })
      .select('id')
      .maybeSingle()

    return { uuid: created?.id ?? null, isSales: false }
  }

  return { uuid: null, isSales: false }
}

/**
 * GET /api/ai/knowledge
 *
 * List the account's knowledge-base documents (any member).
 * Supports optional `?agent_id=` query param to filter by agent.
 */
export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount()
    const url = new URL(request.url)
    const rawAgentId = url.searchParams.get('agent_id')

    let query = supabase
      .from('ai_knowledge_documents')
      .select('id, title, updated_at, agent_id')
      .eq('account_id', accountId)

    const resolved = await resolveAgentUuid(supabase, accountId, rawAgentId)

    if (resolved.isSales) {
      // Sales agent documents (agent_id IS NULL)
      query = query.is('agent_id', null)
    } else if (resolved.uuid) {
      // Specialized agent documents (e.g. Support)
      query = query.eq('agent_id', resolved.uuid)
    } else if (rawAgentId === 'support') {
      // Support requested but has no documents yet -> return empty!
      return NextResponse.json({ documents: [] })
    }

    const { data, error } = await query.order('updated_at', { ascending: false })

    if (error) {
      console.error('[ai/knowledge GET] error:', error)
      return NextResponse.json(
        { error: 'Failed to load knowledge base' },
        { status: 500 },
      )
    }
    return NextResponse.json({ documents: data ?? [] })
  } catch (err) {
    return toErrorResponse(err)
  }
}

/**
 * POST /api/ai/knowledge  (admin+)
 *
 * Create a document, then chunk + (optionally) embed it. If indexing
 * fails the document is still saved so the admin can retry via reindex.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')
    const limit = checkRateLimit(`ai-kb:${userId}`, RATE_LIMITS.adminAction)
    if (!limit.success) return rateLimitResponse(limit)

    const body = await request.json().catch(() => null)
    const title = typeof body?.title === 'string' ? body.title.trim() : ''
    const content = typeof body?.content === 'string' ? body.content.trim() : ''
    if (!title || !content) {
      return NextResponse.json(
        { error: 'title and content are required' },
        { status: 400 },
      )
    }

    const rawAgentId = typeof body?.agent_id === 'string' ? body.agent_id.trim() : null
    const resolved = await resolveAgentUuid(supabase, accountId, rawAgentId)
    const agentId = resolved.isSales ? null : resolved.uuid

    const { data: doc, error } = await supabase
      .from('ai_knowledge_documents')
      .insert({
        account_id: accountId,
        created_by: userId,
        title,
        content,
        agent_id: agentId,
      })
      .select('id')
      .single()

    if (error || !doc) {
      console.error('[ai/knowledge POST] insert error:', error)
      return NextResponse.json(
        { error: 'Failed to save document' },
        { status: 500 },
      )
    }

    const { key: embeddingsApiKey, corrupt } = await loadEmbeddingsKey(
      supabase,
      accountId,
    )
    try {
      await ingestDocument(
        supabase,
        accountId,
        { embeddingsApiKey },
        doc.id,
        content,
        agentId,
      )
    } catch (err) {
      const message = err instanceof AiError ? err.message : 'indexing failed'
      console.error('[ai/knowledge POST] ingest error:', err)
      return NextResponse.json(
        {
          success: true,
          id: doc.id,
          warning: `Saved, but semantic indexing failed (${message}). Lexical search still works; use Reindex to retry.`,
        },
        { status: 200 },
      )
    }

    if (corrupt) {
      return NextResponse.json({
        success: true,
        id: doc.id,
        warning:
          'Saved with keyword search only — your embeddings key could not be decrypted (check ENCRYPTION_KEY, then re-enter the key).',
      })
    }
    return NextResponse.json({ success: true, id: doc.id })
  } catch (err) {
    return toErrorResponse(err)
  }
}
