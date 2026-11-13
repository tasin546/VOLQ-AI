import type { LucideIcon } from 'lucide-react';
import { Cpu, HardDrive, BookOpen, Columns } from 'lucide-react';

export interface FeatureChipDef {
  id: string;
  label: string;
  icon: LucideIcon;
  featureKey?: 'models' | 'knowledge' | 'skills' | 'compare';
}

export const WALLPAPER_PHOTO_CREDIT = 'Photo by Cristina Gottardi on Unsplash';
export const WALLPAPER_PHOTO_CREDIT_URL = 'https://unsplash.com/photos/snow-covered-mountain-peak-C9h_D3s90-A';

export function getComposerDisclaimer(siteName?: string): string {
  const name = siteName?.trim() || 'VOLQ AI';
  return `${name} can make mistakes. Verify critical details.`;
}

export const DEFAULT_WELCOME_COPY = {
  eyebrow: (siteName: string) => siteName.toUpperCase(),
  headline: 'Think with any model. Keep everything yours.',
  description: (siteName: string) =>
    `${siteName} is a self-hosted workspace for local and API models. Connect Ollama or any OpenAI-compatible provider, add your own knowledge, and share it with your team, all on infrastructure you control.`,
  primaryCta: 'Get started',
  secondaryLink: 'Sign in',
  secondaryDetail: 'Self-hosted · Open source',
  freshInstall: {
    eyebrow: 'SETUP',
    headline: "Welcome. Let's set up your workspace.",
    description: (siteName: string) =>
      `This is a brand new installation of ${siteName}. Create the primary administrator account to configure your AI providers and invite your team.`,
    primaryCta: 'Create admin account',
  },
  signupsDisabled: {
    notice: 'New accounts are disabled. Contact your administrator.',
  },
};

export const FEATURE_CHIPS: FeatureChipDef[] = [
  {
    id: 'models',
    label: 'Any model, one place',
    icon: Cpu,
    featureKey: 'models',
  },
  {
    id: 'privacy',
    label: 'Your data stays yours',
    icon: HardDrive,
  },
  {
    id: 'knowledge',
    label: 'Knowledge and skills',
    icon: BookOpen,
    featureKey: 'knowledge',
  },
  {
    id: 'compare',
    label: 'Compare answers',
    icon: Columns,
    featureKey: 'compare',
  },
];
