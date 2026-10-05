import { supabaseAdmin } from '@/lib/automations/admin-client';
import type { Contact, Deal, EmailConfig } from '@/types';

export interface SendEmailOptions {
  accountId: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  templateId?: string | null;
  broadcastId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  replyTo?: string | null;
}

export interface SendEmailResult {
  ok: boolean;
  resendId?: string;
  logId?: string;
  error?: string;
}

const DEFAULT_FROM_NAME = 'Ventas LEGMA';
const DEFAULT_FROM_EMAIL = 'notificaciones@crm.legma.com.mx';
const DEFAULT_REPLY_TO = 'contacto@legma.com.mx';

/**
 * Replace placeholders like {{contact.name}}, {{contact.company}},
 * {{deal.title}}, {{deal.value}} in text or HTML templates.
 */
export function interpolateEmailTemplate(
  content: string,
  data: {
    contact?: Partial<Contact> | null;
    deal?: Partial<Deal> | null;
    vars?: Record<string, unknown> | null;
  },
): string {
  if (!content) return '';

  return content.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
    const parts = String(key).split('.');
    if (parts.length === 1) {
      // Direct variable or legacy format like {{name}}
      const varKey = parts[0];
      if (varKey === 'name') return data.contact?.name || '';
      if (varKey === 'company') return data.contact?.company || '';
      if (varKey === 'email') return data.contact?.email || '';
      if (varKey === 'phone') return data.contact?.phone || '';
      if (data.vars?.[varKey] != null) return String(data.vars[varKey]);
      return '';
    }

    const [scope, prop] = parts;
    if (scope === 'contact' && data.contact) {
      const val = (data.contact as Record<string, unknown>)[prop];
      return val != null ? String(val) : '';
    }
    if (scope === 'deal' && data.deal) {
      const val = (data.deal as Record<string, unknown>)[prop];
      return val != null ? String(val) : '';
    }
    if (scope === 'vars' && data.vars) {
      const val = data.vars[prop];
      return val != null ? String(val) : '';
    }
    return '';
  });
}

/**
 * Sends an email via Resend API and logs the dispatch to `email_logs`.
 */
export async function sendEmailWithResend(
  options: SendEmailOptions,
): Promise<SendEmailResult> {
  const db = supabaseAdmin();

  // 1. Resolve account email configuration
  const { data: configRow } = await db
    .from('email_configs')
    .select('*')
    .eq('account_id', options.accountId)
    .maybeSingle();

  const config = configRow as EmailConfig | null;

  const apiKey =
    config?.resend_api_key?.trim() ||
    process.env.RESEND_API_KEY?.trim() ||
    '';

  if (!apiKey) {
    const errorMsg = 'RESEND_API_KEY is not configured in account settings or environment';
    console.error(`[email] ${errorMsg}`);
    await recordFailedLog(db, options, errorMsg);
    return { ok: false, error: errorMsg };
  }

  const fromName = config?.from_name || DEFAULT_FROM_NAME;
  const fromEmail = config?.from_email || DEFAULT_FROM_EMAIL;
  const from = `${fromName} <${fromEmail}>`;
  const replyTo = options.replyTo || config?.reply_to_email || DEFAULT_REPLY_TO;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [options.to],
        subject: options.subject,
        html: options.html,
        text: options.text || undefined,
        reply_to: replyTo,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      const errDetail =
        result?.message || result?.error || `Resend HTTP error ${response.status}`;
      console.error('[email] Resend API error:', errDetail);
      const logId = await recordFailedLog(db, options, errDetail, from, replyTo);
      return { ok: false, error: errDetail, logId };
    }

    const resendId = result?.id as string | undefined;

    // Log the successful dispatch
    const { data: logRow, error: logErr } = await db
      .from('email_logs')
      .insert({
        account_id: options.accountId,
        broadcast_id: options.broadcastId || null,
        template_id: options.templateId || null,
        contact_id: options.contactId || null,
        deal_id: options.dealId || null,
        recipient_email: options.to,
        sender_email: from,
        reply_to_email: replyTo,
        subject: options.subject,
        resend_email_id: resendId || null,
        status: 'sent',
      })
      .select('id')
      .single();

    if (logErr) {
      console.error('[email] Failed to record email_log:', logErr.message);
    }

    return {
      ok: true,
      resendId,
      logId: logRow?.id,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[email] Dispatch exception:', message);
    const logId = await recordFailedLog(db, options, message, from, replyTo);
    return { ok: false, error: message, logId };
  }
}

async function recordFailedLog(
  db: ReturnType<typeof supabaseAdmin>,
  options: SendEmailOptions,
  errorMessage: string,
  from: string = DEFAULT_FROM_EMAIL,
  replyTo: string = DEFAULT_REPLY_TO,
): Promise<string | undefined> {
  const { data } = await db
    .from('email_logs')
    .insert({
      account_id: options.accountId,
      broadcast_id: options.broadcastId || null,
      template_id: options.templateId || null,
      contact_id: options.contactId || null,
      deal_id: options.dealId || null,
      recipient_email: options.to,
      sender_email: from,
      reply_to_email: replyTo,
      subject: options.subject,
      status: 'failed',
      error_message: errorMessage,
    })
    .select('id')
    .single();

  return data?.id;
}
