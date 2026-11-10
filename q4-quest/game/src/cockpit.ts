import { currentStreak, dailyTotals, periodTotals } from './distance.ts';
import { levelProgress, type LevelProgress } from './levels.ts';
import {
  MOON_KM,
  milestoneDates,
  milestoneProgress,
  type Milestone,
  type MilestoneProgress,
  type TimedValue,
} from './milestones.ts';
import { dayKey } from './time.ts';

export interface CockpitInput {
  /** Odometer readings (km), sorted by time. */
  odometer: TimedValue[];
  now: number;
  timeZone: string;
  /** Bonus XP from badges (added from phase 4 onwards). */
  bonusXp?: number;
}

export interface Cockpit {
  odometer: number;
  odometerTs: number;
  level: LevelProgress;
  milestone: MilestoneProgress;
  lastMilestone: { milestone: Milestone; ts: number } | null;
  moon: { km: number; fraction: number };
  distance: { today: number; week: number; month: number };
  streak: number;
}

/** Everything the Cockpit screen shows, computed from the odometer history. */
export function buildCockpit(input: CockpitInput): Cockpit | null {
  const last = input.odometer.at(-1);
  if (!last) return null;
  const odometer = last.value;
  const totals = dailyTotals(input.odometer, input.timeZone);
  const today = dayKey(input.now, input.timeZone);
  const reached = milestoneDates(input.odometer);
  return {
    odometer,
    odometerTs: last.ts,
    // XP: one point per km on the odometer, plus badge bonus XP.
    level: levelProgress(odometer + (input.bonusXp ?? 0)),
    milestone: milestoneProgress(odometer),
    lastMilestone: reached.at(-1) ?? null,
    moon: { km: MOON_KM, fraction: Math.min(1, odometer / MOON_KM) },
    distance: periodTotals(totals, today),
    streak: currentStreak(totals, today),
  };
}
