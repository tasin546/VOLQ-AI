import crypto from 'node:crypto';
import http from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createDatabase } from '../db/index.js';
import type { OAuthOverridesMap } from '../lib/oauthProviders.js';

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const first = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!first) return '';
  return first.split(';')[0] ?? '';
}

function extractCookieMap(setCookieHeader: string | string[] | undefined): Record<string, string> {
  const arr = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  const out: Record<string, string> = {};
  for (const raw of arr) {
    const pair = raw.split(';')[0] ?? '';
    const idx = pair.indexOf('=');
    if (idx > 0) {
      out[pair.slice(0, idx)] = pair.slice(idx + 1);
    }
  }
  return out;
}

function signRs256Jwt(
  payload: Record<string, unknown>,
  privateKey: crypto.KeyObject,
  kid: string
): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid }), 'utf8').toString(
    'base64url'
  );
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .sign('RSA-SHA256', Buffer.from(`${header}.${body}`), privateKey)
    .toString('base64url');
  return `${header}.${body}.${sig}`;
}

describe('OAuth admin config + Google OIDC & Discord OAuth2 flows', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwkPub = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
  jwkPub.kid = 'test-key-1';
  jwkPub.use = 'sig';
  jwkPub.alg = 'RS256';

  let mockServer: http.Server;
  let mockBaseUrl = '';

  const currentProfile: {
    googleSub: string;
    googleEmail: string;
    googleEmailVerified: boolean;
    googleName: string;
    discordId: string;
    discordEmail: string;
    discordVerified: boolean;
    discordUsername: string;
    lastNonce: string;
    lastCodeChallenge: string;
    verifiedPkce: boolean;
  } = {
    googleSub: 'g-sub-001',
    googleEmail: 'alice@example.com',
    googleEmailVerified: true,
    googleName: 'Alice Google',
    discordId: 'd-user-001',
    discordEmail: 'bob@example.org',
    discordVerified: true,
    discordUsername: 'bobdiscord',
    lastNonce: '',
    lastCodeChallenge: '',
    verifiedPkce: false,
  };

  beforeAll(async () => {
    mockServer = http.createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');

      if (url.pathname === '/oidc/jwks') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ keys: [jwkPub] }));
        return;
      }

      if (url.pathname === '/oidc/token' || url.pathname === '/discord/token') {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
        const codeVerifier = form.get('code_verifier') ?? '';
        const computedChallenge = crypto
          .createHash('sha256')
          .update(codeVerifier)
          .digest('base64url');
        currentProfile.verifiedPkce =
          Boolean(currentProfile.lastCodeChallenge) &&
          computedChallenge === currentProfile.lastCodeChallenge;

        if (!currentProfile.verifiedPkce) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_grant', error_description: 'PKCE mismatch' }));
          return;
        }

        if (url.pathname === '/oidc/token') {
          const idToken = signRs256Jwt(
            {
              iss: mockBaseUrl,
              aud: 'google-client-id-123',
              sub: currentProfile.googleSub,
              email: currentProfile.googleEmail,
              email_verified: currentProfile.googleEmailVerified,
              name: currentProfile.googleName,
              nonce: currentProfile.lastNonce,
              exp: Math.floor(Date.now() / 1000) + 600,
              iat: Math.floor(Date.now() / 1000),
            },
            privateKey,
            'test-key-1'
          );
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              access_token: 'mock-google-access-token',
              token_type: 'Bearer',
              expires_in: 3600,
              id_token: idToken,
            })
          );
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            access_token: 'mock-discord-access-token',
            token_type: 'Bearer',
            expires_in: 3600,
          })
        );
        return;
      }

      if (url.pathname === '/oidc/userinfo') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            sub: currentProfile.googleSub,
            email: currentProfile.googleEmail,
            email_verified: currentProfile.googleEmailVerified,
            name: currentProfile.googleName,
          })
        );
        return;
      }

      if (url.pathname === '/discord/userinfo') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: currentProfile.discordId,
            email: currentProfile.discordEmail,
            verified: currentProfile.discordVerified,
            global_name: 'Bob Discord',
            username: currentProfile.discordUsername,
          })
        );
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

  function makeOverrides(): OAuthOverridesMap {
    return {
      google: {
        authorizationEndpoint: `${mockBaseUrl}/oidc/auth`,
        tokenEndpoint: `${mockBaseUrl}/oidc/token`,
        userinfoEndpoint: `${mockBaseUrl}/oidc/userinfo`,
        jwksEndpoint: `${mockBaseUrl}/oidc/jwks`,
        issuer: mockBaseUrl,
      },
      discord: {
        authorizationEndpoint: `${mockBaseUrl}/discord/auth`,
        tokenEndpoint: `${mockBaseUrl}/discord/token`,
        userinfoEndpoint: `${mockBaseUrl}/discord/userinfo`,
      },
    };
  }

  it(
    'configures providers safely without exposing secrets, runs Google OIDC & Discord PKCE logins, links/blocks verified emails & domains, and prevents open redirects & tampered state',
    async () => {
    const dbCtx = await createDatabase(':memory:');
    const config = loadConfig({
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-00000000000000',
      ENCRYPTION_KEY: 'test-encryption-key-00000000000000',
      APP_ORIGIN: 'http://localhost:3000',
      APP_BASE_URL: 'https://chat.volq.test',
    });

    const { app } = await buildApp({
      dbCtx,
      config,
      logger: false,
      oauthOverrides: makeOverrides(),
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
        email: 'existing@example.org',
        password: 'supersecretpassword',
        displayName: 'Existing User',
      },
    });
    expect(userReg.statusCode).toBe(201);
    const regularCookie = extractCookie(userReg.headers['set-cookie']);

    const nonAdminGet = await app.inject({
      method: 'GET',
      url: '/api/admin/oauth/providers',
      headers: { cookie: regularCookie },
    });
    expect(nonAdminGet.statusCode).toBe(403);

    const pubEmpty = await app.inject({ method: 'GET', url: '/api/auth/oauth/providers' });
    expect(pubEmpty.statusCode).toBe(200);
    expect(pubEmpty.json().providers).toEqual([]);

    const putGoogle = await app.inject({
      method: 'PUT',
      url: '/api/admin/oauth/providers/google',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: {
        isEnabled: true,
        clientId: 'google-client-id-123',
        clientSecret: 'super-secret-google-xyz',
        scopes: 'openid profile email',
        allowSignup: true,
        defaultRole: 'user',
        allowedDomains: ['example.com'],
        linkByVerifiedEmail: true,
      },
    });
    expect(putGoogle.statusCode).toBe(200);
    expect(putGoogle.json().hasClientSecret).toBe(true);
    expect(JSON.stringify(putGoogle.json())).not.toContain('super-secret-google-xyz');

    const adminList = await app.inject({
      method: 'GET',
      url: '/api/admin/oauth/providers',
      headers: { cookie: adminCookie },
    });
    expect(adminList.statusCode).toBe(200);
    const adminGoogle = (
      adminList.json().providers as Array<{ id: string; redirectUri: string; hasClientSecret: boolean }>
    ).find((p) => p.id === 'google')!;
    expect(adminGoogle.hasClientSecret).toBe(true);
    expect(adminGoogle.redirectUri).toBe(
      'https://chat.volq.test/api/auth/oauth/google/callback'
    );

    const putDiscord = await app.inject({
      method: 'PUT',
      url: '/api/admin/oauth/providers/discord',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: {
        isEnabled: true,
        clientId: 'discord-client-id-456',
        clientSecret: 'super-secret-discord-xyz',
        scopes: 'identify email',
        allowSignup: true,
        defaultRole: 'user',
        allowedDomains: [],
        linkByVerifiedEmail: false,
      },
    });
    expect(putDiscord.statusCode).toBe(200);

    const putGoogleNoSecret = await app.inject({
      method: 'PUT',
      url: '/api/admin/oauth/providers/google',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: {
        isEnabled: true,
        clientId: 'google-client-id-123',
        scopes: 'openid profile email',
        allowSignup: true,
        defaultRole: 'user',
        allowedDomains: ['example.com'],
        linkByVerifiedEmail: true,
      },
    });
    expect(putGoogleNoSecret.statusCode).toBe(200);
    expect(putGoogleNoSecret.json().hasClientSecret).toBe(true);

    const pubList = await app.inject({ method: 'GET', url: '/api/auth/oauth/providers' });
    expect(pubList.statusCode).toBe(200);
    expect(pubList.json().providers).toEqual([
      { id: 'google', displayName: 'Google', iconKey: 'google' },
      { id: 'discord', displayName: 'Discord', iconKey: 'discord' },
    ]);
    expect(JSON.stringify(pubList.json())).not.toContain('google-client-id-123');
    expect(JSON.stringify(pubList.json())).not.toContain('super-secret-google-xyz');

    const testGoogle = await app.inject({
      method: 'POST',
      url: '/api/admin/oauth/providers/google/test',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
    });
    expect(testGoogle.statusCode).toBe(200);
    expect(testGoogle.json().ok).toBe(true);

    // 1. Google OIDC login creates new user
    const startGoogle = await app.inject({
      method: 'GET',
      url: '/api/auth/oauth/google/start?next=https://evil.com/phish',
    });
    expect(startGoogle.statusCode).toBe(302);
    const startLocation = new URL(startGoogle.headers.location as string);
    const state = startLocation.searchParams.get('state')!;
    currentProfile.lastNonce = startLocation.searchParams.get('nonce') ?? '';
    currentProfile.lastCodeChallenge = startLocation.searchParams.get('code_challenge') ?? '';
    const txCookies = extractCookieMap(startGoogle.headers['set-cookie']);
    expect(txCookies.volq_oauth_tx).toBeTruthy();

    const badStateCb = await app.inject({
      method: 'GET',
      url: `/api/auth/oauth/google/callback?code=c1&state=${state}tampered`,
      headers: { cookie: `volq_oauth_tx=${txCookies.volq_oauth_tx}` },
    });
    expect(badStateCb.statusCode).toBe(302);
    expect(badStateCb.headers.location).toContain('oauth_error=');

    const goodGoogleCb = await app.inject({
      method: 'GET',
      url: `/api/auth/oauth/google/callback?code=code-1&state=${encodeURIComponent(state)}`,
      headers: { cookie: `volq_oauth_tx=${txCookies.volq_oauth_tx}` },
    });
    expect(goodGoogleCb.statusCode).toBe(302);
    expect(goodGoogleCb.headers.location).toBe('/');
    expect(currentProfile.verifiedPkce).toBe(true);
    const cbCookies = extractCookieMap(goodGoogleCb.headers['set-cookie']);
    expect(cbCookies.volq_session).toBeTruthy();
    const aliceCookie = `volq_session=${cbCookies.volq_session}`;

    const aliceMe = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: aliceCookie },
    });
    expect(aliceMe.statusCode).toBe(200);
    expect(aliceMe.json().user.email).toBe('alice@example.com');
    expect(aliceMe.json().user.authMethods.hasPassword).toBe(false);
    expect(aliceMe.json().user.authMethods.providers[0]).toMatchObject({
      provider: 'google',
      email: 'alice@example.com',
    });

    // 2. Domain restriction rejects disallowed domain
    currentProfile.googleSub = 'g-sub-disallowed';
    currentProfile.googleEmail = 'intruder@notallowed.net';
    const startDenied = await app.inject({ method: 'GET', url: '/api/auth/oauth/google/start' });
    const deniedLoc = new URL(startDenied.headers.location as string);
    currentProfile.lastNonce = deniedLoc.searchParams.get('nonce') ?? '';
    currentProfile.lastCodeChallenge = deniedLoc.searchParams.get('code_challenge') ?? '';
    const deniedCookies = extractCookieMap(startDenied.headers['set-cookie']);
    const deniedCb = await app.inject({
      method: 'GET',
      url: `/api/auth/oauth/google/callback?code=code-2&state=${encodeURIComponent(
        deniedLoc.searchParams.get('state')!
      )}`,
      headers: { cookie: `volq_oauth_tx=${deniedCookies.volq_oauth_tx}` },
    });
    expect(deniedCb.statusCode).toBe(302);
    expect(decodeURIComponent(deniedCb.headers.location as string)).toContain(
      'email domain is not permitted'
    );

    // 3. Unverified email rejected
    currentProfile.googleSub = 'g-sub-unverified';
    currentProfile.googleEmail = 'unverified@example.com';
    currentProfile.googleEmailVerified = false;
    const startUnver = await app.inject({ method: 'GET', url: '/api/auth/oauth/google/start' });
    const unverLoc = new URL(startUnver.headers.location as string);
    currentProfile.lastNonce = unverLoc.searchParams.get('nonce') ?? '';
    currentProfile.lastCodeChallenge = unverLoc.searchParams.get('code_challenge') ?? '';
    const unverCookies = extractCookieMap(startUnver.headers['set-cookie']);
    const unverCb = await app.inject({
      method: 'GET',
      url: `/api/auth/oauth/google/callback?code=code-3&state=${encodeURIComponent(
        unverLoc.searchParams.get('state')!
      )}`,
      headers: { cookie: `volq_oauth_tx=${unverCookies.volq_oauth_tx}` },
    });
    expect(unverCb.statusCode).toBe(302);
    expect(decodeURIComponent(unverCb.headers.location as string)).toContain(
      'verified email address'
    );

    // 4. Discord with linkByVerifiedEmail=false blocks linking to existing email
    currentProfile.discordId = 'd-existing-collision';
    currentProfile.discordEmail = 'existing@example.org';
    currentProfile.discordVerified = true;
    const startDiscCollision = await app.inject({
      method: 'GET',
      url: '/api/auth/oauth/discord/start',
    });
    const discLoc = new URL(startDiscCollision.headers.location as string);
    currentProfile.lastCodeChallenge = discLoc.searchParams.get('code_challenge') ?? '';
    const discCookies = extractCookieMap(startDiscCollision.headers['set-cookie']);
    const discCollisionCb = await app.inject({
      method: 'GET',
      url: `/api/auth/oauth/discord/callback?code=code-4&state=${encodeURIComponent(
        discLoc.searchParams.get('state')!
      )}`,
      headers: { cookie: `volq_oauth_tx=${discCookies.volq_oauth_tx}` },
    });
    expect(discCollisionCb.statusCode).toBe(302);
    expect(decodeURIComponent(discCollisionCb.headers.location as string)).toContain(
      'An account with this email already exists'
    );

    // 5. Turn on linkByVerifiedEmail for Discord -> links to existing@example.org and succeeds
    await app.inject({
      method: 'PUT',
      url: '/api/admin/oauth/providers/discord',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: {
        isEnabled: true,
        clientId: 'discord-client-id-456',
        scopes: 'identify email',
        allowSignup: false,
        defaultRole: 'user',
        allowedDomains: [],
        linkByVerifiedEmail: true,
      },
    });

    const startDiscLink = await app.inject({
      method: 'GET',
      url: '/api/auth/oauth/discord/start?next=%2Fchats',
    });
    const discLinkLoc = new URL(startDiscLink.headers.location as string);
    currentProfile.lastCodeChallenge = discLinkLoc.searchParams.get('code_challenge') ?? '';
    const discLinkCookies = extractCookieMap(startDiscLink.headers['set-cookie']);
    const discLinkCb = await app.inject({
      method: 'GET',
      url: `/api/auth/oauth/discord/callback?code=code-5&state=${encodeURIComponent(
        discLinkLoc.searchParams.get('state')!
      )}`,
      headers: { cookie: `volq_oauth_tx=${discLinkCookies.volq_oauth_tx}` },
    });
    expect(discLinkCb.statusCode).toBe(302);
    expect(discLinkCb.headers.location).toBe('/chats');
    const discCbCookies = extractCookieMap(discLinkCb.headers['set-cookie']);
    const existingCookie = `volq_session=${discCbCookies.volq_session}`;
    const existingMe = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: existingCookie },
    });
    expect(existingMe.statusCode).toBe(200);
    expect(existingMe.json().user.email).toBe('existing@example.org');
    expect(existingMe.json().user.authMethods.hasPassword).toBe(true);
    expect(
      (existingMe.json().user.authMethods.providers as Array<{ provider: string }>).some(
        (p) => p.provider === 'discord'
      )
    ).toBe(true);

    // 6. allowSignup=false rejects new Discord user signup
    currentProfile.discordId = 'd-brand-new';
    currentProfile.discordEmail = 'brandnew@example.org';
    const startDiscNoSignup = await app.inject({
      method: 'GET',
      url: '/api/auth/oauth/discord/start',
    });
    const discNoLoc = new URL(startDiscNoSignup.headers.location as string);
    currentProfile.lastCodeChallenge = discNoLoc.searchParams.get('code_challenge') ?? '';
    const discNoCookies = extractCookieMap(startDiscNoSignup.headers['set-cookie']);
    const discNoCb = await app.inject({
      method: 'GET',
      url: `/api/auth/oauth/discord/callback?code=code-6&state=${encodeURIComponent(
        discNoLoc.searchParams.get('state')!
      )}`,
      headers: { cookie: `volq_oauth_tx=${discNoCookies.volq_oauth_tx}` },
    });
    expect(discNoCb.statusCode).toBe(302);
    expect(decodeURIComponent(discNoCb.headers.location as string)).toContain(
      'New account sign-ups with Discord are disabled'
    );

    // Delete Google config clears it
    const delGoogle = await app.inject({
      method: 'DELETE',
      url: '/api/admin/oauth/providers/google',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
    });
    expect(delGoogle.statusCode).toBe(200);
    const pubAfterDel = await app.inject({ method: 'GET', url: '/api/auth/oauth/providers' });
    expect(pubAfterDel.json().providers).toEqual([
      { id: 'discord', displayName: 'Discord', iconKey: 'discord' },
    ]);

    await app.close();
    await dbCtx.close();
  }, 30000);
});
