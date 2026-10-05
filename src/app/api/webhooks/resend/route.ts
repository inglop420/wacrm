import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/automations/admin-client';

/**
 * Resend Webhook receiver for tracking email delivery, opens, clics and bounces.
 * Endpoint: POST /api/webhooks/resend
 */
export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null);

    if (!payload?.type || !payload?.data?.email_id) {
      return NextResponse.json({ ok: false, error: 'Invalid webhook payload' }, { status: 400 });
    }

    const eventType = String(payload.type);
    const emailId = String(payload.data.email_id);
    const db = supabaseAdmin();

    const updateData: Record<string, unknown> = {};

    switch (eventType) {
      case 'email.sent':
        updateData.status = 'sent';
        break;
      case 'email.delivered':
        updateData.status = 'delivered';
        break;
      case 'email.opened':
        updateData.status = 'opened';
        updateData.opened_at = payload.data.created_at || new Date().toISOString();
        break;
      case 'email.clicked':
        updateData.status = 'clicked';
        updateData.clicked_at = payload.data.created_at || new Date().toISOString();
        break;
      case 'email.bounced':
        updateData.status = 'bounced';
        updateData.error_message = payload.data.bounce_type || 'Email bounced';
        break;
      case 'email.complained':
        updateData.status = 'failed';
        updateData.error_message = 'Recipient marked as spam/complained';
        break;
      default:
        // Ignore unhandled events
        return NextResponse.json({ received: true, ignored: true });
    }

    const { error } = await db
      .from('email_logs')
      .update(updateData)
      .eq('resend_email_id', emailId);

    if (error) {
      console.error('[webhooks/resend] Failed to update email_logs:', error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ received: true, status: updateData.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[webhooks/resend] Error processing webhook:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
