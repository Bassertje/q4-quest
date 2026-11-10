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
  'temperature',
] as const;

export type SensorKey = (typeof SENSOR_KEYS)[number];

export interface Options {
  /** Entity ID per logical sensor, or null when not configured. */
  entities: Record<SensorKey, string | null>;
  batteryKwh: number;
  /** CO₂ of a petrol car per km (kg). */
  co2PetrolKgPerKm: number;
  /** CO₂ of grid electricity per kWh (kg). */
  co2GridKgPerKwh: number;
  /** Fuel use of a comparable petrol car (l/100 km). */
  petrolLPer100km: number;
}

export const DEFAULT_BATTERY_KWH = 77;
export const DEFAULT_CO2_PETROL_KG_PER_KM = 0.18;
export const DEFAULT_CO2_GRID_KG_PER_KWH = 0.33;
export const DEFAULT_PETROL_L_PER_100KM = 6.5;

/** A positive number within (0, max], or the default. */
function positive(value: unknown, fallback: number, max: number): number {
  const n = Number(value);
  return value !== null && value !== undefined && value !== '' && Number.isFinite(n) && n > 0 && n <= max ? n : fallback;
}

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
  temperature_entity: 'sensor.my_outdoor_temperature',
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
  return {
    entities,
    batteryKwh: positive(obj.battery_kwh, DEFAULT_BATTERY_KWH, 300),
    co2PetrolKgPerKm: positive(obj.co2_petrol_kg_per_km, DEFAULT_CO2_PETROL_KG_PER_KM, 5),
    co2GridKgPerKwh: positive(obj.co2_grid_kg_per_kwh, DEFAULT_CO2_GRID_KG_PER_KWH, 5),
    petrolLPer100km: positive(obj.petrol_l_per_100km, DEFAULT_PETROL_L_PER_100KM, 50),
  };
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
