import crypto from 'node:crypto';
import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { sql } from 'kysely';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import {
  checkDbHealth,
  type ConnectionsTable,
  type DatabaseContext,
  DEFAULT_SSRF_POLICY,
  DEFAULT_STARTER_PROMPTS,
  DEFAULT_WELCOME_SETTINGS,
  getSetting,
  setSetting,
  type SsrfPolicy,
  type StarterPrompt,
  type WelcomeSettings,
} from '../db/index.js';
import { encryptSecret, maskApiKey, tryDecryptSecret } from '../lib/crypto.js';
import {
  ensureAllCachedModelsHaveMetadata,
  syncModelsMetadataForConnection,
} from '../lib/modelCatalog.js';
import {
  discoverModelsForConnection,
  isLocalUrl,
  normalizeBaseUrl,
  parseCachedModels,
} from '../lib/providers.js';
import { SsrfValidationError, validateConnectionUrl } from '../lib/ssrf.js';
import { makeAuthMiddleware, parsePreferences } from '../middleware/auth.js';

const updateUserSchema = z.object({
  role: z.enum(['admin', 'user']).optional(),
  isActive: z.boolean().optional(),
});

const updateSettingsSchema = z.object({
  signupMode: z.enum(['open', 'disabled']).optional(),
  globalSystemPrompt: z.string().max(12000).optional(),
  starterPrompts: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(64),
        label: z.string().trim().min(1).max(60),
        prompt: z.string().trim().min(1).max(2000),
      })
    )
    .max(6)
    .optional(),
  ssrfPolicy: z
    .object({
      allowPrivateNetworks: z.boolean(),
      allowlist: z.array(z.string().trim().min(1).max(120)).max(50),
      denylist: z.array(z.string().trim().min(1).max(120)).max(50),
    })
    .optional(),
});

const updateWelcomeSchema = z.object({
  enabled: z.boolean().optional(),
  headline: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(400).nullable().optional(),
  resetToDefault: z.boolean().optional(),
});

const createConnectionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: z.enum(['ollama', 'openai_compatible']),
  baseUrl: z.string().trim().url().max(500),
  apiKey: z.string().trim().max(500).optional(),
  isEnabled: z.boolean().default(true),
});

const updateConnectionSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  type: z.enum(['ollama', 'openai_compatible']).optional(),
  baseUrl: z.string().trim().url().max(500).optional(),
  apiKey: z.string().trim().max(500).optional(),
  clearApiKey: z.boolean().optional(),
  isEnabled: z.boolean().optional(),
});

const idParamSchema = z.object({
  id: z.string().min(1).max(100),
});

const updateModelSchema = z.object({
  displayName: z.string().trim().max(100).nullable().optional(),
  description: z.string().trim().max(240).optional(),
  icon: z.string().trim().max(60).nullable().optional(),
  visibility: z.enum(['public', 'private']).optional(),
  isHidden: z.boolean().optional(),
  isDeleted: z.boolean().optional(),
  systemPrompt: z.string().max(12000).optional(),
  defaultTemperature: z.number().min(0).max(2).nullable().optional(),
  defaultMaxTokens: z.number().int().min(1).max(128000).nullable().optional(),
  knowledgeBaseIds: z.array(z.string().min(1).max(100)).max(25).optional(),
});

const bulkModelSchema = z.object({
  ids: z.array(z.string().min(1).max(250)).min(1).max(10000),
  action: z.enum(['hide', 'show', 'make_public', 'make_private', 'delete', 'restore']),
});

