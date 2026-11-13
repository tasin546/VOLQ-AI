import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Check,
  Download,
  FileJson,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
  X,
} from 'lucide-react';
import type { Chat } from '../../lib/types';
import { AppDropdown, DropdownContent, DropdownItem } from '../ui/Primitives';

interface SidebarChatRowProps {
  chat: Chat;
  isActive: boolean;
  isTitling: boolean;
  isEditing: boolean;
  onSelect: () => void;
  onStartRename: () => void;
  onCommitRename: (title: string) => void;
  onCancelRename: () => void;
  onTogglePin: () => void;
  onExport: (format: 'md' | 'json') => void;
  onDelete: () => void;
  onKeyDownRow: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  registerRowRef: (el: HTMLButtonElement | null) => void;
}

export const SidebarChatRow: React.FC<SidebarChatRowProps> = ({
  chat,
  isActive,
  isTitling,
  isEditing,
  onSelect,
  onStartRename,
  onCommitRename,
  onCancelRename,
  onTogglePin,
  onExport,
  onDelete,
  onKeyDownRow,
  registerRowRef,
}) => {
  const [draftTitle, setDraftTitle] = useState(chat.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing) {
      setDraftTitle(chat.title);
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 10);
    }
  }, [isEditing, chat.title]);

  const submit = () => {
    const trimmed = draftTitle.trim();
    if (!trimmed) {
      onCancelRename();
      return;
    }
    onCommitRename(trimmed);
  };

  if (isEditing) {
    return (
      <div className="sidebar-row flex items-center gap-1.5 bg-[var(--surface-active)]">
        <input
          ref={inputRef}
          type="text"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancelRename();
            }
          }}
          onBlur={submit}
          aria-label="Rename conversation"
          className="flex-1 min-w-0 bg-transparent text-[14px] text-[var(--text)] outline-none"
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={submit}
          aria-label="Save title"
          className="p-1 text-[var(--text)] rounded-full hover:bg-[var(--surface-hover)]"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onCancelRename}
          aria-label="Cancel rename"
          className="p-1 text-[var(--text-muted)] rounded-full hover:bg-[var(--surface-hover)]"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.14, ease: 'easeOut' }}
      className={`group relative sidebar-row flex items-center gap-1 pr-1.5 ${
        isActive
          ? 'bg-[var(--surface-active)] text-[var(--text)] font-medium'
          : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
      }`}
    >
      <button
        ref={registerRowRef}
        type="button"
        onClick={onSelect}
        onDoubleClick={onStartRename}
        onKeyDown={onKeyDownRow}
        aria-current={isActive ? 'page' : undefined}
        className="flex-1 min-w-0 h-full text-left flex items-center text-[14px] focus-visible:outline-none"
      >
        <span
          className={`block w-full truncate sidebar-title-fade ${
            isTitling ? 'volq-shimmer-text' : ''
          }`}
        >
          {isTitling ? 'Generating title...' : chat.title}
        </span>
      </button>

      {/* Resting pin indicator (hidden when hover actions take its place) */}
      {chat.isPinned && !menuOpen && (
        <Pin
          aria-hidden="true"
          className="w-3.5 h-3.5 text-[var(--text-subtle)] shrink-0 mr-1 group-hover:hidden group-focus-within:hidden [@media(hover:none)]:hidden"
          strokeWidth={1.7}
        />
      )}

      {/* Hover / Focus / Touch Actions */}
      <div
        className={`flex items-center gap-0.5 shrink-0 transition-opacity ${
          menuOpen
            ? 'opacity-100'
            : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto'
        }`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          aria-label={chat.isPinned ? `Unpin ${chat.title}` : `Pin ${chat.title}`}
          className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-active)]"
        >
          {chat.isPinned ? (
            <PinOff className="w-3.5 h-3.5" strokeWidth={1.7} />
          ) : (
            <Pin className="w-3.5 h-3.5" strokeWidth={1.7} />
          )}
        </button>

        <AppDropdown.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <AppDropdown.Trigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              aria-label={`More actions for ${chat.title}`}
              className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-active)]"
            >
              <MoreHorizontal className="w-4 h-4" strokeWidth={1.7} />
            </button>
          </AppDropdown.Trigger>

          <DropdownContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownItem onSelect={onStartRename}>
              <Pencil className="w-3.5 h-3.5" />
              Rename
            </DropdownItem>
            <DropdownItem onSelect={onTogglePin}>
              {chat.isPinned ? (
                <>
                  <PinOff className="w-3.5 h-3.5" />
                  Unpin
                </>
              ) : (
                <>
                  <Pin className="w-3.5 h-3.5" />
                  Pin
                </>
              )}
            </DropdownItem>
            <DropdownItem onSelect={() => onExport('md')}>
              <Download className="w-3.5 h-3.5" />
              Export Markdown
            </DropdownItem>
            <DropdownItem onSelect={() => onExport('json')}>
              <FileJson className="w-3.5 h-3.5" />
              Export JSON
            </DropdownItem>
            <DropdownItem destructive onSelect={onDelete}>
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </DropdownItem>
          </DropdownContent>
        </AppDropdown.Root>
      </div>
    </motion.div>
  );
};
