import React, { useState } from 'react';
import { Check, Monitor, Save } from 'lucide-react';
import type { DarkStyle, ThemeMode } from '../../../lib/types';
import { getAllIanaTimezones, getSystemTimezone } from '../../../lib/timezone';
import { Button, Select, Switch } from '../../ui/Primitives';
import { useAuthStore } from '../../../stores/authStore';
import { useChatStore } from '../../../stores/chatStore';
import { useUiStore } from '../../../stores/uiStore';

const ThemePreviewCard: React.FC<{
  mode: 'dark' | 'amoled' | 'frost-preview';
  title: string;
  subtitle: string;
  active: boolean;
  onSelect: () => void;
}> = ({ mode, title, subtitle, active, onSelect }) => {
  const dataTheme =
    mode === 'amoled' ? 'amoled' : mode === 'frost-preview' ? 'frost' : 'obsidian';

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`text-left rounded-[var(--radius-lg)] p-2.5 border transition-colors ${
        active
          ? 'border-[var(--accent)] bg-[var(--surface-active)]'
          : 'border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]'
      }`}
    >
      <div
        data-theme={dataTheme}
        className="h-20 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg)] text-[var(--text)] p-2 flex gap-2 overflow-hidden"
      >
        <div className="w-9 shrink-0 rounded-[var(--radius-sm)] bg-[var(--surface-sidebar)] border border-[var(--border)] p-1.5 space-y-1">
          <div className="h-1.5 w-4 rounded-full bg-[var(--text)] opacity-80" />
          <div className="h-1.5 w-full rounded-full bg-[var(--surface-active)]" />
          <div className="h-1.5 w-4/5 rounded-full bg-[var(--surface-hover)]" />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-between p-0.5">
          <div className="space-y-1">
            <div className="ml-auto h-2.5 w-10 rounded-full bg-[var(--user-bubble-bg)] border border-[var(--border)]" />
            <div className="h-2 w-14 rounded-full bg-[var(--text)] opacity-55" />
          </div>
          <div className="flex items-center justify-between gap-1 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-0.5">
            <span className="h-1.5 w-7 rounded-full bg-[var(--text-subtle)]" />
            <span className="h-2 w-2 rounded-full bg-[var(--accent)]" />
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <div className="text-sm font-medium text-[var(--text)]">{title}</div>
          <div className="text-xs text-[var(--text-muted)] truncate">{subtitle}</div>
        </div>
        {active && (
          <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center shrink-0">
            <Check className="w-3 h-3" strokeWidth={2.5} />
          </span>
        )}
      </div>
    </button>
  );
};

