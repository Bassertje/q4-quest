import type { ChargingSession } from './charging.ts';
import type { TimedValue } from './milestones.ts';
import { dayKey, monthKey } from './time.ts';
import type { TripBlock } from './trips.ts';

/** A temperature reading older than this is not used for "the temperature at" a moment. */
export const TEMP_MAX_AGE_MS = 3 * 3_600_000;

/** The temperature at a moment: the last reading before it, if recent enough. */
export function temperatureAt(temps: TimedValue[], ts: number, maxAgeMs = TEMP_MAX_AGE_MS): number | null {
  let found: TimedValue | null = null;
  for (const r of temps) {
    if (r.ts > ts) break;
    found = r;
  }
  return found && ts - found.ts <= maxAgeMs ? found.value : null;
}

/** Average temperature per calendar day (mean of that day's readings). */
export function dailyTemperatures(temps: TimedValue[], timeZone: string): Map<string, number> {
  const sums = new Map<string, { sum: number; n: number }>();
  for (const r of temps) {
    const d = dayKey(r.ts, timeZone);
    const s = sums.get(d) ?? { sum: 0, n: 0 };
    s.sum += r.value;
    s.n++;
    sums.set(d, s);
  }
  const out = new Map<string, number>();
  for (const [d, s] of sums) out.set(d, Math.round((s.sum / s.n) * 10) / 10);
  return out;
}

/** The temperature at the start of every trip block (null when unknown). */
export function tripStartTemperatures(trips: TripBlock[], temps: TimedValue[]): (number | null)[] {
  return trips.map((t) => temperatureAt(temps, t.start));
}

export interface MonthStats {
  month: string;
  km: number;
  kwh: number;
  /** Consumption estimate; null with fewer than 100 km or no charged kWh. */
  kwhPer100km: number | null;
  /** Mean of the daily average temperatures; null without temperature data. */
  avgTemp: number | null;
}

export const MONTH_CONSUMPTION_MIN_KM = 100;

/** Consumption and average temperature per calendar month, oldest first. */
export function monthlyStats(
  dailyTotals: Map<string, number>,
  sessions: ChargingSession[],
  dailyTemps: Map<string, number>,
  timeZone: string,
): MonthStats[] {
  const months = new Map<string, { km: number; kwh: number; temps: number[] }>();
  const get = (m: string) => {
    let v = months.get(m);
    if (!v) months.set(m, (v = { km: 0, kwh: 0, temps: [] }));
    return v;
  };
  for (const [d, km] of dailyTotals) get(monthKey(d)).km += km;
  for (const s of sessions) if (s.kwh !== null) get(monthKey(dayKey(s.start, timeZone))).kwh += s.kwh;
  for (const [d, t] of dailyTemps) get(monthKey(d)).temps.push(t);
  return [...months.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, v]) => ({
      month,
      km: Math.round(v.km),
      kwh: Math.round(v.kwh * 10) / 10,
      kwhPer100km: v.km >= MONTH_CONSUMPTION_MIN_KM && v.kwh > 0 ? Math.round((v.kwh / v.km) * 1000) / 10 : null,
      avgTemp: v.temps.length ? Math.round((v.temps.reduce((a, b) => a + b, 0) / v.temps.length) * 10) / 10 : null,
    }));
}
