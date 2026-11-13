import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Kysely, PostgresDialect, SqliteDialect, sql } from 'kysely';
import pg from 'pg';
import pgvector from 'pgvector/pg';
import { type DbDialect, runMigrations } from './migrator.js';
import type { DatabaseSchema } from './schema.js';

export interface DatabaseContext {
  db: Kysely<DatabaseSchema>;
  dialect: DbDialect;
  hasVector: boolean;
  databasePath: string | null;
  rawPool: pg.Pool | null;
  rawSqlite: Database.Database | null;
  close: () => Promise<void>;
}

export interface CreateDatabaseOptions {
  databasePath?: string;
  databaseUrl?: string | null;
  databaseSsl?: boolean;
  logger?: { info: (msg: string) => void; warn: (msg: string) => void };
}

function shouldUseSsl(url: string, explicitSsl: boolean): boolean | { rejectUnauthorized: boolean } {
  if (explicitSsl) return { rejectUnauthorized: false };
  try {
    const parsed = new URL(url);
    const mode = parsed.searchParams.get('sslmode')?.toLowerCase();
    if (mode === 'require' || mode === 'verify-ca' || mode === 'verify-full') {
      return { rejectUnauthorized: false };
    }
    if (mode === 'disable') return false;
  } catch {
    // ignore URL parse errors here; pg.Pool will report cleanly
  }
  return false;
}

async function connectPostgresWithRetry(
  pool: pg.Pool,
  logger?: { info: (msg: string) => void; warn: (msg: string) => void }
): Promise<void> {
  const maxAttempts = 5;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = await pool.connect();
      client.release();
      return;
    } catch (err) {
      lastError = err;
      const delayMs = 400 * Math.pow(2, attempt - 1);
      logger?.warn(
        `PostgreSQL connection attempt ${attempt}/${maxAttempts} failed; retrying in ${delayMs}ms`
      );
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  const msg = lastError instanceof Error ? lastError.message : 'Unable to connect to PostgreSQL';
  throw new Error(`PostgreSQL startup connection failed: ${msg}`);
}

export async function createDatabase(
  input: string | CreateDatabaseOptions
): Promise<DatabaseContext> {
  const opts: CreateDatabaseOptions =
    typeof input === 'string' ? { databasePath: input } : input;
  const logger = opts.logger;
  const databaseUrl = opts.databaseUrl?.trim() ?? '';

  if (databaseUrl.length > 0) {
    const sslOption = shouldUseSsl(databaseUrl, opts.databaseSsl ?? false);
    const pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ...(sslOption ? { ssl: sslOption } : {}),
    });

    pool.on('connect', (client) => {
      void pgvector.registerTypes(client).catch(() => {});
    });

    await connectPostgresWithRetry(pool, logger);

    let hasVector = false;
    try {
      await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
      hasVector = true;
    } catch {
      logger?.warn(
        'pgvector extension is unavailable on this PostgreSQL instance; falling back to PostgreSQL full-text search'
      );
      hasVector = false;
    }

    const db = new Kysely<DatabaseSchema>({
      dialect: new PostgresDialect({ pool }),
    });

    await runMigrations(db, 'postgres', hasVector);
    logger?.info(`Connected to PostgreSQL storage (pgvector=${hasVector ? 'enabled' : 'disabled'})`);

    return {
      db,
      dialect: 'postgres',
      hasVector,
      databasePath: null,
      rawPool: pool,
      rawSqlite: null,
      close: async () => {
        await db.destroy();
      },
    };
  }

  const dbPath = opts.databasePath ?? './data/volq.db';
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const sqlite = new Database(dbPath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  const db = new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({ database: sqlite }),
  });

  await runMigrations(db, 'sqlite', false);

  return {
    db,
    dialect: 'sqlite',
    hasVector: false,
    databasePath: dbPath,
    rawPool: null,
    rawSqlite: sqlite,
    close: async () => {
      await db.destroy();
    },
  };
}

export async function getSetting<T>(
  db: Kysely<DatabaseSchema>,
  key: string,
  fallback: T
): Promise<T> {
  const row = await db
    .selectFrom('app_settings')
    .select('value_json')
    .where('key', '=', key)
    .executeTakeFirst();

  if (!row) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting<T>(
  db: Kysely<DatabaseSchema>,
  key: string,
  value: T
): Promise<void> {
  const now = new Date().toISOString();
  const valueJson = JSON.stringify(value);
  await db
    .insertInto('app_settings')
    .values({ key, value_json: valueJson, updated_at: now })
    .onConflict((oc) =>
      oc.column('key').doUpdateSet({
        value_json: valueJson,
        updated_at: now,
      })
    )
    .execute();
}

export async function checkDbHealth(ctx: DatabaseContext): Promise<boolean> {
  try {
    await sql`SELECT 1`.execute(ctx.db);
    return true;
  } catch {
    return false;
  }
}
