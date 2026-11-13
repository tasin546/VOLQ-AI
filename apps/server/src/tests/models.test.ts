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

describe('admin model management and server-side visibility enforcement', () => {
  let mockServer: http.Server;
  let mockBaseUrl = '';
  let lastReceivedSystem = '';

  beforeAll(async () => {
    mockServer = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const bodyStr = Buffer.concat(chunks).toString('utf8');
      const body = bodyStr ? (JSON.parse(bodyStr) as Record<string, unknown>) : {};

      if (req.url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            models: [{ name: 'llama3.2:latest' }, { name: 'secret-eval:70b' }],
          })
        );
        return;
      }

      if (req.url === '/api/chat') {
        const msgs = (body.messages as Array<{ role: string; content: string }>) ?? [];
        if (body.stream === false) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: { content: 'Model Test Title' } }));
          return;
        }
        lastReceivedSystem = msgs.find((m) => m.role === 'system')?.content ?? '';
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        res.write(JSON.stringify({ message: { content: 'ok' }, done: true }) + '\n');
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

  it('allows admin rename/hide/private/delete/restore and blocks non-admins from hidden/private/deleted models', async () => {
    const dbCtx = await createDatabase(':memory:');
    const config = loadConfig({
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-00000000000000',
      ENCRYPTION_KEY: 'test-encryption-key-00000000000000',
    });

    const { app } = await buildApp({ dbCtx, config, logger: false });

    // Register admin & non-admin user
    const adminReg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'admin@volq.local', password: 'StrongPassword123', displayName: 'Admin' },
    });
    const adminCookie = extractCookie(adminReg.headers['set-cookie']);
    const adminCsrf = adminReg.json().csrfToken as string;

    const userReg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'user@volq.local', password: 'StrongPassword123', displayName: 'User' },
    });
    const userCookie = extractCookie(userReg.headers['set-cookie']);
    const userCsrf = userReg.json().csrfToken as string;

    // Non-admin cannot access /api/admin/models
    const forbiddenAdminModels = await app.inject({
      method: 'GET',
      url: '/api/admin/models',
      headers: { cookie: userCookie },
    });
    expect(forbiddenAdminModels.statusCode).toBe(403);

    // Admin adds & tests connection
    const connRes = await app.inject({
      method: 'POST',
      url: '/api/admin/connections',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: { name: 'Ollama', type: 'ollama', baseUrl: mockBaseUrl },
    });
    const connId = connRes.json().connection.id as string;

    await app.inject({
      method: 'POST',
      url: `/api/admin/connections/${connId}/test`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
    });

    const adminModels = await app.inject({
      method: 'GET',
      url: '/api/admin/models',
      headers: { cookie: adminCookie },
    });
    expect(adminModels.statusCode).toBe(200);
    const list = adminModels.json().models as Array<{ id: string; providerModelId: string }>;
    const publicMeta = list.find((m) => m.providerModelId === 'llama3.2:latest')!;
    const privateMeta = list.find((m) => m.providerModelId === 'secret-eval:70b')!;

    // Rename public model and give it an admin-only system prompt
    await app.inject({
      method: 'PATCH',
      url: `/api/admin/models/${publicMeta.id}`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: {
        displayName: 'Obsidian Fast',
        description: 'Fast daily model',
        systemPrompt: 'ADMIN_SECRET_SYSTEM_PROMPT',
      },
    });

    // Make second model private
    await app.inject({
      method: 'PATCH',
      url: `/api/admin/models/${privateMeta.id}`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: { visibility: 'private' },
    });

    // Refresh models: verify admin displayName is preserved
    await app.inject({
      method: 'POST',
      url: '/api/models/refresh',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
    });

    // User sees only public model with renamed displayName and NO systemPrompt leaked
    const userCatalog = await app.inject({
      method: 'GET',
      url: '/api/models',
      headers: { cookie: userCookie },
    });
    expect(userCatalog.statusCode).toBe(200);
    expect(userCatalog.json().models).toHaveLength(1);
    expect(userCatalog.json().models[0].name).toBe('Obsidian Fast');
    expect(JSON.stringify(userCatalog.json())).not.toContain('ADMIN_SECRET_SYSTEM_PROMPT');

    // User creates chat and gets 403 when attempting to call private model by provider id
    const userChat = await app.inject({
      method: 'POST',
      url: '/api/chats',
      headers: { cookie: userCookie, 'x-csrf-token': userCsrf },
      payload: {},
    });
    const chatId = userChat.json().chat.id as string;

    const privateAttempt = await app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/messages/stream`,
      headers: { cookie: userCookie, 'x-csrf-token': userCsrf },
      payload: {
        content: 'Hello private',
        connectionId: connId,
        modelId: 'secret-eval:70b',
      },
    });
    expect(privateAttempt.statusCode).toBe(403);

    // User CAN call public model and admin systemPrompt is injected server-side
    const publicAttempt = await app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/messages/stream`,
      headers: { cookie: userCookie, 'x-csrf-token': userCsrf },
      payload: {
        content: 'Hello public',
        connectionId: connId,
        modelId: 'llama3.2:latest',
      },
    });
    expect(publicAttempt.statusCode).toBe(200);
    expect(lastReceivedSystem).toContain('ADMIN_SECRET_SYSTEM_PROMPT');

    // Hide public model -> user gets 404 when trying to call it
    await app.inject({
      method: 'PATCH',
      url: `/api/admin/models/${publicMeta.id}`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: { isHidden: true },
    });

    const hiddenAttempt = await app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/messages/stream`,
      headers: { cookie: userCookie, 'x-csrf-token': userCsrf },
      payload: {
        content: 'Hello hidden',
        connectionId: connId,
        modelId: 'llama3.2:latest',
      },
    });
    expect(hiddenAttempt.statusCode).toBe(404);

    // Soft-delete & restore via bulk action
    await app.inject({
      method: 'POST',
      url: '/api/admin/models/bulk',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: { ids: [publicMeta.id], action: 'delete' },
    });
    const deletedFilter = await app.inject({
      method: 'GET',
      url: '/api/admin/models?status=deleted',
      headers: { cookie: adminCookie },
    });
    expect(deletedFilter.json().models).toHaveLength(1);

    await app.inject({
      method: 'POST',
      url: '/api/admin/models/bulk',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: { ids: [publicMeta.id], action: 'restore' },
    });

    // Bulk action on >200 models (chunks across batches without hitting limit)
    const largeBatchIds = Array.from({ length: 250 }, (_, i) => `large-batch-model-${i}`);
    const bulkLarge = await app.inject({
      method: 'POST',
      url: '/api/admin/models/bulk',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: { ids: [publicMeta.id, ...largeBatchIds], action: 'make_private' },
    });
    expect(bulkLarge.statusCode).toBe(200);
    expect(bulkLarge.json().ok).toBe(true);
    expect(bulkLarge.json().count).toBe(251);

    const updatedMeta = await dbCtx.db
      .selectFrom('models_metadata')
      .select(['visibility'])
      .where('id', '=', publicMeta.id)
      .executeTakeFirstOrThrow();
    expect(updatedMeta.visibility).toBe('private');

    await app.close();
    await dbCtx.close();
  });
});
