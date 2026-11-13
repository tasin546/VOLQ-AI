import { type Kysely, sql } from 'kysely';
import {
  type DatabaseSchema,
  DEFAULT_ATTACHMENT_LIMITS,
  DEFAULT_BRANDING,
  DEFAULT_EMAIL_SETTINGS,
  DEFAULT_KNOWLEDGE_CONFIG,
  DEFAULT_SKILLS_LIMITS,
  DEFAULT_SSRF_POLICY,
  DEFAULT_STARTER_PROMPTS,
  DEFAULT_USAGE_LIMITS_POLICY,
  DEFAULT_VOICE_SETTINGS,
  DEFAULT_WELCOME_SETTINGS,
} from './schema.js';

export type DbDialect = 'sqlite' | 'postgres';

async function executeStatements(
  db: Kysely<DatabaseSchema>,
  statements: string[]
): Promise<void> {
  for (const statement of statements) {
    const trimmed = statement.trim();
    if (!trimmed) continue;
    await sql.raw(trimmed).execute(db);
  }
}

async function ensureMigrationsTable(
  db: Kysely<DatabaseSchema>,
  dialect: DbDialect
): Promise<void> {
  if (dialect === 'postgres') {
    await sql
      .raw(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          applied_at TEXT NOT NULL
        )`
      )
      .execute(db);
  } else {
    await sql
      .raw(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          applied_at TEXT NOT NULL
        )`
      )
      .execute(db);
  }
}

async function applyInitMigration(
  db: Kysely<DatabaseSchema>,
  _dialect: DbDialect
): Promise<void> {
  await executeStatements(db, [
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
      is_active INTEGER NOT NULL DEFAULT 1,
      preferences_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      csrf_token TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`,
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('ollama', 'openai_compatible')),
      base_url TEXT NOT NULL,
      encrypted_api_key TEXT,
      api_key_hint TEXT,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      cached_models_json TEXT NOT NULL DEFAULT '[]',
      models_updated_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      connection_id TEXT REFERENCES connections(id) ON DELETE SET NULL,
      model_id TEXT,
      system_prompt TEXT NOT NULL DEFAULT '',
      temperature DOUBLE PRECISION,
      max_tokens INTEGER,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_chats_user_updated ON chats(user_id, is_pinned DESC, updated_at DESC)`,
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      images_json TEXT NOT NULL DEFAULT '[]',
      model_id TEXT,
      connection_id TEXT,
      status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('streaming', 'completed', 'stopped', 'error')),
      error_message TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at ASC)`,
    `CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      command TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_prompts_user ON prompts(user_id, title ASC)`,
  ]);
}

async function ensureMessagesSourcesColumn(
  db: Kysely<DatabaseSchema>,
  dialect: DbDialect
): Promise<void> {
  if (dialect === 'postgres') {
    await sql
      .raw(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS sources_json TEXT NOT NULL DEFAULT '[]'`)
      .execute(db);
    return;
  }

  const cols = await sql<{ name: string }>`PRAGMA table_info(messages)`.execute(db);
  const hasSources = cols.rows.some((c) => c.name === 'sources_json');
  if (!hasSources) {
    await sql
      .raw(`ALTER TABLE messages ADD COLUMN sources_json TEXT NOT NULL DEFAULT '[]'`)
      .execute(db);
  }
}

