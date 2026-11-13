import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import type { AppConfig } from '../config.js';
import { type DatabaseSchema, DEFAULT_EMAIL_SETTINGS, type EmailSettings, getSetting } from '../db/index.js';
import { generateRandomToken, sha256Hex, timingSafeEqualStr } from '../lib/crypto.js';

export const SESSION_COOKIE_NAME = 'volq_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type ThemeMode = 'dark' | 'amoled' | 'light' | 'system';

export interface UserPreferences {
  theme: ThemeMode;
  darkStyle: 'dark' | 'amoled';
  defaultModel: string | null;
  sendOnEnter: boolean;
  reduceTransparency: boolean;
  reduceMotion: boolean | null;
  timezone: string | null;
}

export interface UserAuthMethods {
  hasPassword: boolean;
  providers: Array<{
    provider: 'google' | 'discord';
    email: string | null;
    createdAt: string;
  }>;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  isActive: boolean;
  hasAvatar: boolean;
  avatarVersion: string | null;
  authMethods?: UserAuthMethods;
  preferences: UserPreferences;
  onboardingCompletedAt: string | null;
  createdAt: string;
}

export async function getUserIdentityExtras(
  db: Kysely<DatabaseSchema>,
  userId: string,
  passwordHash: string
): Promise<{
  hasAvatar: boolean;
  avatarVersion: string | null;
  authMethods: UserAuthMethods;
}> {
  const [avatarRow, identities] = await Promise.all([
    db
      .selectFrom('user_avatars')
      .select(['updated_at'])
      .where('user_id', '=', userId)
      .executeTakeFirst(),
    db
      .selectFrom('oauth_identities')
      .select(['provider', 'email', 'created_at'])
      .where('user_id', '=', userId)
      .orderBy('created_at', 'asc')
      .execute(),
  ]);

  return {
    hasAvatar: Boolean(avatarRow),
    avatarVersion: avatarRow?.updated_at ?? null,
    authMethods: {
      hasPassword: passwordHash.startsWith('$argon2'),
      providers: identities
        .filter((i): i is { provider: 'google' | 'discord'; email: string | null; created_at: string } =>
          i.provider === 'google' || i.provider === 'discord'
        )
        .map((i) => ({
          provider: i.provider,
          email: i.email,
          createdAt: i.created_at,
        })),
    },
  };
}

export interface AuthContext {
  user: AuthenticatedUser;
  sessionId: string;
  csrfToken: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export function parsePreferences(raw: string): UserPreferences {
  try {
    const parsed = JSON.parse(raw) as Partial<UserPreferences>;
    const theme: ThemeMode =
      parsed.theme === 'amoled' ||
      parsed.theme === 'light' ||
      parsed.theme === 'system' ||
      parsed.theme === 'dark'
        ? parsed.theme
        : 'dark';
    const darkStyle: 'dark' | 'amoled' = parsed.darkStyle === 'amoled' ? 'amoled' : 'dark';
    return {
      theme,
      darkStyle,
      defaultModel: typeof parsed.defaultModel === 'string' ? parsed.defaultModel : null,
      sendOnEnter: typeof parsed.sendOnEnter === 'boolean' ? parsed.sendOnEnter : true,
      reduceTransparency:
        typeof parsed.reduceTransparency === 'boolean' ? parsed.reduceTransparency : false,
      reduceMotion: typeof parsed.reduceMotion === 'boolean' ? parsed.reduceMotion : null,
      timezone:
        typeof parsed.timezone === 'string' && parsed.timezone.trim()
          ? parsed.timezone.trim()
          : null,
    };
  } catch {
    return {
      theme: 'dark',
      darkStyle: 'dark',
      defaultModel: null,
      sendOnEnter: true,
      reduceTransparency: false,
      reduceMotion: null,
      timezone: null,
    };
  }
}

export async function createSession(
  db: Kysely<DatabaseSchema>,
  userId: string
): Promise<{ rawToken: string; csrfToken: string; expiresAt: string }> {
  const rawToken = generateRandomToken(32);
  const sessionId = sha256Hex(rawToken);
  const csrfToken = generateRandomToken(24);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();

  await db
    .insertInto('sessions')
    .values({
      id: sessionId,
      user_id: userId,
      csrf_token: csrfToken,
      expires_at: expiresAt,
      created_at: now.toISOString(),
    })
    .execute();

  return { rawToken, csrfToken, expiresAt };
}

export function setSessionCookie(
  reply: FastifyReply,
  rawToken: string,
  config: AppConfig,
  expiresAt: string
): void {
  reply.setCookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(reply: FastifyReply, config: AppConfig): void {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
  });
}

