import { describe, expect, it } from 'vitest';
import {
  formatLimitDisplay,
  getSmartStep,
  sliderPositionToValue,
  valueToSliderPosition,
} from '../components/ui/LimitSlider';

describe('LimitSlider scales & sync math', () => {
  it('maps messages linearly across 1..1000', () => {
    expect(valueToSliderPosition(1, 'messages')).toBe(0);
    expect(valueToSliderPosition(1000, 'messages')).toBe(1000);
    expect(sliderPositionToValue(0, 'messages')).toBe(1);
    expect(sliderPositionToValue(1000, 'messages')).toBe(1000);
    expect(sliderPositionToValue(500, 'messages')).toBeGreaterThanOrEqual(495);
    expect(sliderPositionToValue(500, 'messages')).toBeLessThanOrEqual(505);
  });

  it('maps tokens logarithmically across 10K..50M and clamps values above 50M cleanly', () => {
    expect(valueToSliderPosition(10_000, 'tokens')).toBe(0);
    expect(valueToSliderPosition(50_000_000, 'tokens')).toBe(1000);
    expect(valueToSliderPosition(90_000_000, 'tokens')).toBe(1000);
    expect(sliderPositionToValue(0, 'tokens')).toBe(10_000);
    expect(sliderPositionToValue(1000, 'tokens')).toBe(50_000_000);
    const mid = sliderPositionToValue(500, 'tokens');
    expect(mid).toBeGreaterThan(400_000);
    expect(mid).toBeLessThan(1_000_000);
  });

  it('computes smart steppers and human formatting accurately', () => {
    expect(getSmartStep(50, 'messages')).toBe(1);
    expect(getSmartStep(250, 'messages')).toBe(10);
    expect(getSmartStep(50_000, 'tokens')).toBe(5_000);
    expect(getSmartStep(500_000, 'tokens')).toBe(50_000);
    expect(getSmartStep(2_000_000, 'tokens')).toBe(500_000);

    expect(formatLimitDisplay(1, 'messages')).toBe('1 message');
    expect(formatLimitDisplay(150, 'messages')).toBe('150 messages');
    expect(formatLimitDisplay(250_000, 'tokens')).toBe('250K tokens');
    expect(formatLimitDisplay(1_500_000, 'tokens')).toBe('1.5M tokens');
  });
});
