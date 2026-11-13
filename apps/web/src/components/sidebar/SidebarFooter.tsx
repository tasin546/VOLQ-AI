import React, { useState } from 'react';
import { Keyboard, LogOut, Monitor, Moon, Settings, Sparkles, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ThemeMode } from '../../lib/types';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import { AppPopover, AppTooltip, IconButton, PopoverContent } from '../ui/Primitives';
import { UserAvatar } from '../ui/UserAvatar';

function openSettingsTarget() {
  const params = new URLSearchParams(window.location.search);
  params.set('settings', 'account');
  return `/?${params.toString()}`;
}

interface SidebarFooterProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

export const SidebarFooter: React.FC<SidebarFooterProps> = ({
  collapsed = false,
  onNavigate,
}) => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const updateProfile = useAuthStore((s) => s.updateProfile);

  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const setShortcutsModalOpen = useUiStore((s) => s.setShortcutsModalOpen);
  const [open, setOpen] = useState(false);

  const handleThemeSelect = async (next: ThemeMode) => {
    setTheme(next);
    await updateProfile({ preferences: { theme: next } }).catch(() => {});
  };

  const themeOptions: Array<{
    id: ThemeMode;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'dark', label: 'Obsidian', icon: Moon },
    { id: 'amoled', label: 'AMOLED', icon: Sparkles },
    { id: 'light', label: 'Frost', icon: Sun },
    { id: 'system', label: 'Auto', icon: Monitor },
  ];

  const popoverBody = (
    <PopoverContent
      side={collapsed ? 'right' : 'top'}
      align="start"
      className="w-60 space-y-2 p-2.5"
    >
      <div className="px-1.5 pt-0.5">
        <div className="text-[11px] font-medium text-[var(--text-subtle)] mb-1.5">Theme</div>
        <div className="grid grid-cols-2 gap-1 bg-[var(--surface)] p-1 rounded-[var(--radius-md)] border border-[var(--border)]">
          {themeOptions.map((opt) => {
            const Icon = opt.icon;
            const selected = theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => void handleThemeSelect(opt.id)}
                className={`flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-[var(--radius-sm)] text-[12px] transition-colors ${
                  selected
                    ? 'bg-[var(--accent)] text-[var(--accent-ink)] font-medium'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-[var(--border)] pt-1.5 space-y-0.5">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setShortcutsModalOpen(true);
            onNavigate?.();
          }}
          className="w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-[var(--radius-sm)] text-[var(--text)] hover:bg-[var(--surface-hover)]"
        >
          <span className="inline-flex items-center gap-2">
            <Keyboard className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            Keyboard shortcuts
          </span>
          <kbd className="font-mono text-[11px] text-[var(--text-subtle)]">?</kbd>
        </button>

        <button
          type="button"
          onClick={() => {
            setOpen(false);
            navigate(openSettingsTarget());
            onNavigate?.();
          }}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-xs rounded-[var(--radius-sm)] text-[var(--text)] hover:bg-[var(--surface-hover)]"
        >
          <Settings className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          Settings
        </button>

        <button
          type="button"
          onClick={() => {
            setOpen(false);
            void logout();
          }}
          className="w-full flex items-center gap-2 px-2.5 py-2 text-xs rounded-[var(--radius-sm)] text-[var(--status-error)] hover:bg-[var(--status-error-soft)]"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign out
        </button>
      </div>
    </PopoverContent>
  );

  if (collapsed) {
    return (
      <div className="shrink-0 py-3 flex flex-col items-center gap-2">
        <AppTooltip content="Settings" side="right">
          <IconButton
            aria-label="Settings"
            onClick={() => {
              navigate(openSettingsTarget());
              onNavigate?.();
            }}
          >
            <Settings className="w-5 h-5" strokeWidth={1.65} />
          </IconButton>
        </AppTooltip>

        <AppPopover.Root open={open} onOpenChange={setOpen}>
          <AppTooltip content={user?.displayName ?? 'Account'} side="right">
            <AppPopover.Trigger asChild>
              <button
                type="button"
                aria-label="Open account menu"
                aria-expanded={open}
                className="rounded-full hover:opacity-90 transition-opacity"
              >
                <UserAvatar user={user} size="md" />
              </button>
            </AppPopover.Trigger>
          </AppTooltip>
          {popoverBody}
        </AppPopover.Root>
      </div>
    );
  }

  return (
    <div className="shrink-0 px-2.5 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-2 bg-gradient-to-t from-[var(--surface-sidebar)] via-[var(--surface-sidebar)]/95 to-transparent">
      <AppPopover.Root open={open} onOpenChange={setOpen}>
        <AppPopover.Trigger asChild>
          <button
            type="button"
            aria-expanded={open}
            aria-label="Open account and theme menu"
            className="flex-1 min-w-0 flex items-center gap-2.5 px-2 py-1.5 rounded-full hover:bg-[var(--surface-hover)] transition-colors text-left"
          >
            <UserAvatar user={user} size="sm" />
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-[var(--text)] truncate leading-tight">
                {user?.displayName}
              </div>
              <div className="text-[11px] text-[var(--text-subtle)] capitalize leading-tight">
                {user?.role === 'admin' ? 'Admin' : 'User'}
              </div>
            </div>
          </button>
        </AppPopover.Trigger>
        {popoverBody}
      </AppPopover.Root>

      <AppTooltip content="Settings" side="top">
        <IconButton
          aria-label="Settings"
          onClick={() => {
            navigate(openSettingsTarget());
            onNavigate?.();
          }}
        >
          <Settings className="w-[18px] h-[18px]" strokeWidth={1.65} />
        </IconButton>
      </AppTooltip>
    </div>
  );
};
