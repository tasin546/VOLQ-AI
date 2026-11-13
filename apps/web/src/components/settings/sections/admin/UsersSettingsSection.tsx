import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Gauge, RotateCcw, Save, Trash2 } from 'lucide-react';
import { LimitSlider } from '../../../ui/LimitSlider';
import { Button, ConfirmDialog, Select } from '../../../ui/Primitives';
import { UserAvatar } from '../../../ui/UserAvatar';
import { apiFetch } from '../../../../lib/api';
import type { UsageOverviewUser, UsagePeriod, User } from '../../../../lib/types';
import { useAuthStore } from '../../../../stores/authStore';
import { useUiStore } from '../../../../stores/uiStore';

interface QuotaDraft {
  mode: 'global' | 'custom' | 'unlimited';
  messagesEnabled: boolean;
  messagesLimit: number;
  messagesPeriod: UsagePeriod;
  tokensEnabled: boolean;
  tokensLimit: number;
  tokensPeriod: UsagePeriod;
}

export const UsersSettingsSection: React.FC<{
  initialQuotaUserId?: string | null;
  onConsumeQuotaUserId?: () => void;
}> = ({ initialQuotaUserId, onConsumeQuotaUserId }) => {
  const currentUser = useAuthStore((s) => s.user);
  const pushToast = useUiStore((s) => s.pushToast);

  const [users, setUsers] = useState<User[]>([]);
  const [usageByUserId, setUsageByUserId] = useState<Record<string, UsageOverviewUser>>({});

  // Confirmations
  const [confirmRemoveAvatarUser, setConfirmRemoveAvatarUser] = useState<User | null>(null);
  const [confirmResetUsageUser, setConfirmResetUsageUser] = useState<User | null>(null);

  // In-pane user quota override editor
  const [editingQuotaUser, setEditingQuotaUser] = useState<User | null>(null);
  const [quotaDraft, setQuotaDraft] = useState<QuotaDraft>({
    mode: 'global',
    messagesEnabled: true,
    messagesLimit: 100,
    messagesPeriod: 'day',
    tokensEnabled: true,
    tokensLimit: 250_000,
    tokensPeriod: 'day',
  });
  const [savingQuota, setSavingQuota] = useState(false);

  const loadData = useCallback(async () => {
    const [usersRes, overviewRes] = await Promise.all([
      apiFetch<{ users: User[] }>('/api/admin/users'),
      apiFetch<{ users: UsageOverviewUser[] }>('/api/admin/usage/overview').catch(() => ({
        users: [] as UsageOverviewUser[],
      })),
    ]);
    setUsers(usersRes.users);
    const map: Record<string, UsageOverviewUser> = {};
    for (const entry of overviewRes.users) {
      map[entry.userId] = entry;
    }
    setUsageByUserId(map);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openQuotaEditor = useCallback(
    (u: User) => {
      const overview = usageByUserId[u.id];
      const ov = overview?.override;
      setEditingQuotaUser(u);
      setQuotaDraft({
        mode: ov?.mode ?? 'global',
        messagesEnabled: ov ? ov.messagesEnabled : overview?.summary.messages.enabled ?? true,
        messagesLimit: ov?.messagesLimit ?? overview?.summary.messages.limit ?? 100,
        messagesPeriod: ov?.messagesPeriod ?? overview?.summary.messages.period ?? 'day',
        tokensEnabled: ov ? ov.tokensEnabled : overview?.summary.tokens.enabled ?? true,
        tokensLimit: ov?.tokensLimit ?? overview?.summary.tokens.limit ?? 250_000,
        tokensPeriod: ov?.tokensPeriod ?? overview?.summary.tokens.period ?? 'day',
      });
    },
    [usageByUserId]
  );

  useEffect(() => {
    if (initialQuotaUserId && users.length > 0) {
      const target = users.find((u) => u.id === initialQuotaUserId);
      if (target) {
        openQuotaEditor(target);
      }
      onConsumeQuotaUserId?.();
    }
  }, [initialQuotaUserId, users, openQuotaEditor, onConsumeQuotaUserId]);

  const handleUpdate = async (
    id: string,
    patch: { role?: 'admin' | 'user'; isActive?: boolean }
  ) => {
    try {
      await apiFetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await loadData();
      pushToast('User updated');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to update user', 'error');
    }
  };

  const handleRemoveAvatar = async (u: User) => {
    try {
      await apiFetch(`/api/admin/users/${u.id}/avatar`, { method: 'DELETE' });
      await loadData();
      pushToast(`Removed avatar for ${u.displayName}`);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to remove avatar', 'error');
    }
  };

  const handleSaveQuota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuotaUser) return;
    setSavingQuota(true);
    try {
      await apiFetch(`/api/admin/usage/users/${editingQuotaUser.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          mode: quotaDraft.mode,
          messagesEnabled: quotaDraft.messagesEnabled,
          messagesLimit: quotaDraft.messagesEnabled ? quotaDraft.messagesLimit : null,
          messagesPeriod: quotaDraft.messagesPeriod,
          tokensEnabled: quotaDraft.tokensEnabled,
          tokensLimit: quotaDraft.tokensEnabled ? quotaDraft.tokensLimit : null,
          tokensPeriod: quotaDraft.tokensPeriod,
        }),
      });
      await loadData();
      setEditingQuotaUser(null);
      pushToast(`Updated usage quota for ${editingQuotaUser.displayName}`);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to save quota override', 'error');
    } finally {
      setSavingQuota(false);
    }
  };

  const handleResetPeriodUsage = async (u: User) => {
    try {
      await apiFetch(`/api/admin/usage/users/${u.id}/reset`, { method: 'POST' });
      await loadData();
      pushToast(`Reset current period usage for ${u.displayName}`);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to reset usage', 'error');
    }
  };

  if (editingQuotaUser) {
    const overview = usageByUserId[editingQuotaUser.id];
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Button size="sm" variant="ghost" onClick={() => setEditingQuotaUser(null)}>
              <ArrowLeft className="w-4 h-4" />
              Users
            </Button>
            <span className="text-xs text-[var(--text-muted)]">/</span>
            <span className="text-sm font-medium text-[var(--text)] truncate">
              Quota · {editingQuotaUser.displayName}
            </span>
          </div>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => setConfirmResetUsageUser(editingQuotaUser)}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset usage
          </Button>
        </div>

        {overview && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-[var(--text-muted)]">Current UTC window messages</div>
              <div className="text-sm font-semibold text-[var(--text)] mt-0.5 tabular-nums">
                {overview.summary.messages.used.toLocaleString()}
                {overview.summary.messages.limit !== null
                  ? ` / ${overview.summary.messages.limit.toLocaleString()}`
                  : ' (unlimited)'}
              </div>
            </div>
            <div>
              <div className="text-[var(--text-muted)]">Current UTC window tokens</div>
              <div className="text-sm font-semibold text-[var(--text)] mt-0.5 tabular-nums">
                {overview.summary.tokens.used.toLocaleString()}
                {overview.summary.tokens.limit !== null
                  ? ` / ${overview.summary.tokens.limit.toLocaleString()}`
                  : ' (unlimited)'}
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSaveQuota} className="space-y-4">
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 space-y-2.5">
            <span className="block text-xs font-medium text-[var(--text-2)]">Quota policy mode</span>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'global', label: 'Use global defaults' },
                  { id: 'custom', label: 'Custom limits' },
                  { id: 'unlimited', label: 'Unlimited' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setQuotaDraft((prev) => ({ ...prev, mode: m.id }))}
                  className={`h-10 px-3 rounded-[var(--radius-md)] text-xs font-medium border transition-colors ${
                    quotaDraft.mode === m.id
                      ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)]'
                      : 'bg-[var(--surface-raised)] border-[var(--border)] text-[var(--text-2)]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {quotaDraft.mode === 'custom' && (
            <div className="space-y-4">
              <LimitSlider
                idPrefix="user-msg"
                label="Message quota"
                scale="messages"
                enabled={quotaDraft.messagesEnabled}
                limit={quotaDraft.messagesLimit}
                period={quotaDraft.messagesPeriod}
                onChange={(next) =>
                  setQuotaDraft((prev) => ({
                    ...prev,
                    messagesEnabled: next.enabled,
                    messagesLimit: next.limit,
                    messagesPeriod: next.period,
                  }))
                }
              />

              <LimitSlider
                idPrefix="user-tok"
                label="Token quota (input + output)"
                scale="tokens"
                enabled={quotaDraft.tokensEnabled}
                limit={quotaDraft.tokensLimit}
                period={quotaDraft.tokensPeriod}
                onChange={(next) =>
                  setQuotaDraft((prev) => ({
                    ...prev,
                    tokensEnabled: next.enabled,
                    tokensLimit: next.limit,
                    tokensPeriod: next.period,
                  }))
                }
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditingQuotaUser(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={savingQuota}>
              <Save className="w-3.5 h-3.5" />
              {savingQuota ? 'Saving...' : 'Save override'}
            </Button>
          </div>
        </form>

        <ConfirmDialog
          open={Boolean(confirmResetUsageUser)}
          onOpenChange={(open) => {
            if (!open) setConfirmResetUsageUser(null);
          }}
          title="Reset current period usage?"
          description={`Zero out ${confirmResetUsageUser?.displayName ?? 'this user'}'s usage counters for the current UTC window? Historical records stay intact.`}
          confirmLabel="Reset usage"
          onConfirm={async () => {
            if (!confirmResetUsageUser) return;
            const u = confirmResetUsageUser;
            setConfirmResetUsageUser(null);
            await handleResetPeriodUsage(u);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4" data-setting-row="admin-users-table">
      <p className="text-xs text-[var(--text-muted)]">
        Manage user roles, active status, uploaded avatars, and individual AI usage limits.
      </p>

      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {users.map((u) => {
              const isSelf = u.id === currentUser?.id;
              const usageInfo = usageByUserId[u.id];
              const overrideMode = usageInfo?.override?.mode ?? 'global';
              return (
                <tr key={u.id}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <UserAvatar user={u} size="sm" />
                      <div className="min-w-0">
                        <div className="font-medium text-[var(--text)] truncate">
                          {u.displayName}{' '}
                          {isSelf && (
                            <span className="text-xs text-[var(--text-muted)]">(you)</span>
                          )}
                        </div>
                        <div className="text-xs text-[var(--text-muted)] truncate">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      aria-label={`Role for ${u.email}`}
                      value={u.role}
                      onChange={(e) =>
                        void handleUpdate(u.id, { role: e.target.value as 'admin' | 'user' })
                      }
                      className="h-8 text-xs w-28"
                    >
                      <option value="admin">admin</option>
                      <option value="user">user</option>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void handleUpdate(u.id, { isActive: !u.isActive })}
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${
                        u.isActive
                          ? 'bg-[var(--surface-active)] border-[var(--border-strong)] text-[var(--text)]'
                          : 'bg-[var(--status-error-soft)] border-[var(--status-error)]/30 text-[var(--status-error)]'
                      }`}
                    >
                      {u.isActive ? 'Active' : 'Disabled'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openQuotaEditor(u)}
                        title="Usage quota override"
                      >
                        <Gauge className="w-3.5 h-3.5" />
                        <span>{overrideMode === 'global' ? 'Quota' : overrideMode}</span>
                      </Button>
                      {u.hasAvatar && (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Remove avatar for ${u.displayName}`}
                          onClick={() => setConfirmRemoveAvatarUser(u)}
                          className="text-[var(--status-error)] hover:bg-[var(--status-error-soft)]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={Boolean(confirmRemoveAvatarUser)}
        onOpenChange={(open) => {
          if (!open) setConfirmRemoveAvatarUser(null);
        }}
        title="Remove user photo?"
        description={`Remove the uploaded profile picture for "${confirmRemoveAvatarUser?.displayName ?? ''}" (${confirmRemoveAvatarUser?.email ?? ''})?`}
        confirmLabel="Remove photo"
        onConfirm={async () => {
          if (!confirmRemoveAvatarUser) return;
          const target = confirmRemoveAvatarUser;
          setConfirmRemoveAvatarUser(null);
          await handleRemoveAvatar(target);
        }}
      />
    </div>
  );
};
