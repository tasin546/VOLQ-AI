import React, { useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Loader2, Trash2 } from 'lucide-react';
import { useChatStore } from '../../stores/chatStore';
import { useUiStore } from '../../stores/uiStore';
import { Button } from './Primitives';

export const DeleteChatDialog: React.FC = () => {
  const target = useChatStore((s) => s.deleteConfirmChat);
  const requestDeleteChat = useChatStore((s) => s.requestDeleteChat);
  const deleteChat = useChatStore((s) => s.deleteChat);
  const requestComposerFocus = useChatStore((s) => s.requestComposerFocus);
  const pushToast = useUiStore((s) => s.pushToast);

  const [deleting, setDeleting] = useState(false);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  const handleConfirm = async () => {
    if (!target || deleting) return;
    setDeleting(true);
    try {
      const wasActive = useChatStore.getState().activeChat?.id === target.id;
      await deleteChat(target.id);
      requestDeleteChat(null);
      if (wasActive) {
        requestComposerFocus();
      }
      pushToast('Chat deleted');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to delete chat', 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog.Root
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open && !deleting) {
          requestDeleteChat(null);
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[70] bg-[var(--scrim-bg)] backdrop-blur-[4px]" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            cancelBtnRef.current?.focus();
          }}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[71] w-[calc(100vw-2rem)] max-w-md rounded-[var(--radius-xl)] liquid-glass-strong p-6 shadow-[var(--shadow)] outline-none space-y-4"
        >
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-full bg-[var(--status-error-soft)] border border-[var(--status-error)]/30 flex items-center justify-center text-[var(--status-error)] shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <Dialog.Title className="text-base font-semibold text-[var(--text)]">
                Delete this chat?
              </Dialog.Title>
              <p className="text-xs font-medium text-[var(--text)] truncate">
                &ldquo;{target?.title ?? 'Untitled chat'}&rdquo;
              </p>
              <Dialog.Description className="text-xs text-[var(--text-muted)] leading-relaxed pt-0.5">
                This permanently deletes the conversation and its messages. This can&rsquo;t be undone.
              </Dialog.Description>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <Button
              ref={cancelBtnRef}
              variant="ghost"
              disabled={deleting}
              onClick={() => requestDeleteChat(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={() => void handleConfirm()}
            >
              {deleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
