import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HaClient, type SocketLike } from '../src/ha/client.ts';

/** A scripted stand-in for a WebSocket. */
class FakeSocket implements SocketLike {
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  closed = false;
  private listeners = new Map<string, ((e?: any) => void)[]>();
  addEventListener(type: string, fn: (e?: any) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string, e?: unknown): void {
    for (const fn of this.listeners.get(type) ?? []) fn(e);
  }
  receive(msg: Record<string, unknown>): void {
    this.emit('message', { data: JSON.stringify(msg) });
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(): void {
    this.closed = true;
  }
  /** Walk through the auth handshake of Home Assistant. */
  handshake(): void {
    this.readyState = 1;
    this.emit('open');
    this.receive({ type: 'auth_required' });
    this.receive({ type: 'auth_ok', ha_version: 'test' });
    const config = this.sent.find((m) => m.type === 'get_config');
    if (config) this.receive({ id: config.id, type: 'result', success: true, result: { time_zone: 'UTC' } });
  }
}

function setup() {
  const sockets: FakeSocket[] = [];
  const client = new HaClient('ws://test.invalid/api/websocket', 'fake-token', {
    socketFactory: () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
    timings: { connectTimeoutMs: 30_000, pingIntervalMs: 60_000, pongTimeoutMs: 20_000 },
  });
  return { client, sockets };
}

describe('HaClient liveness', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('abandons a connection attempt that hangs (e.g. while Home Assistant restarts) and tries again', async () => {
    const { client, sockets } = setup();
    client.start();
    expect(sockets).toHaveLength(1);
    // No open, no error, no close: the attempt just hangs.
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sockets[0].closed).toBe(true);
    expect(client.status).toMatchObject({ state: 'disconnected', lastError: 'connect timeout' });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sockets).toHaveLength(2);
    sockets[1].handshake();
    expect(client.status.state).toBe('connected');
    client.stop();
  });

  it('pings every minute and reconnects when no pong arrives', async () => {
    const { client, sockets } = setup();
    client.start();
    sockets[0].handshake();
    // The connect timeout no longer applies once connected.
    await vi.advanceTimersByTimeAsync(59_000);
    expect(client.status.state).toBe('connected');
    await vi.advanceTimersByTimeAsync(1_000);
    const ping = sockets[0].sent.find((m) => m.type === 'ping')!;
    expect(ping).toBeDefined();
    sockets[0].receive({ id: ping.id, type: 'pong' });
    await vi.advanceTimersByTimeAsync(60_000); // next ping, never answered
    await vi.advanceTimersByTimeAsync(20_000);
    expect(sockets[0].closed).toBe(true);
    expect(client.status).toMatchObject({ state: 'disconnected', lastError: 'no answer to ping' });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sockets).toHaveLength(2);
    client.stop();
  });

  it('handles a normal close once, also when the abandoned socket closes later', async () => {
    const { client, sockets } = setup();
    client.start();
    sockets[0].handshake();
    sockets[0].emit('close');
    sockets[0].emit('close');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sockets).toHaveLength(3); // the second attempt timed out after 30 s, retried after 10 s
    client.stop();
  });
});
