import { describe, expect, it } from 'vitest';
import { BADGES, bonusEvents, evaluateBadges, worldTripBadges, type BadgeInput, type Requirement } from '../src/badges.ts';
import type { ChargingSession } from '../src/charging.ts';
import { dailyTotals } from '../src/distance.ts';
import { timeline } from '../src/timeline.ts';
import { tripBlocks } from '../src/trips.ts';

const H = 3_600_000;
const MIN = 60_000;
const TZ = 'UTC';
const at = (iso: string) => Date.parse(iso);

/** Build a badge input from fictional odometer readings. */
function input(
  odometer: { ts: number; value: number }[],
  extra: Partial<BadgeInput> = {},
  available: Requirement[] = ['odometer', 'charging', 'soc', 'temperature'],
): BadgeInput {
  return {
    odometer,
    dailyTotals: dailyTotals(odometer, TZ),
    trips: tripBlocks(odometer),
    sessions: [],
    soc: [],
    temperature: [],
    green: { co2PetrolKgPerKm: 0.18, co2GridKgPerKwh: 0.33, petrolLPer100km: 6.5 },
    challenges: [],
    batteryKwh: 77,
    hasSoc: false,
    timeZone: TZ,
    now: at('2026-12-31T00:00:00Z'),
    available: new Set(available),
    ...extra,
  };
}

const unlocked = (i: BadgeInput, id: string) => evaluateBadges(i).find((b) => b.id === id)?.unlockedTs ?? null;

/** A day with readings every 10 minutes from `startIso`, `km` in total. */
function drive(startIso: string, fromKm: number, km: number, stepKm = 10) {
  const out: { ts: number; value: number }[] = [];
  let t = at(startIso);
  for (let d = stepKm; d <= km; d += stepKm) {
    t += 10 * MIN;
    out.push({ ts: t, value: fromKm + d });
  }
  return out;
}

describe('badge definitions', () => {
  it('have unique ids and the XP values from the spec', () => {
    const ids = BADGES.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.fromEntries(BADGES.map((b) => [b.id, b.xp]))).toMatchObject({
      first_100_day: 50, day_300: 150, day_500: 300, streak_7: 100, streak_30: 400, month_1000: 200,
      week_1000: 300, weekend_warrior: 100, night_owl: 75, early_bird: 75, rest_day: 25, first_charge: 25,
      first_dc: 50, charges_10: 50, charges_50: 150, charges_100: 300, full_tank: 50, running_on_fumes: 75,
      dc_150: 100, mwh_1: 250, eco_week: 100, moon_trip: 5000,
    });
    expect(BADGES.find((b) => b.id === 'moon_trip')?.category).toBe('legendarisch');
  });

  it('world-trip badges give km ÷ 10 XP and tell their story', () => {
    const w = worldTripBadges();
    expect(w).toHaveLength(11);
    expect(w.every((b) => b.category === 'wereldreis' && b.description === b.hint)).toBe(true);
    expect(w.find((b) => b.id === 'karman')).toMatchObject({ xp: 10, name: 'Kármánlijn', description: 'Recht omhoog was je nu in de ruimte.', icon: 'rocket' });
    expect(w.find((b) => b.id === 'milestone_1000')?.xp).toBe(100);
    expect(w.find((b) => b.id === 'milestone_40075')?.xp).toBe(4_007);
    // The removed plain milestones are gone.
    expect(w.map((b) => b.id)).not.toContain('milestone_2500');
  });
});

