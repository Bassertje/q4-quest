import { readFileSync } from 'node:fs';
import { buildApp } from './app.ts';
import { loadConfig, loadDotEnv } from './config.ts';
import { openDatabase } from './db.ts';
import { HaClient } from './ha/client.ts';
import type { HaStatus } from './ha/types.ts';
import { generateMockHistory } from './mock/generate.ts';
import { loadOptions } from './options.ts';

loadDotEnv();
const config = loadConfig();
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const options = loadOptions(config.optionsPath, config.mock);
const db = openDatabase(config.dbPath);

let haStatus: () => HaStatus;
let mockSummary = null;
let client: HaClient | null = null;

if (config.mock) {
  const readings = generateMockHistory({ batteryKwh: options.batteryKwh });
  const odo = readings.filter((r) => r.key === 'odometer').at(-1);
  mockSummary = { readings: readings.length, days: 120, odometer: Number(odo?.value ?? 0) };
  const status: HaStatus = {
    state: 'mock',
    haVersion: null,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    connectedSince: new Date().toISOString(),
    lastError: null,
  };
  haStatus = () => status;
  console.log(`[mock] generated ${readings.length} synthetic readings`);
} else if (config.ha) {
  client = new HaClient(config.ha.url, config.ha.token);
  client.start();
  haStatus = () => client!.status;
} else {
  const status: HaStatus = {
    state: 'not_configured',
    haVersion: null,
    timeZone: null,
    connectedSince: null,
    lastError: 'No SUPERVISOR_TOKEN or HA_URL/HA_TOKEN found. Use MOCK=1 to run without Home Assistant.',
  };
  haStatus = () => status;
  console.warn(`[ha] ${status.lastError}`);
}

const app = buildApp({
  version: pkg.version,
  mock: config.mock,
  options,
  db,
  haStatus,
  mockSummary,
  webDir: config.webDir,
});

await app.listen({ port: config.port, host: config.host });
console.log(`[q4-quest] v${pkg.version} listening on port ${config.port}${config.mock ? ' (mock mode)' : ''}`);

const shutdown = async () => {
  client?.stop();
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
