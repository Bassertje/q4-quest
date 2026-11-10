import { addDays, dayKey, monthKey } from './time.ts';
import type { TimedValue } from './milestones.ts';
import type { TimedState } from './trips.ts';

/** A gap of at most this long still belongs to the same charging session. */
export const SESSION_GAP_MS = 15 * 60_000;
/** Sessions shorter than this (and not ongoing) are treated as noise. */
const MIN_SESSION_MS = 60_000;
/** Fewer power readings than this make the integration unreliable. */
const MIN_POWER_READINGS = 3;
/** Without a type sensor, a peak above this is assumed to be DC. */
const AC_MAX_KW = 22;

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
  type: 'AC' | 'DC' | null;
  /** True when the type was derived from the peak power instead of a sensor. */
  typeInferred: boolean;
  socStart: number | null;
  socEnd: number | null;
  peakKw: number | null;
  kwh: number | null;
  /** How kWh was estimated: integrated power, or ΔSoC × battery size. */
  kwhMethod: 'power' | 'soc' | null;
}

export interface ChargingInput {
  power: PowerReading[];
  state: TimedState[];
  type: TimedState[];
  soc: TimedValue[];
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

function lastAtOrBefore<T extends { ts: number }>(readings: T[], ts: number): T | null {
  let found: T | null = null;
  for (const r of readings) {
    if (r.ts > ts) break;
    found = r;
  }
  return found;
}

/**
 * Detect charging sessions: periods with charging power > 0 or a "charging"
 * state, where gaps of up to 15 minutes are bridged. All inputs sorted by time.
 */
export function chargingSessions(input: ChargingInput): ChargingSession[] {
  const { power, state, now } = input;
  let intervals = activeIntervals(state, (s) => isChargingState(s.state), now);

  // Power intervals; a "not charging" state ends a power interval early, so a
  // stale power value cannot keep a session open forever.
  const stops = state.filter((s) => !isChargingState(s.state)).map((s) => s.ts);
  for (const [a, b] of activeIntervals(power, (p) => p.kw > 0, now)) {
    const stop = stops.find((t) => t > a && t < b);
    intervals.push([a, stop ?? b]);
  }

  intervals = intervals.sort((x, y) => x[0] - y[0]);
  const merged: Interval[] = [];
  for (const iv of intervals) {
    const last = merged.at(-1);
    if (last && iv[0] - last[1] <= SESSION_GAP_MS) last[1] = Math.max(last[1], iv[1]);
    else merged.push([iv[0], iv[1]]);
  }

  // A session is ongoing if a signal is still active at the latest reading.
  const lastPower = power.at(-1);
  const lastState = state.at(-1);
  const activeNow =
    (lastState ? isChargingState(lastState.state) : false) ||
    (lastPower ? lastPower.kw > 0 && !(lastState && lastState.ts > lastPower.ts && !isChargingState(lastState.state)) : false);

  const sessions: ChargingSession[] = [];
  merged.forEach(([start, end], i) => {
    const ongoing = activeNow && i === merged.length - 1 && end >= now;
    if (!ongoing && end - start < MIN_SESSION_MS) return;
    sessions.push(describeSession(input, start, ongoing ? now : end, ongoing));
  });
  return sessions;
}

function describeSession(input: ChargingInput, start: number, end: number, ongoing: boolean): ChargingSession {
  const inSession = input.power.filter((p) => p.ts >= start && p.ts <= end);
  const peakKw = inSession.length ? Math.max(...inSession.map((p) => p.kw)) : null;

  // SoC at the start: the last value before the session (or the first one in it).
  const socBefore = lastAtOrBefore(input.soc, start) ?? input.soc.find((s) => s.ts >= start && s.ts <= end) ?? null;
  // SoC at the end: allow a short delay, as the car often reports it late.
  const socAfter = lastAtOrBefore(input.soc, end + SESSION_GAP_MS);
  const socStart = socBefore?.value ?? null;
  const socEnd = socAfter && socAfter.ts >= start ? socAfter.value : null;

  let kwh: number | null = null;
  let kwhMethod: ChargingSession['kwhMethod'] = null;
  if (inSession.length >= MIN_POWER_READINGS) {
    kwh = integrate(inSession, end);
    kwhMethod = 'power';
  }
  if ((kwh === null || kwh <= 0) && socStart !== null && socEnd !== null && socEnd > socStart) {
    kwh = ((socEnd - socStart) / 100) * input.batteryKwh;
    kwhMethod = 'soc';
  }
  if (kwh !== null && kwh <= 0) {
    kwh = null;
    kwhMethod = null;
  }

  const typeReading = lastAtOrBefore(input.type, end);
  let type = typeReading ? normaliseType(typeReading.state) : null;
  let typeInferred = false;
  if (type === null && peakKw !== null) {
    type = peakKw > AC_MAX_KW ? 'DC' : 'AC';
    typeInferred = true;
  }

  return {
    start,
    end,
    ongoing,
    type,
    typeInferred,
    socStart,
    socEnd,
    peakKw: peakKw === null ? null : Math.round(peakKw * 10) / 10,
    kwh: kwh === null ? null : Math.round(kwh * 10) / 10,
    kwhMethod,
  };
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
    const bucket = s.type === 'DC' ? totals.dc : s.type === 'AC' ? totals.ac : null;
    if (bucket) {
      bucket.sessions++;
      bucket.kwh += s.kwh ?? 0;
    }
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
    if (s.peakKw !== null && (!fastest || s.peakKw > (fastest.peakKw ?? 0))) fastest = s;
    const month = monthKey(dayKey(s.start, timeZone));
    perMonth.set(month, (perMonth.get(month) ?? 0) + 1);
  }
  let busiestMonth: ChargingRecords['busiestMonth'] = null;
  for (const [key, n] of perMonth) if (!busiestMonth || n > busiestMonth.sessions) busiestMonth = { key, sessions: n };
  return { fastest, busiestMonth };
}
