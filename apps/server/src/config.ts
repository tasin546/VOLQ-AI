import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const optionalBool = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_PATH: z.string().default('./data/volq.db'),
  DATABASE_URL: z.string().optional(),
  DATABASE_SSL: optionalBool,
  SESSION_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  COOKIE_SECURE: optionalBool,
  TRUST_PROXY: optionalBool,
  SERVE_WEB_DIST: optionalBool,
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(25),
  APP_ORIGIN: z.string().default('http://localhost:3000'),
  APP_BASE_URL: z.string().optional(),
  DEFAULT_OLLAMA_URL: z.string().default('http://localhost:11434'),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
  databasePath: string;
  databaseUrl: string | null;
  databaseSsl: boolean;
  sessionSecret: string;
  encryptionKey: string;
  cookieSecure: boolean;
  trustProxy: boolean;
  serveWebDist: boolean;
  maxUploadMb: number;
  appOrigin: string;
  appBaseUrl: string | null;
  defaultOllamaUrl: string;
}

function loadOrCreateDevSecrets(databasePath: string): {
  sessionSecret: string;
  encryptionKey: string;
} {
  const dir = path.dirname(path.resolve(databasePath));
  const secretsPath = path.join(dir, '.dev-secrets.json');
  try {
    if (fs.existsSync(secretsPath)) {
      const parsed = JSON.parse(fs.readFileSync(secretsPath, 'utf8')) as {
        sessionSecret?: string;
        encryptionKey?: string;
      };
      if (
        typeof parsed.sessionSecret === 'string' &&
        parsed.sessionSecret.length >= 32 &&
        typeof parsed.encryptionKey === 'string' &&
        parsed.encryptionKey.length >= 32
      ) {
        return {
          sessionSecret: parsed.sessionSecret,
          encryptionKey: parsed.encryptionKey,
        };
      }
    }
  } catch {
    // regenerate if corrupt
  }

  const generated = {
    sessionSecret: crypto.randomBytes(32).toString('hex'),
    encryptionKey: crypto.randomBytes(32).toString('hex'),
  };
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(secretsPath, JSON.stringify(generated, null, 2), { mode: 0o600 });
  } catch {
    // non-fatal if directory is read-only
  }
  return generated;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  const isProd = parsed.NODE_ENV === 'production';

  let sessionSecret = parsed.SESSION_SECRET?.trim() ?? '';
  let encryptionKey = parsed.ENCRYPTION_KEY?.trim() ?? '';

  if (isProd) {
    if (sessionSecret.length < 16) {
      throw new Error('SESSION_SECRET must be set to at least 16 characters in production');
    }
    if (encryptionKey.length < 16) {
      throw new Error('ENCRYPTION_KEY must be set to at least 16 characters in production');
    }
  } else if ((!sessionSecret || !encryptionKey) && parsed.NODE_ENV !== 'test' && parsed.DATABASE_PATH !== ':memory:') {
    const devSecrets = loadOrCreateDevSecrets(parsed.DATABASE_PATH);
    if (!sessionSecret) sessionSecret = devSecrets.sessionSecret;
    if (!encryptionKey) encryptionKey = devSecrets.encryptionKey;
  }

  const rawDatabaseUrl = parsed.DATABASE_URL?.trim() ?? '';
  const rawBaseUrl = parsed.APP_BASE_URL?.trim().replace(/\/+$/, '') ?? '';

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    host: parsed.HOST,
    databasePath: parsed.DATABASE_PATH,
    databaseUrl: rawDatabaseUrl.length > 0 ? rawDatabaseUrl : null,
    databaseSsl: parsed.DATABASE_SSL ?? false,
    sessionSecret: sessionSecret || crypto.randomBytes(32).toString('hex'),
    encryptionKey: encryptionKey || crypto.randomBytes(32).toString('hex'),
    cookieSecure: parsed.COOKIE_SECURE ?? false,
    trustProxy: parsed.TRUST_PROXY ?? isProd,
    serveWebDist: parsed.SERVE_WEB_DIST ?? isProd,
    maxUploadMb: parsed.MAX_UPLOAD_MB,
    appOrigin: parsed.APP_ORIGIN,
    appBaseUrl: rawBaseUrl.length > 0 ? rawBaseUrl : null,
    defaultOllamaUrl: parsed.DEFAULT_OLLAMA_URL,
  };
}
