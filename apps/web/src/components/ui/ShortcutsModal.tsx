import React from 'react';
import { KEYBOARD_SHORTCUTS, detectMacPlatform } from '../../lib/shortcuts';
import { useUiStore } from '../../stores/uiStore';
import { DialogModal } from './Primitives';

export const ShortcutsModal: React.FC = () => {
  const open = useUiStore((s) => s.shortcutsModalOpen);
  const setOpen = useUiStore((s) => s.setShortcutsModalOpen);
  const isMac = detectMacPlatform();

  const sections: Array<'General' | 'Chat list' | 'Composer'> = [
    'General',
    'Chat list',
    'Composer',
  ];

  return (
    <DialogModal
      open={open}
      onOpenChange={setOpen}
      title="Keyboard shortcuts"
      description={isMac ? 'Detected macOS shortcuts' : 'Detected Windows / Linux shortcuts'}
      maxWidthClass="md:max-w-[560px]"
    >
      <div className="p-5 overflow-y-auto space-y-5">
        {sections.map((section) => {
          const items = KEYBOARD_SHORTCUTS.filter((s) => s.section === section);
          return (
            <div key={section} className="space-y-2">
              <div className="text-[12px] font-medium text-[var(--text-subtle)]">{section}</div>
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-4 px-3.5 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-[var(--text)]">{item.label}</div>
                      <div className="text-xs text-[var(--text-muted)]">{item.description}</div>
                    </div>
                    <kbd className="shrink-0 px-2 py-1 rounded-[var(--radius-sm)] bg-[var(--surface-hover)] border border-[var(--border)] text-xs font-mono text-[var(--text)]">
                      {isMac ? item.mac : item.other}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </DialogModal>
  );
};
