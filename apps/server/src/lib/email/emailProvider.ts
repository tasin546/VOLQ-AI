export interface SendEmailParams {
  to: string;
  from: string;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
}

export interface EmailProvider {
  sendEmail(params: SendEmailParams): Promise<{ id: string }>;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildVerificationEmailContent(params: {
  siteName: string;
  verificationUrl: string;
  tokenExpiryHours: number;
}): { html: string; text: string; subject: string } {
  const safeSiteName = escapeHtml(params.siteName || 'VOLQ AI');
  const safeUrl = escapeHtml(params.verificationUrl);
  const expiryHours = params.tokenExpiryHours || 24;

  const subject = `Verify your email for ${params.siteName || 'VOLQ AI'}`;

  const text = [
    `${params.siteName || 'VOLQ AI'} - Verify your email address`,
    '',
    `Welcome! Please verify your email address to activate your account.`,
    '',
    `Click the link below or copy and paste it into your browser:`,
    params.verificationUrl,
    '',
    `This verification link will expire in ${expiryHours} hours.`,
    '',
    `If you did not create an account with ${params.siteName || 'VOLQ AI'}, you can safely ignore this email.`,
  ].join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #0b0f17;
      color: #f1f5f9;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #0b0f17;
      padding: 40px 0;
    }
    .main {
      background-color: #131b2a;
      margin: 0 auto;
      width: 100%;
      max-width: 540px;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 36px 32px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    }
    .wordmark {
      font-size: 22px;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: #ffffff;
      margin-bottom: 24px;
    }
    .heading {
      font-size: 18px;
      font-weight: 600;
      color: #f8fafc;
      margin-top: 0;
      margin-bottom: 14px;
    }
    .paragraph {
      font-size: 15px;
      line-height: 1.6;
      color: #cbd5e1;
      margin-top: 0;
      margin-bottom: 24px;
    }
    .button-container {
      margin: 28px 0;
    }
    .button {
      display: inline-block;
      background-color: #2563eb;
      color: #ffffff !important;
      font-size: 15px;
      font-weight: 600;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 8px;
    }
    .subtext {
      font-size: 13px;
      line-height: 1.5;
      color: #94a3b8;
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid #1e293b;
      word-break: break-all;
    }
    .link-fallback {
      color: #38bdf8 !important;
      text-decoration: underline;
    }
    .footer {
      font-size: 12px;
      color: #64748b;
      margin-top: 24px;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center">
          <div class="main">
            <div class="wordmark">${safeSiteName}</div>
            <h1 class="heading">Verify your email address</h1>
            <p class="paragraph">
              Welcome! Please confirm your email address to activate your account and start using ${safeSiteName}.
            </p>
            <div class="button-container">
              <a href="${safeUrl}" class="button" target="_blank">Verify Email</a>
            </div>
            <p class="subtext">
              If the button above does not work, copy and paste this URL into your browser:<br>
              <a href="${safeUrl}" class="link-fallback">${safeUrl}</a>
            </p>
            <p class="footer">
              This link expires in ${expiryHours} hours.<br>
              If you did not request this email, you can safely ignore it.
            </p>
          </div>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;

  return { html, text, subject };
}
