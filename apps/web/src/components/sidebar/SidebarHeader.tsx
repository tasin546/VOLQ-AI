import React from 'react';
import { useUiStore } from '../../stores/uiStore';
import { SidebarLogoToggle } from './SidebarLogoToggle';

interface SidebarHeaderProps {
  mobile?: boolean;
  onCloseMobile?: () => void;
  onGoHome: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  mobile = false,
  onCloseMobile,
  onGoHome,
}) => {
  const branding = useUiStore((s) => s.branding);
  const toggleSidebarCollapsed = useUiStore((s) => s.toggleSidebarCollapsed);

  const handleToggle = () => {
    if (mobile) {
      onCloseMobile?.();
    } else {
      toggleSidebarCollapsed();
    }
  };

  return (
    <div className="h-14 shrink-0 px-3 flex items-center justify-between gap-2 border-b border-[var(--border-subtle)]/40">
      <div className="flex items-center gap-2 min-w-0">
        <SidebarLogoToggle
          collapsed={false}
          onToggle={handleToggle}
          tooltipSide="bottom"
        />

        <button
          type="button"
          onClick={onGoHome}
          className="text-[15px] font-semibold tracking-tight text-[var(--text)] truncate hover:text-[var(--text-muted)] transition-colors focus:outline-none focus-visible:underline"
        >
          {branding.siteName || 'VOLQ AI'}
        </button>
      </div>
    </div>
  );
};
