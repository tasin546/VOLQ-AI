import { create } from 'zustand';
import { apiFetch } from '../lib/api';
import type { BrandingSettings, DarkStyle, ThemeMode, UserUsageSummary } from '../lib/types';

export type ResolvedTheme = 'obsidian' | 'amoled' | 'frost';
export type ChatFilterMode = 'all' | 'pinned';

export interface ToastItem {
  id: string;
  message: string;
  tone: 'info' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}

export const DEFAULT_BRANDING_STATE: BrandingSettings = {
  siteName: 'VOLQ AI',
  tagline: 'Self-hosted AI workspace',
  logoMode: 'default',
  iconName: 'Sparkles',
  iconColor: '',
  hasUploadedLogo: false,
  hasFavicon: false,
  defaultTheme: 'dark',
  assetVersion: 1,
};

export function resolveThemeMode(
  theme: ThemeMode,
  darkStyle: DarkStyle = 'dark',
  systemPrefersLight?: boolean
): ResolvedTheme {
  const prefersLight =
    systemPrefersLight ??
    (typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: light)').matches);

  if (theme === 'system') {
    if (prefersLight) return 'frost';
    return darkStyle === 'amoled' ? 'amoled' : 'obsidian';
  }
  if (theme === 'light') return 'frost';
  if (theme === 'amoled') return 'amoled';
  return 'obsidian';
}

function readMetaBgColor(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) return;
  const computed = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (computed) {
    meta.content = computed;
    return;
  }
  meta.content = resolved === 'amoled' ? 'black' : resolved === 'frost' ? 'white' : 'black';
}

export function applyThemeToDom(theme: ThemeMode, darkStyle: DarkStyle = 'dark'): ResolvedTheme {
  const resolved = resolveThemeMode(theme, darkStyle);
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved);
    readMetaBgColor(resolved);
  }
  return resolved;
}

function applyReduceTransparencyToDom(reduce: boolean): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-reduce-transparency', reduce ? 'true' : 'false');
  }
}

function applyReduceMotionToDom(reduce: boolean): void {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-reduce-motion', reduce ? 'true' : 'false');
  }
}

function applyBrandingToDom(branding: BrandingSettings, activeChatTitle?: string | null): void {
  if (typeof document === 'undefined') return;
  const site = branding.siteName || 'VOLQ AI';
  document.title = activeChatTitle ? `${activeChatTitle} - ${site}` : site;

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (branding.hasFavicon || branding.hasUploadedLogo) {
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = `/api/branding/asset/favicon?v=${branding.assetVersion}`;
  } else if (link) {
    link.remove();
  }
}

function readStorage(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
}

const storedTheme = ((): ThemeMode | null => {
  const val = readStorage('volq_theme');
  if (val === 'light' || val === 'dark' || val === 'amoled' || val === 'system') return val;
  return null;
})();

const storedDarkStyle = ((): DarkStyle => {
  return readStorage('volq_dark_style') === 'amoled' ? 'amoled' : 'dark';
})();

const storedReduceTransparency = ((): boolean => {
  const val = readStorage('volq_reduce_transparency');
  if (val === 'true') return true;
  if (val === 'false') return false;
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-transparency: reduce)').matches
  );
})();

const storedReduceMotion = ((): boolean => {
  const val = readStorage('volq_reduce_motion');
  if (val === 'true') return true;
  if (val === 'false') return false;
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
})();

const storedSidebarCollapsed = ((): boolean => {
  const val = readStorage('volq_sidebar_collapsed');
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (typeof window !== 'undefined') {
    return window.innerWidth >= 768 && window.innerWidth < 1024;
  }
  return false;
})();

const storedChatFilter = ((): ChatFilterMode => {
  return readStorage('volq_chat_filter') === 'pinned' ? 'pinned' : 'all';
})();

