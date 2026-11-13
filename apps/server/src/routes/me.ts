import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import type { DatabaseSchema } from '../db/index.js';
import { makeAuthMiddleware } from '../middleware/auth.js';

const updateMeSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  preferences: z
    .object({
      theme: z.enum(['dark', 'amoled', 'light', 'system']).optional(),
      darkStyle: z.enum(['dark', 'amoled']).optional(),
      defaultModel: z.string().nullable().optional(),
      sendOnEnter: z.boolean().optional(),
      reduceTransparency: z.boolean().optional(),
      reduceMotion: z.boolean().nullable().optional(),
      timezone: z.string().trim().max(100).nullable().optional(),
    })
    .optional(),
});

export function registerMeRoutes(
  app: FastifyInstance,
  db: Kysely<DatabaseSchema>,
  config: AppConfig
): void {
  const { authenticate, verifyCsrf } = makeAuthMiddleware(db, config);

  app.patch('/api/me', { preHandler: [authenticate, verifyCsrf] }, async (req) => {
    const body = updateMeSchema.parse(req.body);
    const current = req.auth!.user;

    const nextDisplayName = body.displayName ?? current.displayName;
    const nextPreferences = {
      theme: body.preferences?.theme ?? current.preferences.theme,
      darkStyle: body.preferences?.darkStyle ?? current.preferences.darkStyle,
      defaultModel:
        body.preferences?.defaultModel !== undefined
          ? body.preferences.defaultModel
          : current.preferences.defaultModel,
      sendOnEnter: body.preferences?.sendOnEnter ?? current.preferences.sendOnEnter,
      reduceTransparency:
        body.preferences?.reduceTransparency ?? current.preferences.reduceTransparency,
      reduceMotion:
        body.preferences?.reduceMotion !== undefined
          ? body.preferences.reduceMotion
          : current.preferences.reduceMotion,
      timezone:
        body.preferences?.timezone !== undefined
          ? body.preferences.timezone
          : current.preferences.timezone,
    };

    const now = new Date().toISOString();
    await db
      .updateTable('users')
      .set({
        display_name: nextDisplayName,
        preferences_json: JSON.stringify(nextPreferences),
        updated_at: now,
      })
      .where('id', '=', current.id)
      .execute();

    return {
      user: {
        ...current,
        displayName: nextDisplayName,
        preferences: nextPreferences,
      },
    };
  });
}
