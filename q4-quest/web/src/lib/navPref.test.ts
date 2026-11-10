import { describe, expect, it } from 'vitest';
import { resolveNav } from './navPref.ts';

describe('resolveNav', () => {
  // Fictional user agent strings.
  const companion = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Home Assistant/2026.11.0-1234';
  const browser = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';

  it('honours an explicit choice', () => {
    expect(resolveNav('top', companion)).toBe('top');
    expect(resolveNav('bottom', browser)).toBe('bottom');
  });

  it('puts the navigation at the bottom in the Companion app when automatic', () => {
    expect(resolveNav('auto', companion)).toBe('bottom');
    expect(resolveNav('auto', browser)).toBe('top');
  });
});
