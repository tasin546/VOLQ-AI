export interface ShortcutDefinition {
  id: string;
  label: string;
  description: string;
  mac: string;
  other: string;
  section: 'General' | 'Chat list' | 'Composer';
}

export function detectMacPlatform(platformHint?: string, userAgentHint?: string): boolean {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  const platform = (platformHint ?? nav?.platform ?? '').toUpperCase();
  const ua = (userAgentHint ?? nav?.userAgent ?? '').toUpperCase();
  return platform.includes('MAC') || platform.includes('IPHONE') || platform.includes('IPAD') || ua.includes('MAC OS X');
}

export function formatShortcut(macCombo: string, otherCombo: string, isMac = detectMacPlatform()): string {
  return isMac ? macCombo : otherCombo;
}

export function formatModKey(key: string, options?: { shift?: boolean; alt?: boolean; isMac?: boolean }): string {
  const isMac = options?.isMac ?? detectMacPlatform();
  const upper = key.toUpperCase();
  if (isMac) {
    return `${options?.alt ? '⌥' : ''}${options?.shift ? '⇧' : ''}⌘${upper}`;
  }
  return `Ctrl+${options?.alt ? 'Alt+' : ''}${options?.shift ? 'Shift+' : ''}${upper}`;
}

export const KEYBOARD_SHORTCUTS: ShortcutDefinition[] = [
  {
    id: 'command-palette',
    label: 'Search & command palette',
    description: 'Search chats, switch models, and jump anywhere',
    mac: '⌘K',
    other: 'Ctrl+K',
    section: 'General',
  },
  {
    id: 'new-chat',
    label: 'New chat',
    description: 'Start a fresh conversation and focus composer',
    mac: '⇧⌘O',
    other: 'Ctrl+Shift+O',
    section: 'General',
  },
  {
    id: 'toggle-sidebar',
    label: 'Toggle sidebar',
    description: 'Collapse or expand the navigation sidebar',
    mac: '⌘B',
    other: 'Ctrl+B',
    section: 'General',
  },
  {
    id: 'shortcuts-sheet',
    label: 'Keyboard shortcuts',
    description: 'Open this shortcuts reference sheet',
    mac: '?',
    other: '?',
    section: 'General',
  },
  {
    id: 'chat-list-nav',
    label: 'Navigate chats',
    description: 'Move between chat items when the chat list has focus',
    mac: '↑ / ↓',
    other: 'Up / Down',
    section: 'Chat list',
  },
  {
    id: 'chat-list-open',
    label: 'Open chat',
    description: 'Select the focused conversation',
    mac: 'Return',
    other: 'Enter',
    section: 'Chat list',
  },
  {
    id: 'chat-list-rename',
    label: 'Rename chat',
    description: 'Inline rename the focused conversation',
    mac: 'F2',
    other: 'F2',
    section: 'Chat list',
  },
  {
    id: 'chat-list-delete',
    label: 'Delete chat (undoable)',
    description: 'Delete the focused conversation with a 6s Undo toast',
    mac: '⌫ / Delete',
    other: 'Delete',
    section: 'Chat list',
  },
  {
    id: 'composer-send',
    label: 'Send message',
    description: 'Submit prompt (or Shift+Enter for newline when Enter sends)',
    mac: 'Return',
    other: 'Enter',
    section: 'Composer',
  },
  {
    id: 'composer-edit-last',
    label: 'Edit last message',
    description: 'Press Up Arrow in an empty composer to edit your last message',
    mac: '↑',
    other: 'Up Arrow',
    section: 'Composer',
  },
  {
    id: 'composer-stop',
    label: 'Stop generation / close menu',
    description: 'Stop active streaming response in composer or close overlays',
    mac: 'Esc',
    other: 'Esc',
    section: 'Composer',
  },
];
