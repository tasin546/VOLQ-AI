import React, { useState } from 'react';
import { BookText, Pencil, Plus, Trash2, X } from 'lucide-react';
import { GlassButton, GlassInput, GlassPanel } from '../components/ui/Glass';
import { ConfirmDialog } from '../components/ui/Primitives';
import { apiFetch } from '../lib/api';
import type { SavedPrompt } from '../lib/types';
import { useChatStore } from '../stores/chatStore';
import { useUiStore } from '../stores/uiStore';

export const PromptsPage: React.FC = () => {
  const { prompts, fetchPrompts } = useChatStore();
  const pushToast = useUiStore((s) => s.pushToast);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [command, setCommand] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmDeletePrompt, setConfirmDeletePrompt] = useState<SavedPrompt | null>(null);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setCommand('');
    setContent('');
  };

  const startEdit = (item: SavedPrompt) => {
    setEditingId(item.id);
    setTitle(item.title);
    setCommand(item.command);
    setContent(item.content);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const normalizedCmd = command
        .trim()
        .toLowerCase()
        .replace(/^\/+/, '')
        .replace(/[^a-z0-9-]+/g, '-');

      if (editingId) {
        await apiFetch(`/api/prompts/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({ title, command: normalizedCmd, content }),
        });
        pushToast('Prompt updated');
      } else {
        await apiFetch('/api/prompts', {
          method: 'POST',
          body: JSON.stringify({ title, command: normalizedCmd, content }),
        });
        pushToast('Prompt saved');
      }
      resetForm();
      await fetchPrompts();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to save prompt', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/prompts/${id}`, { method: 'DELETE' });
      await fetchPrompts();
      pushToast('Prompt deleted');
    } catch {
      pushToast('Failed to delete prompt', 'error');
    }
  };

  return (
    <main className="flex-1 overflow-y-auto px-4 sm:px-8 pt-16 lg:pt-8 pb-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[14px] liquid-glass flex items-center justify-center">
            <BookText className="w-5 h-5 text-[var(--text-primary)]" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Prompt Library</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Save reusable prompts and insert them in chat by typing{' '}
              <code className="font-mono text-[var(--text-primary)]">/</code>.
            </p>
          </div>
        </div>

        <GlassPanel strong className="p-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {editingId ? 'Edit prompt' : 'Create new prompt'}
              </h2>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel edit
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">Title</label>
                <GlassInput
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Code Review"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1">
                  Slash command
                </label>
                <GlassInput
                  type="text"
                  required
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="review"
                  className="font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">
                Prompt content
              </label>
              <textarea
                required
                rows={4}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Review this code for correctness, security issues, and edge cases:"
                className="w-full p-3 rounded-[12px] bg-[var(--glass-fill)] border border-[var(--border-hairline)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-bright)] resize-y"
              />
            </div>

            <GlassButton type="submit" variant="primary" disabled={saving}>
              <Plus className="w-4 h-4" />
              {editingId ? 'Save changes' : 'Add prompt'}
            </GlassButton>
          </form>
        </GlassPanel>

        <div className="space-y-3">
          {prompts.length === 0 ? (
            <GlassPanel className="p-8 text-center text-sm text-[var(--text-muted)]">
              No saved prompts yet.
            </GlassPanel>
          ) : (
            prompts.map((item) => (
              <GlassPanel
                key={item.id}
                className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{item.title}</span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-[var(--glass-strong)] border border-[var(--border-hairline)] text-[var(--text-primary)]">
                      /{item.command}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap break-words">
                    {item.content}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(item)}
                    aria-label={`Edit ${item.title}`}
                    className="p-2 rounded-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--glass-hover)]"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDeletePrompt(item)}
                    aria-label={`Delete ${item.title}`}
                    className="p-2 rounded-[10px] text-[var(--text-secondary)] hover:text-[var(--status-error)] hover:bg-[var(--status-error-soft)]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </GlassPanel>
            ))
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmDeletePrompt)}
        onOpenChange={(open) => {
          if (!open) setConfirmDeletePrompt(null);
        }}
        title="Delete saved prompt"
        description={`Delete saved prompt "${confirmDeletePrompt?.title ?? ''}" (/${confirmDeletePrompt?.command ?? ''})?`}
        confirmLabel="Delete prompt"
        onConfirm={async () => {
          if (!confirmDeletePrompt) return;
          const id = confirmDeletePrompt.id;
          setConfirmDeletePrompt(null);
          await handleDelete(id);
        }}
      />
    </main>
  );
};
