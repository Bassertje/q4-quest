export type ThemeChoice = 'auto' | 'light' | 'dark';

const CACHE_KEY = 'q4quest.theme';
export const THEME_EVENT = 'q4quest-theme';

function isChoice(v: unknown): v is ThemeChoice {
  return v === 'auto' || v === 'light' || v === 'dark';
}

/**
 * Apply a theme choice. "auto" removes the attribute so the CSS follows
 * prefers-color-scheme. The choice is cached locally only to avoid a flash
 * on the next start; the database is the source of truth.
 */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  try {
    localStorage.setItem(CACHE_KEY, choice);
  } catch {
    // Storage unavailable: fine, the server value is applied after loading.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function cachedTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(CACHE_KEY);
    return isChoice(v) ? v : 'auto';
  } catch {
    return 'auto';
  }
}

/** Apply the cached theme immediately, then the stored one from the server. */
export function initTheme(): void {
  applyTheme(cachedTheme());
  // Re-render theme-dependent drawings (charts) when the system theme changes.
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    window.dispatchEvent(new Event(THEME_EVENT));
  });
  fetch('./api/settings')
    .then((r) => (r.ok ? r.json() : null))
    .then((s) => {
      if (s && isChoice(s.theme)) applyTheme(s.theme);
    })
    .catch(() => {});
}

export async function saveTheme(choice: ThemeChoice): Promise<void> {
  applyTheme(choice);
  await fetch('./api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme: choice }),
  });
}
