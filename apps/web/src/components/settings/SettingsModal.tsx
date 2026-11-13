import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Save,
  Search,
  X,
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { Button, ConfirmDialog, Input } from '../ui/Primitives';
import { UserAvatar } from '../ui/UserAvatar';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';
import {
  type AdminDirtyState,
  normalizeSettingsSection,
  SETTINGS_NAV_ITEMS,
  SETTINGS_SEARCH_ENTRIES,
  type SettingsSectionId,
} from './SettingsSearchIndex';
import { AboutSection } from './sections/AboutSection';
import { AccountSection } from './sections/AccountSection';
import { InterfaceSection } from './sections/InterfaceSection';
import { KeyboardSection } from './sections/KeyboardSection';
import { UsageSection } from './sections/UsageSection';
import { ConnectionsSettingsSection } from './sections/admin/ConnectionsSettingsSection';
import { GeneralSettingsSection } from './sections/admin/GeneralSettingsSection';
import { KnowledgeSettingsSection } from './sections/admin/KnowledgeSettingsSection';
import { ModelsSettingsSection } from './sections/admin/ModelsSettingsSection';
import { OAuthSettingsSection } from './sections/admin/OAuthSettingsSection';
import { EmailSettingsSection } from './sections/admin/EmailSettingsSection';
import { SkillsSettingsSection } from './sections/SkillsSettingsSection';
import { SystemSettingsSection } from './sections/admin/SystemSettingsSection';
import { UsageLimitsSection } from './sections/admin/UsageLimitsSection';
import { UsersSettingsSection } from './sections/admin/UsersSettingsSection';

