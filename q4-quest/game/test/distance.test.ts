import { describe, expect, it } from 'vitest';
import { currentStreak, dailyTotals, periodTotals } from '../src/distance.ts';
import { addDays, dayKey, localHour, weekKey } from '../src/time.ts';

const TZ = 'Europe/Amsterdam';
const at = (iso: string) => Date.parse(iso);

describe('time helpers', () => {
  it('uses the given time zone for day boundaries', () => {
    // 23:30 UTC on 1 March is already 2 March in Amsterdam (UTC+1).
    expect(dayKey(at('2026-03-01T23:30:00Z'), TZ)).toBe('2026-03-02');
    expect(dayKey(at('2026-03-01T23:30:00Z'), 'UTC')).toBe('2026-03-01');
    expect(localHour(at('2026-07-01T22:15:00Z'), TZ)).toBe(0);
  });

  it('does calendar arithmetic across months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });

  it('computes ISO weeks', () => {
    expect(weekKey('2026-01-01')).toBe('2026-W01');
    expect(weekKey('2027-01-01')).toBe('2026-W53');
    expect(weekKey('2027-01-04')).toBe('2027-W01');
    expect(weekKey('2026-11-09')).toBe('2026-W46');
    expect(weekKey('2026-11-15')).toBe('2026-W46');
    expect(weekKey('2026-11-16')).toBe('2026-W47');
  });
});

describe('dailyTotals', () => {
  it('uses max − min on the first day and the delta with the previous day after that', () => {
    const totals = dailyTotals(
      [
        { ts: at('2026-05-01T08:00:00Z'), value: 1_000 },
        { ts: at('2026-05-01T17:00:00Z'), value: 1_040 },
        // Only one reading on 3 May (e.g. reported after parking).
        { ts: at('2026-05-03T18:00:00Z'), value: 1_100 },
      ],
      'UTC',
    );
    expect([...totals]).toEqual([
      ['2026-05-01', 40],
      ['2026-05-03', 60],
    ]);
  });

  it('sums today, this week and this month', () => {
    const totals = new Map([
      ['2026-10-31', 50],
      ['2026-11-08', 10], // Sunday, previous ISO week
      ['2026-11-09', 20],
      ['2026-11-10', 30],
    ]);
    expect(periodTotals(totals, '2026-11-10')).toEqual({ today: 30, week: 50, month: 60 });
  });
});

describe('currentStreak', () => {
  const totals = new Map([
    ['2026-11-06', 5],
    ['2026-11-07', 0.4],
    ['2026-11-08', 12],
    ['2026-11-09', 3],
  ]);

  it('counts consecutive days up to yesterday when today is still empty', () => {
    expect(currentStreak(totals, '2026-11-10')).toBe(2);
  });

  it('includes today once driven', () => {
    expect(currentStreak(new Map([...totals, ['2026-11-10', 8]]), '2026-11-10')).toBe(3);
  });

  it('is zero after a day without driving', () => {
    expect(currentStreak(totals, '2026-11-11')).toBe(0);
  });
});
