import type { SensorKey } from '../options.ts';

export interface MockReading {
  key: SensorKey;
  ts: number; // epoch milliseconds
  value: string;
  attrs: Record<string, unknown>;
}

export interface MockOptions {
  seed?: number;
  days?: number;
  endTs?: number;
  startOdometer?: number;
  batteryKwh?: number;
}

/** Small deterministic PRNG (mulberry32) so mock data is reproducible. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const KWH_PER_KM = 0.18;

/**
 * Generate a few months of fully synthetic history: trips (odometer, SoC,
 * range, parking brake) and charging sessions (power, state, type, SoC).
 * Nothing here is based on real data.
 */
export function generateMockHistory(opts: MockOptions = {}): MockReading[] {
  const rng = createRng(opts.seed ?? 42);
  const days = opts.days ?? 120;
  const batteryKwh = opts.batteryKwh ?? 77;
  const endTs = opts.endTs ?? Date.now();
  const startDay = Math.floor((endTs - days * DAY) / DAY) * DAY;

  const out: MockReading[] = [];
  let odometer = opts.startOdometer ?? 8_250;
  let soc = 80;
  const push = (key: SensorKey, ts: number, value: string, attrs: Record<string, unknown> = {}) => {
    if (ts <= endTs) out.push({ key, ts: Math.round(ts), value, attrs });
  };
  const pushSoc = (ts: number) => {
    push('soc', ts, soc.toFixed(0), { unit_of_measurement: '%' });
    push('range', ts, ((soc / 100) * batteryKwh / KWH_PER_KM).toFixed(0), { unit_of_measurement: 'km' });
  };

  const charge = (start: number, dc: boolean, targetSoc: number) => {
    const maxKw = dc ? 50 + rng() * 125 : 11;
    push('charging_state', start, 'charging');
    push('charging_type', start, dc ? 'DC' : 'AC');
    let t = start;
    while (soc < targetSoc) {
      // DC tapers off at high SoC.
      const kw = dc ? Math.max(20, maxKw * (soc < 60 ? 1 : (100 - soc) / 40)) : maxKw * (0.95 + rng() * 0.05);
      push('charging_power', t, kw.toFixed(1), { unit_of_measurement: 'kW' });
      const step = dc ? 5 * MIN : 15 * MIN;
      soc = Math.min(targetSoc, soc + (kw * (step / HOUR) / batteryKwh) * 100);
      t += step;
      pushSoc(t);
    }
    push('charging_power', t, '0', { unit_of_measurement: 'kW' });
    push('charging_state', t, 'not_charging');
    return t;
  };

  pushSoc(startDay);
  push('odometer', startDay, odometer.toFixed(0), { unit_of_measurement: 'km' });

  for (let d = 0; d <= days; d++) {
    const dayStart = startDay + d * DAY;
    const weekday = new Date(dayStart).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    const restDay = rng() < (weekend ? 0.3 : 0.1);
    const trips = restDay ? 0 : 1 + Math.floor(rng() * 3);

    let hour = 6 + rng() * 3;
    for (let i = 0; i < trips; i++) {
      // Occasionally a very early or very late trip.
      const r = rng();
      const startHour = i === 0 && r < 0.04 ? 1 + rng() * 2 : i === 0 && r < 0.1 ? 5 + rng() : hour;
      let t = dayStart + startHour * HOUR;
      const long = rng() < 0.08;
      let km = long ? 150 + rng() * 300 : 8 + rng() * 45;

      push('parking_brake', t, 'off');
      while (km > 0) {
        // DC stop when the battery runs low on a long trip.
        if (soc < 15) {
          t = charge(t, true, 80) + 5 * MIN;
        }
        const step = Math.min(km, 10 + rng() * 10);
        km -= step;
        odometer += step;
        soc = Math.max(3, soc - ((step * KWH_PER_KM) / batteryKwh) * 100);
        t += (step / 80) * HOUR;
        push('odometer', t, odometer.toFixed(0), { unit_of_measurement: 'km' });
        pushSoc(t);
      }
      push('parking_brake', t, 'on');
      hour = (t - dayStart) / HOUR + 1 + rng() * 5;
      if (hour > 22) break;
    }

    // Home charging in the evening when the battery is getting low.
    if (soc < 45 || rng() < 0.1) {
      charge(dayStart + (20 + rng() * 3) * HOUR, false, rng() < 0.15 ? 100 : 80);
    }
  }

  return out.sort((a, b) => a.ts - b.ts);
}
