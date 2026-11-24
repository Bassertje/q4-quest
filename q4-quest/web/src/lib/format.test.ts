import { describe, expect, it } from 'vitest';
import { agoShort, dayNoYear, dayRange, durationLabel, monthTitle, socRange, tempShort } from './format.ts';

describe('socRange', () => {
  it('shows both percent signs', () => {
    expect(socRange(71, 100)).toBe('71% → 100%');
    expect(socRange(70.6, null)).toBe('71% → ?');
  });
});

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

describe('cycle labels', () => {
  const tz = 'Europe/Amsterdam';
  const at = (iso: string) => Date.parse(iso);
  it('formats day ranges, durations and temperatures', () => {
    expect(dayRange(at('2026-11-09T08:00:00+01:00'), at('2026-11-12T18:00:00+01:00'), tz)).toBe('ma 9 – do 12 nov');
    expect(dayRange(at('2026-11-30T08:00:00+01:00'), at('2026-12-02T18:00:00+01:00'), tz)).toBe('ma 30 nov – wo 2 dec');
    expect(dayRange(at('2026-11-09T08:00:00+01:00'), at('2026-11-09T18:00:00+01:00'), tz)).toBe('ma 9 nov');
    expect(durationLabel(14 * 3_600_000)).toBe('14 uur');
    expect(durationLabel(3 * 86_400_000)).toBe('3 dagen');
    expect(tempShort(-2.4)).toBe('−2°');
    expect(tempShort(null)).toBe('–');
  });
});
