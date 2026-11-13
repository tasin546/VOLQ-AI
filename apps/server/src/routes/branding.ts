import { fileTypeFromBuffer } from 'file-type';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import {
  type BrandingSettings,
  type DatabaseContext,
  DEFAULT_BRANDING,
  getSetting,
  setSetting,
} from '../db/index.js';
import { sanitizeSvg, SvgSanitizationError } from '../lib/svgSanitize.js';
import { makeAuthMiddleware } from '../middleware/auth.js';

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

const ALLOWED_RASTER_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

const updateBrandingSchema = z.object({
  siteName: z.string().trim().min(1).max(60).optional(),
  logoMode: z.enum(['default', 'upload', 'icon']).optional(),
  iconName: z.string().trim().min(1).max(50).optional(),
  iconColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Icon color must be a valid hex color')
    .optional(),
  defaultTheme: z.enum(['dark', 'amoled', 'light', 'system']).optional(),
  resetToDefault: z.boolean().optional(),
});

const kindParamSchema = z.object({
  kind: z.enum(['logo', 'favicon']),
});

async function validateAndNormalizeLogoBuffer(
  filename: string,
  buffer: Buffer
): Promise<{ mimeType: string; data: Buffer }> {
  if (buffer.length === 0) {
    throw new SvgSanitizationError('Uploaded image is empty');
  }
  if (buffer.length > MAX_LOGO_BYTES) {
    throw new SvgSanitizationError('Logo file exceeds 2 MB maximum size');
  }

  let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;
  try {
    detected = await fileTypeFromBuffer(buffer);
  } catch {
    throw new SvgSanitizationError('Invalid image header');
  }

  if (detected) {
    if (ALLOWED_RASTER_MIMES.has(detected.mime)) {
      return { mimeType: detected.mime, data: buffer };
    }
    if (detected.mime === 'application/xml' || detected.mime === 'text/xml') {
      const sanitized = sanitizeSvg(buffer.toString('utf8'));
      return { mimeType: 'image/svg+xml', data: Buffer.from(sanitized, 'utf8') };
    }
    throw new SvgSanitizationError(`Unsupported logo image format: ${detected.mime}`);
  }

  const ext = filename.toLowerCase();
  const text = buffer.toString('utf8');
  if (ext.endsWith('.svg') || /<svg[\s>]/i.test(text)) {
    const sanitized = sanitizeSvg(text);
    return { mimeType: 'image/svg+xml', data: Buffer.from(sanitized, 'utf8') };
  }

  throw new SvgSanitizationError(
    'Unsupported image format. Allowed: SVG, PNG, JPG, WEBP, ICO.'
  );
}

export function registerBrandingRoutes(
  app: FastifyInstance,
  ctx: DatabaseContext,
  config: AppConfig
): void {
  const { authenticate, verifyCsrf, requireAdmin } = makeAuthMiddleware(ctx.db, config);

  app.get('/api/branding', async (_req, reply) => {
    const branding = await getSetting<BrandingSettings>(ctx.db, 'branding', DEFAULT_BRANDING);
    reply.header('Cache-Control', 'no-cache');
    return { branding };
  });

  app.get('/api/branding/asset/:kind', async (req, reply) => {
    const { kind } = kindParamSchema.parse(req.params);

    let asset = await ctx.db
      .selectFrom('branding_assets')
      .selectAll()
      .where('id', '=', kind)
      .executeTakeFirst();

    if (!asset && kind === 'favicon') {
      asset = await ctx.db
        .selectFrom('branding_assets')
        .selectAll()
        .where('id', '=', 'logo')
        .executeTakeFirst();
    }

    if (!asset) {
      return reply.code(404).send({ error: 'Branding asset not found' });
    }

    const buf = Buffer.isBuffer(asset.data) ? asset.data : Buffer.from(asset.data);
    reply.header('Content-Type', asset.mime_type);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'public, max-age=3600');
    if (asset.mime_type === 'image/svg+xml') {
      reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
    return reply.send(buf);
  });

  app.get('/manifest.webmanifest', async (_req, reply) => {
    const branding = await getSetting<BrandingSettings>(ctx.db, 'branding', DEFAULT_BRANDING);
    reply.header('Content-Type', 'application/manifest+json; charset=utf-8');
    return JSON.stringify({
      name: branding.siteName,
      short_name: branding.siteName,
      start_url: '/',
      display: 'standalone',
      background_color: '#050506',
      theme_color: '#050506',
      icons: branding.hasFavicon || branding.hasUploadedLogo
        ? [
            {
              src: `/api/branding/asset/favicon?v=${branding.assetVersion}`,
              sizes: 'any',
            },
          ]
        : [],
    });
  });

  app.put(
    '/api/admin/branding',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req) => {
      const body = updateBrandingSchema.parse(req.body);

      if (body.resetToDefault) {
        await ctx.db.deleteFrom('branding_assets').execute();
        const reset: BrandingSettings = {
          ...DEFAULT_BRANDING,
          assetVersion: Date.now(),
        };
        await setSetting(ctx.db, 'branding', reset);
        return { branding: reset };
      }

      const current = await getSetting<BrandingSettings>(ctx.db, 'branding', DEFAULT_BRANDING);
      const next: BrandingSettings = {
        siteName: body.siteName ?? current.siteName,
        logoMode: body.logoMode ?? current.logoMode,
        iconName: body.iconName ?? current.iconName,
        iconColor: body.iconColor ?? current.iconColor,
        hasUploadedLogo: current.hasUploadedLogo,
        hasFavicon: current.hasFavicon,
        defaultTheme: body.defaultTheme ?? current.defaultTheme,
        assetVersion: current.assetVersion + 1,
      };
      await setSetting(ctx.db, 'branding', next);
      return { branding: next };
    }
  );

  app.post(
    '/api/admin/branding/:kind',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req, reply) => {
      const { kind } = kindParamSchema.parse(req.params);
      const part = await req.file({ limits: { fileSize: MAX_LOGO_BYTES } });
      if (!part) {
        return reply.code(400).send({ error: 'No image file provided' });
      }

      const buffer = await part.toBuffer();
      let normalized: { mimeType: string; data: Buffer };
      try {
        normalized = await validateAndNormalizeLogoBuffer(part.filename, buffer);
      } catch (err) {
        if (err instanceof SvgSanitizationError) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }

      const now = new Date().toISOString();
      await ctx.db
        .insertInto('branding_assets')
        .values({
          id: kind,
          mime_type: normalized.mimeType,
          data: normalized.data,
          updated_at: now,
        })
        .onConflict((oc) =>
          oc.column('id').doUpdateSet({
            mime_type: normalized.mimeType,
            data: normalized.data,
            updated_at: now,
          })
        )
        .execute();

      const current = await getSetting<BrandingSettings>(ctx.db, 'branding', DEFAULT_BRANDING);
      const next: BrandingSettings = {
        ...current,
        ...(kind === 'logo' ? { logoMode: 'upload', hasUploadedLogo: true } : { hasFavicon: true }),
        assetVersion: Date.now(),
      };
      await setSetting(ctx.db, 'branding', next);

      return { branding: next };
    }
  );
}
