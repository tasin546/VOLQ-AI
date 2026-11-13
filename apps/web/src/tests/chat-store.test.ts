import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import { useChatStore } from '../stores/chatStore';

describe('chatStore streaming reset & lazy chat creation', () => {
  beforeEach(() => {
    useChatStore.setState({
      chats: [],
      activeChat: null,
      messages: [],
      models: [
        {
          id: 'llama3',
          name: 'Llama 3',
          connectionId: 'conn-1',
          connectionName: 'Local Ollama',
          connectionType: 'ollama',
          isLocal: true,
        },
      ],
      selectedModel: { connectionId: 'conn-1', modelId: 'llama3' },
      isStreaming: false,
      streamingChatId: null,
      streamAbortController: null,
      streamError: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resets streaming state and aborts controller on startNewChat, selectChat, and stopStreaming', async () => {
    const abortController = new AbortController();
    const abortSpy = vi.spyOn(abortController, 'abort');
    vi.spyOn(api, 'apiFetch').mockResolvedValue({
      chat: {
        id: 'chat-2',
        title: 'Second chat',
        connectionId: 'conn-1',
        modelId: 'llama3',
        systemPrompt: '',
        temperature: null,
        maxTokens: null,
        isPinned: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      messages: [],
    });

    useChatStore.setState({
      isStreaming: true,
      streamingChatId: 'chat-1',
      streamAbortController: abortController,
    });

    await useChatStore.getState().stopStreaming();
    expect(abortSpy).toHaveBeenCalledTimes(1);
    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useChatStore.getState().streamingChatId).toBeNull();
    expect(useChatStore.getState().streamAbortController).toBeNull();

    const ctrl2 = new AbortController();
    useChatStore.setState({
      isStreaming: true,
      streamingChatId: 'chat-1',
      streamAbortController: ctrl2,
    });
    useChatStore.getState().startNewChat();
    expect(ctrl2.signal.aborted).toBe(true);
    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useChatStore.getState().activeChat).toBeNull();

    const ctrl3 = new AbortController();
    useChatStore.setState({
      isStreaming: true,
      streamingChatId: 'chat-1',
      streamAbortController: ctrl3,
    });
    await useChatStore.getState().selectChat('chat-2');
    expect(ctrl3.signal.aborted).toBe(true);
    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useChatStore.getState().activeChat?.id).toBe('chat-2');
  });

  it('does not leave empty New Chat rows in history when first send fails before meta', async () => {
    const mockChat = {
      id: 'temp-empty-chat',
      title: 'New Chat',
      connectionId: 'conn-1',
      modelId: 'llama3',
      systemPrompt: '',
      temperature: null,
      maxTokens: null,
      isPinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const apiSpy = vi.spyOn(api, 'apiFetch').mockImplementation(async (path, init) => {
      if (path === '/api/chats' && init?.method === 'POST') {
        return { chat: mockChat };
      }
      if (path === `/api/chats/${mockChat.id}` && init?.method === 'DELETE') {
        return { ok: true };
      }
      return { chats: [] };
    });

    vi.spyOn(api, 'readSseStream').mockRejectedValue(new Error('Provider unreachable'));

    await expect(useChatStore.getState().sendMessage('Hello')).rejects.toThrow(
      'Provider unreachable'
    );

    expect(useChatStore.getState().chats).toHaveLength(0);
    expect(useChatStore.getState().activeChat).toBeNull();
    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useChatStore.getState().streamError?.message).toBe('Provider unreachable');
    expect(apiSpy).toHaveBeenCalledWith(`/api/chats/${mockChat.id}`, { method: 'DELETE' });
  });
});
