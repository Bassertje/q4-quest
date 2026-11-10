// All paths are relative so the app works behind Home Assistant Ingress.

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`./api/${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export async function post(path: string): Promise<Response> {
  return fetch(`./api/${path}`, { method: 'POST' });
}

/**
 * Listen for "new data" pushes from the server. Also fires when the page
 * becomes visible again. Returns a function that stops listening.
 */
export function onLiveUpdate(callback: () => void): () => void {
  let source: EventSource | null = null;
  try {
    source = new EventSource('./api/events');
    source.addEventListener('update', callback);
  } catch {
    // No live updates; the visibility refresh below still works.
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') callback();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    source?.close();
    document.removeEventListener('visibilitychange', onVisible);
  };
}
