import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { StarterPrompt } from '../../lib/types';
import { getLocalizedGreeting, resolveUserTimezone } from '../../lib/timezone';
import { useAuthStore } from '../../stores/authStore';

interface EmptyStateHeaderProps {
  hasModels: boolean;
}

export const EmptyStateHeader: React.FC<EmptyStateHeaderProps> = ({ hasModels }) => {
  const user = useAuthStore((s) => s.user);
  const displayName = user?.displayName ?? 'there';
  const timeZone = resolveUserTimezone(user?.preferences?.timezone);

  const [greetingText, setGreetingText] = useState(() =>
    getLocalizedGreeting(timeZone, displayName)
  );

  useEffect(() => {
    const update = () => {
      setGreetingText(getLocalizedGreeting(timeZone, displayName));
    };
    update();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        update();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    const interval = setInterval(update, 60_000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, [timeZone, displayName]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="flex flex-col items-center text-center px-4 mb-8"
    >
      <h1
        className="font-semibold tracking-[-0.03em] text-[var(--text)] leading-[1.12] [text-wrap:balance]"
        style={{ fontSize: 'clamp(30px, 4.2vw, 42px)' }}
      >
        {greetingText}
      </h1>
      <p className="mt-3 text-sm text-[var(--text-muted)] max-w-md">
        {hasModels
          ? 'Ask a question, paste code, or type / to insert a saved prompt.'
          : 'No models available yet. An administrator can configure connections and model visibility in Admin.'}
      </p>
    </motion.div>
  );
};

interface StarterPromptChipsProps {
  prompts: StarterPrompt[];
  onSelect: (promptText: string) => void;
}

export const StarterPromptChips: React.FC<StarterPromptChipsProps> = ({ prompts, onSelect }) => {
  if (prompts.length === 0) return null;

  return (
    <div
      className="w-full max-w-[760px] mx-auto mt-6 px-3 sm:px-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5"
      aria-label="Starter prompts"
    >
      {prompts.slice(0, 4).map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect(item.prompt)}
          className="text-left px-4 py-3.5 rounded-[var(--radius-lg)] liquid-glass liquid-interactive text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <div className="font-medium text-[var(--text)] truncate">{item.label}</div>
          <div className="mt-0.5 text-[12px] text-[var(--text-subtle)] truncate">
            {item.prompt}
          </div>
        </button>
      ))}
    </div>
  );
};
