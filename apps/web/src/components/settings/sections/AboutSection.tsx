import React from 'react';
import { Keyboard, Shield } from 'lucide-react';
import { BrandMark } from '../../brand/BrandMark';
import { Button } from '../../ui/Primitives';
import { useUiStore } from '../../../stores/uiStore';
import type { SettingsSectionId } from '../SettingsSearchIndex';

export const AboutSection: React.FC<{ onNavigateSection: (s: SettingsSectionId) => void }> = ({
  onNavigateSection,
}) => {
  const branding = useUiStore((s) => s.branding);

  return (
    <div className="space-y-4" data-setting-row="about-info">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <BrandMark size={38} showName />
          </div>
          <span className="px-2.5 py-1 rounded-full text-xs font-mono border border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-2)]">
            v0.1.0
          </span>
        </div>

        <p className="text-sm text-[var(--text-2)] leading-relaxed">
          {branding.siteName} is an open-source, self-hostable workspace for Ollama and
          OpenAI-compatible models. Chats, knowledge bases, avatars, OAuth credentials, and usage
          telemetry remain under your server&apos;s own control.
        </p>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Button size="sm" variant="secondary" onClick={() => onNavigateSection('keyboard')}>
            <Keyboard className="w-3.5 h-3.5" />
            Keyboard shortcuts
          </Button>
          <span className="inline-flex items-center gap-1.5 text-xs text-[var(--text-muted)] px-2">
            <Shield className="w-3.5 h-3.5" />
            Encrypted secrets at rest (AES-256-GCM)
          </span>
        </div>
      </div>
    </div>
  );
};
