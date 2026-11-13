import { create } from 'zustand';
import { ApiError, apiFetch, readSseStream } from '../lib/api';
import type {
  Chat,
  ChatImageAttachment,
  DiscoveredModel,
  KnowledgeSourceBadge,
  Message,
  SavedPrompt,
  StarterPrompt,
} from '../lib/types';
import { useUiStore } from './uiStore';

export interface SelectedModelRef {
  connectionId: string;
  modelId: string;
}

export interface StreamRetryPayload {
  chatId: string | null;
  message: string;
  content: string;
  images: ChatImageAttachment[];
  overrides?: {
    systemPrompt?: string;
    temperature?: number | null;
    maxTokens?: number | null;
  };
}

const DRAFTS_STORAGE_KEY = 'volq_chat_drafts';
export const NEW_CHAT_DRAFT_KEY = '__new__';
const CHAT_PAGE_SIZE = 60;

function readDrafts(): Record<string, string> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function writeDrafts(drafts: Record<string, string>): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    }
  } catch {
    // ignore storage quota errors
  }
}

export function formatFriendlyStreamError(err: unknown): string {
  if (err instanceof ApiError && err.code === 'usage_limit_exceeded') {
    const resetsAt = typeof err.data?.resetsAt === 'string' ? err.data.resetsAt : null;
    const resetText = resetsAt
      ? ` Resets ${new Date(resetsAt).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short',
        })}.`
      : '';
    return `${err.message}${resetText}`;
  }
  const msg = err instanceof Error ? err.message : String(err ?? 'Unknown error');
  const lower = msg.toLowerCase();
  if (lower.includes('429') || lower.includes('rate limit')) {
    return 'Rate limit reached for this model provider. Please wait a moment and try again.';
  }
  if (lower.includes('model') && (lower.includes('not found') || lower.includes('unavailable'))) {
    return 'Selected model is unavailable or hidden. Choose another model or refresh models.';
  }
  if (
    err instanceof TypeError ||
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('econnrefused')
  ) {
    return 'Network error while reaching the server. Check your connection and retry.';
  }
  return msg || 'Failed to stream model response.';
}

interface ChatState {
  chats: Chat[];
  chatsLoading: boolean;
  hasMoreChats: boolean;
  activeChat: Chat | null;
  messages: Message[];
  models: DiscoveredModel[];
  starterPrompts: StarterPrompt[];
  prompts: SavedPrompt[];
  selectedModel: SelectedModelRef | null;
  searchQuery: string;
  isStreaming: boolean;
  streamingChatId: string | null;
  streamAbortController: AbortController | null;
  titlingChatId: string | null;
  streamError: StreamRetryPayload | null;
  draftsByChatId: Record<string, string>;
  focusComposerTrigger: number;
  editingMessageId: string | null;
  deleteConfirmChat: Chat | null;

  loadInitialData: (preferredModel?: string | null) => Promise<void>;
  fetchChats: () => Promise<void>;
  loadMoreChats: () => Promise<void>;
  searchChatsRemote: (q: string) => Promise<Chat[]>;
  setSearchQuery: (q: string) => void;
  selectChat: (chatId: string) => Promise<void>;
  startNewChat: () => void;
  setDraftForChat: (chatId: string | null, text: string) => void;
  getDraftForChat: (chatId: string | null) => string;
  requestComposerFocus: () => void;
  setEditingMessageId: (id: string | null) => void;
  requestDeleteChat: (chat: Chat | null) => void;
  setSelectedModel: (ref: SelectedModelRef | null) => Promise<void>;
  refreshModels: () => Promise<Array<{ connectionName: string; error: string }>>;
  fetchPrompts: () => Promise<void>;
  renameChat: (chatId: string, title: string) => Promise<void>;
  togglePinChat: (chatId: string) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  clearActiveChat: () => Promise<void>;
  clearStreamError: () => void;
  retryLastFailedSend: () => Promise<void>;
  updateActiveChatSettings: (patch: {
    systemPrompt?: string;
    temperature?: number | null;
    maxTokens?: number | null;
  }) => Promise<void>;
  sendMessage: (
    content: string,
    images?: ChatImageAttachment[],
    overrides?: { systemPrompt?: string; temperature?: number | null; maxTokens?: number | null }
  ) => Promise<void>;
  stopStreaming: () => Promise<void>;
  regenerateLastResponse: () => Promise<void>;
  editAndResendMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  chats: [],
  chatsLoading: false,
  hasMoreChats: false,
  activeChat: null,
  messages: [],
  models: [],
  starterPrompts: [],
  prompts: [],
  selectedModel: null,
  searchQuery: '',
  isStreaming: false,
  streamingChatId: null,
  streamAbortController: null,
  titlingChatId: null,
  streamError: null,
  draftsByChatId: readDrafts(),
  focusComposerTrigger: 0,
  editingMessageId: null,
  deleteConfirmChat: null,

