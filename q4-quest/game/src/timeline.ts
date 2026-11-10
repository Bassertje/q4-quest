import type { BadgeResult } from './badges.ts';
import { levelForXp, rankForLevel } from './levels.ts';
import { milestoneDates, type TimedValue } from './milestones.ts';

export type TimelineEvent =
  | { type: 'milestone'; ts: number; km: number; name: string }
  | { type: 'badge'; ts: number; id: string; name: string; xp: number; icon: string }
  | { type: 'level'; ts: number; level: number; rank: string; newRank: boolean };

/**
 * Retroactive events: milestones, badges and level-ups, dated by the first
 * moment they were reached. XP over time is the odometer plus the bonus XP of
 * the badges unlocked so far. Everything already reached at the first reading
 * is returned separately as `initial`.
 */
export function timeline(
  odometer: TimedValue[],
  badges: BadgeResult[] = [],
): { initial: TimelineEvent[]; events: TimelineEvent[] } {
  const all: TimelineEvent[] = [];
  for (const { milestone, ts } of milestoneDates(odometer)) {
    all.push({ type: 'milestone', ts, km: milestone.km, name: milestone.name });
  }
  const unlocked = badges
    .filter((b) => b.unlockedTs !== null && b.category !== 'mijlpalen')
    .sort((a, b) => a.unlockedTs! - b.unlockedTs!);
  for (const b of unlocked) {
    all.push({ type: 'badge', ts: b.unlockedTs!, id: b.id, name: b.name, xp: b.xp, icon: b.icon });
  }

  // Walk odometer readings and bonus XP in time order to date the level-ups.
  type Step = { ts: number; odo?: number; bonus?: number };
  const steps: Step[] = [
    ...odometer.map((r): Step => ({ ts: r.ts, odo: r.value })),
    ...unlocked.filter((b) => b.xp > 0).map((b): Step => ({ ts: b.unlockedTs!, bonus: b.xp })),
  ].sort((a, b) => a.ts - b.ts || (a.odo !== undefined ? -1 : 1));
  let odo = 0;
  let bonus = 0;
  let level = 0;
  for (const step of steps) {
    if (step.odo !== undefined) odo = step.odo;
    if (step.bonus !== undefined) bonus += step.bonus;
    const reached = levelForXp(odo + bonus);
    while (level < reached) {
      level++;
      all.push({
        type: 'level',
        ts: step.ts,
        level,
        rank: rankForLevel(level),
        newRank: rankForLevel(level) !== rankForLevel(level - 1),
      });
    }
  }

  const firstTs = odometer[0]?.ts;
  // Newest first; at equal times: milestones, badges, then levels (highest first).
  const order = { milestone: 0, badge: 1, level: 2 } as const;
  const size = (e: TimelineEvent) => (e.type === 'level' ? e.level : e.type === 'milestone' ? e.km : e.xp);
  all.sort((a, b) => b.ts - a.ts || order[a.type] - order[b.type] || size(b) - size(a));
  return {
    initial: all.filter((e) => e.ts === firstTs),
    events: all.filter((e) => e.ts !== firstTs),
  };
}
