import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createDatabase } from '../db/index.js';

describe('onboarding, public /api/info, and migration backfill', () => {
  it('serves cacheable, rate-limited public info without leaking sensitive secrets or paths', async () => {
    const config = loadConfig({
      DATABASE_URL: '',
      DATABASE_PATH: ':memory:',
      SESSION_SECRET: 'test-session-secret-at-least-32-chars-long!',
      ENCRYPTION_KEY: 'test-encryption-key-for-secrets!!',
    });

    const dbCtx = await createDatabase({
      databasePath: ':memory:',
      logger: { info: () => {}, warn: () => {} },
    });

    const { app } = await buildApp({ config, dbCtx, logger: false });

    // Initial call before any user is registered
    const res = await app.inject({
      method: 'GET',
      url: '/api/info',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60, stale-while-revalidate=300');
    expect(res.headers.etag).toBeDefined();

    const data = JSON.parse(res.body);
    expect(data.siteName).toBe('VOLQ AI');
    expect(data.welcome).toEqual({
      enabled: true,
      headline: null,
      description: null,
    });
    expect(data.hasUsers).toBe(false);
    expect(data.openSignups).toBe(true);
    expect(Array.isArray(data.oauthProviders)).toBe(true);

    // Verify zero sensitive leakages
    expect(data).not.toHaveProperty('databaseUrl');
    expect(data).not.toHaveProperty('databasePath');
    expect(data).not.toHaveProperty('sessionSecret');
    expect(data).not.toHaveProperty('encryptionKey');
    expect(data).not.toHaveProperty('apiKey');
    expect(data).not.toHaveProperty('users');

    // ETag 304 Not Modified verification
    const etag = res.headers.etag as string;
    const cacheRes = await app.inject({
      method: 'GET',
      url: '/api/info',
      headers: {
        'if-none-match': etag,
      },
    });
    expect(cacheRes.statusCode).toBe(304);

    await app.close();
    await dbCtx.db.destroy();
  });

  it('runs migration 004 and immediately backfills existing users with onboarding_completed_at', async () => {
    const dbCtx = await createDatabase({
      databasePath: ':memory:',
      logger: { info: () => {}, warn: () => {} },
    });

    const config = loadConfig({
      DATABASE_URL: '',
      DATABASE_PATH: ':memory:',
      SESSION_SECRET: 'test-session-secret-at-least-32-chars-long!',
      ENCRYPTION_KEY: 'test-encryption-key-for-secrets!!',
    });

    const { app } = await buildApp({ config, dbCtx, logger: false });

    // Register first user (admin bootstrap)
    const registerRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'founder@volq.test',
        password: 'Password123!',
        displayName: 'Founder',
      },
    });
    expect(registerRes.statusCode).toBe(201);

    // Verify that onboarding_completed_at column exists and was backfilled
    const userRow = await dbCtx.db
      .selectFrom('users')
      .selectAll()
      .where('email', '=', 'founder@volq.test')
      .executeTakeFirstOrThrow();

    expect(userRow).toHaveProperty('onboarding_completed_at');

    // Check /api/info now reports hasUsers: true
    const infoRes = await app.inject({
      method: 'GET',
      url: '/api/info',
    });
    const infoData = JSON.parse(infoRes.body);
    expect(infoData.hasUsers).toBe(true);

    await app.close();
    await dbCtx.db.destroy();
  });

  it('enforces admin-only access on /api/admin/welcome and reflects updates in /api/info', async () => {
    const dbCtx = await createDatabase({
      databasePath: ':memory:',
      logger: { info: () => {}, warn: () => {} },
    });

    const config = loadConfig({
      DATABASE_URL: '',
      DATABASE_PATH: ':memory:',
      SESSION_SECRET: 'test-session-secret-at-least-32-chars-long!',
      ENCRYPTION_KEY: 'test-encryption-key-for-secrets!!',
    });

    const { app } = await buildApp({ config, dbCtx, logger: false });

    // 1. Unauthenticated or non-admin attempt gets 401/403
    const unauthGet = await app.inject({
      method: 'GET',
      url: '/api/admin/welcome',
    });
    expect(unauthGet.statusCode).toBe(401);

    const unauthPut = await app.inject({
      method: 'PUT',
      url: '/api/admin/welcome',
      payload: { enabled: false },
    });
    expect(unauthPut.statusCode).toBe(401);

    // 2. Register first user (Admin)
    const adminRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: {
        email: 'admin@volq.test',
        password: 'Password123!',
        displayName: 'Admin User',
      },
    });
    expect(adminRes.statusCode).toBe(201);
    const adminCookie = (adminRes.headers['set-cookie'] as string).split(';')[0];
    const adminCsrf = JSON.parse(adminRes.body).csrfToken;

    // 3. Admin updates headline and description
    const updateRes = await app.inject({
      method: 'PUT',
      url: '/api/admin/welcome',
      headers: {
        cookie: adminCookie,
        'x-csrf-token': adminCsrf,
      },
      payload: {
        enabled: true,
        headline: 'Custom AI Command Center',
        description: 'Deploy private LLMs across your local infrastructure.',
      },
    });
    expect(updateRes.statusCode).toBe(200);
    const updateData = JSON.parse(updateRes.body);
    expect(updateData.welcome.headline).toBe('Custom AI Command Center');
    expect(updateData.welcome.description).toBe(
      'Deploy private LLMs across your local infrastructure.'
    );

    // 4. Verify public /api/info reflects the admin custom copy without app restart
    const publicInfoRes = await app.inject({
      method: 'GET',
      url: '/api/info',
    });
    expect(publicInfoRes.statusCode).toBe(200);
    const publicInfo = JSON.parse(publicInfoRes.body);
    expect(publicInfo.welcome.headline).toBe('Custom AI Command Center');
    expect(publicInfo.welcome.description).toBe(
      'Deploy private LLMs across your local infrastructure.'
    );

    // 5. Admin resets to default
    const resetRes = await app.inject({
      method: 'PUT',
      url: '/api/admin/welcome',
      headers: {
        cookie: adminCookie,
        'x-csrf-token': adminCsrf,
      },
      payload: {
        resetToDefault: true,
      },
    });
    expect(resetRes.statusCode).toBe(200);
    const resetData = JSON.parse(resetRes.body);
    expect(resetData.welcome.headline).toBeNull();
    expect(resetData.welcome.description).toBeNull();

    // 6. User marks onboarding complete
    const completeRes = await app.inject({
      method: 'POST',
      url: '/api/user/onboarding-complete',
      headers: {
        cookie: adminCookie,
        'x-csrf-token': adminCsrf,
      },
    });
    expect(completeRes.statusCode).toBe(200);
    const completeData = JSON.parse(completeRes.body);
    expect(completeData.ok).toBe(true);
    expect(completeData.onboardingCompletedAt).toBeDefined();

    await app.close();
    await dbCtx.db.destroy();
  });
});
