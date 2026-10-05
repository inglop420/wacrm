'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  Sparkles,
  Monitor,
  Smartphone,
  Send,
  Plus,
  Trash2,
  Copy,
  Code,
  Layers,
  ChevronDown,
  Info,
  CheckCircle2,
  Eye,
  Sliders,
  Palette,
  ExternalLink,
  Tag,
} from 'lucide-react';
import type { EmailTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  LEGMA_PRESETS,
  GRADIENTS,
  CALLOUT_THEMES,
  generateLegmaHtml,
  parseLegmaHtml,
  interpolateSampleData,
  type LegmaTemplateData,
  type GradientTheme,
  type CalloutTheme,
} from './corporate-templates';

interface EmailTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTemplate: EmailTemplate | null;
  onSave: (templateData: { name: string; subject: string; body_html: string }) => Promise<void>;
  saving: boolean;
  defaultSenderEmail?: string;
  defaultSenderName?: string;
  onSendTest?: (toEmail: string, subject: string, html: string) => Promise<boolean>;
}

const DYNAMIC_VARIABLES = [
  { label: 'Nombre contacto', tag: '{{contact.name}}', example: 'Lic. Luis Alonso Ruvalcaba' },
  { label: 'Empresa', tag: '{{contact.company}}', example: 'Corporativo Jurídico Legma S.C.' },
  { label: 'Correo', tag: '{{contact.email}}', example: 'alonsoruvalcaba2014@gmail.com' },
  { label: 'Teléfono', tag: '{{contact.phone}}', example: '+52 55 1234 5678' },
  { label: 'Título del Trato', tag: '{{deal.title}}', example: 'Licenciamiento Anual IA' },
  { label: 'Monto del Trato', tag: '{{deal.value}}', example: '$28,500 MXN' },
  { label: 'Etapa del Pipeline', tag: '{{deal.stage}}', example: 'Propuesta Comercial' },
];

