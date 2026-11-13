import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { type AppConfig, loadConfig } from './config.js';
import { createDatabase, type DatabaseContext } from './db/index.js';
import { type OAuthOverridesMap } from './lib/oauthProviders.js';
import { SsrfValidationError } from './lib/ssrf.js';
import { registerStaticWebRoutes } from './lib/staticServe.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerAvatarRoutes } from './routes/avatars.js';
import { registerBrandingRoutes } from './routes/branding.js';
import { registerChatRoutes } from './routes/chats.js';
import { registerEmailRoutes } from './routes/email.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerInfoRoutes } from './routes/info.js';
import { registerKnowledgeRoutes } from './routes/knowledge.js';
import { registerMeRoutes } from './routes/me.js';
import { registerModelRoutes } from './routes/models.js';
import { registerOAuthRoutes } from './routes/oauth.js';
import { registerPromptRoutes } from './routes/prompts.js';
import { registerSkillsRoutes } from './routes/skills.js';
import { registerUsageRoutes } from './routes/usage.js';

export interface BuildAppOptions {
  dbCtx?: DatabaseContext;
  config?: AppConfig;
  logger?: boolean;
  oauthOverrides?: OAuthOverridesMap;
  nowFn?: () => Date;
}

export async function buildApp(options: BuildAppOptions = {}): Promise<{
  app: FastifyInstance;
  dbCtx: DatabaseContext;
  config: AppConfig;
}> {
  const config = options.config ?? loadConfig();

  const app = Fastify({
    logger: options.logger ?? config.nodeEnv !== 'test',
    trustProxy: config.trustProxy,
    bodyLimit: 12 * 1024 * 1024,
  });

  const dbCtx =
    options.dbCtx ??
    (await createDatabase({
      databasePath: config.databasePath,
      databaseUrl: config.databaseUrl,
      databaseSsl: config.databaseSsl,
      logger: {
        info: (msg) => app.log.info(msg),
        warn: (msg) => app.log.warn(msg),
      },
    }));

  await app.register(cookie, {
    secret: config.sessionSecret,
  });

  await app.register(rateLimit, {
    global: false,
  });

  await app.register(multipart, {
    limits: {
      fileSize: config.maxUploadMb * 1024 * 1024,
      files: 5,
    },
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: err.issues[0]?.message ?? 'Invalid request payload',
        details: err.flatten(),
      });
    }
    if (err instanceof SsrfValidationError) {
      return reply.code(400).send({ error: err.message });
    }
    const statusCode =
      typeof err === 'object' &&
      err !== null &&
      'statusCode' in err &&
      typeof err.statusCode === 'number'
        ? err.statusCode
        : 500;
    if (statusCode === 413) {
      return reply.code(413).send({
        error: `Uploaded file exceeds maximum allowed size (${config.maxUploadMb} MB)`,
      });
    }
    if (statusCode === 429) {
      return reply.code(429).send({ error: 'Too many requests, please try again later' });
    }
    if (statusCode >= 400 && statusCode < 500) {
      const msg = err instanceof Error ? err.message : 'Bad request';
      return reply.code(statusCode).send({ error: msg });
    }
    app.log.error(err);
    return reply.code(500).send({ error: 'Internal server error' });
  });

  registerHealthRoutes(app, dbCtx);
  registerInfoRoutes(app, dbCtx);
  registerBrandingRoutes(app, dbCtx, config);
  registerAuthRoutes(app, dbCtx.db, config);
  registerOAuthRoutes(app, dbCtx.db, config, options.oauthOverrides);
  registerAvatarRoutes(app, dbCtx.db, config);
  registerMeRoutes(app, dbCtx.db, config);
  registerUsageRoutes(app, dbCtx.db, config, options.nowFn);
  registerAdminRoutes(app, dbCtx, config);
  registerEmailRoutes(app, dbCtx.db, config);
  registerKnowledgeRoutes(app, dbCtx, config);
  registerModelRoutes(app, dbCtx.db, config);
  registerPromptRoutes(app, dbCtx.db, config);
  registerSkillsRoutes(app, dbCtx.db, config);
  registerChatRoutes(app, dbCtx, config, options.nowFn);

  if (config.serveWebDist) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const candidates = [
      path.resolve(__dirname, '../../../apps/web/dist'),
      path.resolve(__dirname, '../../web/dist'),
    ];
    const matched = candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html')));
    if (matched) {
      registerStaticWebRoutes(app, dbCtx, matched);
    }
  }

  return { app, dbCtx, config };
}
