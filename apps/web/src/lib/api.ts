let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  data?: Record<string, unknown>;
  constructor(
    status: number,
    message: string,
    code?: string,
    data?: Record<string, unknown>
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers(options.headers);

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }

  const res = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    let payloadData: Record<string, unknown> | undefined;
    try {
      const data = (await res.json()) as { error?: string; message?: string; code?: string; [k: string]: unknown };
      if (typeof data.message === 'string' && data.message.trim()) {
        message = data.message.trim();
      } else if (typeof data.error === 'string' && data.error.trim()) {
        message = data.error.trim();
      }
      if (typeof data.code === 'string') code = data.code;
      payloadData = data;
    } catch {
      // ignore non-json error bodies
    }
    throw new ApiError(res.status, message, code, payloadData);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export interface SseEvent {
  type: 'meta' | 'delta' | 'sources' | 'title' | 'done' | 'error';
  [key: string]: unknown;
}

export async function readSseStream(
  path: string,
  body: unknown,
  onEvent: (event: SseEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const res = await fetch(path, {
    method: 'POST',
    headers,
    credentials: 'include',
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    let message = `Stream request failed (${res.status})`;
    let code: string | undefined;
    let payloadData: Record<string, unknown> | undefined;
    try {
      const data = (await res.json()) as { error?: string; message?: string; code?: string; [k: string]: unknown };
      if (typeof data.message === 'string' && data.message.trim()) {
        message = data.message.trim();
      } else if (typeof data.error === 'string' && data.error.trim()) {
        message = data.error.trim();
      }
      if (typeof data.code === 'string') code = data.code;
      payloadData = data;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message, code, payloadData);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIdx = buffer.indexOf('\n\n');
    while (sepIdx !== -1) {
      const block = buffer.slice(0, sepIdx).trim();
      buffer = buffer.slice(sepIdx + 2);
      if (block.startsWith('data:')) {
        const jsonStr = block.slice(5).trim();
        if (jsonStr) {
          onEvent(JSON.parse(jsonStr) as SseEvent);
        }
      }
      sepIdx = buffer.indexOf('\n\n');
    }
  }
}
