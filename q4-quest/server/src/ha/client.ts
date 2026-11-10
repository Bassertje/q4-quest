import type { HaStatus } from './types.ts';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

const BACKOFF_MIN_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;

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
  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private attempt = 0;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
  }

  /** Send a WebSocket command and wait for its result. */
  call<T = unknown>(type: string, payload: Record<string, unknown> = {}): Promise<T> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN || this.status.state !== 'connected') {
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
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch (err) {
      this.fail((err as Error).message);
      return;
    }
    this.ws = ws;

    ws.addEventListener('message', (event) => {
      let msg: Record<string, any>;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      this.onMessage(msg);
    });
    ws.addEventListener('error', () => {
      this.status.lastError = 'websocket error';
    });
    ws.addEventListener('close', () => {
      this.ws = null;
      for (const p of this.pending.values()) p.reject(new Error('connection closed'));
      this.pending.clear();
      if (this.status.state !== 'auth_failed') this.status.state = 'disconnected';
      this.status.connectedSince = null;
      this.scheduleReconnect();
    });
  }

  private onMessage(msg: Record<string, any>): void {
    switch (msg.type) {
      case 'auth_required':
        this.ws?.send(JSON.stringify({ type: 'auth', access_token: this.token }));
        break;
      case 'auth_ok':
        this.attempt = 0;
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