async function applyUpgradeMigration(
  db: Kysely<DatabaseSchema>,
  dialect: DbDialect,
  hasVector: boolean
): Promise<void> {
  await ensureMessagesSourcesColumn(db, dialect);

  const blobType = dialect === 'postgres' ? 'BYTEA' : 'BLOB';
  const floatType = dialect === 'postgres' ? 'DOUBLE PRECISION' : 'REAL';

  await executeStatements(db, [
    `CREATE TABLE IF NOT EXISTS models_metadata (
      id TEXT PRIMARY KEY,
      connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
      provider_model_id TEXT NOT NULL,
      display_name TEXT,
      description TEXT NOT NULL DEFAULT '',
      icon TEXT,
      visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
      is_hidden INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      system_prompt TEXT NOT NULL DEFAULT '',
      default_temperature ${floatType},
      default_max_tokens INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (connection_id, provider_model_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_models_metadata_conn ON models_metadata(connection_id)`,
    `CREATE TABLE IF NOT EXISTS knowledge_bases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      system_prompt TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS knowledge_files (
      id TEXT PRIMARY KEY,
      knowledge_base_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      file_data ${blobType} NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'ready', 'failed')),
      error_message TEXT,
      chunk_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_knowledge_files_kb ON knowledge_files(knowledge_base_id, created_at DESC)`,
    `CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id TEXT PRIMARY KEY,
      knowledge_base_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
      file_id TEXT NOT NULL REFERENCES knowledge_files(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      token_estimate INTEGER NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_kb ON knowledge_chunks(knowledge_base_id)`,
    `CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_file ON knowledge_chunks(file_id)`,
    `CREATE TABLE IF NOT EXISTS model_knowledge_bases (
      model_metadata_id TEXT NOT NULL REFERENCES models_metadata(id) ON DELETE CASCADE,
      knowledge_base_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
      PRIMARY KEY (model_metadata_id, knowledge_base_id)
    )`,
    `CREATE TABLE IF NOT EXISTS branding_assets (
      id TEXT PRIMARY KEY CHECK (id IN ('logo', 'favicon')),
      mime_type TEXT NOT NULL,
      data ${blobType} NOT NULL,
      updated_at TEXT NOT NULL
    )`,
  ]);

  if (dialect === 'sqlite') {
    await executeStatements(db, [
      `CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
        chunk_id UNINDEXED,
        knowledge_base_id UNINDEXED,
        content
      )`,
    ]);
  } else {
    await executeStatements(db, [
      `ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS content_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED`,
      `CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_tsv ON knowledge_chunks USING GIN (content_tsv)`,
    ]);

    if (hasVector) {
      await executeStatements(db, [
        `CREATE TABLE IF NOT EXISTS knowledge_chunk_embeddings (
          chunk_id TEXT PRIMARY KEY REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
          model_id TEXT NOT NULL,
          embedding vector NOT NULL
        )`,
      ]);
    }
  }
}

async function applyFeatureUpgradeMigration(
  db: Kysely<DatabaseSchema>,
  dialect: DbDialect
): Promise<void> {
  const blobType = dialect === 'postgres' ? 'BYTEA' : 'BLOB';

  await executeStatements(db, [
    `CREATE TABLE IF NOT EXISTS user_avatars (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      mime_type TEXT NOT NULL,
      data ${blobType} NOT NULL,
      etag TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS oauth_providers (
      id TEXT PRIMARY KEY,
      is_enabled INTEGER NOT NULL DEFAULT 0,
      client_id TEXT NOT NULL DEFAULT '',
      encrypted_client_secret TEXT,
      scopes TEXT NOT NULL DEFAULT '',
      allow_signup INTEGER NOT NULL DEFAULT 1,
      default_role TEXT NOT NULL DEFAULT 'user' CHECK (default_role IN ('admin', 'user')),
      allowed_domains_json TEXT NOT NULL DEFAULT '[]',
      link_by_verified_email INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS oauth_identities (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      email TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (provider, provider_user_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_oauth_identities_user ON oauth_identities(user_id)`,
    `CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      connection_id TEXT,
      model_id TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      is_estimated INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_usage_events_user_created ON usage_events(user_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS user_usage_overrides (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      mode TEXT NOT NULL DEFAULT 'global' CHECK (mode IN ('global', 'custom', 'unlimited')),
      messages_enabled INTEGER NOT NULL DEFAULT 0,
      messages_limit INTEGER,
      messages_period TEXT NOT NULL DEFAULT 'day' CHECK (messages_period IN ('day', 'week', 'month')),
      tokens_enabled INTEGER NOT NULL DEFAULT 0,
      tokens_limit INTEGER,
      tokens_period TEXT NOT NULL DEFAULT 'day' CHECK (tokens_period IN ('day', 'week', 'month')),
      reset_before TEXT,
      updated_at TEXT NOT NULL
    )`,
  ]);
}

async function applyOnboardingMigration(
  db: Kysely<DatabaseSchema>,
  dialect: DbDialect
): Promise<void> {
  if (dialect === 'sqlite') {
    const cols = await sql<{ name: string }>`PRAGMA table_info(users)`.execute(db);
    const colNames = new Set(cols.rows.map((r) => r.name));
    if (!colNames.has('onboarding_completed_at')) {
      await sql`ALTER TABLE users ADD COLUMN onboarding_completed_at TEXT`.execute(db);
    }
  } else {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ`.execute(db);
  }

  // Backfill every existing user immediately so that existing accounts never see the setup modal
  await sql`UPDATE users SET onboarding_completed_at = CURRENT_TIMESTAMP WHERE onboarding_completed_at IS NULL`.execute(db);
}

async function applyFeaturesUpgradeMigration(
  db: Kysely<DatabaseSchema>,
  dialect: DbDialect
): Promise<void> {
  // 1. Column email_verified_at in users
  if (dialect === 'sqlite') {
    const cols = await sql<{ name: string }>`PRAGMA table_info(users)`.execute(db);
    const colNames = new Set(cols.rows.map((r) => r.name));
    if (!colNames.has('email_verified_at')) {
      await sql`ALTER TABLE users ADD COLUMN email_verified_at TEXT`.execute(db);
    }
  } else {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ`.execute(db);
  }

  // Backfill existing users as verified
  await sql`UPDATE users SET email_verified_at = CURRENT_TIMESTAMP WHERE email_verified_at IS NULL`.execute(db);

  // 2. email_verification_tokens table, skills, message_skills
  await executeStatements(db, [
    `CREATE TABLE IF NOT EXISTS email_verification_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_email_verification_token_hash ON email_verification_tokens(token_hash)`,
    `CREATE INDEX IF NOT EXISTS idx_email_verification_user_id ON email_verification_tokens(user_id)`,
    `CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      content TEXT NOT NULL,
      token_estimate INTEGER NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1,
      shared INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_skills_owner_slug ON skills(owner_user_id, slug)`,
    `CREATE TABLE IF NOT EXISTS message_skills (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_message_skills_message_id ON message_skills(message_id)`,
  ]);
}

