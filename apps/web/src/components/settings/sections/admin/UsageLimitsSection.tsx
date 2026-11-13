import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Pencil, RotateCcw, Search } from 'lucide-react';
import { LimitSlider } from '../../../ui/LimitSlider';
import { Button, ConfirmDialog, Input, Switch } from '../../../ui/Primitives';
import { UserAvatar } from '../../../ui/UserAvatar';
import { apiFetch } from '../../../../lib/api';
import type { UsageLimitsPolicy, UsageOverviewUser } from '../../../../lib/types';
import { useUiStore } from '../../../../stores/uiStore';
import type { AdminDirtyState } from '../../SettingsSearchIndex';

export const UsageLimitsSection: React.FC<{
  onDirtyStateChange?: (state: AdminDirtyState | null) => void;
  onEditUserQuota?: (userId: string) => void;
}> = ({ onDirtyStateChange, onEditUserQuota }) => {
  const pushToast = useUiStore((s) => s.pushToast);
  const fetchUsageSummary = useUiStore((s) => s.fetchUsageSummary);

  const [policy, setPolicy] = useState<UsageLimitsPolicy>({
    messagesEnabled: false,
    messagesLimit: 100,
    messagesPeriod: 'day',
    tokensEnabled: false,
    tokensLimit: 250_000,
    tokensPeriod: 'day',
    applyToAdmins: false,
  });
  const [initialPolicy, setInitialPolicy] = useState<UsageLimitsPolicy | null>(null);
  const [users, setUsers] = useState<UsageOverviewUser[]>([]);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'usage' | 'name'>('usage');
  const [saving, setSaving] = useState(false);
  const [confirmResetUser, setConfirmResetUser] = useState<UsageOverviewUser | null>(null);

  const loadOverview = useCallback(async () => {
    const res = await apiFetch<{ policy: UsageLimitsPolicy; users: UsageOverviewUser[] }>(
      '/api/admin/usage/overview'
    );
    setPolicy(res.policy);
    setInitialPolicy(res.policy);
    setUsers(res.users);
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const isDirty = Boolean(
    initialPolicy && JSON.stringify(policy) !== JSON.stringify(initialPolicy)
  );

  const handleSavePolicy = useCallback(async () => {
    setSaving(true);
    try {
      await apiFetch('/api/admin/usage/policy', {
        method: 'PUT',
        body: JSON.stringify(policy),
      });
      await loadOverview();
      await fetchUsageSummary();
      pushToast('Global usage limits saved');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to save usage limits', 'error');
    } finally {
      setSaving(false);
    }
  }, [policy, loadOverview, fetchUsageSummary, pushToast]);

  const handleResetPolicy = useCallback(() => {
    if (initialPolicy) {
      setPolicy(initialPolicy);
    }
  }, [initialPolicy]);

  useEffect(() => {
    if (!onDirtyStateChange) return;
    if (isDirty) {
      onDirtyStateChange({
        dirty: true,
        saving,
        label: 'Unsaved usage limit policy changes',
        onSave: handleSavePolicy,
        onReset: handleResetPolicy,
      });
    } else {
      onDirtyStateChange(null);
    }
    return () => onDirtyStateChange(null);
  }, [isDirty, saving, handleSavePolicy, handleResetPolicy, onDirtyStateChange]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = users.filter(
      (u) => !q || u.displayName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
    return [...list].sort((a, b) => {
      if (sortBy === 'name') {
        return a.displayName.localeCompare(b.displayName);
      }
      const aPct = Math.max(
        a.summary.messages.limit ? a.summary.messages.used / a.summary.messages.limit : 0,
        a.summary.tokens.limit ? a.summary.tokens.used / a.summary.tokens.limit : 0
      );
      const bPct = Math.max(
        b.summary.messages.limit ? b.summary.messages.used / b.summary.messages.limit : 0,
        b.summary.tokens.limit ? b.summary.tokens.used / b.summary.tokens.limit : 0
      );
      if (bPct !== aPct) return bPct - aPct;
      return b.summary.tokens.used - a.summary.tokens.used;
    });
  }, [users, search, sortBy]);

  return (
    <div className="space-y-6">
      <div className="space-y-4" data-setting-row="admin-usage-policy">
        <LimitSlider
          idPrefix="global-msg"
          label="Global message limit"
          description="Maximum assistant replies generated per user in the selected UTC window."
          scale="messages"
          enabled={policy.messagesEnabled}
          limit={policy.messagesLimit}
          period={policy.messagesPeriod}
          onChange={(next) =>
            setPolicy((prev) => ({
              ...prev,
              messagesEnabled: next.enabled,
              messagesLimit: next.limit,
              messagesPeriod: next.period,
            }))
          }
        />

        <LimitSlider
          idPrefix="global-tok"
          label="Global token limit (input + output)"
          description="Provider-reported token counts when returned, or character/4 estimation when omitted."
          scale="tokens"
          enabled={policy.tokensEnabled}
          limit={policy.tokensLimit}
          period={policy.tokensPeriod}
          onChange={(next) =>
            setPolicy((prev) => ({
              ...prev,
              tokensEnabled: next.enabled,
              tokensLimit: next.limit,
              tokensPeriod: next.period,
            }))
          }
        />

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 flex items-center justify-between gap-4">
          <div>
            <label htmlFor="apply-admins-toggle" className="text-sm font-medium text-[var(--text)] block">
              Apply limits to administrators
            </label>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Off by default so admin testing and setup are never interrupted.
            </p>
          </div>
          <Switch
            id="apply-admins-toggle"
            checked={policy.applyToAdmins}
            onCheckedChange={(val) => setPolicy((prev) => ({ ...prev, applyToAdmins: val }))}
          />
        </div>
      </div>

      {/* Overview Table */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium text-[var(--text)]">Member usage overview</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Amber at 80%+ usage, red at 100%. Adjust individual limits or reset period usage.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-44">
              <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter users..."
                className="pl-9 h-9 text-xs"
              />
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setSortBy((s) => (s === 'usage' ? 'name' : 'usage'))}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              {sortBy === 'usage' ? 'Sort: Usage' : 'Sort: Name'}
            </Button>
          </div>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[var(--border)] uppercase tracking-wider text-[var(--text-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Messages</th>
                <th className="px-4 py-3 font-medium">Tokens</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filteredUsers.map((u) => {
                const msgRatio =
                  u.summary.messages.enabled && u.summary.messages.limit
                    ? Math.min(1, u.summary.messages.used / u.summary.messages.limit)
                    : 0;
                const tokRatio =
                  u.summary.tokens.enabled && u.summary.tokens.limit
                    ? Math.min(1, u.summary.tokens.used / u.summary.tokens.limit)
                    : 0;
                const msgTone =
                  msgRatio >= 1
                    ? 'bg-[var(--status-error)]'
                    : msgRatio >= 0.8
                      ? 'bg-[var(--status-warning)]'
                      : 'bg-[var(--accent)]';
                const tokTone =
                  tokRatio >= 1
                    ? 'bg-[var(--status-error)]'
                    : tokRatio >= 0.8
                      ? 'bg-[var(--status-warning)]'
                      : 'bg-[var(--accent)]';

                return (
                  <tr key={u.userId}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <UserAvatar
                          user={{
                            id: u.userId,
                            displayName: u.displayName,
                            hasAvatar: u.hasAvatar,
                            avatarVersion: u.avatarVersion,
                          }}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-sm text-[var(--text)] truncate">
                            {u.displayName}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] truncate">
                            {u.role} · {u.summary.mode}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3 min-w-[140px]">
                      <div className="tabular-nums text-[var(--text)] mb-1">
                        {u.summary.messages.used.toLocaleString()}
                        {u.summary.messages.limit !== null
                          ? ` / ${u.summary.messages.limit.toLocaleString()}`
                          : ' / ∞'}
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${msgTone}`}
                          style={{ width: `${Math.round(msgRatio * 100)}%` }}
                        />
                      </div>
                    </td>

                    <td className="px-4 py-3 min-w-[150px]">
                      <div className="tabular-nums text-[var(--text)] mb-1">
                        {u.summary.tokens.used.toLocaleString()}
                        {u.summary.tokens.limit !== null
                          ? ` / ${u.summary.tokens.limit.toLocaleString()}`
                          : ' / ∞'}
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${tokTone}`}
                          style={{ width: `${Math.round(tokRatio * 100)}%` }}
                        />
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {onEditUserQuota && (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Edit quota for ${u.displayName}`}
                            onClick={() => onEditUserQuota(u.userId)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Reset usage for ${u.displayName}`}
                          onClick={() => setConfirmResetUser(u)}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(confirmResetUser)}
        onOpenChange={(open) => {
          if (!open) setConfirmResetUser(null);
        }}
        title="Reset period usage?"
        description={`Clear ${confirmResetUser?.displayName ?? 'this user'}'s usage counters for the current UTC window?`}
        confirmLabel="Reset usage"
        onConfirm={async () => {
          if (!confirmResetUser) return;
          const target = confirmResetUser;
          setConfirmResetUser(null);
          await apiFetch(`/api/admin/usage/users/${target.userId}/reset`, { method: 'POST' });
          await loadOverview();
          await fetchUsageSummary();
          pushToast(`Reset current usage for ${target.displayName}`);
        }}
      />
    </div>
  );
};
