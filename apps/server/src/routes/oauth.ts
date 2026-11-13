import crypto from 'node:crypto';
import { generateCodeVerifier, generateState } from 'arctic';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import { type DatabaseSchema, getSetting, setSetting } from '../db/index.js';
import { timingSafeEqualStr, encryptSecret, tryDecryptSecret } from '../lib/crypto.js';
import {
  buildOAuthAuthorizationUrl,
  exchangeAndFetchOAuthProfile,
  isSupportedOAuthProvider,
  OAUTH_PROVIDER_REGISTRY,
  type OAuthOverridesMap,
  type OAuthProviderId,
  resolveOAuthEndpoints,
} from '../lib/oauthProviders.js';
import { createSession, makeAuthMiddleware, setSessionCookie } from '../middleware/auth.js';

const OAUTH_TX_COOKIE = 'volq_oauth_tx';
const OAUTH_TX_TTL_MS = 10 * 60 * 1000;

interface OAuthTxPayload {
  provider: OAuthProviderId;
  state: string;
  codeVerifier: string;
  nonce: string | null;
  next: string;
  redirectUri: string;
  exp: number;
  isTestMode?: boolean;
}

const updateProviderSchema = z.object({
  isEnabled: z.boolean(),
  clientId: z.string().trim().max(300),
  clientSecret: z.string().trim().max(500).optional(),
  scopes: z.string().trim().max(400),
  allowSignup: z.boolean(),
  defaultRole: z.enum(['user', 'admin']).default('user'),
  allowedDomains: z.array(z.string().trim().toLowerCase().max(120)).max(50),
  linkByVerifiedEmail: z.boolean(),
  endpointOverrides: z
    .object({
      authorizationEndpoint: z.string().trim().url().optional().or(z.literal('')),
      tokenEndpoint: z.string().trim().url().optional().or(z.literal('')),
      userinfoEndpoint: z.string().trim().url().optional().or(z.literal('')),
      jwksEndpoint: z.string().trim().url().optional().or(z.literal('')),
      issuer: z.string().trim().optional(),
    })
    .optional(),
});

function parseAllowedDomains(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

export function sanitizeRelativeNext(raw: unknown): string {
  if (typeof raw !== 'string') return '/';
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || trimmed.startsWith('/\\')) {
    return '/';
  }
  return trimmed;
}

export function resolvePublicBaseUrl(req: FastifyRequest, config: AppConfig): string {
  if (config.appBaseUrl) {
    return config.appBaseUrl;
  }
  const forwardedProto = config.trustProxy
    ? (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0]?.trim()
    : undefined;
  const forwardedHost = config.trustProxy
    ? (req.headers['x-forwarded-host'] as string | undefined)?.split(',')[0]?.trim()
    : undefined;
  const host = forwardedHost || req.headers.host;
  const proto = forwardedProto || req.protocol || 'http';
  if (host) {
    return `${proto}://${host}`;
  }
  return config.appOrigin.replace(/\/+$/, '');
}

function buildRedirectUri(req: FastifyRequest, config: AppConfig, providerId: OAuthProviderId): string {
  return `${resolvePublicBaseUrl(req, config)}/api/auth/oauth/${providerId}/callback`;
}

