import React, { useEffect } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '../../ui/Primitives';
import { useUiStore } from '../../../stores/uiStore';

function formatResetCountdown(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return 'Resetting soon';
  const totalMins = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;
  if (days > 0) return `Resets in ${days}d ${hours}h (UTC)`;
  if (hours > 0) return `Resets in ${hours}h ${mins}m (UTC)`;
  return `Resets in ${mins}m (UTC)`;
}

const MeterCard: React.FC<{
  title: string;
  used: number;
  limit: number | null;
  enabled: boolean;
  period: string;
  resetsAt: string;
  unitLabel: string;
}> = ({ title, used, limit, enabled, period, resetsAt, unitLabel }) => {
  const ratio = enabled && limit && limit > 0 ? Math.min(1, used / limit) : 0;
  const pct = Math.round(ratio * 100);
  const barTone =
    pct >= 100
      ? 'bg-[var(--status-error)]'
      : pct >= 80
        ? 'bg-[var(--status-warning)]'
        : 'bg-[var(--accent)]';

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium text-[var(--text)]">{title}</h3>
          <p className="text-xs text-[var(--text-muted)]">
            {enabled && limit !== null
              ? `UTC ${period}ly allowance · ${formatResetCountdown(resetsAt)}`
              : 'Unlimited allowance on your account'}
          </p>
        </div>
        <div className="text-sm font-semibold text-[var(--text)] tabular-nums">
          {enabled && limit !== null
            ? `${used.toLocaleString()} / ${limit.toLocaleString()} ${unitLabel}`
            : `${used.toLocaleString()} ${unitLabel} used`}
        </div>
      </div>

      {enabled && limit !== null ? (
        <div className="space-y-1.5">
          <div className="h-2 rounded-full bg-[var(--surface-3)] overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barTone}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)] tabular-nums">
            <span>{pct}% used</span>
            <span>{Math.max(0, limit - used).toLocaleString()} remaining</span>
          </div>
        </div>
      ) : (
        <div className="h-2 rounded-full bg-[var(--surface-2)]" />
      )}
    </div>
  );
};

export const UsageSection: React.FC = () => {
  const usageSummary = useUiStore((s) => s.usageSummary);
  const fetchUsageSummary = useUiStore((s) => s.fetchUsageSummary);

  useEffect(() => {
    void fetchUsageSummary();
  }, [fetchUsageSummary]);

  return (
    <div className="space-y-4" data-setting-row="usage-meters">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-muted)]">
          Quotas track completed and stopped assistant replies across UTC calendar windows.
        </p>
        <Button size="sm" variant="ghost" onClick={() => void fetchUsageSummary()}>
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </Button>
      </div>

      {!usageSummary ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 text-sm text-[var(--text-muted)]">
          Loading usage summary...
        </div>
      ) : (
        <>
          {usageSummary.exempt && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 flex items-center gap-3 text-sm text-[var(--text-2)]">
              <ShieldCheck className="w-4 h-4 text-[var(--text)] shrink-0" />
              <span>
                Your account currently has unlimited AI usage ({usageSummary.mode === 'unlimited' ? 'unlimited override' : 'administrator exemption'}).
              </span>
            </div>
          )}

          <MeterCard
            title="Messages"
            used={usageSummary.messages.used}
            limit={usageSummary.messages.limit}
            enabled={usageSummary.messages.enabled}
            period={usageSummary.messages.period}
            resetsAt={usageSummary.messages.resetsAt}
            unitLabel="messages"
          />

          <MeterCard
            title="Tokens (input + output)"
            used={usageSummary.tokens.used}
            limit={usageSummary.tokens.limit}
            enabled={usageSummary.tokens.enabled}
            period={usageSummary.tokens.period}
            resetsAt={usageSummary.tokens.resetsAt}
            unitLabel="tokens"
          />
        </>
      )}
    </div>
  );
};
