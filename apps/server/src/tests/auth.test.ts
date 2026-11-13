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

describe('auth, admin, and encrypted connections', () => {
  let mockServer: http.Server;
  let mockBaseUrl = '';

  beforeAll(async () => {
    mockServer = http.createServer((req, res) => {
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models: [{ name: 'llama3.2:latest' }] }));
        return;
      }
      if (req.url === '/v1/models') {
        if (req.headers.authorization !== 'Bearer sk-provider-secret-9999') {
          res.writeHead(401);
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'gpt-4o-mini' }] }));
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

  it('bootstraps first user as admin, enforces signup policy, CSRF, admin auth, and hides encrypted keys', async () => {
    const dbCtx = await createDatabase(':memory:');
    const config = loadConfig({
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-00000000000000',
      ENCRYPTION_KEY: 'test-encryption-key-00000000000000',
      APP_ORIGIN: 'http://localhost:3000',
    });

    const { app } = await buildApp({ dbCtx, config, logger: false });

    const statusBefore = await app.inject({ method: 'GET', url: '/api/auth/status' });
    expect(statusBefore.statusCode).toBe(200);
    expect(statusBefore.json()).toEqual({ needsSetup: true, signupMode: 'open' });

    // 1. First signup -> admin
    const adminReg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'admin@volq.local',
        password: 'StrongPassword123',
        displayName: 'Admin One',
      },
    });
    expect(adminReg.statusCode).toBe(201);
    const adminBody = adminReg.json();
    expect(adminBody.user.role).toBe('admin');
    const adminCookie = extractCookie(adminReg.headers['set-cookie']);
    const adminCsrf = adminBody.csrfToken as string;

    // 2. Second signup while open -> regular user
    const userReg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'user@volq.local',
        password: 'StrongPassword123',
        displayName: 'User Two',
      },
    });
    expect(userReg.statusCode).toBe(201);
    const userBody = userReg.json();
    expect(userBody.user.role).toBe('user');
    const userCookie = extractCookie(userReg.headers['set-cookie']);
    const userCsrf = userBody.csrfToken as string;

    // 3. Mutating route without CSRF fails with 403
    const missingCsrf = await app.inject({
      method: 'PATCH',
      url: '/api/admin/settings',
      headers: { cookie: adminCookie },
      payload: { signupMode: 'disabled' },
    });
    expect(missingCsrf.statusCode).toBe(403);

    // 4. Non-admin calling admin route fails with 403 even with valid CSRF
    const nonAdmin = await app.inject({
      method: 'PATCH',
      url: '/api/admin/settings',
      headers: { cookie: userCookie, 'x-csrf-token': userCsrf },
      payload: { signupMode: 'disabled' },
    });
    expect(nonAdmin.statusCode).toBe(403);

    // 5. Admin disables signups -> third signup blocked
    const disableRes = await app.inject({
      method: 'PATCH',
      url: '/api/admin/settings',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: { signupMode: 'disabled' },
    });
    expect(disableRes.statusCode).toBe(200);

    const thirdReg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'blocked@volq.local',
        password: 'StrongPassword123',
        displayName: 'Blocked',
      },
    });
    expect(thirdReg.statusCode).toBe(403);

    // 6. Add Ollama & OpenAI-compatible connections, verify key is encrypted in SQLite and never returned
    const ollamaRes = await app.inject({
      method: 'POST',
      url: '/api/admin/connections',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: {
        name: 'Local Ollama',
        type: 'ollama',
        baseUrl: mockBaseUrl,
      },
    });
    expect(ollamaRes.statusCode).toBe(201);
    const ollamaId = ollamaRes.json().connection.id as string;

    const openaiSecret = 'sk-provider-secret-9999';
    const openaiRes = await app.inject({
      method: 'POST',
      url: '/api/admin/connections',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: {
        name: 'Hosted OpenAI',
        type: 'openai_compatible',
        baseUrl: mockBaseUrl,
        apiKey: openaiSecret,
      },
    });
    expect(openaiRes.statusCode).toBe(201);
    const openaiId = openaiRes.json().connection.id as string;
    expect(JSON.stringify(openaiRes.json())).not.toContain(openaiSecret);

    const rawDbRow = await dbCtx.db
      .selectFrom('connections')
      .select('encrypted_api_key')
      .where('id', '=', openaiId)
      .executeTakeFirstOrThrow();
    expect(rawDbRow.encrypted_api_key).not.toContain(openaiSecret);

    // 7. Test both connections & list models as regular user
    const testOllama = await app.inject({
      method: 'POST',
      url: `/api/admin/connections/${ollamaId}/test`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
    });
    expect(testOllama.statusCode).toBe(200);
    expect(testOllama.json()).toMatchObject({
      ok: true,
      models: [{ id: 'llama3.2:latest', name: 'llama3.2:latest' }],
    });

    const testOpenai = await app.inject({
      method: 'POST',
      url: `/api/admin/connections/${openaiId}/test`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
    });
    expect(testOpenai.statusCode).toBe(200);
    expect(testOpenai.json()).toMatchObject({
      ok: true,
      models: [{ id: 'gpt-4o-mini', name: 'gpt-4o-mini' }],
    });

    const modelsRes = await app.inject({
      method: 'GET',
      url: '/api/models',
      headers: { cookie: userCookie },
    });
    expect(modelsRes.statusCode).toBe(200);
    const modelsJson = modelsRes.json();
    expect(modelsJson.models).toHaveLength(2);
    expect(JSON.stringify(modelsJson)).not.toContain(openaiSecret);

    await app.close();
    await dbCtx.close();
  });
});
