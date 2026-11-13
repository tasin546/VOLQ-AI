import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createDatabase } from '../db/index.js';

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const first = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!first) return '';
  return first.split(';')[0] ?? '';
}

function parseSseEvents(rawBody: string): Array<Record<string, unknown>> {
  return rawBody
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.startsWith('data:'))
    .map((block) => JSON.parse(block.slice(5).trim()) as Record<string, unknown>);
}

describe('SSE streaming relay, stop/regenerate/edit, export & prompts', () => {
  let mockServer: http.Server;
  let mockBaseUrl = '';
  let lastOpenAiPayload: Record<string, unknown> | null = null;
  let slowMode = false;

  beforeAll(async () => {
    mockServer = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const bodyStr = Buffer.concat(chunks).toString('utf8');
      const body = bodyStr ? (JSON.parse(bodyStr) as Record<string, unknown>) : {};

      if (req.url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models: [{ name: 'llama3.2:latest' }] }));
        return;
      }

      if (req.url === '/api/chat') {
        if (body.stream === false) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: { content: 'Ollama Streaming Summary' } }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        res.write(JSON.stringify({ message: { content: 'Hello ' }, done: false }) + '\n');
        await new Promise((r) => setTimeout(r, 15));
        if (slowMode) {
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (!res.writableEnded) {
          res.write(JSON.stringify({ message: { content: 'Ollama!' }, done: true }) + '\n');
          res.end();
        }
        return;
      }

      if (req.url === '/v1/chat/completions') {
        lastOpenAiPayload = body;
        if (body.stream === false) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({ choices: [{ message: { content: 'Vision Chat Title' } }] })
          );
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: 'Streamed ' } }] })}\n\n`
        );
        await new Promise((r) => setTimeout(r, 15));
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: 'OpenAI' } }] })}\n\n`
        );
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }

      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address();
        if (addr && typeof addr === 'object') {
          mockBaseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  it('streams Ollama and OpenAI-compatible responses, supports stop, regenerate, edit, export, and prompts', async () => {
    const dbCtx = await createDatabase(':memory:');
    const config = loadConfig({
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-00000000000000',
      ENCRYPTION_KEY: 'test-encryption-key-00000000000000',
      APP_ORIGIN: 'http://localhost:3000',
    });

    const { app } = await buildApp({ dbCtx, config, logger: false });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    const appOrigin = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 3001}`;

    // Register admin
    const reg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'admin@volq.local',
        password: 'StrongPassword123',
        displayName: 'Admin',
      },
    });
    const cookie = extractCookie(reg.headers['set-cookie']);
    const csrf = reg.json().csrfToken as string;

    // Add Ollama & OpenAI connections
    const ollamaConn = (
      await app.inject({
        method: 'POST',
        url: '/api/admin/connections',
        headers: { cookie, 'x-csrf-token': csrf },
        payload: { name: 'Ollama', type: 'ollama', baseUrl: mockBaseUrl },
      })
    ).json().connection;

    const openaiConn = (
      await app.inject({
        method: 'POST',
        url: '/api/admin/connections',
        headers: { cookie, 'x-csrf-token': csrf },
        payload: {
          name: 'OpenAI',
          type: 'openai_compatible',
          baseUrl: mockBaseUrl,
          apiKey: 'sk-test-stream-1234',
        },
      })
    ).json().connection;

    // Create chat & stream via Ollama
    const chatRes = await app.inject({
      method: 'POST',
      url: '/api/chats',
      headers: { cookie, 'x-csrf-token': csrf },
      payload: { connectionId: ollamaConn.id, modelId: 'llama3.2:latest' },
    });
    const chatId = chatRes.json().chat.id as string;

    const streamRes = await app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/messages/stream`,
      headers: { cookie, 'x-csrf-token': csrf },
      payload: { content: 'Say hello from Ollama' },
    });
    expect(streamRes.statusCode).toBe(200);
    expect(streamRes.headers['content-type']).toContain('text/event-stream');

    const events = parseSseEvents(streamRes.body);
    const deltas = events.filter((e) => e.type === 'delta').map((e) => e.content);
    expect(deltas.join('')).toBe('Hello Ollama!');
    expect(events.some((e) => e.type === 'title' && e.title === 'Ollama Streaming Summary')).toBe(
      true
    );

    // Verify persistence
    const fetchedChat = await app.inject({
      method: 'GET',
      url: `/api/chats/${chatId}`,
      headers: { cookie },
    });
    expect(fetchedChat.json().chat.title).toBe('Ollama Streaming Summary');
    expect(fetchedChat.json().messages).toHaveLength(2);
    expect(fetchedChat.json().messages[1].content).toBe('Hello Ollama!');

    // Stream via OpenAI-compatible with base64 vision image
    const openaiStream = await app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/messages/stream`,
      headers: { cookie, 'x-csrf-token': csrf },
      payload: {
        content: 'Describe image',
        connectionId: openaiConn.id,
        modelId: 'gpt-4o-mini',
        images: [{ mimeType: 'image/png', dataBase64: 'iVBORw0KGgo=' }],
      },
    });
    const openaiDeltas = parseSseEvents(openaiStream.body)
      .filter((e) => e.type === 'delta')
      .map((e) => e.content);
    expect(openaiDeltas.join('')).toBe('Streamed OpenAI');
    expect(lastOpenAiPayload).toBeTruthy();

    // Regenerate last response
    const regenRes = await app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/regenerate`,
      headers: { cookie, 'x-csrf-token': csrf },
      payload: {},
    });
    expect(
      parseSseEvents(regenRes.body)
        .filter((e) => e.type === 'delta')
        .map((e) => e.content)
        .join('')
    ).toBe('Streamed OpenAI');

    // Edit first user message & resend
    const userMsgId = fetchedChat.json().messages[0].id as string;
    const editRes = await app.inject({
      method: 'PATCH',
      url: `/api/chats/${chatId}/messages/${userMsgId}`,
      headers: { cookie, 'x-csrf-token': csrf },
      payload: { content: 'Edited question', connectionId: ollamaConn.id, modelId: 'llama3.2:latest' },
    });
    expect(
      parseSseEvents(editRes.body)
        .filter((e) => e.type === 'delta')
        .map((e) => e.content)
        .join('')
    ).toBe('Hello Ollama!');

    const afterEdit = (
      await app.inject({ method: 'GET', url: `/api/chats/${chatId}`, headers: { cookie } })
    ).json();
    expect(afterEdit.messages).toHaveLength(2);
    expect(afterEdit.messages[0].content).toBe('Edited question');

    // Test real HTTP stop/abort during slow Ollama stream
    slowMode = true;
    const liveReq = fetch(`${appOrigin}/api/chats/${chatId}/messages/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
        'X-CSRF-Token': csrf,
      },
      body: JSON.stringify({
        content: 'Slow prompt',
        connectionId: ollamaConn.id,
        modelId: 'llama3.2:latest',
      }),
    });
    await new Promise((r) => setTimeout(r, 80));
    await fetch(`${appOrigin}/api/chats/${chatId}/stop`, {
      method: 'POST',
      headers: { Cookie: cookie, 'X-CSRF-Token': csrf },
    });
    const liveRes = await liveReq;
    const liveBody = await liveRes.text();
    slowMode = false;
    const liveEvents = parseSseEvents(liveBody);
    const doneEvent = liveEvents.find((e) => e.type === 'done') as
      | { message?: { status?: string; content?: string } }
      | undefined;
    expect(doneEvent?.message?.status).toBe('stopped');
    expect(doneEvent?.message?.content).toBe('Hello ');

    // Export Markdown & JSON
    const mdExport = await app.inject({
      method: 'GET',
      url: `/api/chats/${chatId}/export?format=md`,
      headers: { cookie },
    });
    expect(mdExport.statusCode).toBe(200);
    expect(mdExport.body).toContain('# Ollama Streaming Summary');

    const jsonExport = await app.inject({
      method: 'GET',
      url: `/api/chats/${chatId}/export?format=json`,
      headers: { cookie },
    });
    expect(jsonExport.statusCode).toBe(200);
    expect(JSON.parse(jsonExport.body).chat.id).toBe(chatId);

    // Prompt library CRUD
    const promptCreate = await app.inject({
      method: 'POST',
      url: '/api/prompts',
      headers: { cookie, 'x-csrf-token': csrf },
      payload: {
        title: 'Summarize',
        command: 'summarize',
        content: 'Summarize the following text in 3 bullets:',
      },
    });
    expect(promptCreate.statusCode).toBe(201);
    const promptId = promptCreate.json().prompt.id as string;

    const promptsList = await app.inject({
      method: 'GET',
      url: '/api/prompts',
      headers: { cookie },
    });
    expect(promptsList.json().prompts).toHaveLength(1);

    const promptDel = await app.inject({
      method: 'DELETE',
      url: `/api/prompts/${promptId}`,
      headers: { cookie, 'x-csrf-token': csrf },
    });
    expect(promptDel.statusCode).toBe(200);

    await app.close();
    await dbCtx.close();
  });
});
