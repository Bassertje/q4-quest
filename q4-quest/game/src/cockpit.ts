import type { BadgeResult } from './badges.ts';
import { currentStreak, dailyTotals, periodTotals } from './distance.ts';
import { levelProgress, type LevelProgress } from './levels.ts';
import { milestoneProgress, type MilestoneProgress, type TimedValue } from './milestones.ts';
import { dayKey } from './time.ts';

export interface CockpitInput {
  /** Odometer readings (km), sorted by time. */
  odometer: TimedValue[];
  now: number;
  timeZone: string;
  /** Evaluated badges: their bonus XP counts towards the level. */
  badges?: BadgeResult[];
}

export interface Cockpit {
  odometer: number;
  odometerTs: number;
  level: LevelProgress;
  milestone: MilestoneProgress;
  bonusXp: number;
  lastUnlocked: { id: string; name: string; icon: string; category: string; ts: number } | null;
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
  const unlocked = (input.badges ?? []).filter((b) => b.unlockedTs !== null);
  const bonusXp = unlocked.reduce((sum, b) => sum + b.xp, 0);
  const latest = unlocked.reduce<BadgeResult | null>((a, b) => (!a || b.unlockedTs! >= a.unlockedTs! ? b : a), null);
  return {
    odometer,
    odometerTs: last.ts,
    // XP: one point per km on the odometer, plus badge bonus XP.
    level: levelProgress(odometer + bonusXp),
    bonusXp,
    milestone: milestoneProgress(odometer),
    lastUnlocked: latest
      ? { id: latest.id, name: latest.name, icon: latest.icon, category: latest.category, ts: latest.unlockedTs! }
      : null,
    distance: periodTotals(totals, today),
    streak: currentStreak(totals, today),
  };
}
