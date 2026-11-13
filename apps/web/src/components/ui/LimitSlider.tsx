import React, { useState } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Minus, Plus } from 'lucide-react';
import type { UsagePeriod } from '../../lib/types';

export type LimitScale = 'messages' | 'tokens';

const TOKEN_MIN = 10_000;
const TOKEN_SLIDER_MAX = 50_000_000;
const TOKEN_INPUT_MAX = 100_000_000;
const MSG_SLIDER_MAX = 1_000;
const MSG_INPUT_MAX = 10_000_000;

export function valueToSliderPosition(value: number, scale: LimitScale): number {
  if (scale === 'messages') {
    const clamped = Math.max(1, Math.min(MSG_SLIDER_MAX, Math.round(value)));
    return Math.round(((clamped - 1) / (MSG_SLIDER_MAX - 1)) * 1000);
  }
  const clamped = Math.max(TOKEN_MIN, Math.min(TOKEN_SLIDER_MAX, value));
  const ratio =
    (Math.log10(clamped) - Math.log10(TOKEN_MIN)) /
    (Math.log10(TOKEN_SLIDER_MAX) - Math.log10(TOKEN_MIN));
  return Math.round(ratio * 1000);
}

export function sliderPositionToValue(pos: number, scale: LimitScale): number {
  const ratio = Math.max(0, Math.min(1, pos / 1000));
  if (scale === 'messages') {
    return Math.max(1, Math.min(MSG_SLIDER_MAX, Math.round(1 + ratio * (MSG_SLIDER_MAX - 1))));
  }
  const exp =
    Math.log10(TOKEN_MIN) + ratio * (Math.log10(TOKEN_SLIDER_MAX) - Math.log10(TOKEN_MIN));
  const raw = Math.pow(10, exp);
  // Snap cleanly to readable steps
  const step =
    raw < 50_000
      ? 1_000
      : raw < 500_000
        ? 10_000
        : raw < 5_000_000
          ? 50_000
          : 500_000;
  return Math.max(TOKEN_MIN, Math.min(TOKEN_SLIDER_MAX, Math.round(raw / step) * step));
}

export function getSmartStep(current: number, scale: LimitScale): number {
  if (scale === 'messages') {
    return current >= 100 ? 10 : 1;
  }
  if (current < 100_000) return 5_000;
  if (current < 1_000_000) return 50_000;
  return 500_000;
}

export function formatLimitDisplay(value: number, scale: LimitScale): string {
  if (scale === 'tokens') {
    if (value >= 1_000_000) {
      const m = value / 1_000_000;
      return `${Number.isInteger(m) ? m : m.toFixed(1)}M tokens`;
    }
    if (value >= 1_000) {
      const k = value / 1_000;
      return `${Number.isInteger(k) ? k : k.toFixed(1)}K tokens`;
    }
    return `${value.toLocaleString()} tokens`;
  }
  return `${value.toLocaleString()} ${value === 1 ? 'message' : 'messages'}`;
}

export interface LimitSliderProps {
  idPrefix: string;
  label: string;
  description?: string;
  scale: LimitScale;
  enabled: boolean;
  limit: number;
  period: UsagePeriod;
  onChange: (next: { enabled: boolean; limit: number; period: UsagePeriod }) => void;
  disabled?: boolean;
}

