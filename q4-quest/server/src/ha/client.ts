import type { HaStatus } from './types.ts';

/** WebSocket.OPEN */
const OPEN = 1;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

const BACKOFF_MIN_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;

/**
 * Timings that keep the connection alive. A connection attempt that does not
 * reach "auth_ok" in time is abandoned (for example while Home Assistant is
 * restarting and the attempt neither opens nor fails), and a connection that
 * stops answering pings is dropped. Both lead to a normal reconnect.
 */
export interface HaClientTimings {
  connectTimeoutMs: number;
  pingIntervalMs: number;
  pongTimeoutMs: number;
}

export const DEFAULT_TIMINGS: HaClientTimings = {
  connectTimeoutMs: 30_000,
  pingIntervalMs: 60_000,
  pongTimeoutMs: 20_000,
};

/** The parts of the WebSocket API the client uses (replaceable in tests). */
export interface SocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(type: 'error' | 'close' | 'open', listener: () => void): void;
}

export type SocketFactory = (url: string) => SocketLike;

/** Exponential backoff with a cap: 5s, 10s, 20s, ... up to 5 minutes. */
export function backoffDelay(attempt: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_MIN_MS * 2 ** Math.max(0, attempt));
}

/** Convert an http(s) Home Assistant base URL into its WebSocket API URL. */
export function toWebSocketUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = url.pathname.replace(/\/+$/, '') + '/api/websocket';
  return url.toString();
}

/**
 * Minimal, read-only Home Assistant WebSocket client.
 * It authenticates, reads the core config and reconnects with backoff.
 * It never calls services or writes anything back.
 */
export class HaClient {
  status: HaStatus = {
    state: 'connecting',
    haVersion: null,
    timeZone: null,
    connectedSince: null,
    lastError: null,
  };

  private url: string;
  private token: string;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private attempt = 0;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private subscriptions = new Map<number, (event: unknown) => void>();
  private connectHandlers: (() => void)[] = [];
  private socketFactory: SocketFactory;
  private timings: HaClientTimings;
  private connectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private pongTimer: NodeJS.Timeout | null = null;
  private ws: SocketLike | null = null;

  constructor(url: string, token: string, opts: { socketFactory?: SocketFactory; timings?: Partial<HaClientTimings> } = {}) {
    this.url = url;
    this.token = token;
    this.socketFactory = opts.socketFactory ?? ((u) => new WebSocket(u) as unknown as SocketLike);
    this.timings = { ...DEFAULT_TIMINGS, ...opts.timings };
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.clearLiveness();
    this.ws?.close();
  }

  /** Register a handler that runs after every successful (re)connect. */
  onConnect(handler: () => void): void {
    this.connectHandlers.push(handler);
  }

  /** Subscribe to a stream of events; resolves once HA confirms the subscription. */
  async subscribe(
    type: string,
    payload: Record<string, unknown>,
    handler: (event: unknown) => void,
  ): Promise<void> {
    const id = this.nextId;
    this.subscriptions.set(id, handler);
    try {
      await this.call(type, payload);
    } catch (err) {
      this.subscriptions.delete(id);
      throw err;
    }
  }

