import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookText,
  Check,
  Cloud,
  Cpu,
  Database,
  HardDrive,
  Keyboard,
  MessageSquare,
  Monitor,
  Moon,
  Plus,
  Search,
  Settings,
  Shield,
  Sparkles,
  Sun,
  Trash2,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { formatModKey } from '../../lib/shortcuts';
import type { Chat, ThemeMode } from '../../lib/types';
import { useAuthStore } from '../../stores/authStore';
import { useChatStore } from '../../stores/chatStore';
import { useUiStore } from '../../stores/uiStore';
import { DialogModal } from './Primitives';

interface PaletteAction {
  id: string;
  section: 'Chats' | 'Models' | 'Navigation & Settings';
  title: string;
  subtitle?: string;
  badge?: string;
  selected?: boolean;
  onSelect: () => void | Promise<void>;
  icon: React.ReactNode;
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[var(--accent-soft)] text-[var(--text)] font-semibold rounded px-0.5">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

export const GlobalPalette: React.FC = () => {
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const {
    globalPaletteOpen,
    setGlobalPaletteOpen,
    setShortcutsModalOpen,
    setTheme,
  } = useUiStore();
  const {
    chats,
    activeChat,
    models,
    selectedModel,
    setSelectedModel,
    selectChat,
    startNewChat,
    requestDeleteChat,
    searchChatsRemote,
  } = useChatStore();

  const [query, setQuery] = useState('');
  const [matchedChats, setMatchedChats] = useState<Chat[]>(chats.slice(0, 12));
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setGlobalPaletteOpen(!globalPaletteOpen);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [globalPaletteOpen, setGlobalPaletteOpen]);

