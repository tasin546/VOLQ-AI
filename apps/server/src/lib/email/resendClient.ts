import type { EmailProvider, SendEmailParams } from './emailProvider.js';

export class ResendError extends Error {
  statusCode: number;
  code?: string;

  constructor(message: string, statusCode: number, code?: string) {
    super(message);
    this.name = 'ResendError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class ResendClient implements EmailProvider {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string, baseUrl: string = 'https://api.resend.com') {
    this.apiKey = apiKey.trim();
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async sendEmail(params: SendEmailParams): Promise<{ id: string }> {
    const payload: Record<string, unknown> = {
      from: params.from,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    };

    if (params.replyTo) {
      payload.reply_to = params.replyTo;
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/emails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'VOLQ-AI/1.0',
        },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new ResendError(
        'Could not connect to Resend API. Please check your network connection.',
        503,
        'network_error'
      );
    }

    if (!res.ok) {
      let errorBody: { message?: string; name?: string; code?: string } = {};
      try {
        errorBody = (await res.json()) as { message?: string; name?: string; code?: string };
      } catch {
        // ignore parse error
      }

      if (res.status === 401) {
        throw new ResendError(
          'Invalid Resend API key. Please check your API key in the Resend dashboard.',
          401,
          'invalid_api_key'
        );
      }
      if (res.status === 403) {
        throw new ResendError(
          'Domain not verified. The "From" domain must be verified in your Resend dashboard (DNS records). In sandbox mode, you can only send to your account email.',
          403,
          'domain_unverified'
        );
      }
      if (res.status === 422) {
        throw new ResendError(
          errorBody.message ||
            'Invalid email address or parameters. Please verify From and To addresses.',
          422,
          'validation_error'
        );
      }
      if (res.status === 429) {
        throw new ResendError(
          'Resend rate limit exceeded. Please wait a moment before sending more emails.',
          429,
          'rate_limit_exceeded'
        );
      }

      throw new ResendError(
        errorBody.message || `Resend request failed with status ${res.status}.`,
        res.status,
        errorBody.name || 'resend_error'
      );
    }

    const data = (await res.json()) as { id: string };
    return { id: data.id };
  }
}
