import { describe, expect, it } from 'vitest';
import { DEFAULT_BATTERY_KWH, MOCK_OPTIONS_RAW, parseOptions } from '../src/options.ts';

describe('parseOptions', () => {
  it('treats empty options as not configured', () => {
    const o = parseOptions({ odometer_entity: '', battery_kwh: 77 });
    expect(o.entities.odometer).toBeNull();
    expect(o.entities.soc).toBeNull();
    expect(o.batteryKwh).toBe(77);
  });

  it('accepts valid entity IDs and trims them', () => {
    const o = parseOptions({ odometer_entity: '  sensor.my_ev_odometer ' });
    expect(o.entities.odometer).toBe('sensor.my_ev_odometer');
  });

  it('rejects malformed entity IDs', () => {
    expect(parseOptions({ odometer_entity: 'not an entity' }).entities.odometer).toBeNull();
  });

  it('falls back to the default battery size', () => {
    expect(parseOptions({ battery_kwh: -1 }).batteryKwh).toBe(DEFAULT_BATTERY_KWH);
    expect(parseOptions({ battery_kwh: 'abc' }).batteryKwh).toBe(DEFAULT_BATTERY_KWH);
    expect(parseOptions(null).batteryKwh).toBe(DEFAULT_BATTERY_KWH);
  });

  it('configures every sensor in mock mode', () => {
    const o = parseOptions(MOCK_OPTIONS_RAW);
    expect(Object.values(o.entities).every((v) => v !== null)).toBe(true);
  });
});
