import type { ComponentType } from 'react';
import {
  Activity,
  BarChart3,
  Cpu,
  Database,
  Gauge,
  Info,
  KeyRound,
  Keyboard,
  Mail,
  Network,
  Palette,
  Settings2,
  Sparkles,
  User as UserIcon,
  Users,
} from 'lucide-react';

export type SettingsSectionId =
  | 'account'
  | 'interface'
  | 'keyboard'
  | 'usage'
  | 'about'
  | 'admin-general'
  | 'admin-models'
  | 'admin-connections'
  | 'admin-knowledge'
  | 'admin-users'
  | 'admin-oauth'
  | 'admin-email'
  | 'admin-skills'
  | 'admin-usage'
  | 'admin-system';

export interface SettingsNavItem {
  id: SettingsSectionId;
  group: 'user' | 'admin';
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

export interface SettingsSearchEntry {
  id: string;
  section: SettingsSectionId;
  rowId: string;
  title: string;
  sectionLabel: string;
  keywords: string;
  adminOnly?: boolean;
}

export interface AdminDirtyState {
  dirty: boolean;
  saving?: boolean;
  label?: string;
  onSave: () => Promise<void>;
  onReset: () => void;
}

export const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  {
    id: 'account',
    group: 'user',
    label: 'Account',
    description: 'Profile picture, display name, and sign-in methods',
    icon: UserIcon,
  },
  {
    id: 'interface',
    group: 'user',
    label: 'Interface',
    description: 'Theme, accessibility, default model, and composer behavior',
    icon: Palette,
  },
  {
    id: 'keyboard',
    group: 'user',
    label: 'Keyboard Shortcuts',
    description: 'Shortcut bindings for navigation and chat',
    icon: Keyboard,
  },
  {
    id: 'usage',
    group: 'user',
    label: 'Usage',
    description: 'Your current message and token usage quotas',
    icon: BarChart3,
  },
  {
    id: 'about',
    group: 'user',
    label: 'About',
    description: 'Version details and instance overview',
    icon: Info,
  },
  {
    id: 'admin-general',
    group: 'admin',
    label: 'General & Branding',
    description: 'Site name, logo, signups, global prompt, and starter chips',
    icon: Settings2,
    adminOnly: true,
  },
  {
    id: 'admin-models',
    group: 'admin',
    label: 'Models',
    description: 'Visibility, aliases, prompts, and knowledge attachments',
    icon: Cpu,
    adminOnly: true,
  },
  {
    id: 'admin-connections',
    group: 'admin',
    label: 'Connections',
    description: 'Ollama and OpenAI-compatible API providers & SSRF guard',
    icon: Network,
    adminOnly: true,
  },
  {
    id: 'admin-knowledge',
    group: 'admin',
    label: 'Knowledge Base',
    description: 'Document collections, uploads, and RAG retrieval',
    icon: Database,
    adminOnly: true,
  },
  {
    id: 'admin-users',
    group: 'admin',
    label: 'Users',
    description: 'Roles, status, profile pictures, and per-user quotas',
    icon: Users,
    adminOnly: true,
  },
  {
    id: 'admin-oauth',
    group: 'admin',
    label: 'OAuth Providers',
    description: 'Google and Discord single sign-on credentials & policy',
    icon: KeyRound,
    adminOnly: true,
  },
  {
    id: 'admin-email',
    group: 'admin',
    label: 'Email & Verification',
    description: 'Resend integration, verification tokens, and sender identity',
    icon: Mail,
    adminOnly: true,
  },
  {
    id: 'admin-skills',
    group: 'admin',
    label: 'Skills',
    description: 'System and shared skills, prompt templates, and execution limits',
    icon: Sparkles,
    adminOnly: true,
  },
  {
    id: 'admin-usage',
    group: 'admin',
    label: 'Usage Limits',
    description: 'Global quotas, admin exemptions, and member usage meters',
    icon: Gauge,
    adminOnly: true,
  },
  {
    id: 'admin-system',
    group: 'admin',
    label: 'System',
    description: 'Database driver, storage metrics, and health diagnostics',
    icon: Activity,
    adminOnly: true,
  },
];

