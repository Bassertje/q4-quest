import { getJson } from './api';
import type { EventData } from './types';

/**
 * Shared event state (Winterrit): whether the decoration is on, the advent
 * calendar and the preview mode ("Voorbeeld Winterrit"). The preview lives in
 * memory only, so a reload ends it.
 */
export const eventState = $state<{ data: EventData | null; preview: boolean }>({ data: null, preview: false });

function apply(): void {
  document.documentElement.classList.toggle('festive', eventState.data?.decorate === true);
}

export async function loadEvent(): Promise<void> {
  try {
    eventState.data = await getJson<EventData>(`event${eventState.preview ? '?preview=1' : ''}`);
  } catch {
    eventState.data = null;
  }
  apply();
}

export async function setPreview(on: boolean): Promise<void> {
  eventState.preview = on;
  await loadEvent();
}

/** Pause the (CSS) decoration animations while the tab is not visible. */
export function watchVisibility(): () => void {
  const update = () => document.documentElement.classList.toggle('anim-paused', document.visibilityState !== 'visible');
  update();
  document.addEventListener('visibilitychange', update);
  return () => document.removeEventListener('visibilitychange', update);
}
