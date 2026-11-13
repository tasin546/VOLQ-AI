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

function buildMinimalPdf(text: string): Buffer {
  const escaped = text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const streamContent = `BT\n/F1 12 Tf\n72 720 Td\n(${escaped}) Tj\nET\n`;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'utf8')} >>\nstream\n${streamContent}endstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }
  const xrefStart = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

function buildMultipart(
  filename: string,
  mimeType: string,
  content: Buffer
): { payload: Buffer; contentType: string } {
  const boundary = '----volqtestboundary12345';
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    'utf8'
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return {
    payload: Buffer.concat([header, content, footer]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe('admin knowledge base, magic-byte validation, and RAG context injection', () => {
  let mockServer: http.Server;
  let mockBaseUrl = '';
  let lastSystemMessage = '';

  beforeAll(async () => {
    mockServer = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
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
          res.end(JSON.stringify({ message: { content: 'Knowledge Chat' } }));
          return;
        }
        const msgs = (body.messages as Array<{ role: string; content: string }>) ?? [];
        lastSystemMessage = msgs.find((m) => m.role === 'system')?.content ?? '';
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        res.write(
          JSON.stringify({
            message: { content: 'The launch code from the runbook is AURORA-942.' },
            done: true,
          }) + '\n'
        );
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

  it('enforces admin-only KB routes, parses PDF + TXT, blocks spoofed files, and injects ordered prompts + context', async () => {
    const dbCtx = await createDatabase(':memory:');
    const config = loadConfig({
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-00000000000000',
      ENCRYPTION_KEY: 'test-encryption-key-00000000000000',
    });

    const { app } = await buildApp({ dbCtx, config, logger: false });

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

    // Create KB as admin
    const kbRes = await app.inject({
      method: 'POST',
      url: '/api/admin/knowledge/bases',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: {
        name: 'Internal Runbooks',
        description: 'Ops docs',
        systemPrompt: 'KB_SYSTEM_PROMPT',
      },
    });
    expect(kbRes.statusCode).toBe(201);
    const kbId = kbRes.json().base.id as string;

    // Non-admin blocked from listing or uploading to KB
    const userListKb = await app.inject({
      method: 'GET',
      url: '/api/admin/knowledge/bases',
      headers: { cookie: userCookie },
    });
    expect(userListKb.statusCode).toBe(403);

    const txtUpload = buildMultipart(
      'runbook.txt',
      'text/plain',
      Buffer.from('The production cluster region is eu-central-1 and launch code is AURORA-942.', 'utf8')
    );
    const userUpload = await app.inject({
      method: 'POST',
      url: `/api/admin/knowledge/bases/${kbId}/files`,
      headers: {
        cookie: userCookie,
        'x-csrf-token': userCsrf,
        'content-type': txtUpload.contentType,
      },
      payload: txtUpload.payload,
    });
    expect(userUpload.statusCode).toBe(403);

    // Admin uploads TXT
    const adminTxt = await app.inject({
      method: 'POST',
      url: `/api/admin/knowledge/bases/${kbId}/files`,
      headers: {
        cookie: adminCookie,
        'x-csrf-token': adminCsrf,
        'content-type': txtUpload.contentType,
      },
      payload: txtUpload.payload,
    });
    expect(adminTxt.statusCode).toBe(201);
    expect(adminTxt.json().file.status).toBe('ready');
    expect(adminTxt.json().file.chunkCount).toBeGreaterThan(0);

    // Admin uploads valid PDF
    const pdfBuf = buildMinimalPdf('Backup policy requires daily encrypted snapshots.');
    const pdfUpload = buildMultipart('policy.pdf', 'application/pdf', pdfBuf);
    const adminPdf = await app.inject({
      method: 'POST',
      url: `/api/admin/knowledge/bases/${kbId}/files`,
      headers: {
        cookie: adminCookie,
        'x-csrf-token': adminCsrf,
        'content-type': pdfUpload.contentType,
      },
      payload: pdfUpload.payload,
    });
    expect(adminPdf.statusCode).toBe(201);
    expect(adminPdf.json().file.status).toBe('ready');

    // Spoofed PNG renamed to .txt is rejected by magic-byte validation
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const spoofUpload = buildMultipart('fake.txt', 'text/plain', pngMagic);
    const spoofRes = await app.inject({
      method: 'POST',
      url: `/api/admin/knowledge/bases/${kbId}/files`,
      headers: {
        cookie: adminCookie,
        'x-csrf-token': adminCsrf,
        'content-type': spoofUpload.contentType,
      },
      payload: spoofUpload.payload,
    });
    expect(spoofRes.statusCode).toBe(400);

    // Set global prompt, add connection, attach KB + model prompt
    await app.inject({
      method: 'PATCH',
      url: '/api/admin/settings',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: { globalSystemPrompt: 'GLOBAL_SYSTEM_PROMPT' },
    });

    const connId = (
      await app.inject({
        method: 'POST',
        url: '/api/admin/connections',
        headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
        payload: { name: 'Ollama', type: 'ollama', baseUrl: mockBaseUrl },
      })
    ).json().connection.id as string;

    await app.inject({
      method: 'POST',
      url: `/api/admin/connections/${connId}/test`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
    });

    const modelId = (
      await app.inject({
        method: 'GET',
        url: '/api/admin/models',
        headers: { cookie: adminCookie },
      })
    ).json().models[0].id as string;

    await app.inject({
      method: 'PATCH',
      url: `/api/admin/models/${modelId}`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: { systemPrompt: 'MODEL_SYSTEM_PROMPT', knowledgeBaseIds: [kbId] },
    });

    // Regular user chats and triggers RAG retrieval
    const chatId = (
      await app.inject({
        method: 'POST',
        url: '/api/chats',
        headers: { cookie: userCookie, 'x-csrf-token': userCsrf },
        payload: { systemPrompt: 'CHAT_SYSTEM_PROMPT' },
      })
    ).json().chat.id as string;

    const streamRes = await app.inject({
      method: 'POST',
      url: `/api/chats/${chatId}/messages/stream`,
      headers: { cookie: userCookie, 'x-csrf-token': userCsrf },
      payload: {
        content: 'What is the launch code and backup policy?',
        connectionId: connId,
        modelId: 'llama3.2:latest',
      },
    });
    expect(streamRes.statusCode).toBe(200);

    // Verify prompt ordering: global -> kb -> model -> chat -> delimited untrusted context
    const gIdx = lastSystemMessage.indexOf('GLOBAL_SYSTEM_PROMPT');
    const kbIdx = lastSystemMessage.indexOf('KB_SYSTEM_PROMPT');
    const mIdx = lastSystemMessage.indexOf('MODEL_SYSTEM_PROMPT');
    const cIdx = lastSystemMessage.indexOf('CHAT_SYSTEM_PROMPT');
    const ctxIdx = lastSystemMessage.indexOf('<<<KNOWLEDGE_CONTEXT>>>');
    expect(gIdx).toBeGreaterThanOrEqual(0);
    expect(kbIdx).toBeGreaterThan(gIdx);
    expect(mIdx).toBeGreaterThan(kbIdx);
    expect(cIdx).toBeGreaterThan(mIdx);
    expect(ctxIdx).toBeGreaterThan(cIdx);
    expect(lastSystemMessage).toContain('AURORA-942');

    // Verify persisted sources metadata (name & filenames only)
    const chatData = (
      await app.inject({
        method: 'GET',
        url: `/api/chats/${chatId}`,
        headers: { cookie: userCookie },
      })
    ).json();
    const assistantMsg = chatData.messages[1];
    expect(assistantMsg.sources).toEqual([
      expect.objectContaining({
        knowledgeBaseName: 'Internal Runbooks',
      }),
    ]);

    await app.close();
    await dbCtx.close();
  });
});
