import { readFileSync } from 'node:fs';
import { buildApp } from './app.ts';
import { Collector, type BackfillStatus } from './collector/collector.ts';
import { loadConfig, loadDotEnv } from './config.ts';
import { openDatabase } from './db.ts';
import { HaClient } from './ha/client.ts';
import type { HaStatus } from './ha/types.ts';
import { seedMockChallenges, seedMockData } from './mock/seed.ts';
import { loadOptions } from './options.ts';
import { ReadingStore } from './readings.ts';

loadDotEnv();
const config = loadConfig();
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
const options = loadOptions(config.optionsPath, config.mock);
const db = openDatabase(config.dbPath);
const store = new ReadingStore(db);

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const onChange = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

let haStatus: () => HaStatus;
let timeZone: () => string;
let backfill: { status: () => BackfillStatus; run: () => Promise<void> };
let client: HaClient | null = null;
const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

if (config.mock) {
  const status: HaStatus = {
    state: 'mock',
    haVersion: null,
    timeZone: localTz,
    connectedSince: new Date().toISOString(),
    lastError: null,
  };
  const mockBackfill: BackfillStatus = {
    state: 'idle',
    step: null,
    stored: 0,
    startedAt: null,
    finishedAt: null,
    error: null,
  };
  const run = async () => {
    mockBackfill.state = 'running';
    mockBackfill.startedAt = new Date().toISOString();
    mockBackfill.stored = seedMockData(store, options);
    seedMockChallenges(store, options, db, localTz);
    mockBackfill.state = 'done';
    mockBackfill.finishedAt = new Date().toISOString();
    emit();
  };
  await run();
  console.log(`[mock] stored ${mockBackfill.stored} synthetic readings`);
  haStatus = () => status;
  timeZone = () => localTz;
  backfill = { status: () => mockBackfill, run };
} else {
  let collector: Collector | null = null;
  if (config.ha) {
    client = new HaClient(config.ha.url, config.ha.token);
    collector = new Collector(client, store, db, options);
    collector.onChange(emit);
    collector.start();
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
  const savedTz = db.prepare("SELECT value FROM meta WHERE key = 'time_zone'").get() as { value: string } | undefined;
  timeZone = () => client?.status.timeZone ?? savedTz?.value ?? localTz;
  backfill = collector
    ? { status: () => collector.backfill, run: () => collector.runBackfill() }
    : {
        status: () => ({ state: 'error', step: null, stored: 0, startedAt: null, finishedAt: null, error: 'no HA connection' }),
        run: async () => {},
      };
}

const app = buildApp({
  version: pkg.version,
  mock: config.mock,
  options,
  db,
  store,
  haStatus,
  timeZone,
  backfill,
  onChange,
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
