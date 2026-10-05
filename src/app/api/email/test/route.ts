import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { sendEmailWithResend } from '@/lib/email/resend';

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const body = await request.json().catch(() => null);

    if (!body?.to) {
      return NextResponse.json({ error: 'Destination email "to" is required' }, { status: 400 });
    }

    const result = await sendEmailWithResend({
      accountId: ctx.accountId,
      to: body.to,
      subject: body.subject || 'Prueba de conexión de correo - WACRM & Resend',
      html:
        body.html ||
        `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-top: 0;">¡Conexión Exitosa con Resend!</h2>
          <p style="color: #475569; font-size: 15px; line-height: 24px;">
            Este es un correo de prueba enviado desde tu CRM <strong>WACRM</strong> a través de <strong>Resend</strong> utilizando el subdominio configurado.
          </p>
          <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; color: #334155; font-size: 14px;"><strong>Remitente:</strong> ${body.from || 'Configuración actual'}</p>
            <p style="margin: 4px 0 0 0; color: #334155; font-size: 14px;"><strong>Destinatario:</strong> ${body.to}</p>
          </div>
          <p style="color: #64748b; font-size: 13px; margin-bottom: 0;">
            Si respondes a este correo, tu respuesta será dirigida a tu bandeja de correo corporativo (Zoho).
          </p>
        </div>
      `,
      replyTo: body.reply_to || null,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, resendId: result.resendId, logId: result.logId });
  } catch (err: unknown) {
    return toErrorResponse(err);
  }
}
