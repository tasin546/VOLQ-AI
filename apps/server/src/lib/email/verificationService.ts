import crypto from 'node:crypto';
import type { Kysely } from 'kysely';
import type { AppConfig } from '../../config.js';
import { type DatabaseSchema, type EmailSettings } from '../../db/schema.js';
import { sha256Hex, tryDecryptSecret } from '../crypto.js';
import { buildVerificationEmailContent } from './emailProvider.js';
import { ResendClient } from './resendClient.js';

export async function sendUserVerificationEmail(params: {
  db: Kysely<DatabaseSchema>;
  config: AppConfig;
  user: { id: string; email: string; displayName: string };
  emailSettings: EmailSettings;
  brandingSiteName: string;
}): Promise<{ tokenId: string; rawToken: string }> {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = sha256Hex(rawToken);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + (params.emailSettings.tokenExpiryHours || 24) * 3600 * 1000
  ).toISOString();
  const tokenId = crypto.randomUUID();

  await params.db
    .insertInto('email_verification_tokens')
    .values({
      id: tokenId,
      user_id: params.user.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      used_at: null,
      created_at: now.toISOString(),
    })
    .execute();

  let resolvedApiKey: string | null = process.env.RESEND_API_KEY?.trim() || null;
  if (!resolvedApiKey && params.emailSettings.resendApiKeyEncrypted) {
    const dec = tryDecryptSecret(
      params.emailSettings.resendApiKeyEncrypted,
      params.config.encryptionKey
    );
    if (dec.ok && dec.value) {
      resolvedApiKey = dec.value;
    }
  }

  if (resolvedApiKey) {
    const baseUrl =
      params.config.appBaseUrl || params.config.appOrigin.replace(/\/+$/, '');
    const verificationUrl = `${baseUrl}/verify-email?token=${rawToken}`;
    const emailContent = buildVerificationEmailContent({
      siteName: params.brandingSiteName || 'VOLQ AI',
      verificationUrl,
      tokenExpiryHours: params.emailSettings.tokenExpiryHours || 24,
    });

    const client = new ResendClient(resolvedApiKey);
    await client.sendEmail({
      from: params.emailSettings.fromAddress,
      to: params.user.email,
      replyTo: params.emailSettings.replyTo,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
    });
  }

  return { tokenId, rawToken };
}
