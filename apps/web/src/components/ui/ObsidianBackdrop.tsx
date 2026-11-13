import React from 'react';
import { useUiStore } from '../../stores/uiStore';

export const ObsidianBackdrop: React.FC = () => {
  const resolvedTheme = useUiStore((s) => s.resolvedTheme);
  const reduceTransparency = useUiStore((s) => s.reduceTransparency);

  const isAmoled = resolvedTheme === 'amoled';

  if (isAmoled) {
    return null;
  }

  return (
    <>
      <svg className="sr-only" width="0" height="0" aria-hidden="true">
        <defs>
          <filter id="volq-noise-filter" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves="2"
              stitchTiles="stitch"
            />
          </filter>
          <filter id="volq-liquid-refract" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.012 0.018"
              numOctaves="2"
              seed="7"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="6"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        {!reduceTransparency && (
          <>
            <div
              className="obsidian-bloom-a absolute -top-48 -left-32 w-[560px] h-[560px] rounded-full blur-[120px] opacity-[0.06]"
              style={{
                background: 'radial-gradient(circle, var(--text) 0%, transparent 70%)',
              }}
            />
            <div
              className="obsidian-bloom-b absolute top-1/3 -right-40 w-[520px] h-[520px] rounded-full blur-[130px] opacity-[0.05]"
              style={{
                background: 'radial-gradient(circle, var(--text) 0%, transparent 72%)',
              }}
            />
            <div
              className="obsidian-bloom-a absolute -bottom-56 left-1/3 w-[600px] h-[420px] rounded-full blur-[140px] opacity-[0.04]"
              style={{
                background: 'radial-gradient(circle, var(--text) 0%, transparent 72%)',
              }}
            />
          </>
        )}

        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{ filter: 'url(#volq-noise-filter)' }}
        />
      </div>
    </>
  );
};
