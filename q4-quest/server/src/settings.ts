import type { DatabaseSync } from 'node:sqlite';

export const THEMES = ['auto', 'light', 'dark'] as const;
export type Theme = (typeof THEMES)[number];

export interface Settings {
  theme: Theme;
  /** Badge chosen to follow on the cockpit (null: pick automatically). */
  followedBadge: string | null;
}

const DEFAULTS: Settings = { theme: 'auto', followedBadge: null };

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
    followedBadge: getMeta(db, 'setting.followed_badge') || DEFAULTS.followedBadge,
  };
}

export function writeSettings(db: DatabaseSync, patch: Partial<Settings>): Settings {
  if (patch.theme !== undefined) setMeta(db, 'setting.theme', patch.theme);
  if (patch.followedBadge !== undefined) setMeta(db, 'setting.followed_badge', patch.followedBadge ?? '');
  return readSettings(db);
}
