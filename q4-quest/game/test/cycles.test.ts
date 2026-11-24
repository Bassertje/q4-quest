import { describe, expect, it } from 'vitest';
import { evaluateBadges, type BadgeResult } from '../src/badges.ts';
import { challengeTarget, cycleKmWithin, describeChallenge, evaluateChallenge, weekBounds, type WeekStats } from '../src/challenges.ts';
import type { ChargingSession } from '../src/charging.ts';
import { cycleRecords, driveCycles, kmReachedAt, rangeTrend, type CycleInput, type DriveCycle } from '../src/cycles.ts';
import type { TimedValue } from '../src/milestones.ts';
import { tripBlocks } from '../src/trips.ts';

const H = 3_600_000;
const D = 24 * H;

/** A fictional, finished session from hour `h` (1 hour), charging from `from`% to `to`%. */
const session = (h: number, from: number, to: number, extra: Partial<ChargingSession> = {}): ChargingSession => ({
  start: h * H, end: h * H + H, ongoing: false, type: 'AC', typeSource: 'sensor', socStart: from, socEnd: to, kwh: 30, kwhMethod: 'soc', avgKw: 11, ...extra,
});

function input(partial: Partial<CycleInput>): CycleInput {
  return { sessions: [], odometer: [], soc: [], temperature: [], trips: [], batteryKwh: 77, now: 1000 * H, ...partial };
}

/** Odometer readings: [hour, km] pairs. */
const odo = (pairs: [number, number][]): TimedValue[] => pairs.map(([h, v]) => ({ ts: h * H, value: v }));

describe('drive cycles (op één lading)', () => {
  it('runs from the end of one session to the start of the next, with km, used % and the range on a full battery', () => {
    const odometer = odo([[0, 1000], [2, 1000], [30, 1150], [60, 1300], [100, 1300]]);
    const cycles = driveCycles(input({ sessions: [session(1, 30, 80), session(100, 20, 90)], odometer, now: 200 * H }));
    expect(cycles).toHaveLength(2);
    const c = cycles[0];
    expect(c).toMatchObject({ start: 2 * H, end: 100 * H, ongoing: false, socStart: 80, socEnd: 20, km: 300, usedPct: 60 });
    expect(c.rangeKm).toBe(500); // 300 km ÷ 60% × 100
    expect(c.kwhPer100km).toBe(15.4); // 60% × 77 kWh ÷ 300 km × 100
    // The cycle since the last charge is the running one.
    expect(cycles[1]).toMatchObject({ start: 101 * H, end: 200 * H, ongoing: true, socStart: 90 });
  });

  it('skips the time before the first session and stops at a session that is still running', () => {
    const odometer = odo([[0, 1000], [50, 1100]]);
    const cycles = driveCycles(input({ sessions: [session(10, 40, 80), session(60, 50, 60, { ongoing: true })], odometer, now: 70 * H }));
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({ ongoing: false, end: 60 * H, km: 100 });
  });

  it('only estimates the range from 10% used', () => {
    const odometer = odo([[0, 1000], [20, 1040]]);
    const cycles = driveCycles(input({ sessions: [session(1, 50, 80), session(30, 72, 90)], odometer }));
    expect(cycles[0]).toMatchObject({ km: 40, usedPct: 8, rangeKm: null, kwhPer100km: null });
  });

  it('averages the outdoor temperature at the start of the trips, weighted by km', () => {
    const odometer = odo([[0, 1000], [2, 1000], [10, 1000], [10.2, 1030], [20, 1030], [20.2, 1120], [40, 1120]]);
    const temperature = [{ ts: 9 * H, value: 8 }, { ts: 19 * H, value: -2 }];
    const cycles = driveCycles(input({ sessions: [session(1, 40, 90), session(40, 50, 80)], odometer, temperature, trips: tripBlocks(odometer) }));
    // 30 km at 8 °C and 90 km at −2 °C: (240 − 180) ÷ 120 = 0.5 °C.
    expect(cycles[0]).toMatchObject({ trips: 2, avgTemp: 0.5 });
  });

  it('records the lowest SoC and finds records and the range trend', () => {
    const soc = [{ ts: 50 * H, value: 18 }];
    const odometer = odo([[0, 1000], [60, 1200]]);
    const cycles = driveCycles(input({ sessions: [session(1, 40, 90), session(60, 25, 80)], odometer, soc }));
    expect(cycles[0].minSoc).toBe(18);
    const mk = (km: number, range: number | null, temp: number | null, ongoing = false) => ({ km, rangeKm: range, avgTemp: temp, ongoing }) as DriveCycle;
    const records = cycleRecords([mk(300, 400, 10), mk(150, 450, -3), mk(200, 380, -1), mk(600, null, 2, true)]);
    expect(records.longest?.km).toBe(300); // the running cycle does not count
    expect(records.bestRange?.rangeKm).toBe(450);
    expect(records.frostLongest?.km).toBe(200);
    expect(rangeTrend([mk(1, 300, 0), mk(1, 320, 4)])).toBeNull(); // too few points
    const trend = rangeTrend([mk(1, 300, 0), mk(1, 340, 5), mk(1, 380, 10), mk(1, 420, 15), mk(1, 460, 20)])!;
    expect(trend.at(0)).toBe(300);
    expect(trend.at(15)).toBe(420);
  });

  it('finds the moment a cycle reached a distance', () => {
    const odometer = odo([[0, 1000], [10, 1100], [20, 1310]]);
    expect(kmReachedAt(odometer, 0, 30 * H, 300)).toBe(20 * H);
    expect(kmReachedAt(odometer, 0, 15 * H, 300)).toBeNull();
  });
});

