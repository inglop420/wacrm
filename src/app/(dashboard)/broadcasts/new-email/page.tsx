'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toast } from 'sonner';
import {
  Mail,
  Users,
  CheckCircle2,
  AlertCircle,
  Eye,
  Send,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Tag as TagIcon,
  GitBranch,
  ShieldCheck,
  Check,
  Building2,
  User,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Contact, EmailTemplate, Tag, Pipeline, Stage } from '@/types';
import { interpolateEmailTemplate } from '@/lib/email/resend';

const STEPS = [
  { id: 'template', label: '1. Plantilla' },
  { id: 'audience', label: '2. Audiencia' },
  { id: 'review', label: '3. Previsualizar y Prueba' },
  { id: 'send', label: '4. Confirmar y Enviar' },
];

export default function NewEmailBroadcastPage() {
  const router = useRouter();
  const { accountId, user } = useAuth();
  const supabase = createClient();

  const [currentStep, setCurrentStep] = useState(0);

  // Step 1: Templates
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);

  // Step 2: Audience
  const [audienceType, setAudienceType] = useState<'all' | 'tags' | 'stage'>('all');
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [selectedStageId, setSelectedStageId] = useState<string>('');

  const [audienceContacts, setAudienceContacts] = useState<Contact[]>([]);
  const [omittedContactsCount, setOmittedContactsCount] = useState(0);
  const [calculatingAudience, setCalculatingAudience] = useState(false);

  // Step 3: Review & Customization
  const [campaignName, setCampaignName] = useState('');
  const [customSubject, setCustomSubject] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  // Step 4: Dispatch
  const [isSendingCampaign, setIsSendingCampaign] = useState(false);

  // Load templates & metadata
  useEffect(() => {
    if (!accountId) return;

    async function loadInitialData() {
      setLoadingTemplates(true);
      const [tmplRes, tagsRes, pipelinesRes, stagesRes] = await Promise.all([
        supabase
          .from('email_templates')
          .select('*')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false }),
        supabase.from('tags').select('*').order('name'),
        supabase.from('pipelines').select('*').eq('account_id', accountId),
        supabase.from('stages').select('*').order('order_index'),
      ]);

      if (tmplRes.data) {
        setTemplates(tmplRes.data as EmailTemplate[]);
        if (tmplRes.data.length > 0 && !selectedTemplate) {
          setSelectedTemplate(tmplRes.data[0] as EmailTemplate);
          setCustomSubject(tmplRes.data[0].subject);
        }
      }
      if (tagsRes.data) setTags(tagsRes.data as Tag[]);
      if (pipelinesRes.data) setPipelines(pipelinesRes.data as Pipeline[]);
      if (stagesRes.data) setStages(stagesRes.data as Stage[]);

      setLoadingTemplates(false);
    }

    loadInitialData();
  }, [accountId, supabase]);

  // Set default test email from logged-in user
  useEffect(() => {
    if (user?.email && !testEmail) {
      setTestEmail(user.email);
    }
  }, [user, testEmail]);

  // Calculate matching audience
  useEffect(() => {
    if (!accountId) return;

    let isMounted = true;
    async function calculateAudience() {
      setCalculatingAudience(true);
      try {
        let matchingContactIds: string[] = [];

        if (audienceType === 'tags' && selectedTagIds.length > 0) {
          const { data: ctData } = await supabase
            .from('contact_tags')
            .select('contact_id')
            .in('tag_id', selectedTagIds);

          matchingContactIds = Array.from(new Set((ctData || []).map((ct) => ct.contact_id)));
        } else if (audienceType === 'stage' && selectedStageId) {
          const { data: dealData } = await supabase
            .from('deals')
            .select('contact_id')
            .eq('stage_id', selectedStageId)
            .eq('account_id', accountId);

          matchingContactIds = Array.from(
            new Set((dealData || []).map((d) => d.contact_id).filter(Boolean) as string[]),
          );
        }

        let query = supabase.from('contacts').select('*').eq('account_id', accountId);

        if (audienceType === 'tags' || audienceType === 'stage') {
          if (matchingContactIds.length === 0) {
            if (isMounted) {
              setAudienceContacts([]);
              setOmittedContactsCount(0);
              setCalculatingAudience(false);
            }
            return;
          }
          query = query.in('id', matchingContactIds);
        }

        const { data: rawContacts } = await query;
        if (!isMounted) return;

        const allFound = (rawContacts as Contact[]) || [];
        const validWithEmail = allFound.filter(
          (c) => c.email && c.email.trim() !== '' && c.email.includes('@'),
        );
        const withoutEmail = allFound.length - validWithEmail.length;

        setAudienceContacts(validWithEmail);
        setOmittedContactsCount(withoutEmail);
      } catch (err) {
        console.error('Error calculating audience:', err);
      } finally {
        if (isMounted) setCalculatingAudience(false);
      }
    }

    calculateAudience();
    return () => {
      isMounted = false;
    };
  }, [accountId, audienceType, selectedTagIds, selectedStageId, supabase]);

  // Interpolated Preview (using first contact or fallback sample)
  const sampleContact = useMemo(() => {
    if (audienceContacts.length > 0) return audienceContacts[0];
    return {
      id: 'sample-1',
      name: 'Lic. Roberto Morales',
      company: 'Grupo Jurídico Legma',
      email: 'roberto@ejemplo.com',
      phone: '+52 33 1234 5678',
    } as Partial<Contact>;
  }, [audienceContacts]);

  const previewSubject = useMemo(() => {
    if (!selectedTemplate) return '';
    return interpolateEmailTemplate(customSubject || selectedTemplate.subject, {
      contact: sampleContact,
    });
  }, [selectedTemplate, customSubject, sampleContact]);

  const previewHtml = useMemo(() => {
    if (!selectedTemplate) return '';
    return interpolateEmailTemplate(selectedTemplate.body_html, {
      contact: sampleContact,
    });
  }, [selectedTemplate, sampleContact]);

  // Test email handler
  async function handleSendTest() {
    if (!testEmail || !testEmail.includes('@')) {
      toast.error('Ingresa un correo electrónico de prueba válido');
      return;
    }
    if (!selectedTemplate) return;

    setSendingTest(true);
    try {
      const res = await fetch('/api/email/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          testEmail: testEmail.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al enviar correo de prueba');
        return;
      }

      toast.success(`¡Correo de prueba enviado a ${testEmail}! Revisa tu bandeja.`);
    } catch {
      toast.error('Error al enviar correo de prueba');
    } finally {
      setSendingTest(false);
    }
  }

  // Full broadcast launch handler
  async function handleLaunchBroadcast() {
    if (!campaignName.trim()) {
      toast.error('Por favor escribe un nombre para la campaña');
      return;
    }
    if (!selectedTemplate) {
      toast.error('Selecciona una plantilla');
      return;
    }
    if (audienceContacts.length === 0) {
      toast.error('No hay contactos con correo válido en la audiencia seleccionada');
      return;
    }

    setIsSendingCampaign(true);
    try {
      const res = await fetch('/api/email/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campaignName.trim(),
          templateId: selectedTemplate.id,
          audience: {
            type: audienceType,
            tagIds: audienceType === 'tags' ? selectedTagIds : undefined,
            stageId: audienceType === 'stage' ? selectedStageId : undefined,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Error al lanzar campaña de correo');
        setIsSendingCampaign(false);
        return;
      }

      toast.success(
        `¡Campaña lanzada con éxito! Se enviaron ${data.sentCount || audienceContacts.length} correos.`,
      );
      router.push(`/broadcasts/${data.broadcastId}`);
    } catch {
      toast.error('Error al procesar el envío masivo');
      setIsSendingCampaign(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/broadcasts')}
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Difusiones
            </Button>
            <span className="text-muted-foreground">/</span>
            <Badge variant="outline" className="border-blue-500/30 text-blue-500 bg-blue-500/10">
              <Mail className="h-3 w-3 mr-1" /> Correo Electrónico
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mt-1">
            Nueva Difusión de Correo
          </h1>
          <p className="text-xs text-muted-foreground">
            Crea y dispara comunicaciones corporativas masivas mediante Resend.
          </p>
        </div>
      </div>

      {/* Steps bar */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto py-2">
        {STEPS.map((step, idx) => {
          const isActive = idx === currentStep;
          const isDone = idx < currentStep;
          return (
            <div key={step.id} className="flex items-center gap-2 shrink-0">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                  isDone
                    ? 'bg-primary text-primary-foreground'
                    : isActive
                      ? 'border-2 border-primary bg-primary/10 text-primary'
                      : 'border border-border bg-muted text-muted-foreground'
                }`}
              >
                {isDone ? <Check className="h-3.5 w-3.5" /> : idx + 1}
              </div>
              <span
                className={`text-xs font-medium ${
                  isActive ? 'text-foreground' : isDone ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </span>
              {idx < STEPS.length - 1 && <div className="h-px w-6 sm:w-12 bg-border mx-1" />}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="rounded-xl border bg-card p-5 shadow-xs">
        {/* STEP 1: CHOOSE TEMPLATE */}
        {currentStep === 0 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Elige una Plantilla de Correo</h2>
              <p className="text-xs text-muted-foreground">
                Selecciona la plantilla corporativa homologada que deseas enviar a tus contactos.
              </p>
            </div>

            {loadingTemplates ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : templates.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
                <Mail className="h-10 w-10 text-muted-foreground mb-2" />
                <h3 className="text-sm font-semibold text-foreground">No tienes plantillas creadas</h3>
                <p className="text-xs text-muted-foreground max-w-sm mt-1">
                  Crea tu primera plantilla corporativa con el diseño de LEGMA en la sección de configuración.
                </p>
                <Button
                  size="sm"
                  onClick={() => router.push('/settings?tab=email')}
                  className="mt-4 gap-1.5"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Ir a Plantillas de Correo
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.map((tmpl) => {
                  const isSelected = selectedTemplate?.id === tmpl.id;
                  return (
                    <div
                      key={tmpl.id}
                      onClick={() => {
                        setSelectedTemplate(tmpl);
                        setCustomSubject(tmpl.subject);
                        if (!campaignName) {
                          setCampaignName(tmpl.name);
                        }
                      }}
                      className={`cursor-pointer rounded-xl border p-4 transition-all relative ${
                        isSelected
                          ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                          : 'border-border/80 hover:border-primary/50 bg-background'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                            {tmpl.name}
                            {isSelected && (
                              <Badge className="bg-primary text-primary-foreground text-[10px] h-4 px-1.5">
                                Seleccionada
                              </Badge>
                            )}
                          </h4>
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            <span className="font-medium text-foreground/80">Asunto: </span>
                            {tmpl.subject}
                          </p>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/50">
                        <span className="flex items-center gap-1 text-emerald-500">
                          <Sparkles className="h-3 w-3" /> Plantilla Corporativa LEGMA
                        </span>
                        <span>{new Date(tmpl.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end pt-4 border-t">
              <Button
                disabled={!selectedTemplate}
                onClick={() => setCurrentStep(1)}
                className="gap-2"
              >
                Siguiente: Seleccionar Audiencia <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: SELECT AUDIENCE */}
        {currentStep === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Define la Audiencia</h2>
              <p className="text-xs text-muted-foreground">
                Filtra a qué contactos llegará esta campaña. El sistema omitirá automáticamente los contactos sin email.
              </p>
            </div>

            {/* Filter type radio selector */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div
                onClick={() => setAudienceType('all')}
                className={`cursor-pointer rounded-xl border p-3.5 transition-all text-left ${
                  audienceType === 'all'
                    ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Todos los contactos</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Enviar a toda la base de contactos de la cuenta.
                </p>
              </div>

              <div
                onClick={() => setAudienceType('tags')}
                className={`cursor-pointer rounded-xl border p-3.5 transition-all text-left ${
                  audienceType === 'tags'
                    ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <TagIcon className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Por Etiquetas</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Filtrar por intereses o segmentos específicos.
                </p>
              </div>

              <div
                onClick={() => setAudienceType('stage')}
                className={`cursor-pointer rounded-xl border p-3.5 transition-all text-left ${
                  audienceType === 'stage'
                    ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">Por Etapa de Pipeline</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Contactos con oportunidades en una fase del embudo.
                </p>
              </div>
            </div>

            {/* Tags sub-selector */}
            {audienceType === 'tags' && (
              <div className="p-4 rounded-xl border bg-muted/20 space-y-2">
                <Label className="text-xs font-semibold">Selecciona una o más etiquetas:</Label>
                {tags.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No hay etiquetas registradas.</p>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {tags.map((tag) => {
                      const isSelected = selectedTagIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => {
                            setSelectedTagIds((prev) =>
                              isSelected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id],
                            );
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            isSelected
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground border-border hover:border-foreground/40'
                          }`}
                        >
                          <TagIcon className="h-3 w-3" />
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Stage sub-selector */}
            {audienceType === 'stage' && (
              <div className="p-4 rounded-xl border bg-muted/20 space-y-3">
                <Label className="text-xs font-semibold">Selecciona la Etapa del Pipeline:</Label>
                <Select value={selectedStageId} onValueChange={setSelectedStageId}>
                  <SelectTrigger className="h-9 text-xs bg-background">
                    <SelectValue placeholder="Elige la etapa..." />
                  </SelectTrigger>
                  <SelectContent>
                    {stages.map((st) => (
                      <SelectItem key={st.id} value={st.id} className="text-xs">
                        {st.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Audience summary counters */}
            <div className="rounded-xl border p-4 bg-muted/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" /> Estimación de Destinatarios:
                </span>
                {calculatingAudience && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  <div>
                    <span className="text-lg font-bold text-foreground">
                      {audienceContacts.length}
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      Contactos con correo electrónico válido listos para envío.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
                  <div>
                    <span className="text-lg font-bold text-foreground">
                      {omittedContactsCount}
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      Contactos omitidos (sin correo registrado en su ficha).
                    </p>
                  </div>
                </div>
              </div>

              {/* Sample preview list */}
              {audienceContacts.length > 0 && (
                <div className="pt-2">
                  <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">
                    Muestra de destinatarios incluidos:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {audienceContacts.slice(0, 5).map((c) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-background border text-[11px] text-foreground"
                      >
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{c.name || 'Sin nombre'}</span>
                        <span className="text-muted-foreground">({c.email})</span>
                      </span>
                    ))}
                    {audienceContacts.length > 5 && (
                      <span className="text-[11px] text-muted-foreground self-center ml-1">
                        + {audienceContacts.length - 5} más...
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setCurrentStep(0)}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Atrás
              </Button>
              <Button
                disabled={audienceContacts.length === 0 || calculatingAudience}
                onClick={() => setCurrentStep(2)}
                className="gap-2"
              >
                Siguiente: Previsualizar y Prueba <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: REVIEW & TEST */}
        {currentStep === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Previsualización y Prueba</h2>
              <p className="text-xs text-muted-foreground">
                Comprueba cómo recibirán el correo tus contactos y envíate una prueba a tu bandeja.
              </p>
            </div>

            {/* Campaign name & subject */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="camp_name" className="text-xs font-semibold">
                  Nombre de la Campaña:
                </Label>
                <Input
                  id="camp_name"
                  placeholder="Ej. Invitación Webinar Inteligencia Legal"
                  value={campaignName}
                  onChange={(e) => setCampaignName(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="camp_subj" className="text-xs font-semibold">
                  Asunto del Correo:
                </Label>
                <Input
                  id="camp_subj"
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Live Interactive Iframe Preview */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-primary" /> Vista previa con datos de:{' '}
                  <span className="text-primary font-bold">{sampleContact.name}</span>
                </span>
                <Badge variant="outline" className="text-[10px] text-emerald-500 bg-emerald-500/10">
                  HTML Homologado LEGMA
                </Badge>
              </div>

              <div className="p-2.5 rounded-lg border bg-muted/40 text-xs">
                <span className="font-semibold text-muted-foreground">Asunto final: </span>
                <span className="text-foreground font-medium">{previewSubject}</span>
              </div>

              <div className="rounded-xl border bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                <iframe
                  title="Campaign preview"
                  srcDoc={previewHtml}
                  className="w-full h-[360px] border-none bg-[#f5f7fa]"
                  sandbox="allow-same-origin"
                />
              </div>
            </div>

            {/* Send Test Email Box */}
            <div className="p-4 rounded-xl border bg-gradient-to-r from-blue-500/5 to-purple-500/5 border-blue-500/20 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-semibold text-foreground">
                  Validación: Envía un correo de prueba a tu email
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Te recomendamos enviarte una prueba para comprobar cómo se renderizan las imágenes, botones y textos en tu cliente de correo antes del envío masivo.
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-2">
                <Input
                  type="email"
                  placeholder="tu@correo.com"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="h-8 text-xs bg-background max-w-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSendTest}
                  disabled={sendingTest || !testEmail}
                  className="h-8 text-xs gap-1.5 border-blue-500/30 text-blue-600 hover:bg-blue-500/10"
                >
                  {sendingTest ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" /> Enviando prueba...
                    </>
                  ) : (
                    <>
                      <Send className="h-3 w-3" /> Enviar prueba a mi correo
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setCurrentStep(1)}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Atrás
              </Button>
              <Button
                disabled={!campaignName.trim()}
                onClick={() => setCurrentStep(3)}
                className="gap-2"
              >
                Siguiente: Confirmar y Enviar <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* STEP 4: CONFIRM & DISPATCH */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-foreground">Confirmación de Envío</h2>
              <p className="text-xs text-muted-foreground">
                Revisa el resumen final de la campaña antes de iniciar el envío masivo.
              </p>
            </div>

            {/* Campaign Summary Card */}
            <div className="rounded-xl border divide-y bg-muted/20">
              <div className="p-3.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Nombre de la Campaña:</span>
                <span className="font-bold text-foreground">{campaignName}</span>
              </div>
              <div className="p-3.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Plantilla:</span>
                <span className="font-semibold text-foreground">{selectedTemplate?.name}</span>
              </div>
              <div className="p-3.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Remitente:</span>
                <span className="text-foreground">Ventas LEGMA &lt;notificaciones@crm.legma.com.mx&gt;</span>
              </div>
              <div className="p-3.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Total Destinatarios:</span>
                <Badge className="bg-emerald-600 text-white font-bold">
                  {audienceContacts.length} contactos
                </Badge>
              </div>
              <div className="p-3.5 flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Canal de Entrega:</span>
                <span className="text-blue-500 font-semibold flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> Resend API (crm.legma.com.mx)
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-xs text-amber-700 dark:text-amber-300">
              <p className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" /> Importante:
              </p>
              <p className="mt-1">
                Al presionar "Lanzar Campaña", los correos se enviarán inmediatamente en lotes concurrentes para asegurar una óptima tasa de entregabilidad y respetar las políticas de Resend. Podrás dar seguimiento a las aperturas y clics en tiempo real desde la sección de Difusiones.
              </p>
            </div>

            <div className="flex justify-between pt-4 border-t">
              <Button
                variant="outline"
                disabled={isSendingCampaign}
                onClick={() => setCurrentStep(2)}
              >
                <ArrowLeft className="h-4 w-4 mr-2" /> Atrás
              </Button>
              <Button
                size="lg"
                disabled={isSendingCampaign || audienceContacts.length === 0}
                onClick={handleLaunchBroadcast}
                className="gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold shadow-md"
              >
                {isSendingCampaign ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando Campaña Masiva...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Lanzar Campaña Masiva ({audienceContacts.length} correos)
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
