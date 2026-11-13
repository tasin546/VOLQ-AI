import crypto from 'node:crypto';
import { CodeChallengeMethod, OAuth2Client, type OAuth2Tokens, decodeIdToken } from 'arctic';

export type OAuthProviderId =
  | 'google'
  | 'discord'
  | 'github'
  | 'microsoft'
  | 'gitlab'
  | 'linkedin'
  | 'oidc';

export interface OAuthNormalizedProfile {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string;
}

export interface OAuthEndpointOverride {
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  userinfoEndpoint?: string;
  jwksEndpoint?: string;
  issuer?: string;
}

export type OAuthOverridesMap = Partial<Record<OAuthProviderId, OAuthEndpointOverride>>;

export interface OAuthProviderDefinition {
  id: OAuthProviderId;
  displayName: string;
  iconKey: 'google' | 'discord' | 'github' | 'microsoft' | 'gitlab' | 'linkedin' | 'oidc';
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint: string;
  jwksEndpoint?: string;
  issuers?: string[];
  useNonce: boolean;
  defaultScopes: string[];
  setupSteps: string[];
  parseUserInfo: (raw: Record<string, unknown>) => OAuthNormalizedProfile;
  fetchExtraProfile?: (
    accessToken: string,
    raw: Record<string, unknown>
  ) => Promise<Partial<OAuthNormalizedProfile>>;
}

