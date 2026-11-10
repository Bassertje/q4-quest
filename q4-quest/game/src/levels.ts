/** Cumulative XP needed to reach level L: 50 × L × (L + 1). */
export function xpForLevel(level: number): number {
  return 50 * level * (level + 1);
}

/** Highest level whose cumulative XP requirement is met (0 below 100 XP). */
export function levelForXp(xp: number): number {
  if (!(xp > 0)) return 0;
  // Solve 50·L·(L+1) ≤ xp, then correct for floating point at the edges.
  let level = Math.floor((-1 + Math.sqrt(1 + (4 * xp) / 50)) / 2);
  while (xpForLevel(level + 1) <= xp) level++;
  while (level > 0 && xpForLevel(level) > xp) level--;
  return level;
}

/** Rank titles per block of 5 levels, lowest first, with a pixel-art icon id. */
const RANK_DEFS: { from: number; title: string; icon: string }[] = [
  { from: 0, title: 'Leerling', icon: 'sprout' },
  { from: 5, title: 'Pendelaar', icon: 'briefcase' },
  { from: 10, title: 'Wegvreter', icon: 'cutlery' },
  { from: 15, title: 'Kilometervreter', icon: 'speedo' },
  { from: 20, title: 'Snelwegridder', icon: 'helmet' },
  { from: 25, title: 'Asfaltlegende', icon: 'star' },
  { from: 30, title: 'Orbitaal', icon: 'planet' },
];

/** Rank title per block of 5 levels. Level 0 counts as "Leerling". */
export function rankForLevel(level: number): string {
  return [...RANK_DEFS].reverse().find((r) => level >= r.from)!.title;
}

export interface RankInfo {
  title: string;
  icon: string;
  /** First level of this rank (Leerling: 1, the first level). */
  fromLevel: number;
  /** Last level of this rank, or null for the highest rank. */
  toLevel: number | null;
  /** Cumulative XP needed to reach the rank. */
  xp: number;
}

/** All ranks with their level range and XP threshold, lowest first. */
export function rankList(): RankInfo[] {
  return RANK_DEFS.map((r, i) => {
    const fromLevel = Math.max(1, r.from);
    const next = RANK_DEFS[i + 1];
    return { title: r.title, icon: r.icon, fromLevel, toLevel: next ? next.from - 1 : null, xp: xpForLevel(fromLevel) };
  });
}

/** Pixel-art icon id of a rank title. */
export function rankIcon(title: string): string {
  return RANK_DEFS.find((r) => r.title === title)?.icon ?? 'star';
}

export interface LevelProgress {
  xp: number;
  level: number;
  rank: string;
  /** XP at which the current level started. */
  levelStartXp: number;
  /** XP needed for the next level. */
  nextLevelXp: number;
  /** 0..1 progress within the current level. */
  fraction: number;
}

export function levelProgress(xp: number): LevelProgress {
  const safeXp = Math.max(0, Math.floor(xp));
  const level = levelForXp(safeXp);
  const levelStartXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  return {
    xp: safeXp,
    level,
    rank: rankForLevel(level),
    levelStartXp,
    nextLevelXp,
    fraction: (safeXp - levelStartXp) / (nextLevelXp - levelStartXp),
  };
}
