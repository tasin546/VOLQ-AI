import { describe, expect, it } from 'vitest';
import { createDatabase, DEFAULT_STARTER_PROMPTS, getSetting } from '../db/index.js';
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  maskApiKey,
  tryDecryptSecret,
  verifyPassword,
} from '../lib/crypto.js';
import { normalizeApiKey, normalizeBaseUrl } from '../lib/providers.js';
import { SsrfValidationError, validateConnectionUrl } from '../lib/ssrf.js';

describe('crypto, DB & SSRF helpers', () => {
  const key = 'test-encryption-key-material-32bytes';

  it('encrypts and decrypts provider API keys round-trip', () => {
    const secret = 'sk-proj-example-secret-value-123456';
    const encrypted = encryptSecret(secret, key);

    expect(encrypted).not.toContain(secret);
    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(decryptSecret(encrypted, key)).toBe(secret);
  });

  it('fails decryption with wrong key or tampered payload', () => {
    const encrypted = encryptSecret('sk-test-123456', key);
    expect(() => decryptSecret(encrypted, 'wrong-key-material-32bytes-000000')).toThrow();

    const tampered = encrypted.slice(0, -2) + 'aa';
    expect(() => decryptSecret(tampered, key)).toThrow();

    const failed = tryDecryptSecret(encrypted, 'wrong-key-material-32bytes-000000');
    expect(failed.ok).toBe(false);
    const ok = tryDecryptSecret(encrypted, key);
    expect(ok).toEqual({ ok: true, value: 'sk-test-123456' });
  });

  it('normalizes provider API keys and OpenAI base URLs cleanly', () => {
    expect(normalizeApiKey('  Bearer sk-abc123  ')).toBe('sk-abc123');
    expect(normalizeApiKey('sk-xyz')).toBe('sk-xyz');
    expect(normalizeApiKey('   ')).toBeNull();
    expect(normalizeBaseUrl('https://api.example.com/v1/')).toBe('https://api.example.com/v1');
    expect(normalizeBaseUrl('https://api.example.com/v1/chat/completions')).toBe(
      'https://api.example.com/v1'
    );
  });

  it('masks API keys without exposing full value', () => {
    expect(maskApiKey('sk-proj-abcdef1234')).toBe('sk-••••1234');
    expect(maskApiKey('short')).toBe('••••rt');
  });

  it('hashes and verifies passwords using argon2id', async () => {
    const hash = await hashPassword('CorrectHorseBatteryStaple!');
    expect(hash).toContain('$argon2id$');
    expect(await verifyPassword(hash, 'CorrectHorseBatteryStaple!')).toBe(true);
    expect(await verifyPassword(hash, 'wrong-password')).toBe(false);
  });

  it('enforces SSRF allowlist, denylist, metadata block, and private network rules', async () => {
    await expect(
      validateConnectionUrl('file:///etc/passwd', {
        allowPrivateNetworks: true,
        allowlist: [],
        denylist: [],
      })
    ).rejects.toThrow(SsrfValidationError);

    await expect(
      validateConnectionUrl('http://169.254.169.254/latest/meta-data', {
        allowPrivateNetworks: true,
        allowlist: [],
        denylist: [],
      })
    ).rejects.toThrow(SsrfValidationError);

    await expect(
      validateConnectionUrl('http://127.0.0.1:11434', {
        allowPrivateNetworks: false,
        allowlist: [],
        denylist: [],
      })
    ).rejects.toThrow(SsrfValidationError);

    const allowedLocal = await validateConnectionUrl('http://127.0.0.1:11434', {
      allowPrivateNetworks: false,
      allowlist: ['127.0.0.1'],
      denylist: [],
    });
    expect(allowedLocal.hostname).toBe('127.0.0.1');

    await expect(
      validateConnectionUrl(
        'https://api.example.com/v1',
        {
          allowPrivateNetworks: true,
          allowlist: [],
          denylist: ['api.example.com'],
        },
        { skipDns: true }
      )
    ).rejects.toThrow(SsrfValidationError);
  });

  it('initializes Kysely SQLite schema, migrations, and default settings', async () => {
    const ctx = await createDatabase(':memory:');
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
    expect(await getSetting(ctx.db, 'signup_mode', 'disabled')).toBe('open');
    expect(await getSetting(ctx.db, 'starter_prompts', [])).toHaveLength(
      DEFAULT_STARTER_PROMPTS.length
    );
    await ctx.close();
  });
});
