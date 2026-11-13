import React, { useMemo, useState } from 'react';
import { Cloud, Cpu, HardDrive, MessageSquarePlus, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { GlassButton, GlassPanel } from '../components/ui/Glass';
import type { DiscoveredModel } from '../lib/types';
import { useChatStore } from '../stores/chatStore';
import { useUiStore } from '../stores/uiStore';

export const ModelsPage: React.FC = () => {
  const navigate = useNavigate();
  const { models, refreshModels, setSelectedModel, startNewChat } = useChatStore();
  const pushToast = useUiStore((s) => s.pushToast);
  const [refreshing, setRefreshing] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      { connectionName: string; isLocal: boolean; items: DiscoveredModel[] }
    >();
    for (const m of models) {
      const existing = map.get(m.connectionId);
      if (existing) {
        existing.items.push(m);
      } else {
        map.set(m.connectionId, {
          connectionName: m.connectionName,
          isLocal: m.isLocal,
          items: [m],
        });
      }
    }
    return Array.from(map.entries());
  }, [models]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const errors = await refreshModels();
      if (errors.length > 0) {
        pushToast(`Warning: ${errors[0]!.connectionName}: ${errors[0]!.error}`, 'error');
      } else {
        pushToast('Model catalog updated');
      }
    } catch {
      pushToast('Failed to refresh models', 'error');
    } finally {
      setRefreshing(false);
    }
  };

  const handleUseModel = async (model: DiscoveredModel) => {
    startNewChat();
    await setSelectedModel({ connectionId: model.connectionId, modelId: model.id });
    navigate('/');
  };

  return (
    <main className="flex-1 overflow-y-auto px-4 sm:px-8 pt-16 lg:pt-8 pb-10">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-[14px] liquid-glass flex items-center justify-center">
              <Cpu className="w-5 h-5 text-[var(--text-primary)]" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Models</h1>
              <p className="text-sm text-[var(--text-secondary)]">
                Available models across enabled Ollama and OpenAI-compatible connections.
              </p>
            </div>
          </div>

          <GlassButton onClick={() => void handleRefresh()} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </GlassButton>
        </div>

        {grouped.length === 0 ? (
          <GlassPanel className="p-8 text-center text-sm text-[var(--text-muted)]">
            No models available. Ask an administrator to configure connections and model visibility.
          </GlassPanel>
        ) : (
          <div className="space-y-4">
            {grouped.map(([connId, group]) => (
              <GlassPanel key={connId} strong className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">{group.connectionName}</h2>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono bg-[var(--glass-fill)] border border-[var(--border-hairline)] text-[var(--text-secondary)]">
                    {group.isLocal ? (
                      <>
                        <HardDrive className="w-3.5 h-3.5" />
                        Local
                      </>
                    ) : (
                      <>
                        <Cloud className="w-3.5 h-3.5" />
                        Hosted
                      </>
                    )}
                  </span>
                </div>

                <div className="divide-y divide-[var(--border-hairline)]">
                  {group.items.map((model) => (
                    <div
                      key={`${model.connectionId}:${model.id}`}
                      className="py-2.5 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{model.name}</div>
                        {model.description && (
                          <div className="text-xs text-[var(--text-muted)] truncate">
                            {model.description}
                          </div>
                        )}
                      </div>
                      <GlassButton
                        size="sm"
                        onClick={() => void handleUseModel(model)}
                        className="shrink-0"
                      >
                        <MessageSquarePlus className="w-3.5 h-3.5" />
                        Chat
                      </GlassButton>
                    </div>
                  ))}
                </div>
              </GlassPanel>
            ))}
          </div>
        )}
      </div>
    </main>
  );
};
