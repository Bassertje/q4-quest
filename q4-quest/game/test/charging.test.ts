import { describe, expect, it } from 'vitest';
import {
  chargingRecords,
  chargingSessions,
  chargingTotals,
  integrate,
  isChargingState,
  normaliseType,
  toKw,
  type ChargingSession,
} from '../src/charging.ts';

const MIN = 60_000;
const H = 60 * MIN;
const base = { state: [], type: [], soc: [], power: [], hasSoc: false, batteryKwh: 77, now: 100 * H };

describe('helpers', () => {
  it('converts power to kW using the unit', () => {
    expect(toKw(11_000, 'W')).toBe(11);
    expect(toKw(11, 'kW')).toBe(11);
    expect(toKw(7_400, null)).toBe(7.4);
    expect(toKw(50, undefined)).toBe(50);
  });

  it('recognises charging states and types', () => {
    expect(isChargingState('Charging')).toBe(true);
    expect(isChargingState('not_charging')).toBe(false);
    expect(isChargingState('on')).toBe(true);
    expect(normaliseType('dc')).toBe('DC');
    expect(normaliseType('AC')).toBe('AC');
    expect(normaliseType('unknown_type')).toBeNull();
  });

  it('integrates power with the trapezoidal rule', () => {
    // 10 → 20 kW over one hour = 15 kWh, then 20 kW for half an hour = 10 kWh.
    expect(integrate([{ ts: 0, kw: 10 }, { ts: H, kw: 20 }], 1.5 * H)).toBeCloseTo(25);
  });
});

