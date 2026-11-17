import { describe, expect, it } from 'vitest';
import { evaluateBadges, type BadgeInput, type BadgeResult } from '../src/badges.ts';
import { daysLeft, describeChallenge, evaluateChallenge, eventChallengeWindow, type ChallengeContext } from '../src/challenges.ts';
import type { ChargingSession } from '../src/charging.ts';
import { dailyTotals } from '../src/distance.ts';
import {
  activeEvent,
  adventDays,
  adventFact,
  adventVisible,
  eventChallengeForWeek,
  eventInstance,
  startedEvents,
  WINTERRIT,
  WINTERRIT_SCHEDULE,
  winterBadgeId,
} from '../src/events.ts';
import type { TimedValue } from '../src/milestones.ts';
import { dayProgress } from '../src/progress.ts';
import { weekKey, zonedMidnight } from '../src/time.ts';
import { tripBlocks } from '../src/trips.ts';

const TZ = 'Europe/Amsterdam';
/** Local time in Amsterdam (CET, UTC+1, in winter) as epoch ms. */
const local = (day: string, hh = 0, mm = 0) => zonedMidnight(day, TZ) + (hh * 60 + mm) * 60_000;

// Fictional readings: an odometer that starts in November 2026.
function drive(trips: { day: string; hh: number; mm?: number; km: number }[], startKm = 10_000): TimedValue[] {
  const out: TimedValue[] = [{ ts: local('2026-11-01', 9), value: startKm }];
  let odo = startKm;
  for (const t of trips) {
    // Two readings 10 minutes apart: a trip block with ≥ 2 readings.
    const start = local(t.day, t.hh, t.mm ?? 0);
    odo += t.km / 2;
    out.push({ ts: start, value: odo });
    odo += t.km / 2;
    out.push({ ts: start + 10 * 60_000, value: odo });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

function badges(odometer: TimedValue[], now: number, extra: Partial<BadgeInput> = {}): Map<string, BadgeResult> {
  const input: BadgeInput = {
    odometer,
    dailyTotals: dailyTotals(odometer, TZ),
    trips: tripBlocks(odometer),
    sessions: [],
    soc: [],
    temperature: [],
    green: { co2PetrolKgPerKm: 0.18, co2GridKgPerKwh: 0.33, petrolLPer100km: 6.5 },
    batteryKwh: 77,
    hasSoc: false,
    challenges: [],
    timeZone: TZ,
    now,
    available: new Set(['odometer', 'temperature', 'charging', 'soc']),
    ...extra,
  };
  return new Map(evaluateBadges(input).filter((b) => b.category === 'evenementen').map((b) => [b.id, b]));
}

const unlocked = (m: Map<string, BadgeResult>, key: string) => m.get(winterBadgeId(2026, key))?.unlockedTs ?? null;

describe('Winterrit dates', () => {
  it('runs from 6 December 00:00 up to and including 1 January 23:59 in the HA time zone', () => {
    const w = eventInstance(WINTERRIT, 2026, TZ);
    expect(w).toMatchObject({ id: 'winterrit_2026', name: 'Winterrit 2026', startDay: '2026-12-06', endDay: '2027-01-01' });
    expect(new Date(w.start).toISOString()).toBe('2026-12-05T23:00:00.000Z'); // 00:00 CET
    expect(new Date(w.end).toISOString()).toBe('2027-01-01T23:00:00.000Z'); // 2 Jan 00:00 CET
    expect(activeEvent(local('2026-12-05', 23, 59), TZ)).toBeNull();
    expect(activeEvent(local('2026-12-06', 0, 0), TZ)?.id).toBe('winterrit_2026');
    expect(activeEvent(local('2027-01-01', 23, 59), TZ)?.id).toBe('winterrit_2026');
    expect(activeEvent(local('2027-01-02', 0, 0), TZ)).toBeNull();
  });

  it('uses the local day, not UTC', () => {
    // 5 Dec 23:30 UTC is already 6 Dec 00:30 in Amsterdam, but still 5 Dec in New York.
    const ts = Date.parse('2026-12-05T23:30:00Z');
    expect(activeEvent(ts, TZ)?.id).toBe('winterrit_2026');
    expect(activeEvent(ts, 'America/New_York')).toBeNull();
  });

  it('returns every year again and lists only occurrences that overlap the measurement', () => {
    expect(activeEvent(local('2027-12-24', 12), TZ)?.id).toBe('winterrit_2027');
    const since = local('2026-11-01');
    expect(startedEvents(local('2026-11-30'), since, TZ)).toEqual([]);
    expect(startedEvents(local('2026-12-06'), since, TZ).map((e) => e.id)).toEqual(['winterrit_2026']);
    expect(startedEvents(local('2027-12-10'), since, TZ).map((e) => e.id)).toEqual(['winterrit_2026', 'winterrit_2027']);
  });
});

describe('Winterrit weekly challenges (2026)', () => {
  it('replaces weeks 50–53 of 2026 and cuts the last week off on 1 January', () => {
    expect(WINTERRIT_SCHEDULE[2026].map((c) => [c.week, c.fromDay, c.toDay])).toEqual([
      ['2026-W50', '2026-12-07', '2026-12-13'],
      ['2026-W51', '2026-12-14', '2026-12-20'],
      ['2026-W52', '2026-12-21', '2026-12-23'],
      ['2026-W53', '2026-12-28', '2027-01-01'],
    ]);
    // The weeks really are Monday–Sunday ISO weeks.
    expect(weekKey('2026-12-07')).toBe('2026-W50');
    expect(weekKey('2027-01-03')).toBe('2026-W53');
    // Sunday 6 December belongs to the normal week before.
    expect(eventChallengeForWeek(weekKey('2026-12-06'))).toBeNull();
    // Other years: no themed weeks (yet).
    expect(eventChallengeForWeek('2027-W50')).toBeNull();
    const w = eventChallengeWindow(eventChallengeForWeek('2026-W53')!, TZ);
    expect(new Date(w.end).toISOString()).toBe('2027-01-01T23:00:00.000Z');
    expect(daysLeft('2026-W53', local('2026-12-31', 10), TZ)).toBe(2);
    expect(describeChallenge('max_km', 150, '2026-W53').title).toBe('Oliebollenweek');
  });

  const ctx = (odometer: TimedValue[], now: number, sessions: ChargingSession[] = []): ChallengeContext => ({
    progress: dayProgress(odometer, TZ),
    dailyTotals: dailyTotals(odometer, TZ),
    sessions,
    timeZone: TZ,
    now,
    trips: tripBlocks(odometer),
  });

  it('Lichtjesroute: counts km of trips that start between 16:30 and 23:59', () => {
    const odo = drive([
      { day: '2026-12-08', hh: 16, mm: 20, km: 100 }, // too early
      { day: '2026-12-09', hh: 16, mm: 30, km: 80 },
      { day: '2026-12-10', hh: 22, km: 80 },
    ]);
    const r = evaluateChallenge({ week: '2026-W50', type: 'lights_km', target: 150 }, ctx(odo, local('2026-12-11')));
    expect(r.current).toBe(160);
    expect(r.status).toBe('done');
    expect(r.completedTs).toBe(local('2026-12-10', 22, 10));
  });

  it('Pakjesronde: done on the fifth driving day', () => {
    const odo = drive(['14', '15', '16', '18', '19'].map((d) => ({ day: `2026-12-${d}`, hh: 9, km: 20 })));
    const r = evaluateChallenge({ week: '2026-W51', type: 'event_days', target: 5 }, ctx(odo, local('2026-12-20', 12)));
    expect(r.current).toBe(5);
    expect(r.completedTs).toBe(local('2026-12-19', 9));
  });

  it('Vol voor de feestdagen: a session ending at 100% between 21 and 23 December', () => {
    const session = (end: number, socEnd: number): ChargingSession => ({ start: end - 3_600_000, end, ongoing: false, type: 'AC', typeSource: 'sensor', socStart: 50, socEnd, kwh: 30, kwhMethod: 'soc', avgKw: 11 });
    const odo = drive([]);
    const tooEarly = evaluateChallenge({ week: '2026-W52', type: 'full_charge', target: 100 }, ctx(odo, local('2026-12-25'), [session(local('2026-12-20', 23), 100)]));
    expect(tooEarly.status).toBe('missed');
    const ok = evaluateChallenge({ week: '2026-W52', type: 'full_charge', target: 100 }, ctx(odo, local('2026-12-23', 23, 59), [session(local('2026-12-23', 23, 30), 100)]));
    expect(ok).toMatchObject({ status: 'done', current: 100, completedTs: local('2026-12-23', 23, 30) });
    const tooLate = evaluateChallenge({ week: '2026-W52', type: 'full_charge', target: 100 }, ctx(odo, local('2026-12-26'), [session(local('2026-12-24', 0, 10), 100)]));
    expect(tooLate.status).toBe('missed');
  });

  it('Oliebollenweek: fewer than 150 km, judged on 1 January 23:59', () => {
    const odo = drive([{ day: '2026-12-29', hh: 10, km: 100 }, { day: '2027-01-02', hh: 10, km: 500 }]);
    const ch = { week: '2026-W53', type: 'max_km' as const, target: 150 };
    expect(evaluateChallenge(ch, ctx(odo, local('2027-01-01', 23, 58))).status).toBe('active');
    const done = evaluateChallenge(ch, ctx(odo, local('2027-01-02', 0, 1)));
    expect(done).toMatchObject({ status: 'done', current: 100, completedTs: local('2027-01-01', 23, 59) });
    const busy = drive([{ day: '2026-12-29', hh: 10, km: 100 }, { day: '2027-01-01', hh: 12, km: 60 }]);
    expect(evaluateChallenge(ch, ctx(busy, local('2027-01-03'))).status).toBe('missed');
  });
});

describe('Winterrit badges', () => {
  const AFTER = local('2027-01-05');

  it('appear when the event starts, with the year in id and name, and stay visible afterwards', () => {
    expect(badges(drive([]), local('2026-12-05', 12)).size).toBe(0);
    const during = badges(drive([]), local('2026-12-06', 0, 1));
    expect(during.get(winterBadgeId(2026, 'kerstrit'))).toMatchObject({ name: 'Kerstrit 2026', category: 'evenementen', unlockedTs: null });
    expect(during.get(winterBadgeId(2026, 'witte_kerst'))?.hidden).toBe(true);
    expect(during.get(winterBadgeId(2026, 'kerstrit'))?.availableUntil).toBe(local('2027-01-02'));
    expect(badges(drive([]), AFTER).size).toBe(7);
  });

  it('Pakjesavondrit: ≥ 1 km on 6 December', () => {
    expect(unlocked(badges(drive([{ day: '2026-12-06', hh: 14, km: 5 }]), AFTER), 'pakjesavondrit')).toBe(local('2026-12-06', 14));
    expect(unlocked(badges(drive([{ day: '2026-12-07', hh: 14, km: 5 }]), AFTER), 'pakjesavondrit')).toBeNull();
  });

  it('Kerstrit: ≥ 1 km on 25 or 26 December', () => {
    expect(unlocked(badges(drive([{ day: '2026-12-26', hh: 11, km: 3 }]), AFTER), 'kerstrit')).toBe(local('2026-12-26', 11));
    expect(unlocked(badges(drive([{ day: '2026-12-24', hh: 11, km: 3 }]), AFTER), 'kerstrit')).toBeNull();
  });

  it('Witte kerst: a trip (≥ 2 readings) on 24–26 December starting below 0 °C', () => {
    const odo = drive([{ day: '2026-12-24', hh: 8, km: 10 }, { day: '2026-12-25', hh: 8, km: 10 }]);
    const temp = [
      { ts: local('2026-12-24', 7), value: 1.5 },
      { ts: local('2026-12-25', 7), value: -2 },
    ];
    expect(unlocked(badges(odo, AFTER, { temperature: temp }), 'witte_kerst')).toBe(local('2026-12-25', 8, 10));
    expect(unlocked(badges(odo, AFTER, { temperature: temp.slice(0, 1) }), 'witte_kerst')).toBeNull();
    // Without a temperature sensor the badge does not exist.
    expect(badges(odo, AFTER, { available: new Set(['odometer']) }).has(winterBadgeId(2026, 'witte_kerst'))).toBe(false);
  });

  it('Rendier-express: 1,000 km during the event (not before it)', () => {
    const before = drive([{ day: '2026-12-05', hh: 9, km: 600 }, { day: '2026-12-10', hh: 9, km: 600 }]);
    expect(unlocked(badges(before, AFTER), 'rendier_express')).toBeNull();
    const during = drive([{ day: '2026-12-10', hh: 9, km: 600 }, { day: '2026-12-30', hh: 9, km: 500 }]);
    expect(unlocked(badges(during, AFTER), 'rendier_express')).toBe(local('2026-12-30', 9, 10));
    const sofar = drive([{ day: '2026-12-10', hh: 9, km: 600 }]);
    expect(badges(sofar, local('2026-12-20')).get(winterBadgeId(2026, 'rendier_express'))?.progress).toEqual({ current: 600, target: 1000, unit: 'km' });
  });

  it('Oudejaarsrit: a trip on 31 December that starts before 18:00', () => {
    expect(unlocked(badges(drive([{ day: '2026-12-31', hh: 17, mm: 50, km: 8 }]), AFTER), 'oudejaarsrit')).toBe(local('2026-12-31', 18, 0));
    expect(unlocked(badges(drive([{ day: '2026-12-31', hh: 18, km: 8 }]), AFTER), 'oudejaarsrit')).toBeNull();
  });

  it('Lichtjesjager and Kerstster: from the themed challenges', () => {
    const done = (week: string, day: string) => ({ week, completedTs: local(day, 12) });
    const three = [done('2026-W50', '2026-12-12'), done('2026-W51', '2026-12-18'), done('2026-W52', '2026-12-22')];
    const b3 = badges(drive([]), AFTER, { challenges: three });
    expect(unlocked(b3, 'lichtjesjager')).toBe(local('2026-12-12', 12));
    expect(unlocked(b3, 'kerstster')).toBeNull();
    expect(b3.get(winterBadgeId(2026, 'kerstster'))?.progress).toEqual({ current: 3, target: 4, unit: 'uitdagingen' });
    const four = [...three, { week: '2026-W53', completedTs: local('2027-01-01', 23, 59) }];
    expect(unlocked(badges(drive([]), AFTER, { challenges: four }), 'kerstster')).toBe(local('2027-01-01', 23, 59));
  });

  it('can only be achieved during the event', () => {
    // Driving on 6 December 2027 does not unlock the 2026 badge.
    const odo = drive([{ day: '2027-12-06', hh: 10, km: 5 }]);
    const later = badges(odo, local('2027-12-07'));
    expect(unlocked(later, 'pakjesavondrit')).toBeNull();
    expect(later.get(winterBadgeId(2027, 'pakjesavondrit'))?.unlockedTs).toBe(local('2027-12-06', 10));
    // 2027 has no themed weeks, so no challenge badges for that year.
    expect(later.has(winterBadgeId(2027, 'kerstster'))).toBe(false);
  });
});

describe('advent calendar', () => {
  it('has 26 doors from 6 to 31 December', () => {
    const days = adventDays(2026);
    expect(days).toHaveLength(26);
    expect(days[0]).toBe('2026-12-06');
    expect(days.at(-1)).toBe('2026-12-31');
    expect(adventVisible('2026-12-05')).toBe(false);
    expect(adventVisible('2026-12-06')).toBe(true);
    expect(adventVisible('2026-12-31')).toBe(true);
    expect(adventVisible('2027-01-01')).toBe(false);
  });

  it('makes a fact from the own data or the world-trip distances', () => {
    const totals = new Map([
      ['2026-12-01', 900],
      ['2026-12-03', 800],
    ]);
    const facts = adventDays(2026).map((day) => adventFact({ day, dailyTotals: totals, odometer: 11_700, sessionsThisYear: 12 }));
    expect(facts.some((f) => f.includes('net zo ver als van Amsterdam naar Rome'))).toBe(true);
    expect(facts.every((f) => f.length > 10 && f.length < 140)).toBe(true);
    // Deterministic per day.
    expect(adventFact({ day: '2026-12-10', dailyTotals: totals, odometer: 11_700, sessionsThisYear: 12 })).toBe(facts[4]);
  });
});
