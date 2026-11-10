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

const RANKS: { from: number; title: string }[] = [
  { from: 30, title: 'Orbitaal' },
  { from: 25, title: 'Asfaltlegende' },
  { from: 20, title: 'Snelwegridder' },
  { from: 15, title: 'Kilometervreter' },
  { from: 10, title: 'Wegvreter' },
  { from: 5, title: 'Pendelaar' },
  { from: 0, title: 'Leerling' },
];

/** Rank title per block of 5 levels. Level 0 counts as "Leerling". */
export function rankForLevel(level: number): string {
  return RANKS.find((r) => level >= r.from)!.title;
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
