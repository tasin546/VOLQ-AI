import net from 'node:net';
import type { SsrfPolicy } from '../db/index.js';
import { SsrfValidationError, validateConnectionUrl } from './ssrf.js';

export type ConnectionType = 'ollama' | 'openai_compatible';

export interface CachedModel {
  id: string;
  name: string;
}

export interface DiscoveredModel extends CachedModel {
  connectionId: string;
  connectionName: string;
  connectionType: ConnectionType;
  isLocal: boolean;
}

export interface ConnectionRecord {
  id: string;
  name: string;
  type: ConnectionType;
  base_url: string;
  encrypted_api_key: string | null;
  api_key_hint: string | null;
  is_enabled: number;
  cached_models_json: string;
  models_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatImageAttachment {
  mimeType: string;
  dataBase64: string;
}

export interface ProviderChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: ChatImageAttachment[];
}

export interface StreamChatOptions {
  connection: Pick<ConnectionRecord, 'type' | 'base_url'>;
  apiKey: string | null;
  ssrfPolicy: SsrfPolicy;
  modelId: string;
  messages: ProviderChatMessage[];
  temperature?: number | null;
  maxTokens?: number | null;
  signal: AbortSignal;
  onToken: (delta: string) => void;
}

export function isLocalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (host === 'localhost' || host === 'ollama' || host === 'host.docker.internal') {
      return true;
    }
    if (net.isIPv4(host)) {
      return (
        host.startsWith('127.') ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
      );
    }
    if (host === '::1') return true;
    return false;
  } catch {
    return false;
  }
}

export function normalizeBaseUrl(rawUrl: string): string {
  let u = rawUrl.trim();
  if (!/^https?:\/\//i.test(u)) {
    u = `http://${u}`;
  }
  return u
    .replace(/\/+$/, '')
    .replace(/\/(chat\/completions|models|embeddings)$/i, '');
}

export function normalizeApiKey(rawKey: string | null | undefined): string | null {
  if (!rawKey) return null;
  const cleaned = rawKey.trim().replace(/^bearer\s+/i, '').trim();
  return cleaned.length > 0 ? cleaned : null;
}

function buildOpenAiEndpoint(baseUrl: string, suffixPath: string): string {
  const trimmed = normalizeBaseUrl(baseUrl);
  if (/(\/v\d+([a-z0-9]*)?|\/openai)$/i.test(trimmed)) {
    return `${trimmed}${suffixPath}`;
  }
  return `${trimmed}/v1${suffixPath}`;
}

async function readProviderErrorMessage(res: Response, fallback: string): Promise<string> {
  const raw = await res.text().catch(() => '');
  if (!raw.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw) as {
      error?: string | { message?: string };
      message?: string;
    };
    if (typeof parsed.error === 'string' && parsed.error.trim()) {
      return `${fallback}: ${parsed.error.trim().slice(0, 180)}`;
    }
    if (parsed.error && typeof parsed.error === 'object' && parsed.error.message) {
      return `${fallback}: ${parsed.error.message.trim().slice(0, 180)}`;
    }
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return `${fallback}: ${parsed.message.trim().slice(0, 180)}`;
    }
  } catch {
    // non-JSON error body
  }
  return `${fallback}: ${raw.replace(/\s+/g, ' ').trim().slice(0, 180)}`;
}