interface UiState {
  theme: ThemeMode;
  darkStyle: DarkStyle;
  resolvedTheme: ResolvedTheme;
  reduceTransparency: boolean;
  reduceMotion: boolean;
  sidebarCollapsed: boolean;
  chatFilter: ChatFilterMode;
  mobileDrawerOpen: boolean;
  modelPickerOpen: boolean;
  globalPaletteOpen: boolean;
  shortcutsModalOpen: boolean;
  activeChatTitle: string | null;
  isOffline: boolean;
  branding: BrandingSettings;
  brandingLoaded: boolean;
  usageSummary: UserUsageSummary | null;
  toasts: ToastItem[];
  fetchUsageSummary: () => Promise<void>;
  setUsageSummary: (summary: UserUsageSummary | null) => void;
  setTheme: (theme: ThemeMode) => void;
  setDarkStyle: (darkStyle: DarkStyle) => void;
  setReduceTransparency: (reduce: boolean) => void;
  setReduceMotion: (reduce: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setChatFilter: (filter: ChatFilterMode) => void;
  setMobileDrawerOpen: (open: boolean) => void;
  setModelPickerOpen: (open: boolean) => void;
  setGlobalPaletteOpen: (open: boolean) => void;
  setShortcutsModalOpen: (open: boolean) => void;
  setActiveChatTitle: (title: string | null) => void;
  setIsOffline: (offline: boolean) => void;
  syncFromUserPreferences: (prefs: {
    theme?: ThemeMode;
    darkStyle?: DarkStyle;
    reduceTransparency?: boolean;
    reduceMotion?: boolean | null;
  }) => void;
  loadBranding: () => Promise<void>;
  setBranding: (branding: BrandingSettings) => void;
  pushToast: (
    message: string,
    tone?: 'info' | 'error',
    options?: { actionLabel?: string; onAction?: () => void; durationMs?: number }
  ) => string;
  dismissToast: (id: string) => void;
}

const initialResolved = applyThemeToDom(storedTheme ?? 'dark', storedDarkStyle);
applyReduceTransparencyToDom(storedReduceTransparency);
applyReduceMotionToDom(storedReduceMotion);

export const useUiStore = create<UiState>((set, get) => ({
  theme: storedTheme ?? 'dark',
  darkStyle: storedDarkStyle,
  resolvedTheme: initialResolved,
  reduceTransparency: storedReduceTransparency,
  reduceMotion: storedReduceMotion,
  sidebarCollapsed: storedSidebarCollapsed,
  chatFilter: storedChatFilter,
  mobileDrawerOpen: false,
  modelPickerOpen: false,
  globalPaletteOpen: false,
  shortcutsModalOpen: false,
  activeChatTitle: null,
  isOffline: typeof navigator !== 'undefined' ? !navigator.onLine : false,
  branding: DEFAULT_BRANDING_STATE,
  brandingLoaded: false,
  usageSummary: null,
  toasts: [],

  fetchUsageSummary: async () => {
    try {
      const res = await apiFetch<UserUsageSummary>('/api/usage/me');
      set({ usageSummary: res });
    } catch {
      // ignore if unauthenticated or offline
    }
  },

  setUsageSummary: (usageSummary) => set({ usageSummary }),

  setTheme: (theme) => {
    writeStorage('volq_theme', theme);
    const resolvedTheme = applyThemeToDom(theme, get().darkStyle);
    set({ theme, resolvedTheme });
  },

  setDarkStyle: (darkStyle) => {
    writeStorage('volq_dark_style', darkStyle);
    const resolvedTheme = applyThemeToDom(get().theme, darkStyle);
    set({ darkStyle, resolvedTheme });
  },

  setReduceTransparency: (reduceTransparency) => {
    writeStorage('volq_reduce_transparency', String(reduceTransparency));
    applyReduceTransparencyToDom(reduceTransparency);
    set({ reduceTransparency });
  },

  setReduceMotion: (reduceMotion) => {
    writeStorage('volq_reduce_motion', String(reduceMotion));
    applyReduceMotionToDom(reduceMotion);
    set({ reduceMotion });
  },

  setSidebarCollapsed: (sidebarCollapsed) => {
    writeStorage('volq_sidebar_collapsed', String(sidebarCollapsed));
    set({ sidebarCollapsed });
  },

  toggleSidebarCollapsed: () => {
    const next = !get().sidebarCollapsed;
    writeStorage('volq_sidebar_collapsed', String(next));
    set({ sidebarCollapsed: next });
  },

  setChatFilter: (chatFilter) => {
    writeStorage('volq_chat_filter', chatFilter);
    set({ chatFilter });
  },

  setMobileDrawerOpen: (mobileDrawerOpen) => set({ mobileDrawerOpen }),
  setModelPickerOpen: (modelPickerOpen) => set({ modelPickerOpen }),
  setGlobalPaletteOpen: (globalPaletteOpen) => set({ globalPaletteOpen }),
  setShortcutsModalOpen: (shortcutsModalOpen) => set({ shortcutsModalOpen }),

  setActiveChatTitle: (activeChatTitle) => {
    set({ activeChatTitle });
    applyBrandingToDom(get().branding, activeChatTitle);
  },

  setIsOffline: (isOffline) => set({ isOffline }),

  syncFromUserPreferences: (prefs) => {
    const nextTheme = prefs.theme ?? get().theme;
    const nextDarkStyle = prefs.darkStyle ?? get().darkStyle;
    const nextReduceTx =
      typeof prefs.reduceTransparency === 'boolean'
        ? prefs.reduceTransparency
        : get().reduceTransparency;
    const nextReduceMotion =
      typeof prefs.reduceMotion === 'boolean' ? prefs.reduceMotion : get().reduceMotion;

    writeStorage('volq_theme', nextTheme);
    writeStorage('volq_dark_style', nextDarkStyle);
    writeStorage('volq_reduce_transparency', String(nextReduceTx));
    if (typeof prefs.reduceMotion === 'boolean') {
      writeStorage('volq_reduce_motion', String(nextReduceMotion));
    }

    const resolvedTheme = applyThemeToDom(nextTheme, nextDarkStyle);
    applyReduceTransparencyToDom(nextReduceTx);
    applyReduceMotionToDom(nextReduceMotion);
    set({
      theme: nextTheme,
      darkStyle: nextDarkStyle,
      resolvedTheme,
      reduceTransparency: nextReduceTx,
      reduceMotion: nextReduceMotion,
    });
  },

  loadBranding: async () => {
    try {
      const res = await apiFetch<{ branding: BrandingSettings }>('/api/branding');
      applyBrandingToDom(res.branding, get().activeChatTitle);
      if (!storedTheme && res.branding.defaultTheme) {
        const resolvedTheme = applyThemeToDom(res.branding.defaultTheme, get().darkStyle);
        set({
          branding: res.branding,
          brandingLoaded: true,
          theme: res.branding.defaultTheme,
          resolvedTheme,
        });
        return;
      }
      set({ branding: res.branding, brandingLoaded: true });
    } catch {
      set({ brandingLoaded: true });
    }
  },

  setBranding: (branding) => {
    applyBrandingToDom(branding, get().activeChatTitle);
    set({ branding });
  },

  pushToast: (message, tone = 'info', options) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({
      toasts: [
        ...s.toasts.slice(-3),
        {
          id,
          message,
          tone,
          actionLabel: options?.actionLabel,
          onAction: options?.onAction,
        },
      ],
    }));
    const duration = options?.durationMs ?? (options?.actionLabel ? 6000 : 3800);
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, duration);
    return id;
  },

  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const onChange = () => {
    const state = useUiStore.getState();
    if (state.theme === 'system') {
      const resolvedTheme = applyThemeToDom('system', state.darkStyle);
      useUiStore.setState({ resolvedTheme });
    }
  };
  mq.addEventListener?.('change', onChange);

  window.addEventListener('online', () => useUiStore.getState().setIsOffline(false));
  window.addEventListener('offline', () => useUiStore.getState().setIsOffline(true));
}