describe('weekly challenges on one charge', () => {
  const TZ = 'UTC';
  // Week 2026-W46: Monday 9 November 2026 00:00 UTC.
  const monday = Date.parse('2026-11-09T00:00:00Z');
  const at = (days: number) => monday + days * D;

  it('Op één lading: km on one charge within the week, from the later of the cycle start and Monday', () => {
    const odometer: TimedValue[] = [
      { ts: at(-2), value: 1000 }, // the cycle started before the week
      { ts: at(0), value: 1100 },
      { ts: at(3), value: 1350 },
      { ts: at(4), value: 1400 },
    ];
    const cycles = [{ start: at(-2), end: at(5), ongoing: false } as DriveCycle];
    const data = { cycles, odometer };
    expect(cycleKmWithin(data, at(0), at(7))).toBe(300);
    const ctx = { progress: [], dailyTotals: new Map(), sessions: [], timeZone: TZ, now: at(6), cycleData: data };
    const r = evaluateChallenge({ week: '2026-W46', type: 'cycle_km', target: 250 }, ctx);
    expect(r).toMatchObject({ status: 'done', current: 300, completedTs: at(3) });
    expect(describeChallenge('cycle_km', 250).goal).toBe('Rij deze week 250 km op één lading');
  });

  it('Bereikjager: a finished cycle that ended this week with an estimated range of at least the target', () => {
    const cycles = [
      { start: at(-3), end: at(1), ongoing: false, rangeKm: 380 },
      { start: at(1), end: at(4), ongoing: false, rangeKm: 420 },
      { start: at(4), end: at(6), ongoing: true, rangeKm: 500 }, // running: does not count
    ] as DriveCycle[];
    const ctx = { progress: [], dailyTotals: new Map(), sessions: [], timeZone: TZ, now: at(6), cycleData: { cycles, odometer: [] } };
    expect(evaluateChallenge({ week: '2026-W46', type: 'cycle_range', target: 400 }, ctx)).toMatchObject({ status: 'done', current: 420, completedTs: at(4) });
    expect(evaluateChallenge({ week: '2026-W46', type: 'cycle_range', target: 450 }, { ...ctx, now: at(8) }).status).toBe('missed');
    expect(weekBounds('2026-W46', TZ).start).toBe(monday);
  });

  it('derive their targets from the last 4 weeks (the range follows the season)', () => {
    const ws = (cycleKm: number, cycleRange: number | null) => ({ week: 'x', km: 0, days: 0, sessions: 0, kwh: 0, consumption: null, cycleKm, cycleRange }) as WeekStats;
    expect(challengeTarget('cycle_km', [ws(200, null), ws(180, null), ws(220, null), ws(200, null)])).toBe(220);
    expect(challengeTarget('cycle_range', [ws(0, 400), ws(0, 380), ws(0, null), ws(0, 420)])).toBe(420); // 400 × 1.05
    expect(challengeTarget('cycle_range', [ws(0, null), ws(0, null), ws(0, null), ws(0, null)])).toBe(350);
    expect(challengeTarget('cycle_km', [])).toBe(150);
  });
});

