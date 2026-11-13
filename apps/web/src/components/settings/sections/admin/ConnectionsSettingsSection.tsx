import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, FlaskConical, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button, ConfirmDialog, Input, Select } from '../../../ui/Primitives';
import { apiFetch } from '../../../../lib/api';
import type { AdminConnection, SsrfPolicy } from '../../../../lib/types';
import { useChatStore } from '../../../../stores/chatStore';
import { useUiStore } from '../../../../stores/uiStore';
import type { AdminDirtyState } from '../../SettingsSearchIndex';

export const ConnectionsSettingsSection: React.FC<{
  onDirtyStateChange?: (state: AdminDirtyState | null) => void;
}> = ({ onDirtyStateChange }) => {
  const { loadInitialData, refreshModels } = useChatStore();
  const pushToast = useUiStore((s) => s.pushToast);

  const [connections, setConnections] = useState<AdminConnection[]>([]);
  const [defaultOllamaUrl, setDefaultOllamaUrl] = useState('http://localhost:11434');
  const [editingConnId, setEditingConnId] = useState<string | null>(null);
  const [connName, setConnName] = useState('');
  const [connType, setConnType] = useState<'ollama' | 'openai_compatible'>('ollama');
  const [connUrl, setConnUrl] = useState('');
  const [connApiKey, setConnApiKey] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [confirmDeleteConn, setConfirmDeleteConn] = useState<AdminConnection | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>(
    {}
  );

  const [ssrfPolicy, setSsrfPolicy] = useState<SsrfPolicy>({
    allowPrivateNetworks: true,
    allowlist: [],
    denylist: [],
  });
  const [allowlistText, setAllowlistText] = useState('');
  const [denylistText, setDenylistText] = useState('');
  const [initialSsrf, setInitialSsrf] = useState<{
    allowPrivateNetworks: boolean;
    allow: string;
    deny: string;
  } | null>(null);
  const [savingSsrf, setSavingSsrf] = useState(false);

  const loadData = useCallback(async () => {
    const [connsRes, settingsRes] = await Promise.all([
      apiFetch<{ connections: AdminConnection[] }>('/api/admin/connections'),
      apiFetch<{ ssrfPolicy: SsrfPolicy; defaultOllamaUrl: string }>('/api/admin/settings'),
    ]);
    setConnections(connsRes.connections);
    setDefaultOllamaUrl(settingsRes.defaultOllamaUrl);
    setSsrfPolicy(settingsRes.ssrfPolicy);
    const allow = settingsRes.ssrfPolicy.allowlist.join('\n');
    const deny = settingsRes.ssrfPolicy.denylist.join('\n');
    setAllowlistText(allow);
    setDenylistText(deny);
    setInitialSsrf({
      allowPrivateNetworks: settingsRes.ssrfPolicy.allowPrivateNetworks,
      allow,
      deny,
    });
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const currentSsrfSnapshot = JSON.stringify({
    allowPrivateNetworks: ssrfPolicy.allowPrivateNetworks,
    allow: allowlistText,
    deny: denylistText,
  });
  const initialSnapshot = initialSsrf ? JSON.stringify(initialSsrf) : '';
  const ssrfDirty = initialSnapshot !== '' && currentSsrfSnapshot !== initialSnapshot;

  const handleSaveSsrf = useCallback(async () => {
    setSavingSsrf(true);
    try {
      const parseLines = (raw: string) =>
        raw
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
      await apiFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          ssrfPolicy: {
            allowPrivateNetworks: ssrfPolicy.allowPrivateNetworks,
            allowlist: parseLines(allowlistText),
            denylist: parseLines(denylistText),
          },
        }),
      });
      setInitialSsrf({
        allowPrivateNetworks: ssrfPolicy.allowPrivateNetworks,
        allow: allowlistText,
        deny: denylistText,
      });
      pushToast('SSRF policy saved');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to save SSRF policy', 'error');
    } finally {
      setSavingSsrf(false);
    }
  }, [ssrfPolicy.allowPrivateNetworks, allowlistText, denylistText, pushToast]);

  const handleResetSsrf = useCallback(() => {
    if (!initialSsrf) return;
    setSsrfPolicy((prev) => ({
      ...prev,
      allowPrivateNetworks: initialSsrf.allowPrivateNetworks,
    }));
    setAllowlistText(initialSsrf.allow);
    setDenylistText(initialSsrf.deny);
  }, [initialSsrf]);

  useEffect(() => {
    if (!onDirtyStateChange) return;
    if (ssrfDirty) {
      onDirtyStateChange({
        dirty: true,
        saving: savingSsrf,
        label: 'Unsaved SSRF guard changes',
        onSave: handleSaveSsrf,
        onReset: handleResetSsrf,
      });
    } else {
      onDirtyStateChange(null);
    }
    return () => onDirtyStateChange(null);
  }, [ssrfDirty, savingSsrf, handleSaveSsrf, handleResetSsrf, onDirtyStateChange]);

  const resetForm = () => {
    setEditingConnId(null);
    setConnName('');
    setConnType('ollama');
    setConnUrl('');
    setConnApiKey('');
  };

  const handleSaveConnection = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const trimmedUrl = connUrl.trim();
      const normalizedUrl =
        trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://')
          ? trimmedUrl
          : `http://${trimmedUrl}`;

      if (editingConnId) {
        await apiFetch(`/api/admin/connections/${editingConnId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: connName.trim(),
            type: connType,
            baseUrl: normalizedUrl,
            ...(connApiKey.trim() ? { apiKey: connApiKey.trim() } : {}),
          }),
        });
        pushToast('Connection updated');
      } else {
        await apiFetch('/api/admin/connections', {
          method: 'POST',
          body: JSON.stringify({
            name: connName.trim(),
            type: connType,
            baseUrl: normalizedUrl,
            ...(connApiKey.trim() ? { apiKey: connApiKey.trim() } : {}),
          }),
        });
        pushToast('Connection added');
      }
      resetForm();
      await loadData();
      try {
        const errors = await refreshModels();
        if (errors.length > 0) {
          pushToast(`Saved connection, but discovery failed: ${errors[0]!.error}`, 'error');
        }
      } catch {
        // ignore background model refresh errors
      }
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to save connection', 'error');
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await apiFetch<{ ok: boolean; models: Array<{ id: string }>; error?: string }>(
        `/api/admin/connections/${id}/test`,
        { method: 'POST' }
      );
      setTestResults((prev) => ({
        ...prev,
        [id]: res.ok
          ? { ok: true, message: `Connected, ${res.models.length} model(s) discovered` }
          : { ok: false, message: res.error ?? 'Connection test failed' },
      }));
      try {
        await loadData();
        await loadInitialData();
      } catch {
        // ignore reload errors
      }
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [id]: {
          ok: false,
          message: err instanceof Error ? err.message : 'Connection test failed',
        },
      }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section
        data-setting-row="admin-connections-list"
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5"
      >
        <form onSubmit={handleSaveConnection} className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-[var(--text)]">
              {editingConnId ? 'Edit connection' : 'Add model connection'}
            </h3>
            {editingConnId && (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-1 text-xs text-[var(--text-2)] hover:text-[var(--text)]"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-2)] mb-1">Name</label>
              <Input
                required
                value={connName}
                onChange={(e) => setConnName(e.target.value)}
                placeholder="Local Ollama"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-2)] mb-1">Provider type</label>
              <Select
                value={connType}
                onChange={(e) => setConnType(e.target.value as 'ollama' | 'openai_compatible')}
              >
                <option value="ollama">Ollama</option>
                <option value="openai_compatible">OpenAI-compatible</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[var(--text-2)] mb-1">Base URL</label>
              <Input
                type="url"
                required
                value={connUrl}
                onChange={(e) => setConnUrl(e.target.value)}
                placeholder={connType === 'ollama' ? defaultOllamaUrl : 'https://api.openai.com/v1'}
                className="font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-2)] mb-1">
                API Key {connType === 'ollama' ? '(optional)' : '(encrypted at rest)'}
              </label>
              <Input
                type="password"
                value={connApiKey}
                onChange={(e) => setConnApiKey(e.target.value)}
                placeholder={editingConnId ? 'Leave blank to keep existing key' : 'sk-...'}
                className="font-mono"
              />
            </div>
          </div>

          <Button type="submit" variant="primary" size="sm">
            <Plus className="w-3.5 h-3.5" />
            {editingConnId ? 'Update connection' : 'Add connection'}
          </Button>
        </form>
      </section>

      <div className="space-y-2.5">
        {connections.length === 0 ? (
          <div className="p-6 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] text-center text-sm text-[var(--text-muted)]">
            No connections configured yet.
          </div>
        ) : (
          connections.map((conn) => {
            const testStatus = testResults[conn.id];
            return (
              <div
                key={conn.id}
                className="p-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-[var(--text)]">{conn.name}</span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-[var(--surface-raised)] border border-[var(--border)] text-[var(--text-2)]">
                        {conn.type === 'ollama' ? 'Ollama' : 'OpenAI-compatible'}
                      </span>
                      {conn.apiKeyHint && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-mono bg-[var(--surface-raised)] text-[var(--text-muted)]">
                          Key: {conn.apiKeyHint}
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-mono text-[var(--text-muted)] truncate">
                      {conn.baseUrl} · {conn.cachedModels.length} cached model(s)
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={testingId === conn.id}
                      onClick={() => void handleTest(conn.id)}
                    >
                      <FlaskConical className="w-3.5 h-3.5" />
                      {testingId === conn.id ? 'Testing...' : 'Test'}
                    </Button>

                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/connections/${conn.id}`, {
                          method: 'PATCH',
                          body: JSON.stringify({ isEnabled: !conn.isEnabled }),
                        });
                        await loadData();
                        await loadInitialData();
                      }}
                      className={`h-8 px-3 rounded-full text-xs font-medium border ${
                        conn.isEnabled
                          ? 'bg-[var(--surface-active)] border-[var(--border-strong)] text-[var(--text)]'
                          : 'bg-[var(--surface-raised)] border-[var(--border)] text-[var(--text-muted)]'
                      }`}
                    >
                      {conn.isEnabled ? 'Enabled' : 'Disabled'}
                    </button>

                    <button
                      type="button"
                      aria-label={`Edit ${conn.name}`}
                      onClick={() => {
                        setEditingConnId(conn.id);
                        setConnName(conn.name);
                        setConnType(conn.type);
                        setConnUrl(conn.baseUrl);
                        setConnApiKey('');
                      }}
                      className="p-2 rounded-[var(--radius-md)] text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      aria-label={`Delete ${conn.name}`}
                      onClick={() => setConfirmDeleteConn(conn)}
                      className="p-2 rounded-[var(--radius-md)] text-[var(--text-2)] hover:text-[var(--status-error)] hover:bg-[var(--status-error-soft)]"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {testStatus && (
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-[var(--radius-md)] text-xs ${
                      testStatus.ok
                        ? 'bg-[var(--status-success-soft)] text-[var(--status-success)]'
                        : 'bg-[var(--status-error-soft)] text-[var(--status-error)]'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{testStatus.message}</span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* SSRF Policy */}
      <section
        data-setting-row="admin-ssrf"
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 space-y-4"
      >
        <div>
          <h3 className="text-sm font-medium text-[var(--text)]">Connection URL SSRF guard</h3>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Cloud metadata ranges (169.254.0.0/16) remain blocked unless allowlisted. Enable private
            networks for local Ollama instances.
          </p>
        </div>

        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <span className="text-sm text-[var(--text)]">
            Allow private and localhost connection URLs
          </span>
          <input
            type="checkbox"
            checked={ssrfPolicy.allowPrivateNetworks}
            onChange={(e) =>
              setSsrfPolicy((prev) => ({ ...prev, allowPrivateNetworks: e.target.checked }))
            }
            className="w-4 h-4 accent-[var(--accent)]"
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-[var(--text-2)] mb-1">
              Allowlist (host, IP, or CIDR per line)
            </label>
            <textarea
              rows={3}
              value={allowlistText}
              onChange={(e) => setAllowlistText(e.target.value)}
              placeholder="ollama&#10;127.0.0.1"
              className="w-full p-2.5 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)] text-xs font-mono text-[var(--text)] outline-none focus:border-[var(--border-strong)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--text-2)] mb-1">
              Denylist (host, IP, or CIDR per line)
            </label>
            <textarea
              rows={3}
              value={denylistText}
              onChange={(e) => setDenylistText(e.target.value)}
              placeholder="*.internal&#10;10.0.0.0/8"
              className="w-full p-2.5 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)] text-xs font-mono text-[var(--text)] outline-none focus:border-[var(--border-strong)]"
            />
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(confirmDeleteConn)}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteConn(null);
        }}
        title="Delete connection"
        description={`Delete provider connection "${confirmDeleteConn?.name ?? ''}" (${confirmDeleteConn?.baseUrl ?? ''})? Existing models from this connection will no longer be reachable.`}
        confirmLabel="Delete connection"
        onConfirm={async () => {
          if (!confirmDeleteConn) return;
          const id = confirmDeleteConn.id;
          setConfirmDeleteConn(null);
          await apiFetch(`/api/admin/connections/${id}`, { method: 'DELETE' });
          await loadData();
          await loadInitialData();
          pushToast('Connection deleted');
        }}
      />
    </div>
  );
};