  useEffect(() => {
    if (globalPaletteOpen) {
      setQuery('');
      setActiveIndex(0);
      setMatchedChats(chats.slice(0, 12));
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [globalPaletteOpen, chats]);

  useEffect(() => {
    if (!globalPaletteOpen) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setMatchedChats(chats.slice(0, 12));
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      void searchChatsRemote(trimmed)
        .then((res) => {
          if (!cancelled) {
            setMatchedChats(res.slice(0, 15));
            setSearching(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            const lower = trimmed.toLowerCase();
            setMatchedChats(
              chats.filter((c) => c.title.toLowerCase().includes(lower)).slice(0, 15)
            );
            setSearching(false);
          }
        });
    }, 150);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, globalPaletteOpen, chats, searchChatsRemote]);

  const actions = useMemo<PaletteAction[]>(() => {
    const q = query.trim().toLowerCase();
    const list: PaletteAction[] = [];

    for (const c of matchedChats) {
      list.push({
        id: `chat:${c.id}`,
        section: 'Chats',
        title: c.title,
        subtitle: c.matchSnippet ?? new Date(c.updatedAt).toLocaleDateString(),
        icon: <MessageSquare className="w-4 h-4 text-[var(--text-muted)]" />,
        onSelect: async () => {
          await selectChat(c.id);
          navigate('/');
        },
      });
    }

    for (const m of models) {
      if (
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.connectionName.toLowerCase().includes(q)
      ) {
        const isSelected =
          selectedModel?.connectionId === m.connectionId && selectedModel?.modelId === m.id;
        list.push({
          id: `model:${m.connectionId}:${m.id}`,
          section: 'Models',
          title: m.name,
          subtitle: m.connectionName,
          badge: m.isLocal ? 'Local' : 'Hosted',
          selected: isSelected,
          icon: m.isLocal ? (
            <HardDrive className="w-4 h-4 text-[var(--text-muted)]" />
          ) : (
            <Cloud className="w-4 h-4 text-[var(--text-muted)]" />
          ),
          onSelect: async () => {
            await setSelectedModel({ connectionId: m.connectionId, modelId: m.id });
            navigate('/');
          },
        });
      }
    }

    const switchTheme = async (next: ThemeMode) => {
      setTheme(next);
      await updateProfile({ preferences: { theme: next } }).catch(() => {});
    };

    const navActions: PaletteAction[] = [
      {
        id: 'act:new-chat',
        section: 'Navigation & Settings',
        title: 'New chat',
        subtitle: 'Start a fresh conversation',
        badge: formatModKey('o', { shift: true }),
        icon: <Plus className="w-4 h-4 text-[var(--text-muted)]" />,
        onSelect: () => {
          startNewChat();
          navigate('/');
        },
      },
      ...(activeChat
        ? [
            {
              id: 'act:delete-current-chat',
              section: 'Navigation & Settings' as const,
              title: 'Delete current chat',
              subtitle: `Permanently delete "${activeChat.title}"`,
              icon: <Trash2 className="w-4 h-4 text-[var(--status-error)]" />,
              onSelect: () => requestDeleteChat(activeChat),
            },
          ]
        : []),
      {
        id: 'act:prompts',
        section: 'Navigation & Settings',
        title: 'Prompt Library',
        subtitle: 'Manage slash-command prompts',
        icon: <BookText className="w-4 h-4 text-[var(--text-muted)]" />,
        onSelect: () => navigate('/prompts'),
      },
      {
        id: 'act:settings',
        section: 'Navigation & Settings',
        title: 'Settings',
        subtitle: 'Account, Interface, Usage, Shortcuts',
        icon: <Settings className="w-4 h-4 text-[var(--text-muted)]" />,
        onSelect: () =>
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('settings', 'account');
            return next;
          }),
      },
      {
        id: 'act:usage',
        section: 'Navigation & Settings',
        title: 'Open settings: Usage',
        subtitle: 'View remaining messages and token quotas',
        icon: <Settings className="w-4 h-4 text-[var(--text-muted)]" />,
        onSelect: () =>
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('settings', 'usage');
            return next;
          }),
      },
      {
        id: 'act:shortcuts',
        section: 'Navigation & Settings',
        title: 'Keyboard shortcuts',
        subtitle: 'View all keyboard shortcuts',
        badge: '?',
        icon: <Keyboard className="w-4 h-4 text-[var(--text-muted)]" />,
        onSelect: () => setShortcutsModalOpen(true),
      },
      {
        id: 'act:theme-obsidian',
        section: 'Navigation & Settings',
        title: 'Theme: Obsidian',
        subtitle: 'Deep obsidian dark theme',
        icon: <Moon className="w-4 h-4 text-[var(--text-muted)]" />,
        onSelect: () => switchTheme('dark'),
      },
      {
        id: 'act:theme-amoled',
        section: 'Navigation & Settings',
        title: 'Theme: AMOLED',
        subtitle: 'True pure black OLED theme',
        icon: <Sparkles className="w-4 h-4 text-[var(--text-muted)]" />,
        onSelect: () => switchTheme('amoled'),
      },
      {
        id: 'act:theme-frost',
        section: 'Navigation & Settings',
        title: 'Theme: Frost',
        subtitle: 'Crisp light appearance',
        icon: <Sun className="w-4 h-4 text-[var(--text-muted)]" />,
        onSelect: () => switchTheme('light'),
      },
      {
        id: 'act:theme-system',
        section: 'Navigation & Settings',
        title: 'Theme: System',
        subtitle: 'Follow operating system color scheme',
        icon: <Monitor className="w-4 h-4 text-[var(--text-muted)]" />,
        onSelect: () => switchTheme('system'),
      },
    ];

    if (user?.role === 'admin') {
      navActions.push(
        {
          id: 'act:admin-knowledge',
          section: 'Navigation & Settings',
          title: 'Admin: Knowledge Base',
          subtitle: 'Upload documents, configure embeddings, RAG context',
          icon: <Database className="w-4 h-4 text-[var(--text-muted)]" />,
          onSelect: () =>
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set('settings', 'admin-knowledge');
              return next;
            }),
        },
        {
          id: 'act:admin-models',
          section: 'Navigation & Settings',
          title: 'Admin: Models',
          subtitle: 'Rename, hide, privacy, attach knowledge',
          icon: <Cpu className="w-4 h-4 text-[var(--text-muted)]" />,
          onSelect: () =>
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set('settings', 'admin-models');
              return next;
            }),
        },
        {
          id: 'act:admin-oauth',
          section: 'Navigation & Settings',
          title: 'Open settings: OAuth Providers',
          subtitle: 'Configure Google and Discord SSO',
          icon: <Shield className="w-4 h-4 text-[var(--text-muted)]" />,
          onSelect: () =>
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set('settings', 'admin-oauth');
              return next;
            }),
        },
        {
          id: 'act:admin-usage',
          section: 'Navigation & Settings',
          title: 'Open settings: Usage Limits',
          subtitle: 'Manage global message and token limits',
          icon: <Shield className="w-4 h-4 text-[var(--text-muted)]" />,
          onSelect: () =>
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set('settings', 'admin-usage');
              return next;
            }),
        },
        {
          id: 'act:admin-console',
          section: 'Navigation & Settings',
          title: 'Admin Console',
          subtitle: 'General, models, connections, knowledge, users, system',
          icon: <Shield className="w-4 h-4 text-[var(--text-muted)]" />,
          onSelect: () =>
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              next.set('settings', 'admin-general');
              return next;
            }),
        }
      );
    }

    for (const act of navActions) {
      if (
        !q ||
        act.title.toLowerCase().includes(q) ||
        (act.subtitle ?? '').toLowerCase().includes(q)
      ) {
        list.push(act);
      }
    }

    return list;
  }, [
    query,
    matchedChats,
    activeChat,
    models,
    selectedModel,
    setSelectedModel,
    selectChat,
    startNewChat,
    requestDeleteChat,
    navigate,
    setSearchParams,
    setTheme,
    setShortcutsModalOpen,
    updateProfile,
    user?.role,
  ]);

  const sections = useMemo(() => {
    const groups: Array<{ label: string; items: PaletteAction[] }> = [];
    for (const item of actions) {
      let group = groups.find((g) => g.label === item.section);
      if (!group) {
        group = { label: item.section, items: [] };
        groups.push(group);
      }
      group.items.push(item);
    }
    return groups;
  }, [actions]);

  const runAction = async (item: PaletteAction) => {
    setGlobalPaletteOpen(false);
    await item.onSelect();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (actions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % actions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + actions.length) % actions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = actions[activeIndex];
      if (target) void runAction(target);
    }
  };

  return (
    <DialogModal
      open={globalPaletteOpen}
      onOpenChange={setGlobalPaletteOpen}
      title="Search and commands"
      hideHeader
      centered
      maxWidthClass="md:max-w-[580px]"
    >
      <div onKeyDown={handleKeyDown} className="flex flex-col max-h-[min(82dvh,500px)]">
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-[var(--border)]">
          <Search className="w-4 h-4 text-[var(--text-subtle)] shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Search chats, message snippets, models, or actions..."
            aria-label="Search chats, models, or actions"
            className="flex-1 min-w-0 bg-transparent text-base md:text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] outline-none focus-visible:outline-none"
          />
          {searching && (
            <span className="text-[11px] text-[var(--text-subtle)] shrink-0">Searching...</span>
          )}
          <kbd className="text-[11px] font-mono px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-muted)]">
            Esc
          </kbd>
        </div>

        <div
          className="flex-1 overflow-y-auto p-2.5 space-y-3"
          role="listbox"
          aria-label="Search results"
        >
          {actions.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.label} className="space-y-1">
                <div className="px-3 py-1 text-[12px] font-medium text-[var(--text-subtle)]">
                  {section.label}
                </div>
                {section.items.map((item) => {
                  const idx = actions.findIndex((a) => a.id === item.id);
                  const active = idx === activeIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => void runAction(item)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[var(--radius-md)] text-left transition-colors ${
                        active ? 'bg-[var(--surface-active)]' : 'hover:bg-[var(--surface-hover)]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="shrink-0">{item.icon}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-[var(--text)] truncate">
                            <HighlightMatch text={item.title} query={query} />
                          </div>
                          {item.subtitle && (
                            <div className="text-xs text-[var(--text-muted)] truncate">
                              <HighlightMatch text={item.subtitle} query={query} />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {item.badge && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-muted)]">
                            {item.badge}
                          </span>
                        )}
                        {item.selected && <Check className="w-4 h-4 text-[var(--text)]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </DialogModal>
  );
};
