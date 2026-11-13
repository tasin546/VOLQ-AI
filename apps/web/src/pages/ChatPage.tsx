import React, { useMemo, useState } from 'react';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import { Composer } from '../components/chat/Composer';
import { EmptyStateHeader, StarterPromptChips } from '../components/chat/EmptyState';
import { MessageList } from '../components/chat/MessageList';
import { ModelPicker } from '../components/chat/ModelPicker';
import { TopBar } from '../components/chat/TopBar';
import { Button, IconButton } from '../components/ui/Primitives';
import { useChatStore } from '../stores/chatStore';
import { useUiStore } from '../stores/uiStore';

function formatResetShort(iso: string | null | undefined): string {
  if (!iso) return 'next UTC window';
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export const ChatPage: React.FC = () => {
  const {
    activeChat,
    messages,
    models,
    starterPrompts,
    streamError,
    clearStreamError,
    retryLastFailedSend,
  } = useChatStore();
  const usageSummary = useUiStore((s) => s.usageSummary);
  const [draft, setDraft] = useState('');

  const limitNotice = useMemo(() => {
    if (!usageSummary || usageSummary.exempt) return null;
    if (usageSummary.blockedMeter) {
      const meter = usageSummary.blockedMeter;
      const status = meter === 'messages' ? usageSummary.messages : usageSummary.tokens;
      return {
        blocked: true,
        warning: false,
        message: `${meter === 'messages' ? 'Message' : 'Token'} limit reached (${status.used.toLocaleString()} / ${(status.limit ?? 0).toLocaleString()}). Resets ${formatResetShort(usageSummary.resetsAt ?? status.resetsAt)}.`,
      };
    }
    const candidates = [
      { key: 'messages' as const, meter: usageSummary.messages },
      { key: 'tokens' as const, meter: usageSummary.tokens },
    ]
      .filter((item) => item.meter.enabled && item.meter.limit && item.meter.limit > 0)
      .map((item) => ({
        ...item,
        ratio: item.meter.used / (item.meter.limit as number),
      }))
      .filter((item) => item.ratio >= 0.8)
      .sort((a, b) => b.ratio - a.ratio);

    const highest = candidates[0];
    if (!highest) return null;
    const pct = Math.min(99, Math.round(highest.ratio * 100));
    return {
      blocked: false,
      warning: true,
      message: `Approaching ${highest.key} limit (${pct}% used · ${highest.meter.used.toLocaleString()} / ${(highest.meter.limit ?? 0).toLocaleString()}). Resets ${formatResetShort(highest.meter.resetsAt)}.`,
    };
  }, [usageSummary]);

  const isEmpty = !activeChat || messages.length === 0;

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
      <TopBar />
      <ModelPicker />

      {isEmpty ? (
        <main className="flex-1 overflow-y-auto flex flex-col items-center justify-center py-6">
          <div className="w-full flex flex-col items-center">
            <EmptyStateHeader hasModels={models.length > 0} />
            {streamError && !streamError.chatId && (
              <div className="w-full max-w-[760px] mx-auto px-3 sm:px-4 mb-3">
                <div
                  role="alert"
                  className="rounded-[var(--radius-lg)] border border-[var(--status-error)]/35 bg-[var(--status-error-soft)] p-3.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-[var(--status-error)] shrink-0" />
                    <span className="text-xs text-[var(--text)] truncate">{streamError.message}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button size="sm" variant="primary" onClick={() => void retryLastFailedSend()}>
                      <RotateCcw className="w-3.5 h-3.5" />
                      Retry
                    </Button>
                    <IconButton size="sm" aria-label="Dismiss error" onClick={clearStreamError}>
                      <X className="w-3.5 h-3.5" />
                    </IconButton>
                  </div>
                </div>
              </div>
            )}
            <Composer
              externalDraft={draft}
              onExternalDraftConsumed={() => setDraft('')}
              limitNotice={limitNotice}
            />
            <StarterPromptChips
              prompts={starterPrompts}
              onSelect={(promptText) => setDraft(promptText)}
            />
          </div>
        </main>
      ) : (
        <main className="flex-1 min-h-0 flex flex-col">
          <MessageList />
          <div className="shrink-0 pt-2">
            <Composer
              externalDraft={draft}
              onExternalDraftConsumed={() => setDraft('')}
              limitNotice={limitNotice}
            />
          </div>
        </main>
      )}
    </div>
  );
};
