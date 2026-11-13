import React from 'react';
import { BookText, Plus, Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatModKey } from '../../lib/shortcuts';
import { useUiStore } from '../../stores/uiStore';
import { AppTooltip, IconButton } from '../ui/Primitives';
import { SidebarFooter } from './SidebarFooter';
import { SidebarLogoToggle } from './SidebarLogoToggle';

interface SidebarRailProps {
  onNewChat: () => void;
  onGoHome: () => void;
}

export const SidebarRail: React.FC<SidebarRailProps> = ({ onNewChat }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const toggleSidebarCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);
  const setGlobalPaletteOpen = useUiStore((s) => s.setGlobalPaletteOpen);

  return (
    <div className="h-full flex flex-col items-center justify-between py-2.5">
      <div className="flex flex-col items-center gap-2">
        <SidebarLogoToggle
          collapsed={true}
          onToggle={toggleSidebarCollapsed}
          tooltipSide="right"
        />

        <AppTooltip content="Search & commands" shortcut={formatModKey('k')} side="right">
          <IconButton aria-label="Search chats and commands" onClick={() => setGlobalPaletteOpen(true)}>
            <Search className="w-5 h-5" strokeWidth={1.65} />
          </IconButton>
        </AppTooltip>

        <AppTooltip
          content="New chat"
          shortcut={formatModKey('o', { shift: true })}
          side="right"
        >
          <IconButton
            aria-label="New chat"
            onClick={onNewChat}
            className="bg-[var(--surface-active)] text-[var(--text)] hover:brightness-105"
          >
            <Plus className="w-5 h-5" strokeWidth={1.75} />
          </IconButton>
        </AppTooltip>

        <div className="w-6 border-t border-[var(--border-subtle)] my-1" />

        <AppTooltip content="Prompts" side="right">
          <IconButton
            aria-label="Prompts"
            active={location.pathname === '/prompts'}
            onClick={() => navigate('/prompts')}
          >
            <BookText className="w-5 h-5" strokeWidth={1.65} />
          </IconButton>
        </AppTooltip>
      </div>

      <SidebarFooter collapsed />
    </div>
  );
};