export const LimitSlider: React.FC<LimitSliderProps> = ({
  idPrefix,
  label,
  description,
  scale,
  enabled,
  limit,
  period,
  onChange,
  disabled = false,
}) => {
  const [dragging, setDragging] = useState(false);

  const safeLimit = Math.max(1, limit || (scale === 'messages' ? 100 : 250_000));
  const sliderPos = valueToSliderPosition(safeLimit, scale);
  const maxInput = scale === 'messages' ? MSG_INPUT_MAX : TOKEN_INPUT_MAX;
  const stepAmount = getSmartStep(safeLimit, scale);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface-1)] p-4 space-y-3.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-[var(--text)]">{label}</h4>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--surface-2)] text-[var(--text-2)] border border-[var(--border)]">
              {enabled ? `${formatLimitDisplay(safeLimit, scale)} / ${period}` : 'Unlimited'}
            </span>
          </div>
          {description && <p className="text-xs text-[var(--text-3)] mt-0.5">{description}</p>}
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-[var(--text-2)] cursor-pointer select-none min-h-[32px]">
          <input
            type="checkbox"
            checked={!enabled}
            disabled={disabled}
            onChange={(e) => onChange({ enabled: !e.target.checked, limit: safeLimit, period })}
            className="w-4 h-4 accent-[var(--accent)]"
          />
          <span>Unlimited</span>
        </label>
      </div>

      {enabled && (
        <div className="space-y-3 pt-1">
          <div className="relative pt-1 pb-1">
            <Slider.Root
              value={[sliderPos]}
              min={0}
              max={1000}
              step={1}
              disabled={disabled}
              aria-label={`${label} slider`}
              aria-valuetext={formatLimitDisplay(safeLimit, scale)}
              onValueChange={([nextPos]) => {
                if (typeof nextPos === 'number') {
                  onChange({
                    enabled: true,
                    limit: sliderPositionToValue(nextPos, scale),
                    period,
                  });
                }
              }}
              onPointerDown={() => setDragging(true)}
              onPointerUp={() => setDragging(false)}
              onPointerCancel={() => setDragging(false)}
              className="relative flex items-center select-none touch-none w-full h-6"
            >
              <Slider.Track className="relative grow h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
                <Slider.Range className="absolute h-full bg-[var(--accent)] rounded-full" />
              </Slider.Track>
              <Slider.Thumb className="relative block w-5 h-5 rounded-full bg-[var(--accent)] border border-[var(--border-strong)] shadow-[var(--shadow-sm)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] cursor-grab active:cursor-grabbing">
                {dragging && (
                  <span
                    className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded-[var(--radius-sm)] text-[11px] font-medium bg-[var(--accent)] text-[var(--accent-fg)] shadow-sm pointer-events-none"
                    aria-hidden="true"
                  >
                    {formatLimitDisplay(safeLimit, scale)}
                  </span>
                )}
              </Slider.Thumb>
            </Slider.Root>
            <div className="flex items-center justify-between text-[11px] text-[var(--text-3)] mt-0.5">
              <span>{scale === 'messages' ? '1' : '10K'}</span>
              <span>{scale === 'messages' ? '500' : '1M'}</span>
              <span>{scale === 'messages' ? '1,000' : '50M'}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)]">
              <button
                type="button"
                disabled={disabled || safeLimit <= 1}
                onClick={() =>
                  onChange({
                    enabled: true,
                    limit: Math.max(1, safeLimit - stepAmount),
                    period,
                  })
                }
                aria-label={`Decrease ${label}`}
                className="h-10 w-10 inline-flex items-center justify-center text-[var(--text-2)] hover:text-[var(--text)] disabled:opacity-40"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                id={`${idPrefix}-input`}
                type="number"
                min={1}
                max={maxInput}
                disabled={disabled}
                value={safeLimit}
                onChange={(e) => {
                  const parsed = Math.trunc(Number(e.target.value));
                  if (Number.isFinite(parsed) && parsed >= 1) {
                    onChange({
                      enabled: true,
                      limit: Math.min(maxInput, parsed),
                      period,
                    });
                  }
                }}
                aria-label={`${label} numeric limit`}
                className="w-28 h-10 bg-transparent text-center text-base sm:text-sm font-medium text-[var(--text)] focus:outline-none tabular-nums"
              />
              <button
                type="button"
                disabled={disabled || safeLimit >= maxInput}
                onClick={() =>
                  onChange({
                    enabled: true,
                    limit: Math.min(maxInput, safeLimit + stepAmount),
                    period,
                  })
                }
                aria-label={`Increase ${label}`}
                className="h-10 w-10 inline-flex items-center justify-center text-[var(--text-2)] hover:text-[var(--text)] disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <select
              id={`${idPrefix}-period`}
              value={period}
              disabled={disabled}
              onChange={(e) =>
                onChange({
                  enabled: true,
                  limit: safeLimit,
                  period: e.target.value as UsagePeriod,
                })
              }
              aria-label={`${label} period`}
              className="h-10 px-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface-2)] text-base sm:text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              <option value="day">per UTC Day</option>
              <option value="week">per UTC Week (Mon)</option>
              <option value="month">per UTC Month</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};
