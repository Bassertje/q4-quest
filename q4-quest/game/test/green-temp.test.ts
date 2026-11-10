import { describe, expect, it } from 'vitest';
import { co2Saved, greenTotals, litersSaved } from '../src/green.ts';
import { dailyTemperatures, monthlyStats, temperatureAt, tripStartTemperatures } from '../src/temperature.ts';
import type { ChargingSession } from '../src/charging.ts';

const f = { co2PetrolKgPerKm: 0.18, co2GridKgPerKwh: 0.33, petrolLPer100km: 6.5 };
const at = (iso: string) => Date.parse(iso);

describe('green', () => {
  it('computes CO₂ saved, litres and trees', () => {
    expect(co2Saved(1_000, 180, f)).toBeCloseTo(180 - 59.4);
    expect(litersSaved(1_000, f)).toBe(65);
    expect(greenTotals(1_000, 180, f)).toEqual({ co2Kg: 121, liters: 65, trees: 6.1 });
  });

  it('never shows negative CO₂ and has no CO₂ without charging data', () => {
    expect(greenTotals(10, 500, f).co2Kg).toBe(0);
    expect(greenTotals(1_000, null, f)).toEqual({ co2Kg: null, liters: 65, trees: null });
  });
});

describe('temperature', () => {
  const temps = [
    { ts: at('2026-01-10T06:00:00Z'), value: -2 },
    { ts: at('2026-01-10T12:00:00Z'), value: 4 },
    { ts: at('2026-01-11T12:00:00Z'), value: 6 },
  ];

  it('uses the last recent reading as the temperature at a moment', () => {
    expect(temperatureAt(temps, at('2026-01-10T07:00:00Z'))).toBe(-2);
    expect(temperatureAt(temps, at('2026-01-10T10:00:00Z'))).toBeNull(); // older than 3 hours
    expect(temperatureAt(temps, at('2026-01-10T05:00:00Z'))).toBeNull(); // nothing before
  });

  it('averages per day and links trips to their start temperature', () => {
    expect([...dailyTemperatures(temps, 'UTC')]).toEqual([
      ['2026-01-10', 1],
      ['2026-01-11', 6],
    ]);
    const trip = { start: at('2026-01-10T06:30:00Z'), end: at('2026-01-10T07:00:00Z'), km: 20, readings: 2, confirmedTs: at('2026-01-10T07:00:00Z') };
    expect(tripStartTemperatures([trip], temps)).toEqual([-2]);
  });

  it('combines monthly consumption (energy used ÷ km) with the average temperature', () => {
    const session = (iso: string, kwh: number): ChargingSession => ({
      start: at(iso), end: at(iso) + 3_600_000, ongoing: false, type: 'AC', socStart: 20, socEnd: 60, kwh, kwhMethod: 'soc', avgKw: kwh,
    });
    const odometer = [
      { ts: at('2026-01-01T08:00:00Z'), value: 5_000 },
      { ts: at('2026-01-20T08:00:00Z'), value: 5_200 },
      { ts: at('2026-02-03T08:00:00Z'), value: 5_240 },
    ];
    const energy = { odometer, soc: [], sessions: [session('2026-01-12T10:00:00Z', 40), session('2026-02-02T10:00:00Z', 10)], batteryKwh: 77, hasSoc: false };
    const stats = monthlyStats(
      new Map([['2026-01-01', 0], ['2026-01-20', 200], ['2026-02-03', 40]]),
      energy,
      dailyTemperatures(temps, 'UTC'),
      'UTC',
      at('2026-02-10T00:00:00Z'),
    );
    expect(stats).toEqual([
      { month: '2026-01', km: 200, kwh: 40, kwhPer100km: 20, avgTemp: 3.5 },
      { month: '2026-02', km: 40, kwh: 10, kwhPer100km: null, avgTemp: null }, // < 100 km
    ]);
  });
});
