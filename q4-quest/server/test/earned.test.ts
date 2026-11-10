import { describe, expect, it } from 'vitest';
import type { BadgeResult } from '../../game/src/index.ts';
import { openDatabase } from '../src/db.ts';
import { keepEarnedBadges } from '../src/game-state.ts';

const badge = (id: string, unlockedTs: number | null): BadgeResult => ({
  id, name: id, description: '', hint: '', category: 'zuinigheid', xp: 100, hidden: false, icon: 'leaf', unlockedTs, progress: null,
});

describe('keepEarnedBadges', () => {
  it('never takes a badge away once it was earned', () => {
    const db = openDatabase(':memory:');
    expect(keepEarnedBadges(db, [badge('eco_week', 1_000)])[0].unlockedTs).toBe(1_000);
    // A later calculation no longer confirms the badge: it keeps its date.
    expect(keepEarnedBadges(db, [badge('eco_week', null)])[0].unlockedTs).toBe(1_000);
    // A recalculated date is taken over.
    expect(keepEarnedBadges(db, [badge('eco_week', 900)])[0].unlockedTs).toBe(900);
    expect(keepEarnedBadges(db, [badge('eco_week', null)])[0].unlockedTs).toBe(900);
    // Badges never earned stay locked.
    expect(keepEarnedBadges(db, [badge('winter_hard', null)])[0].unlockedTs).toBeNull();
  });
});
