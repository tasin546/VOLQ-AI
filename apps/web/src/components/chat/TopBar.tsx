import React, { useState } from 'react';
import {
  ChevronDown,
  Cloud,
  Copy,
  Download,
  Eraser,
  FileJson,
  HardDrive,
  Menu,
  MoreVertical,
  Trash2,
} from 'lucide-react';
import { formatModKey } from '../../lib/shortcuts';
import { resolveModelDisplayName } from '../../lib/modelResolver';
import { useChatStore } from '../../stores/chatStore';
import { useUiStore } from '../../stores/uiStore';
import {
  AppDropdown,
  AppTooltip,
  Badge,
  ConfirmDialog,
  DropdownContent,
  DropdownItem,
  IconButton,
} from '../ui/Primitives';

export const TopBar: React.FC = () => {
  const { setModelPickerOpen, setMobileDrawerOpen, pushToast } = useUiStore();
  const { activeChat, messages, models, selectedModel, clearActiveChat, requestDeleteChat } =
    useChatStore();
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const currentModelInfo = models.find(
    (m) => m.connectionId === selectedModel?.connectionId && m.id === selectedModel?.modelId
  );

  const displayLabel = selectedModel
    ? resolveModelDisplayName(models, selectedModel.connectionId, selectedModel.modelId)
    : models.length === 0
      ? 'Select model'
      : 'Select model';
  const fullModelTooltip = currentModelInfo
    ? `${currentModelInfo.name}${
        currentModelInfo.name !== currentModelInfo.id ? ` (${currentModelInfo.id})` : ''
      } · ${currentModelInfo.connectionName}`
    : selectedModel?.modelId ?? 'Choose a model';

  const handleExport = (format: 'md' | 'json') => {
    if (!activeChat) return;
    window.open(`/api/chats/${activeChat.id}/export?format=${format}`, '_blank');
  };

  const handleShareMarkdown = async () => {
    if (!activeChat || messages.length === 0) return;
    const md = [
      `# ${activeChat.title}`,
      '',
      ...messages.map(
        (m) =>
          `## ${
            m.role === 'user'
              ? 'User'
              : `Assistant (${resolveModelDisplayName(models, m.connectionId, m.modelId)})`
          }\n\n${m.content}`
      ),
    ].join('\n\n');
    try {
      await navigator.clipboard.writeText(md);
      pushToast('Copied conversation as Markdown');
    } catch {
      pushToast('Clipboard access failed', 'error');
    }
  };

  const handleConfirmClear = async () => {
    if (!activeChat) return;
    setClearing(true);
    try {
      await clearActiveChat();
      setConfirmClearOpen(false);
      pushToast('Conversation cleared');
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <header className="relative z-20 shrink-0 h-16 px-3 md:px-6 flex items-center justify-between gap-2 bg-gradient-to-b from-[var(--bg)] via-[var(--bg)]/85 to-transparent">
        <div className="flex items-center gap-2 min-w-0">
          <IconButton
            size="lg"
            onClick={() => setMobileDrawerOpen(true)}
            aria-label="Open navigation sidebar"
            className="md:hidden"
          >
            <Menu className="w-5 h-5" strokeWidth={1.7} />
          </IconButton>

          <AppTooltip content={fullModelTooltip} side="bottom">
            <button
              type="button"
              onClick={() => setModelPickerOpen(true)}
              aria-label="Select model"
              className="inline-flex items-center gap-2 max-w-[62vw] sm:max-w-[380px] h-10 px-3.5 rounded-full hover:bg-[var(--surface-hover)] border border-transparent hover:border-[var(--border)] transition-colors min-w-0"
            >
              {currentModelInfo ? (
                currentModelInfo.isLocal ? (
                  <HardDrive className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                ) : (
                  <Cloud className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
                )
              ) : null}
              <span className="text-sm font-medium truncate text-[var(--text)]">
                {displayLabel}
              </span>
              {currentModelInfo && (
                <Badge className="hidden sm:inline-flex shrink-0">
                  {currentModelInfo.isLocal ? 'Local' : 'Hosted'}
                </Badge>
              )}
              <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 text-[11px] font-mono rounded-[var(--radius-sm)] bg-[var(--surface-hover)] text-[var(--text-subtle)] shrink-0">
                {formatModKey('k')}
              </kbd>
              <ChevronDown className="w-3.5 h-3.5 text-[var(--text-subtle)] shrink-0" />
            </button>
          </AppTooltip>
        </div>

        <AppDropdown.Root>
          <AppDropdown.Trigger asChild>
            <IconButton
              aria-label="Conversation options"
              disabled={!activeChat}
              className="w-10 h-10"
            >
              <MoreVertical className="w-4 h-4" strokeWidth={1.7} />
            </IconButton>
          </AppDropdown.Trigger>

          {activeChat && (
            <DropdownContent align="end" className="min-w-[196px]">
              <DropdownItem onSelect={() => void handleShareMarkdown()}>
                <Copy className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                Share as Markdown
              </DropdownItem>
              <DropdownItem onSelect={() => handleExport('md')}>
                <Download className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                Export Markdown
              </DropdownItem>
              <DropdownItem onSelect={() => handleExport('json')}>
                <FileJson className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                Export JSON
              </DropdownItem>
              <div className="border-t border-[var(--border)] my-1" />
              <DropdownItem destructive onSelect={() => setConfirmClearOpen(true)}>
                <Eraser className="w-3.5 h-3.5" />
                Clear messages
              </DropdownItem>
              <DropdownItem destructive onSelect={() => requestDeleteChat(activeChat)}>
                <Trash2 className="w-3.5 h-3.5" />
                Delete chat
              </DropdownItem>
            </DropdownContent>
          )}
        </AppDropdown.Root>
      </header>

      <ConfirmDialog
        open={confirmClearOpen}
        onOpenChange={setConfirmClearOpen}
        title="Clear conversation"
        description={`Remove all messages in "${activeChat?.title ?? 'this chat'}"? The conversation entry will remain until deleted.`}
        confirmLabel="Clear messages"
        loading={clearing}
        onConfirm={handleConfirmClear}
      />
    </>
  );
};
