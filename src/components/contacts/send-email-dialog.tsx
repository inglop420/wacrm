'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Mail,
  Send,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  Building2,
  User,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { Contact, EmailTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { interpolateEmailTemplate } from '@/lib/email/resend';

interface SendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: Contact | null;
  onEmailSent?: () => void;
}

export function SendEmailDialog({
  open,
  onOpenChange,
  contact,
  onEmailSent,
}: SendEmailDialogProps) {
  const { accountId } = useAuth();
  const supabase = createClient();

  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  const [targetEmail, setTargetEmail] = useState('');
  const [sending, setSending] = useState(false);

  // Sync target email when contact changes
  useEffect(() => {
    if (contact) {
      setTargetEmail(contact.email || '');
    }
  }, [contact]);

  // Load available templates
  useEffect(() => {
    if (!open || !accountId) return;

    async function loadTemplates() {
      setLoadingTemplates(true);
      const { data, error } = await supabase
        .from('email_templates')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setTemplates(data as EmailTemplate[]);
        if (data.length > 0 && !selectedTemplateId) {
          setSelectedTemplateId(data[0].id);
        }
      }
      setLoadingTemplates(false);
    }

    loadTemplates();
  }, [open, accountId, supabase, selectedTemplateId]);

  // Selected template object
  const selectedTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplateId) || null;
  }, [templates, selectedTemplateId]);

  // Interpolated preview for this contact
  const interpolatedSubject = useMemo(() => {
    if (!selectedTemplate || !contact) return '';
    return interpolateEmailTemplate(selectedTemplate.subject, {
      contact: { ...contact, email: targetEmail },
    });
  }, [selectedTemplate, contact, targetEmail]);

  const interpolatedHtml = useMemo(() => {
    if (!selectedTemplate || !contact) return '';
    return interpolateEmailTemplate(selectedTemplate.body_html, {
      contact: { ...contact, email: targetEmail },
    });
  }, [selectedTemplate, contact, targetEmail]);

  // Send action
  async function handleSendEmail() {
    if (!targetEmail.trim() || !targetEmail.includes('@')) {
      toast.error('Ingresa un correo electrónico de destino válido');
      return;
    }

    if (!selectedTemplateId) {
      toast.error('Selecciona una plantilla de correo');
      return;
    }

    setSending(true);
    try {
      // 1. If contact email was empty, update it in database too
      if (contact && !contact.email && targetEmail.trim()) {
        await supabase
          .from('contacts')
          .update({ email: targetEmail.trim() })
          .eq('id', contact.id);
      }

      // 2. Dispatch via API
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: contact?.id,
          to: targetEmail.trim(),
          templateId: selectedTemplateId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al enviar correo');
        return;
      }

      toast.success(`¡Plantilla enviada con éxito a ${targetEmail}!`);
      onOpenChange(false);
      onEmailSent?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error al enviar');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] max-w-2xl sm:max-w-2xl p-0 flex flex-col gap-0 overflow-hidden bg-background border-border/80 shadow-2xl">
        {/* Header */}
        <DialogHeader className="p-4 sm:p-5 border-b bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-600 to-purple-600 text-white shadow-xs">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                Enviar Plantilla de Correo
                <Badge variant="outline" className="text-[11px] font-normal border-blue-500/30 text-blue-500 bg-blue-500/10">
                  Resend
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Envía una comunicación corporativa personalizada a este contacto.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Contact summary */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border bg-muted/30">
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground truncate">
                <User className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="truncate">{contact?.name || 'Contacto sin nombre'}</span>
              </div>
              {contact?.company && (
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground truncate">
                  <Building2 className="h-3 w-3 shrink-0" />
                  <span className="truncate">{contact.company}</span>
                </div>
              )}
            </div>

            {/* Email input */}
            <div className="space-y-1 w-full sm:w-[260px]">
              <Label htmlFor="c_email" className="text-[11px] font-semibold flex items-center justify-between">
                <span>Correo de destino:</span>
                {!contact?.email && (
                  <span className="text-[10px] text-amber-500 font-normal">No registrado</span>
                )}
              </Label>
              <Input
                id="c_email"
                type="email"
                placeholder="correo@ejemplo.com"
                value={targetEmail}
                onChange={(e) => setTargetEmail(e.target.value)}
                className="h-8 text-xs bg-background"
              />
            </div>
          </div>

          {/* Template selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Seleccionar Plantilla de Correo:</Label>
            {loadingTemplates ? (
              <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                Cargando plantillas...
              </div>
            ) : templates.length === 0 ? (
              <div className="p-3 rounded-lg border border-dashed text-center text-xs text-muted-foreground">
                No hay plantillas creadas todavía. Crea una en Configuración ➔ Plantillas de correo.
              </div>
            ) : (
              <Select
                value={selectedTemplateId}
                onValueChange={(val) => {
                  if (val) setSelectedTemplateId(val);
                }}
              >
                <SelectTrigger className="h-9 w-full text-xs">
                  <SelectValue placeholder="Elige una plantilla..." />
                </SelectTrigger>
                <SelectContent className="w-full max-w-[500px]">
                  {templates.map((tmpl) => (
                    <SelectItem key={tmpl.id} value={tmpl.id} className="text-xs py-2">
                      <div className="flex flex-col text-left">
                        <span className="font-semibold text-foreground">{tmpl.name}</span>
                        <span className="text-[11px] text-muted-foreground truncate">{tmpl.subject}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Interactive preview with interpolated contact data */}
          {selectedTemplate && (
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-primary" /> Vista Previa con datos de este contacto:
                </span>
                <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30 bg-emerald-500/10">
                  Variables Personalizadas
                </Badge>
              </div>

              {/* Subject box */}
              <div className="p-2.5 rounded-lg border bg-muted/40 text-xs">
                <span className="font-semibold text-muted-foreground">Asunto: </span>
                <span className="text-foreground font-medium">{interpolatedSubject}</span>
              </div>

              {/* Mini Email Iframe Preview */}
              <div className="rounded-xl border bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                <iframe
                  title="Preview for contact"
                  srcDoc={interpolatedHtml}
                  className="w-full h-[320px] border-none bg-[#f5f7fa]"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 border-t bg-muted/20 flex flex-row items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-xs"
            disabled={sending || !selectedTemplateId || !targetEmail}
            onClick={handleSendEmail}
          >
            {sending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                Enviar Correo Ahora
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