export async function discoverModelsForConnection(
  connection: Pick<ConnectionRecord, 'type' | 'base_url'>,
  apiKey: string | null,
  ssrfPolicy: SsrfPolicy
): Promise<{ ok: boolean; models: CachedModel[]; error?: string }> {
  try {
    await validateConnectionUrl(connection.base_url, ssrfPolicy);
  } catch (err) {
    if (err instanceof SsrfValidationError) {
      return { ok: false, models: [], error: err.message };
    }
    return { ok: false, models: [], error: 'Invalid connection URL' };
  }

  const normalizedKey = normalizeApiKey(apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    if (connection.type === 'ollama') {
      const url = `${normalizeBaseUrl(connection.base_url)}/api/tags`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'VOLQ-AI/1.0',
          ...(normalizedKey ? { Authorization: `Bearer ${normalizedKey}` } : {}),
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        return {
          ok: false,
          models: [],
          error: await readProviderErrorMessage(res, `Ollama returned HTTP ${res.status}`),
        };
      }
      const data = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
      const models: CachedModel[] = (data.models ?? [])
        .map((m) => {
          const id = m.name ?? m.model ?? '';
          return { id, name: id };
        })
        .filter((m) => m.id.length > 0);
      return { ok: true, models };
    }

    const url = buildOpenAiEndpoint(connection.base_url, '/models');
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'VOLQ-AI/1.0',
    };
    if (normalizedKey) {
      headers.Authorization = `Bearer ${normalizedKey}`;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      return {
        ok: false,
        models: [],
        error: await readProviderErrorMessage(res, `Provider returned HTTP ${res.status}`),
      };
    }

    const rawText = await res.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return {
        ok: false,
        models: [],
        error: 'Provider returned a non-JSON response on /models',
      };
    }

    const rawList: Array<{ id?: string; model?: string; name?: string }> = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { data?: unknown }).data)
        ? (parsed as { data: Array<{ id?: string; model?: string; name?: string }> }).data
        : Array.isArray((parsed as { models?: unknown }).models)
          ? (parsed as { models: Array<{ id?: string; model?: string; name?: string }> }).models
          : [];

    const models: CachedModel[] = rawList
      .map((m) => {
        const id = String(m.id ?? m.model ?? m.name ?? '').trim();
        const name = String(m.name ?? m.id ?? m.model ?? '').trim();
        return { id, name: name || id };
      })
      .filter((m) => m.id.length > 0);
    return { ok: true, models };
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'Connection timed out after 20s'
        : err instanceof Error
          ? err.message
          : 'Failed to reach provider';
    return { ok: false, models: [], error: message };
  } finally {
    clearTimeout(timeout);
  }
}

export function parseCachedModels(raw: string): CachedModel[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CachedModel =>
        typeof item === 'object' &&
        item !== null &&
        typeof item.id === 'string' &&
        typeof item.name === 'string'
    );
  } catch {
    return [];
  }
}

async function readLinesFromStream(
  body: ReadableStream<Uint8Array>,
  onLine: (line: string) => void
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIdx = buffer.indexOf('\n');
    while (newlineIdx !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (line) onLine(line);
      newlineIdx = buffer.indexOf('\n');
    }
  }

  const tail = (buffer + decoder.decode()).trim();
  if (tail) onLine(tail);
}

export interface StreamChatResult {
  inputTokens: number | null;
  outputTokens: number | null;
  isEstimated: boolean;
}