export const OAUTH_PROVIDER_REGISTRY: Record<OAuthProviderId, OAuthProviderDefinition> = {
  google: {
    id: 'google',
    displayName: 'Google',
    iconKey: 'google',
    authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    userinfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
    jwksEndpoint: 'https://www.googleapis.com/oauth2/v3/certs',
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    useNonce: true,
    defaultScopes: ['openid', 'profile', 'email'],
    setupSteps: [
      'Open Google Cloud Console → APIs & Services → Credentials.',
      'Configure the OAuth consent screen if not already set up.',
      'Click Create Credentials → OAuth client ID → Web application.',
      'Add the Redirect URI shown below under Authorized redirect URIs.',
      'Copy the Client ID and Client Secret into this form and enable Google.',
    ],
    parseUserInfo: (raw) => {
      const sub = typeof raw.sub === 'string' ? raw.sub.trim() : '';
      const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : null;
      const emailVerified = raw.email_verified === true;
      const name =
        (typeof raw.name === 'string' && raw.name.trim()) ||
        (email ? email.split('@')[0]! : 'Google User');
      return {
        providerUserId: sub,
        email,
        emailVerified,
        displayName: name.slice(0, 80),
      };
    },
  },
  discord: {
    id: 'discord',
    displayName: 'Discord',
    iconKey: 'discord',
    authorizationEndpoint: 'https://discord.com/api/oauth2/authorize',
    tokenEndpoint: 'https://discord.com/api/oauth2/token',
    userinfoEndpoint: 'https://discord.com/api/users/@me',
    useNonce: false,
    defaultScopes: ['identify', 'email'],
    setupSteps: [
      'Open the Discord Developer Portal → Applications → New Application (or select one).',
      'Go to OAuth2 in the left sidebar.',
      'Under Redirects, add the exact Redirect URI shown below and save changes.',
      'Copy the Client ID and Client Secret (reset if needed) into this form.',
      'Keep the default scopes "identify email" so VOLQ AI can read your Discord user ID and verified email.',
    ],
    parseUserInfo: (raw) => {
      const id = typeof raw.id === 'string' ? raw.id.trim() : '';
      const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : null;
      const emailVerified = raw.verified === true;
      const globalName =
        typeof raw.global_name === 'string' && raw.global_name.trim()
          ? raw.global_name.trim()
          : '';
      const username =
        typeof raw.username === 'string' && raw.username.trim() ? raw.username.trim() : '';
      return {
        providerUserId: id,
        email,
        emailVerified,
        displayName: (globalName || username || 'Discord User').slice(0, 80),
      };
    },
  },
  github: {
    id: 'github',
    displayName: 'GitHub',
    iconKey: 'github',
    authorizationEndpoint: 'https://github.com/login/oauth/authorize',
    tokenEndpoint: 'https://github.com/login/oauth/access_token',
    userinfoEndpoint: 'https://api.github.com/user',
    useNonce: false,
    defaultScopes: ['read:user', 'user:email'],
    setupSteps: [
      'Open GitHub Settings → Developer settings → OAuth Apps → New OAuth App.',
      'Set Application name to VOLQ AI and Homepage URL to your site URL.',
      'Set Authorization callback URL to the exact Redirect URI shown below.',
      'Click Register application, then generate a new Client Secret.',
      'Copy Client ID and Client Secret into this form.',
    ],
    parseUserInfo: (raw) => {
      const id = String(raw.id ?? '');
      const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : null;
      const displayName =
        (typeof raw.name === 'string' && raw.name.trim()) ||
        (typeof raw.login === 'string' && raw.login.trim()) ||
        'GitHub User';
      return {
        providerUserId: id,
        email,
        emailVerified: Boolean(email),
        displayName: displayName.slice(0, 80),
      };
    },
    fetchExtraProfile: async (accessToken) => {
      try {
        const res = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'VOLQ-AI/1.0',
            Accept: 'application/json',
          },
        });
        if (!res.ok) return {};
        const emails = (await res.json()) as Array<{
          email?: string;
          primary?: boolean;
          verified?: boolean;
        }>;
        if (!Array.isArray(emails)) return {};
        const primary =
          emails.find((e) => e.primary && e.verified) ||
          emails.find((e) => e.verified) ||
          emails[0];
        if (primary && typeof primary.email === 'string') {
          return {
            email: primary.email.trim().toLowerCase(),
            emailVerified: Boolean(primary.verified),
          };
        }
      } catch {
        // ignore extra email fetch errors
      }
      return {};
    },
  },
  microsoft: {
    id: 'microsoft',
    displayName: 'Microsoft Entra ID',
    iconKey: 'microsoft',
    authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userinfoEndpoint: 'https://graph.microsoft.com/oidc/userinfo',
    useNonce: false,
    defaultScopes: ['openid', 'profile', 'email', 'User.Read'],
    setupSteps: [
      'Open Microsoft Azure Portal → Microsoft Entra ID → App registrations.',
      'Create a new registration, select Supported account types (Accounts in any organizational directory or personal).',
      'Under Redirect URI, select Web and paste the Redirect URI shown below.',
      'Under Certificates & secrets, create a New client secret.',
      'Copy Application (client) ID and Secret value into this form.',
    ],
    parseUserInfo: (raw) => {
      const sub = String(raw.sub || raw.id || '');
      const email =
        typeof raw.email === 'string'
          ? raw.email.trim().toLowerCase()
          : typeof raw.preferred_username === 'string'
            ? raw.preferred_username.trim().toLowerCase()
            : null;
      const displayName =
        (typeof raw.name === 'string' && raw.name.trim()) ||
        (typeof raw.preferred_username === 'string' && raw.preferred_username.trim()) ||
        'Microsoft User';
      return {
        providerUserId: sub,
        email,
        emailVerified: true,
        displayName: displayName.slice(0, 80),
      };
    },
  },
  gitlab: {
    id: 'gitlab',
    displayName: 'GitLab',
    iconKey: 'gitlab',
    authorizationEndpoint: 'https://gitlab.com/oauth/authorize',
    tokenEndpoint: 'https://gitlab.com/oauth/token',
    userinfoEndpoint: 'https://gitlab.com/oauth/userinfo',
    useNonce: false,
    defaultScopes: ['openid', 'profile', 'email'],
    setupSteps: [
      'In GitLab, navigate to User Settings (or Group/Instance Settings) → Applications.',
      'Set Name to VOLQ AI and Redirect URI to the exact URL shown below.',
      'Select Scopes: openid, profile, email.',
      'Save and copy the Application ID and Secret into this form.',
    ],
    parseUserInfo: (raw) => {
      const sub = String(raw.sub || raw.id || '');
      const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : null;
      const displayName =
        (typeof raw.name === 'string' && raw.name.trim()) ||
        (typeof raw.nickname === 'string' && raw.nickname.trim()) ||
        'GitLab User';
      return {
        providerUserId: sub,
        email,
        emailVerified: raw.email_verified === true,
        displayName: displayName.slice(0, 80),
      };
    },
  },
  linkedin: {
    id: 'linkedin',
    displayName: 'LinkedIn',
    iconKey: 'linkedin',
    authorizationEndpoint: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenEndpoint: 'https://www.linkedin.com/oauth/v2/accessToken',
    userinfoEndpoint: 'https://api.linkedin.com/v2/userinfo',
    useNonce: false,
    defaultScopes: ['openid', 'profile', 'email'],
    setupSteps: [
      'Open the LinkedIn Developer Portal and create a new App.',
      'In Products, request access to "Sign In with LinkedIn using OpenID Connect".',
      'Under Auth, add the Redirect URI shown below under Authorized redirect URLs.',
      'Copy Client ID and Primary Client Secret into this form.',
    ],
    parseUserInfo: (raw) => {
      const sub = String(raw.sub || '');
      const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : null;
      const displayName =
        (typeof raw.name === 'string' && raw.name.trim()) || 'LinkedIn User';
      return {
        providerUserId: sub,
        email,
        emailVerified: raw.email_verified === true,
        displayName: displayName.slice(0, 80),
      };
    },
  },
  oidc: {
    id: 'oidc',
    displayName: 'Custom OIDC',
    iconKey: 'oidc',
    authorizationEndpoint: '',
    tokenEndpoint: '',
    userinfoEndpoint: '',
    useNonce: false,
    defaultScopes: ['openid', 'profile', 'email'],
    setupSteps: [
      'Configure an OpenID Connect client in your Identity Provider (Keycloak, Auth0, Okta, Authentik).',
      'Set the Allowed Callback / Redirect URI to the URL shown below.',
      'Provide the Client ID, Client Secret, and Provider endpoints in the configuration below.',
    ],
    parseUserInfo: (raw) => {
      const sub = String(raw.sub || raw.id || '');
      const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : null;
      const displayName =
        (typeof raw.name === 'string' && raw.name.trim()) ||
        (typeof raw.preferred_username === 'string' && raw.preferred_username.trim()) ||
        (email ? email.split('@')[0]! : 'OIDC User');
      return {
        providerUserId: sub,
        email,
        emailVerified: raw.email_verified === true || Boolean(email),
        displayName: displayName.slice(0, 80),
      };
    },
  },
};

