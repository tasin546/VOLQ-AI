import React, { useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, WifiOff, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { apiFetch } from '../../lib/api';
import { useUiStore } from '../../stores/uiStore';
import { SettingsModal } from '../settings/SettingsModal';
import { Sidebar } from '../sidebar/Sidebar';
import { DeleteChatDialog } from '../ui/DeleteChatDialog';
import { GlobalPalette } from '../ui/GlobalPalette';
import { ObsidianBackdrop } from '../ui/ObsidianBackdrop';
import { IconButton } from '../ui/Primitives';
import { ShortcutsModal } from '../ui/ShortcutsModal';

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const location = useLocation();
  const {
    mobileDrawerOpen,
    setMobileDrawerOpen,
    branding,
    isOffline,
    setIsOffline,
    toasts,
    dismissToast,
  } = useUiStore();

  const touchStartX = useRef<number | null>(null);
  const lastFocusedBeforeDrawer = useRef<HTMLElement | null>(null);

  // Poll healthz softly when offline so banner clears automatically on reconnect
  useEffect(() => {
    if (!isOffline) return;
    const id = setInterval(() => {
      void apiFetch<{ status: string }>('/healthz')
        .then(() => setIsOffline(false))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [isOffline, setIsOffline]);

  // Left-edge swipe gesture on mobile to open drawer
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= 768) return;
      const x = e.touches[0]?.clientX ?? 999;
      touchStartX.current = x <= 24 ? x : null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touchStartX.current === null) return;
      const endX = e.changedTouches[0]?.clientX ?? 0;
      if (endX - touchStartX.current > 56) {
        lastFocusedBeforeDrawer.current = document.activeElement as HTMLElement | null;
        setMobileDrawerOpen(true);
      }
      touchStartX.current = null;
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [setMobileDrawerOpen]);

  return (
    <div className="relative flex h-dvh w-full overflow-hidden bg-[var(--bg)] text-[var(--text)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:px-3.5 focus:py-2 focus:rounded-full focus:bg-[var(--accent)] focus:text-[var(--accent-ink)] focus:text-xs focus:font-semibold"
      >
        Skip to content
      </a>

      <ObsidianBackdrop />
      <GlobalPalette />
      <ShortcutsModal />
      <DeleteChatDialog />
      <SettingsModal />

      {/* Desktop & Tablet Flat Sidebar (>= 768px) */}
      <div className="hidden md:flex h-full shrink-0 relative z-20">
        <Sidebar />
      </div>

      {/* Mobile Focus-Trapped Swipe Drawer (< 768px) */}
      <Dialog.Root
        open={mobileDrawerOpen}
        onOpenChange={(open) => {
          if (open) {
            lastFocusedBeforeDrawer.current = document.activeElement as HTMLElement | null;
          }
          setMobileDrawerOpen(open);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 md:hidden bg-[var(--scrim-bg)] backdrop-blur-[4px]" />
          <Dialog.Content
            onCloseAutoFocus={(e) => {
              if (lastFocusedBeforeDrawer.current) {
                e.preventDefault();
                lastFocusedBeforeDrawer.current.focus();
                lastFocusedBeforeDrawer.current = null;
              }
            }}
            className="fixed inset-y-0 left-0 z-50 md:hidden w-[min(86vw,340px)] h-dvh outline-none"
          >
            <Dialog.Title className="sr-only">Navigation sidebar</Dialog.Title>
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              drag="x"
              dragConstraints={{ left: -340, right: 0 }}
              dragElastic={0.06}
              onDragEnd={(_e, info) => {
                if (info.offset.x < -70 || info.velocity.x < -300) {
                  setMobileDrawerOpen(false);
                }
              }}
              className="h-full w-full shadow-[var(--shadow)]"
            >
              <Sidebar mobile onCloseMobile={() => setMobileDrawerOpen(false)} />
            </motion.div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Main Content Area */}
      <div className="relative z-10 flex-1 min-w-0 flex flex-col h-full bg-[var(--bg)]">
        {isOffline && (
          <div
            role="status"
            className="shrink-0 px-4 py-2 bg-[var(--status-warning-soft)] border-b border-[var(--border)] flex items-center justify-center gap-2 text-xs text-[var(--status-warning)]"
          >
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            <span>Connection to server unavailable. Retrying automatically...</span>
          </div>
        )}

        {location.pathname !== '/' && (
          <div className="md:hidden shrink-0 h-14 px-3 flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg)]">
            <IconButton
              size="lg"
              aria-label="Open navigation sidebar"
              onClick={() => setMobileDrawerOpen(true)}
            >
              <Menu className="w-5 h-5" strokeWidth={1.7} />
            </IconButton>
            <span className="text-sm font-semibold text-[var(--text)] truncate">
              {branding.siteName}
            </span>
          </div>
        )}

        <div id="main-content" className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {children}
        </div>
      </div>

      {/* Overlay Toast Stack */}
      <AnimatePresence>
        {toasts.length > 0 && (
          <div
            aria-live="polite"
            className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-xs pb-[env(safe-area-inset-bottom)]"
          >
            {toasts.map((toast) => (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-[var(--radius-md)] text-xs liquid-glass-strong ${
                  toast.tone === 'error' ? 'text-[var(--status-error)]' : 'text-[var(--text)]'
                }`}
              >
                <span>{toast.message}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {toast.actionLabel && toast.onAction && (
                    <button
                      type="button"
                      onClick={() => {
                        toast.onAction?.();
                        dismissToast(toast.id);
                      }}
                      className="px-2 py-1 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] text-[11px] font-semibold hover:opacity-90"
                    >
                      {toast.actionLabel}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => dismissToast(toast.id)}
                    aria-label="Dismiss notification"
                    className="text-[var(--text-muted)] hover:text-[var(--text)]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
