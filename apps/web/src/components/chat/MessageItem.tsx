import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { BookOpen, Check, Copy, Pencil, RotateCcw, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import type { Message } from '../../lib/types';
import { useChatStore } from '../../stores/chatStore';
import { useUiStore } from '../../stores/uiStore';
import { resolveModelDisplayName } from '../../lib/modelResolver';
import { Badge, Button } from '../ui/Primitives';

const MarkdownContent = lazy(() => import('./MarkdownContent'));

interface MessageItemProps {
  message: Message;
  isLastAssistant: boolean;
}

const MessageItemInner: React.FC<MessageItemProps> = ({ message, isLastAssistant }) => {
  const {
    models,
    isStreaming,
    editingMessageId,
    setEditingMessageId,
    regenerateLastResponse,
    editAndResendMessage,
    deleteMessage,
  } = useChatStore();
  const pushToast = useUiStore((s) => s.pushToast);

  const modelDisplayName = resolveModelDisplayName(
    models,
    message.connectionId,
    message.modelId
  );

  const [copied, setCopied] = useState(false);
  const [editText, setEditText] = useState(message.content);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const editing = editingMessageId === message.id;

  const handleToggleSpeech = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      pushToast('Text-to-speech is not supported in this browser', 'error');
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();

    const cleanText = message.content
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/[#*_~>]/g, '')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (editing) {
      setEditText(message.content);
      setTimeout(() => {
        editRef.current?.focus();
        const len = editRef.current?.value.length ?? 0;
        editRef.current?.setSelectionRange(len, len);
      }, 10);
    }
  }, [editing, message.content]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      pushToast('Failed to copy message', 'error');
    }
  };

  const handleSaveEdit = async () => {
    const trimmed = editText.trim();
    if (!trimmed) return;
    setEditingMessageId(null);
    try {
      await editAndResendMessage(message.id, trimmed);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to resend message', 'error');
    }
  };

  if (message.role === 'user') {
    return (
      <div className="group flex flex-col items-end gap-1.5">
        {editing ? (
          <div className="w-full max-w-[88%] sm:max-w-[76%] rounded-[var(--radius-lg)] liquid-glass-strong p-3.5 space-y-2.5">
            <textarea
              ref={editRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setEditingMessageId(null);
                } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  void handleSaveEdit();
                }
              }}
              rows={3}
              aria-label="Edit message"
              className="w-full bg-transparent text-base md:text-sm text-[var(--text)] outline-none resize-y"
            />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditingMessageId(null)}>
                <X className="w-3.5 h-3.5" />
                Cancel
              </Button>
              <Button size="sm" variant="primary" onClick={() => void handleSaveEdit()}>
                Save &amp; Resend
              </Button>
            </div>
          </div>
        ) : (
          <div className="max-w-[85%] sm:max-w-[72%] rounded-[var(--radius-lg)] px-4 py-2.5 bg-[var(--user-bubble-bg)] border border-[var(--border)] text-[var(--text)]">
            {message.images.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {message.images.map((img, i) => (
                  <img
                    key={i}
                    src={`data:${img.mimeType};base64,${img.dataBase64}`}
                    alt={`Attachment ${i + 1}`}
                    className="max-h-40 rounded-[var(--radius-md)] border border-[var(--border)] object-cover"
                  />
                ))}
              </div>
            )}
            <div className="whitespace-pre-wrap break-words text-[15px]">{message.content}</div>
          </div>
        )}

        {!editing && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity duration-150">
            <button
              type="button"
              onClick={() => void handleCopy()}
              aria-label="Copy message"
              title="Copy"
              className="p-2 rounded-[var(--radius-sm)] text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              disabled={isStreaming}
              onClick={() => setEditingMessageId(message.id)}
              aria-label="Edit and resend message"
              title="Edit & resend"
              className="p-2 rounded-[var(--radius-sm)] text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-40"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={isStreaming}
              onClick={() => void deleteMessage(message.id)}
              aria-label="Delete message"
              title="Delete"
              className="p-2 rounded-[var(--radius-sm)] text-[var(--text-subtle)] hover:text-[var(--status-error)] hover:bg-[var(--status-error-soft)] disabled:opacity-40"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    );
  }

  const sources = message.sources ?? [];

  return (
    <article className="group w-full space-y-2">
      <div className="flex items-center gap-2 text-[12px] text-[var(--text-subtle)]">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--text)]" aria-hidden="true" />
        <span className="font-medium text-[var(--text)]">{modelDisplayName}</span>
        {message.status === 'stopped' && <Badge>Stopped</Badge>}
      </div>

      <div className="volq-markdown">
        <Suspense
          fallback={<div className="whitespace-pre-wrap text-[15px]">{message.content}</div>}
        >
          <MarkdownContent
            content={message.content || ''}
            isStreaming={message.status === 'streaming'}
          />
        </Suspense>
        {message.status === 'streaming' && <span className="volq-caret" aria-hidden="true" />}
      </div>

      {sources.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {sources.map((src) => (
            <Badge key={src.knowledgeBaseName} className="gap-1.5 py-1">
              <BookOpen className="w-3 h-3 text-[var(--text)]" />
              <span>Uses knowledge: {src.knowledgeBaseName}</span>
            </Badge>
          ))}
        </div>
      )}

      {message.status !== 'streaming' && (
        <div className="flex items-center gap-1 pt-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity duration-150">
          <button
            type="button"
            onClick={() => void handleCopy()}
            aria-label="Copy assistant response"
            title="Copy"
            className="p-2 rounded-[var(--radius-sm)] text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            type="button"
            onClick={handleToggleSpeech}
            aria-label={isSpeaking ? 'Stop reading aloud' : 'Read aloud'}
            title={isSpeaking ? 'Stop reading' : 'Read aloud'}
            className={`p-2 rounded-[var(--radius-sm)] transition-colors ${
              isSpeaking
                ? 'text-[var(--accent)] bg-[var(--surface-active)] animate-pulse'
                : 'text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
          {isLastAssistant && (
            <button
              type="button"
              disabled={isStreaming}
              onClick={() => void regenerateLastResponse()}
              aria-label="Regenerate response"
              title="Regenerate"
              className="p-2 rounded-[var(--radius-sm)] text-[var(--text-subtle)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-40"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            disabled={isStreaming}
            onClick={() => void deleteMessage(message.id)}
            aria-label="Delete response"
            title="Delete"
            className="p-2 rounded-[var(--radius-sm)] text-[var(--text-subtle)] hover:text-[var(--status-error)] hover:bg-[var(--status-error-soft)] disabled:opacity-40"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </article>
  );
};

export const MessageItem = React.memo(MessageItemInner);
