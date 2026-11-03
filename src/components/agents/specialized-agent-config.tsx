'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
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

  // Form states matching AiConfig (Sales Agent mirror)
  const [name, setName] = useState('Soporte Técnico');
  const [systemPrompt, setSystemPrompt] = useState(
    'Eres el Agente de Soporte Técnico de LEGMA. Tu objetivo es asistir a socios y abogados postulantes en el uso diario de la plataforma: consulta de acuerdos judiciales, boletines, expedientes y fallas técnicas. Si un problema requiere escalamiento o el usuario solicita atención humana, responde exactamente [[HANDOFF]]. Mantén un tono formal, profesional, empático y resolutivo.',
  );
  const [model, setModel] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(true);
  const [maxPerConversation, setMaxPerConversation] = useState(4);
  const [handoffAgentId, setHandoffAgentId] = useState('');
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
        setName(found.name || 'Soporte Técnico');
        if (found.systemPrompt) setSystemPrompt(found.systemPrompt);
        setModel(found.model ?? '');
        setIsActive(found.isActive ?? true);
        setAutoReplyEnabled(found.autoReplyEnabled ?? true);
        setMaxPerConversation(found.autoReplyMaxPerConversation ?? 4);
        setHandoffAgentId(found.handoffAgentId ?? '');
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
      const payload = {
        slug,
        name: name.trim() || 'Soporte Técnico',
        system_prompt: systemPrompt.trim() || null,
        model: model.trim() || null,
        is_active: isActive,
        auto_reply_enabled: autoReplyEnabled,
        auto_reply_max_per_conversation: maxPerConversation,
        handoff_agent_id: handoffAgentId || null,
        trigger_phrases: [],
        session_ttl_hours: 24,
      };

      const res = await fetch('/api/ai/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Error al guardar configuración');
        return;
      }

      toast.success('Configuración guardada correctamente');
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

  const disabled = !canEdit || saving;

  return (
    <div className="space-y-6">
      <div className="space-y-6">
        {/* Card 1: Proveedor y modelo (Espejo de Ventas) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Proveedor y clave</CardTitle>
            <CardDescription>
              Este agente utiliza la clave de API y el proveedor configurados en la cuenta. Puedes heredar el modelo principal o especificar uno para soporte.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="support-model">Modelo</Label>
              <Input
                id="support-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Heredar modelo del Agente de Ventas"
                disabled={disabled}
              />
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-muted-foreground">Sugeridos:</span>
                {[
                  'meta-llama/llama-3.3-70b-instruct',
                  'openai/gpt-4o-mini',
                  'anthropic/claude-3.5-sonnet',
                  'deepseek/deepseek-chat',
                ].map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => setModel(sug)}
                    disabled={disabled}
                    className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    {sug.split('/')[1] || sug}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Comportamiento (Espejo exacto de Ventas) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comportamiento</CardTitle>
            <CardDescription>
              Cuéntale al asistente sobre tu soporte: instrucciones, alcance y qué resolver. Este contexto alimenta tanto los borradores como las respuestas automáticas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="support-prompt">Contexto del negocio e instrucciones</Label>
              <Textarea
                id="support-prompt"
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="Instrucciones para el Agente de Soporte..."
                rows={6}
                disabled={disabled}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Activar asistente de IA
                </p>
                <p className="text-xs text-muted-foreground">
                  Interruptor general. Activa el bot de soporte técnico en la bandeja de entrada.
                </p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={disabled}
              />
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Responder automáticamente a mensajes entrantes
                </p>
                <p className="text-xs text-muted-foreground">
                  El bot responde automáticamente cuando un cliente escribe desde el botón de soporte.
                </p>
              </div>
              <Switch
                checked={autoReplyEnabled}
                onCheckedChange={setAutoReplyEnabled}
                disabled={disabled || !isActive}
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="support-max">Máximo de respuestas automáticas por conversación</Label>
                <p className="text-xs text-muted-foreground">
                  Después de esta cantidad de respuestas del bot en un mismo reporte, el bot guarda silencio.
                </p>
              </div>
              <Input
                id="support-max"
                type="number"
                min={1}
                max={20}
                value={maxPerConversation}
                onChange={(e) =>
                  setMaxPerConversation(
                    Math.min(20, Math.max(1, Number(e.target.value) || 1)),
                  )
                }
                disabled={disabled || !autoReplyEnabled}
                className="w-20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="support-handoff">Derivar a</Label>
              <p className="text-xs text-muted-foreground">
                Cuando el bot no puede ayudar, o alcanza el límite de respuestas, se pausa y dirige el chat aquí, con una breve nota de lo que pasó.
              </p>
              <Select
                value={handoffAgentId || HANDOFF_QUEUE}
                onValueChange={(v) =>
                  setHandoffAgentId(v && v !== HANDOFF_QUEUE ? v : '')
                }
                disabled={disabled || !autoReplyEnabled}
              >
                <SelectTrigger id="support-handoff">
                  <SelectValue />
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
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Base de conocimiento exclusiva de Soporte */}
        <AiKnowledgeCard
          accountId={accountId}
          canEdit={canEdit}
          hasEmbeddingsKey={hasEmbeddingsKey}
          agentId={agent?.id || 'support'}
          agentName="Soporte Técnico"
        />

        {/* Botón Guardar al fondo (igual que en Ventas) */}
        <div className="flex items-center justify-end">
          <Button onClick={save} disabled={disabled}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar
          </Button>
        </div>
      </div>
    </div>
  );
}
