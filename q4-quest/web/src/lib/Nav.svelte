<script lang="ts">
  import { ICONS, pixelPath } from './icons';

  let { route, charging = false }: { route: string; charging?: boolean } = $props();

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

<nav aria-label="Hoofdmenu">
  {#each items as item (item.id)}
    <a href={item.href} class:active={route === item.id} aria-current={route === item.id ? 'page' : undefined}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path fill-rule="evenodd" d={item.icon} /></svg>
      <span>{item.label}</span>
    </a>
  {/each}
</nav>

<style>
  nav {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 6px 16px calc(6px + env(safe-area-inset-bottom));
    background: var(--nav-bg);
    border-top: 1px solid var(--line);
    backdrop-filter: blur(6px);
  }
  a {
    flex: 1;
    max-width: 160px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px;
    border-radius: 8px;
    color: var(--muted);
    text-decoration: none;
    font-size: 0.8rem;
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
    width: 22px;
    height: 22px;
    fill: currentColor;
    shape-rendering: crispEdges;
  }

  /* Desktop: navigation at the top, under the header. */
  @media (min-width: 768px) {
    nav {
      position: static;
      justify-content: flex-start;
      padding: 0;
      background: none;
      border: 0;
      border-bottom: 1px solid var(--line);
      backdrop-filter: none;
      margin-bottom: 4px;
    }
    a {
      flex: none;
      flex-direction: row;
      gap: 8px;
      font-size: 0.95rem;
      border-radius: 0;
      padding: 8px 12px;
      border-bottom: 2px solid transparent;
    }
    a.active {
      border-bottom-color: var(--accent);
    }
    svg {
      width: 18px;
      height: 18px;
    }
  }
</style>
