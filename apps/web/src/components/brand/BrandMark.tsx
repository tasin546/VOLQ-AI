import React from 'react';
import {
  Aperture,
  Atom,
  Bot,
  Box,
  Brain,
  Code2,
  Command,
  Compass,
  Cpu,
  Database,
  Feather,
  Flame,
  Globe,
  Hexagon,
  Key,
  Layers,
  type LucideIcon,
  Moon,
  Orbit,
  Radar,
  Shield,
  Sparkles,
  Terminal,
  Workflow,
  Zap,
} from 'lucide-react';
import type { BrandingSettings } from '../../lib/types';
import { useUiStore } from '../../stores/uiStore';

export const BRAND_ICON_MAP: Record<string, LucideIcon> = {
  Sparkles,
  Cpu,
  Bot,
  Terminal,
  Atom,
  Compass,
  Orbit,
  Shield,
  Zap,
  Layers,
  Box,
  Command,
  Flame,
  Globe,
  Hexagon,
  Moon,
  Aperture,
  Brain,
  Code2,
  Database,
  Feather,
  Key,
  Radar,
  Workflow,
};

interface BrandMarkProps {
  size?: number;
  showName?: boolean;
  override?: BrandingSettings;
  className?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({
  size = 28,
  showName = false,
  override,
  className = '',
}) => {
  const storeBranding = useUiStore((s) => s.branding);
  const branding = override ?? storeBranding;

  const renderMark = () => {
    if (branding.logoMode === 'upload' && branding.hasUploadedLogo) {
      return (
        <img
          src={`/api/branding/asset/logo?v=${branding.assetVersion}`}
          alt={branding.siteName}
          style={{ width: size, height: size }}
          className="rounded-[8px] object-contain shrink-0"
        />
      );
    }

    if (branding.logoMode === 'icon') {
      const IconComponent = BRAND_ICON_MAP[branding.iconName] ?? Sparkles;
      return (
        <span
          className="inline-flex items-center justify-center rounded-[9px] bg-[var(--glass-strong)] border border-[var(--border-hairline)] shrink-0"
          style={{ width: size, height: size }}
        >
          <IconComponent
            style={{ width: Math.round(size * 0.58), height: Math.round(size * 0.58), color: branding.iconColor || 'var(--text-primary)' }}
          />
        </span>
      );
    }

    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <circle cx="15" cy="15" r="9.5" stroke="var(--text-primary)" strokeWidth="2.4" />
        <path
          d="M19.5 19.5L26.5 26.5"
          stroke="var(--text-primary)"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <circle cx="15" cy="15" r="3" fill="var(--text-primary)" fillOpacity="0.22" />
      </svg>
    );
  };

  return (
    <div className={`inline-flex items-center gap-2.5 min-w-0 select-none ${className}`}>
      {renderMark()}
      {showName && (
        <span className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)] truncate">
          {branding.siteName}
        </span>
      )}
    </div>
  );
};