export function EmailTemplateDialog({
  open,
  onOpenChange,
  editingTemplate,
  onSave,
  saving,
  defaultSenderEmail = 'notificaciones@crm.legma.com.mx',
  defaultSenderName = 'Ventas LEGMA',
  onSendTest,
}: EmailTemplateDialogProps) {
  // Mode: Visual Assistant vs Direct HTML
  const [editorTab, setEditorTab] = useState<'visual' | 'code'>('visual');

  // Preview options
  const [devicePreview, setDevicePreview] = useState<'desktop' | 'mobile'>('desktop');
  const [useSampleData, setUseSampleData] = useState(true);

  // Quick test send state
  const [testEmail, setTestEmail] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);

  // Focus ref tracking for variable insertion
  const activeInputRef = useRef<{ id: string; field: string } | null>(null);

  // Visual structured builder state
  const [builderData, setBuilderData] = useState<LegmaTemplateData>(LEGMA_PRESETS[0].data);

  // Raw HTML state (used in 'code' tab)
  const [rawHtml, setRawHtml] = useState<string>('');

  // Selected Preset ID
  const [selectedPresetId, setSelectedPresetId] = useState<string>('legma-bienvenida');

  // Initialize or reset when opening modal or changing editingTemplate
  useEffect(() => {
    if (!open) return;

    if (editingTemplate) {
      // Try to parse existing embedded Legma builder data
      const parsed = parseLegmaHtml(editingTemplate.body_html);
      if (parsed) {
        setBuilderData(parsed);
        setRawHtml(editingTemplate.body_html);
        setEditorTab('visual');
        if (parsed.presetId) setSelectedPresetId(parsed.presetId);
      } else {
        // Was created outside or without metadata -> Open in code editor
        setRawHtml(editingTemplate.body_html);
        setBuilderData({
          ...LEGMA_PRESETS[0].data,
          name: editingTemplate.name,
          subject: editingTemplate.subject,
        });
        setEditorTab('code');
      }
    } else {
      // New template: load default corporate bienvenida
      const defaultPreset = LEGMA_PRESETS[0];
      setBuilderData({ ...defaultPreset.data });
      setRawHtml(generateLegmaHtml(defaultPreset.data));
      setSelectedPresetId('legma-bienvenida');
      setEditorTab('visual');
    }
  }, [open, editingTemplate]);

  // Keep rawHtml synced when visual builderData changes
  useEffect(() => {
    if (editorTab === 'visual') {
      const generated = generateLegmaHtml(builderData);
      setRawHtml(generated);
    }
  }, [builderData, editorTab]);

  // Handle Preset selection
  function handleSelectPreset(presetId: string) {
    const preset = LEGMA_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSelectedPresetId(presetId);
    setBuilderData({
      ...preset.data,
      name: builderData.name ? builderData.name : preset.data.name,
    });
    setRawHtml(generateLegmaHtml(preset.data));
    toast.success(`Modelo "${preset.name}" cargado`);
  }

  // Active compiled HTML for preview
  const currentPreviewHtml = useMemo(() => {
    const base = editorTab === 'visual' ? generateLegmaHtml(builderData) : rawHtml;
    return useSampleData ? interpolateSampleData(base) : base;
  }, [editorTab, builderData, rawHtml, useSampleData]);

  // Insert variable into active field
  function handleInsertVariable(tag: string) {
    if (editorTab === 'code') {
      setRawHtml((prev) => prev + ` ${tag}`);
      toast.info(`Variable ${tag} insertada en el código`);
      return;
    }

    // Visual builder smart insertion
    if (activeInputRef.current?.field === 'subject') {
      setBuilderData((prev) => ({ ...prev, subject: prev.subject + ` ${tag}` }));
      toast.info(`Variable ${tag} añadida al Asunto`);
    } else if (activeInputRef.current?.field === 'greeting') {
      setBuilderData((prev) => ({ ...prev, greeting: prev.greeting + ` ${tag}` }));
      toast.info(`Variable ${tag} añadida al Saludo`);
    } else if (activeInputRef.current?.field === 'intro') {
      setBuilderData((prev) => ({ ...prev, introParagraph: prev.introParagraph + ` ${tag}` }));
      toast.info(`Variable ${tag} añadida al Mensaje`);
    } else {
      // Default to intro paragraph
      setBuilderData((prev) => ({ ...prev, introParagraph: prev.introParagraph + ` ${tag}` }));
      toast.info(`Variable ${tag} insertada`);
    }
  }

  // Add Callout Row
  function handleAddCalloutRow() {
    setBuilderData((prev) => ({
      ...prev,
      calloutRows: [...(prev.calloutRows || []), { label: 'Nuevo campo', value: 'Valor de ejemplo' }],
    }));
  }

  // Remove Callout Row
  function handleRemoveCalloutRow(index: number) {
    setBuilderData((prev) => ({
      ...prev,
      calloutRows: prev.calloutRows.filter((_, i) => i !== index),
    }));
  }

  // Update Callout Row
  function handleUpdateCalloutRow(index: number, label: string, value: string) {
    setBuilderData((prev) => {
      const next = [...prev.calloutRows];
      next[index] = { label, value };
      return { ...prev, calloutRows: next };
    });
  }

  // Add Feature item
  function handleAddFeature() {
    setBuilderData((prev) => ({
      ...prev,
      features: [
        ...(prev.features || []),
        { emoji: '✨', title: 'Nuevo beneficio', description: 'Describe brevemente la ventaja para el cliente.' },
      ],
    }));
  }

  // Remove Feature item
  function handleRemoveFeature(index: number) {
    setBuilderData((prev) => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index),
    }));
  }

  // Update Feature item
  function handleUpdateFeature(index: number, key: 'emoji' | 'title' | 'description', value: string) {
    setBuilderData((prev) => {
      const next = [...prev.features];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, features: next };
    });
  }

  // Save handler
  async function handleSubmit() {
    const name = builderData.name.trim();
    const subject = builderData.subject.trim();
    const finalHtml = editorTab === 'visual' ? generateLegmaHtml(builderData) : rawHtml;

    if (!name) {
      toast.error('Por favor escribe un nombre para identificar la plantilla');
      return;
    }
    if (!subject) {
      toast.error('Por favor ingresa el asunto del correo');
      return;
    }
    if (!finalHtml.trim()) {
      toast.error('El contenido del correo no puede estar vacío');
      return;
    }

    await onSave({
      name,
      subject,
      body_html: finalHtml,
    });
  }

  // Send Test Email from within the dialog
  async function handleSendTestEmail() {
    if (!testEmail || !testEmail.includes('@')) {
      toast.error('Ingresa un correo electrónico de destino válido');
      return;
    }

    setIsSendingTest(true);
    try {
      const finalHtml = currentPreviewHtml;
      if (onSendTest) {
        const ok = await onSendTest(testEmail, `[PRUEBA] ${builderData.subject}`, finalHtml);
        if (ok) {
          toast.success(`Correo de prueba enviado a ${testEmail}`);
        }
      } else {
        const res = await fetch('/api/email/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: testEmail,
            from: `${defaultSenderName} <${defaultSenderEmail}>`,
            subject: `[PRUEBA] ${builderData.subject}`,
            html: finalHtml,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          toast.success(`¡Prueba enviada a ${testEmail}! Revisa tu bandeja.`);
        } else {
          toast.error(data.error || 'Error al enviar prueba');
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Fallo de red al enviar prueba');
    } finally {
      setIsSendingTest(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1340px] w-[96vw] h-[92vh] max-h-[92vh] p-0 flex flex-col gap-0 overflow-hidden bg-background border-border/80 shadow-2xl">
        {/* ==================================================== */}
        {/* TOP BAR / HEADER                                     */}
        {/* ==================================================== */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-600 to-purple-600 text-white shadow-sm">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                {editingTemplate ? 'Editar Plantilla Corporativa' : 'Creador de Plantillas de Correo'}
                <Badge variant="outline" className="border-blue-500/30 text-blue-500 bg-blue-500/10 text-[11px] font-normal">
                  Estándar LEGMA
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Diseño corporativo homologado y compatible con Gmail, Outlook y dispositivos móviles.
              </DialogDescription>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Preset Selector */}
            <div className="flex items-center gap-1.5">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Modelo Base:</Label>
              <Select
                value={selectedPresetId}
                onValueChange={(val) => {
                  if (val) handleSelectPreset(val);
                }}
              >
                <SelectTrigger className="h-8 w-[210px] text-xs">
                  <SelectValue placeholder="Elegir modelo corporativo" />
                </SelectTrigger>
                <SelectContent>
                  {LEGMA_PRESETS.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{p.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Device preview toggle */}
            <div className="flex items-center rounded-lg border bg-background p-0.5 text-xs shadow-sm">
              <Button
                type="button"
                variant={devicePreview === 'desktop' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2.5 gap-1.5 text-xs"
                onClick={() => setDevicePreview('desktop')}
              >
                <Monitor className="h-3.5 w-3.5" />
                Escritorio
              </Button>
              <Button
                type="button"
                variant={devicePreview === 'mobile' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2.5 gap-1.5 text-xs"
                onClick={() => setDevicePreview('mobile')}
              >
                <Smartphone className="h-3.5 w-3.5" />
                Móvil
              </Button>
            </div>
          </div>
        </div>

        {/* ==================================================== */}
        {/* VARIABLE CHIPS BAR (ALWAY VISIBLE)                   */}
        {/* ==================================================== */}
        <div className="flex items-center gap-2 border-b bg-muted/40 px-5 py-2 overflow-x-auto text-xs">
          <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
            <Tag className="h-3 w-3 text-primary" /> Variables dinámicas:
          </span>
          <div className="flex items-center gap-1.5 flex-nowrap">
            {DYNAMIC_VARIABLES.map((v) => (
              <button
                key={v.tag}
                type="button"
                onClick={() => handleInsertVariable(v.tag)}
                title={`Inserta ${v.tag} (Ejemplo: ${v.example})`}
                className="inline-flex items-center rounded-md border border-border/80 bg-background/90 px-2 py-0.5 text-[11px] font-mono text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all whitespace-nowrap shadow-2xs"
              >
                + {v.tag}
              </button>
            ))}
          </div>
        </div>

        {/* ==================================================== */}
        {/* MAIN BODY: 2 COLUMNS                                 */}
        {/* ==================================================== */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 min-h-0 overflow-hidden divide-y lg:divide-y-0 lg:divide-x">
          {/* ================================================== */}
          {/* LEFT COLUMN: CONTROLS & FORM (5/12)                */}
          {/* ================================================== */}
          <div className="lg:col-span-6 flex flex-col h-full overflow-hidden bg-background">
            <div className="border-b px-4 py-2 bg-muted/10 flex items-center justify-between">
              <Tabs
                value={editorTab}
                onValueChange={(v) => setEditorTab(v as 'visual' | 'code')}
                className="w-full"
              >
                <div className="flex items-center justify-between">
                  <TabsList className="grid w-[280px] grid-cols-2 h-8">
                    <TabsTrigger value="visual" className="text-xs gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                      Diseñador Visual
                    </TabsTrigger>
                    <TabsTrigger value="code" className="text-xs gap-1.5">
                      <Code className="h-3.5 w-3.5" />
                      Código HTML
                    </TabsTrigger>
                  </TabsList>

                  <span className="text-[11px] text-muted-foreground hidden sm:inline">
                    {editorTab === 'visual' ? 'Modo guiado corporativo' : 'HTML nativo con CSS'}
                  </span>
                </div>
              </Tabs>
            </div>

            {/* Scrollable Form Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {editorTab === 'visual' ? (
                <>
                  {/* SECCIÓN 1: IDENTIFICACIÓN BÁSICA */}
                  <div className="space-y-3.5 rounded-xl border p-4 bg-muted/10">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5 text-primary" /> 1. Identificación y Asunto
                    </h3>
                    <div className="grid gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="b_name" className="text-xs font-semibold">
                          Nombre interno de la plantilla
                        </Label>
                        <Input
                          id="b_name"
                          placeholder="Ej. Seguimiento Cotización Enviada"
                          value={builderData.name}
                          onChange={(e) => setBuilderData({ ...builderData, name: e.target.value })}
                          className="h-8 text-xs"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Visible solo dentro del CRM y automatizaciones.
                        </p>
                      </div>

                      <div className="space-y-1">
                        <Label htmlFor="b_subject" className="text-xs font-semibold">
                          Asunto del correo
                        </Label>
                        <Input
                          id="b_subject"
                          placeholder="Ej. Propuesta comercial especial para {{contact.company}}"
                          value={builderData.subject}
                          onFocus={() => {
                            activeInputRef.current = { id: 'b_subject', field: 'subject' };
                          }}
                          onChange={(e) => setBuilderData({ ...builderData, subject: e.target.value })}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN 2: CABECERA & GRADIENTE */}
                  <div className="space-y-3.5 rounded-xl border p-4 bg-muted/10">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Palette className="h-3.5 w-3.5 text-primary" /> 2. Cabecera e Imagen Corporativa
                    </h3>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="b_hTitle" className="text-xs font-semibold">
                          Título de cabecera
                        </Label>
                        <Input
                          id="b_hTitle"
                          placeholder="LEGMA"
                          value={builderData.headerTitle}
                          onChange={(e) => setBuilderData({ ...builderData, headerTitle: e.target.value })}
                          className="h-8 text-xs font-bold"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="b_hSubtitle" className="text-xs font-semibold">
                          Subtítulo o Lema
                        </Label>
                        <Input
                          id="b_hSubtitle"
                          placeholder="Legal Manager Asistente"
                          value={builderData.headerSubtitle}
                          onChange={(e) => setBuilderData({ ...builderData, headerSubtitle: e.target.value })}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <Label className="text-xs font-semibold">Color / Gradiente de Marca:</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {(Object.keys(GRADIENTS) as GradientTheme[]).map((gKey) => {
                          const g = GRADIENTS[gKey];
                          const isSelected = builderData.gradient === gKey;
                          return (
                            <button
                              key={gKey}
                              type="button"
                              onClick={() => setBuilderData({ ...builderData, gradient: gKey })}
                              className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition-all ${
                                isSelected
                                  ? 'border-primary ring-2 ring-primary/20 bg-background font-semibold shadow-xs'
                                  : 'border-border/70 bg-background/50 hover:border-border text-muted-foreground'
                              }`}
                            >
                              <span
                                className="h-4 w-4 rounded-full shrink-0 shadow-xs"
                                style={{ background: g.css }}
                              />
                              <span className="truncate">{g.label.split(' ')[0]}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* SECCIÓN 3: MENSAJE & SALUDO */}
                  <div className="space-y-3.5 rounded-xl border p-4 bg-muted/10">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-primary" /> 3. Saludo y Mensaje Principal
                    </h3>

                    <div className="space-y-1">
                      <Label htmlFor="b_greeting" className="text-xs font-semibold">
                        Saludo principal (Titular)
                      </Label>
                      <Input
                        id="b_greeting"
                        placeholder="Ej. ¡Bienvenido, {{contact.name}}! 👋"
                        value={builderData.greeting}
                        onFocus={() => {
                          activeInputRef.current = { id: 'b_greeting', field: 'greeting' };
                        }}
                        onChange={(e) => setBuilderData({ ...builderData, greeting: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="b_intro" className="text-xs font-semibold">
                          Párrafo de introducción (Acepta HTML básico y negritas)
                        </Label>
                      </div>
                      <Textarea
                        id="b_intro"
                        rows={3}
                        placeholder="Nos alegra mucho saludarte. Hemos preparado esta propuesta para {{contact.company}}..."
                        value={builderData.introParagraph}
                        onFocus={() => {
                          activeInputRef.current = { id: 'b_intro', field: 'intro' };
                        }}
                        onChange={(e) => setBuilderData({ ...builderData, introParagraph: e.target.value })}
                        className="text-xs leading-relaxed"
                      />
                    </div>
                  </div>

                  {/* SECCIÓN 4: TARJETA DESTACADA / CALLOUT BOX */}
                  <div className="space-y-3.5 rounded-xl border p-4 bg-muted/10">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Sliders className="h-3.5 w-3.5 text-primary" /> 4. Tarjeta Destacada (Callout Box)
                      </h3>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="has_callout" className="text-xs text-muted-foreground cursor-pointer">
                          {builderData.hasCallout ? 'Activada' : 'Desactivada'}
                        </Label>
                        <Switch
                          id="has_callout"
                          checked={builderData.hasCallout}
                          onCheckedChange={(c) => setBuilderData({ ...builderData, hasCallout: c })}
                        />
                      </div>
                    </div>

                    {builderData.hasCallout && (
                      <div className="space-y-3 pt-2 border-t">
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold">Estilo de color:</Label>
                            <Select
                              value={builderData.calloutTheme}
                              onValueChange={(v) => {
                                if (v) setBuilderData({ ...builderData, calloutTheme: v as CalloutTheme });
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(Object.keys(CALLOUT_THEMES) as CalloutTheme[]).map((cKey) => (
                                  <SelectItem key={cKey} value={cKey} className="text-xs">
                                    {CALLOUT_THEMES[cKey].label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-semibold">Título de la caja:</Label>
                            <Input
                              placeholder="Ej. 🔑 Tus Credenciales de Acceso"
                              value={builderData.calloutTitle}
                              onChange={(e) => setBuilderData({ ...builderData, calloutTitle: e.target.value })}
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>

                        {/* Rows */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold">Filas de datos:</Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[11px] gap-1 text-primary"
                              onClick={handleAddCalloutRow}
                            >
                              <Plus className="h-3 w-3" /> Añadir fila
                            </Button>
                          </div>
                          {(builderData.calloutRows || []).map((row, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <Input
                                placeholder="Etiqueta (ej. Email)"
                                value={row.label}
                                onChange={(e) => handleUpdateCalloutRow(i, e.target.value, row.value)}
                                className="h-7 text-xs w-1/3"
                              />
                              <Input
                                placeholder="Valor (ej. {{contact.email}})"
                                value={row.value}
                                onChange={(e) => handleUpdateCalloutRow(i, row.label, e.target.value)}
                                className="h-7 text-xs flex-1"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => handleRemoveCalloutRow(i)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>

                        {/* Highlight block (Password / Deal Value) */}
                        <div className="grid grid-cols-2 gap-3 pt-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Etiqueta destacada (Opcional):</Label>
                            <Input
                              placeholder="Ej. Contraseña temporal:"
                              value={builderData.calloutHighlightLabel || ''}
                              onChange={(e) =>
                                setBuilderData({ ...builderData, calloutHighlightLabel: e.target.value })
                              }
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Valor en caja destacada:</Label>
                            <Input
                              placeholder="Ej. {{password_temporal}} o $25,000 MXN"
                              value={builderData.calloutHighlightValue || ''}
                              onChange={(e) =>
                                setBuilderData({ ...builderData, calloutHighlightValue: e.target.value })
                              }
                              className="h-8 text-xs font-mono font-bold"
                            />
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Nota o aviso al pie de la caja:</Label>
                          <Input
                            placeholder="Ej. ⚠️ Te recomendamos cambiar esta contraseña..."
                            value={builderData.calloutFooterNote || ''}
                            onChange={(e) => setBuilderData({ ...builderData, calloutFooterNote: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SECCIÓN 5: BENEFICIOS / CARACTERÍSTICAS */}
                  <div className="space-y-3.5 rounded-xl border p-4 bg-muted/10">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> 5. Puntos Clave / Beneficios
                      </h3>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="has_feat" className="text-xs text-muted-foreground cursor-pointer">
                          {builderData.hasFeatures ? 'Activada' : 'Desactivada'}
                        </Label>
                        <Switch
                          id="has_feat"
                          checked={builderData.hasFeatures}
                          onCheckedChange={(c) => setBuilderData({ ...builderData, hasFeatures: c })}
                        />
                      </div>
                    </div>

                    {builderData.hasFeatures && (
                      <div className="space-y-3 pt-2 border-t">
                        <div className="space-y-1">
                          <Label className="text-xs">Título de la sección:</Label>
                          <Input
                            placeholder="Ej. Con LEGMA podrás:"
                            value={builderData.featuresTitle || ''}
                            onChange={(e) => setBuilderData({ ...builderData, featuresTitle: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold">Elementos de la lista:</Label>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 text-[11px] gap-1 text-primary"
                              onClick={handleAddFeature}
                            >
                              <Plus className="h-3 w-3" /> Añadir punto
                            </Button>
                          </div>
                          {(builderData.features || []).map((f, i) => (
                            <div key={i} className="flex items-start gap-2 p-2 rounded border bg-background/60">
                              <Input
                                placeholder="⚖️"
                                value={f.emoji}
                                onChange={(e) => handleUpdateFeature(i, 'emoji', e.target.value)}
                                className="h-7 w-12 text-center text-sm p-1"
                              />
                              <div className="flex-1 space-y-1">
                                <Input
                                  placeholder="Título (ej. Boletín Judicial)"
                                  value={f.title}
                                  onChange={(e) => handleUpdateFeature(i, 'title', e.target.value)}
                                  className="h-7 text-xs font-semibold"
                                />
                                <Input
                                  placeholder="Descripción breve..."
                                  value={f.description}
                                  onChange={(e) => handleUpdateFeature(i, 'description', e.target.value)}
                                  className="h-7 text-xs text-muted-foreground"
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => handleRemoveFeature(i)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SECCIÓN 6: BOTÓN DE ACCIÓN (CTA) */}
                  <div className="space-y-3.5 rounded-xl border p-4 bg-muted/10">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <ExternalLink className="h-3.5 w-3.5 text-primary" /> 6. Botón de Llamado a la Acción (CTA)
                      </h3>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="has_cta" className="text-xs text-muted-foreground cursor-pointer">
                          {builderData.hasCta ? 'Activado' : 'Desactivado'}
                        </Label>
                        <Switch
                          id="has_cta"
                          checked={builderData.hasCta}
                          onCheckedChange={(c) => setBuilderData({ ...builderData, hasCta: c })}
                        />
                      </div>
                    </div>

                    {builderData.hasCta && (
                      <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">Texto del Botón:</Label>
                          <Input
                            placeholder="Ej. Iniciar Sesión en LEGMA"
                            value={builderData.ctaText}
                            onChange={(e) => setBuilderData({ ...builderData, ctaText: e.target.value })}
                            className="h-8 text-xs font-semibold"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs font-semibold">URL de Destino:</Label>
                          <Input
                            placeholder="https://crm.legma.com.mx..."
                            value={builderData.ctaUrl}
                            onChange={(e) => setBuilderData({ ...builderData, ctaUrl: e.target.value })}
                            className="h-8 text-xs font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* SECCIÓN 7: CIERRE Y PIE */}
                  <div className="space-y-3.5 rounded-xl border p-4 bg-muted/10">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Info className="h-3.5 w-3.5 text-primary" /> 7. Despedida y Pie Institucional
                    </h3>

                    <div className="space-y-1">
                      <Label className="text-xs">Nota de cierre / soporte:</Label>
                      <Input
                        placeholder="Si tienes alguna pregunta, no dudes en contactarnos..."
                        value={builderData.closingNote}
                        onChange={(e) => setBuilderData({ ...builderData, closingNote: e.target.value })}
                        className="h-8 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Copyright y Leyenda Legal:</Label>
                      <Input
                        value={builderData.footerCopyright}
                        onChange={(e) => setBuilderData({ ...builderData, footerCopyright: e.target.value })}
                        className="h-8 text-xs text-muted-foreground"
                      />
                    </div>
                  </div>
                </>
              ) : (
                /* TAB CÓDIGO HTML DIRECTO */
                <div className="space-y-3 h-full flex flex-col">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-xs font-bold">Editor de Código HTML Completo</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Pega o ajusta cualquier HTML. Los cambios se reflejarán instantáneamente en la vista previa.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => {
                        navigator.clipboard.writeText(rawHtml);
                        toast.success('Código HTML copiado al portapapeles');
                      }}
                    >
                      <Copy className="h-3 w-3" /> Copiar Código
                    </Button>
                  </div>
                  <Textarea
                    rows={22}
                    className="font-mono text-xs leading-relaxed resize-none flex-1 min-h-[460px] bg-muted/30"
                    placeholder="<!DOCTYPE html><html>...</html>"
                    value={rawHtml}
                    onChange={(e) => setRawHtml(e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* ================================================== */}
          {/* RIGHT COLUMN: LIVE REAL-TIME PREVIEW (6/12)       */}
          {/* ================================================== */}
          <div className="lg:col-span-6 flex flex-col h-full overflow-hidden bg-slate-100 dark:bg-slate-950">
            {/* Preview Toolbar */}
            <div className="border-b px-4 py-2.5 bg-background/80 backdrop-blur flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-medium text-foreground">Vista Previa en Vivo</span>
                <span className="text-[11px] text-muted-foreground hidden sm:inline">
                  ({devicePreview === 'desktop' ? 'Ancho 600px' : 'Móvil 375px'})
                </span>
              </div>

              {/* Sample data toggle */}
              <div className="flex items-center gap-2">
                <Label htmlFor="sample_toggle" className="text-xs text-muted-foreground cursor-pointer">
                  Datos de ejemplo
                </Label>
                <Switch
                  id="sample_toggle"
                  checked={useSampleData}
                  onCheckedChange={setUseSampleData}
                />
              </div>
            </div>

            {/* Quick Test Send Strip */}
            <div className="border-b bg-muted/30 px-4 py-2 flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground whitespace-nowrap text-[11px]">
                🚀 Probar envío real:
              </span>
              <div className="flex items-center gap-1.5 flex-1 max-w-sm">
                <Input
                  placeholder="tu-correo@legma.com.mx"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  className="h-7 text-xs bg-background"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 text-xs gap-1 whitespace-nowrap"
                  disabled={isSendingTest}
                  onClick={handleSendTestEmail}
                >
                  <Send className="h-3 w-3" />
                  {isSendingTest ? 'Enviando...' : 'Enviar'}
                </Button>
              </div>
            </div>

            {/* Iframe Preview Container */}
            <div className="flex-1 overflow-y-auto p-4 flex justify-center items-start">
              {devicePreview === 'desktop' ? (
                /* Desktop Window Frame */
                <div className="w-full max-w-[620px] rounded-xl border bg-white dark:bg-slate-900 shadow-xl overflow-hidden transition-all">
                  {/* Fake client header */}
                  <div className="bg-slate-100 dark:bg-slate-800 border-b px-4 py-2 flex items-center gap-2">
                    <div className="flex gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-400 inline-block" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400 inline-block" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 inline-block" />
                    </div>
                    <div className="flex-1 text-center font-mono text-[11px] text-muted-foreground truncate">
                      Asunto: {useSampleData ? interpolateSampleData(builderData.subject) : builderData.subject}
                    </div>
                  </div>

                  {/* Sandboxed Iframe */}
                  <iframe
                    title="Live Preview Desktop"
                    srcDoc={currentPreviewHtml}
                    className="w-full h-[620px] border-none bg-[#f5f7fa]"
                    sandbox="allow-same-origin"
                  />
                </div>
              ) : (
                /* Smartphone Mockup Frame */
                <div className="w-[375px] rounded-[36px] border-[8px] border-slate-800 bg-slate-800 shadow-2xl overflow-hidden transition-all my-2">
                  {/* Phone Notch */}
                  <div className="bg-slate-800 pt-2 pb-1 flex justify-center items-center">
                    <div className="h-4 w-28 bg-slate-900 rounded-full" />
                  </div>

                  {/* Sandboxed Iframe for Mobile */}
                  <iframe
                    title="Live Preview Mobile"
                    srcDoc={currentPreviewHtml}
                    className="w-full h-[580px] border-none bg-[#f5f7fa]"
                    sandbox="allow-same-origin"
                  />

                  {/* Bottom indicator */}
                  <div className="bg-slate-800 py-1.5 flex justify-center">
                    <div className="h-1 w-24 bg-slate-600 rounded-full" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ==================================================== */}
        {/* MODAL FOOTER                                         */}
        {/* ==================================================== */}
        <div className="border-t px-6 py-3 bg-muted/20 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span>Plantilla compatible con clientes modernos, modo oscuro y dispositivos móviles.</span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              className="gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-md"
              disabled={saving}
              onClick={handleSubmit}
            >
              {saving ? 'Guardando...' : editingTemplate ? 'Actualizar Plantilla' : 'Guardar Plantilla'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
