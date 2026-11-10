import { addDays, dayKey, monthKey } from './time.ts';
import type { TimedValue } from './milestones.ts';
import type { TimedState } from './trips.ts';

/** Candidate periods less than this far apart are merged first. */
export const CANDIDATE_MERGE_MS = 30 * 60_000;
/** SoC updates lag behind: look this long after the end for the highest SoC. */
export const SOC_LAG_MS = 30 * 60_000;
/** A candidate is only a real session if the SoC rises at least this much. */
export const MIN_SOC_RISE = 2;
/** A type sensor reporting "dc" up to this long after the end still counts. */
export const TYPE_LAG_MS = 10 * 60_000;
/** An average power above this means DC. */
export const DC_MIN_AVG_KW = 22;
/** Candidates shorter than this (and not ongoing) are treated as noise. */
const MIN_SESSION_MS = 60_000;

export interface PowerReading {
  ts: number;
  kw: number;
}

/**
 * Convert a power reading to kW using its unit. Without a unit, values above
 * 1000 are assumed to be in W (no car charges at more than 1 MW).
 */
export function toKw(value: number, unit: string | null | undefined): number {
  const u = (unit ?? '').trim().toLowerCase();
  if (u === 'w') return value / 1000;
  if (u === 'mw') return value * 1000;
  if (u === 'kw') return value;
  return Math.abs(value) > 1000 ? value / 1000 : value;
}

const CHARGING_STATES = new Set([
  'charging',
  'laden',
  'on',
  'true',
  '1',
  'fast_charging',
  'ac_charging',
  'dc_charging',
  'charging_active',
]);

/** Whether a charging-state value means "charging". */
export function isChargingState(state: string): boolean {
  return CHARGING_STATES.has(state.trim().toLowerCase().replace(/[\s-]+/g, '_'));
}

/** Normalise a charging-type value to AC or DC (null when unknown). */
export function normaliseType(state: string): 'AC' | 'DC' | null {
  const s = state.trim().toUpperCase();
  if (s.includes('DC')) return 'DC';
  if (s.includes('AC')) return 'AC';
  return null;
}

export interface ChargingSession {
  start: number;
  end: number;
  ongoing: boolean;
  type: 'AC' | 'DC';
  socStart: number | null;
  socEnd: number | null;
  kwh: number | null;
  /** How kWh was estimated: ΔSoC × battery size, or integrated power (no SoC sensor). */
  kwhMethod: 'soc' | 'power' | null;
  /** Average power: kWh ÷ duration. */
  avgKw: number | null;
}

export interface ChargingInput {
  power: PowerReading[];
  state: TimedState[];
  type: TimedState[];
  soc: TimedValue[];
  /** Whether a SoC sensor is configured (enables the SoC check and SoC-based kWh). */
  hasSoc: boolean;
  batteryKwh: number;
  now: number;
}

type Interval = [start: number, end: number];

/** Intervals during which a step signal (value holds until the next reading) is active. */
function activeIntervals<T extends { ts: number }>(readings: T[], active: (r: T) => boolean, now: number): Interval[] {
  const out: Interval[] = [];
  readings.forEach((r, i) => {
    if (active(r)) out.push([r.ts, readings[i + 1]?.ts ?? Math.max(now, r.ts)]);
  });
  return out;
}

function lastBefore<T extends { ts: number }>(readings: T[], ts: number): T | null {
  let found: T | null = null;
  for (const r of readings) {
    if (r.ts >= ts) break;
    found = r;
  }
  return found;
}

/** Whether the SoC drops during an interval (a reading below the last value before it). */
function socDrops(soc: TimedValue[], [a, b]: Interval): boolean {
  const before = lastBefore(soc, a);
  if (!before) return false;
  for (const r of soc) {
    if (r.ts <= a) continue;
    if (r.ts > b) break;
    if (r.value < before.value) return true;
  }
  return false;
}

/**
 * Candidate charging periods: "charging" state or power > 0. A "not charging"
 * state ends a power interval early, so a stale power value cannot keep a
 * candidate open. With a SoC sensor, candidates during which the SoC drops are
 * discarded first (false positives), so they cannot pull the start of a real
 * session forward. The rest are merged when less than 30 minutes apart.
 */
