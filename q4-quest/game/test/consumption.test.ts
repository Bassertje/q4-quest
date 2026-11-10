import { describe, expect, it } from 'vitest';
import type { ChargingSession } from '../src/charging.ts';
import { consumptionEstimate } from '../src/charging.ts';
import { energyDataStart, periodEnergy } from '../src/consumption.ts';

const H = 3_600_000;
const D = 24 * H;
const at = (iso: string) => Date.parse(iso);
const session = (iso: string, kwh: number): ChargingSession => ({
  start: at(iso) - H, end: at(iso), ongoing: false, type: 'AC', socStart: 30, socEnd: 60, kwh, kwhMethod: 'soc', avgKw: kwh,
});

// Fictional data: 400 km in 10 days, SoC from 80% down to 50%, one charge of 40 kWh.
const odometer = [
  { ts: at('2026-03-01T00:00:00Z'), value: 10_000 },
  { ts: at('2026-03-05T12:00:00Z'), value: 10_200 },
  { ts: at('2026-03-10T12:00:00Z'), value: 10_400 },
];
const soc = [
  { ts: at('2026-03-01T00:00:00Z'), value: 80 },
  { ts: at('2026-03-05T12:00:00Z'), value: 40 },
  { ts: at('2026-03-06T12:00:00Z'), value: 92 },
  { ts: at('2026-03-10T12:00:00Z'), value: 50 },
];
const input = { odometer, soc, sessions: [session('2026-03-06T12:00:00Z', 40)], batteryKwh: 77, hasSoc: true };

describe('periodEnergy', () => {
  it('adds the SoC difference to the charged kWh', () => {
    const e = periodEnergy(input, at('2026-03-01T00:00:00Z'), at('2026-03-11T00:00:00Z'))!;
    // 40 kWh charged + (80 − 50)% × 77 kWh = 40 + 23.1 = 63.1 kWh over 400 km.
    expect(e).toMatchObject({ km: 400, chargedKwh: 40, usedKwh: 63.1, kwhPer100km: 15.8, sessions: 1 });
  });

  it('uses the SoC at or before the start and the last SoC before the end', () => {
    const e = periodEnergy(input, at('2026-03-05T12:00:00Z'), at('2026-03-11T00:00:00Z'))!;
    // Start: 40% (the reading at the start), end: 50% (last before the end) → 40 + (40 − 50)% × 77 = 32.3 kWh.
    expect(e).toMatchObject({ km: 200, usedKwh: 32.3, kwhPer100km: 16.2 });
    // A reading exactly at the end belongs to the next period.
    expect(periodEnergy(input, at('2026-03-05T12:00:00Z'), at('2026-03-10T12:00:00Z'))?.km).toBe(0);
  });

  it('never starts before odometer and SoC data both exist', () => {
    const late = { ...input, soc: soc.slice(1) }; // SoC data only from 5 March
    expect(energyDataStart(late)).toBe(at('2026-03-05T12:00:00Z'));
    expect(periodEnergy(late, at('2026-02-01T00:00:00Z'), at('2026-03-11T00:00:00Z'))?.from).toBe(at('2026-03-05T12:00:00Z'));
  });

  it('uses only the charged kWh without a SoC sensor', () => {
    const e = periodEnergy({ ...input, soc: [], hasSoc: false }, at('2026-03-01T00:00:00Z'), at('2026-03-11T00:00:00Z'))!;
    expect(e).toMatchObject({ usedKwh: 40, kwhPer100km: 10 });
  });
});

describe('consumptionEstimate', () => {
  it('shows the 30-day estimate only with at least 300 km in the window', () => {
    const now = at('2026-03-10T18:00:00Z');
    expect(consumptionEstimate(input, now)).toMatchObject({ kwhPer100km: 15.8, km: 400, kwh: 63.1, from: at('2026-03-01T00:00:00Z') });
    const short = { ...input, odometer: odometer.slice(0, 2) };
    expect(consumptionEstimate(short, now + 0 * D).kwhPer100km).toBeNull(); // 200 km
  });
});