export const InterfaceSection: React.FC = () => {
  const { user, updateProfile } = useAuthStore();
  const models = useChatStore((s) => s.models);
  const {
    theme,
    darkStyle,
    reduceTransparency,
    reduceMotion,
    setTheme,
    setDarkStyle,
    setReduceTransparency,
    setReduceMotion,
    pushToast,
  } = useUiStore();

  const [defaultModel, setDefaultModel] = useState<string>(user?.preferences.defaultModel ?? '');
  const [sendOnEnter, setSendOnEnter] = useState<boolean>(
    user?.preferences.sendOnEnter ?? true
  );
  const [savingChat, setSavingChat] = useState(false);

  const persistPatch = async (
    patch: Parameters<typeof updateProfile>[0]['preferences'],
    toast?: string
  ) => {
    try {
      await updateProfile({ preferences: patch });
      if (toast) pushToast(toast);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to update settings', 'error');
    }
  };

  const handleThemePick = async (next: ThemeMode) => {
    setTheme(next);
    await persistPatch({ theme: next });
  };

  const handleDarkStylePick = async (next: DarkStyle) => {
    setDarkStyle(next);
    await persistPatch({ darkStyle: next });
  };

  const handleSaveChat = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingChat(true);
    try {
      await updateProfile({
        preferences: {
          defaultModel: defaultModel || null,
          sendOnEnter,
        },
      });
      pushToast('Chat preferences saved');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to save chat settings', 'error');
    } finally {
      setSavingChat(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Theme */}
      <section
        data-setting-row="interface-theme"
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 space-y-4"
      >
        <div>
          <h3 className="text-sm font-medium text-[var(--text)]">Color theme</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Choose Obsidian glass, pure black AMOLED, Frost light, or match your system.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <ThemePreviewCard
            mode="dark"
            title="Obsidian"
            subtitle="Deep charcoal & glass"
            active={theme === 'dark'}
            onSelect={() => void handleThemePick('dark')}
          />
          <ThemePreviewCard
            mode="amoled"
            title="AMOLED"
            subtitle="True pure black OLED"
            active={theme === 'amoled'}
            onSelect={() => void handleThemePick('amoled')}
          />
          <ThemePreviewCard
            mode="frost-preview"
            title="Frost"
            subtitle="Light & crisp"
            active={theme === 'light'}
            onSelect={() => void handleThemePick('light')}
          />
        </div>

        <button
          type="button"
          onClick={() => void handleThemePick('system')}
          aria-pressed={theme === 'system'}
          className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-[var(--radius-md)] border text-left transition-colors ${
            theme === 'system'
              ? 'border-[var(--accent)] bg-[var(--surface-active)]'
              : 'border-[var(--border)] bg-[var(--surface-raised)] hover:border-[var(--border-strong)]'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Monitor className="w-4 h-4 text-[var(--text)] shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--text)]">System</div>
              <div className="text-xs text-[var(--text-muted)]">
                Match OS light/dark appearance automatically
              </div>
            </div>
          </div>
          {theme === 'system' && (
            <span className="w-5 h-5 rounded-full bg-[var(--accent)] text-[var(--accent-ink)] flex items-center justify-center shrink-0">
              <Check className="w-3 h-3" strokeWidth={2.5} />
            </span>
          )}
        </button>

        {theme === 'system' && (
          <div className="p-3.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-raised)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-medium text-[var(--text)]">
                Dark style (when OS is dark)
              </div>
              <div className="text-xs text-[var(--text-muted)]">
                Choose Obsidian or AMOLED black when system dark mode is active.
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {(
                [
                  { id: 'dark', label: 'Obsidian' },
                  { id: 'amoled', label: 'AMOLED' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => void handleDarkStylePick(opt.id)}
                  className={`h-8 px-3 rounded-full text-xs font-medium border transition-colors ${
                    darkStyle === opt.id
                      ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-[var(--accent)]'
                      : 'bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Accessibility */}
      <section
        data-setting-row="interface-a11y"
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]"
      >
        <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
          <div>
            <label
              htmlFor="modal-switch-reduce-transparency"
              className="text-sm font-medium text-[var(--text)] block"
            >
              Reduce transparency
            </label>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Replace translucent blur layers with solid high-contrast surfaces.
            </p>
          </div>
          <Switch
            id="modal-switch-reduce-transparency"
            checked={reduceTransparency}
            onCheckedChange={(val) => {
              setReduceTransparency(val);
              void persistPatch({ reduceTransparency: val });
            }}
          />
        </div>

        <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
          <div>
            <label
              htmlFor="modal-switch-reduce-motion"
              className="text-sm font-medium text-[var(--text)] block"
            >
              Reduce motion
            </label>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Minimize transitions, spring animations, and ambient movement.
            </p>
          </div>
          <Switch
            id="modal-switch-reduce-motion"
            checked={reduceMotion}
            onCheckedChange={(val) => {
              setReduceMotion(val);
              void persistPatch({ reduceMotion: val });
            }}
          />
        </div>
      </section>

      {/* Time zone */}
      <section
        data-setting-row="interface-timezone"
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div>
          <label
            htmlFor="modal-timezone-select"
            className="text-sm font-medium text-[var(--text)] block"
          >
            Time zone
          </label>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Controls greeting part of day, sidebar day boundaries, and timestamp formatting.
          </p>
        </div>
        <div className="w-full sm:w-72">
          <Select
            id="modal-timezone-select"
            value={user?.preferences.timezone ?? 'auto'}
            onChange={(e) => {
              const val = e.target.value === 'auto' ? null : e.target.value;
              void persistPatch({ timezone: val }, 'Time zone updated');
            }}
          >
            <option value="auto">
              Automatic (detected: {getSystemTimezone()})
            </option>
            {getAllIanaTimezones().map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </div>
      </section>

      {/* Chat & Composer */}
      <form
        data-setting-row="interface-chat"
        onSubmit={handleSaveChat}
        className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]"
      >
        <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <label htmlFor="modal-default-model" className="text-sm font-medium text-[var(--text)] block">
              Default model
            </label>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Pre-selected model when opening a new conversation.
            </p>
          </div>
          <div className="w-full sm:w-72">
            <Select
              id="modal-default-model"
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
            >
              <option value="">First available model</option>
              {models.map((m) => (
                <option key={`${m.connectionId}:${m.id}`} value={`${m.connectionId}:${m.id}`}>
                  {m.connectionName} — {m.name}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="p-4 sm:p-5 flex items-center justify-between gap-4">
          <div>
            <label
              htmlFor="modal-switch-send-enter"
              className="text-sm font-medium text-[var(--text)] block"
            >
              Send message on Enter
            </label>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Use Shift+Enter to insert a newline while composing.
            </p>
          </div>
          <Switch
            id="modal-switch-send-enter"
            checked={sendOnEnter}
            onCheckedChange={setSendOnEnter}
          />
        </div>

        <div className="p-4 sm:p-5 flex justify-end">
          <Button type="submit" variant="primary" size="sm" disabled={savingChat}>
            <Save className="w-3.5 h-3.5" />
            {savingChat ? 'Saving...' : 'Save chat preferences'}
          </Button>
        </div>
      </form>
    </div>
  );
};