export function chargingCandidates(input: Pick<ChargingInput, 'power' | 'state' | 'now' | 'soc' | 'hasSoc'>): Interval[] {
  const { power, state, now } = input;
  let intervals = activeIntervals(state, (s) => isChargingState(s.state), now);
  const stops = state.filter((s) => !isChargingState(s.state)).map((s) => s.ts);
  for (const [a, b] of activeIntervals(power, (p) => p.kw > 0, now)) {
    const stop = stops.find((t) => t > a && t < b);
    intervals.push([a, stop ?? b]);
  }
  if (input.hasSoc) intervals = intervals.filter((iv) => !socDrops(input.soc, iv));
  intervals.sort((x, y) => x[0] - y[0]);
  const merged: Interval[] = [];
  for (const iv of intervals) {
    const last = merged.at(-1);
    if (last && iv[0] - last[1] < CANDIDATE_MERGE_MS) last[1] = Math.max(last[1], iv[1]);
    else merged.push([iv[0], iv[1]]);
  }
  return merged;
}

/**
 * Detect charging sessions. A candidate only counts when the SoC rises by at
 * least 2 percentage points: the last SoC before the start compared with the
 * highest SoC up to 30 minutes after the end. Without a SoC sensor every
 * candidate counts. All inputs must be sorted by time.
 */
export function chargingSessions(input: ChargingInput): ChargingSession[] {
  const { power, state, now } = input;
  const candidates = chargingCandidates(input);

  // The last candidate is ongoing if a signal is still active at the latest reading.
  const lastPower = power.at(-1);
  const lastState = state.at(-1);
  const activeNow =
    (lastState ? isChargingState(lastState.state) : false) ||
    (lastPower ? lastPower.kw > 0 && !(lastState && lastState.ts > lastPower.ts && !isChargingState(lastState.state)) : false);

  const sessions: ChargingSession[] = [];
  candidates.forEach(([start, end], i) => {
    const ongoing = activeNow && i === candidates.length - 1 && end >= now;
    if (!ongoing && end - start < MIN_SESSION_MS) return;
    const session = describeSession(input, start, ongoing ? now : end, ongoing);
    if (session) sessions.push(session);
  });
  return sessions;
}

/** The highest SoC from the start up to 30 minutes after the end. */
function maxSocAfter(soc: TimedValue[], start: number, end: number): number | null {
  let max: number | null = null;
  for (const r of soc) {
    if (r.ts < start) continue;
    if (r.ts > end + SOC_LAG_MS) break;
    if (max === null || r.value > max) max = r.value;
  }
  return max;
}

function describeSession(input: ChargingInput, start: number, end: number, ongoing: boolean): ChargingSession | null {
  const hours = (end - start) / 3_600_000;
  let socStart: number | null = null;
  let socEnd: number | null = null;
  let kwh: number | null = null;
  let kwhMethod: ChargingSession['kwhMethod'] = null;

  if (input.hasSoc) {
    socStart = lastBefore(input.soc, start)?.value ?? null;
    socEnd = maxSocAfter(input.soc, start, end);
    // Not a real session without a measurable SoC rise (filters false positives).
    if (socStart === null || socEnd === null || socEnd - socStart < MIN_SOC_RISE) return null;
    kwh = ((socEnd - socStart) / 100) * input.batteryKwh;
    kwhMethod = 'soc';
  } else {
    const points = input.power.filter((p) => p.ts >= start && p.ts <= end);
    if (points.length > 0) {
      const value = integrate(points, end);
      if (value > 0) {
        kwh = value;
        kwhMethod = 'power';
      }
    }
  }

  // Round with a tiny epsilon so e.g. 11.55 becomes 11.6, and derive the average
  // from the rounded kWh so it matches what the screen shows.
  const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10 + 1e-9) / 10);
  kwh = r1(kwh);
  const avgKw = kwh !== null && hours > 0 ? r1(kwh / hours) : null;
  const typeSaysDc = input.type.some(
    (t) => t.ts >= start && t.ts <= end + TYPE_LAG_MS && normaliseType(t.state) === 'DC',
  );
  const type: ChargingSession['type'] = typeSaysDc || (avgKw !== null && avgKw > DC_MIN_AVG_KW) ? 'DC' : 'AC';

  return { start, end, ongoing, type, socStart, socEnd, kwh, kwhMethod, avgKw };
}