function signOAuthTx(payload: OAuthTxPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyOAuthTx(rawCookie: string | undefined, secret: string): OAuthTxPayload | null {
  if (!rawCookie) return null;
  const parts = rawCookie.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts as [string, string];
  const expectedSig = crypto.createHmac('sha256', secret).update(encoded).digest('base64url');
  if (!timingSafeEqualStr(sig, expectedSig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as OAuthTxPayload;
    if (typeof parsed.exp !== 'number' || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function registerOAuthRoutes(
  app: FastifyInstance,
  db: Kysely<DatabaseSchema>,
  config: AppConfig,
  endpointOverrides?: OAuthOverridesMap
): void {
  const { authenticate, verifyCsrf, requireAdmin } = makeAuthMiddleware(db, config);
  const oauthRateLimit = {
    rateLimit: {
      max: config.nodeEnv === 'test' ? 200 : 25,
      timeWindow: '15 minutes',
    },
  };

  // Public list: ONLY enabled providers' id, displayName, and iconKey (never secrets or client IDs)
  app.get('/api/auth/oauth/providers', async () => {
    const rows = await db
      .selectFrom('oauth_providers')
      .select(['id', 'is_enabled', 'client_id', 'encrypted_client_secret'])
      .execute();

    const rowMap = new Map(rows.map((r) => [r.id, r]));
    const enabled = (Object.keys(OAUTH_PROVIDER_REGISTRY) as OAuthProviderId[])
      .filter((id) => {
        const row = rowMap.get(id);
        return (
          row &&
          Number(row.is_enabled) === 1 &&
          row.client_id.trim().length > 0 &&
          Boolean(row.encrypted_client_secret)
        );
      })
      .map((id) => {
        const def = OAUTH_PROVIDER_REGISTRY[id];
        return {
          id: def.id,
          displayName: def.displayName,
          iconKey: def.iconKey,
        };
      });

    return { providers: enabled };
  });

  // Start PKCE authorization code flow
  app.get('/api/auth/oauth/:provider/start', { config: oauthRateLimit }, async (req, reply) => {
    const providerParam = (req.params as { provider: string }).provider;
    if (!isSupportedOAuthProvider(providerParam)) {
      return reply.code(404).send({ error: 'Unknown OAuth provider' });
    }
    const def = OAUTH_PROVIDER_REGISTRY[providerParam];
    const row = await db
      .selectFrom('oauth_providers')
      .selectAll()
      .where('id', '=', providerParam)
      .executeTakeFirst();

    if (!row || Number(row.is_enabled) !== 1 || !row.client_id.trim() || !row.encrypted_client_secret) {
      return reply.redirect(`/?oauth_error=${encodeURIComponent(`${def.displayName} login is not enabled`)}`);
    }

    const decrypted = tryDecryptSecret(row.encrypted_client_secret, config.encryptionKey);
    if (!decrypted.ok || !decrypted.value) {
      return reply.redirect(
        `/?oauth_error=${encodeURIComponent(`${def.displayName} client secret could not be decrypted`)}`
      );
    }

    const next = sanitizeRelativeNext((req.query as { next?: string }).next);
    const redirectUri = buildRedirectUri(req, config, providerParam);
    const state = generateState();
    const codeVerifier = generateCodeVerifier();
    const nonce = def.useNonce ? crypto.randomBytes(16).toString('base64url') : null;
    const scopes = (row.scopes.trim() || def.defaultScopes.join(' '))
      .split(/[\s,]+/)
      .filter(Boolean);

    const dynamicOverrides = await getSetting<OAuthOverridesMap>(
      db,
      'oauth_endpoint_overrides',
      {}
    );
    const combinedOverrides = { ...endpointOverrides, ...dynamicOverrides };

    const authUrl = buildOAuthAuthorizationUrl({
      provider: def,
      clientId: row.client_id,
      clientSecret: decrypted.value,
      redirectUri,
      state,
      codeVerifier,
      nonce: nonce ?? undefined,
      scopes,
      overrides: combinedOverrides,
    });

    const signedTx = signOAuthTx(
      {
        provider: providerParam,
        state,
        codeVerifier,
        nonce,
        next,
        redirectUri,
        exp: Date.now() + OAUTH_TX_TTL_MS,
      },
      config.sessionSecret
    );

    reply.setCookie(OAUTH_TX_COOKIE, signedTx, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: '/api/auth/oauth',
      maxAge: Math.floor(OAUTH_TX_TTL_MS / 1000),
    });

    return reply.redirect(authUrl.toString());
  });

  // Callback handler
  app.get('/api/auth/oauth/:provider/callback', { config: oauthRateLimit }, async (req, reply) => {
    const providerParam = (req.params as { provider: string }).provider;
    if (!isSupportedOAuthProvider(providerParam)) {
      return reply.code(404).send({ error: 'Unknown OAuth provider' });
    }
    const def = OAUTH_PROVIDER_REGISTRY[providerParam];
    const query = req.query as { code?: string; state?: string; error?: string };

    const tx = verifyOAuthTx(req.cookies[OAUTH_TX_COOKIE], config.sessionSecret);
    reply.clearCookie(OAUTH_TX_COOKIE, { path: '/api/auth/oauth' });

    const failRedirect = (message: string) => {
      if (tx?.isTestMode) {
        return reply.redirect(
          `/?settings=admin-oauth&test_provider=${providerParam}&test_status=error&test_error=${encodeURIComponent(
            message
          )}`
        );
      }
      return reply.redirect(`/?oauth_error=${encodeURIComponent(message)}`);
    };

    if (query.error) {
      return failRedirect(`${def.displayName} sign-in cancelled or returned error: ${query.error}`);
    }

    if (!tx || tx.provider !== providerParam || !query.state || !timingSafeEqualStr(tx.state, query.state)) {
      return failRedirect('Invalid or expired OAuth state. Please try again.');
    }
    if (!query.code) {
      return failRedirect('Missing authorization code from provider.');
    }

    const expectedRedirectUri = buildRedirectUri(req, config, providerParam);
    if (tx.redirectUri !== expectedRedirectUri) {
      return failRedirect('OAuth redirect URI mismatch.');
    }

    const row = await db
      .selectFrom('oauth_providers')
      .selectAll()
      .where('id', '=', providerParam)
      .executeTakeFirst();
    if (!row || Number(row.is_enabled) !== 1 || !row.client_id || !row.encrypted_client_secret) {
      return failRedirect(`${def.displayName} login is not enabled.`);
    }

    const decrypted = tryDecryptSecret(row.encrypted_client_secret, config.encryptionKey);
    if (!decrypted.ok || !decrypted.value) {
      return failRedirect(`${def.displayName} configuration is unavailable.`);
    }

    const dynamicOverrides = await getSetting<OAuthOverridesMap>(
      db,
      'oauth_endpoint_overrides',
      {}
    );
    const combinedOverrides = { ...endpointOverrides, ...dynamicOverrides };

    let profile;
    try {
      profile = await exchangeAndFetchOAuthProfile({
        provider: def,
        clientId: row.client_id,
        clientSecret: decrypted.value,
        redirectUri: expectedRedirectUri,
        code: query.code,
        codeVerifier: tx.codeVerifier,
        expectedNonce: tx.nonce ?? undefined,
        overrides: combinedOverrides,
      });
    } catch (err) {
      return failRedirect(
        `Failed to verify ${def.displayName} credentials: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!profile.providerUserId) {
      return failRedirect(`${def.displayName} did not return a user ID.`);
    }

    const allowedDomains = parseAllowedDomains(row.allowed_domains_json);

    // Dry-run Test Mode for Admin: inspector return without mutating session or users
    if (tx.isTestMode) {
      let domainStatus: 'not_configured' | 'matched' | 'blocked' = 'not_configured';
      if (allowedDomains.length > 0) {
        const domain = (profile.email || '').split('@')[1]?.toLowerCase() ?? '';
        domainStatus = allowedDomains.includes(domain) ? 'matched' : 'blocked';
      }

      const testPayload = {
        provider: providerParam,
        displayName: profile.displayName,
        providerUserId: profile.providerUserId,
        email: profile.email,
        emailVerified: profile.emailVerified,
        domainStatus,
        allowedDomains,
      };

      return reply.redirect(
        `/?settings=admin-oauth&test_provider=${providerParam}&test_status=success&test_data=${encodeURIComponent(
          JSON.stringify(testPayload)
        )}`
      );
    }
    const allowSignup = Number(row.allow_signup) === 1;
    const linkByVerifiedEmail = Number(row.link_by_verified_email) === 1;

    const existingIdentity = await db
      .selectFrom('oauth_identities as oi')
      .innerJoin('users as u', 'u.id', 'oi.user_id')
      .select(['u.id', 'u.is_active'])
      .where('oi.provider', '=', providerParam)
      .where('oi.provider_user_id', '=', profile.providerUserId)
      .executeTakeFirst();

    let authenticatedUserId: string | null = null;

    if (existingIdentity) {
      if (Number(existingIdentity.is_active) !== 1) {
        return failRedirect('This account has been disabled by an administrator.');
      }
      authenticatedUserId = existingIdentity.id;
    } else {
      const verifiedEmail = profile.emailVerified && profile.email ? profile.email : null;
      if (!verifiedEmail) {
        return failRedirect(
          `${def.displayName} account must have a verified email address to sign in or create an account.`
        );
      }

      if (allowedDomains.length > 0) {
        const domain = verifiedEmail.split('@')[1]?.toLowerCase() ?? '';
        if (!allowedDomains.includes(domain)) {
          return failRedirect('Your email domain is not permitted for this provider.');
        }
      }

      const existingByEmail = await db
        .selectFrom('users')
        .select(['id', 'is_active'])
        .where('email', '=', verifiedEmail)
        .executeTakeFirst();

      if (existingByEmail) {
        if (!linkByVerifiedEmail) {
          return failRedirect(
            'An account with this email already exists. Sign in with your password or enable verified-email linking.'
          );
        }
        if (Number(existingByEmail.is_active) !== 1) {
          return failRedirect('This account has been disabled by an administrator.');
        }
        await db
          .insertInto('oauth_identities')
          .values({
            id: crypto.randomUUID(),
            user_id: existingByEmail.id,
            provider: providerParam,
            provider_user_id: profile.providerUserId,
            email: verifiedEmail,
            created_at: new Date().toISOString(),
          })
          .execute();
        authenticatedUserId = existingByEmail.id;
      } else {
        const countRow = await db
          .selectFrom('users')
          .select(db.fn.countAll<number | string>().as('count'))
          .executeTakeFirstOrThrow();
        if (Number(countRow.count) === 0) {
          return failRedirect('Please create the initial administrator account with email and password first.');
        }

        const globalSignupMode = await getSetting<'open' | 'disabled'>(db, 'signup_mode', 'open');
        if (!allowSignup) {
          return failRedirect(
            `New account sign-ups with ${def.displayName} are disabled.`
          );
        }
        // Respect provider's own allow_signup when global signups are disabled; if provider allows signup it permits creation
        void globalSignupMode;

        const newUserId = crypto.randomUUID();
        const now = new Date().toISOString();
        const defaultPrefs = {
          theme: 'dark' as const,
          darkStyle: 'dark' as const,
          defaultModel: null,
          sendOnEnter: true,
          reduceTransparency: false,
          reduceMotion: null,
        };

        await db.transaction().execute(async (trx) => {
          await trx
            .insertInto('users')
            .values({
              id: newUserId,
              email: verifiedEmail,
              display_name: profile.displayName,
              password_hash: '!oauth-only!',
              role: row.default_role === 'admin' ? 'admin' : 'user',
              is_active: 1,
              preferences_json: JSON.stringify(defaultPrefs),
              created_at: now,
              updated_at: now,
            })
            .execute();

          await trx
            .insertInto('oauth_identities')
            .values({
              id: crypto.randomUUID(),
              user_id: newUserId,
              provider: providerParam,
              provider_user_id: profile.providerUserId,
              email: verifiedEmail,
              created_at: now,
            })
            .execute();
        });

        authenticatedUserId = newUserId;
      }
    }

    const session = await createSession(db, authenticatedUserId);
    setSessionCookie(reply, session.rawToken, config, session.expiresAt);
    return reply.redirect(sanitizeRelativeNext(tx.next));
  });

  // Admin: list all registered OAuth providers + saved config (NEVER returns client secret!)
  app.get(
    '/api/admin/oauth/providers',
    { preHandler: [authenticate, requireAdmin] },
    async (req) => {
      const rows = await db.selectFrom('oauth_providers').selectAll().execute();
      const rowMap = new Map(rows.map((r) => [r.id, r]));
      const dynamicOverrides = await getSetting<OAuthOverridesMap>(
        db,
        'oauth_endpoint_overrides',
        {}
      );
      const combinedOverrides = { ...endpointOverrides, ...dynamicOverrides };

      return {
        providers: (Object.keys(OAUTH_PROVIDER_REGISTRY) as OAuthProviderId[]).map((id) => {
          const def = OAUTH_PROVIDER_REGISTRY[id];
          const row = rowMap.get(id);
          const hasSecret = Boolean(row?.encrypted_client_secret);
          const configured = Boolean(row?.client_id.trim()) && hasSecret;
          return {
            id: def.id,
            displayName: def.displayName,
            iconKey: def.iconKey,
            isEnabled: Boolean(row && Number(row.is_enabled) === 1 && configured),
            configured,
            clientId: row?.client_id ?? '',
            hasClientSecret: hasSecret,
            redirectUri: buildRedirectUri(req, config, id),
            scopes: row?.scopes || def.defaultScopes.join(' '),
            allowSignup: row ? Number(row.allow_signup) === 1 : true,
            defaultRole: row?.default_role === 'admin' ? 'admin' : 'user',
            allowedDomains: row ? parseAllowedDomains(row.allowed_domains_json) : [],
            linkByVerifiedEmail: row ? Number(row.link_by_verified_email) === 1 : false,
            setupSteps: def.setupSteps,
            endpointOverrides: combinedOverrides[id] || null,
          };
        }),
      };
    }
  );

  // Admin: save/update OAuth provider
  app.put(
    '/api/admin/oauth/providers/:provider',
    { preHandler: [authenticate, requireAdmin, verifyCsrf], config: oauthRateLimit },
    async (req, reply) => {
      const providerParam = (req.params as { provider: string }).provider;
      if (!isSupportedOAuthProvider(providerParam)) {
        return reply.code(404).send({ error: 'Unknown OAuth provider' });
      }
      const def = OAUTH_PROVIDER_REGISTRY[providerParam];
      const body = updateProviderSchema.parse(req.body);
      const existing = await db
        .selectFrom('oauth_providers')
        .selectAll()
        .where('id', '=', providerParam)
        .executeTakeFirst();

      let nextEncryptedSecret = existing?.encrypted_client_secret ?? null;
      if (body.clientSecret && body.clientSecret.length > 0) {
        nextEncryptedSecret = encryptSecret(body.clientSecret, config.encryptionKey);
      }

      if (body.isEnabled && (!body.clientId || !nextEncryptedSecret)) {
        return reply.code(400).send({
          error: 'Client ID and Client Secret are required before enabling an OAuth provider.',
        });
      }

      const now = new Date().toISOString();
      const scopes = body.scopes || def.defaultScopes.join(' ');
      const allowedJson = JSON.stringify(
        Array.from(new Set(body.allowedDomains.map((d) => d.trim().toLowerCase()).filter(Boolean)))
      );

      if (body.endpointOverrides) {
        const dynamicOverrides = await getSetting<OAuthOverridesMap>(
          db,
          'oauth_endpoint_overrides',
          {}
        );
        dynamicOverrides[providerParam] = {
          ...dynamicOverrides[providerParam],
          ...body.endpointOverrides,
        };
        await setSetting(db, 'oauth_endpoint_overrides', dynamicOverrides);
      }

      await db
        .insertInto('oauth_providers')
        .values({
          id: providerParam,
          is_enabled: body.isEnabled ? 1 : 0,
          client_id: body.clientId,
          encrypted_client_secret: nextEncryptedSecret,
          scopes,
          allow_signup: body.allowSignup ? 1 : 0,
          default_role: body.defaultRole,
          allowed_domains_json: allowedJson,
          link_by_verified_email: body.linkByVerifiedEmail ? 1 : 0,
          updated_at: now,
        })
        .onConflict((oc) =>
          oc.column('id').doUpdateSet({
            is_enabled: body.isEnabled ? 1 : 0,
            client_id: body.clientId,
            encrypted_client_secret: nextEncryptedSecret,
            scopes,
            allow_signup: body.allowSignup ? 1 : 0,
            default_role: body.defaultRole,
            allowed_domains_json: allowedJson,
            link_by_verified_email: body.linkByVerifiedEmail ? 1 : 0,
            updated_at: now,
          })
        )
        .execute();

      return { ok: true, hasClientSecret: Boolean(nextEncryptedSecret) };
    }
  );

  // Admin: remove/reset OAuth provider credentials (never deletes users or oauth_identities)
  app.delete(
    '/api/admin/oauth/providers/:provider',
    { preHandler: [authenticate, requireAdmin, verifyCsrf], config: oauthRateLimit },
    async (req, reply) => {
      const providerParam = (req.params as { provider: string }).provider;
      if (!isSupportedOAuthProvider(providerParam)) {
        return reply.code(404).send({ error: 'Unknown OAuth provider' });
      }
      await db.deleteFrom('oauth_providers').where('id', '=', providerParam).execute();
      const dynamicOverrides = await getSetting<OAuthOverridesMap>(
        db,
        'oauth_endpoint_overrides',
        {}
      );
      if (dynamicOverrides[providerParam]) {
        delete dynamicOverrides[providerParam];
        await setSetting(db, 'oauth_endpoint_overrides', dynamicOverrides);
      }
      return { ok: true };
    }
  );

  // Admin: initiate dry-run interactive test sign-in
  app.post(
    '/api/admin/oauth/providers/:provider/test-login',
    { preHandler: [authenticate, requireAdmin, verifyCsrf], config: oauthRateLimit },
    async (req, reply) => {
      const providerParam = (req.params as { provider: string }).provider;
      if (!isSupportedOAuthProvider(providerParam)) {
        return reply.code(404).send({ error: 'Unknown OAuth provider' });
      }
      const def = OAUTH_PROVIDER_REGISTRY[providerParam];
      const row = await db
        .selectFrom('oauth_providers')
        .selectAll()
        .where('id', '=', providerParam)
        .executeTakeFirst();

      if (!row || !row.client_id.trim() || !row.encrypted_client_secret) {
        return reply.code(400).send({
          error: 'Save both Client ID and Client Secret before testing sign-in.',
        });
      }

      const decrypted = tryDecryptSecret(row.encrypted_client_secret, config.encryptionKey);
      if (!decrypted.ok || !decrypted.value) {
        return reply.code(400).send({
          error: `${def.displayName} client secret could not be decrypted.`,
        });
      }

      const redirectUri = buildRedirectUri(req, config, providerParam);
      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const nonce = def.useNonce ? crypto.randomBytes(16).toString('base64url') : null;
      const scopes = (row.scopes.trim() || def.defaultScopes.join(' '))
        .split(/[\s,]+/)
        .filter(Boolean);

      const dynamicOverrides = await getSetting<OAuthOverridesMap>(
        db,
        'oauth_endpoint_overrides',
        {}
      );
      const combinedOverrides = { ...endpointOverrides, ...dynamicOverrides };

      const authUrl = buildOAuthAuthorizationUrl({
        provider: def,
        clientId: row.client_id,
        clientSecret: decrypted.value,
        redirectUri,
        state,
        codeVerifier,
        nonce: nonce ?? undefined,
        scopes,
        overrides: combinedOverrides,
      });

      const signedTx = signOAuthTx(
        {
          provider: providerParam,
          state,
          codeVerifier,
          nonce,
          next: '/?settings=admin-oauth',
          redirectUri,
          exp: Date.now() + OAUTH_TX_TTL_MS,
          isTestMode: true,
        },
        config.sessionSecret
      );

      reply.setCookie(OAUTH_TX_COOKIE, signedTx, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.cookieSecure,
        path: '/api/auth/oauth',
        maxAge: Math.floor(OAUTH_TX_TTL_MS / 1000),
      });

      return { ok: true, authUrl: authUrl.toString() };
    }
  );

  // Admin: validate fields & test provider discovery/endpoints reachability
  app.post(
    '/api/admin/oauth/providers/:provider/test',
    { preHandler: [authenticate, requireAdmin, verifyCsrf], config: oauthRateLimit },
    async (req, reply) => {
      const providerParam = (req.params as { provider: string }).provider;
      if (!isSupportedOAuthProvider(providerParam)) {
        return reply.code(404).send({ error: 'Unknown OAuth provider' });
      }
      const def = OAUTH_PROVIDER_REGISTRY[providerParam];
      const row = await db
        .selectFrom('oauth_providers')
        .selectAll()
        .where('id', '=', providerParam)
        .executeTakeFirst();

      if (!row || !row.client_id.trim() || !row.encrypted_client_secret) {
        return {
          ok: false,
          error: 'Save both Client ID and Client Secret before testing configuration.',
        };
      }

      const decrypted = tryDecryptSecret(row.encrypted_client_secret, config.encryptionKey);
      if (!decrypted.ok) {
        return { ok: false, error: decrypted.error };
      }

      const endpoints = resolveOAuthEndpoints(def, endpointOverrides);
      const probeUrl = endpoints.jwksEndpoint ?? endpoints.authorizationEndpoint;
      try {
        const res = await fetch(probeUrl, {
          method: 'GET',
          headers: { 'User-Agent': 'VOLQ-AI/1.0' },
          signal: AbortSignal.timeout(8000),
        });
        if (res.status >= 500) {
          return {
            ok: false,
            error: `Provider endpoint responded with HTTP ${res.status}`,
          };
        }
        return {
          ok: true,
          message: `Required fields saved and ${def.displayName} endpoints are reachable. Note: client secret validity cannot be fully verified without completing an interactive sign-in.`,
        };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to reach provider endpoint',
        };
      }
    }
  );
}
