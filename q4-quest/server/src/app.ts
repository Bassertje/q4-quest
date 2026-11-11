import { existsSync } from 'node:fs';
import { Readable } from 'node:stream';
import type { DatabaseSync } from 'node:sqlite';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { chargingAvailable, chargingResponse, isSocRange, socResponse } from './charging.ts';
import { cockpitResponse } from './cockpit.ts';
import type { BackfillStatus } from './collector/collector.ts';
import { schemaVersion } from './db.ts';
import { badgesResponse, markSeen, revealResponse, seenKeys } from './badges.ts';
import { isChargePeriodMode, isFollowable } from '../../game/src/index.ts';
import { GameStateCache } from './game-state.ts';
import { historyResponse } from './history.ts';
import { yearResponse, yearsResponse } from './year.ts';
import { isNavPosition, isTheme, readSettings, writeSettings } from './settings.ts';
import type { HaStatus } from './ha/types.ts';
import { SENSOR_KEYS, type Options } from './options.ts';
import type { ReadingStore } from './readings.ts';

export interface AppDeps {
  version: string;
  mock: boolean;
  options: Options;
  db: DatabaseSync;
  store: ReadingStore;
  haStatus: () => HaStatus;
  timeZone: () => string;
  backfill: { status: () => BackfillStatus; run: () => Promise<void> };
  onChange: (listener: () => void) => () => void;
  webDir?: string;
}

/** Minimum time between two "update" pushes to the browser. */
const PUSH_THROTTLE_MS = 2_000;
const KEEPALIVE_MS = 30_000;

