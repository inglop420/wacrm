'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import {
  Mail,
  Plus,
  Send,
  Trash2,
  Edit2,
  Eye,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  Copy,
  ExternalLink,
  Layers,
  Sparkles,
  MousePointerClick,
  Check,
  Code,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { EmailConfig, EmailTemplate, EmailLog } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmailTemplateDialog } from './email-template-dialog';

export function EmailModule() {
  const { accountId, user } = useAuth();
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<'templates' | 'logs' | 'config'>('templates');

  // Templates state
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Config state
  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configForm, setConfigForm] = useState({
    from_name: 'Ventas LEGMA',
    from_email: 'notificaciones@crm.legma.com.mx',
    reply_to_email: 'contacto@legma.com.mx',
    resend_api_key: '',
  });
  const [savingConfig, setSavingConfig] = useState(false);

  // Test send state
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  // Logs state
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logFilter, setLogFilter] = useState('');

  // 1. Load Templates
  const loadTemplates = useCallback(async () => {
    if (!accountId) return;
    setTemplatesLoading(true);
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading email templates:', error.message);
    } else {
      setTemplates((data ?? []) as EmailTemplate[]);
    }
    setTemplatesLoading(false);
  }, [accountId, supabase]);

  // 2. Load Config
  const loadConfig = useCallback(async () => {
    if (!accountId) return;
    setConfigLoading(true);
    const { data, error } = await supabase
      .from('email_configs')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle();

    if (!error && data) {
      const cfg = data as EmailConfig;
      setConfig(cfg);
      setConfigForm({
        from_name: cfg.from_name || 'Ventas LEGMA',
        from_email: cfg.from_email || 'notificaciones@crm.legma.com.mx',
        reply_to_email: cfg.reply_to_email || 'contacto@legma.com.mx',
        resend_api_key: cfg.resend_api_key || '',
      });
    }
    setConfigLoading(false);
  }, [accountId, supabase]);

  // 3. Load Logs
  const loadLogs = useCallback(async () => {
    if (!accountId) return;
    setLogsLoading(true);
    const { data, error } = await supabase
      .from('email_logs')
      .select('*, template:email_templates(name)')
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error loading email logs:', error.message);
    } else {
      setLogs((data ?? []) as EmailLog[]);
    }
    setLogsLoading(false);
  }, [accountId, supabase]);

  useEffect(() => {
    loadTemplates();
    loadConfig();
    loadLogs();
  }, [loadTemplates, loadConfig, loadLogs]);

  // Save Config
  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId) return;
    setSavingConfig(true);

    const payload = {
      account_id: accountId,
      from_name: configForm.from_name,
      from_email: configForm.from_email,
      reply_to_email: configForm.reply_to_email,
      resend_api_key: configForm.resend_api_key || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('email_configs')
      .upsert(payload, { onConflict: 'account_id' });

    setSavingConfig(false);

    if (error) {
      toast.error('Error al guardar configuración: ' + error.message);
    } else {
      toast.success('Configuración de correo guardada con éxito');
      loadConfig();
    }
  }

  // Send Test Email
  async function handleSendTest() {
    if (!testEmail || !testEmail.includes('@')) {
      toast.error('Ingresa un correo electrónico válido');
      return;
    }

    setSendingTest(true);
    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: testEmail,
          from: `${configForm.from_name} <${configForm.from_email}>`,
          reply_to: configForm.reply_to_email,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error('Error al enviar prueba: ' + (data.error || 'Fallo desconocido'));
      } else {
        toast.success(`¡Correo enviado con éxito a ${testEmail}! ID: ${data.resendId}`);
        loadLogs();
      }
    } catch (err: unknown) {
      toast.error('Excepción al enviar prueba: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSendingTest(false);
    }
  }

  // Open Template Modal
  function handleOpenCreateTemplate() {
    setEditingTemplate(null);
    setTemplateModalOpen(true);
  }

  function handleOpenEditTemplate(tmpl: EmailTemplate) {
    setEditingTemplate(tmpl);
    setTemplateModalOpen(true);
  }

  // Duplicate Template
  async function handleDuplicateTemplate(tmpl: EmailTemplate) {
    if (!accountId) return;
    const { error } = await supabase.from('email_templates').insert({
      account_id: accountId,
      user_id: user?.id || null,
      name: `${tmpl.name} (Copia)`,
      subject: tmpl.subject,
      body_html: tmpl.body_html,
      is_active: true,
    });
    if (error) {
      toast.error('Error al duplicar plantilla: ' + error.message);
    } else {
      toast.success('Plantilla duplicada con éxito');
      loadTemplates();
    }
  }

  // Save Template
  async function handleSaveTemplate(templateData: { name: string; subject: string; body_html: string }) {
    if (!accountId) return;
    setSavingTemplate(true);

    if (editingTemplate) {
      const { error } = await supabase
        .from('email_templates')
        .update({
          name: templateData.name,
          subject: templateData.subject,
          body_html: templateData.body_html,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingTemplate.id);

      setSavingTemplate(false);
      if (error) {
        toast.error('Error al actualizar plantilla: ' + error.message);
      } else {
        toast.success('Plantilla actualizada exitosamente');
        setTemplateModalOpen(false);
        loadTemplates();
      }
    } else {
      const { error } = await supabase.from('email_templates').insert({
        account_id: accountId,
        user_id: user?.id || null,
        name: templateData.name,
        subject: templateData.subject,
        body_html: templateData.body_html,
        is_active: true,
      });

      setSavingTemplate(false);
      if (error) {
        toast.error('Error al crear plantilla: ' + error.message);
      } else {
        toast.success('Plantilla creada exitosamente');
        setTemplateModalOpen(false);
        loadTemplates();
      }
    }
  }

  // Delete Template
  async function handleDeleteTemplate(id: string) {
    if (!confirm('¿Estás seguro de que deseas eliminar esta plantilla?')) return;

    const { error } = await supabase.from('email_templates').delete().eq('id', id);
    if (error) {
      toast.error('Error al eliminar: ' + error.message);
    } else {
      toast.success('Plantilla eliminada');
      loadTemplates();
    }
  }

  // Filtered logs
  const filteredLogs = useMemo(() => {
    if (!logFilter) return logs;
    const q = logFilter.toLowerCase();
    return logs.filter(
      (l) =>
        l.recipient_email.toLowerCase().includes(q) ||
        l.subject.toLowerCase().includes(q) ||
        l.status.toLowerCase().includes(q),
    );
  }, [logs, logFilter]);

  // Log stats
  const logStats = useMemo(() => {
    const total = logs.length;
    const delivered = logs.filter((l) => ['delivered', 'opened', 'clicked'].includes(l.status)).length;
    const opened = logs.filter((l) => ['opened', 'clicked'].includes(l.status)).length;
    const bounced = logs.filter((l) => ['bounced', 'failed'].includes(l.status)).length;
    return {
      total,
      delivered,
      opened,
      bounced,
      openRate: total > 0 ? Math.round((opened / total) * 100) : 0,
    };
  }, [logs]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            Módulo de Correo y Plantillas
          </h2>
          <p className="text-sm text-muted-foreground">
            Envíos automáticos por pipeline y calificación de leads impulsados por Resend y Zoho.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab === 'templates' && (
            <Button onClick={handleOpenCreateTemplate} className="gap-2">
              <Plus className="h-4 w-4" />
              Nueva Plantilla
            </Button>
          )}
          {activeTab === 'logs' && (
            <Button variant="outline" size="sm" onClick={loadLogs} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Actualizar
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="templates" className="gap-2">
            <Layers className="h-4 w-4" />
            Plantillas ({templates.length})
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <Clock className="h-4 w-4" />
            Historial ({logs.length})
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Configuración
          </TabsTrigger>
        </TabsList>

        {/* ==================================================== */}
        {/* TAB 1: PLANTILLAS                                   */}
        {/* ==================================================== */}
        <TabsContent value="templates" className="mt-6 space-y-4">
          {templatesLoading ? (
            <div className="flex justify-center p-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : templates.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center p-12 text-center">
                <div className="rounded-full bg-primary/10 p-3 text-primary mb-3">
                  <Mail className="h-6 w-6" />
                </div>
                <h3 className="text-base font-semibold">No hay plantillas de correo</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                  Crea tu primera plantilla para usarla en las etapas de tus pipelines y automatizaciones.
                </p>
                <Button onClick={handleOpenCreateTemplate} className="mt-4 gap-2">
                  <Plus className="h-4 w-4" />
                  Crear Plantilla
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((tmpl) => (
                <Card key={tmpl.id} className="flex flex-col justify-between hover:border-primary/50 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-medium line-clamp-1">{tmpl.name}</CardTitle>
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-400 bg-emerald-500/10 text-xs">
                        Activa
                      </Badge>
                    </div>
                    <CardDescription className="line-clamp-1 text-xs">
                      <strong>Asunto:</strong> {tmpl.subject}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    <div className="rounded bg-muted/50 p-2.5 text-xs text-muted-foreground line-clamp-3 font-mono">
                      {tmpl.body_html.replace(/<[^>]*>?/gm, ' ')}
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(tmpl.created_at).toLocaleDateString()}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Duplicar plantilla"
                          onClick={() => handleDuplicateTemplate(tmpl)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Editar plantilla"
                          onClick={() => handleOpenEditTemplate(tmpl)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="Eliminar plantilla"
                          onClick={() => handleDeleteTemplate(tmpl.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ==================================================== */}
        {/* TAB 2: HISTORIAL Y TRACKING                        */}
        {/* ==================================================== */}
        <TabsContent value="logs" className="mt-6 space-y-6">
          {/* Stats Bar */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs font-medium text-muted-foreground">Total Enviados</div>
                <div className="text-2xl font-bold mt-1">{logStats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs font-medium text-muted-foreground">Entregados</div>
                <div className="text-2xl font-bold text-emerald-500 mt-1">{logStats.delivered}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs font-medium text-muted-foreground">Aperturas (Opens)</div>
                <div className="text-2xl font-bold text-blue-500 mt-1">
                  {logStats.opened}{' '}
                  <span className="text-xs font-normal text-muted-foreground">({logStats.openRate}%)</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs font-medium text-muted-foreground">Rebotes / Errores</div>
                <div className="text-2xl font-bold text-rose-500 mt-1">{logStats.bounced}</div>
              </CardContent>
            </Card>
          </div>

          {/* Search bar */}
          <div className="flex items-center gap-2">
            <Input
              placeholder="Buscar por correo, asunto o estado..."
              value={logFilter}
              onChange={(e) => setLogFilter(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {/* Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground font-medium">
                  <tr>
                    <th className="p-3">Destinatario</th>
                    <th className="p-3">Asunto</th>
                    <th className="p-3">Estado</th>
                    <th className="p-3">Fecha Envío</th>
                    <th className="p-3">Apertura</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logsLoading ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        Cargando historial de envíos...
                      </td>
                    </tr>
                  ) : filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-muted-foreground">
                        No hay registros de envíos aún.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-muted/20">
                        <td className="p-3 font-medium text-foreground">{log.recipient_email}</td>
                        <td className="p-3 max-w-[200px] truncate text-muted-foreground">{log.subject}</td>
                        <td className="p-3">
                          <StatusBadge status={log.status} />
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="p-3 text-xs text-muted-foreground">
                          {log.opened_at ? (
                            <span className="flex items-center gap-1 text-emerald-400">
                              <Eye className="h-3 w-3" />
                              {new Date(log.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/60">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ==================================================== */}
        {/* TAB 3: CONFIGURACIÓN                                */}
        {/* ==================================================== */}
        <TabsContent value="config" className="mt-6 space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Sender form */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Configuración de Remitente</CardTitle>
                <CardDescription>
                  Define el nombre y correo que verán tus clientes al recibir los mensajes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveConfig} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="from_name">Nombre de Remitente</Label>
                    <Input
                      id="from_name"
                      value={configForm.from_name}
                      onChange={(e) => setConfigForm({ ...configForm, from_name: e.target.value })}
                      placeholder="Ej. Ventas LEGMA"
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="from_email">Correo de Salida (Resend)</Label>
                    <Input
                      id="from_email"
                      value={configForm.from_email}
                      onChange={(e) => setConfigForm({ ...configForm, from_email: e.target.value })}
                      placeholder="notificaciones@crm.legma.com.mx"
                      required
                    />
                    <p className="text-[12px] text-muted-foreground">
                      Debe coincidir con tu subdominio verificado en Resend (<code>crm.legma.com.mx</code>).
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="reply_to_email">Correo de Respuestas (Zoho)</Label>
                    <Input
                      id="reply_to_email"
                      value={configForm.reply_to_email}
                      onChange={(e) => setConfigForm({ ...configForm, reply_to_email: e.target.value })}
                      placeholder="contacto@legma.com.mx"
                      required
                    />
                    <p className="text-[12px] text-muted-foreground">
                      A esta dirección llegarán las respuestas directas de tus clientes a tu buzón de Zoho.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="resend_api_key">API Key de Resend (Opcional)</Label>
                    <Input
                      id="resend_api_key"
                      type="password"
                      value={configForm.resend_api_key}
                      onChange={(e) => setConfigForm({ ...configForm, resend_api_key: e.target.value })}
                      placeholder="Dejar en blanco si ya está en variables de Vercel"
                    />
                    <p className="text-[12px] text-muted-foreground">
                      Si configuraste <code>RESEND_API_KEY</code> en Vercel/.env.local, no es necesario ingresarla aquí.
                    </p>
                  </div>

                  <Button type="submit" disabled={savingConfig} className="w-full">
                    {savingConfig ? 'Guardando...' : 'Guardar Configuración'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Test Send & Webhook Info */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Prueba de Envío Inmediato</CardTitle>
                  <CardDescription>
                    Envía un correo de prueba para verificar que Resend entregue a tu bandeja.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="test_email">Correo de destino</Label>
                    <div className="flex gap-2">
                      <Input
                        id="test_email"
                        placeholder="tu-correo@gmail.com"
                        value={testEmail}
                        onChange={(e) => setTestEmail(e.target.value)}
                      />
                      <Button onClick={handleSendTest} disabled={sendingTest} className="gap-2">
                        <Send className="h-4 w-4" />
                        {sendingTest ? 'Enviando...' : 'Probar'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Webhook de Métricas (Tracking)</CardTitle>
                  <CardDescription>
                    Configura esta URL en el panel de Resend para recibir confirmaciones de entrega y aperturas en tiempo real.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2 rounded bg-muted/60 p-2 font-mono text-xs text-foreground">
                    <span className="flex-1 truncate">https://crm.legma.com.mx/api/webhooks/resend</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        navigator.clipboard.writeText('https://crm.legma.com.mx/api/webhooks/resend');
                        toast.success('URL del webhook copiada');
                      }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Eventos sugeridos en Resend: <code>email.delivered</code>, <code>email.opened</code>, <code>email.clicked</code>, <code>email.bounced</code>.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ==================================================== */}
      {/* MODAL: CREADOR / EDITOR CORPORATIVO LEGMA          */}
      {/* ==================================================== */}
      <EmailTemplateDialog
        open={templateModalOpen}
        onOpenChange={setTemplateModalOpen}
        editingTemplate={editingTemplate}
        onSave={handleSaveTemplate}
        saving={savingTemplate}
        defaultSenderEmail={configForm.from_email}
        defaultSenderName={configForm.from_name}
        onSendTest={async (toEmail, subject, html) => {
          const res = await fetch('/api/email/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: toEmail,
              from: `${configForm.from_name} <${configForm.from_email}>`,
              reply_to: configForm.reply_to_email,
              subject,
              html,
            }),
          });
          return res.ok;
        }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: EmailLog['status'] }) {
  switch (status) {
    case 'delivered':
      return (
        <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-xs">
          Entregado
        </Badge>
      );
    case 'opened':
      return (
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs flex items-center gap-1">
          <Eye className="h-3 w-3" /> Abierto
        </Badge>
      );
    case 'clicked':
      return (
        <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-400 text-xs flex items-center gap-1">
          <MousePointerClick className="h-3 w-3" /> Clic
        </Badge>
      );
    case 'bounced':
      return (
        <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs">
          Rebotado
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-400 text-xs">
          Fallido
        </Badge>
      );
    case 'sent':
    default:
      return (
        <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs">
          Enviado
        </Badge>
      );
  }
}
