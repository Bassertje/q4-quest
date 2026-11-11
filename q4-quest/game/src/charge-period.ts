import { chargingTotals, type ChargingSession, type ChargingTotals } from './charging.ts';
import { periodEnergy, type EnergyInput } from './consumption.ts';
import { greenTotals, type GreenFactors, type GreenTotals } from './green.ts';
import { isViewPeriodMode, periodWindow, VIEW_PERIOD_MODES, type ViewPeriodMode } from './period-view.ts';
import { dayKey, monthKey, zonedMidnight } from './time.ts';

/** Period choice on the charging screen (shared with the history screen). */
export type ChargePeriodMode = ViewPeriodMode;
export const CHARGE_PERIOD_MODES = VIEW_PERIOD_MODES;
export const isChargePeriodMode = isViewPeriodMode;
/** Consumption is shown from this many km driven in the period. */
export const PERIOD_CONSUMPTION_MIN_KM = 100;

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
  /** Average charging power (kWh ÷ duration per session, averaged over the finished sessions). */
  power: { avgKw: number | null; acKw: number | null; dcKw: number | null };
  /** CO₂ saved, petrol not burned and trees over the period (null without odometer data or factors). */
  green: GreenTotals | null;
}

export interface ChargePeriodInput {
  sessions: ChargingSession[];
  energy: EnergyInput;
  /** Day of the first measurement (odometer or charging). */
  firstDay: string;
  timeZone: string;
  now: number;
  /** Factors for the Groen estimate; omit to skip it. */
  green?: GreenFactors;
  /** Override for the "all" period, so it matches the all-time totals exactly. */
  greenAll?: GreenTotals | null;
}

/**
 * Everything the charging screen shows for one period: totals, consumption
 * (charged kWh + SoC difference × battery, ÷ km), a fixed-window chart and the
 * sessions. A key outside the data range is clamped to the nearest period.
 */
export function chargePeriodView(input: ChargePeriodInput, mode: ChargePeriodMode, requested: string | null): ChargePeriodView {
  const { timeZone, now } = input;
  const today = dayKey(now, timeZone);
  const w = periodWindow(mode, requested, input.firstDay, today);
  const { key, bucket } = w;
  const from = zonedMidnight(w.fromDay, timeZone);
  const to = zonedMidnight(w.toDay, timeZone);
  const sessions = input.sessions.filter((s) => s.start >= from && s.start < to);

  const buckets: ChargeBucket[] = w.buckets.map((b) => ({ key: b.key, ac: 0, dc: 0, beforeStart: b.beforeStart }));
  const index = new Map(buckets.map((b) => [b.key, b]));
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

  let green: GreenTotals | null = null;
  if (mode === 'all' && input.greenAll !== undefined) green = input.greenAll;
  else if (input.green && input.energy.odometer.length) {
    // Same energy as the consumption: charged kWh + SoC difference × battery.
    green = greenTotals(p?.km ?? 0, p?.usedKwh ?? 0, input.green);
  }

  return {
    mode,
    key,
    label: w.label,
    prev: w.prev,
    next: w.next,
    bucket,
    buckets,
    totals: chargingTotals(sessions),
    consumption,
    sessions: [...sessions].reverse(),
    power: averagePower(sessions),
    green,
  };
}

/** Mean of the per-session average power (kW), overall and per type; null without sessions. */
export function averagePower(sessions: ChargingSession[]): ChargePeriodView['power'] {
  const mean = (list: ChargingSession[]) => {
    const kws = list.filter((s) => !s.ongoing && s.avgKw !== null).map((s) => s.avgKw!);
    return kws.length ? Math.round((kws.reduce((a, b) => a + b, 0) / kws.length) * 10) / 10 : null;
  };
  return {
    avgKw: mean(sessions),
    acKw: mean(sessions.filter((s) => s.type === 'AC')),
    dcKw: mean(sessions.filter((s) => s.type === 'DC')),
  };
}
