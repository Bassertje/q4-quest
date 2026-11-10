<script lang="ts">
  import { ICONS, pixelPath } from './icons';

  let {
    route,
    charging = false,
    position = 'top',
  }: { route: string; charging?: boolean; position?: 'top' | 'bottom' } = $props();

  // 16×16 pixel-style icons.
  const all = [
    {
      id: 'cockpit',
      href: '#/',
      label: 'Cockpit',
      icon: pixelPath(ICONS.wheel),
    },
    {
      id: 'badges',
      href: '#/badges',
      label: 'Badges',
      icon: pixelPath(ICONS.trophy),
    },
    {
      id: 'historie',
      href: '#/historie',
      label: 'Historie',
      icon: 'M1 14h14v1H1v-1Zm1-5h3v4H2V9Zm4-4h3v8H6V5Zm4-3h3v11h-3V2Z',
    },
    {
      id: 'laden',
      href: '#/laden',
      label: 'Laden',
      icon: 'M9 1h2v1h-1v3H9v2h4v1h-1v1h-1v1h-1v1H9v1H8v1H7v1H5v-1h1v-3h1V9H3V8h1V7h1V6h1V5h1V4h1V3h1V1Z',
    },
  ];
  // The charging tab only appears when charging sensors are configured.
  const items = $derived(all.filter((i) => i.id !== 'laden' || charging));
</script>

<nav aria-label="Hoofdmenu" class={position}>
  {#each items as item (item.id)}
    <a href={item.href} class:active={route === item.id} aria-current={route === item.id ? 'page' : undefined}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d={item.icon} /></svg>
      <span>{item.label}</span>
    </a>
  {/each}
</nav>

<style>
  nav {
    z-index: 10;
    display: flex;
    background: var(--bg);
  }
  a {
    display: flex;
    align-items: center;
    color: var(--muted);
    text-decoration: none;
  }
  a.active {
    color: var(--text);
  }
  a.active svg {
    fill: var(--accent);
    filter: drop-shadow(0 0 6px var(--accent-glow-color));
  }
  a:focus-visible {
    outline: 1px solid var(--accent);
  }
  svg {
    fill: currentColor;
    shape-rendering: crispEdges;
  }

  /* Top: a sticky bar right under the header, with a solid background so
     content does not show through, and a red underline for the active tab. */
  nav.top {
    position: sticky;
    top: 0;
    margin: 0 -16px 8px;
    padding: 0 16px;
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
    scrollbar-width: none;
  }
  nav.top a {
    flex: 1 1 0;
    min-width: 0;
    justify-content: center;
    gap: 6px;
    padding: 10px 6px 8px;
    font-size: 0.85rem;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    white-space: nowrap;
  }
  nav.top a.active {
    border-bottom-color: var(--accent);
  }
  nav.top svg {
    width: 18px;
    height: 18px;
    flex: none;
  }
  @media (min-width: 560px) {
    nav.top a {
      flex: none;
      padding: 10px 14px 8px;
      font-size: 0.95rem;
    }
  }

  /* Bottom: fixed bar, as in the Companion app. */
  nav.bottom {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    justify-content: center;
    gap: 8px;
    padding: 6px 16px calc(6px + env(safe-area-inset-bottom));
    background: var(--nav-bg);
    border-top: 1px solid var(--line);
    backdrop-filter: blur(6px);
  }
  nav.bottom a {
    flex: 1;
    max-width: 160px;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
    border-radius: 8px;
    font-size: 0.8rem;
  }
  nav.bottom svg {
    width: 22px;
    height: 22px;
  }
</style>
