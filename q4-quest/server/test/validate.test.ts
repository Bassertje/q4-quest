import { describe, expect, it } from 'vitest';
import { pickAttrs, validateReading } from '../src/collector/validate.ts';

const H = 3_600_000;

describe('validateReading', () => {
  it('ignores unknown and unavailable states', () => {
    expect(validateReading('odometer', 'unknown', null, 0, null).ok).toBe(false);
    expect(validateReading('soc', 'unavailable', null, 0, null).ok).toBe(false);
  });

  it('requires numbers for numeric sensors but accepts text for others', () => {
    expect(validateReading('soc', 'abc', null, 0, null)).toEqual({ ok: false, reason: 'not_numeric' });
    expect(validateReading('charging_state', 'charging', null, 0, null)).toEqual({ ok: true, value: 'charging' });
  });

  it('rejects an odometer value lower than the previous one', () => {
    expect(validateReading('odometer', '999', null, H, { ts: 0, value: 1_000 })).toEqual({
      ok: false,
      reason: 'odometer_decreased',
    });
    expect(validateReading('odometer', '1000', null, H, { ts: 0, value: 1_000 }).ok).toBe(true);
  });

  it('rejects implausible odometer jumps', () => {
    expect(validateReading('odometer', '5000', null, H, { ts: 0, value: 1_000 })).toEqual({
      ok: false,
      reason: 'odometer_spike',
    });
    // A long gap allows a large increase.
    expect(validateReading('odometer', '5000', null, 48 * H, { ts: 0, value: 1_000 }).ok).toBe(true);
  });

  it('converts miles to km', () => {
    expect(validateReading('odometer', '100', { unit_of_measurement: 'mi' }, 0, null)).toEqual({
      ok: true,
      value: '160.9',
    });
  });

  it('keeps only useful attributes', () => {
    expect(pickAttrs({ unit_of_measurement: 'kW', friendly_name: 'x', icon: 'y' })).toEqual({
      unit_of_measurement: 'kW',
    });
    expect(pickAttrs({ friendly_name: 'x' })).toBeNull();
  });
});
