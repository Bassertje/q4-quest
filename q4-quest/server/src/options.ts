import { existsSync, readFileSync } from 'node:fs';

/** Logical sensor keys used throughout the app (independent of entity IDs). */
export const SENSOR_KEYS = [
  'odometer',
  'soc',
  'charging_power',
  'charging_state',
  'charging_type',
  'range',
  'parking_brake',
] as const;

export type SensorKey = (typeof SENSOR_KEYS)[number];

export interface Options {
  /** Entity ID per logical sensor, or null when not configured. */
  entities: Record<SensorKey, string | null>;
  batteryKwh: number;
}

export const DEFAULT_BATTERY_KWH = 77;

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;

/** Fictional entity IDs used in mock mode. */
export const MOCK_OPTIONS_RAW = {
  odometer_entity: 'sensor.my_ev_odometer',
  soc_entity: 'sensor.my_ev_battery_level',
  charging_power_entity: 'sensor.my_ev_charging_power',
  charging_state_entity: 'sensor.my_ev_charging_state',
  charging_type_entity: 'sensor.my_ev_charging_type',
  range_entity: 'sensor.my_ev_range',
  parking_brake_entity: 'binary_sensor.my_ev_parking_brake',
  battery_kwh: DEFAULT_BATTERY_KWH,
};

/**
 * Turn the raw add-on options (from /data/options.json) into a clean Options
 * object. Empty or malformed entity IDs become null; an invalid battery size
 * falls back to the default.
 */
export function parseOptions(raw: unknown): Options {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const entities = {} as Record<SensorKey, string | null>;
  for (const key of SENSOR_KEYS) {
    const value = obj[`${key}_entity`];
    const trimmed = typeof value === 'string' ? value.trim().toLowerCase() : '';
    entities[key] = ENTITY_ID.test(trimmed) ? trimmed : null;
  }
  const battery = Number(obj.battery_kwh);
  const batteryKwh =
    Number.isFinite(battery) && battery > 0 && battery <= 300 ? battery : DEFAULT_BATTERY_KWH;
  return { entities, batteryKwh };
}

/** Load options from disk. In mock mode without an options file, use mock IDs. */
export function loadOptions(path: string, mock: boolean): Options {
  if (existsSync(path)) {
    try {
      return parseOptions(JSON.parse(readFileSync(path, 'utf8')));
    } catch (err) {
      console.warn(`[options] could not read ${path}: ${(err as Error).message}`);
    }
  }
  return parseOptions(mock ? MOCK_OPTIONS_RAW : {});
}
