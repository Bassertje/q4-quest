import type { ChargingSession } from './charging.ts';
import { atOrBefore } from './consumption.ts';
import type { TimedValue } from './milestones.ts';
import { temperatureAt } from './temperature.ts';
import type { TripBlock } from './trips.ts';

/**
 * "Op één lading" (on one charge): everything driven between the end of a
 * charging session and the start of the next one. Pure functions; derived
 * from the readings, so recalculated retroactively.
 */

/** Below this much battery used, the range estimate is too uncertain: shown, but not used for records, badges or the chart. */
export const CYCLE_MIN_USED_PCT = 10;

export interface DriveCycle {
  /** End of the charging session the cycle starts after. */
  start: number;
  /** Start of the next charging session, or now for the running cycle. */
  end: number;
  /** The running cycle (since the last charge, no new session yet). */
  ongoing: boolean;
  /** SoC at the start (end of the previous session) and at the end (start of the next, or the latest reading). */
  socStart: number | null;
  socEnd: number | null;
  /** Lowest SoC measured during the cycle. */
  minSoc: number | null;
  km: number;
  /** Battery used in percentage points (null without SoC). */
  usedPct: number | null;
  /** Estimated range on a full battery: km ÷ used % × 100 (null below the minimum used). */
  rangeKm: number | null;
  /** Energy used per 100 km: used % × battery ÷ km (null below the minimum used or without driving). */
  kwhPer100km: number | null;
  /** Average outdoor temperature at the start of the trips, weighted by km (null without temperature data). */
  avgTemp: number | null;
  trips: number;
}

export interface CycleInput {
  /** Charging sessions (including an ongoing one), oldest first. */
  sessions: ChargingSession[];
  odometer: TimedValue[];
  soc: TimedValue[];
  temperature: TimedValue[];
  trips: TripBlock[];
  batteryKwh: number;
  now: number;
}

const r1 = (v: number) => Math.round(v * 10 + 1e-9) / 10 || 0;

/**
 * Cycles between consecutive charging sessions, oldest first. The time before
 * the first session is skipped (its starting SoC is unknown). The cycle since
 * the last finished session is marked ongoing, unless a session is running.
 */
export function driveCycles(input: CycleInput): DriveCycle[] {
  const sessions = [...input.sessions].sort((a, b) => a.start - b.start);
  const out: DriveCycle[] = [];
  for (let i = 0; i < sessions.length; i++) {
    const prev = sessions[i];
    if (prev.ongoing) break;
    const next = sessions[i + 1] ?? null;
    const end = next ? next.start : input.now;
    if (end <= prev.end) continue;
    out.push(cycle(input, prev.end, end, next === null, prev.socEnd, next ? next.socStart : (atOrBefore(input.soc, end)?.value ?? null)));
  }
  return out;
}

function cycle(input: CycleInput, start: number, end: number, ongoing: boolean, socStart: number | null, socEnd: number | null): DriveCycle {
  const odoStart = atOrBefore(input.odometer, start)?.value ?? null;
  const odoEnd = atOrBefore(input.odometer, end)?.value ?? null;
  const km = odoStart !== null && odoEnd !== null ? Math.max(0, odoEnd - odoStart) : 0;
  const usedPct = socStart !== null && socEnd !== null ? socStart - socEnd : null;
  const enough = usedPct !== null && usedPct >= CYCLE_MIN_USED_PCT && km > 0;
  const socs = input.soc.filter((r) => r.ts >= start && r.ts <= end).map((r) => r.value);
  if (socEnd !== null) socs.push(socEnd);
  // Trips that overlap the cycle (one may have started just before the charge ended).
  const trips = input.trips.filter((t) => t.end > start && t.start < end);
  let tempSum = 0;
  let tempKm = 0;
  for (const t of trips) {
    const temp = temperatureAt(input.temperature, t.start);
    if (temp === null || t.km <= 0) continue;
    tempSum += temp * t.km;
    tempKm += t.km;
  }
  return {
    start,
    end,
    ongoing,
    socStart,
    socEnd,
    minSoc: socs.length ? Math.min(...socs) : null,
    km: r1(km),
    usedPct: usedPct === null ? null : r1(usedPct),
    rangeKm: enough ? Math.round((km / usedPct!) * 100) : null,
    kwhPer100km: enough ? r1(((usedPct! / 100) * input.batteryKwh / km) * 100) : null,
    avgTemp: tempKm > 0 ? r1(tempSum / tempKm) : null,
    trips: trips.length,
  };
}

/** Moment the km driven since `start` first reached `km` (from the odometer readings), or null. */
export function kmReachedAt(odometer: TimedValue[], start: number, end: number, km: number): number | null {
  const base = atOrBefore(odometer, start)?.value;
  if (base === undefined) return null;
  for (const r of odometer) {
    if (r.ts <= start) continue;
    if (r.ts > end) break;
    if (r.value - base >= km) return r.ts;
  }
  return null;
}

/** Cycles that count for records, badges and the chart: enough battery used to estimate the range. */
export const usableCycles = (cycles: DriveCycle[]) => cycles.filter((c) => c.rangeKm !== null);

export interface CycleRecords {
  longest: DriveCycle | null;
  bestRange: DriveCycle | null;
  /** The longest cycle driven at an average below 0 °C. */
  frostLongest: DriveCycle | null;
}

export function cycleRecords(cycles: DriveCycle[]): CycleRecords {
  const done = cycles.filter((c) => !c.ongoing);
  const max = (list: DriveCycle[], f: (c: DriveCycle) => number) => list.reduce<DriveCycle | null>((b, c) => (!b || f(c) > f(b) ? c : b), null);
  return {
    longest: max(done.filter((c) => c.km > 0), (c) => c.km),
    bestRange: max(usableCycles(done), (c) => c.rangeKm!),
    frostLongest: max(done.filter((c) => c.avgTemp !== null && c.avgTemp < 0 && c.km > 0), (c) => c.km),
  };
}

/**
 * Linear trend of the estimated range against the temperature (least squares),
 * once there are at least 5 usable cycles spread over 5 °C or more.
 */
export function rangeTrend(cycles: DriveCycle[]): { slope: number; intercept: number; at: (temp: number) => number } | null {
  const pts = usableCycles(cycles).filter((c) => c.avgTemp !== null).map((c) => [c.avgTemp!, c.rangeKm!] as const);
  if (pts.length < 5) return null;
  const xs = pts.map((p) => p[0]);
  if (Math.max(...xs) - Math.min(...xs) < 5) return null;
  const n = pts.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = pts.reduce((a, p) => a + p[1], 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const [x, y] of pts) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
  }
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  return { slope, intercept, at: (t) => Math.round(intercept + slope * t) };
}
