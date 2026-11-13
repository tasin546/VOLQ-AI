import type { FastifyInstance } from 'fastify';
import { checkDbHealth, type DatabaseContext } from '../db/index.js';

export function registerHealthRoutes(app: FastifyInstance, ctx: DatabaseContext): void {
  app.get('/api/health', async (_req, reply) => {
    const ok = await checkDbHealth(ctx);
    if (!ok) {
      return reply.code(503).send({ status: 'error', driver: ctx.dialect });
    }
    return { status: 'ok', service: 'volq-ai-server', driver: ctx.dialect };
  });

  app.get('/healthz', async (_req, reply) => {
    const ok = await checkDbHealth(ctx);
    if (!ok) {
      return reply.code(503).send({ status: 'error', driver: ctx.dialect });
    }
    return { status: 'ok', driver: ctx.dialect, pgvector: ctx.hasVector };
  });
}
