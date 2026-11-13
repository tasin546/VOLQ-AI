import crypto from 'node:crypto';
import argon2 from 'argon2';

const ALGORITHM = 'aes-256-gcm';
const KEY_DERIVATION_SALT = 'volq-ai-connection-key-v1';

function deriveAesKey(masterKey: string): Buffer {
  return crypto.scryptSync(masterKey, KEY_DERIVATION_SALT, 32);
}

export function encryptSecret(plaintext: string, encryptionKey: string): string {
  const key = deriveAesKey(encryptionKey);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    'v1',
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

export function decryptSecret(payload: string, encryptionKey: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Invalid encrypted secret format');
  }

  const [, ivB64, tagB64, dataB64] = parts;
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Incomplete encrypted secret payload');
  }

  const key = deriveAesKey(encryptionKey);
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export function tryDecryptSecret(
  payload: string | null | undefined,
  encryptionKey: string
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (!payload) {
    return { ok: true, value: null };
  }
  try {
    return { ok: true, value: decryptSecret(payload, encryptionKey) };
  } catch {
    return {
      ok: false,
      error:
        'Saved API key could not be decrypted with the current ENCRYPTION_KEY. Edit the connection and re-save your API key.',
    };
  }
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return '••••' + trimmed.slice(-2);
  }
  return `${trimmed.slice(0, 3)}••••${trimmed.slice(-4)}`;
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function generateRandomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
