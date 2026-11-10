import { describe, expect, it } from 'vitest';
import { chartWindow, isoWeekStart, periodOf, shiftPeriod } from '../src/periods.ts';

describe('periods', () => {
  it('finds the Monday of an ISO week', () => {
    expect(isoWeekStart('2026-W46')).toBe('2026-11-09');
    expect(isoWeekStart('2026-W01')).toBe('2025-12-29');
    expect(isoWeekStart('2026-W53')).toBe('2026-12-28');
  });

  it('shifts days, weeks and months across year boundaries', () => {
    expect(shiftPeriod('day', '2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftPeriod('week', '2026-W01', -1)).toBe('2025-W52');
    expect(shiftPeriod('week', '2026-W52', 1)).toBe('2026-W53');
    expect(shiftPeriod('week', '2026-W53', 1)).toBe('2027-W01');
    expect(shiftPeriod('month', '2026-01', -1)).toBe('2025-12');
    expect(shiftPeriod('month', '2026-11', 13)).toBe('2027-12');
  });

  it('maps a day to its period', () => {
    expect(periodOf('week', '2026-11-10')).toBe('2026-W46');
    expect(periodOf('month', '2026-11-10')).toBe('2026-11');
  });

  it('builds a fixed window with zeros and dimmed periods before the start', () => {
    const bars = chartWindow([['2026-10', 500], ['2026-11', 100]], 'month', '2026-11', 4, '2026-10');
    expect(bars).toEqual([
      { key: '2026-08', km: 0, beforeStart: true },
      { key: '2026-09', km: 0, beforeStart: true },
      { key: '2026-10', km: 500, beforeStart: false },
      { key: '2026-11', km: 100, beforeStart: false },
    ]);
  });
});
