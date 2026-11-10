import { describe, expect, it } from 'vitest';
import { filledDaily, monthlyTotals, weeklyTotals } from '../src/aggregate.ts';
import { longestStreak } from '../src/distance.ts';
import { buildHistory } from '../src/history.ts';
import { timeline } from '../src/timeline.ts';

describe('aggregation', () => {
  const totals = new Map([
    ['2026-10-30', 10],
    ['2026-11-02', 20],
  ]);
  const daily = filledDaily(totals, '2026-10-30', '2026-11-03');

  it('fills days without data with zero', () => {
    expect(daily).toEqual([
      ['2026-10-30', 10],
      ['2026-10-31', 0],
      ['2026-11-01', 0],
      ['2026-11-02', 20],
      ['2026-11-03', 0],
    ]);
  });

  it('sums per ISO week and per month', () => {
    expect(weeklyTotals(daily)).toEqual([
      ['2026-W44', 10],
      ['2026-W45', 20],
    ]);
    expect(monthlyTotals(daily)).toEqual([
      ['2026-10', 10],
      ['2026-11', 20],
    ]);
  });
});

describe('longestStreak', () => {
  it('finds the longest run of driving days', () => {
    const totals = new Map([
      ['2026-01-01', 5],
      ['2026-01-02', 5],
      ['2026-01-04', 5],
      ['2026-01-05', 5],
      ['2026-01-06', 5],
      ['2026-01-07', 0.5],
    ]);
    expect(longestStreak(totals)).toEqual({ days: 3, start: '2026-01-04', end: '2026-01-06' });
    expect(longestStreak(new Map())).toBeNull();
  });
});

describe('timeline', () => {
  it('separates what was already reached at the first reading', () => {
    const t = timeline([
      { ts: 1, value: 950 },
      { ts: 2, value: 1_010 },
      { ts: 3, value: 1_200 },
    ]);
    // 950 km at the first reading: the Kármán line (100 km) and the ISS (408 km)
    // are already reached, and 950 XP = level 3 (levels 1–3 are "initial").
    expect(t.initial.map((e) => (e.type === 'level' ? e.level : e.type === 'milestone' ? e.km : 0))).toEqual([408, 100, 3, 2, 1]);
    // 1,010 km reaches the 1,000 km milestone and level 4 (1,000 XP) at once.
    expect(t.events).toEqual([
      { type: 'milestone', ts: 2, km: 1_000, name: '1.000 km', xp: 100 },
      { type: 'level', ts: 2, level: 4, rank: 'Leerling', newRank: false },
    ]);
  });

  it('flags a new rank', () => {
    const t = timeline([
      { ts: 1, value: 1_400 },
      { ts: 2, value: 1_500 },
    ]);
    expect(t.events[0]).toMatchObject({ type: 'level', level: 5, rank: 'Pendelaar', newRank: true });
  });
});

describe('buildHistory', () => {
  it('returns null without data and full history otherwise', () => {
    expect(buildHistory({ odometer: [], now: 0, timeZone: 'UTC' })).toBeNull();
    const h = buildHistory({
      odometer: [
        { ts: Date.parse('2026-11-01T08:00:00Z'), value: 1_000 },
        { ts: Date.parse('2026-11-01T08:20:00Z'), value: 1_020 },
        { ts: Date.parse('2026-11-03T08:00:00Z'), value: 1_100 },
      ],
      now: Date.parse('2026-11-04T12:00:00Z'),
      timeZone: 'UTC',
    })!;
    expect(h.daily.map(([, km]) => km)).toEqual([20, 0, 80, 0]);
    expect(h.records.bestDay).toEqual({ key: '2026-11-03', km: 80 });
    expect(h.records.longestTrip?.km).toBe(80);
    expect(h.trips).toHaveLength(2);
  });
});