describe('driving badges', () => {
  const base = [{ ts: at('2026-03-01T06:00:00Z'), value: 10_000 }];

  it('dates a day badge at the reading that crossed the distance', () => {
    const odo = [...base, ...drive('2026-03-02T08:00:00Z', 10_000, 120)];
    // The 10th reading (100 km) is at 08:00 + 100 min.
    expect(unlocked(input(odo), 'first_100_day')).toBe(at('2026-03-02T09:40:00Z'));
    expect(unlocked(input(odo), 'day_300')).toBeNull();
  });

  it('counts a weekend as Saturday plus Sunday', () => {
    // 2026-03-07 is a Saturday.
    const odo = [...base, ...drive('2026-03-07T10:00:00Z', 10_000, 120), ...drive('2026-03-08T10:00:00Z', 10_120, 90)];
    // 120 km on Saturday; the remaining 80 km are reached on Sunday at 11:20.
    expect(unlocked(input(odo), 'weekend_warrior')).toBe(at('2026-03-08T11:20:00Z'));
  });

  it('awards a 7-day streak on the 7th day', () => {
    const odo = [...base];
    for (let d = 0; d < 7; d++) odo.push({ ts: at(`2026-03-0${2 + d}T12:00:00Z`), value: 10_000 + (d + 1) * 5 });
    expect(unlocked(input(odo), 'streak_7')).toBe(at('2026-03-08T12:00:00Z'));
  });

  it('awards the hidden rest day after 7 complete days without driving', () => {
    const odo = [...base, { ts: at('2026-03-01T08:00:00Z'), value: 10_010 }, { ts: at('2026-03-10T08:00:00Z'), value: 10_020 }];
    // 2–8 March: 7 days without driving; awarded at midnight after 8 March.
    expect(unlocked(input(odo), 'rest_day')).toBe(at('2026-03-09T00:00:00Z'));
    expect(evaluateBadges(input(odo)).find((b) => b.id === 'rest_day')?.hidden).toBe(true);
  });

  it('only counts time-based trips with at least two readings', () => {
    const single = [...base, { ts: at('2026-03-02T02:30:00Z'), value: 10_020 }];
    expect(unlocked(input(single), 'night_owl')).toBeNull();
    const double = [...single, { ts: at('2026-03-02T02:50:00Z'), value: 10_035 }];
    expect(unlocked(input(double), 'night_owl')).toBe(at('2026-03-02T02:50:00Z'));
    const early = [...base, { ts: at('2026-03-03T05:10:00Z'), value: 10_005 }, { ts: at('2026-03-03T05:30:00Z'), value: 10_020 }];
    expect(unlocked(input(early), 'early_bird')).toBe(at('2026-03-03T05:30:00Z'));
  });

  it('uses the local time zone for night trips', () => {
    // 23:30 UTC is 00:30 in Amsterdam (winter time).
    const odo = [...base, { ts: at('2026-03-02T23:30:00Z'), value: 10_010 }, { ts: at('2026-03-02T23:45:00Z'), value: 10_020 }];
    expect(unlocked(input(odo, { timeZone: 'Europe/Amsterdam', dailyTotals: dailyTotals(odo, 'Europe/Amsterdam') }), 'night_owl')).not.toBeNull();
    expect(unlocked(input(odo), 'night_owl')).toBeNull();
  });
});