export const SettingsModal: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const resolvedTheme = useUiStore((s) => s.resolvedTheme);
  const reduceTransparency = useUiStore((s) => s.reduceTransparency);
  const reduceMotion = useUiStore((s) => s.reduceMotion);
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = typeof window !== 'undefined' ? window.innerWidth < 768 : false;

  const rawSettingsParam = searchParams.get('settings');
  const isOpen = rawSettingsParam !== null && Boolean(user);
  const isAdmin = user?.role === 'admin';
  const activeSection = normalizeSettingsSection(rawSettingsParam, isAdmin);

  const [navSearch, setNavSearch] = useState('');
  const [mobileShowDetail, setMobileShowDetail] = useState(() =>
    Boolean(rawSettingsParam && rawSettingsParam !== '1' && rawSettingsParam !== 'true')
  );
  const [highlightedRowId, setHighlightedRowId] = useState<string | null>(null);
  const [dirtyState, setDirtyState] = useState<AdminDirtyState | null>(null);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [quotaUserId, setQuotaUserId] = useState<string | null>(null);

  const paneScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      setNavSearch('');
      setDirtyState(null);
      setPendingAction(null);
      return;
    }
    if (
      rawSettingsParam &&
      rawSettingsParam !== '1' &&
      rawSettingsParam !== 'true' &&
      rawSettingsParam !== ''
    ) {
      setMobileShowDetail(true);
    } else {
      setMobileShowDetail(false);
    }
  }, [isOpen, rawSettingsParam]);

  useEffect(() => {
    if (!highlightedRowId) return;
    const timer = window.setTimeout(() => {
      const container = paneScrollRef.current;
      const target = container?.querySelector<HTMLElement>(
        `[data-setting-row="${highlightedRowId}"]`
      );
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.classList.add('ring-2', 'ring-[var(--accent)]', 'transition-shadow');
        window.setTimeout(() => {
          target.classList.remove('ring-2', 'ring-[var(--accent)]');
          setHighlightedRowId(null);
        }, 1600);
      } else {
        setHighlightedRowId(null);
      }
    }, 60);
    return () => window.clearTimeout(timer);
  }, [highlightedRowId, activeSection]);

  const closeModalImmediate = useCallback(() => {
    setDirtyState(null);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('settings');
        return next;
      },
      { replace: true }
    );
  }, [setSearchParams]);

  const switchSectionImmediate = useCallback(
    (section: SettingsSectionId, rowId?: string) => {
      setDirtyState(null);
      setMobileShowDetail(true);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('settings', section);
          return next;
        },
        { replace: true }
      );
      if (rowId) {
        setHighlightedRowId(rowId);
      } else {
        paneScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      }
    },
    [setSearchParams]
  );

  const requestClose = useCallback(() => {
    if (dirtyState?.dirty) {
      setPendingAction(() => () => closeModalImmediate());
      return;
    }
    closeModalImmediate();
  }, [dirtyState?.dirty, closeModalImmediate]);

  const requestSection = useCallback(
    (section: SettingsSectionId, rowId?: string) => {
      if (section === activeSection && !rowId) {
        setMobileShowDetail(true);
        return;
      }
      if (dirtyState?.dirty) {
        setPendingAction(() => () => switchSectionImmediate(section, rowId));
        return;
      }
      switchSectionImmediate(section, rowId);
    },
    [activeSection, dirtyState?.dirty, switchSectionImmediate]
  );

  const handleDirtyStateChange = useCallback((next: AdminDirtyState | null) => {
    setDirtyState(next);
  }, []);

  const visibleNavItems = useMemo(
    () => SETTINGS_NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin),
    [isAdmin]
  );
  const userNavItems = visibleNavItems.filter((item) => item.group === 'user');
  const adminNavItems = visibleNavItems.filter((item) => item.group === 'admin');

  const searchMatches = useMemo(() => {
    const q = navSearch.trim().toLowerCase();
    if (!q) return [];
    return SETTINGS_SEARCH_ENTRIES.filter(
      (entry) =>
        (!entry.adminOnly || isAdmin) &&
        (entry.title.toLowerCase().includes(q) ||
          entry.sectionLabel.toLowerCase().includes(q) ||
          entry.keywords.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [navSearch, isAdmin]);

  const activeMeta =
    visibleNavItems.find((item) => item.id === activeSection) ?? visibleNavItems[0]!;

  const shellSurfaceClass =
    resolvedTheme === 'amoled'
      ? 'bg-[var(--bg)] border border-[var(--border-strong)]'
      : reduceTransparency
        ? 'bg-[var(--surface-raised)] border border-[var(--border-strong)]'
        : 'bg-[var(--surface-raised)]/92 backdrop-blur-2xl border border-[var(--border-strong)]';

  const navSurfaceClass =
    resolvedTheme === 'amoled'
      ? 'bg-[var(--bg)] border-r border-[var(--border)]'
      : 'bg-[var(--surface-sidebar)]/85 border-r border-[var(--border)]';

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'account':
        return <AccountSection />;
      case 'interface':
        return <InterfaceSection />;
      case 'keyboard':
        return <KeyboardSection />;
      case 'usage':
        return <UsageSection />;
      case 'about':
        return <AboutSection onNavigateSection={(s) => requestSection(s)} />;
      case 'admin-general':
        return isAdmin ? <GeneralSettingsSection onDirtyStateChange={handleDirtyStateChange} /> : null;
      case 'admin-models':
        return isAdmin ? <ModelsSettingsSection /> : null;
      case 'admin-connections':
        return isAdmin ? (
          <ConnectionsSettingsSection onDirtyStateChange={handleDirtyStateChange} />
        ) : null;
      case 'admin-knowledge':
        return isAdmin ? <KnowledgeSettingsSection /> : null;
      case 'admin-users':
        return isAdmin ? (
          <UsersSettingsSection
            initialQuotaUserId={quotaUserId}
            onConsumeQuotaUserId={() => setQuotaUserId(null)}
          />
        ) : null;
      case 'admin-oauth':
        return isAdmin ? <OAuthSettingsSection onDirtyStateChange={handleDirtyStateChange} /> : null;
      case 'admin-email':
        return isAdmin ? <EmailSettingsSection onDirtyStateChange={handleDirtyStateChange} /> : null;
      case 'admin-skills':
        return <SkillsSettingsSection />;
      case 'admin-usage':
        return isAdmin ? (
          <UsageLimitsSection
            onDirtyStateChange={handleDirtyStateChange}
            onEditUserQuota={(uid) => {
              setQuotaUserId(uid);
              requestSection('admin-users');
            }}
          />
        ) : null;
      case 'admin-system':
        return isAdmin ? <SystemSettingsSection /> : null;
      default:
        return <AccountSection />;
    }
  };

  if (!user) return null;

  return (
    <>
      <Dialog.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <AnimatePresence>
          {isOpen && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild forceMount>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.22 }}
                  className="fixed inset-0 volq-settings-overlay bg-[var(--scrim-bg)] backdrop-blur-[4px]"
                />
              </Dialog.Overlay>
              <Dialog.Content
                asChild
                forceMount
                onEscapeKeyDown={(e) => {
                  e.preventDefault();
                  requestClose();
                }}
                onPointerDownOutside={(e) => {
                  if (dirtyState?.dirty) {
                    e.preventDefault();
                    requestClose();
                  }
                }}
              >
                <motion.div
                  aria-label="Settings and Admin Console"
                  initial={
                    reduceMotion
                      ? { opacity: 0 }
                      : isMobile
                        ? { opacity: 0, y: '100%' }
                        : { opacity: 0, y: 16, scale: 0.96 }
                  }
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: reduceMotion
                      ? { duration: 0 }
                      : isMobile
                        ? { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
                        : { type: 'spring', stiffness: 320, damping: 30, mass: 0.8 },
                  }}
                  exit={
                    reduceMotion
                      ? { opacity: 0 }
                      : isMobile
                        ? { opacity: 0, y: '100%', transition: { duration: 0.18 } }
                        : { opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.18 } }
                  }
                  className={`fixed inset-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 volq-settings-content w-screen h-dvh md:w-[96vw] lg:w-[min(1180px,94vw)] md:h-[92dvh] lg:h-[min(760px,88dvh)] md:rounded-[24px] overflow-hidden shadow-[var(--shadow-lg)] flex outline-none ${shellSurfaceClass}`}
                >
                  <Dialog.Title className="sr-only">Settings</Dialog.Title>
                  <Dialog.Description className="sr-only">
                    Manage your account, appearance, usage quotas, and workspace administration.
                  </Dialog.Description>

                  {/* Left Navigation Pane */}
                  <aside
                    className={`${
                      mobileShowDetail ? 'hidden md:flex' : 'flex'
                    } w-full md:w-[220px] lg:w-64 shrink-0 flex-col h-full ${navSurfaceClass}`}
                  >
                    <div className="px-3.5 pt-3.5 pb-2.5 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={requestClose}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-2)] hover:text-[var(--text)] px-2 py-1.5 rounded-[var(--radius-md)] hover:bg-[var(--surface-hover)] min-h-[36px]"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Back</span>
                      </button>
                      <button
                        type="button"
                        onClick={requestClose}
                        aria-label="Close settings"
                        className="md:hidden p-2 rounded-[var(--radius-md)] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="px-3.5 pb-3">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                        <Input
                          value={navSearch}
                          onChange={(e) => setNavSearch(e.target.value)}
                          placeholder="Search settings..."
                          aria-label="Search settings"
                          className="pl-8 h-9 text-base md:text-xs"
                        />
                      </div>
                    </div>

                    <nav
                      aria-label="Settings navigation"
                      className="flex-1 overflow-y-auto px-2.5 pb-3 space-y-4"
                    >
                      {navSearch.trim() ? (
                        <div className="space-y-1">
                          <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                            Matches
                          </div>
                          {searchMatches.length === 0 ? (
                            <div className="px-2.5 py-3 text-xs text-[var(--text-muted)]">
                              No matching settings.
                            </div>
                          ) : (
                            searchMatches.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                onClick={() => {
                                  setNavSearch('');
                                  requestSection(m.section, m.rowId);
                                }}
                                className="w-full text-left px-2.5 py-2 rounded-[var(--radius-md)] hover:bg-[var(--surface-hover)] transition-colors min-h-[44px] md:min-h-0"
                              >
                                <div className="text-sm md:text-xs font-medium text-[var(--text)]">
                                  {m.title}
                                </div>
                                <div className="text-[11px] text-[var(--text-muted)]">{m.sectionLabel}</div>
                              </button>
                            ))
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="space-y-0.5">
                            <div className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                              Personal
                            </div>
                            {userNavItems.map((item, idx) => {
                              const Icon = item.icon;
                              const active = item.id === activeSection;
                              return (
                                <motion.button
                                  key={item.id}
                                  type="button"
                                  initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ duration: 0.18, delay: reduceMotion ? 0 : idx * 0.025 }}
                                  onClick={() => requestSection(item.id)}
                                  aria-current={active ? 'page' : undefined}
                                  className={`relative w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-[var(--radius-md)] text-left text-sm transition-colors min-h-[44px] md:min-h-[38px] ${
                                    active
                                      ? 'text-[var(--text)] font-medium'
                                      : 'text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
                                  }`}
                                >
                                  {active && (
                                    <motion.span
                                      layoutId="active-settings-nav-pill"
                                      transition={{ type: 'spring', duration: reduceMotion ? 0 : 0.22, bounce: 0 }}
                                      className="absolute inset-0 rounded-[var(--radius-md)] bg-[var(--surface-active)]"
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span className="relative z-10 flex items-center gap-2.5 min-w-0">
                                    <Icon className="w-4 h-4 shrink-0" />
                                    <span className="truncate">{item.label}</span>
                                  </span>
                                  <ChevronRight className="relative z-10 w-4 h-4 text-[var(--text-subtle)] md:hidden shrink-0" />
                                </motion.button>
                              );
                            })}
                          </div>

                          {adminNavItems.length > 0 && (
                            <div className="space-y-0.5 pt-2 border-t border-[var(--border)]">
                              <div className="px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                                Administration
                              </div>
                              {adminNavItems.map((item, idx) => {
                                const Icon = item.icon;
                                const active = item.id === activeSection;
                                return (
                                  <motion.button
                                    key={item.id}
                                    type="button"
                                    initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ duration: 0.18, delay: reduceMotion ? 0 : (userNavItems.length + idx) * 0.025 }}
                                    onClick={() => requestSection(item.id)}
                                    aria-current={active ? 'page' : undefined}
                                    className={`relative w-full flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-[var(--radius-md)] text-left text-sm transition-colors min-h-[44px] md:min-h-[38px] ${
                                      active
                                        ? 'text-[var(--text)] font-medium'
                                        : 'text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]'
                                    }`}
                                  >
                                    {active && (
                                      <motion.span
                                        layoutId="active-settings-nav-pill"
                                        transition={{ type: 'spring', duration: reduceMotion ? 0 : 0.22, bounce: 0 }}
                                        className="absolute inset-0 rounded-[var(--radius-md)] bg-[var(--surface-active)]"
                                        aria-hidden="true"
                                      />
                                    )}
                                    <span className="relative z-10 flex items-center gap-2.5 min-w-0">
                                      <Icon className="w-4 h-4 shrink-0" />
                                      <span className="truncate">{item.label}</span>
                                    </span>
                                    <ChevronRight className="relative z-10 w-4 h-4 text-[var(--text-subtle)] md:hidden shrink-0" />
                                  </motion.button>
                                );
                              })}
                            </div>
                          )}
                        </>
                      )}
                    </nav>

                    <div className="px-3.5 py-3 border-t border-[var(--border)] flex items-center gap-2.5 min-w-0">
                      <UserAvatar user={user} size="sm" />
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-[var(--text)] truncate">
                          {user.displayName}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] truncate">{user.email}</div>
                      </div>
                    </div>
                  </aside>

                  {/* Right Detail Pane */}
                  <div
                    className={`${
                      mobileShowDetail ? 'flex' : 'hidden md:flex'
                    } flex-1 min-w-0 flex-col h-full relative`}
                  >
                    <header className="shrink-0 px-4 sm:px-7 py-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => setMobileShowDetail(false)}
                          aria-label="Back to settings list"
                          className="md:hidden p-2 -ml-1.5 rounded-[var(--radius-md)] text-[var(--text-2)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] min-w-[40px] min-h-[40px] flex items-center justify-center"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="min-w-0">
                          <h2 className="text-base sm:text-lg font-semibold text-[var(--text)] truncate">
                            {activeMeta.label}
                          </h2>
                          <p className="text-xs text-[var(--text-muted)] truncate">
                            {activeMeta.description}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={requestClose}
                        aria-label="Close settings modal"
                        className="p-2 rounded-full text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] min-w-[40px] min-h-[40px] flex items-center justify-center shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </header>

                    <div
                      ref={paneScrollRef}
                      className="flex-1 overflow-y-auto px-4 sm:px-7 py-5 sm:py-6"
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                          key={activeSection}
                          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
                          transition={{ duration: reduceMotion ? 0 : 0.16 }}
                          className="max-w-3xl"
                        >
                          {renderSectionContent()}
                        </motion.div>
                      </AnimatePresence>
                    </div>

                    {dirtyState?.dirty && (
                      <div className="shrink-0 px-4 sm:px-7 py-3 border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur-md flex flex-wrap items-center justify-between gap-3">
                        <span className="text-xs text-[var(--text-2)]">
                          {dirtyState.label ?? 'You have unsaved changes.'}
                        </span>
                        <div className="flex items-center gap-2 ml-auto">
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={dirtyState.saving}
                            onClick={dirtyState.onReset}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reset
                          </Button>
                          <Button
                            size="sm"
                            variant="primary"
                            disabled={dirtyState.saving}
                            onClick={() => void dirtyState.onSave()}
                          >
                            <Save className="w-3.5 h-3.5" />
                            {dirtyState.saving ? 'Saving...' : 'Save changes'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        title="Discard unsaved changes?"
        description="You have unsaved changes in this section. Leaving now will discard those edits."
        confirmLabel="Discard changes"
        onConfirm={() => {
          const action = pendingAction;
          setPendingAction(null);
          action?.();
        }}
      />
    </>
  );
};