describe('chargingSessions', () => {
  const withSoc = { ...base, hasSoc: true };

  it('rejects a false positive: short "charging" blip at 3.7 kW while the SoC drops', () => {
    const sessions = chargingSessions({
      ...withSoc,
      state: [
        { ts: 10 * H, state: 'charging' },
        { ts: 10 * H + 15 * MIN, state: 'not_charging' },
      ],
      power: [
        { ts: 10 * H, kw: 3.7 },
        { ts: 10 * H + 15 * MIN, kw: 0 },
      ],
      soc: [
        { ts: 9 * H, value: 64 },
        { ts: 10 * H + 20 * MIN, value: 63 },
      ],
    });
    expect(sessions).toEqual([]);
  });

  it('needs a rise of at least 2 percentage points', () => {
    const run = (after: number) =>
      chargingSessions({
        ...withSoc,
        state: [
          { ts: 10 * H, state: 'charging' },
          { ts: 11 * H, state: 'not_charging' },
        ],
        soc: [
          { ts: 9 * H, value: 50 },
          { ts: 11 * H, value: after },
        ],
      });
    expect(run(51.9)).toEqual([]);
    expect(run(52)).toHaveLength(1);
  });

  it('uses ΔSoC × battery size for kWh and the highest SoC up to 30 minutes after the end', () => {
    const sessions = chargingSessions({
      ...withSoc,
      power: [
        { ts: 10 * H, kw: 11 },
        { ts: 12 * H, kw: 0 },
      ],
      soc: [
        { ts: 9 * H, value: 30 },
        { ts: 11 * H, value: 50 },
        { ts: 12 * H + 25 * MIN, value: 60 }, // reported late, still counts
        { ts: 12 * H + 45 * MIN, value: 90 }, // too late
      ],
      type: [{ ts: 10 * H, state: 'AC' }],
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      start: 10 * H,
      end: 12 * H,
      socStart: 30,
      socEnd: 60,
      kwh: 23.1, // 30% of 77 kWh
      kwhMethod: 'soc',
      avgKw: 11.6, // 23.1 kWh in 2 hours
      type: 'AC',
    });
  });

  it('ignores a power value stuck at a low level during DC charging', () => {
    const sessions = chargingSessions({
      ...withSoc,
      power: [
        { ts: 10 * H, kw: 7.2 }, // stuck: the real power was much higher
        { ts: 10 * H + 30 * MIN, kw: 0 },
      ],
      soc: [
        { ts: 9 * H, value: 20 },
        { ts: 10 * H + 35 * MIN, value: 70 },
      ],
    });
    // 50% of 77 kWh = 38.5 kWh in 30 min = 77 kW average: DC.
    expect(sessions[0]).toMatchObject({ kwh: 38.5, avgKw: 77, type: 'DC' });
  });

  it('merges candidates less than 30 minutes apart before checking the SoC', () => {
    const sessions = chargingSessions({
      ...withSoc,
      power: [
        { ts: 0, kw: 50 },
        { ts: 10 * MIN, kw: 0 },
        { ts: 35 * MIN, kw: 60 }, // 25 min gap: merged
        { ts: 45 * MIN, kw: 0 },
        { ts: 90 * MIN, kw: 40 }, // 45 min gap: separate candidate
        { ts: 100 * MIN, kw: 0 },
      ],
      soc: [
        { ts: -MIN, value: 20 },
        { ts: 45 * MIN, value: 40 },
        { ts: 100 * MIN, value: 41 }, // only +1: rejected
      ],
    });
    expect(sessions.map((s) => [s.start, s.end])).toEqual([[0, 45 * MIN]]);
  });

  it('drops a blip with a falling SoC before merging, so it cannot move the start forward', () => {
    const sessions = chargingSessions({
      ...withSoc,
      state: [
        { ts: 10 * H, state: 'charging' }, // false positive while driving
        { ts: 10 * H + 15 * MIN, state: 'not_charging' },
        { ts: 10 * H + 35 * MIN, state: 'charging' }, // real session, 20 min later
        { ts: 12 * H, state: 'not_charging' },
      ],
      soc: [
        { ts: 9 * H, value: 60 },
        { ts: 10 * H + 10 * MIN, value: 57 }, // drops during the blip
        { ts: 12 * H, value: 80 },
      ],
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ start: 10 * H + 35 * MIN, end: 12 * H, socStart: 57, socEnd: 80 });
  });

  it('is DC when the type sensor reports dc during or up to 10 minutes after the session', () => {
    const run = (typeTs: number) =>
      chargingSessions({
        ...withSoc,
        state: [
          { ts: 10 * H, state: 'charging' },
          { ts: 13 * H, state: 'not_charging' },
        ],
        soc: [
          { ts: 9 * H, value: 40 },
          { ts: 13 * H, value: 60 }, // slow: 15.4 kWh in 3 h, about 5 kW
        ],
        type: [{ ts: typeTs, state: 'dc' }],
      })[0].type;
    expect(run(11 * H)).toBe('DC');
    expect(run(13 * H + 9 * MIN)).toBe('DC');
    expect(run(13 * H + 11 * MIN)).toBe('AC');
    expect(run(9 * H)).toBe('AC'); // reported before the session
  });

  it('integrates power only when no SoC sensor is configured', () => {
    const sessions = chargingSessions({
      ...base,
      hasSoc: false,
      power: [
        { ts: 10 * H, kw: 11 },
        { ts: 11 * H, kw: 11 },
        { ts: 12 * H, kw: 11 },
        { ts: 13 * H, kw: 0 },
      ],
    });
    // Trapezoid: 11 + 11 + (11 + 0) / 2 = 27.5 kWh over 3 hours.
    expect(sessions[0]).toMatchObject({ kwh: 27.5, kwhMethod: 'power', avgKw: 9.2, type: 'AC', socStart: null });
  });

  it('marks a session that is still running as ongoing', () => {
    const sessions = chargingSessions({
      ...withSoc,
      now: 12 * H,
      power: [{ ts: 11 * H, kw: 7 }],
      soc: [
        { ts: 10 * H, value: 50 },
        { ts: 11 * H + 50 * MIN, value: 56 },
      ],
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ ongoing: true, end: 12 * H });
  });
});

describe('totals, consumption and records', () => {
  const s = (start: number, kwh: number | null, type: 'AC' | 'DC', avgKw: number): ChargingSession => ({
    start,
    end: start + H,
    ongoing: false,
    type,
    socStart: null,
    socEnd: null,
    kwh,
    kwhMethod: kwh === null ? null : 'soc',
    avgKw,
  });
  const now = Date.parse('2026-11-10T12:00:00Z');
  const sessions = [
    s(Date.parse('2026-09-01T10:00:00Z'), 50, 'AC', 11), // outside the 30-day window
    s(Date.parse('2026-10-20T10:00:00Z'), 30, 'AC', 11),
    s(Date.parse('2026-10-25T10:00:00Z'), 40, 'DC', 150.5),
    s(Date.parse('2026-11-05T10:00:00Z'), 20, 'AC', 11),
    s(Date.parse('2026-11-06T10:00:00Z'), null, 'AC', 11),
  ];

  it('sums totals per type', () => {
    expect(chargingTotals(sessions)).toEqual({
      sessions: 5,
      kwh: 140,
      ac: { sessions: 4, kwh: 100 },
      dc: { sessions: 1, kwh: 40 },
    });
  });

  it('finds the fastest session and the busiest month', () => {
    const r = chargingRecords(sessions, 'UTC');
    expect(r.fastest?.avgKw).toBe(150.5);
    expect(r.busiestMonth).toEqual({ key: '2026-10', sessions: 2 });
  });
});
