import React from 'react';
import { KEYBOARD_SHORTCUTS, detectMacPlatform } from '../../../lib/shortcuts';

export const KeyboardSection: React.FC = () => {
  const isMac = detectMacPlatform();

  return (
    <div className="space-y-4">
      <div
        data-setting-row="keyboard-list"
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]"
      >
        {KEYBOARD_SHORTCUTS.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--text)]">{item.label}</div>
              <div className="text-xs text-[var(--text-muted)]">{item.description}</div>
            </div>
            <kbd className="shrink-0 px-2.5 py-1 rounded-[var(--radius-sm)] bg-[var(--surface-raised)] border border-[var(--border)] text-xs font-mono text-[var(--text)]">
              {isMac ? item.mac : item.other}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
};
