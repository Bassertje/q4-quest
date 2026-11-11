import { describe, expect, it } from 'vitest';
import { chargePeriodView, type ChargePeriodInput } from '../src/charge-period.ts';
import type { ChargingSession } from '../src/charging.ts';
import { addDays, zonedMidnight } from '../src/time.ts';

const TZ = 'Europe/Amsterdam';
const H = 3_600_000;
const at = (day: string, hour: number) => zonedMidnight(day, TZ) + hour * H;

function session(day: string, hour: number, kwh: number, type: 'AC' | 'DC', socStart: number, socEnd: number): ChargingSession {
  const start = at(day, hour);
  return { start, end: start + 2 * H, ongoing: false, type, typeSource: 'sensor', socStart, socEnd, kwh, kwhMethod: 'soc', avgKw: kwh / 2 };
}

// Fictional data: driving 50 km per day from 1 Oct 2026, SoC drops 10% per day.
function input(now = at('2026-11-10', 12)): ChargePeriodInput {
  const odometer = [];
  const soc = [];
  for (let d = 0; d < 41; d++) {
    const ts = at(addDays('2026-10-01', d), 0);
    odometer.push({ ts, value: 1000 + d * 50 });
    soc.push({ ts, value: 80 - (d % 7) * 10 });
  }
  const sessions = [
    session('2026-10-05', 20, 30, 'AC', 40, 80),
    session('2026-11-02', 9, 40, 'DC', 20, 70),
    session('2026-11-09', 22, 20, 'AC', 50, 75),
  ];
  return {
    sessions,
    energy: { odometer, soc, sessions, batteryKwh: 80, hasSoc: true },
    firstDay: '2026-10-01',
    timeZone: TZ,
    now,
  };
}

describe('chargePeriodView', () => {
  it('shows all data per month by default with totals across all sessions', () => {
    const v = chargePeriodView(input(), 'all', null);
    expect(v.label).toBe('Alles');
    expect(v.bucket).toBe('month');
    expect(v.buckets.map((b) => b.key)).toEqual(['2026-10', '2026-11']);
    expect(v.buckets[1]).toMatchObject({ ac: 20, dc: 40 });
    expect(v.totals).toMatchObject({ sessions: 3, kwh: 90, ac: { sessions: 2, kwh: 50 }, dc: { sessions: 1, kwh: 40 } });
    expect(v.sessions[0].start).toBeGreaterThan(v.sessions[1].start);
    expect(v.prev).toBeNull();
    expect(v.next).toBeNull();
  });

  it('shows every day of a month, with only that month’s sessions, and pages back to the first month', () => {
    const v = chargePeriodView(input(), 'month', null);
    expect(v.key).toBe('2026-11');
    expect(v.label).toBe('november 2026');
    expect(v.buckets).toHaveLength(30);
    expect(v.buckets.find((b) => b.key === '2026-11-02')).toMatchObject({ dc: 40, ac: 0 });
    expect(v.totals.sessions).toBe(2);
    expect(v.prev).toBe('2026-10');
    expect(v.next).toBeNull();
    const oct = chargePeriodView(input(), 'month', '2026-10');
    expect(oct.prev).toBeNull();
    expect(oct.next).toBe('2026-11');
  });

  it('dims days and months before the first measurement and clamps keys to the data range', () => {
    const y = chargePeriodView(input(), 'year', '2020');
    expect(y.key).toBe('2026');
    expect(y.buckets).toHaveLength(12);
    expect(y.buckets.filter((b) => b.beforeStart)).toHaveLength(9);
    const w = chargePeriodView(input(), 'week', '2026-W40');
    expect(w.label).toBe('week 40, 2026');
    expect(w.buckets.map((b) => b.beforeStart)).toEqual([true, true, true, false, false, false, false]);
    expect(chargePeriodView(input(), 'week', '2030-W01').key).toBe('2026-W46');
    expect(chargePeriodView(input(), 'week', 'nonsense').key).toBe('2026-W46');
  });

  it('computes consumption as charged kWh plus SoC difference over km, from 100 km', () => {
    // Week 46 so far: 10 Nov 00:00 → now; one day of data is too little.
    const week = chargePeriodView(input(), 'week', null);
    expect(week.consumption?.kwhPer100km).toBeNull();
    // October: 30 kWh charged; SoC 80% on 1 Oct → 60% on 31 Oct (last reading before 1 Nov) = 16 kWh; 1500 km.
    const oct = chargePeriodView(input(), 'month', '2026-10');
    expect(oct.consumption).toEqual({ km: 1500, usedKwh: 46, kwhPer100km: 3.1 });
  });

  it('computes Groen over the period with the used energy, and uses the all-time totals for "Alles"', () => {
    const factors = { co2PetrolKgPerKm: 0.15, co2GridKgPerKwh: 0.3, petrolLPer100km: 6 };
    // October: 1500 km × 0.15 − 46 kWh × 0.3 = 211.2 → 211 kg; 90 litres; 10.6 trees.
    const oct = chargePeriodView({ ...input(), green: factors }, 'month', '2026-10');
    expect(oct.green).toEqual({ co2Kg: 211, liters: 90, trees: 10.6 });
    const total = { co2Kg: 999, liters: 1, trees: 1 };
    expect(chargePeriodView({ ...input(), green: factors, greenAll: total }, 'all', null).green).toBe(total);
    expect(chargePeriodView(input(), 'month', '2026-10').green).toBeNull();
  });
});

describe('averagePower', () => {
  it('averages kWh ÷ duration per session, overall and per type', async () => {
    const { averagePower } = await import('../src/charge-period.ts');
    const s = (type: 'AC' | 'DC', avgKw: number | null, ongoing = false) => ({ type, avgKw, ongoing }) as ChargingSession;
    expect(averagePower([s('AC', 10), s('AC', 11), s('DC', 90), s('DC', null), s('AC', 50, true)])).toEqual({ avgKw: 37, acKw: 10.5, dcKw: 90 });
    expect(averagePower([s('AC', 7.4)])).toEqual({ avgKw: 7.4, acKw: 7.4, dcKw: null });
  });
});
