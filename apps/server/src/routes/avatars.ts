import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import type { DatabaseSchema } from '../db/index.js';
import {
  AvatarValidationError,
  MAX_AVATAR_BYTES,
  processAvatarUpload,
} from '../lib/avatars.js';
import { makeAuthMiddleware } from '../middleware/auth.js';

const userIdParamSchema = z.object({
  id: z.string().min(1).max(100),
});

export function registerAvatarRoutes(
  app: FastifyInstance,
  db: Kysely<DatabaseSchema>,
  config: AppConfig
): void {
  const { authenticate, verifyCsrf, requireAdmin } = makeAuthMiddleware(db, config);
  const uploadRateLimit = {
    rateLimit: {
      max: config.nodeEnv === 'test' ? 100 : 12,
      timeWindow: '15 minutes',
    },
  };

  app.post(
    '/api/me/avatar',
    { preHandler: [authenticate, verifyCsrf], config: uploadRateLimit },
    async (req, reply) => {
      let file;
      try {
        file = await req.file({ limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } });
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === 'FST_REQ_FILE_TOO_LARGE') {
          return reply.code(413).send({ error: 'Profile picture exceeds the 5 MB limit.' });
        }
        return reply.code(400).send({ error: 'Invalid upload request.' });
      }

      if (!file) {
        return reply.code(400).send({ error: 'No image file uploaded.' });
      }

      let rawBuffer: Buffer;
      try {
        rawBuffer = await file.toBuffer();
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === 'FST_REQ_FILE_TOO_LARGE') {
          return reply.code(413).send({ error: 'Profile picture exceeds the 5 MB limit.' });
        }
        return reply.code(400).send({ error: 'Failed to read uploaded image.' });
      }

      if (file.file.truncated || rawBuffer.length > MAX_AVATAR_BYTES) {
        return reply.code(413).send({ error: 'Profile picture exceeds the 5 MB limit.' });
      }

      try {
        const processed = await processAvatarUpload(rawBuffer);
        const now = new Date().toISOString();
        const userId = req.auth!.user.id;

        await db
          .insertInto('user_avatars')
          .values({
            user_id: userId,
            mime_type: processed.mimeType,
            data: processed.data,
            etag: processed.etag,
            updated_at: now,
          })
          .onConflict((oc) =>
            oc.column('user_id').doUpdateSet({
              mime_type: processed.mimeType,
              data: processed.data,
              etag: processed.etag,
              updated_at: now,
            })
          )
          .execute();

        return {
          hasAvatar: true,
          avatarVersion: now,
        };
      } catch (err) {
        if (err instanceof AvatarValidationError) {
          return reply.code(err.status).send({ error: err.message });
        }
        throw err;
      }
    }
  );

  app.delete(
    '/api/me/avatar',
    { preHandler: [authenticate, verifyCsrf], config: uploadRateLimit },
    async (req) => {
      await db.deleteFrom('user_avatars').where('user_id', '=', req.auth!.user.id).execute();
      return { ok: true, hasAvatar: false, avatarVersion: null };
    }
  );

  app.get('/api/users/:id/avatar', { preHandler: [authenticate] }, async (req, reply) => {
    const { id } = userIdParamSchema.parse(req.params);
    const row = await db
      .selectFrom('user_avatars')
      .select(['mime_type', 'data', 'etag'])
      .where('user_id', '=', id)
      .executeTakeFirst();

    if (!row) {
      return reply.code(404).send({ error: 'Avatar not found' });
    }

    const ifNoneMatch = req.headers['if-none-match'];
    if (typeof ifNoneMatch === 'string' && ifNoneMatch === row.etag) {
      return reply.code(304).send();
    }

    reply.header('Content-Type', row.mime_type);
    reply.header('ETag', row.etag);
    reply.header('Cache-Control', 'private, max-age=300');
    reply.header('X-Content-Type-Options', 'nosniff');
    return Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
  });

  app.delete(
    '/api/admin/users/:id/avatar',
    { preHandler: [authenticate, requireAdmin, verifyCsrf], config: uploadRateLimit },
    async (req) => {
      const { id } = userIdParamSchema.parse(req.params);
      await db.deleteFrom('user_avatars').where('user_id', '=', id).execute();
      return { ok: true };
    }
  );
}
