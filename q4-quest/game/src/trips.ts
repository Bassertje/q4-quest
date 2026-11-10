import type { TimedValue } from './milestones.ts';

/** Two odometer increases further apart than this belong to different trips. */
export const TRIP_GAP_MS = 45 * 60_000;

export interface TripBlock {
  /** Time of the first odometer increase (indicative: the trip started a little earlier). */
  start: number;
  /** Time of the last odometer increase. */
  end: number;
  km: number;
  /** Number of odometer readings (increases) in the block. */
  readings: number;
}

export interface TimedState {
  ts: number;
  state: string;
}

const ENGAGED = new Set(['on', 'true', 'engaged', 'applied', 'active', 'closed', '1']);

/** Whether a parking brake state means "engaged" (car parked). */
export function brakeEngaged(state: string): boolean {
  return ENGAGED.has(state.trim().toLowerCase());
}

/**
 * Group odometer increases into trip blocks: consecutive increases less than
 * 45 minutes apart. If parking brake states are given, engaging the brake
 * between two increases also ends a block. Results are indicative.
 */
export function tripBlocks(odometer: TimedValue[], parkingBrake: TimedState[] = []): TripBlock[] {
  const engagedTimes = parkingBrake.filter((b) => brakeEngaged(b.state)).map((b) => b.ts);
  let brakeIndex = 0;
  const brakeBetween = (from: number, to: number) => {
    while (brakeIndex < engagedTimes.length && engagedTimes[brakeIndex] <= from) brakeIndex++;
    return brakeIndex < engagedTimes.length && engagedTimes[brakeIndex] < to;
  };

  const trips: TripBlock[] = [];
  let current: TripBlock | null = null;
  for (let i = 1; i < odometer.length; i++) {
    const prev = odometer[i - 1];
    const r = odometer[i];
    const delta = r.value - prev.value;
    if (delta <= 0) continue;
    const continues = current !== null && r.ts - current.end < TRIP_GAP_MS && !brakeBetween(current.end, r.ts);
    if (continues) {
      current!.end = r.ts;
      current!.km += delta;
      current!.readings++;
    } else {
      current = { start: r.ts, end: r.ts, km: delta, readings: 1 };
      trips.push(current);
    }
  }
  for (const t of trips) t.km = Math.round(t.km * 10) / 10;
  return trips;
}

/**
 * Time-based badges (night owl, early bird) only count trip blocks with at
 * least this many odometer readings, so a single late report is not a "trip".
 */
export const MIN_READINGS_FOR_TIME_BADGES = 2;
