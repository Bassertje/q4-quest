import { describe, expect, it } from 'vitest';
import { milestoneAt, milestoneDates, milestoneProgress, milestonesReached } from '../src/milestones.ts';

describe('milestones', () => {
  it('continues every 25,000 km after 100,000', () => {
    expect(milestoneAt(11).km).toBe(100_000);
    expect(milestoneAt(12).km).toBe(125_000);
    expect(milestoneAt(13).km).toBe(150_000);
  });

  it('names the earth milestone', () => {
    expect(milestoneAt(8)).toEqual({ km: 40_075, name: 'Rondje aarde' });
  });

  it('lists reached milestones', () => {
    expect(milestonesReached(999)).toEqual([]);
    expect(milestonesReached(17_421).map((m) => m.km)).toEqual([1_000, 2_500, 5_000, 7_500, 10_000, 15_000]);
  });

  it('computes progress to the next milestone', () => {
    const p = milestoneProgress(17_500);
    expect(p.previous?.km).toBe(15_000);
    expect(p.next.km).toBe(20_000);
    expect(p.fraction).toBeCloseTo(0.5);
    expect(p.remainingKm).toBe(2_500);
    expect(milestoneProgress(0).fraction).toBe(0);
  });

  it('dates milestones by the first reading at or above them', () => {
    const dates = milestoneDates([
      { ts: 1, value: 900 },
      { ts: 2, value: 1_000 },
      { ts: 3, value: 2_400 },
      { ts: 4, value: 5_100 },
    ]);
    expect(dates.map((d) => [d.milestone.km, d.ts])).toEqual([
      [1_000, 2],
      [2_500, 4],
      [5_000, 4],
    ]);
  });
});
