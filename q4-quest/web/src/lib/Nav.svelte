<script lang="ts">
  let { route }: { route: string } = $props();

  // 16×16 pixel-style icons.
  const items = [
    {
      id: 'cockpit',
      href: '#/',
      label: 'Cockpit',
      icon: 'M4 3h8v1h2v2h1v6h-1v1H2v-1H1V6h1V4h2V3Zm0 3v1h1V6H4Zm7 0v1h1V6h-1ZM7 5v1h2V5H7Zm1 3v1H7v2h2V9H8V8Zm1-2v2h1V6H9Z',
    },
    {
      id: 'historie',
      href: '#/historie',
      label: 'Historie',
      icon: 'M1 14h14v1H1v-1Zm1-5h3v4H2V9Zm4-4h3v8H6V5Zm4-3h3v11h-3V2Z',
    },
  ];
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
    background: rgba(10, 10, 12, 0.94);
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
    filter: drop-shadow(0 0 6px rgba(227, 6, 19, 0.6));
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
