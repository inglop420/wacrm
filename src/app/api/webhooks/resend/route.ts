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

    const { data: updatedLogs, error } = await db
      .from('email_logs')
      .update(updateData)
      .eq('resend_email_id', emailId)
      .select('broadcast_id, contact_id, status');

    if (error) {
      console.error('[webhooks/resend] Failed to update email_logs:', error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Sync with broadcast_recipients if this email was part of a broadcast campaign
    if (updatedLogs && updatedLogs.length > 0) {
      for (const log of updatedLogs) {
        if (log.broadcast_id && log.contact_id) {
          let recipientStatus: string | null = null;
          if (updateData.status === 'delivered') recipientStatus = 'delivered';
          else if (updateData.status === 'opened') recipientStatus = 'read';
          else if (updateData.status === 'clicked') recipientStatus = 'replied';
          else if (updateData.status === 'bounced' || updateData.status === 'failed') recipientStatus = 'failed';

          if (recipientStatus) {
            await db
              .from('broadcast_recipients')
              .update({
                status: recipientStatus,
                ...(recipientStatus === 'delivered' ? { delivered_at: new Date().toISOString() } : {}),
                ...(recipientStatus === 'read' ? { read_at: new Date().toISOString() } : {}),
                ...(recipientStatus === 'replied' ? { replied_at: new Date().toISOString() } : {}),
              })
              .eq('broadcast_id', log.broadcast_id)
              .eq('contact_id', log.contact_id);
          }
        }
      }
    }

    return NextResponse.json({ received: true, status: updateData.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[webhooks/resend] Error processing webhook:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
