import type { ChargingSession } from './charging.ts';
import type { TimedValue } from './milestones.ts';

/**
 * Data for energy and consumption over a period:
 *   used energy = charged kWh in the period + (SoC at start − SoC at end) / 100 × battery
 *   consumption = used energy ÷ km driven in the same period.
 */
export interface EnergyInput {
  odometer: TimedValue[];
  soc: TimedValue[];
  /** Finished charging sessions. */
  sessions: ChargingSession[];
  batteryKwh: number;
  /** Without a SoC sensor only the charged kWh count. */
  hasSoc: boolean;
}

/** Last reading at or before `ts`. */
export function atOrBefore(series: TimedValue[], ts: number): TimedValue | null {
  let found: TimedValue | null = null;
  for (const r of series) {
    if (r.ts > ts) break;
    found = r;
  }
  return found;
}

/** Last reading strictly before `ts`. */
function before(series: TimedValue[], ts: number): TimedValue | null {
  let found: TimedValue | null = null;
  for (const r of series) {
    if (r.ts >= ts) break;
    found = r;
  }
  return found;
}

/** First moment both odometer and (when configured) SoC data exist. */
export function energyDataStart(input: EnergyInput): number | null {
  const odo = input.odometer[0]?.ts;
  if (odo === undefined) return null;
  if (!input.hasSoc) return odo;
  const soc = input.soc[0]?.ts;
  return soc === undefined ? null : Math.max(odo, soc);
}

export interface PeriodEnergy {
  from: number;
  to: number;
  km: number;
  chargedKwh: number;
  usedKwh: number;
  /** Null without driving. */
  kwhPer100km: number | null;
  sessions: number;
}

/**
 * Energy and consumption for [from, to). The start never lies before the first
 * moment both odometer and SoC data exist. Null when there is no data for the
 * period. Sessions count when they ended inside the period.
 */
export function periodEnergy(input: EnergyInput, from: number, to: number): PeriodEnergy | null {
  const start = energyDataStart(input);
  if (start === null) return null;
  const f = Math.max(from, start);
  if (to <= f) return null;
  const odoStart = atOrBefore(input.odometer, f);
  const odoEnd = before(input.odometer, to) ?? odoStart;
  if (!odoStart || !odoEnd) return null;
  const km = Math.max(0, odoEnd.value - odoStart.value);
  const inPeriod = input.sessions.filter((s) => s.end >= f && s.end < to);
  const charged = inPeriod.reduce((sum, s) => sum + (s.kwh ?? 0), 0);
  let used = charged;
  if (input.hasSoc) {
    const socStart = atOrBefore(input.soc, f);
    const socEnd = before(input.soc, to);
    if (!socStart || !socEnd) return null;
    used = charged + ((socStart.value - socEnd.value) / 100) * input.batteryKwh;
  }
  // Derive the consumption from the rounded figures, so it matches what the screen shows.
  const r1 = (v: number) => Math.round(v * 10 + 1e-9) / 10 || 0; // no "-0"
  const kmR = r1(km);
  const usedR = r1(used);
  return {
    from: f,
    to,
    km: kmR,
    chargedKwh: r1(charged),
    usedKwh: usedR,
    kwhPer100km: kmR > 0 ? r1((Math.max(0, usedR) / kmR) * 100) : null,
    sessions: inPeriod.length,
  };
}
