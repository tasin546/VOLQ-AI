import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import { type DatabaseSchema, setSetting } from '../db/index.js';
import { computeUserUsageSummary, getUsageLimitsPolicy } from '../lib/usageLimits.js';
import { makeAuthMiddleware } from '../middleware/auth.js';

const periodSchema = z.enum(['day', 'week', 'month']);

const updatePolicySchema = z.object({
  messagesEnabled: z.boolean(),
  messagesLimit: z.number().int().min(1).max(10_000_000),
  messagesPeriod: periodSchema,
  tokensEnabled: z.boolean(),
  tokensLimit: z.number().int().min(1).max(100_000_000),
  tokensPeriod: periodSchema,
  applyToAdmins: z.boolean(),
});

const updateUserOverrideSchema = z.object({
  mode: z.enum(['global', 'custom', 'unlimited']),
  messagesEnabled: z.boolean().default(false),
  messagesLimit: z.number().int().min(1).max(10_000_000).nullable().default(null),
  messagesPeriod: periodSchema.default('day'),
  tokensEnabled: z.boolean().default(false),
  tokensLimit: z.number().int().min(1).max(100_000_000).nullable().default(null),
  tokensPeriod: periodSchema.default('day'),
});

const userIdParamSchema = z.object({
  id: z.string().min(1).max(100),
});

export function registerUsageRoutes(
  app: FastifyInstance,
  db: Kysely<DatabaseSchema>,
  config: AppConfig,
  nowFn: () => Date = () => new Date()
): void {
  const { authenticate, verifyCsrf, requireAdmin } = makeAuthMiddleware(db, config);
  const mutateRateLimit = {
    rateLimit: {
      max: config.nodeEnv === 'test' ? 200 : 30,
      timeWindow: '15 minutes',
    },
  };

  app.get('/api/usage/me', { preHandler: [authenticate] }, async (req) => {
    return computeUserUsageSummary({
      db,
      user: { id: req.auth!.user.id, role: req.auth!.user.role },
      nowFn,
    });
  });

  app.get(
    '/api/admin/usage/policy',
    { preHandler: [authenticate, requireAdmin] },
    async () => {
      const policy = await getUsageLimitsPolicy(db);
      return { policy };
    }
  );

  app.put(
    '/api/admin/usage/policy',
    { preHandler: [authenticate, requireAdmin, verifyCsrf], config: mutateRateLimit },
    async (req) => {
      const body = updatePolicySchema.parse(req.body);
      await setSetting(db, 'usage_limits_policy', body);
      return { policy: body };
    }
  );

  app.get(
    '/api/admin/usage/overview',
    { preHandler: [authenticate, requireAdmin] },
    async () => {
      const [users, overrides, avatars, policy] = await Promise.all([
        db
          .selectFrom('users')
          .select(['id', 'email', 'display_name', 'role', 'is_active'])
          .orderBy('display_name', 'asc')
          .execute(),
        db.selectFrom('user_usage_overrides').selectAll().execute(),
        db.selectFrom('user_avatars').select(['user_id', 'updated_at']).execute(),
        getUsageLimitsPolicy(db),
      ]);

      const overrideMap = new Map(overrides.map((o) => [o.user_id, o]));
      const avatarMap = new Map(avatars.map((a) => [a.user_id, a.updated_at]));

      const entries = await Promise.all(
        users.map(async (u) => {
          const override = overrideMap.get(u.id) ?? null;
          const summary = await computeUserUsageSummary({
            db,
            user: { id: u.id, role: u.role },
            policy,
            override,
            nowFn,
          });
          return {
            userId: u.id,
            email: u.email,
            displayName: u.display_name,
            role: u.role,
            isActive: Number(u.is_active) === 1,
            hasAvatar: avatarMap.has(u.id),
            avatarVersion: avatarMap.get(u.id) ?? null,
            override: override
              ? {
                  mode: override.mode,
                  messagesEnabled: Number(override.messages_enabled) === 1,
                  messagesLimit: override.messages_limit,
                  messagesPeriod: override.messages_period,
                  tokensEnabled: Number(override.tokens_enabled) === 1,
                  tokensLimit: override.tokens_limit,
                  tokensPeriod: override.tokens_period,
                  resetBefore: override.reset_before,
                }
              : null,
            summary,
          };
        })
      );

      return { policy, users: entries };
    }
  );

  app.put(
    '/api/admin/usage/users/:id',
    { preHandler: [authenticate, requireAdmin, verifyCsrf], config: mutateRateLimit },
    async (req, reply) => {
      const { id } = userIdParamSchema.parse(req.params);
      const body = updateUserOverrideSchema.parse(req.body);
      const user = await db
        .selectFrom('users')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      const existing = await db
        .selectFrom('user_usage_overrides')
        .select('reset_before')
        .where('user_id', '=', id)
        .executeTakeFirst();

      const now = nowFn().toISOString();
      await db
        .insertInto('user_usage_overrides')
        .values({
          user_id: id,
          mode: body.mode,
          messages_enabled: body.messagesEnabled ? 1 : 0,
          messages_limit: body.messagesLimit,
          messages_period: body.messagesPeriod,
          tokens_enabled: body.tokensEnabled ? 1 : 0,
          tokens_limit: body.tokensLimit,
          tokens_period: body.tokensPeriod,
          reset_before: existing?.reset_before ?? null,
          updated_at: now,
        })
        .onConflict((oc) =>
          oc.column('user_id').doUpdateSet({
            mode: body.mode,
            messages_enabled: body.messagesEnabled ? 1 : 0,
            messages_limit: body.messagesLimit,
            messages_period: body.messagesPeriod,
            tokens_enabled: body.tokensEnabled ? 1 : 0,
            tokens_limit: body.tokensLimit,
            tokens_period: body.tokensPeriod,
            updated_at: now,
          })
        )
        .execute();

      return { ok: true };
    }
  );

  app.post(
    '/api/admin/usage/users/:id/reset',
    { preHandler: [authenticate, requireAdmin, verifyCsrf], config: mutateRateLimit },
    async (req, reply) => {
      const { id } = userIdParamSchema.parse(req.params);
      const user = await db
        .selectFrom('users')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!user) {
        return reply.code(404).send({ error: 'User not found' });
      }

      const now = nowFn().toISOString();
      await db
        .insertInto('user_usage_overrides')
        .values({
          user_id: id,
          mode: 'global',
          messages_enabled: 0,
          messages_limit: null,
          messages_period: 'day',
          tokens_enabled: 0,
          tokens_limit: null,
          tokens_period: 'day',
          reset_before: now,
          updated_at: now,
        })
        .onConflict((oc) =>
          oc.column('user_id').doUpdateSet({
            reset_before: now,
            updated_at: now,
          })
        )
        .execute();

      return { ok: true, resetBefore: now };
    }
  );
}
