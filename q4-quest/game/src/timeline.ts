import { levelForXp, rankForLevel } from './levels.ts';
import { milestoneDates, type TimedValue } from './milestones.ts';

export type TimelineEvent =
  | { type: 'milestone'; ts: number; km: number; name: string }
  | { type: 'level'; ts: number; level: number; rank: string; newRank: boolean };

/**
 * Retroactive events from the odometer history: milestones and level-ups,
 * dated by the first reading at which they were reached. Everything that was
 * already reached at the first reading is returned separately as `initial`.
 * (Badges are added to the timeline in phase 4.)
 */
export function timeline(odometer: TimedValue[], bonusXp = 0): { initial: TimelineEvent[]; events: TimelineEvent[] } {
  const all: TimelineEvent[] = [];
  for (const { milestone, ts } of milestoneDates(odometer)) {
    all.push({ type: 'milestone', ts, km: milestone.km, name: milestone.name });
  }
  let level = 0;
  for (const r of odometer) {
    const reached = levelForXp(r.value + bonusXp);
    while (level < reached) {
      level++;
      all.push({
        type: 'level',
        ts: r.ts,
        level,
        rank: rankForLevel(level),
        newRank: rankForLevel(level) !== rankForLevel(level - 1),
      });
    }
  }
  const firstTs = odometer[0]?.ts;
  // Newest first; at equal times milestones before levels, highest first.
  const size = (e: TimelineEvent) => (e.type === 'level' ? e.level : e.km);
  all.sort(
    (a, b) => b.ts - a.ts || (a.type === b.type ? size(b) - size(a) : a.type === 'milestone' ? -1 : 1),
  );
  return {
    initial: all.filter((e) => e.ts === firstTs),
    events: all.filter((e) => e.ts !== firstTs),
  };
}
