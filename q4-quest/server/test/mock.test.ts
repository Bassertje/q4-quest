import { describe, expect, it } from 'vitest';
import { generateMockHistory } from '../src/mock/generate.ts';

const END = Date.UTC(2026, 5, 1);

describe('generateMockHistory', () => {
  const readings = generateMockHistory({ seed: 1, days: 90, endTs: END });

  it('is deterministic for the same seed', () => {
    expect(generateMockHistory({ seed: 1, days: 90, endTs: END })).toEqual(readings);
  });

  it('produces a never-decreasing odometer', () => {
    const odo = readings.filter((r) => r.key === 'odometer').map((r) => Number(r.value));
    expect(odo.length).toBeGreaterThan(100);
    for (let i = 1; i < odo.length; i++) expect(odo[i]).toBeGreaterThanOrEqual(odo[i - 1]);
  });

  it('contains AC and DC charging sessions', () => {
    const types = new Set(readings.filter((r) => r.key === 'charging_type').map((r) => r.value));
    expect(types).toEqual(new Set(['AC', 'DC']));
  });

  it('keeps SoC between 0 and 100 and stays before the end time', () => {
    for (const r of readings) {
      if (r.key === 'soc') {
        expect(Number(r.value)).toBeGreaterThanOrEqual(0);
        expect(Number(r.value)).toBeLessThanOrEqual(100);
      }
      expect(r.ts).toBeLessThanOrEqual(END);
    }
  });
});
