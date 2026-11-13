import { create } from 'zustand';
import { apiFetch, setCsrfToken } from '../lib/api';
import type { AuthStatus, User, UserPreferences } from '../lib/types';
import { useUiStore } from './uiStore';

interface AuthState {
  user: User | null;
  status: AuthStatus | null;
  loading: boolean;
  initialized: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<{ requiresVerification?: boolean; email?: string } | void>;
  logout: () => Promise<void>;
  updateProfile: (payload: {
    displayName?: string;
    preferences?: Partial<UserPreferences>;
  }) => Promise<void>;
  setAvatar: (hasAvatar: boolean, avatarVersion: string | null) => void;
  completeOnboarding: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  status: null,
  loading: false,
  initialized: false,

  bootstrap: async () => {
    set({ loading: true });
    try {
      await useUiStore.getState().loadBranding();
      const status = await apiFetch<AuthStatus>('/api/auth/status');
      try {
        const me = await apiFetch<{ user: User; csrfToken: string }>('/api/auth/me');
        setCsrfToken(me.csrfToken);
        useUiStore.getState().syncFromUserPreferences(me.user.preferences);
        set({ user: me.user, status, initialized: true, loading: false });
      } catch {
        setCsrfToken(null);
        set({ user: null, status, initialized: true, loading: false });
      }
    } catch {
      set({ initialized: true, loading: false });
    }
  },

  login: async (email, password) => {
    const res = await apiFetch<{ user: User; csrfToken: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setCsrfToken(res.csrfToken);
    useUiStore.getState().syncFromUserPreferences(res.user.preferences);
    set({ user: res.user });
  },

  register: async (email, password, displayName) => {
    const res = await apiFetch<{
      user?: User;
      csrfToken?: string;
      requiresVerification?: boolean;
      email?: string;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    });

    if (res.requiresVerification) {
      return { requiresVerification: true, email: res.email || email };
    }

    if (res.user && res.csrfToken) {
      setCsrfToken(res.csrfToken);
      useUiStore.getState().syncFromUserPreferences(res.user.preferences);
      set({
        user: res.user,
        status: { needsSetup: false, signupMode: 'open' },
      });
    }
    return { requiresVerification: false };
  },

  logout: async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setCsrfToken(null);
      set({ user: null });
    }
  },

  updateProfile: async (payload) => {
    const res = await apiFetch<{ user: User }>('/api/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    useUiStore.getState().syncFromUserPreferences(res.user.preferences);
    set({ user: res.user });
  },

  setAvatar: (hasAvatar, avatarVersion) =>
    set((s) => ({
      user: s.user ? { ...s.user, hasAvatar, avatarVersion } : null,
    })),

  completeOnboarding: () =>
    set((s) => ({
      user: s.user
        ? { ...s.user, onboardingCompletedAt: new Date().toISOString() }
        : null,
    })),
}));
