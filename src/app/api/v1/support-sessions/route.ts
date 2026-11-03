import { requireApiKey } from '@/lib/auth/api-context'
import { ok, fail, toApiErrorResponse } from '@/lib/api/v1/respond'
import crypto from 'node:crypto'

function generateSupportCode(): string {
  // 6 chars from a high-legibility alphabet (no 0, O, 1, I)
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  let result = ''
  const bytes = crypto.randomBytes(6)
  for (let i = 0; i < 6; i++) {
    result += chars[bytes[i] % chars.length]
  }
  return `SOP-${result}`
}

export async function POST(request: Request) {
  try {
    const ctx = await requireApiKey(request, 'support:write')
    const body = await request.json().catch(() => null)

    if (!body || typeof body !== 'object') {
      return fail('bad_request', 'Invalid JSON body', 400)
    }

    const { phone, client_name, client_email, firm_name, plan, external_user_id, metadata, ttl_minutes } = body

    const ttl = typeof ttl_minutes === 'number' && ttl_minutes > 0 && ttl_minutes <= 1440
      ? ttl_minutes
      : 60 // 1 hour default

    const code = generateSupportCode()
    const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString()

    const cleanPhone = typeof phone === 'string' ? phone.trim() : null

    const { data: session, error: insError } = await ctx.supabase
      .from('support_sessions')
      .insert({
        account_id: ctx.accountId,
        code,
        phone: cleanPhone,
        client_name: typeof client_name === 'string' ? client_name.trim() : null,
        client_email: typeof client_email === 'string' ? client_email.trim() : null,
        firm_name: typeof firm_name === 'string' ? firm_name.trim() : null,
        plan: typeof plan === 'string' ? plan.trim() : null,
        external_user_id: typeof external_user_id === 'string' ? external_user_id.trim() : null,
        metadata: metadata && typeof metadata === 'object' ? metadata : null,
        expires_at: expiresAt,
      })
      .select('id, code, phone, client_name, client_email, firm_name, plan, expires_at, created_at')
      .single()

    if (insError) {
      console.error('[support-sessions POST] insert error:', insError)
      return fail('internal', 'Failed to create support session', 500)
    }

    // Try to resolve business phone from whatsapp_config
    const { data: waConfig } = await ctx.supabase
      .from('whatsapp_config')
      .select('phone_number_id')
      .eq('account_id', ctx.accountId)
      .maybeSingle()

    // Pre-filled message text
    const messageText = `Hola, requiero soporte de LEGMA. Ref: ${code}`
    const encodedText = encodeURIComponent(messageText)

    // Build wa.me link
    const waLink = `https://wa.me/?text=${encodedText}`

    return ok(
      {
        session,
        code,
        expires_at: expiresAt,
        message_text: messageText,
        wa_link: waLink,
      },
      201,
    )
  } catch (err) {
    return toApiErrorResponse(err)
  }
}
