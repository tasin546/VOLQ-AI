import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { MAX_AVATAR_BYTES } from '../lib/avatars.js';

function extractCookie(h: string | string[] | undefined): string {
  const first = Array.isArray(h) ? h[0] : h;
  return first ? (first.split(';')[0] ?? '') : '';
}

function createTestConfig() {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_PATH: ':memory:',
    SESSION_SECRET: 'test-session-secret-00000000000000',
    ENCRYPTION_KEY: 'test-encryption-key-00000000000000',
  });
}

function buildMultipart(filename: string, mimeType: string, content: Buffer) {
  const boundary = '----VolqAvatarBoundary123';
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    boundary,
    payload: Buffer.concat([header, content, footer]),
  };
}

describe('avatar upload, EXIF stripping, magic-byte validation & RBAC', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()!();
    }
  });

  it('re-encodes uploaded image to 256x256 WEBP, strips EXIF/GPS, and enforces 5MB + format rules', async () => {
    const config = createTestConfig();
    const { app, dbCtx } = await buildApp({ config, logger: false });
    cleanups.push(async () => {
      await app.close();
      await dbCtx.close();
    });

    // Register admin & regular user
    const regAdmin = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'admin@volq.local', password: 'Password123!', displayName: 'Admin' },
    });
    expect(regAdmin.statusCode).toBe(201);
    const adminCookie = extractCookie(regAdmin.headers['set-cookie']);
    const adminCsrf = regAdmin.json().csrfToken as string;

    const regUser = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'user@volq.local', password: 'Password123!', displayName: 'User' },
    });
    expect(regUser.statusCode).toBe(201);
    const userId = regUser.json().user.id as string;
    const userCookie = extractCookie(regUser.headers['set-cookie']);
    const userCsrf = regUser.json().csrfToken as string;

    // Create JPEG with fake EXIF metadata
    const jpegWithExif = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 240, g: 120, b: 60 } },
    })
      .jpeg()
      .withMetadata({
        exif: {
          IFD0: {
            Make: 'SecretCameraBrand',
            ImageDescription: 'GPS_PRIVATE_MARKER',
          },
        },
      })
      .toBuffer();

    const validForm = buildMultipart('photo.jpg', 'image/jpeg', jpegWithExif);
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/api/me/avatar',
      headers: {
        cookie: userCookie,
        'x-csrf-token': userCsrf,
        'content-type': `multipart/form-data; boundary=${validForm.boundary}`,
      },
      payload: validForm.payload,
    });
    expect(uploadRes.statusCode).toBe(200);
    expect(uploadRes.json().hasAvatar).toBe(true);

    // Verify stored avatar is 256x256 webp, nosniff header, and has zero EXIF metadata
    const fetchRes = await app.inject({
      method: 'GET',
      url: `/api/users/${userId}/avatar`,
      headers: { cookie: userCookie },
    });
    expect(fetchRes.statusCode).toBe(200);
    expect(fetchRes.headers['content-type']).toBe('image/webp');
    expect(fetchRes.headers['x-content-type-options']).toBe('nosniff');
    expect(fetchRes.headers['etag']).toBeTruthy();

    const storedBuf = fetchRes.rawPayload;
    expect(storedBuf.toString('utf8')).not.toContain('SecretCameraBrand');
    expect(storedBuf.toString('utf8')).not.toContain('GPS_PRIVATE_MARKER');
    const storedMeta = await sharp(storedBuf).metadata();
    expect(storedMeta.format).toBe('webp');
    expect(storedMeta.width).toBe(256);
    expect(storedMeta.height).toBe(256);
    expect(storedMeta.exif).toBeUndefined();

    // Reject SVG upload
    const svgForm = buildMultipart(
      'evil.svg',
      'image/svg+xml',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    );
    const svgRes = await app.inject({
      method: 'POST',
      url: '/api/me/avatar',
      headers: {
        cookie: userCookie,
        'x-csrf-token': userCsrf,
        'content-type': `multipart/form-data; boundary=${svgForm.boundary}`,
      },
      payload: svgForm.payload,
    });
    expect(svgRes.statusCode).toBe(400);

    // Reject disguised non-image disguised as .png
    const fakeForm = buildMultipart('fake.png', 'image/png', Buffer.from('NOT_AN_IMAGE_PAYLOAD'));
    const fakeRes = await app.inject({
      method: 'POST',
      url: '/api/me/avatar',
      headers: {
        cookie: userCookie,
        'x-csrf-token': userCsrf,
        'content-type': `multipart/form-data; boundary=${fakeForm.boundary}`,
      },
      payload: fakeForm.payload,
    });
    expect(fakeRes.statusCode).toBe(400);

    // Reject 5 MB + 1 byte upload with HTTP 413
    const oversized = Buffer.alloc(MAX_AVATAR_BYTES + 1, 0x41);
    const bigForm = buildMultipart('huge.png', 'image/png', oversized);
    const bigRes = await app.inject({
      method: 'POST',
      url: '/api/me/avatar',
      headers: {
        cookie: userCookie,
        'x-csrf-token': userCsrf,
        'content-type': `multipart/form-data; boundary=${bigForm.boundary}`,
      },
      payload: bigForm.payload,
    });
    expect(bigRes.statusCode).toBe(413);

    // Non-admin cannot delete another user's avatar
    const forbiddenDel = await app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${userId}/avatar`,
      headers: { cookie: userCookie, 'x-csrf-token': userCsrf },
    });
    expect(forbiddenDel.statusCode).toBe(403);

    // Admin can delete user's avatar
    const adminDel = await app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${userId}/avatar`,
      headers: { cookie: adminCookie, 'x-csrf-token': adminCsrf },
    });
    expect(adminDel.statusCode).toBe(200);

    const afterDel = await app.inject({
      method: 'GET',
      url: `/api/users/${userId}/avatar`,
      headers: { cookie: userCookie },
    });
    expect(afterDel.statusCode).toBe(404);
  });
});