export function isSupportedOAuthProvider(id: string): id is OAuthProviderId {
  return (
    id === 'google' ||
    id === 'discord' ||
    id === 'github' ||
    id === 'microsoft' ||
    id === 'gitlab' ||
    id === 'linkedin' ||
    id === 'oidc'
  );
}

export function resolveOAuthEndpoints(
  provider: OAuthProviderDefinition,
  overrides?: OAuthOverridesMap
) {
  const ov = overrides?.[provider.id];
  return {
    authorizationEndpoint: ov?.authorizationEndpoint ?? provider.authorizationEndpoint,
    tokenEndpoint: ov?.tokenEndpoint ?? provider.tokenEndpoint,
    userinfoEndpoint: ov?.userinfoEndpoint ?? provider.userinfoEndpoint,
    jwksEndpoint: ov?.jwksEndpoint ?? provider.jwksEndpoint,
    issuers: ov?.issuer ? [ov.issuer] : provider.issuers,
  };
}

export function createOAuthClient(
  clientId: string,
  clientSecret: string,
  redirectUri: string
): OAuth2Client {
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

export function buildOAuthAuthorizationUrl(params: {
  provider: OAuthProviderDefinition;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  state: string;
  codeVerifier: string;
  nonce?: string;
  scopes: string[];
  overrides?: OAuthOverridesMap;
}): URL {
  const endpoints = resolveOAuthEndpoints(params.provider, params.overrides);
  const client = createOAuthClient(params.clientId, params.clientSecret, params.redirectUri);
  const url = client.createAuthorizationURLWithPKCE(
    endpoints.authorizationEndpoint,
    params.state,
    CodeChallengeMethod.S256,
    params.codeVerifier,
    params.scopes
  );
  if (params.provider.useNonce && params.nonce) {
    url.searchParams.set('nonce', params.nonce);
  }
  return url;
}

interface JwkCacheEntry {
  expiresAt: number;
  keys: Array<JsonWebKey & { kid?: string; use?: string }>;
}

const jwksCache = new Map<string, JwkCacheEntry>();

async function fetchJwksKeys(
  jwksEndpoint: string
): Promise<Array<JsonWebKey & { kid?: string; use?: string }>> {
  const cached = jwksCache.get(jwksEndpoint);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.keys;
  }
  const res = await fetch(jwksEndpoint, {
    headers: { Accept: 'application/json', 'User-Agent': 'VOLQ-AI/1.0' },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch OIDC JWKS (${res.status})`);
  }
  const body = (await res.json()) as {
    keys?: Array<JsonWebKey & { kid?: string; use?: string }>;
  };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  jwksCache.set(jwksEndpoint, {
    keys,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });
  return keys;
}

export async function verifyOidcIdToken(params: {
  idToken: string;
  clientId: string;
  expectedNonce: string;
  issuers: string[];
  jwksEndpoint: string;
}): Promise<Record<string, unknown>> {
  const parts = params.idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Malformed OIDC ID token');
  }

  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];
  const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8')) as {
    alg?: string;
    kid?: string;
  };
  if (header.alg !== 'RS256') {
    throw new Error('Unsupported ID token signing algorithm');
  }

  const keys = await fetchJwksKeys(params.jwksEndpoint);
  const matchingKey =
    (header.kid ? keys.find((k) => k.kid === header.kid) : undefined) ??
    keys.find((k) => !k.use || k.use === 'sig');

  if (!matchingKey) {
    throw new Error('Matching OIDC signing key not found');
  }

  const publicKey = crypto.createPublicKey({ key: matchingKey as crypto.JsonWebKey, format: 'jwk' });
  const verified = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerB64}.${payloadB64}`),
    publicKey,
    Buffer.from(sigB64, 'base64url')
  );
  if (!verified) {
    throw new Error('Invalid OIDC ID token signature');
  }

  const claims = decodeIdToken(params.idToken) as Record<string, unknown>;
  const iss = typeof claims.iss === 'string' ? claims.iss : '';
  if (!params.issuers.includes(iss)) {
    throw new Error('OIDC ID token issuer mismatch');
  }

  const aud = claims.aud;
  const audValid = Array.isArray(aud)
    ? aud.includes(params.clientId)
    : aud === params.clientId;
  if (!audValid) {
    throw new Error('OIDC ID token audience mismatch');
  }

  const exp = typeof claims.exp === 'number' ? claims.exp : 0;
  if (exp * 1000 < Date.now() - 30_000) {
    throw new Error('OIDC ID token expired');
  }

  if (typeof claims.nonce !== 'string' || claims.nonce !== params.expectedNonce) {
    throw new Error('OIDC ID token nonce mismatch');
  }

  return claims;
}

