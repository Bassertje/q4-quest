<script lang="ts">
  import { onMount } from 'svelte';
  import { getJson, onLiveUpdate } from './lib/api';
  import type { StatusData } from './lib/types';
  import Nav from './lib/Nav.svelte';
  import Charging from './screens/Charging.svelte';
  import Cockpit from './screens/Cockpit.svelte';
  import History from './screens/History.svelte';
  import Settings from './screens/Settings.svelte';

  // Hash-based routing keeps every URL relative (Ingress-proof).
  type Route = 'cockpit' | 'historie' | 'laden' | 'instellingen';
  const parse = (): Route => {
    if (location.hash === '#/instellingen') return 'instellingen';
    if (location.hash === '#/historie') return 'historie';
    if (location.hash === '#/laden') return 'laden';
    return 'cockpit';
  };

  let route = $state<Route>(parse());
  let refresh = $state(0);
  let charging = $state(false);

  onMount(() => {
    const onHash = () => {
      route = parse();
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    const stop = onLiveUpdate(() => refresh++);
    getJson<StatusData>('status')
      .then((s) => (charging = s.features.charging))
      .catch(() => {});
    return () => {
      window.removeEventListener('hashchange', onHash);
      stop();
    };
  });
</script>

<div class="app">
  <header>
    <a class="logo" href="#/">Q4 QUEST</a>
    {#if route === 'instellingen'}
      <a class="icon" href="#/" aria-label="Terug naar de cockpit">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
      </a>
    {:else}
      <a class="icon" href="#/instellingen" aria-label="Instellingen">
        <!-- Pixel-style gear -->
        <svg viewBox="0 0 16 16" aria-hidden="true" class="gear">
          <path
            fill-rule="evenodd"
            d="M7 1h2v2h2V2h1v1h1v1h-1v2h2v2h-2v2h1v1h-1v1h-1v-1H9v2H7v-2H5v1H4v-1H3v-1h1V9H2V7h2V5H3V4h1V3h1v1h2V1Zm0 5v4h2V6H7Z"
          />
        </svg>
      </a>
    {/if}
  </header>

  <Nav {route} {charging} />

  <main>
    {#if route === 'instellingen'}
      <Settings {refresh} />
    {:else if route === 'historie'}
      <History {refresh} />
    {:else if route === 'laden'}
      <Charging {refresh} />
    {:else}
      <Cockpit {refresh} />
    {/if}
  </main>
</div>

<style>
  .app {
    max-width: 680px;
    margin: 0 auto;
    padding: 12px 16px calc(88px + env(safe-area-inset-bottom));
  }
  @media (min-width: 768px) {
    .app {
      max-width: 760px;
      padding-bottom: 32px;
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 12px;
  }
  .logo {
    font-family: var(--font-pixel);
    font-size: 2.2rem;
    letter-spacing: 0.08em;
    color: var(--accent);
    text-decoration: none;
    text-shadow: 0 0 12px rgba(227, 6, 19, 0.45);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--muted);
  }
  .icon:hover,
  .icon:focus-visible {
    color: var(--text);
    border-color: var(--accent);
    outline: none;
  }
  svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    shape-rendering: crispEdges;
  }
  svg.gear {
    fill: currentColor;
    stroke: none;
  }
  main {
    display: grid;
    gap: 12px;
  }
</style>
