import type { SensorKey } from '../options.ts';

/** HA states that never count as a measurement. */
const INVALID_STATES = new Set(['unknown', 'unavailable', 'none', '']);

/** Keys whose state must be numeric. */
const NUMERIC_KEYS = new Set<SensorKey>(['odometer', 'soc', 'charging_power', 'range', 'temperature']);

const KM_PER_MILE = 1.609344;
/** Generous upper bound for plausible driving speed, to catch glitches. */
const MAX_KMH = 250;
const SPIKE_MARGIN_KM = 50;

export type Verdict =
  | { ok: true; value: string }
  | { ok: false; reason: 'invalid_state' | 'not_numeric' | 'odometer_decreased' | 'odometer_spike' };

/**
 * Normalise and validate a raw HA state for a sensor.
 * `previous` is the last accepted odometer reading before this one, if any.
 */
export function validateReading(
  key: SensorKey,
  rawState: string,
  attrs: Record<string, unknown> | null,
  ts: number,
  previous: { ts: number; value: number } | null,
): Verdict {
  const state = String(rawState ?? '').trim();
  if (INVALID_STATES.has(state.toLowerCase())) return { ok: false, reason: 'invalid_state' };
  if (!NUMERIC_KEYS.has(key)) return { ok: true, value: state };

  let value = Number(state);
  if (!Number.isFinite(value)) return { ok: false, reason: 'not_numeric' };

  if (key === 'temperature') {
    // Store temperatures in °C.
    const unit = String(attrs?.unit_of_measurement ?? '').toUpperCase();
    if (unit === '°F' || unit === 'F') value = ((value - 32) * 5) / 9;
    return { ok: true, value: String(Math.round(value * 10) / 10) };
  }

  if (key === 'odometer') {
    if (String(attrs?.unit_of_measurement ?? '').toLowerCase() === 'mi') value *= KM_PER_MILE;
    value = Math.round(value * 10) / 10;
    if (previous) {
      if (value < previous.value) return { ok: false, reason: 'odometer_decreased' };
      const hours = Math.max(0, ts - previous.ts) / 3_600_000;
      if (value - previous.value > SPIKE_MARGIN_KM + MAX_KMH * hours) {
        return { ok: false, reason: 'odometer_spike' };
      }
    }
  }
  return { ok: true, value: String(value) };
}

/** Keep only the attributes the app needs, to keep the database small. */
export function pickAttrs(attrs: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!attrs) return null;
  const out: Record<string, unknown> = {};
  for (const k of ['unit_of_measurement', 'device_class', 'state_class']) {
    if (attrs[k] !== undefined) out[k] = attrs[k];
  }
  return Object.keys(out).length ? out : null;
}
