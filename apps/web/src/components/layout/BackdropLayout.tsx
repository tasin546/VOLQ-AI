import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { WALLPAPER_MANIFEST } from '../../assets/wallpaperManifest';
import { useUiStore } from '../../stores/uiStore';

export interface BackdropLayoutProps {
  children: React.ReactNode;
  variant?: 'welcome' | 'auth' | 'onboarding';
}

export const BackdropLayout: React.FC<BackdropLayoutProps> = ({
  children,
  variant = 'welcome',
}) => {
  const resolvedTheme = useUiStore((s) => s.resolvedTheme);
  const reduceMotion = useUiStore((s) => s.reduceMotion);
  const reduceTransparency = useUiStore((s) => s.reduceTransparency);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [parallaxOffset, setParallaxOffset] = useState({ x: 0, y: 0 });

  const isAmoled = resolvedTheme === 'amoled';
  const isAuthOrOnboarding = variant === 'auth' || variant === 'onboarding';

  // Pointer parallax (fine pointer on desktop only, disabled on touch/reduced motion)
  useEffect(() => {
    if (reduceMotion) return;
    const isFinePointer = window.matchMedia('(pointer: fine)').matches;
    if (!isFinePointer) return;

    let rafId: number;
    const handleMouseMove = (e: MouseEvent) => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (document.hidden) return;
        const normalizedX = (e.clientX / window.innerWidth - 0.5) * -12;
        const normalizedY = (e.clientY / window.innerHeight - 0.5) * -12;
        setParallaxOffset({ x: normalizedX, y: normalizedY });
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(rafId);
    };
  }, [reduceMotion]);

  const handleImageError = () => {
    if (!imageFailed) {
      console.warn('[VOLQ] Wallpaper image not found, using gradient fallback');
      setImageFailed(true);
    }
  };

  return (
    <div className="relative min-h-dvh w-full overflow-x-hidden bg-[var(--bg)] text-[var(--text)] select-none">
      {/* Fixed Fullscreen Wallpaper & Scrim Container */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-0 overflow-hidden pointer-events-none"
      >
        {/* Fallback Gradient if asset is missing */}
        {imageFailed ? (
          <div
            className="absolute inset-0"
            style={{
              background:
                isAmoled
                  ? 'radial-gradient(ellipse at 54% 50%, #0A1418 0%, #000000 80%)'
                  : resolvedTheme === 'frost'
                  ? 'radial-gradient(ellipse at 54% 50%, #D8E7E9 0%, #F4F5F7 80%)'
                  : 'radial-gradient(ellipse at 54% 50%, #152E35 0%, #050506 80%)',
            }}
          />
        ) : (
          <>
            {/* Instant 24px Blurred Base64 Placeholder */}
            <img
              src={WALLPAPER_MANIFEST.placeholderBase64}
              alt=""
              role="presentation"
              className="absolute inset-0 h-full w-full object-cover filter blur-xl scale-105 opacity-80 transition-opacity duration-700"
              style={{
                objectPosition: 'var(--wallpaper-focal-desktop, 54% 55%)',
                opacity: imageLoaded ? 0 : 0.85,
              }}
            />

            {/* High-res Picture with Responsive srcset */}
            <motion.div
              className="absolute inset-[-20px]"
              animate={
                reduceMotion
                  ? undefined
                  : {
                      x: parallaxOffset.x,
                      y: parallaxOffset.y,
                      scale: imageLoaded ? 1.02 : 1.06,
                    }
              }
              transition={{
                x: { type: 'spring', damping: 30, stiffness: 120, mass: 0.5 },
                y: { type: 'spring', damping: 30, stiffness: 120, mass: 0.5 },
                scale: { duration: 1.4, ease: [0.16, 1, 0.3, 1] },
              }}
            >
              <picture>
                <source
                  type="image/avif"
                  srcSet={WALLPAPER_MANIFEST.srcset.avif}
                  sizes={WALLPAPER_MANIFEST.sizes}
                />
                <source
                  type="image/webp"
                  srcSet={WALLPAPER_MANIFEST.srcset.webp}
                  sizes={WALLPAPER_MANIFEST.sizes}
                />
                <img
                  src={WALLPAPER_MANIFEST.defaultSrc}
                  srcSet={WALLPAPER_MANIFEST.srcset.jpg}
                  sizes={WALLPAPER_MANIFEST.sizes}
                  alt=""
                  role="presentation"
                  fetchPriority="high"
                  decoding="async"
                  onLoad={() => setImageLoaded(true)}
                  onError={handleImageError}
                  className="h-full w-full object-cover transition-opacity duration-1000 ease-out"
                  style={{
                    objectPosition: 'var(--wallpaper-focal-desktop, 54% 55%)',
                    opacity: imageLoaded ? 1 : 0,
                  }}
                />
              </picture>
            </motion.div>
          </>
        )}

        {/* Global Photo Darkening / Tint Overlay */}
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            backgroundColor: 'var(--wallpaper-photo-overlay)',
          }}
        />

        {/* Theme-Aware Left Scrim */}
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            background: 'var(--wallpaper-scrim-left)',
          }}
        />

        {/* Top Vignette (Softening Header Area) */}
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            background: 'var(--wallpaper-scrim-vignette)',
          }}
        />

        {/* Bottom Meltdown Scrim (Blends foreground peak road into page background) */}
        <div
          className="absolute inset-0 transition-opacity duration-500"
          style={{
            background: 'var(--wallpaper-scrim-bottom)',
          }}
        />

        {/* Auth / Onboarding Stage Darkening & Backdrop Blur */}
        {isAuthOrOnboarding && (
          <div
            className="absolute inset-0 transition-all duration-500"
            style={{
              backdropFilter: reduceTransparency ? 'none' : 'blur(14px) saturate(140%)',
              backgroundColor:
                isAmoled
                  ? 'rgba(0, 0, 0, 0.42)'
                  : resolvedTheme === 'frost'
                  ? 'rgba(248, 250, 252, 0.35)'
                  : 'rgba(5, 5, 6, 0.40)',
            }}
          />
        )}

        {/* Subtle Film Grain (Obsidian and Frost only, strictly disabled in AMOLED) */}
        {!isAmoled && !reduceTransparency && (
          <div
            className="absolute inset-0 pointer-events-none transition-opacity duration-300"
            style={{
              opacity: 'var(--wallpaper-grain-opacity, 0.035)',
              filter: 'url(#volq-noise-filter)',
            }}
          />
        )}
      </div>

      {/* Foreground Content Stack */}
      <div className="relative z-10 flex min-h-dvh flex-col justify-between">
        {children}
      </div>
    </div>
  );
};