  /** Send a WebSocket command and wait for its result. */
  call<T = unknown>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
    const ws = this.ws;
    if (!ws || ws.readyState !== OPEN || this.status.state !== 'connected') {
      return Promise.reject(new Error('not connected'));
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      ws.send(JSON.stringify({ id, type, ...payload }));
    });
  }

  private connect(): void {
    this.status.state = 'connecting';
    let ws: SocketLike;
    try {
      ws = this.socketFactory(this.url);
    } catch (err) {
      this.fail((err as Error).message);
      return;
    }
    this.ws = ws;
    // Give up on an attempt that never gets to "auth_ok"; otherwise a hung
    // attempt (no open, no error, no close) would stop all reconnects.
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      if (this.ws === ws && this.status.state !== 'connected') this.drop(ws, 'connect timeout');
    }, this.timings.connectTimeoutMs);

    ws.addEventListener('message', (event) => {
      if (this.ws !== ws) return;
      let msg: Record<string, any>;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      this.onMessage(msg);
    });
    ws.addEventListener('error', () => {
      if (this.ws === ws) this.status.lastError = 'websocket error';
    });
    ws.addEventListener('close', () => this.teardown(ws));
  }

  /** Clean up after a socket ended (or was abandoned) and schedule a reconnect. */
  private teardown(ws: SocketLike): void {
    if (this.ws !== ws) return; // already handled
    this.ws = null;
    this.clearLiveness();
    for (const p of this.pending.values()) p.reject(new Error('connection closed'));
    this.pending.clear();
    this.subscriptions.clear();
    if (this.status.state !== 'auth_failed') this.status.state = 'disconnected';
    this.status.connectedSince = null;
    this.scheduleReconnect();
  }

  /** Abandon a socket that hangs or stopped answering, and reconnect. */
  private drop(ws: SocketLike, reason: string): void {
    console.warn(`[ha] ${reason}`);
    this.status.lastError = reason;
    this.teardown(ws);
    try {
      ws.close();
    } catch {
      // The socket is abandoned either way.
    }
  }

  private clearLiveness(): void {
    if (this.connectTimer) clearTimeout(this.connectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.connectTimer = this.pingTimer = this.pongTimer = null;
  }

  /** Ping Home Assistant every minute; drop the connection when a pong does not arrive in time. */
  private startHeartbeat(ws: SocketLike): void {
    this.pingTimer = setInterval(() => {
      if (this.ws !== ws || this.pongTimer) return;
      try {
        ws.send(JSON.stringify({ id: this.nextId++, type: 'ping' }));
      } catch {
        this.drop(ws, 'ping failed');
        return;
      }
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        if (this.ws === ws) this.drop(ws, 'no answer to ping');
      }, this.timings.pongTimeoutMs);
    }, this.timings.pingIntervalMs);
  }

  private onMessage(msg: Record<string, any>): void {
    switch (msg.type) {
      case 'auth_required':
        this.ws?.send(JSON.stringify({ type: 'auth', access_token: this.token }));
        break;
      case 'auth_ok':
        this.attempt = 0;
        if (this.connectTimer) clearTimeout(this.connectTimer);
        this.connectTimer = null;
        if (this.ws) this.startHeartbeat(this.ws);
        console.log('[ha] connected');
        this.status.state = 'connected';
        this.status.connectedSince = new Date().toISOString();
        this.status.lastError = null;
        this.status.haVersion = msg.ha_version ?? null;
        this.loadConfig();
        break;
      case 'auth_invalid':
        this.status.state = 'auth_failed';
        this.status.lastError = 'authentication failed';
        this.ws?.close();
        break;
      case 'pong':
        if (this.pongTimer) clearTimeout(this.pongTimer);
        this.pongTimer = null;
        break;
      case 'event':
        this.subscriptions.get(msg.id)?.(msg.event);
        break;
      case 'result': {
        const p = this.pending.get(msg.id);
        if (!p) break;
        this.pending.delete(msg.id);
        if (msg.success) p.resolve(msg.result);
        else p.reject(new Error(msg.error?.message ?? 'command failed'));
        break;
      }
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      // Only the version and time zone are kept; location data is ignored.
      const config = await this.call<{ time_zone?: string; version?: string }>('get_config');
      this.status.timeZone = config.time_zone ?? null;
      this.status.haVersion = config.version ?? this.status.haVersion;
    } catch (err) {
      this.status.lastError = `get_config: ${(err as Error).message}`;
    }
    for (const handler of this.connectHandlers) {
      try {
        handler();
      } catch (err) {
        console.error('[ha] connect handler failed:', err);
      }
    }
  }

  private fail(message: string): void {
    this.status.state = 'disconnected';
    this.status.lastError = message;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.timer) return;
    const delay = backoffDelay(this.attempt++);
    console.log(`[ha] reconnecting in ${Math.round(delay / 1000)}s`);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }
}
