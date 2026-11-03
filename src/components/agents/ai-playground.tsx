'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Bot, RotateCcw, Send, Loader2, UserCircle2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  /** assistant-only: the agent signalled a human handoff on this turn. */
  handoff?: boolean;
}

export function AiPlayground({
  onGoToSetup,
  agentId,
  agentName,
}: {
  onGoToSetup?: () => void;
  agentId?: string | null;
  agentName?: string;
}) {
  const t = useTranslations('Agents.playground');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset conversation transcript when switching agents
    setTurns([]);
    setInput('');
  }, [agentId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const next: Turn[] = [...turns, { role: 'user', content: text }];
    setTurns(next);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/ai/playground', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map((t) => ({ role: t.role, content: t.content })),
          agent_id: agentId ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.code === 'ai_not_configured') {
          toast.error(t('notConfigured'));
        } else {
          toast.error(data.error ?? t('noReply'));
        }
        setTurns(turns);
        setInput(text);
        return;
      }
      setTurns([
        ...next,
        {
          role: 'assistant',
          content:
            typeof data.reply === 'string' && data.reply.trim()
              ? data.reply
              : '',
          handoff: Boolean(data.handoff),
        },
      ]);
    } catch {
      toast.error(t('unreachable'));
      setTurns(turns);
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const reset = () => {
    setTurns([]);
    setInput('');
  };

  return (
    <div className="flex flex-col h-[600px] rounded-lg border bg-background shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground">
            {t('chatTitle')} {agentName ? `(${agentName})` : ''}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {t('simulatedBadge')}
          </span>
        </div>
        {turns.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={sending}
            className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" /> {t('resetButton')}
          </Button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 text-sm"
      >
        {turns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground p-6">
            <Bot className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="font-medium text-foreground">{t('emptyTitle')}</p>
            <p className="mt-1 text-xs max-w-sm">
              {agentName
                ? `Escribe una pregunta para probar cómo responderá ${agentName}.`
                : t('emptyDescription')}
            </p>
            {onGoToSetup && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onGoToSetup}
                className="mt-4 gap-1.5 text-xs"
              >
                {t('configureButton')} <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        ) : (
          turns.map((turn, i) => (
            <div
              key={i}
              className={cn(
                'flex gap-2.5 max-w-[85%]',
                turn.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto',
              )}
            >
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 select-none items-center justify-center rounded-full text-xs font-semibold',
                  turn.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {turn.role === 'user' ? (
                  <UserCircle2 className="h-4 w-4" />
                ) : (
                  <Bot className="h-4 w-4" />
                )}
              </div>

              <div className="space-y-1">
                <div
                  className={cn(
                    'rounded-lg px-3.5 py-2 whitespace-pre-wrap leading-relaxed',
                    turn.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground',
                  )}
                >
                  {turn.content || (
                    <span className="italic text-muted-foreground">
                      {t('noTextReply')}
                    </span>
                  )}
                </div>

                {turn.handoff && (
                  <div className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium px-1">
                    <span>{t('handoffSignalled')}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}

        {sending && (
          <div className="flex gap-2.5 max-w-[85%] mr-auto">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Bot className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-muted px-3.5 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{t('typing')}</span>
            </div>
          </div>
        )}
      </div>

      <div className="border-t p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('inputPlaceholder')}
            disabled={sending}
            className="flex-1 bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            autoFocus
          />
          <Button
            type="submit"
            size="sm"
            disabled={!input.trim() || sending}
            className="h-8 gap-1.5 px-3"
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            <span className="sr-only sm:not-sr-only sm:inline-block text-xs">
              {t('sendButton')}
            </span>
          </Button>
        </form>
      </div>
    </div>
  );
}
