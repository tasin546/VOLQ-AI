import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import {
  type BrandingSettings,
  type DatabaseContext,
  DEFAULT_BRANDING,
  getSetting,
} from '../db/index.js';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function registerStaticWebRoutes(
  app: FastifyInstance,
  ctx: DatabaseContext,
  webDistDir: string
): void {
  const distRoot = path.resolve(webDistDir);
  const indexPath = path.join(distRoot, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return;
  }

  const rawIndexHtml = fs.readFileSync(indexPath, 'utf8');

  app.setNotFoundHandler(async (req, reply) => {
    const reqPath = req.url.split('?')[0] ?? '/';
    if (
      reqPath.startsWith('/api/') ||
      reqPath === '/api' ||
      reqPath === '/healthz' ||
      reqPath === '/manifest.webmanifest'
    ) {
      return reply.code(404).send({ error: 'Not found' });
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return reply.code(404).send({ error: 'Not found' });
    }

    const cleanRel = reqPath.replace(/^\/+/, '');
    if (cleanRel) {
      const candidate = path.resolve(distRoot, cleanRel);
      if (
        candidate.startsWith(distRoot + path.sep) &&
        fs.existsSync(candidate) &&
        fs.statSync(candidate).isFile()
      ) {
        const ext = path.extname(candidate).toLowerCase();
        reply.header('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
        reply.header(
          'Cache-Control',
          cleanRel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'
        );
        return reply.send(fs.createReadStream(candidate));
      }
    }

    const branding = await getSetting<BrandingSettings>(ctx.db, 'branding', DEFAULT_BRANDING);
    const html = rawIndexHtml.replace(
      /<title>.*?<\/title>/i,
      `<title>${escapeHtml(branding.siteName)}</title>`
    );
    reply.header('Content-Type', 'text/html; charset=utf-8');
    reply.header('Cache-Control', 'no-cache');
    return reply.send(html);
  });
}
