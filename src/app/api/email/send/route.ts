import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { sendEmailWithResend, interpolateEmailTemplate } from '@/lib/email/resend';
import type { Contact, Deal, EmailTemplate } from '@/types';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json({ error: 'Payload body is required' }, { status: 400 });
    }

    const { contactId, dealId, templateId, to, subject: customSubject, html: customHtml } = body;

    const db = supabaseAdmin();

    // 1. Fetch Contact if provided
    let contact: Contact | null = null;
    if (contactId) {
      const { data } = await db
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .eq('account_id', ctx.accountId)
        .maybeSingle();
      contact = data as Contact | null;
    }

    // 2. Fetch Deal if provided
    let deal: Deal | null = null;
    if (dealId) {
      const { data } = await db
        .from('deals')
        .select('*')
        .eq('id', dealId)
        .eq('account_id', ctx.accountId)
        .maybeSingle();
      deal = data as Deal | null;
    }

    // 3. Resolve destination email
    const recipientEmail = (to || contact?.email)?.trim();
    if (!recipientEmail || !recipientEmail.includes('@')) {
      return NextResponse.json(
        { error: 'El contacto no tiene un correo electrónico válido registrado' },
        { status: 400 },
      );
    }

    // 4. Fetch Template if provided
    let templateSubject = customSubject || '';
    let templateHtml = customHtml || '';

    if (templateId) {
      const { data: tmplRow } = await db
        .from('email_templates')
        .select('*')
        .eq('id', templateId)
        .eq('account_id', ctx.accountId)
        .maybeSingle();

      if (tmplRow) {
        const tmpl = tmplRow as EmailTemplate;
        templateSubject = templateSubject || tmpl.subject;
        templateHtml = templateHtml || tmpl.body_html;
      }
    }

    if (!templateSubject || !templateHtml) {
      return NextResponse.json(
        { error: 'Asunto y contenido de correo son requeridos' },
        { status: 400 },
      );
    }

    // 5. Interpolate dynamic variables
    const finalSubject = interpolateEmailTemplate(templateSubject, { contact, deal });
    const finalHtml = interpolateEmailTemplate(templateHtml, { contact, deal });

    // 6. Dispatch email via Resend and record log
    const result = await sendEmailWithResend({
      accountId: ctx.accountId,
      to: recipientEmail,
      subject: finalSubject,
      html: finalHtml,
      templateId: templateId || null,
      contactId: contact?.id || null,
      dealId: deal?.id || null,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error || 'Error al enviar correo' }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      resendId: result.resendId,
      logId: result.logId,
      recipient: recipientEmail,
      subject: finalSubject,
    });
  } catch (err: unknown) {
    return toErrorResponse(err);
  }
}
