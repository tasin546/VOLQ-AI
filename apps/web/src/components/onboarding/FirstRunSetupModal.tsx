import React, { useId, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  Columns,
  Cpu,
  FileText,
  Laptop,
  Moon,
  Sparkles,
  Sun,
} from 'lucide-react';
import { AvatarCropDialog } from '../settings/AvatarCropDialog';
import { Button, Input } from '../ui/Primitives';
import { apiFetch } from '../../lib/api';
import type { ThemeMode } from '../../lib/types';
import { useAuthStore } from '../../stores/authStore';
import { useUiStore } from '../../stores/uiStore';

export interface FirstRunSetupModalProps {
  open: boolean;
  onComplete: () => void;
}

const THEME_OPTIONS: Array<{
  id: ThemeMode;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dark', label: 'Obsidian', desc: 'Dark glass & refined depth', icon: Moon },
  { id: 'amoled', label: 'AMOLED', desc: 'Pure #000000 true black', icon: Sparkles },
  { id: 'light', label: 'Frost', desc: 'Clean, radiant daylight', icon: Sun },
  { id: 'system', label: 'System', desc: 'Matches device settings', icon: Laptop },
];

export const FirstRunSetupModal: React.FC<FirstRunSetupModalProps> = ({
  open,
  onComplete,
}) => {
  const user = useAuthStore((s) => s.user);
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const setAvatar = useAuthStore((s) => s.setAvatar);
  const pushToast = useUiStore((s) => s.pushToast);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const reduceMotion = useUiStore((s) => s.reduceMotion);

  const [step, setStep] = useState<number>(1);
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [saving, setSaving] = useState(false);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);

  const totalSteps = 3;

  const fileInputId = useId();

  const handleFinishOrSkip = async () => {
    setSaving(true);
    try {
      await apiFetch('/api/user/onboarding-complete', { method: 'POST' });
      if (user && displayName.trim() && displayName.trim() !== user.displayName) {
        await updateProfile({ displayName: displayName.trim() });
      }
      onComplete();
    } catch {
      onComplete();
    } finally {
      setSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      pushToast('Image exceeds 5 MB limit', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(reader.result as string);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (!open) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) void handleFinishOrSkip(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-[var(--scrim-bg)] backdrop-blur-md" />
        <Dialog.Content
          onEscapeKeyDown={(e) => {
            e.preventDefault();
            void handleFinishOrSkip();
          }}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[61] w-[calc(100vw-2rem)] max-w-[560px] max-h-[90dvh] flex flex-col rounded-[24px] border border-[var(--border)] bg-[var(--surface-raised)] shadow-2xl p-6 sm:p-8 outline-none overflow-y-auto"
        >
          {/* Header & Progress Indicator */}
          <div className="flex items-center justify-between pb-4 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    s === step
                      ? 'w-7 bg-[var(--accent)]'
                      : s < step
                      ? 'w-3 bg-[var(--accent)] opacity-60'
                      : 'w-3 bg-[var(--surface-hover)]'
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => void handleFinishOrSkip()}
              className="text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white rounded px-2 py-1"
            >
              Skip for now
            </button>
          </div>

          {/* Step Contents with Staggered Transition */}
          <div className="py-6 flex-1 min-h-[280px]">
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="step-1"
                  initial={{ opacity: 0, x: reduceMotion ? 0 : 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: reduceMotion ? 0 : -16 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-[var(--text)]">
                      Choose your appearance
                    </h2>
                    <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1">
                      Select your preferred theme. You can switch at any time in Settings.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    {THEME_OPTIONS.map((opt) => {
                      const isSelected = theme === opt.id;
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setTheme(opt.id)}
                          className={`flex flex-col items-start p-3.5 rounded-[16px] border text-left transition-all duration-200 ${
                            isSelected
                              ? 'border-[var(--accent)] bg-[var(--surface-active)] shadow-sm'
                              : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full mb-2">
                            <span className="p-2 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--text)]">
                              <Icon className="w-4 h-4" />
                            </span>
                            {isSelected && (
                              <Check className="w-4 h-4 text-[var(--accent)]" />
                            )}
                          </div>
                          <span className="text-sm font-semibold text-[var(--text)]">
                            {opt.label}
                          </span>
                          <span className="text-xs text-[var(--text-muted)] mt-0.5">
                            {opt.desc}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {step === 2 && (
                <motion.div
                  key="step-2"
                  initial={{ opacity: 0, x: reduceMotion ? 0 : 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: reduceMotion ? 0 : -16 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-5"
                >
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-[var(--text)]">
                      Set up your profile
                    </h2>
                    <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1">
                      Confirm how your name appears to team members and optionally add an avatar.
                    </p>
                  </div>

                  <div className="flex items-center gap-4 pt-2">
                    <div className="relative group shrink-0">
                      <div className="w-16 h-16 rounded-full bg-[var(--surface-active)] border border-[var(--border)] flex items-center justify-center overflow-hidden">
                        {user?.hasAvatar ? (
                          <img
                            src={`/api/me/avatar?v=${user.avatarVersion ?? ''}`}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-xl font-bold text-[var(--text)]">
                            {(displayName || user?.displayName || 'U')[0]?.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <label
                        htmlFor={fileInputId}
                        className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity text-white"
                        title="Upload avatar"
                      >
                        <Camera className="w-5 h-5" />
                      </label>
                      <input
                        id={fileInputId}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        onChange={handleFileChange}
                      />
                    </div>

                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-medium text-[var(--text-muted)]">
                        Display name
                      </label>
                      <Input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Your name"
                        maxLength={60}
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              {step === 3 && (
                <motion.div
                  key="step-3"
                  initial={{ opacity: 0, x: reduceMotion ? 0 : 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: reduceMotion ? 0 : -16 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-4"
                >
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-[var(--text)]">
                      Quick overview
                    </h2>
                    <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1">
                      Here are a few quick tips to get the most out of your workspace.
                    </p>
                  </div>

                  <div className="space-y-3 pt-1">
                    <div className="p-3.5 rounded-[16px] border border-[var(--border)] bg-[var(--surface)] flex items-start gap-3.5">
                      <div className="p-2 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--text)] shrink-0">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-[var(--text)]">
                          Fast model switcher
                        </h4>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                          Press <kbd className="px-1.5 py-0.5 rounded bg-[var(--surface-raised)] border border-[var(--border)] text-[11px]">Ctrl+K</kbd> anywhere to search and switch between installed models instantly.
                        </p>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-[16px] border border-[var(--border)] bg-[var(--surface)] flex items-start gap-3.5">
                      <div className="p-2 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--text)] shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-[var(--text)]">
                          Knowledge & skills
                        </h4>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                          Attach reference documents and customized prompts directly into your chat threads.
                        </p>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-[16px] border border-[var(--border)] bg-[var(--surface)] flex items-start gap-3.5">
                      <div className="p-2 rounded-xl bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--text)] shrink-0">
                        <Columns className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-[var(--text)]">
                          Model compare
                        </h4>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                          Compare responses side by side to evaluate accuracy and model quality.
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)]">
            {step > 1 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setStep((s) => s - 1)}
                disabled={saving}
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </Button>
            ) : (
              <div />
            )}

            {step < totalSteps ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setStep((s) => s + 1)}
                disabled={saving}
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={() => void handleFinishOrSkip()}
                disabled={saving}
              >
                <span>{saving ? 'Saving...' : 'Start chatting'}</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      {/* Avatar Crop Dialog */}
      <AvatarCropDialog
        open={cropOpen}
        imageSrc={cropSrc}
        onClose={() => setCropOpen(false)}
        onUploaded={(res) => {
          setAvatar(res.hasAvatar, res.avatarVersion);
          setCropOpen(false);
          pushToast('Avatar updated');
        }}
        onError={(err) => pushToast(err, 'error')}
      />
    </Dialog.Root>
  );
};
