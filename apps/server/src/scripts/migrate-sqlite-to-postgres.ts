import fs from 'node:fs';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { createDatabase, type DatabaseSchema } from '../db/index.js';

export interface MigrateOptions {
  sqlitePath: string;
  postgresUrl: string;
  postgresSsl?: boolean;
  dryRun: boolean;
}

const ORDERED_TABLES = [
  'users',
  'sessions',
  'app_settings',
  'connections',
  'models_metadata',
  'knowledge_bases',
  'knowledge_files',
  'knowledge_chunks',
  'model_knowledge_bases',
  'branding_assets',
  'chats',
  'messages',
  'prompts',
  'user_avatars',
  'oauth_providers',
  'oauth_identities',
  'usage_events',
  'user_usage_overrides',
] as const;

export async function migrateSqliteToPostgres(opts: MigrateOptions): Promise<{
  counts: Record<string, number>;
  dryRun: boolean;
}> {
  if (!fs.existsSync(opts.sqlitePath)) {
    throw new Error(`SQLite database file not found at ${opts.sqlitePath}`);
  }

  const rawSqlite = new Database(opts.sqlitePath, { readonly: true });
  const sqliteDb = new Kysely<DatabaseSchema>({
    dialect: new SqliteDialect({ database: rawSqlite }),
  });

  const existingTablesRows = rawSqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all() as Array<{ name: string }>;
  const existingTables = new Set(existingTablesRows.map((r) => r.name));

  const pgCtx = await createDatabase({
    databaseUrl: opts.postgresUrl,
    databaseSsl: opts.postgresSsl,
  });

  const counts: Record<string, number> = {};

  try {
    for (const table of ORDERED_TABLES) {
      if (!existingTables.has(table)) {
        counts[table] = 0;
        continue;
      }
      const rows = await sqliteDb.selectFrom(table).selectAll().execute();
      counts[table] = rows.length;
    }

    if (opts.dryRun) {
      return { counts, dryRun: true };
    }

    await pgCtx.db.transaction().execute(async (trx) => {
      for (const table of ORDERED_TABLES) {
        if (!existingTables.has(table)) continue;
        const rows = await sqliteDb.selectFrom(table).selectAll().execute();
        if (rows.length === 0) continue;

        for (const row of rows) {
          const record = { ...(row as Record<string, unknown>) };
          if (table === 'messages' && !('sources_json' in record)) {
            record.sources_json = '[]';
          }
          await trx
            .insertInto(table)
            .values(record as never)
            .onConflict((oc) => oc.doNothing())
            .execute();
        }
      }
    });

    return { counts, dryRun: false };
  } finally {
    await sqliteDb.destroy();
    await pgCtx.close();
  }
}

async function runCli() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run') || !args.includes('--apply');
  const sqliteArgIdx = args.indexOf('--sqlite');
  const sqlitePath =
    (sqliteArgIdx >= 0 ? args[sqliteArgIdx + 1] : undefined) ??
    process.env.DATABASE_PATH ??
    './data/volq.db';
  const postgresUrl = process.env.DATABASE_URL?.trim() ?? '';

  if (!postgresUrl) {
    console.error('Error: DATABASE_URL environment variable must be set to target PostgreSQL.');
    process.exit(1);
  }

  console.log(
    `VOLQ AI SQLite -> PostgreSQL migration (${dryRun ? 'DRY RUN (pass --apply to write)' : 'APPLY'})`
  );
  console.log(`Source SQLite (read-only): ${sqlitePath}`);

  const result = await migrateSqliteToPostgres({
    sqlitePath,
    postgresUrl,
    postgresSsl: process.env.DATABASE_SSL === 'true',
    dryRun,
  });

  for (const [table, count] of Object.entries(result.counts)) {
    console.log(`  ${table}: ${count} row(s)`);
  }

  console.log(
    result.dryRun
      ? 'Dry run complete. Re-run with --apply to copy rows into PostgreSQL.'
      : 'Migration complete. Source SQLite database was left unmodified.'
  );
}

const isEntrypoint =
  process.argv[1]?.endsWith('migrate-sqlite-to-postgres.ts') ||
  process.argv[1]?.endsWith('migrate-sqlite-to-postgres.js');

if (isEntrypoint) {
  runCli().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
