import React from 'react';
import { motion, type Variants } from 'framer-motion';
import { ArrowRight, ExternalLink } from 'lucide-react';
import {
  DEFAULT_WELCOME_COPY,
  FEATURE_CHIPS,
  WALLPAPER_PHOTO_CREDIT,
  WALLPAPER_PHOTO_CREDIT_URL,
} from '../../lib/welcomeCopy';
import { useUiStore } from '../../stores/uiStore';

export interface WelcomeHeroProps {
  onGetStarted: () => void;
  onSignIn: () => void;
  isFreshInstall?: boolean;
  signupsDisabled?: boolean;
  customHeadline?: string | null;
  customDescription?: string | null;
}

export const WelcomeHero: React.FC<WelcomeHeroProps> = ({
  onGetStarted,
  onSignIn,
  isFreshInstall = false,
  signupsDisabled = false,
  customHeadline,
  customDescription,
}) => {
  const branding = useUiStore((s) => s.branding);
  const reduceMotion = useUiStore((s) => s.reduceMotion);

  const siteName = branding.siteName || 'VOLQ AI';

  // Determine copy based on app state & admin overrides
  const eyebrowText = isFreshInstall
    ? DEFAULT_WELCOME_COPY.freshInstall.eyebrow
    : DEFAULT_WELCOME_COPY.eyebrow(siteName);

  const headlineText =
    customHeadline?.trim() ||
    (isFreshInstall
      ? DEFAULT_WELCOME_COPY.freshInstall.headline
      : DEFAULT_WELCOME_COPY.headline);

  const descriptionText =
    customDescription?.trim() ||
    (isFreshInstall
      ? DEFAULT_WELCOME_COPY.freshInstall.description(siteName)
      : DEFAULT_WELCOME_COPY.description(siteName));

  const primaryCtaLabel = isFreshInstall
    ? DEFAULT_WELCOME_COPY.freshInstall.primaryCta
    : signupsDisabled
    ? DEFAULT_WELCOME_COPY.secondaryLink
    : DEFAULT_WELCOME_COPY.primaryCta;

  const handlePrimaryClick = () => {
    if (isFreshInstall || !signupsDisabled) {
      onGetStarted();
    } else {
      onSignIn();
    }
  };

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: reduceMotion ? 0 : 0.08,
        delayChildren: reduceMotion ? 0 : 0.1,
      },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: reduceMotion ? 0 : 18 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: reduceMotion ? 0.15 : 0.6,
        ease: [0.16, 1, 0.3, 1] as const,
      },
    },
  };

  return (
    <main
      id="welcome-hero-content"
      className="flex-1 flex flex-col justify-between px-6 sm:px-10 md:px-14 py-4 md:py-8 max-w-7xl w-full mx-auto"
    >
      {/* Hero Content Column (Left-aligned, Vertically Centered) */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="my-auto max-w-[620px] pt-4 pb-12 space-y-6 sm:space-y-7"
      >
        {/* Eyebrow */}
        <motion.p
          variants={itemVariants}
          className="text-[12px] sm:text-[13px] font-semibold tracking-[0.18em] uppercase text-[var(--wallpaper-content-subtle)]"
        >
          {eyebrowText}
        </motion.p>

        {/* Headline */}
        <motion.h1
          variants={itemVariants}
          className="text-[clamp(2.4rem,5.5vw,4.5rem)] font-semibold tracking-[-0.03em] leading-[1.05] text-[var(--wallpaper-content-text)]"
        >
          {headlineText}
        </motion.h1>

        {/* Description */}
        <motion.p
          variants={itemVariants}
          className="text-[16px] sm:text-[17.5px] leading-[1.62] text-[var(--wallpaper-content-muted)] max-w-[50ch]"
        >
          {descriptionText}
        </motion.p>

        {/* CTA Row */}
        <motion.div
          variants={itemVariants}
          className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 sm:gap-6"
        >
          {/* Primary Solid Action Button */}
          <button
            type="button"
            onClick={handlePrimaryClick}
            className="group relative inline-flex items-center justify-center gap-3 h-[52px] px-8 rounded-full font-semibold text-[15px] sm:text-[16px] bg-[var(--wallpaper-cta-bg)] text-[var(--wallpaper-cta-text)] shadow-lg hover:shadow-xl hover:-translate-y-[1px] active:scale-[0.98] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-white"
          >
            <span>{primaryCtaLabel}</span>
            <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
          </button>

          {/* Secondary Link + Muted Detail (Hidden on fresh install) */}
          {!isFreshInstall && (
            <div className="flex items-center gap-3 justify-center sm:justify-start">
              {!signupsDisabled ? (
                <>
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="text-[15px] font-medium text-[var(--wallpaper-content-text)] hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded px-1 py-0.5"
                  >
                    {DEFAULT_WELCOME_COPY.secondaryLink}
                  </button>
                  <span
                    aria-hidden="true"
                    className="text-[var(--wallpaper-content-subtle)] text-xs"
                  >
                    ·
                  </span>
                  <span className="text-[13px] text-[var(--wallpaper-content-subtle)]">
                    {DEFAULT_WELCOME_COPY.secondaryDetail}
                  </span>
                </>
              ) : (
                <span className="text-[13.5px] text-[var(--wallpaper-content-subtle)]">
                  {DEFAULT_WELCOME_COPY.signupsDisabled.notice}
                </span>
              )}
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* Bottom Bar: Feature Chips (Left) + Wallpaper Photo Credit (Right) */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="w-full pt-6 border-t border-[var(--border-subtle)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
      >
        {/* Feature Chips */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {FEATURE_CHIPS.map((chip) => {
            const Icon = chip.icon;
            return (
              <div
                key={chip.id}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--border)] bg-[var(--glass-fill)] backdrop-blur-md text-[13px] text-[var(--wallpaper-content-text)] select-none shadow-xs"
              >
                <Icon className="w-3.5 h-3.5 text-[var(--wallpaper-content-muted)]" />
                <span className="font-normal">{chip.label}</span>
              </div>
            );
          })}
        </div>

        {/* Unsplash Photo Credit */}
        <div className="text-[12px] text-[var(--wallpaper-content-subtle)] self-end md:self-auto shrink-0">
          <a
            href={WALLPAPER_PHOTO_CREDIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-[var(--wallpaper-content-muted)] transition-colors focus-visible:outline-none focus-visible:underline"
          >
            <span>{WALLPAPER_PHOTO_CREDIT}</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </a>
        </div>
      </motion.div>
    </main>
  );
};