function serializeConnection(row: ConnectionsTable) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    baseUrl: row.base_url,
    hasApiKey: Boolean(row.encrypted_api_key),
    apiKeyHint: row.api_key_hint,
    isEnabled: Number(row.is_enabled) === 1,
    cachedModels: parseCachedModels(row.cached_models_json),
    modelsUpdatedAt: row.models_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function registerAdminRoutes(
  app: FastifyInstance,
  ctx: DatabaseContext,
  config: AppConfig
): void {
  const db = ctx.db;
  const { authenticate, verifyCsrf, requireAdmin } = makeAuthMiddleware(db, config);

  app.get('/api/admin/users', { preHandler: [authenticate, requireAdmin] }, async () => {
    const [rows, avatars] = await Promise.all([
      db
        .selectFrom('users')
        .select([
          'id',
          'email',
          'display_name',
          'role',
          'is_active',
          'preferences_json',
          'created_at',
          'updated_at',
        ])
        .orderBy('created_at', 'asc')
        .execute(),
      db.selectFrom('user_avatars').select(['user_id', 'updated_at']).execute(),
    ]);

    const avatarMap = new Map(avatars.map((a) => [a.user_id, a.updated_at]));

    return {
      users: rows.map((r) => ({
        id: r.id,
        email: r.email,
        displayName: r.display_name,
        role: r.role,
        isActive: Number(r.is_active) === 1,
        hasAvatar: avatarMap.has(r.id),
        avatarVersion: avatarMap.get(r.id) ?? null,
        preferences: parsePreferences(r.preferences_json),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    };
  });

  app.patch(
    '/api/admin/users/:id',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req, reply) => {
      const { id } = idParamSchema.parse(req.params);
      const body = updateUserSchema.parse(req.body);

      const target = await db
        .selectFrom('users')
        .select(['id', 'role', 'is_active'])
        .where('id', '=', id)
        .executeTakeFirst();

      if (!target) {
        return reply.code(404).send({ error: 'User not found' });
      }

      const nextRole = body.role ?? target.role;
      const nextActive = body.isActive !== undefined ? body.isActive : Number(target.is_active) === 1;

      if (target.role === 'admin' && (nextRole !== 'admin' || !nextActive)) {
        const activeAdmins = await db
          .selectFrom('users')
          .select(db.fn.countAll<number | string>().as('count'))
          .where('role', '=', 'admin')
          .where('is_active', '=', 1)
          .where('id', '!=', id)
          .executeTakeFirstOrThrow();

        if (Number(activeAdmins.count) === 0) {
          return reply
            .code(400)
            .send({ error: 'Cannot demote or disable the last active admin account' });
        }
      }

      const now = new Date().toISOString();
      await db
        .updateTable('users')
        .set({
          role: nextRole,
          is_active: nextActive ? 1 : 0,
          updated_at: now,
        })
        .where('id', '=', id)
        .execute();

      if (!nextActive) {
        await db.deleteFrom('sessions').where('user_id', '=', id).execute();
      }

      return { ok: true };
    }
  );

  app.get('/api/admin/settings', { preHandler: [authenticate, requireAdmin] }, async () => {
    return {
      signupMode: await getSetting<'open' | 'disabled'>(db, 'signup_mode', 'open'),
      globalSystemPrompt: await getSetting<string>(db, 'global_system_prompt', ''),
      starterPrompts: await getSetting<StarterPrompt[]>(
        db,
        'starter_prompts',
        DEFAULT_STARTER_PROMPTS
      ),
      ssrfPolicy: await getSetting<SsrfPolicy>(db, 'ssrf_policy', DEFAULT_SSRF_POLICY),
      defaultOllamaUrl: config.defaultOllamaUrl,
    };
  });

  app.patch(
    '/api/admin/settings',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req) => {
      const body = updateSettingsSchema.parse(req.body);

      if (body.signupMode !== undefined) {
        await setSetting(db, 'signup_mode', body.signupMode);
      }
      if (body.globalSystemPrompt !== undefined) {
        await setSetting(db, 'global_system_prompt', body.globalSystemPrompt);
      }
      if (body.starterPrompts !== undefined) {
        await setSetting(db, 'starter_prompts', body.starterPrompts);
      }
      if (body.ssrfPolicy !== undefined) {
        await setSetting(db, 'ssrf_policy', body.ssrfPolicy);
      }

      return {
        signupMode: await getSetting<'open' | 'disabled'>(db, 'signup_mode', 'open'),
        globalSystemPrompt: await getSetting<string>(db, 'global_system_prompt', ''),
        starterPrompts: await getSetting<StarterPrompt[]>(
          db,
          'starter_prompts',
          DEFAULT_STARTER_PROMPTS
        ),
        ssrfPolicy: await getSetting<SsrfPolicy>(db, 'ssrf_policy', DEFAULT_SSRF_POLICY),
      };
    }
  );

  app.get('/api/admin/welcome', { preHandler: [authenticate, requireAdmin] }, async () => {
    const welcome = await getSetting<WelcomeSettings>(
      db,
      'welcome_settings',
      DEFAULT_WELCOME_SETTINGS
    );
    return { welcome };
  });

  app.put(
    '/api/admin/welcome',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req) => {
      const body = updateWelcomeSchema.parse(req.body);

      if (body.resetToDefault) {
        await setSetting(db, 'welcome_settings', DEFAULT_WELCOME_SETTINGS);
        return { welcome: DEFAULT_WELCOME_SETTINGS };
      }

      const current = await getSetting<WelcomeSettings>(
        db,
        'welcome_settings',
        DEFAULT_WELCOME_SETTINGS
      );
      const next: WelcomeSettings = {
        enabled: body.enabled !== undefined ? body.enabled : current.enabled,
        headline:
          body.headline !== undefined
            ? body.headline && body.headline.trim()
              ? body.headline.trim()
              : null
            : current.headline,
        description:
          body.description !== undefined
            ? body.description && body.description.trim()
              ? body.description.trim()
              : null
            : current.description,
      };

      await setSetting(db, 'welcome_settings', next);
      return { welcome: next };
    }
  );

  app.get('/api/admin/connections', { preHandler: [authenticate, requireAdmin] }, async () => {
    const rows = await db
      .selectFrom('connections')
      .selectAll()
      .orderBy('created_at', 'asc')
      .execute();

    return {
      connections: rows.map(serializeConnection),
    };
  });

  app.post(
    '/api/admin/connections',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req, reply) => {
      const body = createConnectionSchema.parse(req.body);
      const ssrfPolicy = await getSetting<SsrfPolicy>(db, 'ssrf_policy', DEFAULT_SSRF_POLICY);

      try {
        await validateConnectionUrl(body.baseUrl, ssrfPolicy);
      } catch (err) {
        if (err instanceof SsrfValidationError) {
          return reply.code(400).send({ error: err.message });
        }
        return reply.code(400).send({ error: err instanceof Error ? err.message : 'Invalid connection URL' });
      }

      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const normalizedUrl = normalizeBaseUrl(body.baseUrl);
      const rawKey = body.apiKey && body.apiKey.length > 0 ? body.apiKey : null;
      const encryptedKey = rawKey ? encryptSecret(rawKey, config.encryptionKey) : null;
      const keyHint = rawKey ? maskApiKey(rawKey) : null;

      await db
        .insertInto('connections')
        .values({
          id,
          name: body.name,
          type: body.type,
          base_url: normalizedUrl,
          encrypted_api_key: encryptedKey,
          api_key_hint: keyHint,
          is_enabled: body.isEnabled ? 1 : 0,
          cached_models_json: '[]',
          models_updated_at: null,
          created_at: now,
          updated_at: now,
        })
        .execute();

      const created = await db
        .selectFrom('connections')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow();

      return reply.code(201).send({ connection: serializeConnection(created) });
    }
  );

  app.patch(
    '/api/admin/connections/:id',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req, reply) => {
      const { id } = idParamSchema.parse(req.params);
      const body = updateConnectionSchema.parse(req.body);

      const existing = await db
        .selectFrom('connections')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!existing) {
        return reply.code(404).send({ error: 'Connection not found' });
      }

      const nextBaseUrl = body.baseUrl ? normalizeBaseUrl(body.baseUrl) : existing.base_url;
      if (body.baseUrl) {
        const ssrfPolicy = await getSetting<SsrfPolicy>(db, 'ssrf_policy', DEFAULT_SSRF_POLICY);
        try {
          await validateConnectionUrl(nextBaseUrl, ssrfPolicy);
        } catch (err) {
          if (err instanceof SsrfValidationError) {
            return reply.code(400).send({ error: err.message });
          }
          return reply.code(400).send({ error: err instanceof Error ? err.message : 'Invalid connection URL' });
        }
      }

      let nextEncryptedKey = existing.encrypted_api_key;
      let nextKeyHint = existing.api_key_hint;

      if (body.clearApiKey) {
        nextEncryptedKey = null;
        nextKeyHint = null;
      } else if (body.apiKey && body.apiKey.length > 0) {
        nextEncryptedKey = encryptSecret(body.apiKey, config.encryptionKey);
        nextKeyHint = maskApiKey(body.apiKey);
      }

      const now = new Date().toISOString();
      await db
        .updateTable('connections')
        .set({
          name: body.name ?? existing.name,
          type: body.type ?? existing.type,
          base_url: nextBaseUrl,
          encrypted_api_key: nextEncryptedKey,
          api_key_hint: nextKeyHint,
          is_enabled:
            body.isEnabled !== undefined ? (body.isEnabled ? 1 : 0) : existing.is_enabled,
          updated_at: now,
        })
        .where('id', '=', id)
        .execute();

      const updated = await db
        .selectFrom('connections')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow();

      return { connection: serializeConnection(updated) };
    }
  );

  app.delete(
    '/api/admin/connections/:id',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req, reply) => {
      const { id } = idParamSchema.parse(req.params);
      const res = await db.deleteFrom('connections').where('id', '=', id).executeTakeFirst();
      if (Number(res.numDeletedRows) === 0) {
        return reply.code(404).send({ error: 'Connection not found' });
      }
      return { ok: true };
    }
  );

  app.post(
    '/api/admin/connections/:id/test',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req, reply) => {
      const { id } = idParamSchema.parse(req.params);
      const row = await db
        .selectFrom('connections')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!row) {
        return reply.code(404).send({ error: 'Connection not found' });
      }

      try {
        const ssrfPolicy = await getSetting<SsrfPolicy>(db, 'ssrf_policy', DEFAULT_SSRF_POLICY);
        const decrypted = tryDecryptSecret(row.encrypted_api_key, config.encryptionKey);
        if (!decrypted.ok) {
          return {
            ok: false,
            error: decrypted.error,
            models: parseCachedModels(row.cached_models_json),
          };
        }

        const result = await discoverModelsForConnection(row, decrypted.value, ssrfPolicy);
        if (!result.ok) {
          return {
            ok: false,
            error: result.error ?? 'Connection test failed',
            models: parseCachedModels(row.cached_models_json),
          };
        }

        const now = new Date().toISOString();
        await db
          .updateTable('connections')
          .set({
            cached_models_json: JSON.stringify(result.models),
            models_updated_at: now,
            updated_at: now,
          })
          .where('id', '=', row.id)
          .execute();

        try {
          await syncModelsMetadataForConnection(db, row.id, result.models);
        } catch (syncErr) {
          req.log.warn(syncErr, 'Failed to sync model metadata for connection test');
        }

        return {
          ok: true,
          models: result.models,
          modelsUpdatedAt: now,
        };
      } catch (err) {
        req.log.error(err, 'Connection test error');
        return reply.code(400).send({
          ok: false,
          error: err instanceof Error ? err.message : 'Connection test failed',
          models: parseCachedModels(row.cached_models_json),
        });
      }
    }
  );

  // Admin Model Management
  app.get('/api/admin/models', { preHandler: [authenticate, requireAdmin] }, async (req) => {
    await ensureAllCachedModelsHaveMetadata(db);

    const query = req.query as {
      q?: string;
      connectionId?: string;
      visibility?: string;
      status?: string;
    };

    const connections = await db.selectFrom('connections').selectAll().execute();
    const connMap = new Map(connections.map((c) => [c.id, c]));

    const kbLinks = await db.selectFrom('model_knowledge_bases').selectAll().execute();
    const kbMap = new Map<string, string[]>();
    for (const link of kbLinks) {
      const list = kbMap.get(link.model_metadata_id) ?? [];
      list.push(link.knowledge_base_id);
      kbMap.set(link.model_metadata_id, list);
    }

    let rows = await db
      .selectFrom('models_metadata')
      .selectAll()
      .orderBy('provider_model_id', 'asc')
      .execute();

    const search = query.q?.trim().toLowerCase() ?? '';
    if (search) {
      rows = rows.filter(
        (r) =>
          r.provider_model_id.toLowerCase().includes(search) ||
          (r.display_name ?? '').toLowerCase().includes(search) ||
          r.description.toLowerCase().includes(search)
      );
    }

    if (query.connectionId && query.connectionId !== 'all') {
      rows = rows.filter((r) => r.connection_id === query.connectionId);
    }

    if (query.visibility === 'public' || query.visibility === 'private') {
      rows = rows.filter((r) => r.visibility === query.visibility);
    }

    const status = query.status ?? 'active_or_hidden';
    if (status === 'deleted') {
      rows = rows.filter((r) => Number(r.is_deleted) === 1);
    } else if (status === 'hidden') {
      rows = rows.filter((r) => Number(r.is_deleted) === 0 && Number(r.is_hidden) === 1);
    } else if (status === 'visible') {
      rows = rows.filter((r) => Number(r.is_deleted) === 0 && Number(r.is_hidden) === 0);
    } else if (status !== 'all') {
      rows = rows.filter((r) => Number(r.is_deleted) === 0);
    }

    return {
      models: rows.map((r) => {
        const conn = connMap.get(r.connection_id);
        return {
          id: r.id,
          connectionId: r.connection_id,
          connectionName: conn?.name ?? 'Unknown',
          connectionType: conn?.type ?? 'ollama',
          isLocal: conn ? isLocalUrl(conn.base_url) : false,
          providerModelId: r.provider_model_id,
          displayName: r.display_name,
          description: r.description,
          icon: r.icon,
          visibility: r.visibility,
          isHidden: Number(r.is_hidden) === 1,
          isDeleted: Number(r.is_deleted) === 1,
          systemPrompt: r.system_prompt,
          defaultTemperature: r.default_temperature,
          defaultMaxTokens: r.default_max_tokens,
          knowledgeBaseIds: kbMap.get(r.id) ?? [],
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        };
      }),
    };
  });

  app.patch(
    '/api/admin/models/:id',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req, reply) => {
      const { id } = idParamSchema.parse(req.params);
      const body = updateModelSchema.parse(req.body);

      const existing = await db
        .selectFrom('models_metadata')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();

      if (!existing) {
        return reply.code(404).send({ error: 'Model not found' });
      }

      const now = new Date().toISOString();
      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable('models_metadata')
          .set({
            display_name:
              body.displayName !== undefined
                ? body.displayName?.trim() || null
                : existing.display_name,
            description: body.description ?? existing.description,
            icon: body.icon !== undefined ? body.icon : existing.icon,
            visibility: body.visibility ?? existing.visibility,
            is_hidden:
              body.isHidden !== undefined ? (body.isHidden ? 1 : 0) : existing.is_hidden,
            is_deleted:
              body.isDeleted !== undefined ? (body.isDeleted ? 1 : 0) : existing.is_deleted,
            system_prompt: body.systemPrompt ?? existing.system_prompt,
            default_temperature:
              body.defaultTemperature !== undefined
                ? body.defaultTemperature
                : existing.default_temperature,
            default_max_tokens:
              body.defaultMaxTokens !== undefined
                ? body.defaultMaxTokens
                : existing.default_max_tokens,
            updated_at: now,
          })
          .where('id', '=', id)
          .execute();

        if (body.knowledgeBaseIds !== undefined) {
          await trx
            .deleteFrom('model_knowledge_bases')
            .where('model_metadata_id', '=', id)
            .execute();
          for (const kbId of body.knowledgeBaseIds) {
            await trx
              .insertInto('model_knowledge_bases')
              .values({ model_metadata_id: id, knowledge_base_id: kbId })
              .onConflict((oc) => oc.columns(['model_metadata_id', 'knowledge_base_id']).doNothing())
              .execute();
          }
        }
      });

      const updated = await db
        .selectFrom('models_metadata')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirstOrThrow();
      const kbLinks = await db
        .selectFrom('model_knowledge_bases')
        .select('knowledge_base_id')
        .where('model_metadata_id', '=', id)
        .execute();

      return {
        model: {
          id: updated.id,
          connectionId: updated.connection_id,
          providerModelId: updated.provider_model_id,
          displayName: updated.display_name,
          description: updated.description,
          icon: updated.icon,
          visibility: updated.visibility,
          isHidden: Number(updated.is_hidden) === 1,
          isDeleted: Number(updated.is_deleted) === 1,
          systemPrompt: updated.system_prompt,
          defaultTemperature: updated.default_temperature,
          defaultMaxTokens: updated.default_max_tokens,
          knowledgeBaseIds: kbLinks.map((k) => k.knowledge_base_id),
        },
      };
    }
  );

  app.post(
    '/api/admin/models/bulk',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req) => {
      const body = bulkModelSchema.parse(req.body);
      const uniqueIds = Array.from(new Set(body.ids));
      const now = new Date().toISOString();

      const patch: Partial<{
        is_hidden: number;
        is_deleted: number;
        visibility: 'public' | 'private';
        updated_at: string;
      }> = { updated_at: now };

      if (body.action === 'hide') patch.is_hidden = 1;
      if (body.action === 'show') patch.is_hidden = 0;
      if (body.action === 'make_public') patch.visibility = 'public';
      if (body.action === 'make_private') patch.visibility = 'private';
      if (body.action === 'delete') patch.is_deleted = 1;
      if (body.action === 'restore') patch.is_deleted = 0;

      const chunkSize = 250;
      for (let i = 0; i < uniqueIds.length; i += chunkSize) {
        const chunk = uniqueIds.slice(i, i + chunkSize);
        await db
          .updateTable('models_metadata')
          .set(patch)
          .where('id', 'in', chunk)
          .execute();
      }

      return { ok: true, count: uniqueIds.length };
    }
  );

  // Admin System Info (read-only stats, never exposes DATABASE_URL)
  app.get('/api/admin/system', { preHandler: [authenticate, requireAdmin] }, async () => {
    const connected = await checkDbHealth(ctx);

    const countTable = async (
      table:
        | 'users'
        | 'connections'
        | 'models_metadata'
        | 'knowledge_bases'
        | 'knowledge_files'
        | 'chats'
        | 'messages'
    ) => {
      const row = await db
        .selectFrom(table)
        .select(db.fn.countAll<number | string>().as('count'))
        .executeTakeFirstOrThrow();
      return Number(row.count);
    };

    const [users, connections, models, knowledgeBases, knowledgeFiles, chats, messages] =
      await Promise.all([
        countTable('users'),
        countTable('connections'),
        countTable('models_metadata'),
        countTable('knowledge_bases'),
        countTable('knowledge_files'),
        countTable('chats'),
        countTable('messages'),
      ]);

    const fileSizes = await db
      .selectFrom('knowledge_files')
      .select('size_bytes')
      .execute();
    const knowledgeFilesBytes = fileSizes.reduce((acc, r) => acc + Number(r.size_bytes), 0);

    let databaseBytes: number | null = null;
    if (ctx.dialect === 'postgres' && ctx.rawPool) {
      try {
        const res = await sql<{ size: string | number }>`SELECT pg_database_size(current_database()) AS size`.execute(
          db
        );
        databaseBytes = Number(res.rows[0]?.size ?? 0);
      } catch {
        databaseBytes = null;
      }
    } else if (ctx.databasePath && ctx.databasePath !== ':memory:' && fs.existsSync(ctx.databasePath)) {
      databaseBytes = fs.statSync(ctx.databasePath).size;
    }

    return {
      driver: ctx.dialect,
      connected,
      pgvector: ctx.hasVector,
      version: '0.2.0',
      maxUploadMb: config.maxUploadMb,
      counts: {
        users,
        connections,
        models,
        knowledgeBases,
        knowledgeFiles,
        chats,
        messages,
      },
      storageBytes: {
        databaseBytes,
        knowledgeFilesBytes,
      },
    };
  });
}