describe('badges on one charge', () => {
  function badges(cycles: DriveCycle[], odometer: TimedValue[], now = 5000 * H, available = ['odometer', 'charging', 'soc', 'temperature']): Map<string, BadgeResult> {
    const out = evaluateBadges({
      odometer, dailyTotals: new Map(), trips: [], sessions: [], soc: [], temperature: [],
      green: { co2PetrolKgPerKm: 0.18, co2GridKgPerKwh: 0.33, petrolLPer100km: 6.5 }, batteryKwh: 77, hasSoc: true,
      challenges: [], timeZone: 'UTC', now, available: new Set(available as never[]), cycles,
    });
    return new Map(out.map((b) => [b.id, b]));
  }
  const cyc = (start: number, end: number, extra: Partial<DriveCycle> = {}) =>
    ({ start: start * H, end: end * H, ongoing: false, km: 0, usedPct: 50, rangeKm: 400, minSoc: 30, avgTemp: 10, ...extra }) as DriveCycle;

  it('Lange adem and Marathonlading: 300 and 500 km on one charge (also the running cycle)', () => {
    const odometer = odo([[0, 1000], [10, 1200], [20, 1320], [30, 1550]]);
    const b = badges([cyc(0, 40, { km: 550, ongoing: true })], odometer);
    expect(b.get('cycle_300')?.unlockedTs).toBe(20 * H);
    expect(b.get('cycle_500')?.unlockedTs).toBe(30 * H);
    const short = badges([cyc(0, 15, { km: 200 })], odometer);
    expect(short.get('cycle_300')).toMatchObject({ unlockedTs: null, progress: { current: 200, target: 300 } });
  });

  it('Winterkoning: ≥ 250 km at an average below 5 °C (needs a temperature sensor)', () => {
    expect(badges([cyc(0, 10, { km: 260, avgTemp: 3 })], []).get('winter_king')?.unlockedTs).toBe(10 * H);
    expect(badges([cyc(0, 10, { km: 260, avgTemp: 6 })], []).get('winter_king')?.unlockedTs).toBeNull();
    expect(badges([cyc(0, 10, { km: 240, avgTemp: 1 })], []).get('winter_king')?.unlockedTs).toBeNull();
    expect(badges([], [], undefined, ['odometer', 'charging', 'soc']).has('winter_king')).toBe(false);
  });

  it('Zuinige lading: 15% above the average of the earlier cycles, with ≥ 30% used', () => {
    const base = [cyc(0, 10, { rangeKm: 380 }), cyc(10, 20, { rangeKm: 400 }), cyc(20, 30, { rangeKm: 420 })];
    expect(badges([...base, cyc(30, 40, { rangeKm: 470 })], []).get('eco_cycle')?.unlockedTs).toBe(40 * H); // ≥ 460
    expect(badges([...base, cyc(30, 40, { rangeKm: 455 })], []).get('eco_cycle')?.unlockedTs).toBeNull();
    expect(badges([...base, cyc(30, 40, { rangeKm: 500, usedPct: 20 })], []).get('eco_cycle')?.unlockedTs).toBeNull();
    expect(badges([base[0], cyc(30, 40, { rangeKm: 600 })], []).get('eco_cycle')?.unlockedTs).toBeNull(); // too little history
  });

  it('Eén keer per week: 7 days without charging and ≥ 150 km', () => {
    const odometer = odo([[0, 1000], [24, 1100], [100, 1160]]);
    expect(badges([cyc(0, 200, { km: 160 })], odometer).get('week_cycle')?.unlockedTs).toBe(168 * H); // day 7
    expect(badges([cyc(0, 160, { km: 160 })], odometer).get('week_cycle')?.unlockedTs).toBeNull(); // under 7 days
    const late = odo([[0, 1000], [24, 1100], [200, 1160]]);
    expect(badges([cyc(0, 220, { km: 160 })], late).get('week_cycle')?.unlockedTs).toBe(200 * H); // 150 km only on day 8
  });

  it('Wijze lader (hidden): 10 cycles in a row never below 20%', () => {
    const ten = Array.from({ length: 10 }, (_, i) => cyc(i * 10, i * 10 + 10, { minSoc: 20 + i }));
    expect(badges(ten, []).get('wise_charger')).toMatchObject({ hidden: true, unlockedTs: 100 * H });
    const broken = ten.map((c, i) => (i === 5 ? { ...c, minSoc: 19 } : c));
    expect(badges(broken, []).get('wise_charger')?.unlockedTs).toBeNull();
  });
});
