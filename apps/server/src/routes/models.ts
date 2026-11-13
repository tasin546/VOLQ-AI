import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import type { AppConfig } from '../config.js';
import {
  type DatabaseSchema,
  DEFAULT_SSRF_POLICY,
  getSetting,
  type SsrfPolicy,
} from '../db/index.js';
import { tryDecryptSecret } from '../lib/crypto.js';
import { listModelsForUser, syncModelsMetadataForConnection } from '../lib/modelCatalog.js';
import { discoverModelsForConnection } from '../lib/providers.js';
import { makeAuthMiddleware } from '../middleware/auth.js';

export function registerModelRoutes(
  app: FastifyInstance,
  db: Kysely<DatabaseSchema>,
  config: AppConfig
): void {
  const { authenticate, verifyCsrf } = makeAuthMiddleware(db, config);

  app.get('/api/models', { preHandler: [authenticate] }, async (req) => {
    return listModelsForUser(db, req.auth!.user.role);
  });

  app.post('/api/models/refresh', { preHandler: [authenticate, verifyCsrf] }, async (req) => {
    const rows = await db
      .selectFrom('connections')
      .selectAll()
      .where('is_enabled', '=', 1)
      .orderBy('created_at', 'asc')
      .execute();

    const ssrfPolicy = await getSetting<SsrfPolicy>(db, 'ssrf_policy', DEFAULT_SSRF_POLICY);
    const errors: Array<{ connectionId: string; connectionName: string; error: string }> = [];

    for (const conn of rows) {
      const decrypted = tryDecryptSecret(conn.encrypted_api_key, config.encryptionKey);
      if (!decrypted.ok) {
        errors.push({
          connectionId: conn.id,
          connectionName: conn.name,
          error: decrypted.error,
        });
        continue;
      }
      const result = await discoverModelsForConnection(conn, decrypted.value, ssrfPolicy);
      if (result.ok) {
        const now = new Date().toISOString();
        await db
          .updateTable('connections')
          .set({
            cached_models_json: JSON.stringify(result.models),
            models_updated_at: now,
            updated_at: now,
          })
          .where('id', '=', conn.id)
          .execute();
        await syncModelsMetadataForConnection(db, conn.id, result.models);
      } else if (result.error) {
        errors.push({
          connectionId: conn.id,
          connectionName: conn.name,
          error: result.error,
        });
      }
    }

    const catalog = await listModelsForUser(db, req.auth!.user.role);
    return {
      models: catalog.models,
      errors,
    };
  });
}
