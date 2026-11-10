import { periodEnergy, type EnergyInput } from './consumption.ts';
import { shiftPeriod } from './periods.ts';
import type { TimedValue } from './milestones.ts';
import { dayKey, monthKey, zonedMidnight } from './time.ts';
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
  /** Energy used (charged + SoC difference). */
  kwh: number;
  /** Consumption estimate; null with fewer than 100 km. */
  kwhPer100km: number | null;
  /** Mean of the daily average temperatures; null without temperature data. */
  avgTemp: number | null;
}

export const MONTH_CONSUMPTION_MIN_KM = 100;

/** Consumption (energy used ÷ km) and average temperature per calendar month, oldest first. */
export function monthlyStats(
  dailyTotals: Map<string, number>,
  energy: EnergyInput,
  dailyTemps: Map<string, number>,
  timeZone: string,
  now: number,
): MonthStats[] {
  const months = new Set<string>();
  for (const d of dailyTotals.keys()) months.add(monthKey(d));
  for (const d of dailyTemps.keys()) months.add(monthKey(d));
  return [...months].sort().map((month) => {
    const from = zonedMidnight(`${month}-01`, timeZone);
    const to = Math.min(now + 1, zonedMidnight(`${shiftPeriod('month', month, 1)}-01`, timeZone));
    const e = periodEnergy(energy, from, to);
    const temps = [...dailyTemps].filter(([d]) => monthKey(d) === month).map(([, t]) => t);
    const km = [...dailyTotals].filter(([d]) => monthKey(d) === month).reduce((a, [, v]) => a + v, 0);
    return {
      month,
      km: Math.round(e?.km ?? km),
      kwh: e?.usedKwh ?? 0,
      kwhPer100km: e && e.km >= MONTH_CONSUMPTION_MIN_KM ? e.kwhPer100km : null,
      avgTemp: temps.length ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length) * 10) / 10 : null,
    };
  });
}
