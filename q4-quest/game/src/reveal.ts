import type { BadgeResult } from './badges.ts';
import { rankIcon } from './levels.ts';
import type { ChargingRecords } from './charging.ts';
import type { DrivingRecords } from './records.ts';
import type { TimelineEvent } from './timeline.ts';

export type RevealKind = 'badge' | 'milestone' | 'level' | 'rank' | 'record';

export interface RevealItem {
  /** Seen-flag keys this item covers (a level item covers all levels gained). */
  keys: string[];
  kind: RevealKind;
  name: string;
  description: string;
  icon: string;
  ts: number;
  xp: number;
}

export interface RecordEntry {
  key: string;
  name: string;
  /** Short description, e.g. "473 km". */
  value: string;
  /** The period or start of the record, for the description. */
  label: string;
  ts: number;
}

/** Stable seen-flag keys for the current records. */
export function recordEntries(
  driving: DrivingRecords | null,
  charging: ChargingRecords | null,
  describe: { km: (v: number) => string; kw: (v: number) => string; period: (key: string) => string; date: (ts: number) => string; dayTs: (key: string) => number },
): RecordEntry[] {
  const out: RecordEntry[] = [];
  if (driving?.bestDay) out.push({ key: `record:bestDay:${driving.bestDay.key}`, name: 'Beste dag', value: `${describe.km(driving.bestDay.km)} km`, label: describe.period(driving.bestDay.key), ts: describe.dayTs(driving.bestDay.key) });
  if (driving?.bestWeek) out.push({ key: `record:bestWeek:${driving.bestWeek.key}`, name: 'Beste week', value: `${describe.km(driving.bestWeek.km)} km`, label: describe.period(driving.bestWeek.key), ts: 0 });
  if (driving?.bestMonth) out.push({ key: `record:bestMonth:${driving.bestMonth.key}`, name: 'Beste maand', value: `${describe.km(driving.bestMonth.km)} km`, label: describe.period(driving.bestMonth.key), ts: 0 });
  if (driving?.longestStreak) out.push({ key: `record:longestStreak:${driving.longestStreak.start}`, name: 'Langste streak', value: `${driving.longestStreak.days} dagen`, label: `tot ${describe.period(driving.longestStreak.end)}`, ts: describe.dayTs(driving.longestStreak.end) });
  if (driving?.longestTrip) out.push({ key: `record:longestTrip:${driving.longestTrip.start}`, name: 'Grootste ritblok', value: `${describe.km(driving.longestTrip.km)} km`, label: describe.date(driving.longestTrip.start), ts: driving.longestTrip.end });
  if (charging?.fastest?.avgKw != null) out.push({ key: `record:fastestCharge:${charging.fastest.start}`, name: 'Snelste laadsessie', value: `gem. ${describe.kw(charging.fastest.avgKw)} kW`, label: describe.date(charging.fastest.start), ts: charging.fastest.end });
  if (charging?.busiestMonth) out.push({ key: `record:busiestMonth:${charging.busiestMonth.key}`, name: 'Meeste laadsessies', value: `${charging.busiestMonth.sessions} sessies`, label: describe.period(charging.busiestMonth.key), ts: 0 });
  return out;
}

/**
 * Items to reveal: unlocked badges and milestones, level-ups (combined into a
 * single item for the highest new level) and new records that have not been
 * seen yet. Oldest first, so the story unfolds in order.
 */
export function revealItems(input: {
  badges: BadgeResult[];
  timeline: { initial: TimelineEvent[]; events: TimelineEvent[] };
  records: RecordEntry[];
  seen: Set<string>;
  now: number;
}): RevealItem[] {
  const items: RevealItem[] = [];
  for (const b of input.badges) {
    if (b.unlockedTs === null) continue;
    const key = `badge:${b.id}`;
    if (input.seen.has(key)) continue;
    const milestone = b.category === 'mijlpalen';
    items.push({ keys: [key], kind: milestone ? 'milestone' : 'badge', name: b.name, description: b.description, icon: b.icon, ts: b.unlockedTs, xp: b.xp });
  }

  const levels = [...input.timeline.initial, ...input.timeline.events].filter(
    (e): e is Extract<TimelineEvent, { type: 'level' }> => e.type === 'level',
  );
  const unseenLevels = levels.filter((l) => !input.seen.has(`level:${l.level}`)).sort((a, b) => a.level - b.level);
  const top = unseenLevels.at(-1);
  if (top) {
    const gained = unseenLevels.length;
    items.push({
      keys: unseenLevels.map((l) => `level:${l.level}`),
      kind: 'level',
      name: `Level ${top.level}`,
      description: gained > 1 ? `${top.rank} · ${gained} levels omhoog` : top.rank,
      icon: 'levelUp',
      ts: top.ts,
      xp: 0,
    });
  }

  // A new rank is its own item (the highest new one; Leerling is the starting rank).
  const unseenRanks = levels
    .filter((l) => l.newRank && l.level > 0 && !input.seen.has(`rank:${l.rank}`))
    .sort((a, b) => a.level - b.level);
  const topRank = unseenRanks.at(-1);
  if (topRank) {
    items.push({
      keys: unseenRanks.map((l) => `rank:${l.rank}`),
      kind: 'rank',
      name: topRank.rank,
      description: `Nieuwe rang vanaf level ${topRank.level}`,
      icon: rankIcon(topRank.rank),
      ts: topRank.ts,
      xp: 0,
    });
  }

  for (const r of input.records) {
    if (input.seen.has(r.key)) continue;
    items.push({ keys: [r.key], kind: 'record', name: r.name, description: `${r.value} · ${r.label}`, icon: 'crown', ts: r.ts || input.now, xp: 0 });
  }

  const order: Record<RevealKind, number> = { milestone: 0, badge: 1, record: 2, level: 3, rank: 4 };
  return items.sort((a, b) => a.ts - b.ts || order[a.kind] - order[b.kind]);
}
