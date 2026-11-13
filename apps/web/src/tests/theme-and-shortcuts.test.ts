import { describe, expect, it } from 'vitest';
import { detectMacPlatform, formatModKey, formatShortcut } from '../lib/shortcuts';
import { resolveThemeMode } from '../stores/uiStore';

describe('theme resolution', () => {
  it('resolves explicit obsidian, amoled, and frost themes directly', () => {
    expect(resolveThemeMode('dark', 'dark', false)).toBe('obsidian');
    expect(resolveThemeMode('amoled', 'dark', true)).toBe('amoled');
    expect(resolveThemeMode('light', 'amoled', false)).toBe('frost');
  });

  it('resolves system theme using prefers-color-scheme and darkStyle sub-option', () => {
    expect(resolveThemeMode('system', 'dark', true)).toBe('frost');
    expect(resolveThemeMode('system', 'amoled', true)).toBe('frost');
    expect(resolveThemeMode('system', 'dark', false)).toBe('obsidian');
    expect(resolveThemeMode('system', 'amoled', false)).toBe('amoled');
  });
});

describe('platform-aware shortcuts', () => {
  it('detects macOS vs non-Mac platforms accurately', () => {
    expect(detectMacPlatform('MacIntel', 'Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe(true);
    expect(detectMacPlatform('Linux x86_64', 'Mozilla/5.0 (X11; Linux x86_64)')).toBe(false);
    expect(detectMacPlatform('Win32', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
  });

  it('formats Mac glyphs vs Ctrl/Alt/Shift text by platform', () => {
    expect(formatShortcut('⌘K', 'Ctrl+K', true)).toBe('⌘K');
    expect(formatShortcut('⌘K', 'Ctrl+K', false)).toBe('Ctrl+K');
    expect(formatModKey('o', { shift: true, isMac: true })).toBe('⇧⌘O');
    expect(formatModKey('o', { shift: true, isMac: false })).toBe('Ctrl+Shift+O');
  });
});