describe('charging badges', () => {
  const odo = [{ ts: at('2026-03-01T06:00:00Z'), value: 10_000 }];
  const session = (n: number, over: Partial<ChargingSession> = {}): ChargingSession => ({
    start: at('2026-03-02T10:00:00Z') + n * 24 * H,
    end: at('2026-03-02T11:00:00Z') + n * 24 * H,
    ongoing: false,
    type: 'AC', typeSource: 'sensor' as const,
    socStart: 40,
    socEnd: 80,
    kwh: 30.8,
    kwhMethod: 'soc',
    avgKw: 30.8,
    ...over,
  });

  it('counts sessions and uses the corrected session data', () => {
    const sessions = Array.from({ length: 12 }, (_, i) => session(i));
    sessions[3] = session(3, { type: 'DC', avgKw: 74.9 });
    sessions[5] = session(5, { type: 'DC', avgKw: 75, socEnd: 100 });
    const i = input(odo, { sessions });
    expect(unlocked(i, 'first_charge')).toBe(sessions[0].end);
    expect(unlocked(i, 'first_dc')).toBe(sessions[3].end);
    expect(unlocked(i, 'dc_150')).toBe(sessions[5].end); // average ≥ 75 kW
    expect(unlocked(i, 'full_tank')).toBe(sessions[5].end);
    expect(unlocked(i, 'charges_10')).toBe(sessions[9].end);
    expect(unlocked(i, 'charges_50')).toBeNull();
  });

  it('awards running on fumes for a measured SoC of 10% or lower', () => {
    const soc = [
      { ts: at('2026-03-02T10:00:00Z'), value: 12 },
      { ts: at('2026-03-02T11:00:00Z'), value: 10 },
    ];
    expect(unlocked(input(odo, { soc }), 'running_on_fumes')).toBe(at('2026-03-02T11:00:00Z'));
  });

  it('hides charging badges when the sensors are not configured', () => {
    const ids = evaluateBadges(input(odo, {}, ['odometer'])).map((b) => b.id);
    expect(ids).toContain('first_100_day');
    expect(ids).not.toContain('first_charge');
    expect(ids).not.toContain('running_on_fumes');
    expect(ids).not.toContain('eco_week');
  });

  it('awards an eco week only after the week is complete', () => {
    // ISO week 10 of 2026: Mon 2 – Sun 8 March. 200 km driven, 30 kWh charged = 15 kWh/100 km.
    const drives = [...odo];
    for (let d = 0; d < 4; d++) drives.push({ ts: at(`2026-03-0${2 + d}T12:00:00Z`), value: 10_000 + (d + 1) * 50 });
    const i = input(drives, { sessions: [session(0, { kwh: 30 })] });
    expect(unlocked(i, 'eco_week')).toBe(at('2026-03-09T00:00:00Z'));
    expect(unlocked({ ...i, now: at('2026-03-07T12:00:00Z') }, 'eco_week')).toBeNull();
  });
});

describe('badge progress', () => {
  const odo = [
    { ts: at('2026-03-01T06:00:00Z'), value: 12_345 },
    { ts: at('2026-03-02T12:00:00Z'), value: 12_400 },
    { ts: at('2026-03-03T12:00:00Z'), value: 12_460 },
  ];
  const sessions = Array.from({ length: 6 }, (_, n) => ({
    start: at('2026-03-02T20:00:00Z') + n * H, end: at('2026-03-02T20:30:00Z') + n * H, ongoing: false,
    type: 'AC' as const, typeSource: 'sensor' as const, socStart: 40, socEnd: 60, kwh: 15.4, kwhMethod: 'soc' as const, avgKw: 30.8,
  }));
  const results = evaluateBadges(input(odo, { sessions, now: at('2026-03-03T18:00:00Z') }));
  const progress = (id: string) => results.find((b) => b.id === id)?.progress;

  it('reports current / target for countable badges', () => {
    expect(progress('downunder')).toEqual({ current: 12_460, target: 16_600, unit: 'km' });
    expect(progress('charges_10')).toEqual({ current: 6, target: 10, unit: 'sessies' });
    expect(progress('streak_7')).toEqual({ current: 2, target: 7, unit: 'dagen' });
    expect(progress('month_1000')).toEqual({ current: 115, target: 1000, unit: 'km' });
    expect(progress('mwh_1')).toEqual({ current: 92, target: 1000, unit: 'kWh' });
    expect(progress('moon_trip')).toEqual({ current: 12_460, target: 384_400, unit: 'km' });
  });

  it('caps progress at the target and has none for other badges', () => {
    expect(progress('transsib')).toEqual({ current: 9_289, target: 9_289, unit: 'km' });
    expect(progress('first_100_day')).toBeNull();
  });
});

