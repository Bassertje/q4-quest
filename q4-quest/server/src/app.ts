import { existsSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { schemaVersion } from './db.ts';
import type { HaStatus } from './ha/types.ts';
import { SENSOR_KEYS, type Options } from './options.ts';

export interface AppDeps {
  version: string;
  mock: boolean;
  options: Options;
  db: DatabaseSync;
  haStatus: () => HaStatus;
  mockSummary?: { readings: number; days: number; odometer: number } | null;
  webDir?: string;
}

/** Build the HTTP app. Kept free of side effects so it can be tested with inject(). */
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/api/status', async () => {
    const sensors = SENSOR_KEYS.map((key) => ({
      key,
      entityId: deps.options.entities[key],
      configured: deps.options.entities[key] !== null,
    }));
    return {
      version: deps.version,
      mode: deps.mock ? 'mock' : 'live',
      setupNeeded: deps.options.entities.odometer === null,
      ha: deps.haStatus(),
      sensors,
      batteryKwh: deps.options.batteryKwh,
      db: { schemaVersion: schemaVersion(deps.db) },
      mock: deps.mockSummary ?? null,
    };
  });

  if (deps.webDir && existsSync(deps.webDir)) {
    app.register(fastifyStatic, { root: deps.webDir, index: ['index.html'] });
  } else {
    app.get('/', async (_req, reply) =>
      reply
        .type('text/html; charset=utf-8')
        .send('<p>Q4 Quest: the web frontend has not been built yet. Run <code>npm run build</code>.</p>'),
    );
  }

  return app;
}