  loadInitialData: async (preferredModel) => {
    set({ chatsLoading: true });
    try {
      const [chatsRes, modelsRes, startersRes, promptsRes] = await Promise.all([
        apiFetch<{ chats: Chat[]; hasMore?: boolean }>(
          `/api/chats?excludeEmpty=true&limit=${CHAT_PAGE_SIZE}&offset=0`
        ),
        apiFetch<{ models: DiscoveredModel[] }>('/api/models'),
        apiFetch<{ starterPrompts: StarterPrompt[] }>('/api/config/starter-prompts'),
        apiFetch<{ prompts: SavedPrompt[] }>('/api/prompts'),
      ]);

      useUiStore.getState().setIsOffline(false);
      void useUiStore.getState().fetchUsageSummary();

      const current = get().selectedModel;
      let nextModel = current;
      if (!nextModel && modelsRes.models.length > 0) {
        const matched = preferredModel
          ? modelsRes.models.find(
              (m) => m.id === preferredModel || `${m.connectionId}:${m.id}` === preferredModel
            )
          : undefined;
        const pick = matched ?? modelsRes.models[0];
        if (pick) {
          nextModel = { connectionId: pick.connectionId, modelId: pick.id };
        }
      }

      const visibleChats = chatsRes.chats;

      set({
        chats: visibleChats,
        hasMoreChats: Boolean(chatsRes.hasMore),
        chatsLoading: false,
        models: modelsRes.models,
        starterPrompts: startersRes.starterPrompts,
        prompts: promptsRes.prompts,
        selectedModel: nextModel,
      });
    } catch (err) {
      set({ chatsLoading: false });
      if (!(err instanceof ApiError)) {
        useUiStore.getState().setIsOffline(true);
      }
      throw err;
    }
  },

  fetchChats: async () => {
    try {
      const res = await apiFetch<{ chats: Chat[]; hasMore?: boolean }>(
        `/api/chats?excludeEmpty=true&limit=${CHAT_PAGE_SIZE}&offset=0`
      );
      useUiStore.getState().setIsOffline(false);
      void useUiStore.getState().fetchUsageSummary();
      set({
        chats: res.chats,
        hasMoreChats: Boolean(res.hasMore),
      });
    } catch (err) {
      if (!(err instanceof ApiError)) {
        useUiStore.getState().setIsOffline(true);
      }
    }
  },

  loadMoreChats: async () => {
    if (!get().hasMoreChats) return;
    const offset = get().chats.length;
    const res = await apiFetch<{ chats: Chat[]; hasMore?: boolean }>(
      `/api/chats?excludeEmpty=true&limit=${CHAT_PAGE_SIZE}&offset=${offset}`
    );
    set((s) => {
      const existing = new Set(s.chats.map((c) => c.id));
      const appended = res.chats.filter((c) => !existing.has(c.id));
      return {
        chats: [...s.chats, ...appended],
        hasMoreChats: Boolean(res.hasMore),
      };
    });
  },

  searchChatsRemote: async (q) => {
    const trimmed = q.trim();
    if (!trimmed) {
      return get().chats;
    }
    const res = await apiFetch<{ chats: Chat[] }>(
      `/api/chats?excludeEmpty=true&limit=30&q=${encodeURIComponent(trimmed)}`
    );
    return res.chats;
  },

  setSearchQuery: (searchQuery) => {
    set({ searchQuery });
  },

  selectChat: async (chatId) => {
    const { streamAbortController, streamingChatId } = get();
    if (streamAbortController) {
      streamAbortController.abort();
      if (streamingChatId) {
        void apiFetch(`/api/chats/${streamingChatId}/stop`, { method: 'POST' }).catch(() => {});
      }
    }
    set({
      isStreaming: false,
      streamingChatId: null,
      streamAbortController: null,
      streamError: null,
    });

    const res = await apiFetch<{ chat: Chat; messages: Message[] }>(`/api/chats/${chatId}`);
    useUiStore.getState().setIsOffline(false);
    useUiStore.getState().setActiveChatTitle(res.chat.title);

    const nextModel =
      res.chat.connectionId && res.chat.modelId
        ? { connectionId: res.chat.connectionId, modelId: res.chat.modelId }
        : get().selectedModel;
    set({
      activeChat: res.chat,
      messages: res.messages,
      selectedModel: nextModel,
    });
  },