describe('temperature, green and challenge badges', () => {
  const odo = [
    { ts: at('2026-01-04T12:00:00Z'), value: 20_000 },
    { ts: at('2026-01-05T06:10:00Z'), value: 20_010 },
    { ts: at('2026-01-05T06:30:00Z'), value: 20_030 },
    { ts: at('2026-01-06T12:00:00Z'), value: 20_100 },
    { ts: at('2026-01-07T12:00:00Z'), value: 20_200 },
  ];
  const temperature = [
    { ts: at('2026-01-05T05:00:00Z'), value: -3 },
    { ts: at('2026-01-06T12:00:00Z'), value: 2 },
    { ts: at('2026-01-07T12:00:00Z'), value: 3 },
  ];
  const session = (iso: string, kwh: number): ChargingSession => ({
    start: at(iso), end: at(iso) + H, ongoing: false, type: 'AC', typeSource: 'sensor' as const, socStart: 30, socEnd: 60, kwh, kwhMethod: 'soc', avgKw: kwh,
  });

  it('awards IJskoud for a trip with two readings that started below 0 °C', () => {
    expect(unlocked(input(odo, { temperature }), 'ice_cold')).toBe(at('2026-01-05T06:30:00Z'));
    expect(unlocked(input(odo, { temperature: [] }), 'ice_cold')).toBeNull();
  });

  it('awards Winterhard for a cold, efficient complete week', () => {
    // Week 2 of 2026 (5–11 Jan): 200 km, 36 kWh = 18 kWh/100 km, average 0.7 °C.
    const i = input(odo, { temperature, sessions: [session('2026-01-06T20:00:00Z', 36)] });
    expect(unlocked(i, 'winter_hard')).toBe(at('2026-01-12T00:00:00Z'));
    const thirsty = input(odo, { temperature, sessions: [session('2026-01-06T20:00:00Z', 44)] }); // 22 kWh/100 km
    expect(unlocked(thirsty, 'winter_hard')).toBeNull();
  });

  it('dates the green badges when the CO₂ saving passes the threshold', () => {
    const long = [{ ts: at('2026-03-01T08:00:00Z'), value: 1_000 }, { ts: at('2026-03-02T08:00:00Z'), value: 1_700 }];
    const i = input(long, { sessions: [] });
    // 700 km × 0.18 = 126 kg ≥ 100 kg at the second reading.
    expect(unlocked(i, 'green_start')).toBe(at('2026-03-02T08:00:00Z'));
    expect(evaluateBadges(i).find((b) => b.id === 'first_ton')?.progress).toEqual({ current: 126, target: 1000, unit: 'kg' });
    expect(evaluateBadges(i).find((b) => b.id === 'never_refuel')?.progress).toEqual({ current: 45, target: 1000, unit: 'l' });
  });

  it('counts completed weekly challenges', () => {
    const challenges = Array.from({ length: 10 }, (_, n) => ({ week: `w${n}`, completedTs: 1000 + n }));
    expect(unlocked(input(odo, { challenges }), 'challenger')).toBe(1009);
    expect(evaluateBadges(input(odo, { challenges })).find((b) => b.id === 'persistent')?.progress).toEqual({ current: 10, target: 25, unit: 'uitdagingen' });
  });

  it('hides temperature badges without a temperature sensor', () => {
    const ids = evaluateBadges(input(odo, {}, ['odometer', 'charging'])).map((b) => b.id);
    expect(ids).not.toContain('ice_cold');
    expect(ids).not.toContain('winter_hard');
    expect(ids).toContain('green_start');
  });
});

describe('bonus XP over time', () => {
  it('lets badge XP cause level-ups in the timeline', () => {
    const odo = [
      { ts: 1, value: 50 },
      { ts: 10, value: 60 },
    ];
    // 60 km + 50 bonus XP = 110 XP: level 1 at the moment of the badge.
    const badges = [
      { id: 'x', name: 'X', description: '', hint: '', category: 'rijden' as const, xp: 50, hidden: false, icon: 'car', unlockedTs: 20, progress: null },
    ];
    const t = timeline(odo, badges);
    expect(t.events).toEqual([
      { type: 'level', ts: 20, level: 1, rank: 'Leerling', newRank: false },
      { type: 'badge', ts: 20, id: 'x', name: 'X', xp: 50, icon: 'car' },
    ].sort((a, b) => (a.type === 'badge' ? -1 : 1) - (b.type === 'badge' ? -1 : 1)));
    expect(bonusEvents(badges)).toEqual([{ ts: 20, xp: 50 }]);
  });
});
