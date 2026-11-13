import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Lock,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Unlock,
} from 'lucide-react';
import { Button, ConfirmDialog, Input, Select } from '../../../ui/Primitives';
import { apiFetch } from '../../../../lib/api';
import type { AdminConnection, AdminModelItem, KnowledgeBaseItem } from '../../../../lib/types';
import { useChatStore } from '../../../../stores/chatStore';
import { useUiStore } from '../../../../stores/uiStore';

export const ModelsSettingsSection: React.FC = () => {
  const pushToast = useUiStore((s) => s.pushToast);
  const loadInitialData = useChatStore((s) => s.loadInitialData);

  const [models, setModels] = useState<AdminModelItem[]>([]);
  const [connections, setConnections] = useState<AdminConnection[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseItem[]>([]);

  const [search, setSearch] = useState('');
  const [connFilter, setConnFilter] = useState('all');
  const [visibilityFilter, setVisibilityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active_or_hidden');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // In-pane sub-view state (zero nested drawers!)
  const [editingModel, setEditingModel] = useState<AdminModelItem | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [defaultTemp, setDefaultTemp] = useState('');
  const [defaultMaxTokens, setDefaultMaxTokens] = useState('');
  const [attachedKbIds, setAttachedKbIds] = useState<string[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<AdminModelItem | null>(null);

  const loadData = useCallback(async () => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    if (connFilter !== 'all') params.set('connectionId', connFilter);
    if (visibilityFilter !== 'all') params.set('visibility', visibilityFilter);
    params.set('status', statusFilter);

    const [modelsRes, connsRes, kbRes] = await Promise.all([
      apiFetch<{ models: AdminModelItem[] }>(`/api/admin/models?${params.toString()}`),
      apiFetch<{ connections: AdminConnection[] }>('/api/admin/connections'),
      apiFetch<{ bases: KnowledgeBaseItem[] }>('/api/admin/knowledge/bases'),
    ]);
    setModels(modelsRes.models);
    setConnections(connsRes.connections);
    setKnowledgeBases(kbRes.bases);
  }, [search, connFilter, visibilityFilter, statusFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openProfile = (m: AdminModelItem) => {
    setEditingModel(m);
    setDisplayName(m.displayName ?? '');
    setDescription(m.description);
    setVisibility(m.visibility);
    setSystemPrompt(m.systemPrompt);
    setDefaultTemp(m.defaultTemperature != null ? String(m.defaultTemperature) : '');
    setDefaultMaxTokens(m.defaultMaxTokens != null ? String(m.defaultMaxTokens) : '');
    setAttachedKbIds(m.knowledgeBaseIds);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModel) return;
    setSavingProfile(true);
    try {
      await apiFetch(`/api/admin/models/${editingModel.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: displayName.trim() || null,
          description: description.trim(),
          visibility,
          systemPrompt,
          defaultTemperature: defaultTemp.trim() === '' ? null : Number(defaultTemp),
          defaultMaxTokens:
            defaultMaxTokens.trim() === '' ? null : Math.trunc(Number(defaultMaxTokens)),
          knowledgeBaseIds: attachedKbIds,
        }),
      });
      setEditingModel(null);
      await loadData();
      await loadInitialData();
      pushToast('Model profile updated');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to update model', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const runSinglePatch = async (id: string, patch: Record<string, unknown>, msg: string) => {
    await apiFetch(`/api/admin/models/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    await loadData();
    await loadInitialData();
    pushToast(msg);
  };

  const runBulk = async (
    action: 'hide' | 'show' | 'make_public' | 'make_private' | 'delete' | 'restore'
  ) => {
    if (selectedIds.size === 0) return;
    await apiFetch('/api/admin/models/bulk', {
      method: 'POST',
      body: JSON.stringify({ ids: Array.from(selectedIds), action }),
    });
    setSelectedIds(new Set());
    await loadData();
    await loadInitialData();
    pushToast(`Updated ${selectedIds.size} model(s)`);
  };

  const handleRefreshAll = async () => {
    await apiFetch('/api/models/refresh', { method: 'POST' });
    await loadData();
    await loadInitialData();
    pushToast('Synced models from enabled connections');
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(models.map((m) => m.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === models.length && models.length > 0) {
      deselectAll();
    } else {
      selectAll();
    }
  };

  if (editingModel) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditingModel(null)}>
            <ArrowLeft className="w-4 h-4" />
            Models
          </Button>
          <span className="text-xs text-[var(--text-muted)]">/</span>
          <span className="text-xs font-mono text-[var(--text-2)] truncate">
            {editingModel.providerModelId}
          </span>
        </div>

        <form
          onSubmit={handleSaveProfile}
          className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-2)] mb-1">Display name</label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={editingModel.providerModelId}
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-2)] mb-1">Short description</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Fast reasoning model"
              />
            </div>
          </div>

          <div>
            <span className="block text-xs text-[var(--text-2)] mb-1.5">Visibility</span>
            <div className="grid grid-cols-2 gap-2">
              {(['public', 'private'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  className={`h-9 rounded-[var(--radius-md)] text-xs font-medium border ${
                    visibility === v
                      ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)]'
                      : 'bg-[var(--surface-raised)] border-[var(--border)] text-[var(--text-2)]'
                  }`}
                >
                  {v === 'public' ? 'Public (all users)' : 'Private (admins only)'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--text-2)] mb-1">
              Admin system prompt (never exposed to non-admins)
            </label>
            <textarea
              rows={4}
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Model-specific system prompt..."
              className="w-full p-3 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)] text-base sm:text-sm text-[var(--text)] outline-none focus:border-[var(--border-strong)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-2)] mb-1">Default temperature</label>
              <Input
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={defaultTemp}
                onChange={(e) => setDefaultTemp(e.target.value)}
                placeholder="Provider default"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-2)] mb-1">Default max tokens</label>
              <Input
                type="number"
                min={1}
                max={128000}
                value={defaultMaxTokens}
                onChange={(e) => setDefaultMaxTokens(e.target.value)}
                placeholder="Provider default"
              />
            </div>
          </div>

          <div>
            <span className="block text-xs text-[var(--text-2)] mb-1.5">
              Attached knowledge bases
            </span>
            {knowledgeBases.length === 0 ? (
              <div className="text-xs text-[var(--text-muted)]">No knowledge bases created yet.</div>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto p-2 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)]">
                {knowledgeBases.map((kb) => {
                  const checked = attachedKbIds.includes(kb.id);
                  return (
                    <label
                      key={kb.id}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded-[var(--radius-sm)] hover:bg-[var(--surface-hover)] cursor-pointer text-xs"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setAttachedKbIds((prev) =>
                            checked ? prev.filter((id) => id !== kb.id) : [...prev, kb.id]
                          )
                        }
                        className="accent-[var(--accent)]"
                      />
                      <span className="font-medium truncate">{kb.name}</span>
                      <span className="ml-auto text-[10px] font-mono text-[var(--text-muted)]">
                        {kb.readyCount} file(s)
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditingModel(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={savingProfile}>
              <Save className="w-3.5 h-3.5" />
              {savingProfile ? 'Saving...' : 'Save profile'}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-setting-row="admin-models-list">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-muted)]">
          Rename, hide, set public/private access, and attach knowledge bases per model.
        </p>
        <Button size="sm" variant="secondary" onClick={() => void handleRefreshAll()}>
          <RefreshCw className="w-3.5 h-3.5" />
          Sync models
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search models..."
            className="pl-9"
          />
        </div>
        <Select
          aria-label="Filter by connection"
          value={connFilter}
          onChange={(e) => setConnFilter(e.target.value)}
        >
          <option value="all">All connections</option>
          {connections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by visibility"
          value={visibilityFilter}
          onChange={(e) => setVisibilityFilter(e.target.value)}
        >
          <option value="all">All visibility</option>
          <option value="public">Public only</option>
          <option value="private">Private (admin only)</option>
        </Select>
        <Select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="active_or_hidden">Active &amp; Hidden</option>
          <option value="visible">Visible only</option>
          <option value="hidden">Hidden only</option>
          <option value="deleted">Deleted models</option>
        </Select>
      </div>

      {models.length > 0 && (
        <div className="flex items-center justify-between px-1 py-0.5 text-xs">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={models.length > 0 && selectedIds.size === models.length}
              ref={(el) => {
                if (el) {
                  el.indeterminate = selectedIds.size > 0 && selectedIds.size < models.length;
                }
              }}
              onChange={toggleSelectAll}
              aria-label="Select all models"
              className="w-4 h-4 accent-[var(--accent)] rounded cursor-pointer"
            />
            <span className="font-medium text-[var(--text-2)] hover:text-[var(--text)] transition-colors">
              {selectedIds.size === models.length
                ? 'Deselect all'
                : `Select all (${models.length})`}
            </span>
          </label>
          {selectedIds.size > 0 && (
            <span className="font-mono text-[11px] text-[var(--text-muted)]">
              {selectedIds.size} of {models.length} selected
            </span>
          )}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="p-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-medium">{selectedIds.size} selected</span>
            {selectedIds.size < models.length ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={selectAll}
                className="h-7 px-2 text-xs text-[var(--accent)] hover:text-[var(--accent)]"
              >
                Select all ({models.length})
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={deselectAll}
                className="h-7 px-2 text-xs text-[var(--text-muted)]"
              >
                Clear
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => void runBulk('show')}>
              Show
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void runBulk('hide')}>
              Hide
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void runBulk('make_public')}>
              Make public
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void runBulk('make_private')}>
              Make private
            </Button>
            {statusFilter === 'deleted' ? (
              <Button size="sm" variant="secondary" onClick={() => void runBulk('restore')}>
                Restore
              </Button>
            ) : (
              <Button size="sm" variant="destructive" onClick={() => void runBulk('delete')}>
                Delete
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {models.length === 0 ? (
          <div className="p-8 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] text-center text-sm text-[var(--text-muted)]">
            No models match the current filter.
          </div>
        ) : (
          models.map((m) => (
            <div
              key={m.id}
              className="p-3.5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-3 min-w-0">
                <input
                  type="checkbox"
                  checked={selectedIds.has(m.id)}
                  onChange={() => toggleSelect(m.id)}
                  aria-label={`Select ${m.displayName ?? m.providerModelId}`}
                  className="mt-1 w-4 h-4 accent-[var(--accent)]"
                />
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-[var(--text)]">
                      {m.displayName || m.providerModelId}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-2)]">
                      {m.connectionName}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-2)]">
                      {m.visibility}
                    </span>
                    {m.isHidden && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-[var(--status-warning-soft)] text-[var(--status-warning)]">
                        Hidden
                      </span>
                    )}
                    {m.isDeleted && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-[var(--status-error-soft)] text-[var(--status-error)]">
                        Deleted
                      </span>
                    )}
                  </div>
                  <div className="text-xs font-mono text-[var(--text-muted)] truncate">
                    {m.providerModelId}
                    {m.knowledgeBaseIds.length > 0 && ` · ${m.knowledgeBaseIds.length} KB(s)`}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-wrap shrink-0">
                <Button size="sm" variant="secondary" onClick={() => openProfile(m)}>
                  <Pencil className="w-3.5 h-3.5" />
                  Profile
                </Button>
                <button
                  type="button"
                  onClick={() =>
                    void runSinglePatch(
                      m.id,
                      { isHidden: !m.isHidden },
                      m.isHidden ? 'Model shown' : 'Model hidden'
                    )
                  }
                  aria-label={m.isHidden ? 'Show model' : 'Hide model'}
                  className="p-2 rounded-[var(--radius-md)] text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
                >
                  {m.isHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void runSinglePatch(
                      m.id,
                      { visibility: m.visibility === 'public' ? 'private' : 'public' },
                      `Model set to ${m.visibility === 'public' ? 'private' : 'public'}`
                    )
                  }
                  aria-label={m.visibility === 'public' ? 'Make private' : 'Make public'}
                  className="p-2 rounded-[var(--radius-md)] text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
                >
                  {m.visibility === 'public' ? (
                    <Unlock className="w-4 h-4" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                </button>
                {m.isDeleted ? (
                  <button
                    type="button"
                    onClick={() => void runSinglePatch(m.id, { isDeleted: false }, 'Model restored')}
                    aria-label="Restore model"
                    className="p-2 rounded-[var(--radius-md)] text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(m)}
                    aria-label={`Delete ${m.providerModelId}`}
                    className="p-2 rounded-[var(--radius-md)] text-[var(--text-2)] hover:text-[var(--status-error)] hover:bg-[var(--status-error-soft)]"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title="Remove model from catalog?"
        description={`Removing "${confirmDelete?.displayName || confirmDelete?.providerModelId || ''}" hides it from VOLQ AI and prevents it from re-appearing on refresh.`}
        confirmLabel="Delete model"
        onConfirm={async () => {
          if (!confirmDelete) return;
          const id = confirmDelete.id;
          setConfirmDelete(null);
          await runSinglePatch(id, { isDeleted: true }, 'Model removed from catalog');
        }}
      />
    </div>
  );
};
