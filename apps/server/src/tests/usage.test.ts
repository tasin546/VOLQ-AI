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

describe('AI usage limits & enforcement', () => {
  let mockServer: http.Server;
  let mockBaseUrl = '';
  let includeProviderUsage = true;

  beforeAll(async () => {
    mockServer = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const rawBody = Buffer.concat(chunks).toString('utf8');

      if (req.url === '/v1/models') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'gpt-usage-test' }] }));
        return;
      }

      if (req.url === '/v1/chat/completions') {
        const parsed = JSON.parse(rawBody || '{}') as { messages?: Array<{ content?: string }> };
        const isTitleReq = parsed.messages?.[0]?.content?.includes('concise 3 to 6 word title');

        if (isTitleReq) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              choices: [{ message: { content: 'Usage Test Chat' } }],
            })
          );
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello ' } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'world!' } }] })}\n\n`);
        if (includeProviderUsage) {
          res.write(
            `data: ${JSON.stringify({
              choices: [],
              usage: { prompt_tokens: 120, completion_tokens: 30 },
            })}\n\n`
          );
        }
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

  it('enforces daily message & token quotas, supports overrides/exemptions/resets, excludes title generation, and resets across UTC boundaries', async () => {
    const dbCtx = await createDatabase(':memory:');
    const config = loadConfig({
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-00000000000000',
      ENCRYPTION_KEY: 'test-encryption-key-00000000000000',
      APP_ORIGIN: 'http://localhost:3000',
    });

    let fakeNow = new Date('2026-05-04T15:00:00.000Z'); // Monday UTC

    const { app } = await buildApp({
      dbCtx,
      config,
      logger: false,
      nowFn: () => fakeNow,
    });

    const adminReg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'admin@volq.test',
        password: 'supersecretpassword',
        displayName: 'Admin',
      },
    });
    expect(adminReg.statusCode).toBe(201);
    const adminCookie = extractCookie(adminReg.headers['set-cookie']);
    const adminCsrf = adminReg.json().csrfToken as string;

    const userReg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'member@volq.test',
        password: 'supersecretpassword',
        displayName: 'Member',
      },
    });
    expect(userReg.statusCode).toBe(201);
    const memberCookie = extractCookie(userReg.headers['set-cookie']);
    const memberCsrf = userReg.json().csrfToken as string;
    const memberId = userReg.json().user.id as string;

    // Allow local connection & add OpenAI-compatible mock connection
    const settingsRes = await app.inject({
      method: 'PATCH',
      url: '/api/admin/settings',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: {
        ssrfPolicy: { allowPrivateNetworks: true, allowlist: [], denylist: [] },
      },
    });
    expect(settingsRes.statusCode).toBe(200);

    const connRes = await app.inject({
      method: 'POST',
      url: '/api/admin/connections',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: {
        name: 'Mock OpenAI',
        type: 'openai_compatible',
        baseUrl: mockBaseUrl,
        apiKey: 'sk-test-usage',
      },
    });
    expect(connRes.statusCode).toBe(201);
    const connectionId = connRes.json().connection.id as string;

    await app.inject({
      method: 'POST',
      url: `/api/admin/connections/${connectionId}/sync`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
    });

    // Global policy: 2 messages per UTC day, admins exempt
    const putPolicy = await app.inject({
      method: 'PUT',
      url: '/api/admin/usage/policy',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: {
        messagesEnabled: true,
        messagesLimit: 2,
        messagesPeriod: 'day',
        tokensEnabled: true,
        tokensLimit: 1000,
        tokensPeriod: 'day',
        applyToAdmins: false,
      },
    });
    expect(putPolicy.statusCode).toBe(200);

    // Non-admin blocked from admin usage endpoints
    const forbiddenOverview = await app.inject({
      method: 'GET',
      url: '/api/admin/usage/overview',
      headers: { cookie: memberCookie },
    });
    expect(forbiddenOverview.statusCode).toBe(403);

    // Create member chat & send 2 messages
    const chatRes = await app.inject({
      method: 'POST',
      url: '/api/chats',
      headers: { cookie: memberCookie, 'x-csrf-token': memberCsrf },
      payload: { connectionId, modelId: 'gpt-usage-test' },
    });
    expect(chatRes.statusCode).toBe(201);
    const chatId = chatRes.json().chat.id as string;

    const s1 = await app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/messages/stream`,
      headers: { cookie: memberCookie, 'x-csrf-token': memberCsrf },
      payload: { content: 'First prompt triggers auto-title' },
    });
    expect(s1.statusCode).toBe(200);

    const usage1 = await app.inject({
      method: 'GET',
      url: '/api/usage/me',
      headers: { cookie: memberCookie },
    });
    expect(usage1.statusCode).toBe(200);
    // Title generation is NOT counted as a second message/token event
    expect(usage1.json().messages.used).toBe(1);
    expect(usage1.json().tokens.used).toBe(150);

    // Second message uses estimated fallback (no provider usage block)
    includeProviderUsage = false;
    const s2 = await app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/messages/stream`,
      headers: { cookie: memberCookie, 'x-csrf-token': memberCsrf },
      payload: { content: 'Second prompt without usage field' },
    });
    expect(s2.statusCode).toBe(200);

    const usage2 = await app.inject({
      method: 'GET',
      url: '/api/usage/me',
      headers: { cookie: memberCookie },
    });
    expect(usage2.json().messages.used).toBe(2);
    expect(usage2.json().blockedMeter).toBe('messages');
    expect(usage2.json().tokens.used).toBeGreaterThan(150);

    // Third message, regenerate, and edit are all blocked with 429 usage_limit_exceeded
    const s3 = await app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/messages/stream`,
      headers: { cookie: memberCookie, 'x-csrf-token': memberCsrf },
      payload: { content: 'Third prompt blocked' },
    });
    expect(s3.statusCode).toBe(429);
    expect(s3.json().code).toBe('usage_limit_exceeded');
    expect(s3.json().meter).toBe('messages');
    expect(s3.json().limit).toBe(2);
    expect(s3.json().used).toBe(2);

    const regenBlocked = await app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/regenerate`,
      headers: { cookie: memberCookie, 'x-csrf-token': memberCsrf },
      payload: {},
    });
    expect(regenBlocked.statusCode).toBe(429);
    expect(regenBlocked.json().code).toBe('usage_limit_exceeded');

    const chatDetail = await app.inject({
      method: 'GET',
      url: `/api/chats/${chatId}`,
      headers: { cookie: memberCookie },
    });
    const firstUserMsg = (chatDetail.json().messages as Array<{ id: string; role: string }>).find(
      (m) => m.role === 'user'
    )!;
    const patchBlocked = await app.inject({
      method: 'PATCH',
      url: `/api/chats/${chatId}/messages/${firstUserMsg.id}`,
      headers: { cookie: memberCookie, 'x-csrf-token': memberCsrf },
      payload: { content: 'Edited while blocked' },
    });
    expect(patchBlocked.statusCode).toBe(429);
    expect(patchBlocked.json().code).toBe('usage_limit_exceeded');

    // Admin is exempt when applyToAdmins=false even after 3 messages
    const adminChat = await app.inject({
      method: 'POST',
      url: '/api/chats',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: { connectionId, modelId: 'gpt-usage-test' },
    });
    const adminChatId = adminChat.json().chat.id as string;
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/chats/${adminChatId}/messages/stream`,
        headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
        payload: { content: `Admin msg ${i}` },
      });
      expect(res.statusCode).toBe(200);
    }

    // Apply limits to admins -> admin immediately hits limit on 4th
    await app.inject({
      method: 'PUT',
      url: '/api/admin/usage/policy',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: {
        messagesEnabled: true,
        messagesLimit: 2,
        messagesPeriod: 'day',
        tokensEnabled: true,
        tokensLimit: 1000,
        tokensPeriod: 'day',
        applyToAdmins: true,
      },
    });
    const adminBlocked = await app.inject({
      method: 'POST',
      url: `/api/chats/${adminChatId}/messages/stream`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: { content: 'Admin blocked' },
    });
    expect(adminBlocked.statusCode).toBe(429);

    // Override member to unlimited -> succeeds
    await app.inject({
      method: 'PUT',
      url: `/api/admin/usage/users/${memberId}`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: {
        mode: 'unlimited',
        messagesEnabled: false,
        messagesLimit: null,
        messagesPeriod: 'day',
        tokensEnabled: false,
        tokensLimit: null,
        tokensPeriod: 'day',
      },
    });
    const s4Unlimited = await app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/messages/stream`,
      headers: { cookie: memberCookie, 'x-csrf-token': memberCsrf },
      payload: { content: 'Allowed under unlimited override' },
    });
    expect(s4Unlimited.statusCode).toBe(200);

    // Return member to global and advance fake clock across UTC midnight -> resets to 0
    await app.inject({
      method: 'PUT',
      url: `/api/admin/usage/users/${memberId}`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: { mode: 'global' },
    });
    const usageBeforeMidnight = await app.inject({
      method: 'GET',
      url: '/api/usage/me',
      headers: { cookie: memberCookie },
    });
    expect(usageBeforeMidnight.json().messages.used).toBe(3);

    fakeNow = new Date('2026-05-05T00:00:05.000Z');
    const usageAfterMidnight = await app.inject({
      method: 'GET',
      url: '/api/usage/me',
      headers: { cookie: memberCookie },
    });
    expect(usageAfterMidnight.json().messages.used).toBe(0);

    // Send 1 msg on May 5 then test explicit reset endpoint clears current period
    await app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/messages/stream`,
      headers: { cookie: memberCookie, 'x-csrf-token': memberCsrf },
      payload: { content: 'New day message' },
    });
    fakeNow = new Date('2026-05-05T00:01:00.000Z');
    const overviewBeforeReset = await app.inject({
      method: 'GET',
      url: '/api/admin/usage/overview',
      headers: { cookie: adminCookie },
    });
    expect(overviewBeforeReset.statusCode).toBe(200);
    const memberOverview = (
      overviewBeforeReset.json().users as Array<{ userId: string; summary: { messages: { used: number } } }>
    ).find((u) => u.userId === memberId)!;
    expect(memberOverview.summary.messages.used).toBe(1);

    await app.inject({
      method: 'POST',
      url: `/api/admin/usage/users/${memberId}/reset`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
    });
    const usageAfterManualReset = await app.inject({
      method: 'GET',
      url: '/api/usage/me',
      headers: { cookie: memberCookie },
    });
    expect(usageAfterManualReset.json().messages.used).toBe(0);

    await app.close();
    await dbCtx.close();
  });
});
