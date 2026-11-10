import { describe, expect, it } from 'vitest';
import { buildCockpit } from '../src/cockpit.ts';

describe('buildCockpit', () => {
  it('returns null without odometer data', () => {
    expect(buildCockpit({ odometer: [], now: 0, timeZone: 'UTC' })).toBeNull();
  });

  it('combines level, milestones and distance', () => {
    const c = buildCockpit({
      odometer: [
        { ts: Date.parse('2026-11-09T08:00:00Z'), value: 14_950 },
        { ts: Date.parse('2026-11-10T08:00:00Z'), value: 15_020 },
      ],
      now: Date.parse('2026-11-10T12:00:00Z'),
      timeZone: 'UTC',
    })!;
    expect(c.odometer).toBe(15_020);
    expect(c.level.level).toBe(16);
    expect(c.destination.next?.id).toBe('downunder'); // 16,600 km
    expect(c.lastUnlocked).toBeNull(); // no badges passed in
    expect(c.bonusXp).toBe(0);
    expect(c.distance).toEqual({ today: 70, week: 70, month: 70 });
    expect(c.streak).toBe(1);
  });

  it('adds bonus XP of unlocked badges to the level and shows the latest badge', () => {
    const badge = (id: string, xp: number, unlockedTs: number | null) => ({
      id, name: id, description: '', hint: '', category: 'rijden' as const, xp, hidden: false, icon: 'car', unlockedTs, progress: null,
    });
    const c = buildCockpit({
      odometer: [{ ts: 1, value: 15_020 }],
      now: 2,
      timeZone: 'UTC',
      badges: [badge('a', 200, 1), badge('b', 100, 2), badge('c', 300, null)],
    })!;
    expect(c.bonusXp).toBe(300);
    expect(c.level.xp).toBe(15_320); // level 17 starts at 15,300 XP
    expect(c.level.level).toBe(17);
    expect(c.lastUnlocked?.id).toBe('b');
  });
});
