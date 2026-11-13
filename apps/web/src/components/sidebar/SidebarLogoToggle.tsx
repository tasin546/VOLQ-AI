import React from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { formatModKey } from '../../lib/shortcuts';
import { useUiStore } from '../../stores/uiStore';
import { BrandMark } from '../brand/BrandMark';
import { AppTooltip } from '../ui/Primitives';

interface SidebarLogoToggleProps {
  collapsed: boolean;
  onToggle: () => void;
  tooltipSide?: 'bottom' | 'right';
  className?: string;
}

export const SidebarLogoToggle: React.FC<SidebarLogoToggleProps> = ({
  collapsed,
  onToggle,
  tooltipSide = 'bottom',
  className = '',
}) => {
  const reduceMotion = useUiStore((s) => s.reduceMotion);
  const tooltipText = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  const shortcut = formatModKey('b');

  return (
    <AppTooltip content={tooltipText} shortcut={shortcut} side={tooltipSide}>
      <button
        type="button"
        onClick={onToggle}
        aria-label={tooltipText}
        aria-expanded={!collapsed}
        className={`group relative w-10 h-10 rounded-full flex items-center justify-center shrink-0 cursor-pointer text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${className}`}
      >
        {/* Logo Mark (Visible at rest, cross-fades out on hover) */}
        <span
          className={`absolute inset-0 flex items-center justify-center pointer-events-none ${
            reduceMotion
              ? 'group-hover:opacity-0'
              : 'transition-[opacity,transform] duration-200 ease-out group-hover:opacity-0 group-hover:scale-90'
          } [@media(hover:none)]:group-hover:opacity-100 [@media(hover:none)]:group-hover:scale-100`}
        >
          <BrandMark size={28} showName={false} />
        </span>

        {/* Panel Toggle Icon (Hidden at rest, cross-fades in on hover) */}
        <span
          className={`absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 ${
            reduceMotion
              ? 'group-hover:opacity-100'
              : 'scale-90 transition-[opacity,transform] duration-200 ease-out group-hover:opacity-100 group-hover:scale-100'
          } [@media(hover:none)]:hidden text-[var(--text)]`}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-5 h-5" strokeWidth={1.75} />
          ) : (
            <PanelLeftClose className="w-5 h-5" strokeWidth={1.75} />
          )}
        </span>
      </button>
    </AppTooltip>
  );
};
