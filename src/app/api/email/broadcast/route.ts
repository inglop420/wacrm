import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { supabaseAdmin } from '@/lib/automations/admin-client';
import { sendEmailWithResend, interpolateEmailTemplate } from '@/lib/email/resend';
import type { Contact, EmailTemplate } from '@/types';

interface AudienceFilter {
  type: 'all' | 'tags' | 'stage';
  tagIds?: string[];
  stageId?: string;
  excludeTagIds?: string[];
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent');
    const body = await request.json().catch(() => null);

    if (!body) {
      return NextResponse.json({ error: 'Payload body is required' }, { status: 400 });
    }

    const {
      name,
      templateId,
      audience = { type: 'all' } as AudienceFilter,
      testEmail,
    } = body;

    const db = supabaseAdmin();

    // 1. Fetch template
    if (!templateId) {
      return NextResponse.json({ error: 'Debes seleccionar una plantilla de correo' }, { status: 400 });
    }

    const { data: tmplRow, error: tmplError } = await db
      .from('email_templates')
      .select('*')
      .eq('id', templateId)
      .eq('account_id', ctx.accountId)
      .single();

    if (tmplError || !tmplRow) {
      return NextResponse.json({ error: 'Plantilla de correo no encontrada' }, { status: 404 });
    }

    const template = tmplRow as EmailTemplate;

    // 2. Handle TEST send if requested
    if (testEmail && typeof testEmail === 'string' && testEmail.includes('@')) {
      const sampleContact: Partial<Contact> = {
        name: 'Cliente de Prueba',
        company: 'Empresa Ejemplo S.A.',
        email: testEmail.trim(),
        phone: '+52 55 1234 5678',
      };

      const testSubject = `[PRUEBA] ${interpolateEmailTemplate(template.subject, { contact: sampleContact })}`;
      const testHtml = interpolateEmailTemplate(template.body_html, { contact: sampleContact });

      const testResult = await sendEmailWithResend({
        accountId: ctx.accountId,
        to: testEmail.trim(),
        subject: testSubject,
        html: testHtml,
        templateId: template.id,
      });

      if (!testResult.ok) {
        return NextResponse.json({ error: testResult.error || 'Error al enviar correo de prueba' }, { status: 400 });
      }

      return NextResponse.json({ ok: true, isTest: true, recipient: testEmail.trim() });
    }

