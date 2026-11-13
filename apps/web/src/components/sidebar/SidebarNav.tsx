import React from 'react';
import { motion } from 'framer-motion';
import { BookText, Plus } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatModKey } from '../../lib/shortcuts';

interface SidebarNavProps {
  mobile?: boolean;
  onNewChat: () => void;
  onNavigate?: () => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  mobile = false,
  onNewChat,
  onNavigate,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const newChatShortcut = formatModKey('o', { shift: true });

  const navItems = [
    {
      id: 'prompts',
      label: 'Prompts',
      icon: BookText,
      active: location.pathname === '/prompts',
      onClick: () => {
        navigate('/prompts');
        onNavigate?.();
      },
    },
  ];

  return (
    <nav className="px-2.5 pt-1 pb-2 space-y-0.5 shrink-0" aria-label="Primary navigation">
      <button
        type="button"
        onClick={onNewChat}
        className="group sidebar-row w-full flex items-center justify-between gap-2 bg-[var(--surface-active)] text-[var(--text)] hover:brightness-105 text-[14px] font-medium"
      >
        <span className="inline-flex items-center gap-3 min-w-0">
          <Plus className="w-5 h-5 shrink-0" strokeWidth={1.75} />
          <span className="truncate">New chat</span>
        </span>
        <kbd className="opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity text-[11px] font-mono text-[var(--text-muted)] shrink-0">
          {newChatShortcut}
        </kbd>
      </button>

      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            aria-current={item.active ? 'page' : undefined}
            className={`relative sidebar-row w-full flex items-center gap-3 text-[14px] ${
              item.active
                ? 'text-[var(--text)] font-medium'
                : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
            }`}
          >
            {item.active && (
              <motion.span
                layoutId={mobile ? 'mobile-sidebar-pill' : 'desktop-sidebar-pill'}
                transition={{ type: 'spring', duration: 0.22, bounce: 0 }}
                className="absolute inset-0 rounded-full bg-[var(--surface-active)]"
                aria-hidden="true"
              />
            )}
            <Icon className="relative z-10 w-5 h-5 shrink-0" strokeWidth={1.65} />
            <span className="relative z-10 truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