export async function exchangeAndFetchOAuthProfile(params: {
  provider: OAuthProviderDefinition;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
  expectedNonce?: string;
  overrides?: OAuthOverridesMap;
}): Promise<OAuthNormalizedProfile> {
  const endpoints = resolveOAuthEndpoints(params.provider, params.overrides);
  const client = createOAuthClient(params.clientId, params.clientSecret, params.redirectUri);

  const tokens: OAuth2Tokens = await client.validateAuthorizationCode(
    endpoints.tokenEndpoint,
    params.code,
    params.codeVerifier
  );

  if (params.provider.useNonce) {
    const idToken = tokens.idToken();
    if (!idToken || !params.expectedNonce || !endpoints.jwksEndpoint || !endpoints.issuers) {
      throw new Error('Missing OIDC ID token or nonce');
    }
    const claims = await verifyOidcIdToken({
      idToken,
      clientId: params.clientId,
      expectedNonce: params.expectedNonce,
      issuers: endpoints.issuers,
      jwksEndpoint: endpoints.jwksEndpoint,
    });
    const parsedFromToken = params.provider.parseUserInfo(claims);
    if (parsedFromToken.providerUserId && parsedFromToken.email) {
      return parsedFromToken;
    }
  }

  const accessToken = tokens.accessToken();
  const res = await fetch(endpoints.userinfoEndpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': 'VOLQ-AI/1.0',
    },
  });
  if (!res.ok) {
    throw new Error(`Provider userinfo request failed (${res.status})`);
  }
  const userJson = (await res.json()) as Record<string, unknown>;
  let profile = params.provider.parseUserInfo(userJson);
  if (params.provider.fetchExtraProfile) {
    const extra = await params.provider.fetchExtraProfile(accessToken, userJson);
    profile = { ...profile, ...extra };
  }
  return profile;
}
