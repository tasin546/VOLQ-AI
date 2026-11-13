export type ThemeMode = 'dark' | 'amoled' | 'light' | 'system';
export type DarkStyle = 'dark' | 'amoled';

export interface UserPreferences {
  theme: ThemeMode;
  darkStyle?: DarkStyle;
  defaultModel: string | null;
  sendOnEnter: boolean;
  reduceTransparency: boolean;
  reduceMotion?: boolean | null;
  timezone?: string | null;
}

export type OAuthProviderId =
  | 'google'
  | 'discord'
  | 'github'
  | 'microsoft'
  | 'gitlab'
  | 'linkedin'
  | 'oidc';

export interface UserAuthMethods {
  hasPassword: boolean;
  providers: Array<{
    provider: OAuthProviderId;
    email: string | null;
    createdAt: string;
  }>;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  isActive: boolean;
  hasAvatar?: boolean;
  avatarVersion?: string | null;
  authMethods?: UserAuthMethods;
  preferences: UserPreferences;
  onboardingCompletedAt?: string | null;
  createdAt: string;
}

export interface WelcomeSettings {
  enabled: boolean;
  headline: string | null;
  description: string | null;
}

export interface AuthStatus {
  needsSetup: boolean;
  signupMode: 'open' | 'disabled';
}

export interface BrandingSettings {
  siteName: string;
  tagline?: string;
  logoMode: 'default' | 'upload' | 'icon';
  iconName: string;
  iconColor: string;
  hasUploadedLogo: boolean;
  hasFavicon: boolean;
  defaultTheme: ThemeMode;
  assetVersion: number;
}

export interface DiscoveredModel {
  id: string;
  metadataId?: string;
  name: string;
  providerModelId?: string;
  description?: string;
  icon?: string | null;
  connectionId: string;
  connectionName: string;
  connectionType: 'ollama' | 'openai_compatible';
  isLocal: boolean;
  visibility?: 'public' | 'private';
}

export interface AdminModelItem {
  id: string;
  connectionId: string;
  connectionName: string;
  connectionType: 'ollama' | 'openai_compatible';
  isLocal: boolean;
  providerModelId: string;
  displayName: string | null;
  description: string;
  icon: string | null;
  visibility: 'public' | 'private';
  isHidden: boolean;
  isDeleted: boolean;
  systemPrompt: string;
  defaultTemperature: number | null;
  defaultMaxTokens: number | null;
  knowledgeBaseIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBaseItem {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  fileCount: number;
  readyCount: number;
  chunkCount: number;
  totalBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeFileItem {
  id: string;
  knowledgeBaseId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  errorMessage: string | null;
  chunkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeConfig {
  embeddingConnectionId: string | null;
  embeddingModelId: string | null;
  chunkSizeChars: number;
  chunkOverlapChars: number;
  maxContextTokens: number;
  topK: number;
}

export interface SystemInfo {
  driver: 'sqlite' | 'postgres';
  connected: boolean;
  pgvector: boolean;
  version: string;
  maxUploadMb: number;
  counts: {
    users: number;
    connections: number;
    models: number;
    knowledgeBases: number;
    knowledgeFiles: number;
    chats: number;
    messages: number;
  };
  storageBytes: {
    databaseBytes: number | null;
    knowledgeFilesBytes: number;
  };
}

export interface StarterPrompt {
  id: string;
  label: string;
  prompt: string;
}

export interface SsrfPolicy {
  allowPrivateNetworks: boolean;
  allowlist: string[];
  denylist: string[];
}

export interface AdminConnection {
  id: string;
  name: string;
  type: 'ollama' | 'openai_compatible';
  baseUrl: string;
  hasApiKey: boolean;
  apiKeyHint: string | null;
  isEnabled: boolean;
  cachedModels: Array<{ id: string; name: string }>;
  modelsUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatImageAttachment {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
  dataBase64: string;
}

export interface KnowledgeSourceBadge {
  knowledgeBaseName: string;
  filenames: string[];
}

export interface Chat {
  id: string;
  title: string;
  connectionId: string | null;
  modelId: string | null;
  systemPrompt: string;
  temperature: number | null;
  maxTokens: number | null;
  isPinned: boolean;
  matchSnippet?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  images: ChatImageAttachment[];
  sources?: KnowledgeSourceBadge[];
  modelId: string | null;
  connectionId: string | null;
  status: 'streaming' | 'completed' | 'stopped' | 'error';
  errorMessage: string | null;
  createdAt: string;
}

export interface SavedPrompt {
  id: string;
  title: string;
  command: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicOAuthProvider {
  id: OAuthProviderId;
  displayName: string;
  iconKey: OAuthProviderId;
}

export interface AdminOAuthProvider {
  id: OAuthProviderId;
  displayName: string;
  iconKey: OAuthProviderId;
  isEnabled: boolean;
  clientId: string;
  hasClientSecret: boolean;
  scopes: string;
  defaultScopes?: string[];
  allowSignup: boolean;
  defaultRole: 'user' | 'admin';
  allowedDomains: string[];
  linkByVerifiedEmail: boolean;
  redirectUri: string;
  setupSteps: string[];
  endpointOverrides?: {
    authorizationEndpoint?: string;
    tokenEndpoint?: string;
    userinfoEndpoint?: string;
    jwksEndpoint?: string;
    issuer?: string;
  };
  updatedAt: string | null;
}

export type UsagePeriod = 'day' | 'week' | 'month';

export interface UsageMeterStatus {
  enabled: boolean;
  limit: number | null;
  used: number;
  period: UsagePeriod;
  resetsAt: string;
  remaining: number | null;
}

export interface UserUsageSummary {
  exempt: boolean;
  mode: 'global' | 'custom' | 'unlimited';
  messages: UsageMeterStatus;
  tokens: UsageMeterStatus;
  blockedMeter: 'messages' | 'tokens' | null;
  resetsAt: string | null;
}

export interface UsageLimitsPolicy {
  messagesEnabled: boolean;
  messagesLimit: number;
  messagesPeriod: UsagePeriod;
  tokensEnabled: boolean;
  tokensLimit: number;
  tokensPeriod: UsagePeriod;
  applyToAdmins: boolean;
}

export interface UsageOverviewUser {
  userId: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  isActive: boolean;
  hasAvatar: boolean;
  avatarVersion: string | null;
  override: {
    mode: 'global' | 'custom' | 'unlimited';
    messagesEnabled: boolean;
    messagesLimit: number | null;
    messagesPeriod: UsagePeriod;
    tokensEnabled: boolean;
    tokensLimit: number | null;
    tokensPeriod: UsagePeriod;
    resetBefore: string | null;
  } | null;
  summary: UserUsageSummary;
}