export async function streamChatCompletion(options: StreamChatOptions): Promise<StreamChatResult> {
  await validateConnectionUrl(options.connection.base_url, options.ssrfPolicy);

  if (options.connection.type === 'ollama') {
    const url = `${normalizeBaseUrl(options.connection.base_url)}/api/chat`;
    const ollamaOptions: Record<string, number> = {};
    if (options.temperature !== null && options.temperature !== undefined) {
      ollamaOptions.temperature = options.temperature;
    }
    if (options.maxTokens !== null && options.maxTokens !== undefined) {
      ollamaOptions.num_predict = options.maxTokens;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.modelId,
        stream: true,
        messages: options.messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.images && m.images.length > 0
            ? { images: m.images.map((img) => img.dataBase64) }
            : {}),
        })),
        ...(Object.keys(ollamaOptions).length > 0 ? { options: ollamaOptions } : {}),
      }),
      signal: options.signal,
    });

    if (!res.ok || !res.body) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Ollama error (${res.status}): ${errText || res.statusText}`);
    }

    let inputTokens: number | null = null;
    let outputTokens: number | null = null;

    await readLinesFromStream(res.body, (line) => {
      const parsed = JSON.parse(line) as {
        message?: { content?: string };
        error?: string;
        prompt_eval_count?: number;
        eval_count?: number;
      };
      if (parsed.error) {
        throw new Error(parsed.error);
      }
      const token = parsed.message?.content;
      if (typeof token === 'string' && token.length > 0) {
        options.onToken(token);
      }
      if (typeof parsed.prompt_eval_count === 'number' && Number.isFinite(parsed.prompt_eval_count)) {
        inputTokens = Math.max(0, Math.trunc(parsed.prompt_eval_count));
      }
      if (typeof parsed.eval_count === 'number' && Number.isFinite(parsed.eval_count)) {
        outputTokens = Math.max(0, Math.trunc(parsed.eval_count));
      }
    });
    return {
      inputTokens,
      outputTokens,
      isEstimated: inputTokens === null || outputTokens === null,
    };
  }

  const url = buildOpenAiEndpoint(options.connection.base_url, '/chat/completions');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    'User-Agent': 'VOLQ-AI/1.0',
  };
  const normalizedKey = normalizeApiKey(options.apiKey);
  if (normalizedKey) {
    headers.Authorization = `Bearer ${normalizedKey}`;
  }

  const openAiMessages = options.messages.map((m) => {
    if (m.role === 'user' && m.images && m.images.length > 0) {
      return {
        role: m.role,
        content: [
          ...(m.content ? [{ type: 'text', text: m.content }] : []),
          ...m.images.map((img) => ({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${img.dataBase64}` },
          })),
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  const buildPayload = (includeStreamOptions: boolean) =>
    JSON.stringify({
      model: options.modelId,
      stream: true,
      ...(includeStreamOptions ? { stream_options: { include_usage: true } } : {}),
      messages: openAiMessages,
      ...(options.temperature !== null && options.temperature !== undefined
        ? { temperature: options.temperature }
        : {}),
      ...(options.maxTokens !== null && options.maxTokens !== undefined
        ? { max_tokens: options.maxTokens }
        : {}),
    });

  let res = await fetch(url, {
    method: 'POST',
    headers,
    body: buildPayload(true),
    signal: options.signal,
  });

  if (res.status === 400) {
    const errText = await res.text().catch(() => '');
    if (/stream_options|unknown|extra inputs|unrecognized/i.test(errText)) {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: buildPayload(false),
        signal: options.signal,
      });
    } else {
      let msg = `Provider error (400)`;
      if (errText.trim()) {
        try {
          const parsed = JSON.parse(errText) as { error?: string | { message?: string }; message?: string };
          const extracted =
            (typeof parsed.error === 'string' && parsed.error) ||
            (parsed.error && typeof parsed.error === 'object' && parsed.error.message) ||
            parsed.message;
          if (extracted) msg = `${msg}: ${String(extracted).trim().slice(0, 180)}`;
          else msg = `${msg}: ${errText.replace(/\s+/g, ' ').trim().slice(0, 180)}`;
        } catch {
          msg = `${msg}: ${errText.replace(/\s+/g, ' ').trim().slice(0, 180)}`;
        }
      }
      throw new Error(msg);
    }
  }

  if (!res.ok || !res.body) {
    const errMsg = await readProviderErrorMessage(res, `Provider error (${res.status})`);
    throw new Error(errMsg);
  }

  let inputTokens: number | null = null;
  let outputTokens: number | null = null;

  const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
  if (contentType.includes('application/json')) {
    const data = (await res.json()) as {
      error?: { message?: string };
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      choices?: Array<{
        message?: { content?: string };
        delta?: { content?: string };
        text?: string;
      }>;
    };
    if (data.error?.message) {
      throw new Error(data.error.message);
    }
    const token =
      data.choices?.[0]?.message?.content ??
      data.choices?.[0]?.delta?.content ??
      data.choices?.[0]?.text ??
      '';
    if (typeof token === 'string' && token.length > 0) {
      options.onToken(token);
    }
    if (typeof data.usage?.prompt_tokens === 'number' && Number.isFinite(data.usage.prompt_tokens)) {
      inputTokens = Math.max(0, Math.trunc(data.usage.prompt_tokens));
    }
    if (
      typeof data.usage?.completion_tokens === 'number' &&
      Number.isFinite(data.usage.completion_tokens)
    ) {
      outputTokens = Math.max(0, Math.trunc(data.usage.completion_tokens));
    }
    return {
      inputTokens,
      outputTokens,
      isEstimated: inputTokens === null || outputTokens === null,
    };
  }

  await readLinesFromStream(res.body, (line) => {
    if (!line.startsWith('data:')) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return;

    const parsed = JSON.parse(payload) as {
      error?: { message?: string };
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      choices?: Array<{
        delta?: { content?: string };
        message?: { content?: string };
        text?: string;
      }>;
    };
    if (parsed.error?.message) {
      throw new Error(parsed.error.message);
    }
    const token =
      parsed.choices?.[0]?.delta?.content ??
      parsed.choices?.[0]?.message?.content ??
      parsed.choices?.[0]?.text ??
      '';
    if (typeof token === 'string' && token.length > 0) {
      options.onToken(token);
    }
    if (
      typeof parsed.usage?.prompt_tokens === 'number' &&
      Number.isFinite(parsed.usage.prompt_tokens)
    ) {
      inputTokens = Math.max(0, Math.trunc(parsed.usage.prompt_tokens));
    }
    if (
      typeof parsed.usage?.completion_tokens === 'number' &&
      Number.isFinite(parsed.usage.completion_tokens)
    ) {
      outputTokens = Math.max(0, Math.trunc(parsed.usage.completion_tokens));
    }
  });

  return {
    inputTokens,
    outputTokens,
    isEstimated: inputTokens === null || outputTokens === null,
  };
}

