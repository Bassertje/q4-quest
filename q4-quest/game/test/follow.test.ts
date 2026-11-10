import { describe, expect, it } from 'vitest';
import type { BadgeResult } from '../src/badges.ts';
import { isFollowable, pickFollowedBadge } from '../src/follow.ts';
import { rankForLevel, rankIcon, rankList } from '../src/levels.ts';

const b = (id: string, current: number | null, target = 100, extra: Partial<BadgeResult> = {}): BadgeResult => ({
  id, name: id, description: '', hint: '', category: 'rijden', xp: 10, hidden: false, icon: 'car', unlockedTs: null,
  progress: current === null ? null : { current, target, unit: 'km' },
  ...extra,
});

describe('pickFollowedBadge', () => {
  const badges = [b('a', 30), b('b', 80), b('c', 95, 100, { unlockedTs: 1 }), b('d', null), b('e', 99, 100, { hidden: true })];

  it('uses the chosen badge when it can be followed and is not earned yet', () => {
    expect(pickFollowedBadge(badges, 'a')).toMatchObject({ badge: { id: 'a' }, auto: false, remaining: 70 });
  });

  it('falls back to the highest progress percentage', () => {
    expect(pickFollowedBadge(badges, null)).toMatchObject({ badge: { id: 'b' }, auto: true, remaining: 20 });
    // The chosen badge was earned (c), has no progress (d) or is hidden (e): automatic.
    for (const id of ['c', 'd', 'e', 'unknown']) expect(pickFollowedBadge(badges, id)?.badge.id).toBe('b');
  });

  it('breaks ties on the smallest remaining amount and returns null without candidates', () => {
    expect(pickFollowedBadge([b('x', 50, 100), b('y', 5, 10)], null)?.badge.id).toBe('y');
    expect(pickFollowedBadge([b('d', null)], null)).toBeNull();
  });

  it('only follows measurable, visible badges', () => {
    expect(isFollowable(b('a', 1))).toBe(true);
    expect(isFollowable(b('d', null))).toBe(false);
    expect(isFollowable(b('e', 1, 10, { hidden: true }))).toBe(false);
  });
});

describe('ranks', () => {
  it('lists every rank with its level range and XP threshold', () => {
    expect(rankList()).toEqual([
      { title: 'Leerling', icon: 'sprout', fromLevel: 1, toLevel: 4, xp: 100 },
      { title: 'Pendelaar', icon: 'briefcase', fromLevel: 5, toLevel: 9, xp: 1_500 },
      { title: 'Wegvreter', icon: 'cutlery', fromLevel: 10, toLevel: 14, xp: 5_500 },
      { title: 'Kilometervreter', icon: 'speedo', fromLevel: 15, toLevel: 19, xp: 12_000 },
      { title: 'Snelwegridder', icon: 'helmet', fromLevel: 20, toLevel: 24, xp: 21_000 },
      { title: 'Asfaltlegende', icon: 'star', fromLevel: 25, toLevel: 29, xp: 32_500 },
      { title: 'Orbitaal', icon: 'planet', fromLevel: 30, toLevel: null, xp: 46_500 },
    ]);
    expect(rankForLevel(0)).toBe('Leerling');
    expect(rankIcon('Orbitaal')).toBe('planet');
  });
});