    // 3. Validate Campaign Name
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'El nombre de la campaña es obligatorio' }, { status: 400 });
    }

    // 4. Resolve Target Audience Contacts
    let matchingContactIds: string[] = [];

    if (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) {
      const { data: contactTags } = await db
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', audience.tagIds);

      matchingContactIds = Array.from(new Set((contactTags || []).map((ct) => ct.contact_id)));
    } else if (audience.type === 'stage' && audience.stageId) {
      const { data: stageDeals } = await db
        .from('deals')
        .select('contact_id')
        .eq('stage_id', audience.stageId)
        .eq('account_id', ctx.accountId);

      matchingContactIds = Array.from(
        new Set((stageDeals || []).map((d) => d.contact_id).filter(Boolean) as string[]),
      );
    }

    // Query contacts belonging to account
    let query = db
      .from('contacts')
      .select('*')
      .eq('account_id', ctx.accountId)
      .not('email', 'is', null)
      .neq('email', '');

    if (audience.type === 'tags' || audience.type === 'stage') {
      if (matchingContactIds.length === 0) {
        return NextResponse.json(
          { error: 'No se encontraron contactos para los filtros seleccionados' },
          { status: 400 },
        );
      }
      query = query.in('id', matchingContactIds);
    }

    const { data: contactsData, error: contactsErr } = await query;
    if (contactsErr) {
      return NextResponse.json({ error: contactsErr.message }, { status: 500 });
    }

    // Exclude tags if specified
    let eligibleContacts = (contactsData as Contact[]) || [];
    if (audience.excludeTagIds && audience.excludeTagIds.length > 0) {
      const { data: excludedContactTags } = await db
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', audience.excludeTagIds);

      const excludedIds = new Set((excludedContactTags || []).map((ct) => ct.contact_id));
      eligibleContacts = eligibleContacts.filter((c) => !excludedIds.has(c.id));
    }

    // Filter valid email formats
    eligibleContacts = eligibleContacts.filter((c) => c.email && c.email.includes('@'));

    if (eligibleContacts.length === 0) {
      return NextResponse.json(
        {
          error:
            'Ninguno de los contactos filtrados cuenta con un correo electrónico válido registrado.',
        },
        { status: 400 },
      );
    }

    // 5. Create Parent Broadcast Record
    const { data: broadcastRow, error: broadcastErr } = await db
      .from('broadcasts')
      .insert({
        account_id: ctx.accountId,
        user_id: ctx.userId,
        name: name.trim(),
        channel: 'email',
        email_template_id: template.id,
        template_name: template.name,
        email_subject: template.subject,
        audience_filter: audience,
        status: 'sending',
        total_recipients: eligibleContacts.length,
        sent_count: 0,
        delivered_count: 0,
        read_count: 0,
        replied_count: 0,
        failed_count: 0,
      })
      .select('*')
      .single();

    if (broadcastErr || !broadcastRow) {
      return NextResponse.json(
        { error: broadcastErr?.message || 'Error al crear la campaña masiva' },
        { status: 500 },
      );
    }

    const broadcastId = broadcastRow.id;

    // 6. Create Initial Broadcast Recipients (status: pending)
    const recipientInserts = eligibleContacts.map((c) => ({
      broadcast_id: broadcastId,
      contact_id: c.id,
      status: 'pending',
    }));

    // Insert in batches of 200 to prevent payload limits
    for (let i = 0; i < recipientInserts.length; i += 200) {
      const batch = recipientInserts.slice(i, i + 200);
      await db.from('broadcast_recipients').insert(batch);
    }

    // 7. Dispatch Emails in Concurrency-Controlled Batches
    // Resend handles concurrent requests well; batching in chunks of 5 with 300ms pause avoids burst limits.
    const CHUNK_SIZE = 5;
    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < eligibleContacts.length; i += CHUNK_SIZE) {
      const chunk = eligibleContacts.slice(i, i + CHUNK_SIZE);

      await Promise.all(
        chunk.map(async (contact) => {
          try {
            const finalSubject = interpolateEmailTemplate(template.subject, { contact });
            const finalHtml = interpolateEmailTemplate(template.body_html, { contact });

            const result = await sendEmailWithResend({
              accountId: ctx.accountId,
              to: contact.email!.trim(),
              subject: finalSubject,
              html: finalHtml,
              templateId: template.id,
              contactId: contact.id,
              broadcastId: broadcastId,
            });

            if (result.ok) {
              sentCount++;
              await db
                .from('broadcast_recipients')
                .update({
                  status: 'sent',
                  sent_at: new Date().toISOString(),
                })
                .eq('broadcast_id', broadcastId)
                .eq('contact_id', contact.id);
            } else {
              failedCount++;
              await db
                .from('broadcast_recipients')
                .update({
                  status: 'failed',
                  error_message: result.error || 'Error al despachar correo',
                })
                .eq('broadcast_id', broadcastId)
                .eq('contact_id', contact.id);
            }
          } catch (err: unknown) {
            failedCount++;
            const msg = err instanceof Error ? err.message : 'Error inesperado';
            await db
              .from('broadcast_recipients')
              .update({
                status: 'failed',
                error_message: msg,
              })
              .eq('broadcast_id', broadcastId)
              .eq('contact_id', contact.id);
          }
        }),
      );

      // Brief delay between chunks
      if (i + CHUNK_SIZE < eligibleContacts.length) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }

    // 8. Finalize Campaign Status
    await db
      .from('broadcasts')
      .update({
        status: 'sent',
      })
      .eq('id', broadcastId);

    return NextResponse.json({
      ok: true,
      broadcastId,
      totalRecipients: eligibleContacts.length,
      sentCount,
      failedCount,
    });
  } catch (err: unknown) {
    return toErrorResponse(err);
  }
}