export async function generateChatTitle(params: {
  connection: Pick<ConnectionRecord, 'type' | 'base_url'>;
  apiKey: string | null;
  ssrfPolicy: SsrfPolicy;
  modelId: string;
  userPrompt: string;
  assistantReply: string;
}): Promise<string> {
  const fallback =
    params.userPrompt.replace(/\s+/g, ' ').trim().slice(0, 48) || 'New Chat';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    await validateConnectionUrl(params.connection.base_url, params.ssrfPolicy);
    const promptMessages = [
      {
        role: 'system',
        content:
          'Generate a concise 3 to 6 word title for this conversation. Output only the plain title without quotes or punctuation.',
      },
      {
        role: 'user',
        content: `User: ${params.userPrompt.slice(0, 300)}\nAssistant: ${params.assistantReply.slice(0, 300)}`,
      },
    ];

    if (params.connection.type === 'ollama') {
      const res = await fetch(`${normalizeBaseUrl(params.connection.base_url)}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: params.modelId,
          stream: false,
          messages: promptMessages,
        }),
        signal: controller.signal,
      });
      if (!res.ok) return fallback;
      const data = (await res.json()) as { message?: { content?: string } };
      const raw = data.message?.content?.replace(/^["']|["']$/g, '').trim();
      return raw ? raw.slice(0, 72) : fallback;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'VOLQ-AI/1.0',
    };
    const normalizedKey = normalizeApiKey(params.apiKey);
    if (normalizedKey) headers.Authorization = `Bearer ${normalizedKey}`;
    const res = await fetch(buildOpenAiEndpoint(params.connection.base_url, '/chat/completions'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: params.modelId,
        stream: false,
        max_tokens: 24,
        messages: promptMessages,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.replace(/^["']|["']$/g, '').trim();
    return raw ? raw.slice(0, 72) : fallback;
  } catch {
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateEmbeddings(params: {
  connection: Pick<ConnectionRecord, 'type' | 'base_url'>;
  apiKey: string | null;
  ssrfPolicy: SsrfPolicy;
  modelId: string;
  inputs: string[];
}): Promise<number[][]> {
  if (params.inputs.length === 0) return [];
  await validateConnectionUrl(params.connection.base_url, params.ssrfPolicy);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    if (params.connection.type === 'ollama') {
      const res = await fetch(`${normalizeBaseUrl(params.connection.base_url)}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: params.modelId,
          input: params.inputs,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`Ollama embeddings failed (${res.status})`);
      }
      const data = (await res.json()) as { embeddings?: number[][] };
      if (!Array.isArray(data.embeddings)) {
        throw new Error('Invalid embeddings response from Ollama');
      }
      return data.embeddings;
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'VOLQ-AI/1.0',
    };
    const normalizedKey = normalizeApiKey(params.apiKey);
    if (normalizedKey) headers.Authorization = `Bearer ${normalizedKey}`;
    const res = await fetch(buildOpenAiEndpoint(params.connection.base_url, '/embeddings'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: params.modelId,
        input: params.inputs,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Provider embeddings failed (${res.status})`);
    }
    const data = (await res.json()) as {
      data?: Array<{ embedding: number[]; index?: number }>;
    };
    if (!Array.isArray(data.data)) {
      throw new Error('Invalid embeddings response from provider');
    }
    return data.data
      .slice()
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((item) => item.embedding);
  } finally {
    clearTimeout(timeout);
  }
}