  startNewChat: () => {
    const { streamAbortController, streamingChatId } = get();
    if (streamAbortController) {
      streamAbortController.abort();
      if (streamingChatId) {
        void apiFetch(`/api/chats/${streamingChatId}/stop`, { method: 'POST' }).catch(() => {});
      }
    }
    useUiStore.getState().setActiveChatTitle(null);
    set((s) => ({
      activeChat: null,
      messages: [],
      isStreaming: false,
      streamingChatId: null,
      streamAbortController: null,
      titlingChatId: null,
      streamError: null,
      focusComposerTrigger: s.focusComposerTrigger + 1,
    }));
  },

  setDraftForChat: (chatId, text) => {
    const key = chatId ?? NEW_CHAT_DRAFT_KEY;
    set((s) => {
      const next = { ...s.draftsByChatId };
      if (text) {
        next[key] = text;
      } else {
        delete next[key];
      }
      writeDrafts(next);
      return { draftsByChatId: next };
    });
  },

  getDraftForChat: (chatId) => {
    const key = chatId ?? NEW_CHAT_DRAFT_KEY;
    return get().draftsByChatId[key] ?? '';
  },

  requestComposerFocus: () => {
    set((s) => ({ focusComposerTrigger: s.focusComposerTrigger + 1 }));
  },

  setEditingMessageId: (editingMessageId) => set({ editingMessageId }),
  requestDeleteChat: (deleteConfirmChat) => set({ deleteConfirmChat }),

