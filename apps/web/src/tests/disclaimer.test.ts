import { describe, expect, it } from 'vitest';
import { getComposerDisclaimer } from '../lib/welcomeCopy';

describe('Item 2: Composer Dynamic Disclaimer', () => {
  it('formats default branding disclaimer correctly', () => {
    expect(getComposerDisclaimer('VOLQ AI')).toBe(
      'VOLQ AI can make mistakes. Verify critical details.'
    );
  });

  it('updates dynamically with custom branding site name', () => {
    expect(getComposerDisclaimer('Acme Intelligence')).toBe(
      'Acme Intelligence can make mistakes. Verify critical details.'
    );
  });

  it('falls back to default when siteName is empty or whitespace', () => {
    expect(getComposerDisclaimer('')).toBe(
      'VOLQ AI can make mistakes. Verify critical details.'
    );
    expect(getComposerDisclaimer('   ')).toBe(
      'VOLQ AI can make mistakes. Verify critical details.'
    );
    expect(getComposerDisclaimer(undefined)).toBe(
      'VOLQ AI can make mistakes. Verify critical details.'
    );
  });
});
