import React, { useCallback, useEffect, useState } from 'react';
import { Activity, Database, HardDrive, RefreshCw } from 'lucide-react';
import { Button } from '../../../ui/Primitives';
import { apiFetch } from '../../../../lib/api';
import type { SystemInfo } from '../../../../lib/types';
import { useChatStore } from '../../../../stores/chatStore';
import { useUiStore } from '../../../../stores/uiStore';

function formatBytes(bytes: number | null): string {
  if (bytes === null) return 'In-memory / managed';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const SystemSettingsSection: React.FC = () => {
  const pushToast = useUiStore((s) => s.pushToast);
  const refreshModels = useChatStore((s) => s.refreshModels);
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [healthStatus, setHealthStatus] = useState<string>('checking...');
  const [refreshing, setRefreshing] = useState(false);

  const loadSystem = useCallback(async () => {
    const [sysRes, healthRes] = await Promise.all([
      apiFetch<SystemInfo>('/api/admin/system'),
      apiFetch<{ status: string; driver: string }>('/healthz').catch(() => ({
        status: 'error',
        driver: 'unknown',
      })),
    ]);
    setInfo(sysRes);
    setHealthStatus(healthRes.status === 'ok' ? 'Healthy' : 'Degraded');
  }, []);

  useEffect(() => {
    void loadSystem();
  }, [loadSystem]);

  const handleRefreshCatalog = async () => {
    setRefreshing(true);
    try {
      await refreshModels();
      await loadSystem();
      pushToast('Model catalog refreshed');
    } catch {
      pushToast('Failed to refresh models', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-5" data-setting-row="admin-system-stats">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--text-muted)]">
          Database driver, health checks, and storage metrics. Connection strings stay server-side.
        </p>

        <Button
          size="sm"
          variant="secondary"
          disabled={refreshing}
          onClick={() => void handleRefreshCatalog()}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Sync all models
        </Button>
      </div>

      {!info ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 space-y-3">
          <div className="h-4 w-40 rounded bg-[var(--surface-hover)] animate-pulse" />
          <div className="h-4 w-64 rounded bg-[var(--surface-raised)] animate-pulse" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 space-y-1">
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <Database className="w-3.5 h-3.5" />
                Database driver
              </div>
              <div className="text-lg font-semibold font-mono uppercase text-[var(--text)]">
                {info.driver}
              </div>
              <div className="text-xs text-[var(--text-2)]">
                pgvector: {info.pgvector ? 'Enabled' : 'Fallback FTS'}
              </div>
            </div>

            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 space-y-1">
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <Activity className="w-3.5 h-3.5" />
                Connection &amp; health
              </div>
              <div className="text-lg font-semibold text-[var(--text)]">
                {info.connected ? 'Connected' : 'Disconnected'}
              </div>
              <div className="text-xs text-[var(--text-2)]">
                /healthz: {healthStatus} · v{info.version}
              </div>
            </div>

            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 space-y-1">
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <HardDrive className="w-3.5 h-3.5" />
                Storage usage
              </div>
              <div className="text-lg font-semibold text-[var(--text)]">
                {formatBytes(info.storageBytes.databaseBytes)}
              </div>
              <div className="text-xs text-[var(--text-2)]">
                Knowledge binaries: {formatBytes(info.storageBytes.knowledgeFilesBytes)}
              </div>
            </div>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">
            <h3 className="text-sm font-medium text-[var(--text)] mb-3">Stored records</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {Object.entries(info.counts).map(([label, val]) => (
                <div
                  key={label}
                  className="p-3 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)]"
                >
                  <div className="text-[var(--text-muted)] capitalize">
                    {label.replace(/([A-Z])/g, ' $1')}
                  </div>
                  <div className="text-base font-semibold font-mono text-[var(--text)] mt-0.5 tabular-nums">
                    {val}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
