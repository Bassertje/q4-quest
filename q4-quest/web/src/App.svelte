<script lang="ts">
  import { onMount } from 'svelte';
  import { getJson, onLiveUpdate } from './lib/api';
  import Reveal from './lib/Reveal.svelte';
  import Snow from './lib/Snow.svelte';
  import { eventState, loadEvent, setPreview, watchVisibility } from './lib/event.svelte';
  import type { RevealData, RevealItem, StatusData } from './lib/types';
  import { ICONS, pixelPath } from './lib/icons';
  import Nav from './lib/Nav.svelte';
  import { cachedNav, isNavChoice, NAV_EVENT, resolveNav, type NavChoice } from './lib/navPref';
  import Badges from './screens/Badges.svelte';
  import Bingo from './screens/Bingo.svelte';
  import Charging from './screens/Charging.svelte';
  import Cockpit from './screens/Cockpit.svelte';
  import History from './screens/History.svelte';
  import YearReview from './screens/YearReview.svelte';
  import Settings from './screens/Settings.svelte';

  // Hash-based routing keeps every URL relative (Ingress-proof).
  type Route = 'cockpit' | 'badges' | 'historie' | 'laden' | 'bingo' | 'instellingen';
  const parse = (): Route => {
    if (/^#\/laden\/bingo(\/\d+)?$/.test(location.hash)) return 'bingo';
    if (location.hash === '#/badges' || location.hash.startsWith('#/badges/')) return 'badges';
    if (location.hash === '#/instellingen') return 'instellingen';
    if (location.hash === '#/historie') return 'historie';
    if (location.hash === '#/laden') return 'laden';
    return 'cockpit';
  };

  let route = $state<Route>(parse());
  /** Badge to open on the badges screen (#/badges/<id>). */
  const parseBadge = () => decodeURIComponent(location.hash.match(/^#\/badges\/([^/]+)$/)?.[1] ?? '') || null;
  let openBadge = $state<string | null>(parseBadge());
  /** Laadbingo card to show (#/laden/bingo/2), or the current one. */
  const parseBingoCard = () => Number(location.hash.match(/^#\/laden\/bingo\/(\d+)$/)?.[1] ?? 0) || null;
  let bingoCard = $state<number | null>(parseBingoCard());

  /** Year overview: #/jaar/2026 or #/jaar/2026/voorbeeld (preview before 1 December). */
  const parseYear = () => {
    const m = location.hash.match(/^#\/jaar\/(\d{4})(\/voorbeeld)?$/);
    return m ? { year: Number(m[1]), preview: Boolean(m[2]) } : null;
  };
  let yearView = $state(parseYear());
  let cameFrom = '#/historie';

  function closeYear() {
    location.hash = cameFrom;
  }
  let refresh = $state(0);
  let charging = $state(false);
  let navChoice = $state<NavChoice>(cachedNav());
  const navPosition = $derived(resolveNav(navChoice, navigator.userAgent));
  let reveal = $state<RevealItem[]>([]);
  let revealTheme = $state<RevealData['theme']>(null);
  let timeZone = $state<string | undefined>(undefined);

  /** On opening the app: first show what is new (badges, destinations, levels, records). */
  async function checkReveal() {
    if (reveal.length) return;
    try {
      const res = await getJson<RevealData>(eventState.preview ? 'reveal?preview=winterrit' : 'reveal');
      reveal = res.items;
      revealTheme = res.theme;
    } catch {
      // No reveal when the server cannot be reached; the screens show the error.
    }
  }

  // "Voorbeeld Winterrit" from the settings: decoration, advent calendar and a sample reveal.
  let previewing = $state(false);
  $effect(() => {
    if (eventState.preview && !previewing) {
      previewing = true;
      reveal = [];
      void checkReveal();
    } else if (!eventState.preview && previewing) {
      previewing = false;
    }
  });

  async function stopPreview() {
    await setPreview(false);
    refresh++;
  }

  // Reload the event state with every refresh (new day, settings changed, …).
  $effect(() => {
    void refresh;
    void loadEvent();
  });

  function revealDone() {
    reveal = [];
    refresh++;
  }

  onMount(() => {
    const onHash = () => {
      const nextYear = parseYear();
      if (nextYear && !yearView) cameFrom = route === 'cockpit' ? '#/' : `#/${route}`;
      yearView = nextYear;
      if (nextYear) return; // the overview is an overlay; keep the page underneath
      route = parse();
      openBadge = parseBadge();
      bingoCard = parseBingoCard();
      if (!openBadge) window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    const stop = onLiveUpdate(() => refresh++);
    getJson<StatusData>('status')
      .then((s) => {
        charging = s.features.charging;
        timeZone = s.timeZone;
      })
      .catch(() => {});
    checkReveal();
    getJson<{ navPosition: NavChoice }>('settings')
      .then((s) => {
        if (isNavChoice(s.navPosition)) navChoice = s.navPosition;
      })
      .catch(() => {});
    const onNav = (e: Event) => {
      const choice = (e as CustomEvent).detail;
      if (isNavChoice(choice)) navChoice = choice;
    };
    window.addEventListener(NAV_EVENT, onNav);
    const stopVisibility = watchVisibility();
    // Re-opening the app (back from the background) counts as opening it.
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkReveal();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(NAV_EVENT, onNav);
      stopVisibility();
      stop();
    };
  });
</script>

<div class="app nav-{navPosition}">
  {#if eventState.preview}
    <div class="preview-bar" role="status">
      <span>Voorbeeld Winterrit · er wordt niets opgeslagen</span>
      <button onclick={stopPreview}>Stoppen</button>
    </div>
  {/if}
  <header>
    <Snow count={10} />
    <a class="logo" href="#/">Q4 QUEST</a>
    {#if route === 'instellingen'}
      <a class="icon" href="#/" aria-label="Terug naar de cockpit">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>
      </a>
    {:else}
      <a class="icon" href="#/instellingen" aria-label="Instellingen">
        <svg viewBox="0 0 16 16" aria-hidden="true" class="gear"><path d={pixelPath(ICONS.gear)} /></svg>
      </a>
    {/if}
  </header>

  <Nav route={route === 'bingo' ? 'laden' : route} {charging} position={navPosition} />

  <main>
    {#if route === 'instellingen'}
      <Settings {refresh} />
    {:else if route === 'badges'}
      <Badges {refresh} {openBadge} />
    {:else if route === 'historie'}
      <History {refresh} />
    {:else if route === 'laden'}
      <Charging {refresh} />
    {:else if route === 'bingo'}
      <Bingo {refresh} cardIndex={bingoCard} />
    {:else}
      <Cockpit {refresh} />
    {/if}
  </main>
</div>

{#if yearView}
  {#key `${yearView.year}-${yearView.preview}`}
    <YearReview year={yearView.year} preview={yearView.preview} onclose={closeYear} />
  {/key}
{:else if reveal.length}
  <Reveal items={reveal} {timeZone} theme={revealTheme} ondone={revealDone} />
{/if}

<style>
  .app {
    max-width: 760px;
    margin: 0 auto;
    /* Always ~24px plus the safe area at the bottom… */
    padding: 12px 16px calc(24px + env(safe-area-inset-bottom));
  }
  /* …and room for the fixed bar when the navigation is at the bottom. */
  .app.nav-bottom {
    padding-bottom: calc(72px + 24px + env(safe-area-inset-bottom));
  }
  .preview-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
    padding: 6px 6px 6px 12px;
    border: 1px dashed var(--accent);
    border-radius: 10px;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .preview-bar button {
    padding: 4px 10px;
  }
  header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 12px;
  }
  .logo {
    position: relative;
    font-family: var(--font-pixel);
    font-size: 2.2rem;
    letter-spacing: 0.08em;
    color: var(--accent);
    text-decoration: none;
    text-shadow: var(--accent-text-glow);
  }
  .icon {
    position: relative;
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
