import crypto from 'node:crypto';
import type { Kysely } from 'kysely';
import type { ConnectionsTable, DatabaseSchema, ModelsMetadataTable } from '../db/index.js';
import { type CachedModel, isLocalUrl, parseCachedModels } from './providers.js';

export async function syncModelsMetadataForConnection(
  db: Kysely<DatabaseSchema>,
  connectionId: string,
  models: CachedModel[]
): Promise<void> {
  if (models.length === 0) return;
  const now = new Date().toISOString();

  const existingRows = await db
    .selectFrom('models_metadata')
    .select('provider_model_id')
    .where('connection_id', '=', connectionId)
    .execute();
  const existingIds = new Set(existingRows.map((r) => r.provider_model_id));

  const toInsert = models.filter((m) => !existingIds.has(m.id));
  if (toInsert.length === 0) return;

  const CHUNK_SIZE = 50;
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);
    await db
      .insertInto('models_metadata')
      .values(
        chunk.map((model) => ({
          id: crypto.randomUUID(),
          connection_id: connectionId,
          provider_model_id: model.id,
          display_name: null,
          description: '',
          icon: null,
          visibility: 'public' as const,
          is_hidden: 0,
          is_deleted: 0,
          system_prompt: '',
          default_temperature: null,
          default_max_tokens: null,
          created_at: now,
          updated_at: now,
        }))
      )
      .onConflict((oc) => oc.columns(['connection_id', 'provider_model_id']).doNothing())
      .execute();
  }
}

export async function ensureAllCachedModelsHaveMetadata(
  db: Kysely<DatabaseSchema>
): Promise<void> {
  const connections = await db.selectFrom('connections').select(['id', 'cached_models_json']).execute();
  for (const conn of connections) {
    const cached = parseCachedModels(conn.cached_models_json);
    if (cached.length > 0) {
      await syncModelsMetadataForConnection(db, conn.id, cached);
    }
  }
}

export interface UserVisibleModel {
  id: string;
  metadataId: string;
  name: string;
  providerModelId: string;
  description: string;
  icon: string | null;
  connectionId: string;
  connectionName: string;
  connectionType: 'ollama' | 'openai_compatible';
  isLocal: boolean;
  visibility: 'public' | 'private';
}

export async function listModelsForUser(
  db: Kysely<DatabaseSchema>,
  userRole: 'admin' | 'user'
): Promise<{
  models: UserVisibleModel[];
  connections: Array<{
    id: string;
    name: string;
    type: 'ollama' | 'openai_compatible';
    isLocal: boolean;
    modelsUpdatedAt: string | null;
  }>;
}> {
  const connections = await db
    .selectFrom('connections')
    .selectAll()
    .where('is_enabled', '=', 1)
    .orderBy('created_at', 'asc')
    .execute();

  const connMap = new Map<string, ConnectionsTable>();
  for (const c of connections) connMap.set(c.id, c);

  let metaQuery = db
    .selectFrom('models_metadata')
    .selectAll()
    .where('is_deleted', '=', 0)
    .where('is_hidden', '=', 0);

  if (userRole !== 'admin') {
    metaQuery = metaQuery.where('visibility', '=', 'public');
  }

  const metaRows = await metaQuery.orderBy('provider_model_id', 'asc').execute();

  const models: UserVisibleModel[] = [];
  for (const meta of metaRows) {
    const conn = connMap.get(meta.connection_id);
    if (!conn) continue;

    // Ensure the model is still in the connection's discovered cache if cache is populated
    const cached = parseCachedModels(conn.cached_models_json);
    if (cached.length > 0 && !cached.some((c) => c.id === meta.provider_model_id)) {
      continue;
    }

    models.push({
      id: meta.provider_model_id,
      metadataId: meta.id,
      name: meta.display_name?.trim() || meta.provider_model_id,
      providerModelId: meta.provider_model_id,
      description: meta.description,
      icon: meta.icon,
      connectionId: conn.id,
      connectionName: conn.name,
      connectionType: conn.type,
      isLocal: isLocalUrl(conn.base_url),
      visibility: meta.visibility,
    });
  }

  return {
    models,
    connections: connections.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      isLocal: isLocalUrl(r.base_url),
      modelsUpdatedAt: r.models_updated_at,
    })),
  };
}

export async function resolveAccessibleModel(
  db: Kysely<DatabaseSchema>,
  connectionId: string,
  providerModelId: string,
  userRole: 'admin' | 'user'
): Promise<
  | {
      ok: true;
      connection: ConnectionsTable;
      metadata: ModelsMetadataTable | null;
      knowledgeBaseIds: string[];
    }
  | { ok: false; status: number; error: string }
> {
  const connection = await db
    .selectFrom('connections')
    .selectAll()
    .where('id', '=', connectionId)
    .where('is_enabled', '=', 1)
    .executeTakeFirst();

  if (!connection) {
    return { ok: false, status: 400, error: 'Selected model connection is unavailable' };
  }

  const meta = await db
    .selectFrom('models_metadata')
    .selectAll()
    .where('connection_id', '=', connectionId)
    .where('provider_model_id', '=', providerModelId)
    .executeTakeFirst();

  if (meta) {
    if (Number(meta.is_deleted) === 1) {
      return { ok: false, status: 404, error: 'Selected model has been deleted' };
    }
    if (Number(meta.is_hidden) === 1) {
      return { ok: false, status: 404, error: 'Selected model is hidden' };
    }
    if (meta.visibility === 'private' && userRole !== 'admin') {
      return { ok: false, status: 403, error: 'Access denied to private model' };
    }

    const kbLinks = await db
      .selectFrom('model_knowledge_bases')
      .select('knowledge_base_id')
      .where('model_metadata_id', '=', meta.id)
      .execute();

    return {
      ok: true,
      connection,
      metadata: meta,
      knowledgeBaseIds: kbLinks.map((k) => k.knowledge_base_id),
    };
  }

  // If no metadata row exists yet, verify it is in cached models or allow if cache empty
  const cached = parseCachedModels(connection.cached_models_json);
  if (cached.length > 0 && !cached.some((c) => c.id === providerModelId)) {
    return { ok: false, status: 404, error: 'Selected model was not found on this connection' };
  }

  return {
    ok: true,
    connection,
    metadata: null,
    knowledgeBaseIds: [],
  };
}
