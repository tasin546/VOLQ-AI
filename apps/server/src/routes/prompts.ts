import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import {
  type DatabaseSchema,
  DEFAULT_STARTER_PROMPTS,
  getSetting,
  type PromptsTable,
  type StarterPrompt,
} from '../db/index.js';
import { makeAuthMiddleware } from '../middleware/auth.js';

const promptBodySchema = z.object({
  title: z.string().trim().min(1).max(80),
  command: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'Command must use lowercase letters, numbers, or hyphens'),
  content: z.string().trim().min(1).max(8000),
});

const updatePromptSchema = promptBodySchema.partial();

const idParamSchema = z.object({
  id: z.string().min(1).max(100),
});

function serializePrompt(row: PromptsTable) {
  return {
    id: row.id,
    title: row.title,
    command: row.command,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function registerPromptRoutes(
  app: FastifyInstance,
  db: Kysely<DatabaseSchema>,
  config: AppConfig
): void {
  const { authenticate, verifyCsrf } = makeAuthMiddleware(db, config);

  app.get('/api/config/starter-prompts', { preHandler: [authenticate] }, async () => {
    const starterPrompts = await getSetting<StarterPrompt[]>(
      db,
      'starter_prompts',
      DEFAULT_STARTER_PROMPTS
    );
    return { starterPrompts };
  });

  app.get('/api/prompts', { preHandler: [authenticate] }, async (req) => {
    const rows = await db
      .selectFrom('prompts')
      .selectAll()
      .where('user_id', '=', req.auth!.user.id)
      .orderBy('title', 'asc')
      .execute();
    return { prompts: rows.map(serializePrompt) };
  });

  app.post('/api/prompts', { preHandler: [authenticate, verifyCsrf] }, async (req, reply) => {
    const body = promptBodySchema.parse(req.body);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await db
      .insertInto('prompts')
      .values({
        id,
        user_id: req.auth!.user.id,
        title: body.title,
        command: body.command,
        content: body.content,
        created_at: now,
        updated_at: now,
      })
      .execute();

    const created = await db
      .selectFrom('prompts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    return reply.code(201).send({ prompt: serializePrompt(created) });
  });

  app.patch('/api/prompts/:id', { preHandler: [authenticate, verifyCsrf] }, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const body = updatePromptSchema.parse(req.body);

    const existing = await db
      .selectFrom('prompts')
      .selectAll()
      .where('id', '=', id)
      .where('user_id', '=', req.auth!.user.id)
      .executeTakeFirst();

    if (!existing) {
      return reply.code(404).send({ error: 'Prompt not found' });
    }

    const now = new Date().toISOString();
    await db
      .updateTable('prompts')
      .set({
        title: body.title ?? existing.title,
        command: body.command ?? existing.command,
        content: body.content ?? existing.content,
        updated_at: now,
      })
      .where('id', '=', id)
      .where('user_id', '=', req.auth!.user.id)
      .execute();

    const updated = await db
      .selectFrom('prompts')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    return { prompt: serializePrompt(updated) };
  });

  app.delete('/api/prompts/:id', { preHandler: [authenticate, verifyCsrf] }, async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const result = await db
      .deleteFrom('prompts')
      .where('id', '=', id)
      .where('user_id', '=', req.auth!.user.id)
      .executeTakeFirst();

    if (Number(result.numDeletedRows) === 0) {
      return reply.code(404).send({ error: 'Prompt not found' });
    }
    return { ok: true };
  });
}
