/**
 * Helpers for Home Assistant's compressed state format, used by
 * `subscribe_entities` and `history/history_during_period`:
 *   s = state, a = attributes, lc = last_changed, lu = last_updated (epoch seconds).
 */
export interface CompressedState {
  s?: string;
  a?: Record<string, unknown>;
  lc?: number;
  lu?: number;
}

export interface EntitiesEvent {
  a?: Record<string, CompressedState>;
  c?: Record<string, { '+'?: CompressedState; '-'?: { a?: string[] } }>;
  r?: string[];
}

/** Moment the state value took effect, in epoch milliseconds. */
export function stateTimestamp(s: CompressedState, fallback: number): number {
  const seconds = s.lc ?? s.lu;
  return typeof seconds === 'number' ? Math.round(seconds * 1000) : fallback;
}

export interface StateUpdate {
  entityId: string;
  state: string;
  attrs: Record<string, unknown>;
  ts: number;
}

/**
 * Apply a `subscribe_entities` event to a per-entity cache and return the
 * state values that are new (full states, or diffs that change the state).
 * Attribute-only changes update the cache but are not returned.
 */
export function applyEntitiesEvent(
  cache: Map<string, { state: string; attrs: Record<string, unknown> }>,
  event: EntitiesEvent,
  now: number,
): StateUpdate[] {
  const updates: StateUpdate[] = [];
  for (const [entityId, s] of Object.entries(event.a ?? {})) {
    const state = String(s.s ?? '');
    const attrs = { ...(s.a ?? {}) };
    cache.set(entityId, { state, attrs });
    updates.push({ entityId, state, attrs, ts: stateTimestamp(s, now) });
  }
  for (const [entityId, diff] of Object.entries(event.c ?? {})) {
    const current = cache.get(entityId) ?? { state: '', attrs: {} };
    const plus = diff['+'] ?? {};
    const attrs = { ...current.attrs, ...(plus.a ?? {}) };
    for (const name of diff['-']?.a ?? []) delete attrs[name];
    const state = plus.s !== undefined ? String(plus.s) : current.state;
    cache.set(entityId, { state, attrs });
    if (plus.s !== undefined) updates.push({ entityId, state, attrs, ts: stateTimestamp(plus, now) });
  }
  for (const entityId of event.r ?? []) cache.delete(entityId);
  return updates;
}