export const SETTINGS_SEARCH_ENTRIES: SettingsSearchEntry[] = [
  {
    id: 's-avatar',
    section: 'account',
    rowId: 'account-avatar',
    title: 'Profile picture',
    sectionLabel: 'Account',
    keywords: 'avatar photo upload crop picture png jpg webp',
  },
  {
    id: 's-name',
    section: 'account',
    rowId: 'account-name',
    title: 'Display name & email',
    sectionLabel: 'Account',
    keywords: 'profile display name email role account',
  },
  {
    id: 's-methods',
    section: 'account',
    rowId: 'account-methods',
    title: 'Linked sign-in methods',
    sectionLabel: 'Account',
    keywords: 'oauth google discord password login linked',
  },
  {
    id: 's-theme',
    section: 'interface',
    rowId: 'interface-theme',
    title: 'Theme (Obsidian, AMOLED, Frost, System)',
    sectionLabel: 'Interface',
    keywords: 'theme dark obsidian amoled black light frost system',
  },
  {
    id: 's-a11y',
    section: 'interface',
    rowId: 'interface-a11y',
    title: 'Reduce transparency & reduce motion',
    sectionLabel: 'Interface',
    keywords: 'accessibility transparency blur motion animation contrast',
  },
  {
    id: 's-chat',
    section: 'interface',
    rowId: 'interface-chat',
    title: 'Default model & Enter-to-send',
    sectionLabel: 'Interface',
    keywords: 'chat composer default model enter shift newline',
  },
  {
    id: 's-shortcuts',
    section: 'keyboard',
    rowId: 'keyboard-list',
    title: 'Keyboard shortcuts',
    sectionLabel: 'Keyboard Shortcuts',
    keywords: 'keys hotkey cmd ctrl k b o',
  },
  {
    id: 's-usage',
    section: 'usage',
    rowId: 'usage-meters',
    title: 'Message & token usage meters',
    sectionLabel: 'Usage',
    keywords: 'quota limit messages tokens remaining reset',
  },
  {
    id: 's-about',
    section: 'about',
    rowId: 'about-info',
    title: 'Version & instance info',
    sectionLabel: 'About',
    keywords: 'version about volq ai self-hosted',
  },
  {
    id: 's-brand',
    section: 'admin-general',
    rowId: 'admin-branding',
    title: 'Site branding, logo & favicon',
    sectionLabel: 'General & Branding',
    keywords: 'branding site name logo favicon icon color',
    adminOnly: true,
  },
  {
    id: 's-signup',
    section: 'admin-general',
    rowId: 'admin-registration',
    title: 'Signups, default theme & global prompt',
    sectionLabel: 'General & Branding',
    keywords: 'registration signups open disabled system prompt starter chips',
    adminOnly: true,
  },
  {
    id: 's-models',
    section: 'admin-models',
    rowId: 'admin-models-list',
    title: 'Model catalog & visibility',
    sectionLabel: 'Models',
    keywords: 'models hide show private public rename prompt',
    adminOnly: true,
  },
  {
    id: 's-conns',
    section: 'admin-connections',
    rowId: 'admin-connections-list',
    title: 'Model provider connections',
    sectionLabel: 'Connections',
    keywords: 'ollama openai api key base url connection',
    adminOnly: true,
  },
  {
    id: 's-ssrf',
    section: 'admin-connections',
    rowId: 'admin-ssrf',
    title: 'Connection URL SSRF guard',
    sectionLabel: 'Connections',
    keywords: 'ssrf private network localhost allowlist denylist',
    adminOnly: true,
  },
  {
    id: 's-kb',
    section: 'admin-knowledge',
    rowId: 'admin-knowledge-bases',
    title: 'Knowledge bases & retrieval',
    sectionLabel: 'Knowledge Base',
    keywords: 'knowledge rag pdf docs embeddings pgvector fts',
    adminOnly: true,
  },
  {
    id: 's-users',
    section: 'admin-users',
    rowId: 'admin-users-table',
    title: 'Manage users, roles & avatars',
    sectionLabel: 'Users',
    keywords: 'users roles admin disable avatar quota override',
    adminOnly: true,
  },
  {
    id: 's-oauth',
    section: 'admin-oauth',
    rowId: 'admin-oauth-cards',
    title: 'Google & Discord OAuth SSO',
    sectionLabel: 'OAuth Providers',
    keywords: 'oauth google discord client secret redirect uri sso domains',
    adminOnly: true,
  },
  {
    id: 's-usage-limits',
    section: 'admin-usage',
    rowId: 'admin-usage-policy',
    title: 'Global AI usage limits & admin toggle',
    sectionLabel: 'Usage Limits',
    keywords: 'usage limit messages tokens slider apply admins reset',
    adminOnly: true,
  },
  {
    id: 's-system',
    section: 'admin-system',
    rowId: 'admin-system-stats',
    title: 'Database driver & health stats',
    sectionLabel: 'System',
    keywords: 'sqlite postgres pgvector healthz storage',
    adminOnly: true,
  },
];

const SECTION_ALIASES: Record<string, SettingsSectionId> = {
  profile: 'account',
  account: 'account',
  appearance: 'interface',
  chat: 'interface',
  interface: 'interface',
  shortcuts: 'keyboard',
  keyboard: 'keyboard',
  usage: 'usage',
  about: 'about',
  admin: 'admin-general',
  'admin-general': 'admin-general',
  general: 'admin-general',
  models: 'admin-models',
  'admin-models': 'admin-models',
  connections: 'admin-connections',
  'admin-connections': 'admin-connections',
  knowledge: 'admin-knowledge',
  'admin-knowledge': 'admin-knowledge',
  users: 'admin-users',
  'admin-users': 'admin-users',
  oauth: 'admin-oauth',
  'admin-oauth': 'admin-oauth',
  email: 'admin-email',
  'admin-email': 'admin-email',
  skills: 'admin-skills',
  'admin-skills': 'admin-skills',
  'usage-limits': 'admin-usage',
  'admin-usage': 'admin-usage',
  system: 'admin-system',
  'admin-system': 'admin-system',
};

export function normalizeSettingsSection(
  raw: string | null | undefined,
  isAdmin: boolean
): SettingsSectionId {
  if (!raw) return 'account';
  const mapped = SECTION_ALIASES[raw.toLowerCase()] ?? 'account';
  const item = SETTINGS_NAV_ITEMS.find((n) => n.id === mapped);
  if (item?.adminOnly && !isAdmin) return 'account';
  return mapped;
}
