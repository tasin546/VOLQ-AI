import React from 'react';
import { Laptop, Moon, Sparkles, Sun } from 'lucide-react';
import { BrandMark } from '../brand/BrandMark';
import type { ThemeMode } from '../../lib/types';
import { useUiStore } from '../../stores/uiStore';

const THEME_OPTIONS: Array<{
  id: ThemeMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dark', label: 'Obsidian', icon: Moon },
  { id: 'amoled', label: 'AMOLED', icon: Sparkles },
  { id: 'light', label: 'Frost', icon: Sun },
  { id: 'system', label: 'System', icon: Laptop },
];

export const WelcomeTopBar: React.FC = () => {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  return (
    <header className="w-full h-[72px] px-6 sm:px-10 md:px-14 flex items-center justify-between select-none">
      {/* Skip to Content Link for Keyboard Accessibility */}
      <a
        href="#welcome-hero-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 z-50 px-4 py-2 bg-white text-black font-semibold rounded-full shadow-xl focus:outline-none focus:ring-2 focus:ring-white"
      >
        Skip to main content
      </a>

      {/* Brand Logo & Name */}
      <div className="flex items-center gap-3">
        <BrandMark size={30} showName className="text-[var(--wallpaper-content-text)]" />
      </div>

      {/* Glass Theme Switcher Radio Group */}
      <div
        role="radiogroup"
        aria-label="Theme selector"
        className="inline-flex items-center p-1 rounded-full border border-[var(--border)] bg-[var(--glass-fill)] backdrop-blur-md shadow-sm"
      >
        {THEME_OPTIONS.map((opt) => {
          const isSelected = theme === opt.id;
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              role="radio"
              aria-checked={isSelected}
              aria-label={opt.label}
              title={opt.label}
              onClick={() => setTheme(opt.id)}
              className={`relative flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white ${
                isSelected
                  ? 'bg-[var(--wallpaper-cta-bg)] text-[var(--wallpaper-cta-text)] shadow-sm'
                  : 'text-[var(--wallpaper-content-muted)] hover:text-[var(--wallpaper-content-text)] hover:bg-[var(--surface-hover)]'
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>
    </header>
  );
};
