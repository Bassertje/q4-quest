import { describe, expect, it } from 'vitest';
import {
  chargingRecords,
  chargingSessions,
  chargingTotals,
  consumptionEstimate,
  integrate,
  isChargingState,
  normaliseType,
  toKw,
  type ChargingSession,
} from '../src/charging.ts';

const MIN = 60_000;
const H = 60 * MIN;
const base = { state: [], type: [], soc: [], batteryKwh: 77, now: 100 * H };

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
  it('builds a session from power readings and estimates kWh by integration', () => {
    const sessions = chargingSessions({
      ...base,
      power: [
        { ts: 10 * H, kw: 11 },
        { ts: 11 * H, kw: 11 },
        { ts: 12 * H, kw: 11 },
        { ts: 13 * H, kw: 0 },
      ],
      soc: [
        { ts: 9 * H, value: 30 },
        { ts: 13 * H + 5 * MIN, value: 72 },
      ],
      type: [{ ts: 10 * H, state: 'AC' }],
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      start: 10 * H,
      end: 13 * H,
      ongoing: false,
      type: 'AC',
      typeInferred: false,
      socStart: 30,
      socEnd: 72,
      peakKw: 11,
      // Trapezoid: 11 + 11 + (11 + 0) / 2 = 27.5 kWh.
      kwh: 27.5,
      kwhMethod: 'power',
    });
  });

  it('bridges gaps of up to 15 minutes, but not longer', () => {
    const power = [
      { ts: 0, kw: 50 },
      { ts: 10 * MIN, kw: 0 },
      { ts: 20 * MIN, kw: 60 }, // 10 min gap: same session
      { ts: 30 * MIN, kw: 0 },
      { ts: 60 * MIN, kw: 40 }, // 30 min gap: new session
      { ts: 70 * MIN, kw: 0 },
    ];
    const sessions = chargingSessions({ ...base, power });
    expect(sessions.map((s) => [s.start, s.end])).toEqual([
      [0, 30 * MIN],
      [60 * MIN, 70 * MIN],
    ]);
    // No type sensor: inferred from the peak power.
    expect(sessions[0]).toMatchObject({ type: 'DC', typeInferred: true, peakKw: 60 });
  });

  it('falls back to ΔSoC × battery size with fewer than 3 power readings', () => {
    const sessions = chargingSessions({
      ...base,
      power: [],
      state: [
        { ts: 10 * H, state: 'charging' },
        { ts: 12 * H, state: 'not_charging' },
      ],
      soc: [
        { ts: 9 * H, value: 20 },
        { ts: 12 * H, value: 70 },
      ],
    });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ kwh: 38.5, kwhMethod: 'soc', peakKw: null, type: null });
  });

  it('lets a "not charging" state end a stale power value', () => {
    const sessions = chargingSessions({
      ...base,
      power: [{ ts: 10 * H, kw: 11 }],
      state: [
        { ts: 10 * H, state: 'charging' },
        { ts: 11 * H, state: 'not_charging' },
      ],
    });
    expect(sessions.map((s) => [s.start, s.end, s.ongoing])).toEqual([[10 * H, 11 * H, false]]);
  });

  it('marks a session that is still running as ongoing', () => {
    const sessions = chargingSessions({ ...base, now: 12 * H, power: [{ ts: 11 * H, kw: 7 }] });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ ongoing: true, end: 12 * H });
  });
});

describe('totals, consumption and records', () => {
  const s = (start: number, kwh: number | null, type: 'AC' | 'DC', peakKw: number): ChargingSession => ({
    start,
    end: start + H,
    ongoing: false,
    type,
    typeInferred: false,
    socStart: null,
    socEnd: null,
    peakKw,
    kwh,
    kwhMethod: kwh === null ? null : 'power',
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

  it('estimates consumption over 30 days only with enough data', () => {
    const daily = new Map([
      ['2026-10-05', 100], // outside the window
      ['2026-10-20', 250],
      ['2026-11-01', 250],
    ]);
    expect(consumptionEstimate(sessions, daily, now, 'UTC')).toEqual({ kwhPer100km: 18, km: 500, kwh: 90, sessions: 3 });
    const little = new Map([['2026-11-01', 200]]);
    expect(consumptionEstimate(sessions, little, now, 'UTC').kwhPer100km).toBeNull();
  });

  it('finds the fastest session and the busiest month', () => {
    const r = chargingRecords(sessions, 'UTC');
    expect(r.fastest?.peakKw).toBe(150.5);
    expect(r.busiestMonth).toEqual({ key: '2026-10', sessions: 2 });
  });
});
