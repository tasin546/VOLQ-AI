import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  type BrandingSettings,
  type DatabaseContext,
  DEFAULT_BRANDING,
  DEFAULT_WELCOME_SETTINGS,
  getSetting,
  type WelcomeSettings,
} from '../db/index.js';
import {
  OAUTH_PROVIDER_REGISTRY,
  type OAuthProviderId,
} from '../lib/oauthProviders.js';

export interface PublicAppInfo {
  siteName: string;
  tagline: string | null;
  logoUrl: string | null;
  defaultTheme: 'dark' | 'amoled' | 'light' | 'system';
  welcome: {
    enabled: boolean;
    headline: string | null;
    description: string | null;
  };
  openSignups: boolean;
  hasUsers: boolean;
  oauthProviders: Array<{
    id: string;
    displayName: string;
    iconKey: string;
  }>;
}

const infoRateLimit = {
  rateLimit: {
    max: 60,
    timeWindow: '1 minute',
  },
};

export function registerInfoRoutes(app: FastifyInstance, ctx: DatabaseContext): void {
  const db = ctx.db;

  app.get('/api/info', { config: infoRateLimit }, async (req, reply) => {
    const [branding, welcome, signupMode, userCountRow, oauthRows] = await Promise.all([
      getSetting<BrandingSettings>(db, 'branding', DEFAULT_BRANDING),
      getSetting<WelcomeSettings>(db, 'welcome_settings', DEFAULT_WELCOME_SETTINGS),
      getSetting<'open' | 'disabled'>(db, 'signup_mode', 'open'),
      db
        .selectFrom('users')
        .select(db.fn.countAll<number | string>().as('count'))
        .executeTakeFirstOrThrow(),
      db
        .selectFrom('oauth_providers')
        .select(['id', 'is_enabled', 'client_id', 'encrypted_client_secret'])
        .execute(),
    ]);

    const oauthMap = new Map(oauthRows.map((r) => [r.id, r]));
    const enabledProviders = (Object.keys(OAUTH_PROVIDER_REGISTRY) as OAuthProviderId[])
      .filter((id) => {
        const row = oauthMap.get(id);
        return (
          row &&
          Number(row.is_enabled) === 1 &&
          row.client_id.trim().length > 0 &&
          Boolean(row.encrypted_client_secret)
        );
      })
      .map((id) => {
        const def = OAUTH_PROVIDER_REGISTRY[id];
        return {
          id: def.id,
          displayName: def.displayName,
          iconKey: def.iconKey,
        };
      });

    const hasUsers = Number(userCountRow.count) > 0;
    const logoUrl =
      branding.hasUploadedLogo || branding.logoMode === 'upload'
        ? `/api/branding/asset/logo?v=${branding.assetVersion}`
        : null;

    const payload: PublicAppInfo = {
      siteName: branding.siteName,
      tagline: branding.tagline || null,
      logoUrl,
      defaultTheme: branding.defaultTheme,
      welcome: {
        enabled: welcome.enabled !== false,
        headline: welcome.headline ?? null,
        description: welcome.description ?? null,
      },
      openSignups: signupMode === 'open',
      hasUsers,
      oauthProviders: enabledProviders,
    };

    const json = JSON.stringify(payload);
    const etag = `"${crypto.createHash('sha256').update(json).digest('hex').slice(0, 16)}"`;

    if (req.headers['if-none-match'] === etag) {
      return reply.code(304).send();
    }

    reply.header('Content-Type', 'application/json; charset=utf-8');
    reply.header('ETag', etag);
    reply.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return reply.send(json);
  });
}
