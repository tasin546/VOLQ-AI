import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import {
  type DatabaseSchema,
  DEFAULT_EMAIL_SETTINGS,
  type EmailSettings,
  getSetting,
} from '../db/index.js';
import { hashPassword, sha256Hex, verifyPassword } from '../lib/crypto.js';
import { sendUserVerificationEmail } from '../lib/email/verificationService.js';
import {
  clearSessionCookie,
  createSession,
  getUserIdentityExtras,
  makeAuthMiddleware,
  parsePreferences,
  SESSION_COOKIE_NAME,
  setSessionCookie,
} from '../middleware/auth.js';

const registerSchema = z.object({
  email: z.string().trim().email().max(255).transform((v) => v.toLowerCase()),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  displayName: z.string().trim().min(1, 'Display name is required').max(80),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(255).transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(128),
});

const verifyEmailSchema = z.object({
  token: z.string().trim().min(1).max(200),
});

const resendVerificationSchema = z.object({
  email: z.string().trim().email().max(255).transform((v) => v.toLowerCase()),
});

export function registerAuthRoutes(
  app: FastifyInstance,
  db: Kysely<DatabaseSchema>,
  config: AppConfig
): void {
  const { authenticate, verifyCsrf } = makeAuthMiddleware(db, config);
  const authRateLimit = {
    rateLimit: {
      max: config.nodeEnv === 'test' ? 100 : 10,
      timeWindow: '15 minutes',
    },
  };

  app.get('/api/auth/status', async () => {
    const countRow = await db
      .selectFrom('users')
      .select(db.fn.countAll<number | string>().as('count'))
      .executeTakeFirstOrThrow();
    const signupMode = await getSetting<'open' | 'disabled'>(db, 'signup_mode', 'open');
    return {
      needsSetup: Number(countRow.count) === 0,
      signupMode,
    };
  });

  app.post('/api/auth/register', { config: authRateLimit }, async (req, reply) => {
    const body = registerSchema.parse(req.body);
    const passwordHash = await hashPassword(body.password);
    const now = new Date().toISOString();
    const userId = crypto.randomUUID();
    const defaultPrefs = {
      theme: 'dark' as const,
      darkStyle: 'dark' as const,
      defaultModel: null,
      sendOnEnter: true,
      reduceTransparency: false,
      reduceMotion: null,
      timezone: null,
    };

    const emailSettings = await getSetting<EmailSettings>(
      db,
      'email_settings',
      DEFAULT_EMAIL_SETTINGS
    );

    const result = await db.transaction().execute(
      async (
        trx
      ): Promise<{
        status: number;
        error?: string;
        role?: 'admin' | 'user';
        requireVerification?: boolean;
      }> => {
        const countRow = await trx
          .selectFrom('users')
          .select(trx.fn.countAll<number | string>().as('count'))
          .executeTakeFirstOrThrow();
        const isFirstUser = Number(countRow.count) === 0;
        const signupMode = await getSetting<'open' | 'disabled'>(trx, 'signup_mode', 'open');

        if (!isFirstUser && signupMode === 'disabled') {
          return { status: 403, error: 'Signups are currently disabled by the administrator' };
        }

        const existing = await trx
          .selectFrom('users')
          .select('id')
          .where('email', '=', body.email)
          .executeTakeFirst();

        if (existing) {
          return { status: 409, error: 'An account with this email already exists' };
        }

        const role: 'admin' | 'user' = isFirstUser ? 'admin' : 'user';
        // First user (admin bootstrap) is always auto-verified
        const requireVerification = !isFirstUser && emailSettings.requireVerification;
        const emailVerifiedAt = requireVerification ? null : now;

        await trx
          .insertInto('users')
          .values({
            id: userId,
            email: body.email,
            display_name: body.displayName,
            password_hash: passwordHash,
            role,
            is_active: 1,
            preferences_json: JSON.stringify(defaultPrefs),
            email_verified_at: emailVerifiedAt,
            created_at: now,
            updated_at: now,
          })
          .execute();

        return { status: 201, role, requireVerification };
      }
    );

    if (result.error || !result.role) {
      return reply.code(result.status).send({ error: result.error });
    }

    if (result.requireVerification) {
      const branding = await getSetting<{ siteName: string }>(db, 'branding', {
        siteName: 'VOLQ AI',
      });

      try {
        await sendUserVerificationEmail({
          db,
          config,
          user: { id: userId, email: body.email, displayName: body.displayName },
          emailSettings,
          brandingSiteName: branding.siteName,
        });
      } catch (err) {
        req.log.error(err, 'Failed to send initial verification email');
      }

      return reply.code(201).send({
        requiresVerification: true,
        email: body.email,
        userId,
      });
    }

    const session = await createSession(db, userId);
    setSessionCookie(reply, session.rawToken, config, session.expiresAt);

    return reply.code(201).send({
      user: {
        id: userId,
        email: body.email,
        displayName: body.displayName,
        role: result.role,
        isActive: true,
        hasAvatar: false,
        avatarVersion: null,
        authMethods: { hasPassword: true, providers: [] },
        preferences: defaultPrefs,
        onboardingCompletedAt: null,
        createdAt: now,
      },
      csrfToken: session.csrfToken,
    });
  });

  app.post('/api/auth/login', { config: authRateLimit }, async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const row = await db
      .selectFrom('users')
      .select([
        'id',
        'email',
        'display_name',
        'password_hash',
        'role',
        'is_active',
        'preferences_json',
        'email_verified_at',
        'onboarding_completed_at',
        'created_at',
      ])
      .where('email', '=', body.email)
      .executeTakeFirst();

    if (!row) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    if (
      !row.password_hash.startsWith('$argon2') ||
      !(await verifyPassword(row.password_hash, body.password))
    ) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    if (Number(row.is_active) !== 1) {
      return reply.code(403).send({ error: 'This account has been disabled by an administrator' });
    }

    const emailSettings = await getSetting<EmailSettings>(
      db,
      'email_settings',
      DEFAULT_EMAIL_SETTINGS
    );

    if (emailSettings.requireVerification && row.email_verified_at === null) {
      return reply.code(403).send({
        error: 'Please verify your email address before signing in.',
        code: 'email_not_verified',
        email: row.email,
        userId: row.id,
      });
    }

    const session = await createSession(db, row.id);
    setSessionCookie(reply, session.rawToken, config, session.expiresAt);
    const extras = await getUserIdentityExtras(db, row.id, row.password_hash);

    return {
      user: {
        id: row.id,
        email: row.email,
        displayName: row.display_name,
        role: row.role,
        isActive: true,
        hasAvatar: extras.hasAvatar,
        avatarVersion: extras.avatarVersion,
        authMethods: extras.authMethods,
        preferences: parsePreferences(row.preferences_json),
        onboardingCompletedAt: row.onboarding_completed_at,
        createdAt: row.created_at,
      },
      csrfToken: session.csrfToken,
    };
  });

  app.post('/api/auth/verify-email', async (req, reply) => {
    const body = verifyEmailSchema.parse(req.body);
    const tokenHash = sha256Hex(body.token);
    const now = new Date().toISOString();

    const tokenRow = await db
      .selectFrom('email_verification_tokens')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .where('used_at', 'is', null)
      .executeTakeFirst();

    if (!tokenRow || tokenRow.expires_at <= now) {
      return reply.code(400).send({
        error: 'Verification link is invalid or has expired.',
        code: 'token_invalid',
      });
    }

    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable('email_verification_tokens')
        .set({ used_at: now })
        .where('id', '=', tokenRow.id)
        .execute();

      await trx
        .updateTable('users')
        .set({ email_verified_at: now, updated_at: now })
        .where('id', '=', tokenRow.user_id)
        .execute();
    });

    const userRow = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', tokenRow.user_id)
      .executeTakeFirstOrThrow();

    const session = await createSession(db, userRow.id);
    setSessionCookie(reply, session.rawToken, config, session.expiresAt);
    const extras = await getUserIdentityExtras(db, userRow.id, userRow.password_hash);

    return {
      success: true,
      user: {
        id: userRow.id,
        email: userRow.email,
        displayName: userRow.display_name,
        role: userRow.role,
        isActive: Number(userRow.is_active) === 1,
        hasAvatar: extras.hasAvatar,
        avatarVersion: extras.avatarVersion,
        authMethods: extras.authMethods,
        preferences: parsePreferences(userRow.preferences_json),
        onboardingCompletedAt: userRow.onboarding_completed_at,
        createdAt: userRow.created_at,
      },
      csrfToken: session.csrfToken,
    };
  });

  app.post('/api/auth/resend-verification', { config: authRateLimit }, async (req) => {
    const body = resendVerificationSchema.parse(req.body);
    const genericResponse = {
      ok: true,
      message:
        'If an unverified account exists with that email address, a verification link has been sent.',
    };

    const user = await db
      .selectFrom('users')
      .select(['id', 'email', 'display_name', 'email_verified_at'])
      .where('email', '=', body.email)
      .executeTakeFirst();

    if (!user || user.email_verified_at !== null) {
      return genericResponse;
    }

    const emailSettings = await getSetting<EmailSettings>(
      db,
      'email_settings',
      DEFAULT_EMAIL_SETTINGS
    );

    // Cooldown check
    const latestToken = await db
      .selectFrom('email_verification_tokens')
      .select(['created_at'])
      .where('user_id', '=', user.id)
      .orderBy('created_at', 'desc')
      .executeTakeFirst();

    if (latestToken) {
      const cooldownMs = (emailSettings.resendCooldownSeconds || 60) * 1000;
      const elapsed = Date.now() - new Date(latestToken.created_at).getTime();
      if (elapsed < cooldownMs) {
        return genericResponse;
      }
    }

    const branding = await getSetting<{ siteName: string }>(db, 'branding', {
      siteName: 'VOLQ AI',
    });

    try {
      await sendUserVerificationEmail({
        db,
        config,
        user: { id: user.id, email: user.email, displayName: user.display_name },
        emailSettings,
        brandingSiteName: branding.siteName,
      });
    } catch (err) {
      req.log.error(err, 'Failed to resend verification email');
    }

    return genericResponse;
  });

  app.get('/api/auth/verification-status', async (req) => {
    const query = req.query as { email?: string; userId?: string };
    let userRow;
    if (query.userId) {
      userRow = await db
        .selectFrom('users')
        .select(['email_verified_at'])
        .where('id', '=', query.userId)
        .executeTakeFirst();
    } else if (query.email) {
      userRow = await db
        .selectFrom('users')
        .select(['email_verified_at'])
        .where('email', '=', query.email.toLowerCase().trim())
        .executeTakeFirst();
    }

    return {
      verified: Boolean(userRow && userRow.email_verified_at !== null),
    };
  });

  app.post(
    '/api/auth/logout',
    { preHandler: [authenticate, verifyCsrf] },
    async (req, reply) => {
      const rawToken = req.cookies[SESSION_COOKIE_NAME];
      if (rawToken) {
        await db.deleteFrom('sessions').where('id', '=', sha256Hex(rawToken)).execute();
      }
      clearSessionCookie(reply, config);
      return { ok: true };
    }
  );

  app.get('/api/auth/me', { preHandler: [authenticate] }, async (req) => {
    return {
      user: req.auth!.user,
      csrfToken: req.auth!.csrfToken,
    };
  });

  app.post(
    '/api/user/onboarding-complete',
    { preHandler: [authenticate, verifyCsrf] },
    async (req) => {
      const now = new Date().toISOString();
      await db
        .updateTable('users')
        .set({ onboarding_completed_at: now, updated_at: now })
        .where('id', '=', req.auth!.user.id)
        .execute();
      return { ok: true, onboardingCompletedAt: now };
    }
  );
}
