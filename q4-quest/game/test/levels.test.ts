import { describe, expect, it } from 'vitest';
import { levelForXp, levelProgress, rankForLevel, xpForLevel } from '../src/levels.ts';

describe('levels', () => {
  it('matches the examples from the spec', () => {
    expect(xpForLevel(1)).toBe(100);
    expect(xpForLevel(10)).toBe(5_500);
    expect(xpForLevel(20)).toBe(21_000);
  });

  it('finds the level for an XP amount, exactly at the edges', () => {
    expect(levelForXp(0)).toBe(0);
    expect(levelForXp(99)).toBe(0);
    expect(levelForXp(100)).toBe(1);
    expect(levelForXp(5_499)).toBe(9);
    expect(levelForXp(5_500)).toBe(10);
    expect(levelForXp(21_000)).toBe(20);
    for (let l = 0; l < 200; l++) {
      expect(levelForXp(xpForLevel(l))).toBe(l);
      expect(levelForXp(xpForLevel(l + 1) - 1)).toBe(l);
    }
  });

  it('gives a rank title per 5 levels', () => {
    expect(rankForLevel(0)).toBe('Leerling');
    expect(rankForLevel(4)).toBe('Leerling');
    expect(rankForLevel(5)).toBe('Pendelaar');
    expect(rankForLevel(14)).toBe('Wegvreter');
    expect(rankForLevel(15)).toBe('Kilometervreter');
    expect(rankForLevel(24)).toBe('Snelwegridder');
    expect(rankForLevel(29)).toBe('Asfaltlegende');
    expect(rankForLevel(30)).toBe('Orbitaal');
    expect(rankForLevel(99)).toBe('Orbitaal');
  });

  it('reports progress within the level', () => {
    const p = levelProgress(17_421);
    expect(p.level).toBe(18);
    expect(p.levelStartXp).toBe(17_100);
    expect(p.nextLevelXp).toBe(19_000);
    expect(p.fraction).toBeCloseTo(321 / 1_900);
    expect(p.rank).toBe('Kilometervreter');
  });
});
