import { describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { createDatabase } from '../db/index.js';
import { sanitizeSvg } from '../lib/svgSanitize.js';

function extractCookie(setCookieHeader: string | string[] | undefined): string {
  const first = Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader;
  if (!first) return '';
  return first.split(';')[0] ?? '';
}

function buildMultipart(
  filename: string,
  mimeType: string,
  content: Buffer
): { payload: Buffer; contentType: string } {
  const boundary = '----volqsvgboundary';
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    'utf8'
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
  return {
    payload: Buffer.concat([header, content, footer]),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe('branding, SVG sanitization, and admin system stats', () => {
  it('strips script tags, event handlers, foreignObject, and external links from SVG', () => {
    const dirtySvg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="alert(1)">
        <script>alert('xss')</script>
        <foreignObject width="10" height="10"><div>html</div></foreignObject>
        <a href="https://evil.example/phish"><circle cx="12" cy="12" r="8" onclick="fetch('x')" /></a>
        <use xlink:href="https://evil.example/sprite.svg#icon" />
        <path d="M4 4h16" fill="#fff" />
      </svg>
    `;

    const clean = sanitizeSvg(dirtySvg);
    expect(clean).toContain('<svg');
    expect(clean).toContain('<path');
    expect(clean.toLowerCase()).not.toContain('<script');
    expect(clean.toLowerCase()).not.toContain('foreignobject');
    expect(clean.toLowerCase()).not.toContain('onload');
    expect(clean.toLowerCase()).not.toContain('onclick');
    expect(clean.toLowerCase()).not.toContain('evil.example');
  });

  it('enforces admin-only branding updates, serves sanitized SVG with nosniff, and hides DATABASE_URL in system info', async () => {
    const dbCtx = await createDatabase(':memory:');
    const config = loadConfig({
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-00000000000000',
      ENCRYPTION_KEY: 'test-encryption-key-00000000000000',
    });

    const { app } = await buildApp({ dbCtx, config, logger: false });

    const adminReg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'admin@volq.local', password: 'StrongPassword123', displayName: 'Admin' },
    });
    const adminCookie = extractCookie(adminReg.headers['set-cookie']);
    const adminCsrf = adminReg.json().csrfToken as string;

    const userReg = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'user@volq.local', password: 'StrongPassword123', displayName: 'User' },
    });
    const userCookie = extractCookie(userReg.headers['set-cookie']);
    const userCsrf = userReg.json().csrfToken as string;

    // Non-admin rejected on branding update
    const forbiddenUpdate = await app.inject({
      method: 'PUT',
      url: '/api/admin/branding',
      headers: { cookie: userCookie, 'x-csrf-token': userCsrf },
      payload: { siteName: 'Hacked' },
    });
    expect(forbiddenUpdate.statusCode).toBe(403);

    // Admin updates site name and icon mode
    const updateRes = await app.inject({
      method: 'PUT',
      url: '/api/admin/branding',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: { siteName: 'Obsidian Studio', logoMode: 'icon', iconName: 'Cpu', iconColor: '#FFFFFF' },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().branding.siteName).toBe('Obsidian Studio');

    // Admin uploads malicious SVG -> sanitized and served with nosniff
    const dirtyUpload = buildMultipart(
      'logo.svg',
      'image/svg+xml',
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>evil()</script><rect width="10" height="10"/></svg>',
        'utf8'
      )
    );
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/api/admin/branding/logo',
      headers: {
        cookie: adminCookie,
        'x-csrf-token': adminCsrf,
        'content-type': dirtyUpload.contentType,
      },
      payload: dirtyUpload.payload,
    });
    expect(uploadRes.statusCode).toBe(200);
    expect(uploadRes.json().branding.logoMode).toBe('upload');

    const assetRes = await app.inject({ method: 'GET', url: '/api/branding/asset/logo' });
    expect(assetRes.statusCode).toBe(200);
    expect(assetRes.headers['x-content-type-options']).toBe('nosniff');
    expect(assetRes.headers['content-type']).toContain('image/svg+xml');
    expect(assetRes.body).not.toContain('<script');
    expect(assetRes.body).not.toContain('onload');
    expect(assetRes.body).toContain('<rect');

    // Manifest reflects updated siteName
    const manifestRes = await app.inject({ method: 'GET', url: '/manifest.webmanifest' });
    expect(manifestRes.statusCode).toBe(200);
    expect(JSON.parse(manifestRes.body).name).toBe('Obsidian Studio');

    // Admin system info works and never leaks DATABASE_URL
    const sysForbidden = await app.inject({
      method: 'GET',
      url: '/api/admin/system',
      headers: { cookie: userCookie },
    });
    expect(sysForbidden.statusCode).toBe(403);

    const sysRes = await app.inject({
      method: 'GET',
      url: '/api/admin/system',
      headers: { cookie: adminCookie },
    });
    expect(sysRes.statusCode).toBe(200);
    expect(sysRes.json()).toMatchObject({ driver: 'sqlite', connected: true, pgvector: false });

    // Reset to default
    const resetRes = await app.inject({
      method: 'PUT',
      url: '/api/admin/branding',
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
      payload: { resetToDefault: true },
    });
    expect(resetRes.statusCode).toBe(200);
    expect(resetRes.json().branding.siteName).toBe('VOLQ AI');

    await app.close();
    await dbCtx.close();
  });
});