/** Build the HTTP app. Kept free of side effects so it can be tested with inject(). */
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  const cache = new GameStateCache(deps.store, deps.options, deps.db);
  const state = () => cache.get(deps.timeZone());

  app.get('/api/status', async () => ({
    version: deps.version,
    mode: deps.mock ? 'mock' : 'live',
    setupNeeded: deps.options.entities.odometer === null,
    ha: deps.haStatus(),
    timeZone: deps.timeZone(),
    sensors: SENSOR_KEYS.map((key) => ({
      key,
      entityId: deps.options.entities[key],
      configured: deps.options.entities[key] !== null,
    })),
    batteryKwh: deps.options.batteryKwh,
    features: { charging: chargingAvailable(deps.options) },
    db: { schemaVersion: schemaVersion(deps.db), readings: deps.store.counts() },
    backfill: deps.backfill.status(),
  }));

  app.get('/api/cockpit', async () =>
    cockpitResponse(state(), deps.store, deps.options, readSettings(deps.db).followedBadge),
  );

  app.get('/api/history', async (req, reply) => {
    const q = req.query as { period?: string; key?: string };
    if (q.period !== undefined && !isChargePeriodMode(q.period)) {
      return reply.code(400).send({ error: 'period must be week, month, year or all' });
    }
    const mode = q.period ?? readSettings(deps.db).historyPeriod;
    const key = typeof q.key === 'string' && q.key.length <= 10 ? q.key : null;
    return historyResponse(state(), mode, key);
  });

  app.get('/api/charging', async (req, reply) => {
    const q = req.query as { period?: string; key?: string };
    if (q.period !== undefined && !isChargePeriodMode(q.period)) {
      return reply.code(400).send({ error: 'period must be week, month, year or all' });
    }
    const mode = q.period ?? readSettings(deps.db).chargingPeriod;
    const key = typeof q.key === 'string' && q.key.length <= 10 ? q.key : null;
    return chargingResponse(state(), deps.options, mode, key);
  });

  app.get('/api/charging/soc', async (req, reply) => {
    const range = (req.query as { range?: string }).range ?? '7d';
    if (!isSocRange(range)) return reply.code(400).send({ error: 'range must be 24h, 7d or 30d' });
    return socResponse(state(), range);
  });

  app.get('/api/badges', async () => badgesResponse(state(), seenKeys(deps.db), readSettings(deps.db).followedBadge));

  app.get('/api/years', async () => yearsResponse(state()));

  app.get('/api/year/:year', async (req, reply) => {
    const year = Number((req.params as { year: string }).year);
    if (!Number.isInteger(year) || year < 1970 || year > 9999) return reply.code(400).send({ error: 'invalid year' });
    const preview = (req.query as { preview?: string }).preview === '1';
    const result = yearResponse(state(), deps.options, year, preview);
    return reply.code(result.status).send(result.body);
  });

  app.get('/api/reveal', async () => revealResponse(state(), deps.db));

  app.post('/api/seen', async (req, reply) => {
    const keys = (req.body as { keys?: unknown } | null)?.keys;
    if (!Array.isArray(keys) || keys.length > 5000 || !keys.every((k) => typeof k === 'string' && k.length <= 200)) {
      return reply.code(400).send({ error: 'keys must be a list of strings' });
    }
    return { marked: markSeen(deps.db, keys as string[]) };
  });

  app.get('/api/settings', async () => readSettings(deps.db));

  app.put('/api/settings', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (body.theme !== undefined && !isTheme(body.theme)) {
      return reply.code(400).send({ error: 'theme must be auto, light or dark' });
    }
    if (body.navPosition !== undefined && !isNavPosition(body.navPosition)) {
      return reply.code(400).send({ error: 'navPosition must be top, bottom or auto' });
    }
    for (const field of ['chargingPeriod', 'historyPeriod'] as const) {
      if (body[field] !== undefined && !isChargePeriodMode(body[field])) {
        return reply.code(400).send({ error: `${field} must be week, month, year or all` });
      }
    }
    const followed = body.followedBadge;
    if (followed !== undefined && followed !== null) {
      // Only visible badges with measurable progress can be followed.
      const badge = typeof followed === 'string' ? state().badges.find((b) => b.id === followed) : undefined;
      if (!badge || !isFollowable(badge)) return reply.code(400).send({ error: 'this badge cannot be followed' });
    }
    return writeSettings(deps.db, {
      theme: body.theme as 'auto' | 'light' | 'dark' | undefined,
      navPosition: body.navPosition as 'top' | 'bottom' | 'auto' | undefined,
      followedBadge: followed as string | null | undefined,
      chargingPeriod: body.chargingPeriod as 'week' | 'month' | 'year' | 'all' | undefined,
      historyPeriod: body.historyPeriod as 'week' | 'month' | 'year' | 'all' | undefined,
    });
  });

  app.post('/api/backfill', async (_req, reply) => {
    if (deps.backfill.status().state === 'running') return reply.code(409).send({ error: 'already running' });
    void deps.backfill.run();
    return reply.code(202).send({ started: true });
  });

  app.get('/api/export', async (_req, reply) => {
    const day = new Date().toISOString().slice(0, 10);
    reply.header('Content-Disposition', `attachment; filename="q4quest-export-${day}.json"`);
    reply.type('application/json; charset=utf-8');
    const store = deps.store;
    const version = deps.version;
    async function* body() {
      yield `{"app":"q4-quest","version":${JSON.stringify(version)},"exportedAt":${JSON.stringify(new Date().toISOString())},"readings":[`;
      let first = true;
      for (const row of store.all()) {
        yield (first ? '\n' : ',\n') + JSON.stringify(row);
        first = false;
      }
      yield '\n]}\n';
    }
    return reply.send(Readable.from(body()));
  });

  // Server-Sent Events: tells the browser to refetch when new data arrives.
  app.get('/api/events', (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 10000\n\n');
    let timer: NodeJS.Timeout | null = null;
    const push = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        res.write('event: update\ndata: {}\n\n');
      }, PUSH_THROTTLE_MS);
    };
    const off = deps.onChange(push);
    const keepalive = setInterval(() => res.write(': keepalive\n\n'), KEEPALIVE_MS);
    req.raw.on('close', () => {
      off();
      clearInterval(keepalive);
      if (timer) clearTimeout(timer);
    });
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
