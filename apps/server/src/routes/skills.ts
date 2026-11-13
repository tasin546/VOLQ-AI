import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import type { DatabaseSchema } from '../db/index.js';
import { makeAuthMiddleware } from '../middleware/auth.js';

const skillSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9_-]+$/i, 'Slug must contain only alphanumeric characters, dashes, or underscores'),
  description: z.string().trim().max(500).default(''),
  content: z.string().trim().min(1).max(25_000),
  shared: z.boolean().default(false),
  enabled: z.boolean().default(true),
});

const updateSkillSchema = skillSchema.partial();

export function registerSkillsRoutes(
  app: FastifyInstance,
  db: Kysely<DatabaseSchema>,
  config: AppConfig
): void {
  const { authenticate, verifyCsrf } = makeAuthMiddleware(db, config);

  // List skills available to current user (own + shared)
  app.get('/api/skills', { preHandler: [authenticate] }, async (req) => {
    const userId = req.auth!.user.id;
    const rows = await db
      .selectFrom('skills')
      .selectAll()
      .where((eb) =>
        eb.or([
          eb('owner_user_id', '=', userId),
          eb('shared', '=', 1),
          eb('owner_user_id', 'is', null),
        ])
      )
      .orderBy('name', 'asc')
      .execute();

    return {
      skills: rows.map((r) => ({
        id: r.id,
        ownerUserId: r.owner_user_id,
        isOwner: r.owner_user_id === userId,
        slug: r.slug,
        name: r.name,
        description: r.description,
        content: r.content,
        tokenEstimate: r.token_estimate,
        version: r.version,
        enabled: Number(r.enabled) === 1,
        shared: Number(r.shared) === 1,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    };
  });

  // Create a skill
  app.post('/api/skills', { preHandler: [authenticate, verifyCsrf] }, async (req, reply) => {
    const userId = req.auth!.user.id;
    const isAdmin = req.auth!.user.role === 'admin';
    const body = skillSchema.parse(req.body);

    const slug = body.slug.toLowerCase();
    const tokenEstimate = Math.ceil(body.content.length / 4);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();

    // Check slug collision for this user
    const existing = await db
      .selectFrom('skills')
      .select('id')
      .where('owner_user_id', '=', userId)
      .where('slug', '=', slug)
      .executeTakeFirst();

    if (existing) {
      return reply.code(400).send({ error: `A skill with slug "${slug}" already exists.` });
    }

    await db
      .insertInto('skills')
      .values({
        id,
        owner_user_id: userId,
        slug,
        name: body.name,
        description: body.description,
        content: body.content,
        token_estimate: tokenEstimate,
        version: 1,
        enabled: body.enabled ? 1 : 0,
        shared: isAdmin && body.shared ? 1 : 0,
        created_at: now,
        updated_at: now,
      })
      .execute();

    const created = await db
      .selectFrom('skills')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    return reply.code(201).send({
      skill: {
        id: created.id,
        ownerUserId: created.owner_user_id,
        isOwner: true,
        slug: created.slug,
        name: created.name,
        description: created.description,
        content: created.content,
        tokenEstimate: created.token_estimate,
        version: created.version,
        enabled: Number(created.enabled) === 1,
        shared: Number(created.shared) === 1,
        createdAt: created.created_at,
        updatedAt: created.updated_at,
      },
    });
  });

  // Update a skill
  app.put('/api/skills/:id', { preHandler: [authenticate, verifyCsrf] }, async (req, reply) => {
    const userId = req.auth!.user.id;
    const isAdmin = req.auth!.user.role === 'admin';
    const { id } = req.params as { id: string };
    const body = updateSkillSchema.parse(req.body);

    const existing = await db
      .selectFrom('skills')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!existing) {
      return reply.code(404).send({ error: 'Skill not found' });
    }

    if (existing.owner_user_id !== userId && !isAdmin) {
      return reply.code(403).send({ error: 'You do not have permission to modify this skill' });
    }

    const nextContent = body.content !== undefined ? body.content : existing.content;
    const tokenEstimate = Math.ceil(nextContent.length / 4);
    const now = new Date().toISOString();

    await db
      .updateTable('skills')
      .set({
        name: body.name ?? existing.name,
        slug: body.slug ? body.slug.toLowerCase() : existing.slug,
        description: body.description !== undefined ? body.description : existing.description,
        content: nextContent,
        token_estimate: tokenEstimate,
        version: existing.version + 1,
        enabled: body.enabled !== undefined ? (body.enabled ? 1 : 0) : existing.enabled,
        shared: body.shared !== undefined && isAdmin ? (body.shared ? 1 : 0) : existing.shared,
        updated_at: now,
      })
      .where('id', '=', id)
      .execute();

    const updated = await db
      .selectFrom('skills')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirstOrThrow();

    return {
      skill: {
        id: updated.id,
        ownerUserId: updated.owner_user_id,
        isOwner: updated.owner_user_id === userId,
        slug: updated.slug,
        name: updated.name,
        description: updated.description,
        content: updated.content,
        tokenEstimate: updated.token_estimate,
        version: updated.version,
        enabled: Number(updated.enabled) === 1,
        shared: Number(updated.shared) === 1,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    };
  });

  // Toggle skill enabled
  app.post('/api/skills/:id/toggle', { preHandler: [authenticate, verifyCsrf] }, async (req, reply) => {
    const userId = req.auth!.user.id;
    const isAdmin = req.auth!.user.role === 'admin';
    const { id } = req.params as { id: string };

    const existing = await db
      .selectFrom('skills')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!existing) {
      return reply.code(404).send({ error: 'Skill not found' });
    }

    if (existing.owner_user_id !== userId && !isAdmin) {
      return reply.code(403).send({ error: 'Permission denied' });
    }

    const nextEnabled = Number(existing.enabled) === 1 ? 0 : 1;
    await db
      .updateTable('skills')
      .set({
        enabled: nextEnabled,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', id)
      .execute();

    return { ok: true, enabled: nextEnabled === 1 };
  });

  // Delete a skill
  app.delete('/api/skills/:id', { preHandler: [authenticate, verifyCsrf] }, async (req, reply) => {
    const userId = req.auth!.user.id;
    const isAdmin = req.auth!.user.role === 'admin';
    const { id } = req.params as { id: string };

    const existing = await db
      .selectFrom('skills')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!existing) {
      return reply.code(404).send({ error: 'Skill not found' });
    }

    if (existing.owner_user_id !== userId && !isAdmin) {
      return reply.code(403).send({ error: 'Permission denied' });
    }

    await db.deleteFrom('skills').where('id', '=', id).execute();
    return { ok: true };
  });
}
