import type { DatabaseSync } from 'node:sqlite';
import {
  activeEvent,
  dayShort,
  isFollowable,
  pickFollowedBadge,
  periodLabel,
  recordEntries,
  revealItems,
  zonedMidnight,
  type BadgeCategory,
  type RecordEntry,
  type RevealItem,
} from '../../game/src/index.ts';
import type { GameState } from './game-state.ts';
import { eventRevealItems, previewRevealItems } from './events.ts';
import { stampRevealItems } from './bingo.ts';

const CATEGORIES: { id: BadgeCategory; name: string }[] = [
  { id: 'rijden', name: 'Rijden' },
  { id: 'laden', name: 'Laden' },
  { id: 'zuinigheid', name: 'Zuinigheid' },
  { id: 'groen', name: 'Groen' },
  { id: 'uitdagingen', name: 'Uitdagingen' },
  { id: 'wereldreis', name: 'Wereldreis' },
  { id: 'legendarisch', name: 'Legendarisch' },
  { id: 'evenementen', name: 'Evenementen' },
];

export function seenKeys(db: DatabaseSync): Set<string> {
  const rows = db.prepare('SELECT item_key FROM seen_items').all() as { item_key: string }[];
  return new Set(rows.map((r) => r.item_key));
}

export function markSeen(db: DatabaseSync, keys: string[]): number {
  const stmt = db.prepare('INSERT OR IGNORE INTO seen_items (item_key, seen_at) VALUES (?, ?)');
  const now = new Date().toISOString();
  let n = 0;
  db.exec('BEGIN');
  try {
    for (const key of keys) n += Number(stmt.run(key, now).changes);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return n;
}

export interface BadgeView {
  id: string;
  /** Null for a hidden badge that is still locked. */
  name: string | null;
  description: string | null;
  hint: string;
  xp: number;
  hidden: boolean;
  icon: string;
  unlockedTs: number | null;
  isNew: boolean;
  progress: { current: number; target: number; unit: string } | null;
  followable: boolean;
  /** Event badge whose event is over without it being achieved ("Niet gehaald"). */
  missed: boolean;
}

export function badgesResponse(state: GameState, seen: Set<string>, chosenId: string | null = null) {
  // Completed weekly challenges are internal XP items, not badges in the grid.
  const visible = state.badges.filter((b) => CATEGORIES.some((c) => c.id === b.category));
  const unlocked = visible.filter((b) => b.unlockedTs !== null);
  const followed = pickFollowedBadge(visible, chosenId);
  return {
    /** The badge on the cockpit right now, and whether it was chosen by the user. */
    followedId: followed?.badge.id ?? null,
    followedAuto: followed?.auto ?? true,
    setupNeeded: state.setupNeeded,
    timeZone: state.timeZone,
    unlocked: unlocked.length,
    total: visible.length,
    /** All bonus XP, including completed weekly challenges. */
    bonusXp: state.badges.reduce((sum, b) => sum + (b.unlockedTs !== null ? b.xp : 0), 0),
    categories: CATEGORIES.map((c) => ({
      id: c.id,
      name: c.name,
      badges: state.badges
        .filter((b) => b.category === c.id)
        .map((b): BadgeView => {
          const secret = b.hidden && b.unlockedTs === null;
          const missed = b.unlockedTs === null && b.availableUntil != null && state.now >= b.availableUntil;
          return {
            id: b.id,
            name: secret ? null : b.name,
            description: secret ? null : b.description,
            hint: secret ? '???' : b.hint,
            xp: b.xp,
            hidden: b.hidden,
            icon: b.icon,
            unlockedTs: b.unlockedTs,
            isNew: b.unlockedTs !== null && !seen.has(`badge:${b.id}`),
            progress: b.progress,
            followable: isFollowable(b) && b.unlockedTs === null && !missed,
            missed,
          };
        }),
    })).filter((c) => c.badges.length > 0),
  };
}

const nf = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });

export function currentRecords(state: GameState): RecordEntry[] {
  const tz = state.timeZone;
  return recordEntries(state.history?.records ?? null, state.chargingRecords, {
    km: (v) => nf.format(Math.round(v)),
    kw: (v) => nf1.format(v),
    period: (key) => (key.length === 10 ? dayShort(key) : periodLabel(key, true)),
    date: (ts) => new Date(ts).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz }),
    dayTs: (key) => zonedMidnight(key, tz),
  });
}

/**
 * Items for the reveal screen: everything reached but not yet seen, including
 * records that already existed before the first reveal.
 */
export function revealResponse(
  state: GameState,
  db: DatabaseSync,
  opts: { festive: boolean; preview: boolean; yearReviewReady: (year: number) => boolean } = { festive: true, preview: false, yearReviewReady: () => false },
): { items: RevealItem[]; theme: 'winter' | null } {
  const running = activeEvent(state.now, state.timeZone);
  const theme = (running && opts.festive) || opts.preview ? 'winter' : null;
  if (opts.preview) return { items: previewRevealItems(state), theme };
  if (state.setupNeeded) return { items: [], theme: null };
  const records = currentRecords(state);
  const seen = seenKeys(db);
  const items = revealItems({
    badges: state.badges,
    timeline: state.history?.timeline ?? { initial: [], events: [] },
    records,
    seen,
    now: state.now,
    weekReview: state.weekReview,
    extra: stampRevealItems(state.bingo, seen),
  });
  return { items: [...eventRevealItems(state, opts.festive, seen, opts.yearReviewReady), ...items], theme };
}
