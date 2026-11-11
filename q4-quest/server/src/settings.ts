import type { DatabaseSync } from 'node:sqlite';
import { isChargePeriodMode, type ChargePeriodMode } from '../../game/src/index.ts';

export const THEMES = ['auto', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export const NAV_POSITIONS = ['top', 'bottom', 'auto'] as const;
export type NavPosition = (typeof NAV_POSITIONS)[number];

export function isNavPosition(value: unknown): value is NavPosition {
  return typeof value === 'string' && (NAV_POSITIONS as readonly string[]).includes(value);
}

export interface Settings {
  theme: Theme;
  /** Where the navigation bar sits; "auto" = bottom in the Companion app, top elsewhere. */
  navPosition: NavPosition;
  /** Badge chosen to follow on the cockpit (null: pick automatically). */
  followedBadge: string | null;
  /** Period shown on the charging screen. */
  chargingPeriod: ChargePeriodMode;
  /** Period shown on the history screen. */
  historyPeriod: ChargePeriodMode;
}

const DEFAULTS: Settings = { theme: 'auto', navPosition: 'top', followedBadge: null, chargingPeriod: 'all', historyPeriod: 'all' };

function getMeta(db: DatabaseSync, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

function setMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value,
  );
}

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

/** User preferences stored in the local database (never in Home Assistant). */
export function readSettings(db: DatabaseSync): Settings {
  const theme = getMeta(db, 'setting.theme');
  return {
    theme: isTheme(theme) ? theme : DEFAULTS.theme,
    navPosition: ((v) => (isNavPosition(v) ? v : DEFAULTS.navPosition))(getMeta(db, 'setting.nav_position')),
    followedBadge: getMeta(db, 'setting.followed_badge') || DEFAULTS.followedBadge,
    chargingPeriod: ((v) => (isChargePeriodMode(v) ? v : DEFAULTS.chargingPeriod))(getMeta(db, 'setting.charging_period')),
    historyPeriod: ((v) => (isChargePeriodMode(v) ? v : DEFAULTS.historyPeriod))(getMeta(db, 'setting.history_period')),
  };
}

export function writeSettings(db: DatabaseSync, patch: Partial<Settings>): Settings {
  if (patch.theme !== undefined) setMeta(db, 'setting.theme', patch.theme);
  if (patch.navPosition !== undefined) setMeta(db, 'setting.nav_position', patch.navPosition);
  if (patch.followedBadge !== undefined) setMeta(db, 'setting.followed_badge', patch.followedBadge ?? '');
  if (patch.chargingPeriod !== undefined) setMeta(db, 'setting.charging_period', patch.chargingPeriod);
  if (patch.historyPeriod !== undefined) setMeta(db, 'setting.history_period', patch.historyPeriod);
  return readSettings(db);
}
