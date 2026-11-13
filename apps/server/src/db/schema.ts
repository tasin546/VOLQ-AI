import type { Generated } from 'kysely';

export interface SchemaMigrationsTable {
  id: Generated<number>;
  name: string;
  applied_at: string;
}

export interface UsersTable {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: 'admin' | 'user';
  is_active: number;
  preferences_json: string;
  email_verified_at?: string | null;
  onboarding_completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionsTable {
  id: string;
  user_id: string;
  csrf_token: string;
  expires_at: string;
  created_at: string;
}

export interface AppSettingsTable {
  key: string;
  value_json: string;
  updated_at: string;
}

export interface ConnectionsTable {
  id: string;
  name: string;
  type: 'ollama' | 'openai_compatible';
  base_url: string;
  encrypted_api_key: string | null;
  api_key_hint: string | null;
  is_enabled: number;
  cached_models_json: string;
  models_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatsTable {
  id: string;
  user_id: string;
  title: string;
  connection_id: string | null;
  model_id: string | null;
  system_prompt: string;
  temperature: number | null;
  max_tokens: number | null;
  is_pinned: number;
  created_at: string;
  updated_at: string;
}

export interface MessagesTable {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  images_json: string;
  sources_json: string;
  model_id: string | null;
  connection_id: string | null;
  status: 'streaming' | 'completed' | 'stopped' | 'error';
  error_message: string | null;
  created_at: string;
}

export interface PromptsTable {
  id: string;
  user_id: string;
  title: string;
  command: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ModelsMetadataTable {
  id: string;
  connection_id: string;
  provider_model_id: string;
  display_name: string | null;
  description: string;
  icon: string | null;
  visibility: 'public' | 'private';
  is_hidden: number;
  is_deleted: number;
  system_prompt: string;
  default_temperature: number | null;
  default_max_tokens: number | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeBasesTable {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeFilesTable {
  id: string;
  knowledge_base_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  file_data: Buffer;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  error_message: string | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeChunksTable {
  id: string;
  knowledge_base_id: string;
  file_id: string;
  chunk_index: number;
  content: string;
  token_estimate: number;
  created_at: string;
}

export interface ModelKnowledgeBasesTable {
  model_metadata_id: string;
  knowledge_base_id: string;
}

export interface BrandingAssetsTable {
  id: 'logo' | 'favicon';
  mime_type: string;
  data: Buffer;
  updated_at: string;
}

export interface UserAvatarsTable {
  user_id: string;
  mime_type: string;
  data: Buffer;
  etag: string;
  updated_at: string;
}

export interface OAuthProvidersTable {
  id: string;
  is_enabled: number;
  client_id: string;
  encrypted_client_secret: string | null;
  scopes: string;
  allow_signup: number;
  default_role: 'admin' | 'user';
  allowed_domains_json: string;
  link_by_verified_email: number;
  updated_at: string;
}

export interface OAuthIdentitiesTable {
  id: string;
  user_id: string;
  provider: string;
  provider_user_id: string;
  email: string | null;
  created_at: string;
}

export interface UsageEventsTable {
  id: string;
  user_id: string;
  connection_id: string | null;
  model_id: string | null;
  input_tokens: number;
  output_tokens: number;
  is_estimated: number;
  created_at: string;
}

export type UsagePeriod = 'day' | 'week' | 'month';

export interface UserUsageOverridesTable {
  user_id: string;
  mode: 'global' | 'custom' | 'unlimited';
  messages_enabled: number;
  messages_limit: number | null;
  messages_period: UsagePeriod;
  tokens_enabled: number;
  tokens_limit: number | null;
  tokens_period: UsagePeriod;
  reset_before: string | null;
  updated_at: string;
}

export interface EmailVerificationTokensTable {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface SkillsTable {
  id: string;
  owner_user_id: string | null;
  slug: string;
  name: string;
  description: string;
  content: string;
  token_estimate: number;
  version: number;
  enabled: number;
  shared: number;
  created_at: string;
  updated_at: string;
}

export interface MessageSkillsTable {
  id: string;
  message_id: string;
  skill_id: string;
  created_at: string;
}

export interface DatabaseSchema {
  schema_migrations: SchemaMigrationsTable;
  users: UsersTable;
  sessions: SessionsTable;
  app_settings: AppSettingsTable;
  connections: ConnectionsTable;
  chats: ChatsTable;
  messages: MessagesTable;
  prompts: PromptsTable;
  models_metadata: ModelsMetadataTable;
  knowledge_bases: KnowledgeBasesTable;
  knowledge_files: KnowledgeFilesTable;
  knowledge_chunks: KnowledgeChunksTable;
  model_knowledge_bases: ModelKnowledgeBasesTable;
  branding_assets: BrandingAssetsTable;
  user_avatars: UserAvatarsTable;
  oauth_providers: OAuthProvidersTable;
  oauth_identities: OAuthIdentitiesTable;
  usage_events: UsageEventsTable;
  user_usage_overrides: UserUsageOverridesTable;
  email_verification_tokens: EmailVerificationTokensTable;
  skills: SkillsTable;
  message_skills: MessageSkillsTable;
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

export interface BrandingSettings {
  siteName: string;
  tagline?: string;
  logoMode: 'default' | 'upload' | 'icon';
  iconName: string;
  iconColor: string;
  hasUploadedLogo: boolean;
  hasFavicon: boolean;
  defaultTheme: 'dark' | 'amoled' | 'light' | 'system';
  assetVersion: number;
}

export interface WelcomeSettings {
  enabled: boolean;
  headline: string | null;
  description: string | null;
}

export const DEFAULT_WELCOME_SETTINGS: WelcomeSettings = {
  enabled: true,
  headline: null,
  description: null,
};

export interface KnowledgeConfig {
  embeddingConnectionId: string | null;
  embeddingModelId: string | null;
  chunkSizeChars: number;
  chunkOverlapChars: number;
  maxContextTokens: number;
  topK: number;
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

export const DEFAULT_USAGE_LIMITS_POLICY: UsageLimitsPolicy = {
  messagesEnabled: false,
  messagesLimit: 100,
  messagesPeriod: 'day',
  tokensEnabled: false,
  tokensLimit: 250_000,
  tokensPeriod: 'day',
  applyToAdmins: false,
};

export const DEFAULT_STARTER_PROMPTS: StarterPrompt[] = [
  {
    id: 'explain-code',
    label: 'Explain a system design',
    prompt:
      'Walk me through the trade-offs between server-sent events and WebSockets for streaming LLM responses.',
  },
  {
    id: 'debug-sql',
    label: 'Optimize a SQL query',
    prompt:
      'Show me how to diagnose and index a slow database query with EXPLAIN ANALYZE.',
  },
  {
    id: 'draft-spec',
    label: 'Write a concise RFC',
    prompt: 'Draft a crisp 1-page technical RFC template for a self-hosted API gateway.',
  },
  {
    id: 'refactor-ts',
    label: 'Refactor TypeScript',
    prompt:
      'Review a TypeScript module for strict type safety, error boundaries, and clean async cancellation.',
  },
];

export const DEFAULT_SSRF_POLICY: SsrfPolicy = {
  allowPrivateNetworks: true,
  allowlist: [],
  denylist: [],
};

export const DEFAULT_BRANDING: BrandingSettings = {
  siteName: 'VOLQ AI',
  logoMode: 'default',
  iconName: 'Sparkles',
  iconColor: '#FFFFFF',
  hasUploadedLogo: false,
  hasFavicon: false,
  defaultTheme: 'dark',
  assetVersion: 1,
};

export const DEFAULT_KNOWLEDGE_CONFIG: KnowledgeConfig = {
  embeddingConnectionId: null,
  embeddingModelId: null,
  chunkSizeChars: 1200,
  chunkOverlapChars: 200,
  maxContextTokens: 2000,
  topK: 5,
};

export interface EmailSettings {
  resendApiKeyEncrypted: string | null;
  fromAddress: string;
  replyTo: string | null;
  requireVerification: boolean;
  tokenExpiryHours: number;
  resendCooldownSeconds: number;
  lastTestSucceededAt: string | null;
}

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  resendApiKeyEncrypted: null,
  fromAddress: 'VOLQ AI <onboarding@resend.dev>',
  replyTo: null,
  requireVerification: false,
  tokenExpiryHours: 24,
  resendCooldownSeconds: 60,
  lastTestSucceededAt: null,
};

export interface AttachmentLimits {
  maxImagesPerMessage: number;
  maxImageBytes: number;
  maxImageDimension: number;
}

export const DEFAULT_ATTACHMENT_LIMITS: AttachmentLimits = {
  maxImagesPerMessage: 10,
  maxImageBytes: 10 * 1024 * 1024,
  maxImageDimension: 1600,
};

export interface SkillsLimits {
  maxSkillTokens: number;
  maxSkillsPerUser: number;
  maxSkillsPerMessage: number;
  allowUserSharing: boolean;
}

export const DEFAULT_SKILLS_LIMITS: SkillsLimits = {
  maxSkillTokens: 10_000,
  maxSkillsPerUser: 50,
  maxSkillsPerMessage: 3,
  allowUserSharing: false,
};

export interface VoiceSettings {
  enabled: boolean;
  sttProvider: 'browser' | 'elevenlabs' | 'openai';
  ttsProvider: 'elevenlabs' | 'openai';
  elevenlabsKeyEncrypted: string | null;
  elevenlabsVoiceId: string | null;
  elevenlabsModelId: string | null;
  openaiBaseUrl: string | null;
  openaiKeyEncrypted: string | null;
  openaiTtsModel: string | null;
  openaiTtsVoice: string | null;
  openaiSttModel: string | null;
  languageHint: string | null;
  allowUserVoiceSelection: boolean;
  maxVoiceMinutesPerPeriod: number;
  storeAudio: boolean;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: false,
  sttProvider: 'browser',
  ttsProvider: 'openai',
  elevenlabsKeyEncrypted: null,
  elevenlabsVoiceId: null,
  elevenlabsModelId: null,
  openaiBaseUrl: null,
  openaiKeyEncrypted: null,
  openaiTtsModel: 'tts-1',
  openaiTtsVoice: 'alloy',
  openaiSttModel: 'whisper-1',
  languageHint: null,
  allowUserVoiceSelection: true,
  maxVoiceMinutesPerPeriod: 60,
  storeAudio: false,
};