export function makeAuthMiddleware(db: Kysely<DatabaseSchema>, config: AppConfig) {
  async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const rawToken = req.cookies[SESSION_COOKIE_NAME];
    if (!rawToken) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const sessionId = sha256Hex(rawToken);
    const row = await db
      .selectFrom('sessions as s')
      .innerJoin('users as u', 'u.id', 's.user_id')
      .select([
        's.id as session_id',
        's.csrf_token as csrf_token',
        's.expires_at as expires_at',
        'u.id as user_id',
        'u.email as email',
        'u.display_name as display_name',
        'u.password_hash as password_hash',
        'u.role as role',
        'u.is_active as is_active',
        'u.preferences_json as preferences_json',
        'u.email_verified_at as email_verified_at',
        'u.onboarding_completed_at as onboarding_completed_at',
        'u.created_at as created_at',
      ])
      .where('s.id', '=', sessionId)
      .executeTakeFirst();

    if (!row) {
      clearSessionCookie(reply, config);
      return reply.code(401).send({ error: 'Invalid or expired session' });
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await db.deleteFrom('sessions').where('id', '=', sessionId).execute();
      clearSessionCookie(reply, config);
      return reply.code(401).send({ error: 'Session expired' });
    }

    if (Number(row.is_active) !== 1) {
      return reply.code(403).send({ error: 'Account is disabled' });
    }

    const emailSettings = await getSetting<EmailSettings>(
      db,
      'email_settings',
      DEFAULT_EMAIL_SETTINGS
    );
    if (emailSettings.requireVerification && row.email_verified_at === null) {
      clearSessionCookie(reply, config);
      return reply.code(403).send({
        error: 'Please verify your email address before using the API',
        code: 'email_not_verified',
      });
    }

    const extras = await getUserIdentityExtras(db, row.user_id, row.password_hash);

    req.auth = {
      sessionId: row.session_id,
      csrfToken: row.csrf_token,
      user: {
        id: row.user_id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        isActive: Number(row.is_active) === 1,
        hasAvatar: extras.hasAvatar,
        avatarVersion: extras.avatarVersion,
        authMethods: extras.authMethods,
        preferences: parsePreferences(row.preferences_json),
        onboardingCompletedAt: row.onboarding_completed_at ?? null,
        createdAt: row.created_at,
      },
    };
  }

  async function verifyCsrf(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!req.auth) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const headerToken = req.headers['x-csrf-token'];
    const token = typeof headerToken === 'string' ? headerToken : '';
    if (!token || !timingSafeEqualStr(token, req.auth.csrfToken)) {
      return reply.code(403).send({ error: 'Invalid or missing CSRF token' });
    }

    const origin = req.headers.origin;
    if (origin && config.appOrigin && origin !== config.appOrigin) {
      // Also allow matching the request host when running behind a reverse proxy (e.g. Render)
      const hostHeader = req.headers.host;
      let originMatchesHost = false;
      if (hostHeader) {
        try {
          originMatchesHost = new URL(origin).host === hostHeader;
        } catch {
          originMatchesHost = false;
        }
      }
      let isLoopbackDev = false;
      try {
        const originUrl = new URL(origin);
        const configUrl = new URL(config.appOrigin);
        const isLoopbackHost = (h: string) => h === 'localhost' || h === '127.0.0.1';
        if (
          isLoopbackHost(originUrl.hostname) &&
          isLoopbackHost(configUrl.hostname) &&
          originUrl.port === configUrl.port
        ) {
          isLoopbackDev = true;
        }
      } catch {
        isLoopbackDev = false;
      }

      if (!originMatchesHost && !isLoopbackDev) {
        return reply.code(403).send({ error: 'Origin mismatch' });
      }
    }
  }

  async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!req.auth) {
      return reply.code(401).send({ error: 'Authentication required' });
    }
    if (req.auth.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Admin access required' });
    }
  }

  return { authenticate, verifyCsrf, requireAdmin };
}
