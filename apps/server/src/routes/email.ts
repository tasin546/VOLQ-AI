import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { AppConfig } from '../config.js';
import {
  type DatabaseSchema,
  DEFAULT_EMAIL_SETTINGS,
  type EmailSettings,
  getSetting,
  setSetting,
} from '../db/index.js';
import { encryptSecret, tryDecryptSecret } from '../lib/crypto.js';
import { ResendClient, ResendError } from '../lib/email/resendClient.js';
import { makeAuthMiddleware } from '../middleware/auth.js';

const updateEmailSettingsSchema = z.object({
  apiKey: z.string().trim().max(300).optional(),
  fromAddress: z.string().trim().min(3).max(200).optional(),
  replyTo: z.string().trim().max(200).nullable().optional(),
  requireVerification: z.boolean().optional(),
  tokenExpiryHours: z.number().int().min(1).max(72).optional(),
  resendCooldownSeconds: z.number().int().min(15).max(300).optional(),
});

const sendTestEmailSchema = z.object({
  recipientEmail: z.string().trim().email().toLowerCase(),
});

export function registerEmailRoutes(
  app: FastifyInstance,
  db: Kysely<DatabaseSchema>,
  config: AppConfig
): void {
  const { authenticate, verifyCsrf, requireAdmin } = makeAuthMiddleware(db, config);

  app.get('/api/admin/email', { preHandler: [authenticate, requireAdmin] }, async () => {
    const settings = await getSetting<EmailSettings>(
      db,
      'email_settings',
      DEFAULT_EMAIL_SETTINGS
    );
    const envKey = process.env.RESEND_API_KEY?.trim() || null;
    const hasStoredKey = Boolean(settings.resendApiKeyEncrypted);
    const isConfigured = Boolean(envKey || hasStoredKey);

    return {
      configured: isConfigured,
      isEnvKey: Boolean(envKey),
      hasKey: isConfigured,
      fromAddress: settings.fromAddress,
      replyTo: settings.replyTo,
      requireVerification: settings.requireVerification,
      tokenExpiryHours: settings.tokenExpiryHours,
      resendCooldownSeconds: settings.resendCooldownSeconds,
      lastTestSucceededAt: settings.lastTestSucceededAt,
      canEnableVerification: Boolean(settings.lastTestSucceededAt),
    };
  });

  app.put(
    '/api/admin/email',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req, reply) => {
      const body = updateEmailSettingsSchema.parse(req.body);
      const current = await getSetting<EmailSettings>(
        db,
        'email_settings',
        DEFAULT_EMAIL_SETTINGS
      );

      let nextEncryptedKey = current.resendApiKeyEncrypted;
      let keyOrFromChanged = false;

      if (body.apiKey !== undefined && body.apiKey.trim().length > 0) {
        nextEncryptedKey = encryptSecret(body.apiKey.trim(), config.encryptionKey);
        keyOrFromChanged = true;
      }

      if (body.fromAddress !== undefined && body.fromAddress !== current.fromAddress) {
        keyOrFromChanged = true;
      }

      // If credentials changed, reset lastTestSucceededAt to require another successful test
      const nextLastTest = keyOrFromChanged ? null : current.lastTestSucceededAt;

      const nextRequireVerification =
        body.requireVerification !== undefined
          ? body.requireVerification
          : current.requireVerification;

      // Lockout guard: cannot enable verification if no test email has succeeded
      if (nextRequireVerification && !nextLastTest) {
        return reply.code(400).send({
          error:
            'A test email must succeed before requiring email verification to prevent account lockouts.',
        });
      }

      const nextSettings: EmailSettings = {
        resendApiKeyEncrypted: nextEncryptedKey,
        fromAddress: body.fromAddress ?? current.fromAddress,
        replyTo: body.replyTo !== undefined ? body.replyTo : current.replyTo,
        requireVerification: nextRequireVerification,
        tokenExpiryHours: body.tokenExpiryHours ?? current.tokenExpiryHours,
        resendCooldownSeconds:
          body.resendCooldownSeconds ?? current.resendCooldownSeconds,
        lastTestSucceededAt: nextLastTest,
      };

      await setSetting(db, 'email_settings', nextSettings);

      return {
        success: true,
        settings: {
          hasKey: Boolean(nextSettings.resendApiKeyEncrypted || process.env.RESEND_API_KEY),
          isEnvKey: Boolean(process.env.RESEND_API_KEY),
          fromAddress: nextSettings.fromAddress,
          replyTo: nextSettings.replyTo,
          requireVerification: nextSettings.requireVerification,
          tokenExpiryHours: nextSettings.tokenExpiryHours,
          resendCooldownSeconds: nextSettings.resendCooldownSeconds,
          lastTestSucceededAt: nextSettings.lastTestSucceededAt,
          canEnableVerification: Boolean(nextSettings.lastTestSucceededAt),
        },
      };
    }
  );

  app.post(
    '/api/admin/email/test',
    { preHandler: [authenticate, requireAdmin, verifyCsrf] },
    async (req, reply) => {
      const body = sendTestEmailSchema.parse(req.body);
      const settings = await getSetting<EmailSettings>(
        db,
        'email_settings',
        DEFAULT_EMAIL_SETTINGS
      );

      let apiKey: string | null = process.env.RESEND_API_KEY?.trim() || null;
      if (!apiKey && settings.resendApiKeyEncrypted) {
        const dec = tryDecryptSecret(settings.resendApiKeyEncrypted, config.encryptionKey);
        if (dec.ok && dec.value) {
          apiKey = dec.value;
        }
      }

      if (!apiKey) {
        return reply.code(400).send({
          error: 'No Resend API key configured. Please enter and save an API key first.',
        });
      }

      const client = new ResendClient(apiKey);
      const now = new Date().toISOString();

      try {
        const result = await client.sendEmail({
          from: settings.fromAddress,
          to: body.recipientEmail,
          replyTo: settings.replyTo,
          subject: 'Test email from VOLQ AI',
          html: `<p>This is a test email sent from <strong>VOLQ AI</strong>.</p><p>If you received this message, your Resend configuration is working correctly.</p>`,
          text: 'This is a test email sent from VOLQ AI. If you received this message, your Resend configuration is working correctly.',
        });

        // Record test success
        const updated = {
          ...settings,
          lastTestSucceededAt: now,
        };
        await setSetting(db, 'email_settings', updated);

        return {
          success: true,
          messageId: result.id,
          sentAt: now,
        };
      } catch (err) {
        if (err instanceof ResendError) {
          return reply.code(err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 502).send({
            error: err.message,
            code: err.code,
          });
        }
        return reply.code(502).send({
          error: err instanceof Error ? err.message : 'Failed to send test email',
        });
      }
    }
  );
}
