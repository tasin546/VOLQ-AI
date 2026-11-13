import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import {
  type DatabaseContext,
  DEFAULT_KNOWLEDGE_CONFIG,
  getSetting,
  type KnowledgeConfig,
  setSetting,
} from '../db/index.js';
import {
  FileValidationError,
  getActiveRetrievalMode,
  processKnowledgeFile,
  validateUploadedDocument,
} from '../lib/knowledge.js';
import { makeAuthMiddleware } from '../middleware/auth.js';

const kbBodySchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(400).default(''),
  systemPrompt: z.string().max(8000).default(''),
});

const kbUpdateSchema = kbBodySchema.partial();

const configSchema = z.object({
  embeddingConnectionId: z.string().nullable().optional(),
  embeddingModelId: z.string().nullable().optional(),
  chunkSizeChars: z.number().int().min(200).max(4000).optional(),
  chunkOverlapChars: z.number().int().min(0).max(1000).optional(),
  maxContextTokens: z.number().int().min(200).max(16000).optional(),
  topK: z.number().int().min(1).max(20).optional(),
});

const idParamSchema = z.object({
  id: z.string().min(1).max(100),
});

const fileIdParamSchema = z.object({
  fileId: z.string().min(1).max(100),
});

export function registerKnowledgeRoutes(
  app: FastifyInstance,
  ctx: DatabaseContext,
  config: AppConfig
): void {
  const { authenticate, verifyCsrf, requireAdmin } = makeAuthMiddleware(ctx.db, config);

  app.get('/api/admin/knowledge/bases', { preHandler: [authenticate, requireAdmin] }, async () => {
    const bases = await ctx.db
      .selectFrom('knowledge_bases')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();

    const files = await ctx.db
      .selectFrom('knowledge_files')
      .select(['id', 'knowledge_base_id', 'status', 'chunk_count', 'size_bytes'])
      .execute();

    const retrievalMode = await getActiveRetrievalMode(ctx);
    const kbConfig = await getSetting<KnowledgeConfig>(
      ctx.db,
      'knowledge_config',
      DEFAULT_KNOWLEDGE_CONFIG
    );

    return {
      bases: bases.map((b) => {
        const kbFiles = files.filter((f) => f.knowledge_base_id === b.id);
        return {
          id: b.id,
          name: b.name,
          description: b.description,
          systemPrompt: b.system_prompt,
          fileCount: kbFiles.length,
          readyCount: kbFiles.filter((f) => f.status === 'ready').length,
          chunkCount: kbFiles.reduce((acc, f) => acc + Number(f.chunk_count), 0),
          totalBytes: kbFiles.reduce((acc, f) => acc + Number(f.size_bytes), 0),
          createdAt: b.created_at,
          updatedAt: b.updated_at,
        };
      }),
      retrievalMode,
      config: kbConfig,
      maxUploadMb: config.maxUploadMb,
    };
  });

  app.post(
    '/api/admin/knowledge/bases',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req, reply) => {
      const body = kbBodySchema.parse(req.body);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      await ctx.db
        .insertInto('knowledge_bases')
        .values({
          id,
          name: body.name,
          description: body.description,
          system_prompt: body.systemPrompt,
          created_at: now,
          updated_at: now,
        })
        .execute();

      const created = await ctx.db
        .selectFrom('knowledge_bases')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow();

      return reply.code(201).send({
        base: {
          id: created.id,
          name: created.name,
          description: created.description,
          systemPrompt: created.system_prompt,
          fileCount: 0,
          readyCount: 0,
          chunkCount: 0,
          totalBytes: 0,
          createdAt: created.created_at,
          updatedAt: created.updated_at,
        },
      });
    }
  );

  app.patch(
    '/api/admin/knowledge/bases/:id',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req, reply) => {
      const { id } = idParamSchema.parse(req.params);
      const body = kbUpdateSchema.parse(req.body);

      const existing = await ctx.db
        .selectFrom('knowledge_bases')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!existing) {
        return reply.code(404).send({ error: 'Knowledge base not found' });
      }

      const now = new Date().toISOString();
      await ctx.db
        .updateTable('knowledge_bases')
        .set({
          name: body.name ?? existing.name,
          description: body.description ?? existing.description,
          system_prompt: body.systemPrompt ?? existing.system_prompt,
          updated_at: now,
        })
        .where('id', '=', id)
        .execute();

      return { ok: true };
    }
  );

  app.delete(
    '/api/admin/knowledge/bases/:id',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req, reply) => {
      const { id } = idParamSchema.parse(req.params);

      if (ctx.dialect === 'sqlite') {
        await sql`DELETE FROM knowledge_chunks_fts WHERE knowledge_base_id = ${id}`.execute(
          ctx.db
        );
      }

      const res = await ctx.db
        .deleteFrom('knowledge_bases')
        .where('id', '=', id)
        .executeTakeFirst();

      if (Number(res.numDeletedRows) === 0) {
        return reply.code(404).send({ error: 'Knowledge base not found' });
      }

      return { ok: true };
    }
  );

  app.get(
    '/api/admin/knowledge/bases/:id/files',
    { preHandler: [authenticate, requireAdmin] },
    async (req, reply) => {
      const { id } = idParamSchema.parse(req.params);
      const base = await ctx.db
        .selectFrom('knowledge_bases')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!base) {
        return reply.code(404).send({ error: 'Knowledge base not found' });
      }

      const files = await ctx.db
        .selectFrom('knowledge_files')
        .select([
          'id',
          'knowledge_base_id',
          'filename',
          'mime_type',
          'size_bytes',
          'status',
          'error_message',
          'chunk_count',
          'created_at',
          'updated_at',
        ])
        .where('knowledge_base_id', '=', id)
        .orderBy('created_at', 'desc')
        .execute();

      return {
        files: files.map((f) => ({
          id: f.id,
          knowledgeBaseId: f.knowledge_base_id,
          filename: f.filename,
          mimeType: f.mime_type,
          sizeBytes: Number(f.size_bytes),
          status: f.status,
          errorMessage: f.error_message,
          chunkCount: Number(f.chunk_count),
          createdAt: f.created_at,
          updatedAt: f.updated_at,
        })),
      };
    }
  );

  app.post(
    '/api/admin/knowledge/bases/:id/files',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req, reply) => {
      const { id } = idParamSchema.parse(req.params);
      const base = await ctx.db
        .selectFrom('knowledge_bases')
        .select('id')
        .where('id', '=', id)
        .executeTakeFirst();
      if (!base) {
        return reply.code(404).send({ error: 'Knowledge base not found' });
      }

      const filePart = await req.file();
      if (!filePart) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      const buffer = await filePart.toBuffer();
      const maxBytes = config.maxUploadMb * 1024 * 1024;
      if (buffer.length > maxBytes) {
        return reply.code(413).send({
          error: `File exceeds maximum allowed size of ${config.maxUploadMb} MB`,
        });
      }

      let validated: { detectedMime: string };
      try {
        validated = await validateUploadedDocument(filePart.filename, buffer);
      } catch (err) {
        if (err instanceof FileValidationError) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }

      const fileId = crypto.randomUUID();
      const now = new Date().toISOString();

      await ctx.db
        .insertInto('knowledge_files')
        .values({
          id: fileId,
          knowledge_base_id: id,
          filename: filePart.filename,
          mime_type: validated.detectedMime,
          size_bytes: buffer.length,
          file_data: buffer,
          status: 'queued',
          error_message: null,
          chunk_count: 0,
          created_at: now,
          updated_at: now,
        })
        .execute();

      await processKnowledgeFile(ctx, config, fileId);

      const saved = await ctx.db
        .selectFrom('knowledge_files')
        .select([
          'id',
          'knowledge_base_id',
          'filename',
          'mime_type',
          'size_bytes',
          'status',
          'error_message',
          'chunk_count',
          'created_at',
          'updated_at',
        ])
        .where('id', '=', fileId)
        .executeTakeFirstOrThrow();

      return reply.code(201).send({
        file: {
          id: saved.id,
          knowledgeBaseId: saved.knowledge_base_id,
          filename: saved.filename,
          mimeType: saved.mime_type,
          sizeBytes: Number(saved.size_bytes),
          status: saved.status,
          errorMessage: saved.error_message,
          chunkCount: Number(saved.chunk_count),
          createdAt: saved.created_at,
          updatedAt: saved.updated_at,
        },
      });
    }
  );

  app.post(
    '/api/admin/knowledge/files/:fileId/reprocess',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req, reply) => {
      const { fileId } = fileIdParamSchema.parse(req.params);
      const exists = await ctx.db
        .selectFrom('knowledge_files')
        .select('id')
        .where('id', '=', fileId)
        .executeTakeFirst();
      if (!exists) {
        return reply.code(404).send({ error: 'File not found' });
      }

      await processKnowledgeFile(ctx, config, fileId);
      const saved = await ctx.db
        .selectFrom('knowledge_files')
        .select([
          'id',
          'knowledge_base_id',
          'filename',
          'mime_type',
          'size_bytes',
          'status',
          'error_message',
          'chunk_count',
          'created_at',
          'updated_at',
        ])
        .where('id', '=', fileId)
        .executeTakeFirstOrThrow();

      return {
        file: {
          id: saved.id,
          knowledgeBaseId: saved.knowledge_base_id,
          filename: saved.filename,
          mimeType: saved.mime_type,
          sizeBytes: Number(saved.size_bytes),
          status: saved.status,
          errorMessage: saved.error_message,
          chunkCount: Number(saved.chunk_count),
          createdAt: saved.created_at,
          updatedAt: saved.updated_at,
        },
      };
    }
  );

  app.delete(
    '/api/admin/knowledge/files/:fileId',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req, reply) => {
      const { fileId } = fileIdParamSchema.parse(req.params);

      if (ctx.dialect === 'sqlite') {
        const chunkIds = (
          await ctx.db
            .selectFrom('knowledge_chunks')
            .select('id')
            .where('file_id', '=', fileId)
            .execute()
        ).map((c) => c.id);
        if (chunkIds.length > 0) {
          await sql`DELETE FROM knowledge_chunks_fts WHERE chunk_id IN (${sql.join(chunkIds)})`.execute(
            ctx.db
          );
        }
      }

      const res = await ctx.db
        .deleteFrom('knowledge_files')
        .where('id', '=', fileId)
        .executeTakeFirst();

      if (Number(res.numDeletedRows) === 0) {
        return reply.code(404).send({ error: 'File not found' });
      }

      return { ok: true };
    }
  );

  app.patch(
    '/api/admin/knowledge/config',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req) => {
      const body = configSchema.parse(req.body);
      const current = await getSetting<KnowledgeConfig>(
        ctx.db,
        'knowledge_config',
        DEFAULT_KNOWLEDGE_CONFIG
      );
      const next: KnowledgeConfig = {
        embeddingConnectionId:
          body.embeddingConnectionId !== undefined
            ? body.embeddingConnectionId
            : current.embeddingConnectionId,
        embeddingModelId:
          body.embeddingModelId !== undefined
            ? body.embeddingModelId
            : current.embeddingModelId,
        chunkSizeChars: body.chunkSizeChars ?? current.chunkSizeChars,
        chunkOverlapChars: body.chunkOverlapChars ?? current.chunkOverlapChars,
        maxContextTokens: body.maxContextTokens ?? current.maxContextTokens,
        topK: body.topK ?? current.topK,
      };
      await setSetting(ctx.db, 'knowledge_config', next);

      return {
        config: next,
        retrievalMode: await getActiveRetrievalMode(ctx),
      };
    }
  );
}
