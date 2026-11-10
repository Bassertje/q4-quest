import { describe, expect, it } from 'vitest';
import type { BadgeResult } from '../src/badges.ts';
import type { ChargingSession } from '../src/charging.ts';
import { dailyTotals } from '../src/distance.ts';
import { buildYearReview, yearsWithReview } from '../src/year.ts';

const at = (iso: string) => Date.parse(iso);

describe('yearsWithReview', () => {
  it('makes past years available and the current year from 1 December', () => {
    expect(yearsWithReview('2025-07-13', '2026-11-30')).toEqual([
      { year: 2025, available: true, running: false },
      { year: 2026, available: false, running: true },
    ]);
    expect(yearsWithReview('2025-07-13', '2026-12-01').at(-1)).toEqual({ year: 2026, available: true, running: true });
    expect(yearsWithReview(null, '2026-12-01')).toEqual([]);
  });
});

describe('buildYearReview', () => {
  // Fictional data: measurement starts mid-2025 at 9,000 km.
  const odometer = [
    { ts: at('2025-07-01T08:00:00Z'), value: 9_000 },
    { ts: at('2025-12-30T18:00:00Z'), value: 9_500 },
    { ts: at('2026-01-02T18:00:00Z'), value: 9_620 }, // +120
    { ts: at('2026-01-03T18:00:00Z'), value: 9_700 }, // +80
    { ts: at('2026-01-04T18:00:00Z'), value: 9_750 }, // +50
    { ts: at('2026-03-10T18:00:00Z'), value: 10_100 }, // +350
  ];
  const totals = dailyTotals(odometer, 'UTC');
  const badge = (id: string, xp: number, unlockedTs: number | null, category: BadgeResult['category'] = 'rijden'): BadgeResult => ({
    id, name: id, description: '', hint: '', category, xp, hidden: false, icon: 'car', unlockedTs, progress: null,
  });
  const badges = [
    badge('milestone_7500', 750, odometer[0].ts, 'wereldreis'), // reached before measuring
    badge('first_100_day', 50, at('2026-01-02T18:00:00Z')),
    badge('milestone_10000', 1_000, at('2026-03-10T18:00:00Z'), 'wereldreis'),
  ];
  const session = (iso: string, type: 'AC' | 'DC', kwh: number): ChargingSession => ({
    start: at(iso), end: at(iso) + 3_600_000, ongoing: false, type, socStart: 20, socEnd: 60, kwh, kwhMethod: 'soc', avgKw: kwh,
  });
  const sessions = [session('2025-12-01T10:00:00Z', 'AC', 30), session('2026-01-05T10:00:00Z', 'AC', 30), session('2026-02-01T10:00:00Z', 'DC', 50)];
  const now = at('2026-12-15T12:00:00Z');
  const review = (year: number) => buildYearReview({ year, odometer, dailyTotals: totals, sessions, badges, timeZone: 'UTC', now })!;

  it('sums the year and finds its records', () => {
    const r = review(2026);
    expect(r.totalKm).toBe(600);
    expect(r.daysDriven).toBe(4);
    expect(r.bestDay).toEqual({ key: '2026-03-10', km: 350 });
    expect(r.bestWeek).toEqual({ key: '2026-W11', km: 350 });
    expect(r.longestStreak).toEqual({ days: 3, start: '2026-01-02', end: '2026-01-04' });
    expect(r.running).toBe(true);
    expect(r.startedThisYear).toBe(false);
    expect(r.earth.laps).toBeCloseTo(600 / 40_075);
  });

  it('counts only charging sessions and badges of this year', () => {
    const r = review(2026);
    expect(r.charging).toMatchObject({ sessions: 2, kwh: 80, ac: { sessions: 1, kwh: 30 }, dc: { sessions: 1, kwh: 50 } });
    expect(r.newBadges.map((b) => b.id)).toEqual(['first_100_day', 'milestone_10000']);
  });

  it('measures level growth including bonus XP', () => {
    // Start of 2026: 9,500 km + 750 bonus = 10,250 XP (level 13). Now: 10,100 + 1,800 = 11,900 XP (level 14).
    expect(review(2026).level).toEqual({ start: 13, end: 14, startRank: 'Wegvreter', endRank: 'Wegvreter', xpGained: 1_650 });
  });

  it('starts a first year at the first reading, without badges from before', () => {
    const r = review(2025);
    expect(r.startedThisYear).toBe(true);
    expect(r.from).toBe('2025-07-01');
    expect(r.to).toBe('2025-12-31');
    expect(r.newBadges).toEqual([]);
    expect(r.totalKm).toBe(500);
  });

  it('returns null for years without data', () => {
    expect(buildYearReview({ year: 2024, odometer, dailyTotals: totals, sessions, badges, timeZone: 'UTC', now })).toBeNull();
  });
});
