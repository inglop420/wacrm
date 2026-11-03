'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2, Pencil, RefreshCw, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { useTranslations } from 'next-intl';

interface DocSummary {
  id: string;
  title: string;
  updated_at: string;
}

/** Editor target: 'new' when creating, a doc id when editing, null when closed. */
type EditTarget = 'new' | string | null;

export function AiKnowledgeCard({
  accountId,
  canEdit,
  hasEmbeddingsKey,
  agentId,
  agentName,
}: {
  accountId: string | null;
  canEdit: boolean;
  hasEmbeddingsKey: boolean;
  agentId?: string | null;
  agentName?: string;
}) {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditTarget>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const loadedKeyRef = useRef<string | null>(null);
  const t = useTranslations('Settings.aiKnowledge');

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const url = agentId
        ? `/api/ai/knowledge?agent_id=${encodeURIComponent(agentId)}`
        : '/api/ai/knowledge?agent_id=sales';
      const res = await fetch(url);
      const data = await res.json();
      if (res.ok) setDocs(data.documents ?? []);
      else toast.error(data.error ?? t('loadFailed'));
    } catch {
      toast.error(t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [agentId, t]);

  useEffect(() => {
    const key = `${accountId}:${agentId ?? 'sales'}`;
    if (!accountId || loadedKeyRef.current === key) return;
    loadedKeyRef.current = key;
    void fetchDocs();
  }, [accountId, agentId, fetchDocs]);

  const openNew = () => {
    setEditing('new');
    setTitle('');
    setContent('');
  };

  const openEdit = async (id: string) => {
    try {
      const res = await fetch(`/api/ai/knowledge/${id}`);
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? t('openFailed'));
        return;
      }
      setEditing(id);
      setTitle(data.title ?? '');
      setContent(data.content ?? '');
    } catch {
      toast.error(t('openFailed'));
    }
  };

  const cancelEdit = () => {
    setEditing(null);
    setTitle('');
    setContent('');
  };

  const save = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error(t('titleContentRequired'));
      return;
    }
    setSaving(true);
    try {
      const isNew = editing === 'new';
      const payload: Record<string, unknown> = {
        title: title.trim(),
        content: content.trim(),
      };
      if (isNew && agentId) {
        payload.agent_id = agentId;
      }

      const res = await fetch(
        isNew ? '/api/ai/knowledge' : `/api/ai/knowledge/${editing}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data = await res.json();
      if (res.ok) {
        if (data.warning) toast.warning(data.warning);
        else toast.success(isNew ? t('saveSuccessNew') : t('saveSuccessUpdate'));
        cancelEdit();
        await fetchDocs();
      } else {
        toast.error(data.error ?? t('saveFailed'));
      }
    } catch {
      toast.error(t('saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(t('confirmDelete'))) return;
    try {
      const res = await fetch(`/api/ai/knowledge/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(t('deleteSuccess'));
        if (editing === id) cancelEdit();
        await fetchDocs();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? t('deleteFailed'));
      }
    } catch {
      toast.error(t('deleteFailed'));
    }
  };

  const reindex = async () => {
    setReindexing(true);
    try {
      const res = await fetch('/api/ai/knowledge/reindex', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success(
          t('reindexSuccess', { count: data.reindexed_documents ?? 0 }),
        );
      } else {
        toast.error(data.error ?? t('reindexFailed'));
      }
    } catch {
      toast.error(t('reindexFailed'));
    } finally {
      setReindexing(false);
    }
  };

  const description = agentName
    ? `Documentos de referencia y respuestas frecuentes exclusivos para ${agentName}.`
    : t('cardDescription');

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BookOpen className="h-5 w-5 text-primary" />
              {t('cardTitle')} {agentName ? `(${agentName})` : ''}
            </CardTitle>
            <CardDescription className="mt-1">
              {description}
            </CardDescription>
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              {hasEmbeddingsKey && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={reindex}
                  disabled={reindexing || docs.length === 0}
                  className="gap-1.5"
                >
                  {reindexing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {t('reindexButton')}
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={openNew}
                disabled={editing !== null}
                className="gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" /> {t('addDocumentButton')}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {editing !== null && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            <h4 className="text-sm font-semibold text-foreground">
              {editing === 'new' ? t('editorTitleNew') : t('editorTitleEdit')}
            </h4>
            <div className="space-y-1.5">
              <Label htmlFor="kb-title">{t('editorTitleLabel')}</Label>
              <Input
                id="kb-title"
                placeholder={t('editorTitlePlaceholder')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
                disabled={saving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kb-content">{t('editorContentLabel')}</Label>
              <Textarea
                id="kb-content"
                rows={8}
                placeholder={t('editorContentPlaceholder')}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={saving}
                className="font-mono text-xs"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={cancelEdit}
                disabled={saving}
              >
                {t('cancelButton')}
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={save}
                disabled={saving}
                className="gap-1.5"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {t('saveButton')}
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('loading')}
          </div>
        ) : docs.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {t('empty')}
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {docs.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between p-3 text-sm hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0 pr-4">
                  <p className="font-medium text-foreground truncate">
                    {doc.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t('updated')}{' '}
                    {new Date(doc.updated_at).toLocaleDateString()}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(doc.id)}
                      disabled={editing !== null}
                      aria-label={t('editButtonAria')}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => remove(doc.id)}
                      disabled={editing !== null}
                      aria-label={t('deleteButtonAria')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
