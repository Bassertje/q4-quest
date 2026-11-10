import { describe, expect, it } from 'vitest';
import { agoShort, dayNoYear, monthTitle } from './format.ts';

describe('compact labels', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');

  it('formats the age for the LCD', () => {
    expect(agoShort(now - 60_000, now)).toBe('NU');
    expect(agoShort(now - 12 * 60_000, now)).toBe('12M');
    expect(agoShort(now - 3 * 3_600_000, now)).toBe('3U');
    expect(agoShort(now - 50 * 3_600_000, now)).toBe('2D');
  });

  it('formats short dates without year and month headings', () => {
    expect(dayNoYear(Date.parse('2026-11-09T10:00:00Z'), 'UTC')).toBe('ma 9 nov');
    expect(monthTitle(Date.parse('2026-11-09T10:00:00Z'), 'UTC')).toBe('November 2026');
  });
});
