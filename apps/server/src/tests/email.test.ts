import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createDatabase } from '../db/index.js';
import { hashPassword } from '../lib/crypto.js';

describe('Milestone 4: Resend Email Verification & Admin Settings', () => {
  let mockResendServer: http.Server;
  let mockResendPort: number;
  let sentEmails: Array<{ to: string[]; from: string; subject: string; html: string }> = [];

  beforeAll(async () => {
    mockResendServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        if (req.url === '/emails' && req.method === 'POST') {
          const auth = req.headers.authorization;
          if (!auth || !auth.includes('re_test_key_12345')) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ statusCode: 401, message: 'Invalid API key' }));
            return;
          }
          const parsed = JSON.parse(body);
          sentEmails.push(parsed);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ id: `email_${Date.now()}` }));
          return;
        }
        res.writeHead(404);
        res.end();
      });
    });

    await new Promise<void>((resolve) => {
      mockResendServer.listen(0, '127.0.0.1', () => {
        const addr = mockResendServer.address();
        if (typeof addr === 'object' && addr) {
          mockResendPort = addr.port;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => mockResendServer.close(() => resolve()));
  });

  it('enforces lockout guard, tests Resend API, blocks unverified logins, and verifies token', async () => {
    const dbCtx = await createDatabase(':memory:');
    const config = loadConfig({
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-00000000000000',
      ENCRYPTION_KEY: 'test-encryption-key-00000000000000',
      APP_ORIGIN: 'http://localhost:3000',
      APP_BASE_URL: 'http://localhost:3000',
    });

    // Point Resend fetch calls to mock server by setting env or patching fetch
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      if (urlStr.startsWith('https://api.resend.com/emails')) {
        const mockUrl = `http://127.0.0.1:${mockResendPort}/emails`;
        return originalFetch(mockUrl, init);
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    const { app } = await buildApp({ dbCtx, config, logger: true });

    // 1. Bootstrap Admin user
    const adminPassHash = await hashPassword('AdminPass123!');
    const now = new Date().toISOString();
    await dbCtx.db
      .insertInto('users')
      .values({
        id: 'admin_1',
        email: 'admin@volq.test',
        display_name: 'Admin User',
        password_hash: adminPassHash,
        role: 'admin',
        is_active: 1,
        preferences_json: '{}',
        email_verified_at: now,
        created_at: now,
        updated_at: now,
      })
      .execute();

    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'admin@volq.test', password: 'AdminPass123!' },
    });
    expect(adminLogin.statusCode).toBe(200);
    const adminCookies = adminLogin.cookies;
    const adminCsrf = adminLogin.json().csrfToken;

    const authHeaders = {
      cookie: adminCookies.map((c) => `${c.name}=${c.value}`).join('; '),
      'x-csrf-token': adminCsrf,
    };

    // 2. Lockout Guard: cannot enable verification without a successful test email
    const tryEnableEarly = await app.inject({
      method: 'PUT',
      url: '/api/admin/email',
      headers: authHeaders,
      payload: {
        requireVerification: true,
      },
    });
    expect(tryEnableEarly.statusCode).toBe(400);
    expect(tryEnableEarly.json().error).toContain('A test email must succeed');

    // 3. Save Resend API key and sender address
    const saveCredentials = await app.inject({
      method: 'PUT',
      url: '/api/admin/email',
      headers: authHeaders,
      payload: {
        apiKey: 're_test_key_12345',
        fromAddress: 'VOLQ AI <onboarding@resend.dev>',
      },
    });
    expect(saveCredentials.statusCode).toBe(200);
    expect(saveCredentials.json().settings.hasKey).toBe(true);

    // 4. Send test email
    const testSend = await app.inject({
      method: 'POST',
      url: '/api/admin/email/test',
      headers: authHeaders,
      payload: { recipientEmail: 'testuser@example.com' },
    });
    expect(testSend.statusCode).toBe(200);
    expect(testSend.json().success).toBe(true);
    expect(sentEmails.length).toBeGreaterThan(0);

    // 5. Now enable requireVerification
    const enableVerification = await app.inject({
      method: 'PUT',
      url: '/api/admin/email',
      headers: authHeaders,
      payload: {
        requireVerification: true,
        tokenExpiryHours: 24,
      },
    });
    expect(enableVerification.statusCode).toBe(200);
    expect(enableVerification.json().settings.requireVerification).toBe(true);

    // 6. Register a new user when verification is required
    sentEmails = [];
    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'newuser@example.com',
        password: 'Password123!',
        displayName: 'New User',
      },
    });
    expect(registerRes.statusCode).toBe(201);
    expect(registerRes.json().requiresVerification).toBe(true);
    expect(sentEmails.length).toBe(1);
    expect(sentEmails[0]!.to).toContain('newuser@example.com');
    expect(sentEmails[0]!.html).toContain('/verify-email?token=');

    // Extract token from sent email HTML
    const tokenMatch = sentEmails[0]!.html.match(/token=([a-f0-9]{64})/);
    expect(tokenMatch).toBeTruthy();
    const rawToken = tokenMatch![1];

    // 7. Login should be blocked with 403 email_not_verified
    const blockedLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'newuser@example.com', password: 'Password123!' },
    });
    expect(blockedLogin.statusCode).toBe(403);
    expect(blockedLogin.json().code).toBe('email_not_verified');

    // 8. Verify email with token
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/api/auth/verify-email',
      payload: { token: rawToken },
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().success).toBe(true);
    expect(verifyRes.json().user.email).toBe('newuser@example.com');

    // 9. Login now succeeds!
    const allowedLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'newuser@example.com', password: 'Password123!' },
    });
    expect(allowedLogin.statusCode).toBe(200);

    // Cleanup
    globalThis.fetch = originalFetch;
    await app.close();
    await dbCtx.close();
  }, 25000);
});
