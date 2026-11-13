import React, { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { AnimatePresence } from 'framer-motion';
import { MessageSquare, Pin } from 'lucide-react';
import type { Chat } from '../../lib/types';
import { getZonedDateGroup, resolveUserTimezone } from '../../lib/timezone';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { useUiStore } from '../../stores/uiStore';
import { Skeleton } from '../ui/Primitives';
import { SidebarChatRow } from './SidebarChatRow';

type FlatVirtualItem =
  | { type: 'header'; id: string; label: string }
  | { type: 'chat'; id: string; chat: Chat; groupLabel: string; chatIndex: number };

function buildGroupedItems(
  chats: Chat[],
  pinnedOnly: boolean,
  timeZone: string
): FlatVirtualItem[] {
  const source = pinnedOnly ? chats.filter((c) => c.isPinned) : chats;
  const pinned: Chat[] = [];
  const today: Chat[] = [];
  const yesterday: Chat[] = [];
  const prev7: Chat[] = [];
  const older: Chat[] = [];

  const now = new Date();

  for (const chat of source) {
    if (chat.isPinned) {
      pinned.push(chat);
      continue;
    }
    const group = getZonedDateGroup(new Date(chat.updatedAt), timeZone, now);
    if (group === 'today') today.push(chat);
    else if (group === 'yesterday') yesterday.push(chat);
    else if (group === 'previous_7_days') prev7.push(chat);
    else older.push(chat);
  }

  const groups = [
    { label: 'Pinned', items: pinned },
    { label: 'Today', items: today },
    { label: 'Yesterday', items: yesterday },
    { label: 'Previous 7 days', items: prev7 },
    { label: 'Older', items: older },
  ].filter((g) => g.items.length > 0);

  const flat: FlatVirtualItem[] = [];
  let chatIndex = 0;
  for (const group of groups) {
    flat.push({ type: 'header', id: `hdr:${group.label}`, label: group.label });
    for (const chat of group.items) {
      flat.push({
        type: 'chat',
        id: chat.id,
        chat,
        groupLabel: group.label,
        chatIndex,
      });
      chatIndex += 1;
    }
  }
  return flat;
}

interface SidebarChatListProps {
  onSelectChat: (chatId: string) => void;
}

export const SidebarChatList: React.FC<SidebarChatListProps> = ({ onSelectChat }) => {
  const {
    chats,
    chatsLoading,
    hasMoreChats,
    loadMoreChats,
    activeChat,
    titlingChatId,
    renameChat,
    togglePinChat,
    requestDeleteChat,
  } = useChatStore();
  const chatFilter = useUiStore((s) => s.chatFilter);
  const pushToast = useUiStore((s) => s.pushToast);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [scrolledPastFirst, setScrolledPastFirst] = useState(false);

  const parentRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const userTimezone = useAuthStore((s) => s.user?.preferences?.timezone);
  const timeZone = resolveUserTimezone(userTimezone);

  const flatItems = useMemo(
    () => buildGroupedItems(chats, chatFilter === 'pinned', timeZone),
    [chats, chatFilter, timeZone]
  );

  const chatRowsOnly = useMemo(
    () => flatItems.filter((item): item is Extract<FlatVirtualItem, { type: 'chat' }> => item.type === 'chat'),
    [flatItems]
  );

  const virtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (flatItems[index]?.type === 'header' ? 28 : 42),
    overscan: 8,
  });

  const virtualItems = virtualizer.getVirtualItems();

  const stickyGroupLabel = useMemo(() => {
    if (!scrolledPastFirst || virtualItems.length === 0) return null;
    const first = flatItems[virtualItems[0]!.index];
    if (!first) return null;
    return first.type === 'header' ? first.label : first.groupLabel;
  }, [scrolledPastFirst, virtualItems, flatItems]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setScrolledPastFirst(el.scrollTop > 18);
    if (hasMoreChats && el.scrollTop + el.clientHeight >= el.scrollHeight - 160) {
      void loadMoreChats();
    }
  };

  const focusChatAt = (nextIndex: number) => {
    const target = chatRowsOnly[nextIndex];
    if (!target) return;
    const flatIdx = flatItems.findIndex((i) => i.id === target.id);
    if (flatIdx >= 0) {
      virtualizer.scrollToIndex(flatIdx, { align: 'auto' });
    }
    requestAnimationFrame(() => {
      rowRefs.current.get(target.id)?.focus();
    });
  };

  const handleCommitRename = async (chatId: string, title: string) => {
    setEditingId(null);
    try {
      await renameChat(chatId, title);
    } catch {
      pushToast('Failed to rename chat', 'error');
    }
  };

  if (chatsLoading && chats.length === 0) {
    return (
      <div className="flex-1 min-h-0 px-3 py-2 space-y-2" aria-label="Loading conversations">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-9 w-full rounded-full" />
        ))}
      </div>
    );
  }

  if (flatItems.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center px-5 py-8">
        <div className="w-9 h-9 rounded-full bg-[var(--surface-hover)] flex items-center justify-center text-[var(--text-subtle)] mb-2.5">
          {chatFilter === 'pinned' ? (
            <Pin className="w-4 h-4" />
          ) : (
            <MessageSquare className="w-4 h-4" />
          )}
        </div>
        <div className="text-xs font-medium text-[var(--text-muted)]">
          {chatFilter === 'pinned' ? 'No pinned chats' : 'No chats yet'}
        </div>
        <div className="text-[11px] text-[var(--text-subtle)] mt-1">
          {chatFilter === 'pinned'
            ? 'Pin important conversations to keep them here.'
            : 'Send a message to start your first conversation.'}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {stickyGroupLabel && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-0 inset-x-0 z-10 px-4 py-1 bg-[var(--surface-sidebar)]/95 text-[12px] font-medium text-[var(--text-subtle)]"
        >
          {stickyGroupLabel}
        </div>
      )}

      <div
        ref={parentRef}
        onScroll={handleScroll}
        role="listbox"
        aria-label="Conversations"
        className="flex-1 min-h-0 overflow-y-auto px-2.5 py-2 sidebar-scroll-mask"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          <AnimatePresence initial={false}>
            {virtualItems.map((vRow) => {
              const item = flatItems[vRow.index]!;
              return (
                <div
                  key={item.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${vRow.size}px`,
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  {item.type === 'header' ? (
                    <div className="px-2 pt-2 pb-1 text-[12px] font-medium text-[var(--text-subtle)] select-none">
                      {item.label}
                    </div>
                  ) : (
                    <SidebarChatRow
                      chat={item.chat}
                      isActive={activeChat?.id === item.chat.id}
                      isTitling={titlingChatId === item.chat.id}
                      isEditing={editingId === item.chat.id}
                      registerRowRef={(el) => {
                        if (el) rowRefs.current.set(item.chat.id, el);
                        else rowRefs.current.delete(item.chat.id);
                      }}
                      onSelect={() => onSelectChat(item.chat.id)}
                      onStartRename={() => setEditingId(item.chat.id)}
                      onCommitRename={(title) => void handleCommitRename(item.chat.id, title)}
                      onCancelRename={() => setEditingId(null)}
                      onTogglePin={() => void togglePinChat(item.chat.id)}
                      onExport={(format) =>
                        window.open(`/api/chats/${item.chat.id}/export?format=${format}`, '_blank')
                      }
                      onDelete={() => requestDeleteChat(item.chat)}
                      onKeyDownRow={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          focusChatAt((item.chatIndex + 1) % chatRowsOnly.length);
                        } else if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          focusChatAt(
                            (item.chatIndex - 1 + chatRowsOnly.length) % chatRowsOnly.length
                          );
                        } else if (e.key === 'F2') {
                          e.preventDefault();
                          setEditingId(item.chat.id);
                        } else if (e.key === 'Delete' || e.key === 'Backspace') {
                          e.preventDefault();
                          requestDeleteChat(item.chat);
                        }
                      }}
                    />
                  )}
                </div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};
