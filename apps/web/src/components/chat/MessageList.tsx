import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowDown, RotateCcw, X } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { Button, IconButton } from '../ui/Primitives';
import { MessageItem } from './MessageItem';

export const MessageList: React.FC = () => {
  const messages = useChatStore((s) => s.messages);
  const activeChat = useChatStore((s) => s.activeChat);
  const streamError = useChatStore((s) => s.streamError);
  const clearStreamError = useChatStore((s) => s.clearStreamError);
  const retryLastFailedSend = useChatStore((s) => s.retryLastFailedSend);

  const containerRef = useRef<HTMLDivElement>(null);
  const shouldAutoFollowRef = useRef(true);
  const [showJumpButton, setShowJumpButton] = useState(false);

  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;
  const lastContentLength = messages[messages.length - 1]?.content.length ?? 0;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    shouldAutoFollowRef.current = true;
    setShowJumpButton(false);
  }, []);

  // Reset auto-follow when switching conversations
  useEffect(() => {
    shouldAutoFollowRef.current = true;
    setShowJumpButton(false);
    scrollToBottom('auto');
  }, [activeChat?.id, scrollToBottom]);

  // Auto-follow only while user stays near bottom
  useEffect(() => {
    if (!shouldAutoFollowRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'auto' });
  }, [messages.length, lastContentLength]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 80;
    shouldAutoFollowRef.current = nearBottom;
    setShowJumpButton(!nearBottom);
  };

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-6 pt-3 pb-8"
      >
        <div className="w-full max-w-[760px] mx-auto space-y-6">
          {messages.map((msg) => (
            <MessageItem
              key={msg.id}
              message={msg}
              isLastAssistant={msg.id === lastAssistantId}
            />
          ))}

          {streamError && (!streamError.chatId || streamError.chatId === activeChat?.id) && (
            <div
              role="alert"
              className="rounded-[var(--radius-lg)] border border-[var(--status-error)]/35 bg-[var(--status-error-soft)] p-4 flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <AlertTriangle className="w-4 h-4 text-[var(--status-error)] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--status-error)]">
                    Response failed
                  </div>
                  <p className="text-xs text-[var(--text)] mt-0.5">{streamError.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button size="sm" variant="primary" onClick={() => void retryLastFailedSend()}>
                  <RotateCcw className="w-3.5 h-3.5" />
                  Retry
                </Button>
                <IconButton
                  size="sm"
                  aria-label="Dismiss error"
                  onClick={clearStreamError}
                >
                  <X className="w-3.5 h-3.5" />
                </IconButton>
              </div>
            </div>
          )}
        </div>
      </div>

      {showJumpButton && (
        <div className="pointer-events-none absolute bottom-3 inset-x-0 flex justify-center z-20">
          <button
            type="button"
            onClick={() => scrollToBottom('smooth')}
            className="pointer-events-auto inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full liquid-glass-strong text-xs font-medium text-[var(--text)] shadow-[var(--shadow-sm)] hover:bg-[var(--surface-active)] transition-colors"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            Jump to latest
          </button>
        </div>
      )}
    </div>
  );
};
