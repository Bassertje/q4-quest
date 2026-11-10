import { describe, expect, it } from 'vitest';
import { brakeEngaged, tripBlocks } from '../src/trips.ts';

const MIN = 60_000;

describe('tripBlocks', () => {
  const odo = [
    { ts: 0, value: 100 },
    { ts: 600 * MIN, value: 110 }, // trip 1 starts
    { ts: 620 * MIN, value: 125 },
    { ts: 650 * MIN, value: 140 }, // 30 min later: same trip
    { ts: 650 * MIN + 1, value: 140 }, // no increase: ignored
    { ts: 700 * MIN, value: 150 }, // 50 min after last increase: new trip
    { ts: 710 * MIN, value: 149 }, // decrease: ignored
  ];

  it('groups increases less than 45 minutes apart', () => {
    expect(tripBlocks(odo)).toEqual([
      { start: 600 * MIN, end: 650 * MIN, km: 40 },
      { start: 700 * MIN, end: 700 * MIN, km: 10 },
    ]);
  });

  it('splits on an engaged parking brake', () => {
    const brake = [
      { ts: 621 * MIN, state: 'on' },
      { ts: 640 * MIN, state: 'off' },
    ];
    expect(tripBlocks(odo, brake).map((t) => t.km)).toEqual([25, 15, 10]);
  });

  it('recognises common "engaged" states', () => {
    expect(brakeEngaged('on')).toBe(true);
    expect(brakeEngaged('Engaged')).toBe(true);
    expect(brakeEngaged('off')).toBe(false);
  });

  it('returns nothing for fewer than two readings', () => {
    expect(tripBlocks([{ ts: 0, value: 1 }])).toEqual([]);
  });
});
