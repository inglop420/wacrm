'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Sparkles, Settings2, BarChart3, Briefcase, ShieldCheck } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { AiPlayground } from '@/components/agents/ai-playground';
import { AiUsageCard } from '@/components/agents/ai-usage';
import { AiConfig } from '@/components/settings/ai-config';
import { SpecializedAgentConfig } from '@/components/agents/specialized-agent-config';
import { useAuth } from '@/hooks/use-auth';
import { canEditSettings } from '@/lib/auth/roles';
import { cn } from '@/lib/utils';

type Tab = 'playground' | 'setup' | 'usage';

export default function AgentsPage() {
  const t = useTranslations('Agents');
  const { accountRole } = useAuth();
  const canViewUsage = accountRole ? canEditSettings(accountRole) : false;
  const [tab, setTab] = useState<Tab>('playground');
  const [decided, setDecided] = useState(false);
  const [selectedAgentSlug, setSelectedAgentSlug] = useState<'sales' | 'support'>('sales');
  const [supportAgentId, setSupportAgentId] = useState<string | null>(null);
  const [hasEmbeddingsKey, setHasEmbeddingsKey] = useState(false);

  // Land first-time users on Setup, returning users on the Playground.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [configRes, agentsRes] = await Promise.all([
          fetch('/api/ai/config'),
          fetch('/api/ai/agents'),
        ]);

        const configData = await configRes.json().catch(() => ({}));
        const agentsData = await agentsRes.json().catch(() => ({}));

        if (!cancelled) {
          setHasEmbeddingsKey(Boolean(configData?.has_embeddings_key));
          setTab(configData?.configured ? 'playground' : 'setup');

          const support = (agentsData?.customAgents ?? []).find(
            (a: { slug: string }) => a.slug === 'support',
          );
          if (support) {
            setSupportAgentId(support.id);
          }
        }
      } catch {
        if (!cancelled) setTab('setup');
      } finally {
        if (!cancelled) setDecided(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2">
        <Bot className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t('title')}
        </h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('description')}
      </p>

      {/* Multi-Agent Selector Pills */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSelectedAgentSlug('sales')}
          className={cn(
            'flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer',
            selectedAgentSlug === 'sales'
              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
              : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground',
          )}
        >
          <Briefcase className="h-3.5 w-3.5" />
          <span>Agente de Ventas (Principal)</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedAgentSlug('support')}
          className={cn(
            'flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer',
            selectedAgentSlug === 'support'
              ? 'bg-primary text-primary-foreground border-primary shadow-sm'
              : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground',
          )}
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Agente de Soporte Técnico</span>
        </button>
      </div>

      {decided && (
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          className="mt-6"
        >
          <TabsList>
            <TabsTrigger value="playground">
              <Sparkles className="mr-1.5 h-4 w-4" /> {t('tabPlayground')}
            </TabsTrigger>
            <TabsTrigger value="setup">
              <Settings2 className="mr-1.5 h-4 w-4" /> {t('tabSetup')}
            </TabsTrigger>
            {canViewUsage && (
              <TabsTrigger value="usage">
                <BarChart3 className="mr-1.5 h-4 w-4" /> {t('tabUsage')}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="playground" className="mt-4">
            <AiPlayground
              onGoToSetup={() => setTab('setup')}
              agentId={selectedAgentSlug === 'support' ? supportAgentId : null}
              agentName={selectedAgentSlug === 'support' ? 'Soporte Técnico' : 'Ventas'}
            />
          </TabsContent>

          <TabsContent value="setup" className="mt-4">
            {selectedAgentSlug === 'sales' ? (
              <AiConfig />
            ) : (
              <SpecializedAgentConfig
                slug="support"
                hasEmbeddingsKey={hasEmbeddingsKey}
              />
            )}
          </TabsContent>

          {canViewUsage && (
            <TabsContent value="usage" className="mt-4">
              <AiUsageCard />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}
