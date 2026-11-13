import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Plus, RotateCcw, Search, Trash2, Upload } from 'lucide-react';
import { BRAND_ICON_MAP, BrandMark } from '../../../brand/BrandMark';
import { Button, ConfirmDialog, Input } from '../../../ui/Primitives';
import { apiFetch, getCsrfToken } from '../../../../lib/api';
import type { BrandingSettings, StarterPrompt, ThemeMode, WelcomeSettings } from '../../../../lib/types';
import { useChatStore } from '../../../../stores/chatStore';
import { useUiStore } from '../../../../stores/uiStore';
import type { AdminDirtyState } from '../../SettingsSearchIndex';

const ICON_SWATCH_VARS = [
  '--swatch-1',
  '--swatch-2',
  '--swatch-3',
  '--swatch-4',
  '--swatch-5',
  '--swatch-6',
];

export const GeneralSettingsSection: React.FC<{
  onDirtyStateChange?: (state: AdminDirtyState | null) => void;
}> = ({ onDirtyStateChange }) => {
  const { branding, setBranding, pushToast } = useUiStore();
  const loadInitialData = useChatStore((s) => s.loadInitialData);

  const [siteName, setSiteName] = useState(branding.siteName);
  const [logoMode, setLogoMode] = useState<'default' | 'upload' | 'icon'>(branding.logoMode);
  const [iconName, setIconName] = useState(branding.iconName);
  const [iconColor, setIconColor] = useState(branding.iconColor);
  const [defaultTheme, setDefaultTheme] = useState<ThemeMode>(branding.defaultTheme);
  const [iconSearch, setIconSearch] = useState('');

  const [signupMode, setSignupMode] = useState<'open' | 'disabled'>('open');
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState('');
  const [starterPrompts, setStarterPrompts] = useState<StarterPrompt[]>([]);

  // Welcome screen settings
  const [welcomeEnabled, setWelcomeEnabled] = useState(true);
  const [welcomeHeadline, setWelcomeHeadline] = useState('');
  const [welcomeDescription, setWelcomeDescription] = useState('');
  const [savingWelcome, setSavingWelcome] = useState(false);

  const [initialPayload, setInitialPayload] = useState<{
    siteName: string;
    logoMode: 'default' | 'upload' | 'icon';
    iconName: string;
    iconColor: string;
    defaultTheme: ThemeMode;
    signupMode: 'open' | 'disabled';
    globalSystemPrompt: string;
    starterPrompts: StarterPrompt[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const [res, welcomeRes] = await Promise.all([
          apiFetch<{
            signupMode: 'open' | 'disabled';
            globalSystemPrompt: string;
            starterPrompts: StarterPrompt[];
          }>('/api/admin/settings'),
          apiFetch<{ welcome: WelcomeSettings }>('/api/admin/welcome'),
        ]);
        setSignupMode(res.signupMode);
        setGlobalSystemPrompt(res.globalSystemPrompt);
        setStarterPrompts(res.starterPrompts);
        setWelcomeEnabled(welcomeRes.welcome.enabled !== false);
        setWelcomeHeadline(welcomeRes.welcome.headline || '');
        setWelcomeDescription(welcomeRes.welcome.description || '');
        setInitialPayload({
          siteName: branding.siteName,
          logoMode: branding.logoMode,
          iconName: branding.iconName,
          iconColor: branding.iconColor,
          defaultTheme: branding.defaultTheme,
          signupMode: res.signupMode,
          globalSystemPrompt: res.globalSystemPrompt,
          starterPrompts: res.starterPrompts,
        });
      } catch {
        // Handled silently
      }
    })();
  }, [branding.siteName, branding.logoMode, branding.iconName, branding.iconColor, branding.defaultTheme]);

  const currentSnapshot = JSON.stringify({
    siteName,
    logoMode,
    iconName,
    iconColor,
    defaultTheme,
    signupMode,
    globalSystemPrompt,
    starterPrompts,
  });
  const initialSnapshot = initialPayload ? JSON.stringify(initialPayload) : '';
  const isDirty = initialSnapshot !== '' && currentSnapshot !== initialSnapshot;

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const cleanPrompts = starterPrompts.filter((p) => p.label.trim() && p.prompt.trim());
      const [brandRes] = await Promise.all([
        apiFetch<{ branding: BrandingSettings }>('/api/admin/branding', {
          method: 'PUT',
          body: JSON.stringify({
            siteName: siteName.trim() || 'VOLQ AI',
            logoMode,
            iconName,
            iconColor,
            defaultTheme,
          }),
        }),
        apiFetch('/api/admin/settings', {
          method: 'PATCH',
          body: JSON.stringify({
            signupMode,
            globalSystemPrompt,
            starterPrompts: cleanPrompts,
          }),
        }),
      ]);
      setBranding(brandRes.branding);
      await loadInitialData();
      setInitialPayload({
        siteName: brandRes.branding.siteName,
        logoMode: brandRes.branding.logoMode,
        iconName: brandRes.branding.iconName,
        iconColor: brandRes.branding.iconColor,
        defaultTheme: brandRes.branding.defaultTheme,
        signupMode,
        globalSystemPrompt,
        starterPrompts: cleanPrompts,
      });
      pushToast('General and branding settings saved');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to save settings', 'error');
    } finally {
      setSaving(false);
    }
  }, [
    siteName,
    logoMode,
    iconName,
    iconColor,
    defaultTheme,
    signupMode,
    globalSystemPrompt,
    starterPrompts,
    setBranding,
    loadInitialData,
    pushToast,
  ]);

  const handleResetEdits = useCallback(() => {
    if (!initialPayload) return;
    setSiteName(initialPayload.siteName);
    setLogoMode(initialPayload.logoMode);
    setIconName(initialPayload.iconName);
    setIconColor(initialPayload.iconColor);
    setDefaultTheme(initialPayload.defaultTheme);
    setSignupMode(initialPayload.signupMode);
    setGlobalSystemPrompt(initialPayload.globalSystemPrompt);
    setStarterPrompts(initialPayload.starterPrompts);
  }, [initialPayload]);

  const handleSaveWelcome = useCallback(async () => {
    setSavingWelcome(true);
    try {
      await apiFetch('/api/admin/welcome', {
        method: 'PUT',
        body: JSON.stringify({
          enabled: welcomeEnabled,
          headline: welcomeHeadline.trim() || null,
          description: welcomeDescription.trim() || null,
        }),
      });
      pushToast('Welcome screen settings saved');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to save welcome settings', 'error');
    } finally {
      setSavingWelcome(false);
    }
  }, [welcomeEnabled, welcomeHeadline, welcomeDescription, pushToast]);

  const handleResetWelcome = useCallback(async () => {
    setSavingWelcome(true);
    try {
      const res = await apiFetch<{ welcome: WelcomeSettings }>('/api/admin/welcome', {
        method: 'PUT',
        body: JSON.stringify({ resetToDefault: true }),
      });
      setWelcomeEnabled(res.welcome.enabled !== false);
      setWelcomeHeadline('');
      setWelcomeDescription('');
      pushToast('Welcome screen reset to default');
    } catch {
      pushToast('Failed to reset welcome screen', 'error');
    } finally {
      setSavingWelcome(false);
    }
  }, [pushToast]);

  useEffect(() => {
    if (!onDirtyStateChange) return;
    if (isDirty) {
      onDirtyStateChange({
        dirty: true,
        saving,
        label: 'Unsaved general & branding changes',
        onSave: handleSave,
        onReset: handleResetEdits,
      });
    } else {
      onDirtyStateChange(null);
    }
    return () => onDirtyStateChange(null);
  }, [isDirty, saving, handleSave, handleResetEdits, onDirtyStateChange]);

  const previewBranding: BrandingSettings = {
    ...branding,
    siteName: siteName.trim() || 'VOLQ AI',
    logoMode,
    iconName,
    iconColor,
    defaultTheme,
  };

  const filteredIcons = useMemo(() => {
    const q = iconSearch.trim().toLowerCase();
    return Object.keys(BRAND_ICON_MAP).filter((name) => !q || name.toLowerCase().includes(q));
  }, [iconSearch]);

  const handleUploadAsset = async (kind: 'logo' | 'favicon', file: File) => {
    const form = new FormData();
    form.append('file', file);
    const csrf = getCsrfToken();

    try {
      const res = await fetch(`/api/admin/branding/${kind}`, {
        method: 'POST',
        headers: csrf ? { 'X-CSRF-Token': csrf } : {},
        credentials: 'include',
        body: form,
      });
      const data = (await res.json()) as { branding?: BrandingSettings; error?: string };
      if (!res.ok || !data.branding) {
        throw new Error(data.error ?? 'Upload failed');
      }
      setBranding(data.branding);
      if (kind === 'logo') setLogoMode('upload');
      pushToast(`${kind === 'logo' ? 'Logo' : 'Favicon'} updated`);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Asset upload failed', 'error');
    }
  };

  const handleResetBranding = async () => {
    try {
      const res = await apiFetch<{ branding: BrandingSettings }>('/api/admin/branding', {
        method: 'PUT',
        body: JSON.stringify({ resetToDefault: true }),
      });
      setBranding(res.branding);
      setSiteName(res.branding.siteName);
      setLogoMode(res.branding.logoMode);
      setIconName(res.branding.iconName);
      setIconColor(res.branding.iconColor);
      setDefaultTheme(res.branding.defaultTheme);
      pushToast('Branding reset to default');
    } catch {
      pushToast('Failed to reset branding', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <section
        data-setting-row="admin-branding"
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 space-y-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium text-[var(--text)]">Site branding</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Customize your instance name, sidebar mark, and browser icon.
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setConfirmResetOpen(true)}>
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to default
          </Button>
          <ConfirmDialog
            open={confirmResetOpen}
            onOpenChange={setConfirmResetOpen}
            title="Reset branding to default"
            description={`Reset "${siteName || branding.siteName}" branding, logo, favicon, and icon customization back to default VOLQ AI branding?`}
            confirmLabel="Reset branding"
            onConfirm={async () => {
              setConfirmResetOpen(false);
              await handleResetBranding();
            }}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div>
              <label htmlFor="admin-site-name" className="block text-xs text-[var(--text-2)] mb-1">
                Website name
              </label>
              <Input
                id="admin-site-name"
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="VOLQ AI"
              />
            </div>

            <div>
              <span className="block text-xs text-[var(--text-2)] mb-1.5">Logo source</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'default', label: 'Default' },
                    { id: 'icon', label: 'Icon picker' },
                    { id: 'upload', label: 'Uploaded' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setLogoMode(mode.id)}
                    className={`h-9 rounded-[var(--radius-md)] text-xs font-medium border transition-colors ${
                      logoMode === mode.id
                        ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)]'
                        : 'bg-[var(--surface-raised)] border-[var(--border)] text-[var(--text-2)] hover:text-[var(--text)]'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <input
                ref={logoInputRef}
                type="file"
                accept=".svg,.png,.jpg,.jpeg,.webp,.ico,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUploadAsset('logo', f);
                  e.target.value = '';
                }}
              />
              <Button size="sm" variant="secondary" onClick={() => logoInputRef.current?.click()}>
                <Upload className="w-3.5 h-3.5" />
                Upload logo
              </Button>

              <input
                ref={faviconInputRef}
                type="file"
                accept=".svg,.png,.jpg,.jpeg,.webp,.ico,image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUploadAsset('favicon', f);
                  e.target.value = '';
                }}
              />
              <Button size="sm" variant="secondary" onClick={() => faviconInputRef.current?.click()}>
                <Upload className="w-3.5 h-3.5" />
                Upload favicon
              </Button>
            </div>
          </div>

          <div className="rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)] p-4 space-y-3">
            <div className="text-[11px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
              Live preview
            </div>
            <div className="p-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] flex items-center justify-between">
              <BrandMark size={26} showName override={previewBranding} />
              <span className="text-[11px] font-mono text-[var(--text-muted)]">Sidebar</span>
            </div>
            <div className="p-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] space-y-1">
              <BrandMark size={28} showName override={previewBranding} />
              <div className="text-xs text-[var(--text-2)]">
                Sign in to {previewBranding.siteName}
              </div>
            </div>
          </div>
        </div>

        {logoMode === 'icon' && (
          <div className="border-t border-[var(--border)] pt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="w-full sm:w-64 relative">
                <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={iconSearch}
                  onChange={(e) => setIconSearch(e.target.value)}
                  placeholder="Filter icons..."
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-1.5">
                {ICON_SWATCH_VARS.map((cssVar) => (
                  <button
                    key={cssVar}
                    type="button"
                    onClick={() => {
                      const resolved = getComputedStyle(document.documentElement)
                        .getPropertyValue(cssVar)
                        .trim()
                        .toUpperCase();
                      if (resolved) setIconColor(resolved);
                    }}
                    aria-label={`Select color swatch ${cssVar}`}
                    className="w-6 h-6 rounded-full border border-[var(--border)] hover:scale-110 transition-transform"
                    style={{ backgroundColor: `var(${cssVar})` }}
                  />
                ))}
                <input
                  type="text"
                  value={iconColor}
                  onChange={(e) => setIconColor(e.target.value)}
                  aria-label="Custom hex color"
                  className="w-20 h-7 px-2 rounded-[var(--radius-sm)] bg-[var(--surface-raised)] border border-[var(--border)] text-xs font-mono text-[var(--text)]"
                />
              </div>
            </div>

            <div className="grid grid-cols-6 sm:grid-cols-10 gap-1.5">
              {filteredIcons.map((name) => {
                const Icon = BRAND_ICON_MAP[name]!;
                const active = iconName === name;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setIconName(name)}
                    title={name}
                    aria-label={name}
                    className={`h-10 rounded-[var(--radius-md)] flex items-center justify-center border transition-colors ${
                      active
                        ? 'bg-[var(--surface-active)] border-[var(--accent)]'
                        : 'bg-[var(--surface-raised)] border-[var(--border)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <Icon className="w-4 h-4" style={{ color: iconColor || undefined }} />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Defaults & Registration */}
      <section
        data-setting-row="admin-registration"
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 space-y-4"
      >
        <h3 className="text-sm font-medium text-[var(--text)]">Instance defaults &amp; registration</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span className="block text-xs text-[var(--text-2)] mb-1.5">
              Default theme for new visitors
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {(['dark', 'amoled', 'light', 'system'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setDefaultTheme(t)}
                  className={`h-9 rounded-[var(--radius-md)] text-xs font-medium border ${
                    defaultTheme === t
                      ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)]'
                      : 'bg-[var(--surface-raised)] border-[var(--border)] text-[var(--text-2)]'
                  }`}
                >
                  {t === 'dark'
                    ? 'Obsidian'
                    : t === 'amoled'
                      ? 'AMOLED'
                      : t === 'light'
                        ? 'Frost'
                        : 'System'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block text-xs text-[var(--text-2)] mb-1.5">
              New email sign-ups
            </span>
            <div className="grid grid-cols-2 gap-1.5">
              {(['open', 'disabled'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSignupMode(mode)}
                  className={`h-9 rounded-[var(--radius-md)] text-xs font-medium border ${
                    signupMode === mode
                      ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)]'
                      : 'bg-[var(--surface-raised)] border-[var(--border)] text-[var(--text-2)]'
                  }`}
                >
                  {mode === 'open' ? 'Open signups' : 'Disabled'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="admin-global-prompt" className="block text-xs text-[var(--text-2)] mb-1">
            Global default system prompt (hidden from non-admins)
          </label>
          <textarea
            id="admin-global-prompt"
            rows={3}
            value={globalSystemPrompt}
            onChange={(e) => setGlobalSystemPrompt(e.target.value)}
            placeholder="Optional organization-wide instructions..."
            className="w-full p-3 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)] text-base sm:text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-strong)]"
          />
        </div>
      </section>

      {/* Starter Chips */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-[var(--text)]">Starter prompt chips</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Displayed under the composer on empty chats (up to 4).
            </p>
          </div>
          {starterPrompts.length < 4 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                setStarterPrompts((prev) => [
                  ...prev,
                  { id: `chip-${Date.now()}`, label: 'New starter', prompt: '' },
                ])
              }
            >
              <Plus className="w-3.5 h-3.5" />
              Add chip
            </Button>
          )}
        </div>

        <div className="space-y-2.5">
          {starterPrompts.map((chip, idx) => (
            <div
              key={chip.id}
              className="p-3 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)] space-y-2"
            >
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  value={chip.label}
                  onChange={(e) =>
                    setStarterPrompts((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item))
                    )
                  }
                  placeholder="Label"
                />
                <button
                  type="button"
                  onClick={() => setStarterPrompts((prev) => prev.filter((_, i) => i !== idx))}
                  aria-label="Remove chip"
                  className="p-2 rounded-[var(--radius-md)] text-[var(--text-muted)] hover:text-[var(--status-error)] hover:bg-[var(--status-error-soft)]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <Input
                type="text"
                value={chip.prompt}
                onChange={(e) =>
                  setStarterPrompts((prev) =>
                    prev.map((item, i) => (i === idx ? { ...item, prompt: e.target.value } : item))
                  )
                }
                placeholder="Prompt inserted when clicked"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Welcome Screen Settings Card */}
      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-[var(--text)]">Welcome screen</h3>
            <p className="text-xs text-[var(--text-muted)]">
              Cinematic mountain-sunset welcome hero shown to first-time visitors on "/".
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={welcomeEnabled}
            aria-label="Enable welcome screen"
            onClick={() => setWelcomeEnabled((prev) => !prev)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-white ${
              welcomeEnabled ? 'bg-[var(--accent)]' : 'bg-[var(--surface-active)]'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-[var(--bg)] shadow-lg ring-0 transition duration-200 ease-in-out ${
                welcomeEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="admin-welcome-headline" className="block text-xs text-[var(--text-muted)] mb-1">
              Custom headline (leave empty for default)
            </label>
            <Input
              id="admin-welcome-headline"
              type="text"
              maxLength={120}
              value={welcomeHeadline}
              onChange={(e) => setWelcomeHeadline(e.target.value)}
              placeholder="Think with any model. Keep everything yours."
            />
          </div>

          <div>
            <label htmlFor="admin-welcome-description" className="block text-xs text-[var(--text-muted)] mb-1">
              Custom description (leave empty for default)
            </label>
            <textarea
              id="admin-welcome-description"
              rows={2}
              maxLength={400}
              value={welcomeDescription}
              onChange={(e) => setWelcomeDescription(e.target.value)}
              placeholder="A self-hosted workspace for local and API models..."
              className="w-full p-3 rounded-[var(--radius-md)] bg-[var(--surface-raised)] border border-[var(--border)] text-base sm:text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--border-strong)]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-[var(--border-subtle)] flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={handleResetWelcome}
              disabled={savingWelcome}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset to default
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => window.open('/welcome?preview=true', '_blank')}
            >
              <Eye className="w-3.5 h-3.5" />
              Preview
            </Button>
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={handleSaveWelcome}
            disabled={savingWelcome}
          >
            {savingWelcome ? 'Saving...' : 'Save welcome settings'}
          </Button>
        </div>
      </section>
    </div>
  );
};
