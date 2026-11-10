import { existsSync } from 'node:fs';
import { toWebSocketUrl } from './ha/client.ts';

export interface AppConfig {
  mock: boolean;
  port: number;
  host: string;
  dbPath: string;
  optionsPath: string;
  webDir: string;
  /** WebSocket URL and token, or null when no HA connection is configured. */
  ha: { url: string; token: string } | null;
}

/** Read runtime configuration from the environment (and an optional .env file). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const inAddon = Boolean(env.SUPERVISOR_TOKEN);
  const mock = env.MOCK === '1' || env.MOCK === 'true';

  let ha: AppConfig['ha'] = null;
  if (!mock) {
    if (inAddon) {
      ha = { url: 'ws://supervisor/core/websocket', token: env.SUPERVISOR_TOKEN! };
    } else if (env.HA_URL && env.HA_TOKEN) {
      ha = { url: toWebSocketUrl(env.HA_URL), token: env.HA_TOKEN };
    }
  }

  return {
    mock,
    port: Number(env.PORT ?? 8099),
    host: env.HOST ?? '0.0.0.0',
    dbPath: env.DB_PATH ?? (inAddon ? '/data/q4quest.db' : mock ? ':memory:' : './data/q4quest.db'),
    optionsPath: env.OPTIONS_PATH ?? (inAddon ? '/data/options.json' : './options.local.json'),
    webDir: env.WEB_DIR ?? new URL('../../web/dist/', import.meta.url).pathname,
    ha,
  };
}

/** Load a local .env file for development, if present. */
export function loadDotEnv(path = '.env'): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