  setSelectedModel: async (ref) => {
    set({ selectedModel: ref });
    const active = get().activeChat;
    if (active && ref) {
      const res = await apiFetch<{ chat: Chat }>(`/api/chats/${active.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ connectionId: ref.connectionId, modelId: ref.modelId }),
      });
      set((s) => ({
        activeChat: res.chat,
        chats: s.chats.map((c) => (c.id === res.chat.id ? res.chat : c)),
      }));
    }
  },

  refreshModels: async () => {
    const res = await apiFetch<{
      models: DiscoveredModel[];
      errors: Array<{ connectionName: string; error: string }>;
    }>('/api/models/refresh', { method: 'POST' });

    const current = get().selectedModel;
    const stillValid = current
      ? res.models.some(
          (m) => m.connectionId === current.connectionId && m.id === current.modelId
        )
      : false;
    const fallback =
      !stillValid && res.models[0]
        ? { connectionId: res.models[0].connectionId, modelId: res.models[0].id }
        : current;

    set({ models: res.models, selectedModel: fallback });
    return res.errors;
  },

  fetchPrompts: async () => {
    const res = await apiFetch<{ prompts: SavedPrompt[] }>('/api/prompts');
    set({ prompts: res.prompts });
  },

  renameChat: async (chatId, title) => {
    const res = await apiFetch<{ chat: Chat }>(`/api/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
    if (get().activeChat?.id === chatId) {
      useUiStore.getState().setActiveChatTitle(res.chat.title);
    }
    set((s) => ({
      activeChat: s.activeChat?.id === chatId ? res.chat : s.activeChat,
      chats: s.chats.map((c) => (c.id === chatId ? res.chat : c)),
    }));
  },

  togglePinChat: async (chatId) => {
    const target = get().chats.find((c) => c.id === chatId);
    if (!target) return;
    await apiFetch<{ chat: Chat }>(`/api/chats/${chatId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isPinned: !target.isPinned }),
    });
    await get().fetchChats();
    if (get().activeChat?.id === chatId) {
      const updated = get().chats.find((c) => c.id === chatId) ?? null;
      set({ activeChat: updated });
    }
  },

  deleteChat: async (chatId) => {
    if (get().streamingChatId === chatId) {
      await get().stopStreaming();
    }
    await apiFetch(`/api/chats/${chatId}`, { method: 'DELETE' });
    if (get().activeChat?.id === chatId) {
      useUiStore.getState().setActiveChatTitle(null);
    }
    set((s) => ({
      chats: s.chats.filter((c) => c.id !== chatId),
      activeChat: s.activeChat?.id === chatId ? null : s.activeChat,
      messages: s.activeChat?.id === chatId ? [] : s.messages,
      deleteConfirmChat: s.deleteConfirmChat?.id === chatId ? null : s.deleteConfirmChat,
    }));
  },

  clearActiveChat: async () => {
    const active = get().activeChat;
    if (!active) return;
    if (get().streamingChatId === active.id) {
      await get().stopStreaming();
    }
    await apiFetch(`/api/chats/${active.id}/clear`, { method: 'POST' });
    set({ messages: [], streamError: null });
  },

  clearStreamError: () => set({ streamError: null }),

  retryLastFailedSend: async () => {
    const err = get().streamError;
    if (!err) return;
    set({ streamError: null });
    await get().sendMessage(err.content, err.images, err.overrides);
  },

  updateActiveChatSettings: async (patch) => {
    const active = get().activeChat;
    if (!active) return;
    const res = await apiFetch<{ chat: Chat }>(`/api/chats/${active.id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    set((s) => ({
      activeChat: res.chat,
      chats: s.chats.map((c) => (c.id === res.chat.id ? res.chat : c)),
    }));
  },

  sendMessage: async (content, images = [], overrides) => {
    const model = get().selectedModel;
    if (!model) {
      throw new Error('Select a model first');
    }

    let chat = get().activeChat;
    const createdLazy = !chat;
    if (!chat) {
      const created = await apiFetch<{ chat: Chat }>('/api/chats', {
        method: 'POST',
        body: JSON.stringify({
          connectionId: model.connectionId,
          modelId: model.modelId,
          systemPrompt: overrides?.systemPrompt ?? '',
          temperature: overrides?.temperature ?? null,
          maxTokens: overrides?.maxTokens ?? null,
        }),
      });
      chat = created.chat;
      set({
        activeChat: chat,
        titlingChatId: chat.id,
      });
    }

    const abortController = new AbortController();
    set({
      isStreaming: true,
      streamingChatId: chat.id,
      streamAbortController: abortController,
      streamError: null,
    });

    let assistantId = '';
    let metaReceived = false;

    try {
      await readSseStream(
        `/api/chats/${chat.id}/messages/stream`,
        {
          content,
          images,
          connectionId: model.connectionId,
          modelId: model.modelId,
          ...(overrides?.systemPrompt !== undefined ? { systemPrompt: overrides.systemPrompt } : {}),
          ...(overrides?.temperature !== undefined ? { temperature: overrides.temperature } : {}),
          ...(overrides?.maxTokens !== undefined ? { maxTokens: overrides.maxTokens } : {}),
        },
        (evt) => {
          if (evt.type === 'meta') {
            metaReceived = true;
            const userMsg = evt.userMessage as Message | undefined;
            const assistantMsg = evt.assistantMessage as Message;
            assistantId = assistantMsg.id;
            set((s) => {
              const alreadyListed = s.chats.some((c) => c.id === chat!.id);
              return {
                messages: [...s.messages, ...(userMsg ? [userMsg] : []), assistantMsg],
                chats: alreadyListed ? s.chats : [chat!, ...s.chats],
              };
            });
          } else if (evt.type === 'delta') {
            const delta = String(evt.content ?? '');
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + delta } : m
              ),
            }));
          } else if (evt.type === 'sources') {
            const sources = (evt.sources as KnowledgeSourceBadge[]) ?? [];
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, sources } : m
              ),
            }));
          } else if (evt.type === 'title') {
            const nextTitle = String(evt.title ?? '');
            if (get().activeChat?.id === chat!.id) {
              useUiStore.getState().setActiveChatTitle(nextTitle);
            }
            set((s) => ({
              activeChat: s.activeChat ? { ...s.activeChat, title: nextTitle } : null,
              chats: s.chats.map((c) => (c.id === chat!.id ? { ...c, title: nextTitle } : c)),
              titlingChatId: s.titlingChatId === chat!.id ? null : s.titlingChatId,
            }));
          } else if (evt.type === 'done' || evt.type === 'error') {
            const finalMsg = evt.message as Message | undefined;
            if (finalMsg) {
              set((s) => ({
                messages: s.messages.map((m) => (m.id === finalMsg.id ? finalMsg : m)),
              }));
            }
            if (evt.type === 'error') {
              const errMsg = formatFriendlyStreamError(evt.error ?? finalMsg?.errorMessage);
              set({
                streamError: {
                  chatId: chat!.id,
                  message: errMsg,
                  content,
                  images,
                  overrides,
                },
              });
            }
          }
        },
        abortController.signal
      );

      useUiStore.getState().setIsOffline(false);
      void useUiStore.getState().fetchUsageSummary();
      await get().fetchChats();
    } catch (err) {
      if (abortController.signal.aborted) {
        return;
      }
      if (createdLazy && !metaReceived) {
        // Avoid leaving orphan empty 'New Chat' records if first send fails before saving a message
        void apiFetch(`/api/chats/${chat.id}`, { method: 'DELETE' }).catch(() => {});
        useUiStore.getState().setActiveChatTitle(null);
        set({ activeChat: null });
      }
      if (!(err instanceof ApiError)) {
        useUiStore.getState().setIsOffline(true);
      }
      set({
        streamError: {
          chatId: metaReceived ? chat.id : null,
          message: formatFriendlyStreamError(err),
          content,
          images,
          overrides,
        },
      });
      throw err;
    } finally {
      set((s) => ({
        isStreaming: false,
        streamingChatId: null,
        streamAbortController: null,
        titlingChatId: s.titlingChatId === chat?.id ? null : s.titlingChatId,
      }));
    }
  },

  stopStreaming: async () => {
    const { streamingChatId, streamAbortController } = get();
    streamAbortController?.abort();
    set({
      isStreaming: false,
      streamingChatId: null,
      streamAbortController: null,
    });
    if (streamingChatId) {
      await apiFetch(`/api/chats/${streamingChatId}/stop`, { method: 'POST' }).catch(() => {});
    }
  },

  regenerateLastResponse: async () => {
    const active = get().activeChat;
    const model = get().selectedModel;
    if (!active || !model) return;

    const abortController = new AbortController();
    set({
      isStreaming: true,
      streamingChatId: active.id,
      streamAbortController: abortController,
      streamError: null,
    });

    let assistantId = '';
    try {
      await readSseStream(
        `/api/chats/${active.id}/regenerate`,
        { connectionId: model.connectionId, modelId: model.modelId },
        (evt) => {
          if (evt.type === 'meta') {
            const assistantMsg = evt.assistantMessage as Message;
            assistantId = assistantMsg.id;
            set((s) => {
              const trimmed =
                s.messages[s.messages.length - 1]?.role === 'assistant'
                  ? s.messages.slice(0, -1)
                  : s.messages;
              return { messages: [...trimmed, assistantMsg] };
            });
          } else if (evt.type === 'delta') {
            const delta = String(evt.content ?? '');
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + delta } : m
              ),
            }));
          } else if (evt.type === 'sources') {
            const sources = (evt.sources as KnowledgeSourceBadge[]) ?? [];
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, sources } : m
              ),
            }));
          } else if (evt.type === 'done' || evt.type === 'error') {
            const finalMsg = evt.message as Message | undefined;
            if (finalMsg) {
              set((s) => ({
                messages: s.messages.map((m) => (m.id === finalMsg.id ? finalMsg : m)),
              }));
            }
          }
        },
        abortController.signal
      );
    } finally {
      set({
        isStreaming: false,
        streamingChatId: null,
        streamAbortController: null,
      });
    }
  },

  editAndResendMessage: async (messageId, content) => {
    const active = get().activeChat;
    const model = get().selectedModel;
    if (!active || !model) return;

    const abortController = new AbortController();
    set({
      isStreaming: true,
      streamingChatId: active.id,
      streamAbortController: abortController,
      streamError: null,
    });

    let assistantId = '';
    try {
      await readSseStream(
        `/api/chats/${active.id}/messages/${messageId}`,
        { content, connectionId: model.connectionId, modelId: model.modelId },
        (evt) => {
          if (evt.type === 'meta') {
            const updatedUser = evt.userMessage as Message;
            const assistantMsg = evt.assistantMessage as Message;
            assistantId = assistantMsg.id;
            set((s) => {
              const idx = s.messages.findIndex((m) => m.id === messageId);
              const prefix = idx >= 0 ? s.messages.slice(0, idx) : s.messages;
              return { messages: [...prefix, updatedUser, assistantMsg] };
            });
          } else if (evt.type === 'delta') {
            const delta = String(evt.content ?? '');
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, content: m.content + delta } : m
              ),
            }));
          } else if (evt.type === 'sources') {
            const sources = (evt.sources as KnowledgeSourceBadge[]) ?? [];
            set((s) => ({
              messages: s.messages.map((m) =>
                m.id === assistantId ? { ...m, sources } : m
              ),
            }));
          } else if (evt.type === 'done' || evt.type === 'error') {
            const finalMsg = evt.message as Message | undefined;
            if (finalMsg) {
              set((s) => ({
                messages: s.messages.map((m) => (m.id === finalMsg.id ? finalMsg : m)),
              }));
            }
          }
        },
        abortController.signal
      );
    } finally {
      set({
        isStreaming: false,
        streamingChatId: null,
        streamAbortController: null,
      });
    }
  },

  deleteMessage: async (messageId) => {
    const active = get().activeChat;
    if (!active) return;
    await apiFetch(`/api/chats/${active.id}/messages/${messageId}`, { method: 'DELETE' });
    set((s) => ({
      messages: s.messages.filter((m) => m.id !== messageId),
    }));
  },
}));
