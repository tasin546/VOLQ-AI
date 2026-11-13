import React, { useCallback, useEffect, useState } from 'react';
import {
  Edit2,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button, ConfirmDialog, DialogModal, Input, Switch, Textarea } from '../../ui/Primitives';
import { apiFetch } from '../../../lib/api';
import { useAuthStore } from '../../../stores/authStore';
import { useUiStore } from '../../../stores/uiStore';

export interface SkillItem {
  id: string;
  ownerUserId: string | null;
  isOwner: boolean;
  slug: string;
  name: string;
  description: string;
  content: string;
  tokenEstimate: number;
  version: number;
  enabled: boolean;
  shared: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SkillDraft {
  id?: string;
  name: string;
  slug: string;
  description: string;
  content: string;
  shared: boolean;
  enabled: boolean;
}

const emptyDraft: SkillDraft = {
  name: '',
  slug: '',
  description: '',
  content: '',
  shared: false,
  enabled: true,
};

export const SkillsSettingsSection: React.FC = () => {
  const pushToast = useUiStore((s) => s.pushToast);
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<SkillDraft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ skills: SkillItem[] }>('/api/skills');
      setSkills(res.skills);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to load skills', 'error');
    } finally {
      setLoading(false);
    }
  }, [pushToast]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const handleOpenCreate = () => {
    setDraft({ ...emptyDraft });
    setEditorOpen(true);
  };

  const handleOpenEdit = (skill: SkillItem) => {
    setDraft({
      id: skill.id,
      name: skill.name,
      slug: skill.slug,
      description: skill.description,
      content: skill.content,
      shared: skill.shared,
      enabled: skill.enabled,
    });
    setEditorOpen(true);
  };

  const handleSave = async () => {
    if (!draft.name.trim() || !draft.content.trim()) {
      pushToast('Name and content are required', 'error');
      return;
    }
    const slug = draft.slug.trim() || draft.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');

    setSaving(true);
    try {
      if (draft.id) {
        await apiFetch(`/api/skills/${draft.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: draft.name.trim(),
            slug,
            description: draft.description.trim(),
            content: draft.content.trim(),
            shared: draft.shared,
            enabled: draft.enabled,
          }),
        });
        pushToast('Skill updated');
      } else {
        await apiFetch('/api/skills', {
          method: 'POST',
          body: JSON.stringify({
            name: draft.name.trim(),
            slug,
            description: draft.description.trim(),
            content: draft.content.trim(),
            shared: draft.shared,
            enabled: draft.enabled,
          }),
        });
        pushToast('Skill created');
      }
      setEditorOpen(false);
      await loadSkills();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to save skill', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (skill: SkillItem) => {
    try {
      await apiFetch(`/api/skills/${skill.id}/toggle`, { method: 'POST' });
      setSkills((prev) =>
        prev.map((s) => (s.id === skill.id ? { ...s, enabled: !s.enabled } : s))
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to toggle skill', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/skills/${id}`, { method: 'DELETE' });
      setSkills((prev) => prev.filter((s) => s.id !== id));
      pushToast('Skill deleted');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to delete skill', 'error');
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const filteredSkills = skills.filter(
    (s) =>
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.slug.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase())
  );

  const targetDeleteSkill = skills.find((s) => s.id === deleteConfirmId);
  const liveTokenEstimate = Math.ceil((draft.content?.length || 0) / 4);

  return (
    <div className="space-y-4" data-setting-row="skills-section">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs text-[var(--text-muted)]">
            Define system skills and custom instructions injected automatically into AI prompts.
          </p>
        </div>
        <Button size="sm" variant="primary" onClick={handleOpenCreate}>
          <Plus className="w-4 h-4 mr-1.5" />
          New Skill
        </Button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search skills by name, slug or keyword..."
          className="pl-9 text-xs"
        />
      </div>

      {/* Skills List */}
      {loading && skills.length === 0 ? (
        <div className="p-8 text-center text-xs text-[var(--text-muted)]">Loading skills...</div>
      ) : filteredSkills.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-8 text-center space-y-2">
          <Sparkles className="w-8 h-8 text-[var(--text-muted)] mx-auto opacity-40" />
          <div className="text-sm font-medium text-[var(--text)]">No skills found</div>
          <p className="text-xs text-[var(--text-muted)] max-w-sm mx-auto">
            {search ? 'No skills match your search query.' : 'Create your first skill to inject domain knowledge, behavioral instructions, or custom rules into your chat models.'}
          </p>
          {!search && (
            <div className="pt-2">
              <Button size="sm" variant="secondary" onClick={handleOpenCreate}>
                <Plus className="w-4 h-4 mr-1.5" />
                Add Skill
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5">
          {filteredSkills.map((skill) => (
            <div
              key={skill.id}
              className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] p-4 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-[var(--text)] truncate">
                    {skill.name}
                  </span>
                  <code className="px-2 py-0.5 rounded-[var(--radius-sm)] bg-[var(--surface-raised)] border border-[var(--border)] text-[11px] font-mono text-[var(--accent)]">
                    @{skill.slug}
                  </code>
                  {skill.shared && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border bg-[var(--surface-raised)] text-[var(--text-muted)] border-[var(--border)]">
                      Shared
                    </span>
                  )}
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono text-[var(--text-muted)]">
                    ~{skill.tokenEstimate} tokens
                  </span>
                </div>
                {skill.description && (
                  <p className="text-xs text-[var(--text-muted)] line-clamp-2">
                    {skill.description}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <Switch
                  checked={skill.enabled}
                  onCheckedChange={() => void handleToggle(skill)}
                  aria-label={`Toggle ${skill.name}`}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleOpenEdit(skill)}
                  title="Edit skill"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                {(skill.isOwner || isAdmin) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteConfirmId(skill.id)}
                    className="text-[var(--status-error)] hover:bg-[var(--status-error-soft)]"
                    title="Delete skill"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <DialogModal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={draft.id ? 'Edit Skill' : 'Create New Skill'}
        description="Configure instructions and guidelines to inject into AI reasoning"
        maxWidthClass="max-w-xl"
      >
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
                Skill Name
              </label>
              <Input
                value={draft.name}
                onChange={(e) => {
                  const val = e.target.value;
                  setDraft((prev) => ({
                    ...prev,
                    name: val,
                    slug: prev.id ? prev.slug : val.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                  }));
                }}
                placeholder="e.g. Code Reviewer"
                className="text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
                Slug identifier
              </label>
              <Input
                value={draft.slug}
                onChange={(e) => setDraft((prev) => ({ ...prev, slug: e.target.value.toLowerCase() }))}
                placeholder="code-reviewer"
                className="text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-2)] mb-1">
              Short Description (Optional)
            </label>
            <Input
              value={draft.description}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="What this skill helps the AI accomplish..."
              className="text-xs"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-[var(--text-2)]">
                Instructions & System Prompt
              </label>
              <span className="text-[11px] font-mono text-[var(--text-muted)]">
                ~{liveTokenEstimate} tokens
              </span>
            </div>
            <Textarea
              rows={8}
              value={draft.content}
              onChange={(e) => setDraft((prev) => ({ ...prev, content: e.target.value }))}
              placeholder="You are an expert code reviewer. Analyze code for security vulnerabilities, edge cases, and performance optimizations..."
              className="font-mono text-xs leading-relaxed"
            />
          </div>

          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-[var(--text)]">Enable Skill</div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  Active skills are injected into the context of conversation completions.
                </div>
              </div>
              <Switch
                checked={draft.enabled}
                onCheckedChange={(val) => setDraft((prev) => ({ ...prev, enabled: val }))}
              />
            </div>

            {isAdmin && (
              <div className="flex items-center justify-between pt-2 border-t border-[var(--border)]">
                <div>
                  <div className="text-xs font-medium text-[var(--text)]">Shared instance skill</div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Available instance-wide to all registered users.
                  </div>
                </div>
                <Switch
                  checked={draft.shared}
                  onCheckedChange={(val) => setDraft((prev) => ({ ...prev, shared: val }))}
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditorOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={saving} onClick={() => void handleSave()}>
              {saving ? 'Saving...' : draft.id ? 'Save changes' : 'Create skill'}
            </Button>
          </div>
        </div>
      </DialogModal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={Boolean(deleteConfirmId)}
        onOpenChange={(val) => !val && setDeleteConfirmId(null)}
        title={`Delete skill "${targetDeleteSkill?.name || ''}"?`}
        description="This will permanently delete this skill. Chats will no longer receive its instructions."
        confirmLabel="Delete skill"
        onConfirm={async () => {
          if (deleteConfirmId) {
            await handleDelete(deleteConfirmId);
          }
        }}
      />
    </div>
  );
};
