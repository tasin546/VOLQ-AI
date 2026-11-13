import React from 'react';
import { Check, ListFilter } from 'lucide-react';
import { type ChatFilterMode, useUiStore } from '../../stores/uiStore';
import {
  AppDropdown,
  AppTooltip,
  DropdownContent,
  DropdownItem,
  IconButton,
} from '../ui/Primitives';

export const SidebarChatSectionHeader: React.FC = () => {
  const chatFilter = useUiStore((s) => s.chatFilter);
  const setChatFilter = useUiStore((s) => s.setChatFilter);

  const options: Array<{ id: ChatFilterMode; label: string }> = [
    { id: 'all', label: 'All chats' },
    { id: 'pinned', label: 'Pinned only' },
  ];

  return (
    <div className="px-4 pt-3 pb-1 flex items-center justify-between shrink-0">
      <span className="text-[12px] font-medium text-[var(--text-subtle)] select-none">
        {chatFilter === 'pinned' ? 'Chats · Pinned' : 'Chats'}
      </span>

      <AppDropdown.Root>
        <AppTooltip content="Filter chats" side="right">
          <AppDropdown.Trigger asChild>
            <IconButton
              size="sm"
              active={chatFilter === 'pinned'}
              aria-label="Filter chats"
              className="w-7 h-7"
            >
              <ListFilter className="w-3.5 h-3.5" strokeWidth={1.7} />
            </IconButton>
          </AppDropdown.Trigger>
        </AppTooltip>
        <DropdownContent align="end" className="min-w-[150px]">
          {options.map((opt) => (
            <DropdownItem
              key={opt.id}
              onSelect={() => setChatFilter(opt.id)}
              className="justify-between"
            >
              <span>{opt.label}</span>
              {chatFilter === opt.id && <Check className="w-3.5 h-3.5 text-[var(--text)]" />}
            </DropdownItem>
          ))}
        </DropdownContent>
      </AppDropdown.Root>
    </div>
  );
};
