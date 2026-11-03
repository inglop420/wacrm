'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, ShieldCheck, Save, Users, Clock, Hash, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AiKnowledgeCard } from '@/components/settings/ai-knowledge';
import type { AccountMember } from '@/types';
import { fetchAccountMembers, memberLabel } from '@/lib/account/members';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';

const HANDOFF_QUEUE = '__queue__';

interface AgentData {
  id: string;
  slug: string;
  name: string;
  system_prompt: string | null;
  model: string | null;
  is_active: boolean;
  auto_reply_enabled: boolean;
  auto_reply_max_per_conversation: number;
  handoff_agent_id: string | null;
  trigger_phrases: string[];
  session_ttl_hours: number;
}

export function SpecializedAgentConfig({
  slug = 'support',
  hasEmbeddingsKey = false,
}: {
  slug?: string;
  hasEmbeddingsKey?: boolean;
}) {
  const { accountId, accountRole } = useAuth();
  const canEdit = accountRole ? canEditSettings(accountRole) : false;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agent, setAgent] = useState<AgentData | null>(null);

  // Form states
  const [name, setName] = useState('Soporte Técnico & VIP');
  const [systemPrompt, setSystemPrompt] = useState(
    'Eres el Agente de Soporte Técnico y Acompañamiento VIP de LEGMA. Tu objetivo es asistir a socios y abogados postulantes en el uso diario de la plataforma: consulta de acuerdos judiciales, boletines, expedientes, términos fatales y fallas técnicas. Si un problema requiere escalamiento o el usuario solicita atención humana, responde exactamente [[HANDOFF]]. Mantén un tono altamente empático, profesional, jurídico y resolutivo.',
  );
  const [model, setModel] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);
  const [maxPerConversation, setMaxPerConversation] = useState(4);
  const [handoffAgentId, setHandoffAgentId] = useState('');
  const [triggerPhrasesStr, setTriggerPhrasesStr] = useState('requiero soporte, ref: sop-legma, asistencia, soporte técnico');
  const [sessionTtlHours, setSessionTtlHours] = useState(24);
  const [members, setMembers] = useState<AccountMember[]>([]);

  const loadedAccountIdRef = useRef<string | null>(null);

  const fetchAgent = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/agents');
      const data = await res.json();
      if (!res.ok) {
        toast.error('No se pudo cargar la lista de agentes');
        return;
      }

      const found = (data.customAgents ?? []).find(
        (a: { slug: string }) => a.slug === slug,
      );

      if (found) {
        setAgent(found);
        setName(found.name);
        setSystemPrompt(found.systemPrompt ?? '');
        setModel(found.model ?? '');
        setIsActive(found.isActive ?? true);
        setAutoReplyEnabled(found.autoReplyEnabled ?? true);
        setMaxPerConversation(found.autoReplyMaxPerConversation ?? 4);
        setHandoffAgentId(found.handoffAgentId ?? '');
        setTriggerPhrasesStr((found.triggerPhrases ?? []).join(', '));
        setSessionTtlHours(found.sessionTtlHours ?? 24);
      }
    } catch {
      toast.error('Error al consultar configuración del agente');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (!accountId || loadedAccountIdRef.current === accountId) return;
    loadedAccountIdRef.current = accountId;
    void fetchAgent();
    void fetchAccountMembers().then(setMembers).catch(() => setMembers([]));
  }, [accountId, fetchAgent]);

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const phrases = triggerPhrasesStr
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean);

      const payload = {
        slug,
        name: name.trim() || 'Soporte Técnico',
        system_prompt: systemPrompt.trim() || null,
        model: model.trim() || null,
        is_active: isActive,
        auto_reply_enabled: autoReplyEnabled,
        auto_reply_max_per_conversation: maxPerConversation,
        handoff_agent_id: handoffAgentId || null,
        trigger_phrases: phrases,
        session_ttl_hours: sessionTtlHours,
      };

      const res = await fetch('/api/ai/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Error al guardar agente');
        return;
      }

      toast.success('Agente de Soporte guardado correctamente');
      await fetchAgent();
    } catch {
      toast.error('Error de conexión al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando agente...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-lg">Agente de Soporte Técnico & VIP</CardTitle>
                <CardDescription>
                  Atiende exclusivamente los reportes e incidencias originados desde el botón de soporte de LEGMA.
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="agent-active" className="text-xs text-muted-foreground">
                  {isActive ? 'Activo' : 'Pausado'}
                </Label>
                <Switch
                  id="agent-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  disabled={!canEdit || saving}
                />
              </div>
              {canEdit && (
                <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Guardar
                </Button>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="rounded-lg bg-muted/40 p-3.5 border flex items-start gap-2.5 text-xs text-muted-foreground">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-foreground">Credenciales compartidas:</span> Este agente utiliza
              el mismo proveedor de IA (OpenAI / Anthropic / OpenRouter) y la clave API configurada en el Agente de
              Ventas. No necesitas ingresar otra clave.
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="agent-name">Nombre del Agente</Label>
              <Input
                id="agent-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canEdit || saving}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="agent-model">Modelo (Opcional)</Label>
              <Input
                id="agent-model"
                placeholder="Heredar del Agente Principal"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={!canEdit || saving}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent-prompt">Instrucciones y Persona (System Prompt)</Label>
            <Textarea
              id="agent-prompt"
              rows={6}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Define el comportamiento, tono y cómo debe guiar al cliente..."
              disabled={!canEdit || saving}
              className="text-xs font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Para escalar con un operador humano, indícale al modelo emitir exactamente <code>[[HANDOFF]]</code>.
            </p>
          </div>

          <div className="border-t pt-4 space-y-4">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-muted-foreground" /> Reglas de Auto-respuesta y Sesión
            </h4>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">Responder automáticamente</Label>
                  <p className="text-[11px] text-muted-foreground">
                    El bot responde en cuanto llega un mensaje de soporte.
                  </p>
                </div>
                <div className="pt-2">
                  <Switch
                    checked={autoReplyEnabled}
                    onCheckedChange={setAutoReplyEnabled}
                    disabled={!canEdit || saving}
                  />
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-1.5">
                <Label htmlFor="agent-max-replies" className="text-xs font-medium">
                  Límite de respuestas por caso
                </Label>
                <Input
                  id="agent-max-replies"
                  type="number"
                  min={1}
                  max={20}
                  value={maxPerConversation}
                  onChange={(e) => setMaxPerConversation(Number(e.target.value))}
                  disabled={!canEdit || saving}
                />
                <p className="text-[11px] text-muted-foreground">
                  Máximo de turnos que el bot intentará resolver antes de pasar a humano.
                </p>
              </div>

              <div className="rounded-lg border p-3 space-y-1.5">
                <Label htmlFor="agent-ttl" className="text-xs font-medium">
                  Duración de la sesión (Horas)
                </Label>
                <Input
                  id="agent-ttl"
                  type="number"
                  min={1}
                  max={168}
                  value={sessionTtlHours}
                  onChange={(e) => setSessionTtlHours(Number(e.target.value))}
                  disabled={!canEdit || saving}
                />
                <p className="text-[11px] text-muted-foreground">
                  Tiempo que el chat permanece en modo soporte tras el último mensaje.
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 border-t pt-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                Transferir a operador humano de soporte
              </Label>
              <Select
                value={handoffAgentId || HANDOFF_QUEUE}
                onValueChange={(v) => setHandoffAgentId(v === HANDOFF_QUEUE ? '' : v)}
                disabled={!canEdit || saving}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Seleccionar miembro del equipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={HANDOFF_QUEUE}>
                    Cola compartida (sin asignar)
                  </SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {memberLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Cuando el bot hace handoff, el chat se reasigna a este especialista de soporte.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="trigger-phrases" className="text-xs font-medium flex items-center gap-1.5">
                <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                Frases disparadoras adicionales
              </Label>
              <Input
                id="trigger-phrases"
                value={triggerPhrasesStr}
                onChange={(e) => setTriggerPhrasesStr(e.target.value)}
                placeholder="requiero soporte, ref: sop-legma"
                disabled={!canEdit || saving}
              />
              <p className="text-[11px] text-muted-foreground">
                Separadas por coma. Además de los códigos generados (ej. <code>SOP-XXXXX</code>).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scoped Knowledge Base */}
      <AiKnowledgeCard
        accountId={accountId}
        canEdit={canEdit}
        hasEmbeddingsKey={hasEmbeddingsKey}
        agentId={agent?.id ?? null}
        agentName="Soporte Técnico"
      />
    </div>
  );
}

