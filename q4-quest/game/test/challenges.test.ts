import { describe, expect, it } from 'vitest';
import {
  challengeTarget,
  chooseChallengeType,
  daysLeft,
  describeChallenge,
  evaluateChallenge,
  historyWeeks,
  type WeekStats,
} from '../src/challenges.ts';
import type { ChargingSession } from '../src/charging.ts';
import { dailyTotals } from '../src/distance.ts';
import { dayProgress } from '../src/progress.ts';
import { buildWeekReview } from '../src/week-review.ts';

const at = (iso: string) => Date.parse(iso);
const ws = (km: number, days: number, sessions: number, consumption: number | null): WeekStats => ({
  week: 'x', km, days, sessions, kwh: 0, consumption,
});

describe('challenge targets', () => {
  const history = [ws(300, 5, 3, 17), ws(250, 4, 2, 18), ws(350, 6, 4, null), ws(300, 5, 3, 16)];

  it('derives targets from the average of the last 4 complete weeks', () => {
    expect(challengeTarget('km', history)).toBe(330); // 300 × 1.1
    expect(challengeTarget('days', history)).toBe(6); // 5 + 1
    expect(challengeTarget('max_charges', history)).toBe(2); // floor(3 × 0.9)
    expect(challengeTarget('consumption', history)).toBe(16.2); // 17 × 0.95
  });

  it('uses fixed start values without enough history', () => {
    expect(challengeTarget('km', [])).toBe(200);
    expect(challengeTarget('days', history.slice(0, 2))).toBe(4);
  });

  it('only uses history when measurement covers the last 4 weeks', () => {
    expect(historyWeeks('2026-W46', '2026-11-01', new Map(), [], 'UTC')).toEqual([]);
    expect(historyWeeks('2026-W46', '2026-10-01', new Map(), [], 'UTC').map((w) => w.week)).toEqual([
      '2026-W45', '2026-W44', '2026-W43', '2026-W42',
    ]);
  });
});

describe('choosing a challenge', () => {
  it('is deterministic and never repeats the type of last week', () => {
    const all = ['km', 'days', 'max_charges', 'consumption'] as const;
    for (let w = 1; w <= 52; w++) {
      const week = `2026-W${String(w).padStart(2, '0')}`;
      const first = chooseChallengeType(week, [...all], null);
      expect(chooseChallengeType(week, [...all], null)).toBe(first);
      expect(chooseChallengeType(week, [...all], first)).not.toBe(first);
    }
    expect(chooseChallengeType('2026-W10', ['km', 'days'], 'km')).toBe('days');
  });
});

describe('evaluating a challenge', () => {
  // Week 46 of 2026: Monday 9 – Sunday 15 November.
  const odometer = [
    { ts: at('2026-11-08T18:00:00Z'), value: 10_000 },
    { ts: at('2026-11-09T08:00:00Z'), value: 10_060 },
    { ts: at('2026-11-10T08:00:00Z'), value: 10_150 },
    { ts: at('2026-11-11T08:00:00Z'), value: 10_230 },
  ];
  const ctx = (now: string, sessions: ChargingSession[] = []) => ({
    progress: dayProgress(odometer, 'UTC'),
    dailyTotals: dailyTotals(odometer, 'UTC'),
    sessions,
    timeZone: 'UTC',
    now: at(now),
  });

  it('completes a km challenge the moment the target is reached', () => {
    const r = evaluateChallenge({ week: '2026-W46', type: 'km', target: 200 }, ctx('2026-11-12T12:00:00Z'));
    expect(r).toMatchObject({ status: 'done', current: 230, completedTs: at('2026-11-11T08:00:00Z') });
  });

  it('keeps a challenge active during the week and misses it afterwards', () => {
    const c = { week: '2026-W46', type: 'days' as const, target: 5 };
    expect(evaluateChallenge(c, ctx('2026-11-12T12:00:00Z'))).toMatchObject({ status: 'active', current: 3 });
    expect(evaluateChallenge(c, ctx('2026-11-16T00:00:01Z'))).toMatchObject({ status: 'missed', current: 3 });
  });

  it('decides charging challenges at the end of the week', () => {
    const session: ChargingSession = {
      start: at('2026-11-10T20:00:00Z'), end: at('2026-11-10T23:00:00Z'), ongoing: false, type: 'AC', typeSource: 'sensor' as const,
      socStart: 30, socEnd: 70, kwh: 30.8, kwhMethod: 'soc', avgKw: 10.3,
    };
    const c = { week: '2026-W46', type: 'max_charges' as const, target: 2 };
    expect(evaluateChallenge(c, ctx('2026-11-12T12:00:00Z', [session])).status).toBe('active');
    expect(evaluateChallenge(c, ctx('2026-11-16T01:00:00Z', [session]))).toMatchObject({
      status: 'done', current: 1, completedTs: at('2026-11-16T00:00:00Z'),
    });
  });

  it('counts days left including today and describes the goal', () => {
    expect(daysLeft('2026-W46', at('2026-11-12T12:00:00Z'), 'UTC')).toBe(4);
    expect(daysLeft('2026-W46', at('2026-11-20T12:00:00Z'), 'UTC')).toBe(0);
    expect(describeChallenge('km', 330).goal).toBe('Rij deze week 330 km');
  });
});

describe('week review', () => {
  const totals = new Map([['2026-11-10', 90], ['2026-11-11', 140], ['2026-11-03', 200]]);

  it('prefers a new record, then the challenge, then the best day', () => {
    const base = { week: '2026-W46', dailyTotals: totals, sessions: [], chargingRecords: null, timeZone: 'UTC' };
    const withRecord = buildWeekReview({ ...base, records: { bestDay: { key: '2026-11-11', km: 140 }, bestWeek: null, bestMonth: null, longestStreak: null, longestTrip: null }, challenge: null });
    expect(withRecord).toMatchObject({ km: 230, sessions: 0, factKind: 'record', fact: 'Nieuw record: Beste dag ooit (140 km)' });

    const challenge = { week: '2026-W46', type: 'km' as const, target: 250, status: 'missed' as const, current: 230, completedTs: null };
    expect(buildWeekReview({ ...base, records: null, challenge }).fact).toBe('Weekuitdaging gemist: 230 van 250 km');
    const thirsty = { week: '2026-W46', type: 'consumption' as const, target: 16.5, status: 'missed' as const, current: 17.5, completedTs: null };
    expect(buildWeekReview({ ...base, records: null, challenge: thirsty }).fact).toBe('Weekuitdaging gemist: 17,5 kWh/100 km (doel ≤ 16,5)');

    const best = buildWeekReview({ ...base, records: null, challenge: null });
    expect(best).toMatchObject({ factKind: 'bestDay', fact: 'Beste dag: woensdag met 140 km' });
  });

  it('describes a quiet week and hides sessions without charging sensors', () => {
    const r = buildWeekReview({ week: '2026-W40', dailyTotals: totals, sessions: null, records: null, chargingRecords: null, challenge: null, timeZone: 'UTC' });
    expect(r).toMatchObject({ km: 0, sessions: null, factKind: 'quiet' });
  });
});
