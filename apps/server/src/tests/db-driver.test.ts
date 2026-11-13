import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createDatabase } from '../db/index.js';

describe('database driver switching and backward-compatible SQLite upgrade', () => {
  it('selects SQLite when DATABASE_URL is unset and reports /healthz', async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_PATH: ':memory:',
      SESSION_SECRET: 'test-session-secret-00000000000000',
      ENCRYPTION_KEY: 'test-encryption-key-00000000000000',
    });
    expect(config.databaseUrl).toBeNull();

    const { app, dbCtx } = await buildApp({ config, logger: false });
    expect(dbCtx.dialect).toBe('sqlite');

    const healthz = await app.inject({ method: 'GET', url: '/healthz' });
    expect(healthz.statusCode).toBe(200);
    expect(healthz.json()).toEqual({ status: 'ok', driver: 'sqlite', pgvector: false });

    await app.close();
    await dbCtx.close();
  });

  it('upgrades an existing 001_init.sql SQLite database without losing existing rows', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'volq-upgrade-'));
    const dbFile = path.join(tmpDir, 'legacy.db');

    const legacy = new Database(dbFile);
    const initSql = fs.readFileSync(
      path.resolve(process.cwd(), 'src/db/migrations/001_init.sql'),
      'utf8'
    );
    legacy.exec(initSql);
    const now = new Date().toISOString();
    legacy
      .prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)')
      .run('001_init.sql', now);
    legacy
      .prepare(
        `INSERT INTO users (id, email, display_name, password_hash, role, is_active, preferences_json, created_at, updated_at)
         VALUES ('u1', 'legacy@volq.local', 'Legacy Admin', 'hash', 'admin', 1, '{}', ?, ?)`
      )
      .run(now, now);
    legacy
      .prepare(
        `INSERT INTO chats (id, user_id, title, created_at, updated_at)
         VALUES ('c1', 'u1', 'Existing Chat', ?, ?)`
      )
      .run(now, now);
    legacy
      .prepare(
        `INSERT INTO messages (id, chat_id, role, content, created_at)
         VALUES ('m1', 'c1', 'user', 'Preserved message', ?)`
      )
      .run(now);
    legacy.close();

    const ctx = await createDatabase({ databasePath: dbFile });
    const migrations = await ctx.db
      .selectFrom('schema_migrations')
      .select('name')
      .orderBy('id', 'asc')
      .execute();
    expect(migrations.map((m) => m.name)).toEqual([
      '001_init.sql',
      '002_upgrade.sql',
      '003_modal_oauth_usage_avatars.sql',
      '004_onboarding.sql',
      '005_features_upgrade.sql',
    ]);

    const newTables = ctx.rawSqlite!
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('user_avatars','oauth_providers','oauth_identities','usage_events','user_usage_overrides','email_verification_tokens','skills','message_skills')"
      )
      .all() as Array<{ name: string }>;
    expect(newTables).toHaveLength(8);

    const msg = await ctx.db
      .selectFrom('messages')
      .select(['content', 'sources_json'])
      .where('id', '=', 'm1')
      .executeTakeFirstOrThrow();
    expect(msg.content).toBe('Preserved message');
    expect(msg.sources_json).toBe('[]');

    await ctx.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('parses DATABASE_URL and DATABASE_SSL cleanly without leaking into health responses', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://volq:secretpass@db.example.com:5432/volq?sslmode=require',
      DATABASE_SSL: 'true',
      MAX_UPLOAD_MB: '30',
      TRUST_PROXY: 'true',
    });

    expect(config.databaseUrl).toContain('db.example.com');
    expect(config.databaseSsl).toBe(true);
    expect(config.maxUploadMb).toBe(30);
    expect(config.trustProxy).toBe(true);
  });
});