export async function ensurePgVectorTable(
  db: Kysely<DatabaseSchema>,
  dialect: DbDialect,
  hasVector: boolean
): Promise<void> {
  if (dialect !== 'postgres' || !hasVector) return;
  await sql
    .raw(
      `CREATE TABLE IF NOT EXISTS knowledge_chunk_embeddings (
        chunk_id TEXT PRIMARY KEY REFERENCES knowledge_chunks(id) ON DELETE CASCADE,
        model_id TEXT NOT NULL,
        embedding vector NOT NULL
      )`
    )
    .execute(db);
}

async function seedDefaultSettings(db: Kysely<DatabaseSchema>): Promise<void> {
  const now = new Date().toISOString();
  const defaults: Array<{ key: string; value: unknown }> = [
    { key: 'signup_mode', value: 'open' },
    { key: 'starter_prompts', value: DEFAULT_STARTER_PROMPTS },
    { key: 'ssrf_policy', value: DEFAULT_SSRF_POLICY },
    { key: 'branding', value: DEFAULT_BRANDING },
    { key: 'global_system_prompt', value: '' },
    { key: 'knowledge_config', value: DEFAULT_KNOWLEDGE_CONFIG },
    { key: 'usage_limits_policy', value: DEFAULT_USAGE_LIMITS_POLICY },
    { key: 'welcome_settings', value: DEFAULT_WELCOME_SETTINGS },
    { key: 'email_settings', value: DEFAULT_EMAIL_SETTINGS },
    { key: 'attachment_limits', value: DEFAULT_ATTACHMENT_LIMITS },
    { key: 'skills_limits', value: DEFAULT_SKILLS_LIMITS },
    { key: 'voice_settings', value: DEFAULT_VOICE_SETTINGS },
  ];

  for (const item of defaults) {
    await db
      .insertInto('app_settings')
      .values({
        key: item.key,
        value_json: JSON.stringify(item.value),
        updated_at: now,
      })
      .onConflict((oc) => oc.column('key').doNothing())
      .execute();
  }
}

export async function runMigrations(
  db: Kysely<DatabaseSchema>,
  dialect: DbDialect,
  hasVector: boolean
): Promise<void> {
  await ensureMigrationsTable(db, dialect);

  const existing = await db.selectFrom('schema_migrations').select('name').execute();
  const applied = new Set(existing.map((r) => r.name));

  const migrations: Array<{
    name: string;
    run: (trx: Kysely<DatabaseSchema>) => Promise<void>;
  }> = [
    {
      name: '001_init.sql',
      run: (trx) => applyInitMigration(trx, dialect),
    },
    {
      name: '002_upgrade.sql',
      run: (trx) => applyUpgradeMigration(trx, dialect, hasVector),
    },
    {
      name: '003_modal_oauth_usage_avatars.sql',
      run: (trx) => applyFeatureUpgradeMigration(trx, dialect),
    },
    {
      name: '004_onboarding.sql',
      run: (trx) => applyOnboardingMigration(trx, dialect),
    },
    {
      name: '005_features_upgrade.sql',
      run: (trx) => applyFeaturesUpgradeMigration(trx, dialect),
    },
  ];

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    await db.transaction().execute(async (trx) => {
      await migration.run(trx);
      await trx
        .insertInto('schema_migrations')
        .values({
          name: migration.name,
          applied_at: new Date().toISOString(),
        })
        .execute();
    });
  }

  // Ensure pgvector embeddings table exists even if pgvector extension was enabled after 002 ran
  await ensurePgVectorTable(db, dialect, hasVector);
  await seedDefaultSettings(db);
}
