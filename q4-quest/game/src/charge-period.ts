import { chargingTotals, type ChargingSession, type ChargingTotals } from './charging.ts';
import { periodEnergy, type EnergyInput } from './consumption.ts';
import { periodLabel } from './labels.ts';
import { isoWeekStart, shiftPeriod } from './periods.ts';
import { addDays, dayKey, monthKey, weekKey, zonedMidnight } from './time.ts';

/** Period choice on the charging screen. */
export type ChargePeriodMode = 'week' | 'month' | 'year' | 'all';
export const CHARGE_PERIOD_MODES: readonly ChargePeriodMode[] = ['week', 'month', 'year', 'all'];
/** Consumption is shown from this many km driven in the period. */
export const PERIOD_CONSUMPTION_MIN_KM = 100;

export function isChargePeriodMode(v: unknown): v is ChargePeriodMode {
  return typeof v === 'string' && (CHARGE_PERIOD_MODES as readonly string[]).includes(v);
}

/** Period key ('2026-W46', '2026-11', '2026' or 'all') containing a day. */
export function chargePeriodKey(mode: ChargePeriodMode, day: string): string {
  if (mode === 'week') return weekKey(day);
  if (mode === 'month') return monthKey(day);
  if (mode === 'year') return day.slice(0, 4);
  return 'all';
}

/** Whether a key is a well-formed key for the mode. */
export function isChargePeriodKey(mode: ChargePeriodMode, key: string): boolean {
  if (mode === 'all') return key === 'all';
  if (mode === 'week') return /^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(key) && weekKey(isoWeekStart(key)) === key;
  if (mode === 'month') return /^\d{4}-(0[1-9]|1[0-2])$/.test(key);
  return /^\d{4}$/.test(key);
}

export function shiftChargePeriod(mode: ChargePeriodMode, key: string, n: number): string {
  if (mode === 'all') return key;
  if (mode === 'year') return String(Number(key) + n);
  return shiftPeriod(mode, key, n);
}

/** First day and the day after the last day of a period. */
export function chargePeriodDays(mode: ChargePeriodMode, key: string, firstDay: string, today: string): { from: string; to: string } {
  if (mode === 'week') {
    const from = isoWeekStart(key);
    return { from, to: addDays(from, 7) };
  }
  if (mode === 'month') return { from: `${key}-01`, to: `${shiftPeriod('month', key, 1)}-01` };
  if (mode === 'year') return { from: `${key}-01-01`, to: `${Number(key) + 1}-01-01` };
  return { from: `${monthKey(firstDay)}-01`, to: `${shiftPeriod('month', monthKey(today), 1)}-01` };
}

/** Dutch label: "week 46, 2026", "november 2026", "2026" or "Alles". */
export function chargePeriodLabel(mode: ChargePeriodMode, key: string): string {
  if (mode === 'all') return 'Alles';
  if (mode === 'year') return key;
  return periodLabel(key, true);
}

export interface ChargeBucket {
  /** Day key (week/month view) or month key (year/all view). */
  key: string;
  ac: number;
  dc: number;
  /** The bucket lies entirely before the first measurement. */
  beforeStart: boolean;
}

export interface ChargePeriodView {
  mode: ChargePeriodMode;
  key: string;
  label: string;
  /** Neighbouring periods, null at the edges (before the data or after today). */
  prev: string | null;
  next: string | null;
  /** Bucket size of the chart. */
  bucket: 'day' | 'month';
  buckets: ChargeBucket[];
  totals: ChargingTotals;
  consumption: {
    /** kWh per 100 km, null below the minimum distance. */
    kwhPer100km: number | null;
    km: number;
    usedKwh: number;
  } | null;
  /** Sessions that started in the period, newest first. */
  sessions: ChargingSession[];
}

export interface ChargePeriodInput {
  sessions: ChargingSession[];
  energy: EnergyInput;
  /** Day of the first measurement (odometer or charging). */
  firstDay: string;
  timeZone: string;
  now: number;
}

/**
 * Everything the charging screen shows for one period: totals, consumption
 * (charged kWh + SoC difference × battery, ÷ km), a fixed-window chart and the
 * sessions. A key outside the data range is clamped to the nearest period.
 */
export function chargePeriodView(input: ChargePeriodInput, mode: ChargePeriodMode, requested: string | null): ChargePeriodView {
  const { timeZone, now } = input;
  const today = dayKey(now, timeZone);
  const firstDay = input.firstDay <= today ? input.firstDay : today;
  const firstKey = chargePeriodKey(mode, firstDay);
  const lastKey = chargePeriodKey(mode, today);
  let key = requested && isChargePeriodKey(mode, requested) ? requested : lastKey;
  if (key > lastKey) key = lastKey;
  if (key < firstKey) key = firstKey;

  const days = chargePeriodDays(mode, key, firstDay, today);
  const from = zonedMidnight(days.from, timeZone);
  const to = zonedMidnight(days.to, timeZone);
  const sessions = input.sessions.filter((s) => s.start >= from && s.start < to);

  const bucket = mode === 'week' || mode === 'month' ? 'day' : 'month';
  const buckets: ChargeBucket[] = [];
  const index = new Map<string, ChargeBucket>();
  const firstBucket = bucket === 'day' ? firstDay : monthKey(firstDay);
  for (let d = days.from; d < days.to; d = bucket === 'day' ? addDays(d, 1) : `${shiftPeriod('month', monthKey(d), 1)}-01`) {
    const k = bucket === 'day' ? d : monthKey(d);
    const b = { key: k, ac: 0, dc: 0, beforeStart: k < firstBucket };
    buckets.push(b);
    index.set(k, b);
  }
  for (const s of sessions) {
    if (s.kwh === null || s.ongoing) continue;
    const day = dayKey(s.start, timeZone);
    const b = index.get(bucket === 'day' ? day : monthKey(day));
    if (b) b[s.type === 'DC' ? 'dc' : 'ac'] += s.kwh;
  }
  for (const b of buckets) {
    b.ac = Math.round(b.ac * 10) / 10;
    b.dc = Math.round(b.dc * 10) / 10;
  }

  const p = periodEnergy(input.energy, from, Math.min(to, now + 1));
  const consumption = p
    ? { kwhPer100km: p.km >= PERIOD_CONSUMPTION_MIN_KM ? p.kwhPer100km : null, km: p.km, usedKwh: p.usedKwh }
    : null;

  return {
    mode,
    key,
    label: chargePeriodLabel(mode, key),
    prev: mode === 'all' || key <= firstKey ? null : shiftChargePeriod(mode, key, -1),
    next: mode === 'all' || key >= lastKey ? null : shiftChargePeriod(mode, key, 1),
    bucket,
    buckets,
    totals: chargingTotals(sessions),
    consumption,
    sessions: [...sessions].reverse(),
  };
}
