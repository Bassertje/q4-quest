import { describe, expect, it } from 'vitest';
import { WORLD_TRIP, destinationDates, destinationProgress, destinationXp } from '../src/milestones.ts';

describe('world trip', () => {
  it('has the destinations from the spec in order of distance', () => {
    expect(WORLD_TRIP.map((d) => [d.km, d.id])).toEqual([
      [100, 'karman'],
      [408, 'iss'],
      [1_000, 'milestone_1000'],
      [1_650, 'rome'],
      [3_940, 'route66'],
      [5_860, 'atlantic'],
      [9_289, 'transsib'],
      [16_600, 'downunder'],
      [21_196, 'greatwall'],
      [30_000, 'panam'],
      [40_075, 'milestone_40075'],
    ]);
    expect(WORLD_TRIP.every((d) => d.story.endsWith('.'))).toBe(true);
    expect(new Set(WORLD_TRIP.map((d) => d.icon)).size).toBe(WORLD_TRIP.length);
  });

  it('gives km ÷ 10 XP, rounded down', () => {
    expect(destinationXp(100)).toBe(10);
    expect(destinationXp(9_289)).toBe(928);
    expect(destinationXp(40_075)).toBe(4_007);
  });

  it('computes progress to the next destination', () => {
    const p = destinationProgress(2_795);
    expect(p.previous?.id).toBe('rome');
    expect(p.next?.id).toBe('route66');
    expect(p.fraction).toBeCloseTo(0.5);
    expect(p.remainingKm).toBe(1_145);
    expect(destinationProgress(0)).toMatchObject({ previous: null, fraction: 0, remainingKm: 100 });
    expect(destinationProgress(50_000)).toMatchObject({ next: null, fraction: 1, remainingKm: 0 });
  });

  it('dates destinations by the first reading at or above them', () => {
    const dates = destinationDates([
      { ts: 1, value: 50 },
      { ts: 2, value: 100 },
      { ts: 3, value: 1_200 },
    ]);
    expect(dates.map((d) => [d.destination.id, d.ts])).toEqual([
      ['karman', 2],
      ['iss', 3],
      ['milestone_1000', 3],
    ]);
  });
});