/** Trapezoidal integration (kWh) of power readings; the last value holds until `end`. */
export function integrate(points: PowerReading[], end: number): number {
  let kwh = 0;
  for (let i = 1; i < points.length; i++) {
    const hours = (points[i].ts - points[i - 1].ts) / 3_600_000;
    kwh += ((points[i].kw + points[i - 1].kw) / 2) * hours;
  }
  const last = points.at(-1);
  if (last && end > last.ts) kwh += last.kw * ((end - last.ts) / 3_600_000);
  return kwh;
}

export interface ChargingTotals {
  sessions: number;
  kwh: number;
  ac: { sessions: number; kwh: number };
  dc: { sessions: number; kwh: number };
}

export function chargingTotals(sessions: ChargingSession[]): ChargingTotals {
  const totals: ChargingTotals = { sessions: 0, kwh: 0, ac: { sessions: 0, kwh: 0 }, dc: { sessions: 0, kwh: 0 } };
  for (const s of sessions) {
    totals.sessions++;
    totals.kwh += s.kwh ?? 0;
    const bucket = s.type === 'DC' ? totals.dc : totals.ac;
    bucket.sessions++;
    bucket.kwh += s.kwh ?? 0;
  }
  const r = (v: number) => Math.round(v * 10) / 10;
  totals.kwh = r(totals.kwh);
  totals.ac.kwh = r(totals.ac.kwh);
  totals.dc.kwh = r(totals.dc.kwh);
  return totals;
}

export const CONSUMPTION_DAYS = 30;
export const CONSUMPTION_MIN_KM = 300;
export const CONSUMPTION_MIN_SESSIONS = 3;

export interface ConsumptionEstimate {
  /** kWh per 100 km, or null when there is not enough data. */
  kwhPer100km: number | null;
  km: number;
  kwh: number;
  sessions: number;
}

/**
 * Rolling 30-day consumption estimate: charged kWh ÷ driven km. Only given
 * with at least 300 km and 3 sessions with a kWh estimate.
 */
export function consumptionEstimate(
  sessions: ChargingSession[],
  dailyTotals: Map<string, number>,
  now: number,
  timeZone: string,
): ConsumptionEstimate {
  const today = dayKey(now, timeZone);
  const firstDay = addDays(today, -(CONSUMPTION_DAYS - 1));
  let km = 0;
  for (const [day, value] of dailyTotals) if (day >= firstDay && day <= today) km += value;
  let kwh = 0;
  let count = 0;
  for (const s of sessions) {
    if (s.kwh === null) continue;
    if (dayKey(s.start, timeZone) < firstDay) continue;
    kwh += s.kwh;
    count++;
  }
  const enough = km >= CONSUMPTION_MIN_KM && count >= CONSUMPTION_MIN_SESSIONS;
  return {
    kwhPer100km: enough ? Math.round((kwh / km) * 1000) / 10 : null,
    km: Math.round(km),
    kwh: Math.round(kwh * 10) / 10,
    sessions: count,
  };
}

export interface ChargingRecords {
  fastest: ChargingSession | null;
  busiestMonth: { key: string; sessions: number } | null;
}

export function chargingRecords(sessions: ChargingSession[], timeZone: string): ChargingRecords {
  let fastest: ChargingSession | null = null;
  const perMonth = new Map<string, number>();
  for (const s of sessions) {
    if (s.avgKw !== null && (!fastest || s.avgKw > (fastest.avgKw ?? 0))) fastest = s;
    const month = monthKey(dayKey(s.start, timeZone));
    perMonth.set(month, (perMonth.get(month) ?? 0) + 1);
  }
  let busiestMonth: ChargingRecords['busiestMonth'] = null;
  for (const [key, n] of perMonth) if (!busiestMonth || n > busiestMonth.sessions) busiestMonth = { key, sessions: n };
  return { fastest, busiestMonth };
}
