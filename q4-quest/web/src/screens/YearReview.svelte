<script lang="ts">
  import { onMount } from 'svelte';
  import { getJson } from '../lib/api';
  import { dayShort, km, num1, periodLabel } from '../lib/format';
  import PixelIcon from '../lib/PixelIcon.svelte';
  import type { YearData, YearReview } from '../lib/types';

  let { year, preview, onclose }: { year: number; preview: boolean; onclose: () => void } = $props();

  const MAX_BADGE_ICONS = 12;

  let data = $state<YearData | null>(null);
  let error = $state<string | null>(null);
  let index = $state(0);
  let track: HTMLDivElement | undefined = $state();

  type Card = 'intro' | 'km' | 'bestDay' | 'bestWeek' | 'streak' | 'charging' | 'acdc' | 'badges' | 'level' | 'earth' | 'outro';

  /** Only cards that have something to show. */
  function cardsFor(r: YearReview): Card[] {
    const cards: Card[] = ['intro', 'km'];
    if (r.bestDay) cards.push('bestDay');
    if (r.bestWeek) cards.push('bestWeek');
    if (r.longestStreak) cards.push('streak');
    if (r.charging && r.charging.sessions > 0) cards.push('charging', 'acdc');
    cards.push('badges', 'level', 'earth', 'outro');
    return cards;
  }

  const r = $derived(data?.review ?? null);
  const cards = $derived(r ? cardsFor(r) : []);

  async function load() {
    try {
      data = await getJson<YearData>(`year/${year}${preview ? '?preview=1' : ''}`);
      error = null;
    } catch (err) {
      error = (err as Error).message.includes('403')
        ? `Het jaaroverzicht ${year} verschijnt op 1 december.`
        : `Het jaaroverzicht kon niet worden geladen (${(err as Error).message}).`;
    }
  }

  function go(i: number) {
    if (!track) return;
    const target = Math.max(0, Math.min(cards.length - 1, i));
    track.scrollTo({ left: target * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  function onScroll() {
    if (track) index = Math.round(track.scrollLeft / track.clientWidth);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') go(index + 1);
    else if (e.key === 'ArrowLeft') go(index - 1);
    else if (e.key === 'Escape') onclose();
  }

  onMount(() => {
    load();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  });

  const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
</script>

<div class="year" role="dialog" aria-modal="true" aria-label="Jaaroverzicht {year}">
  <header>
    <span class="pixel brand">{year}</span>
    {#if data?.preview}<span class="tag">voorbeeld</span>{/if}
    <button class="close" aria-label="Sluiten" onclick={onclose}>✕</button>
  </header>

  {#if error}
    <div class="message"><p>{error}</p><button onclick={onclose}>Terug</button></div>
  {:else if !r}
    <div class="message"><p class="muted">Laden…</p></div>
  {:else}
    <div class="track" bind:this={track} onscroll={onScroll}>
      {#each cards as card, i (card)}
        <section class="card" aria-roledescription="kaart" aria-label="{i + 1} van {cards.length}">
          <div class="inner">
            {#if card === 'intro'}
              <PixelIcon icon="wheel" size={96} />
              <p class="kicker">Q4 Quest jaaroverzicht</p>
              <h2 class="huge">Jouw {r.year}</h2>
              <p class="muted">
                {#if r.startedThisYear}Sinds {dayShort(r.from)}{:else}Vanaf 1 januari{/if}
                {#if r.running} tot en met vandaag{/if}
              </p>
              {#if data?.preview}
                <p class="note">Dit is een voorbeeld met de data tot nu toe. Het echte overzicht verschijnt op 1 december.</p>
              {/if}
              <p class="muted small hint">Veeg of gebruik de pijlen →</p>
            {:else if card === 'km'}
              <PixelIcon icon="car" size={80} />
              <p class="kicker">Gereden in {r.year}</p>
              <p class="huge lcd">{km(r.totalKm)}<span class="unit">km</span></p>
              <p>op {r.daysDriven} {r.daysDriven === 1 ? 'dag' : 'dagen'}</p>
            {:else if card === 'bestDay' && r.bestDay}
              <PixelIcon icon="flame" size={80} />
              <p class="kicker">Je beste dag</p>
              <p class="huge lcd">{km(r.bestDay.km)}<span class="unit">km</span></p>
              <p>{periodLabel(r.bestDay.key, true)}</p>
            {:else if card === 'bestWeek' && r.bestWeek}
              <PixelIcon icon="road" size={80} />
              <p class="kicker">Je beste week</p>
              <p class="huge lcd">{km(r.bestWeek.km)}<span class="unit">km</span></p>
              <p>{periodLabel(r.bestWeek.key, true)}</p>
            {:else if card === 'streak' && r.longestStreak}
              <PixelIcon icon="calendar7" size={80} />
              <p class="kicker">Langste streak</p>
              <p class="huge lcd">{r.longestStreak.days}<span class="unit">{r.longestStreak.days === 1 ? 'dag' : 'dagen'}</span></p>
              <p>achter elkaar gereden</p>
              <p class="muted">{dayShort(r.longestStreak.start)} – {dayShort(r.longestStreak.end)}</p>
            {:else if card === 'charging' && r.charging}
              <PixelIcon icon="plug" size={80} />
              <p class="kicker">Laden</p>
              <p class="huge lcd">{r.charging.sessions}<span class="unit">sessies</span></p>
              <p>~{km(r.charging.kwh)} kWh geladen</p>
              <p class="muted small">schatting</p>
            {:else if card === 'acdc' && r.charging}
              {@const acPct = pct(r.charging.ac.sessions, r.charging.sessions)}
              <PixelIcon icon="bolt" size={80} />
              <p class="kicker">Thuis of onderweg</p>
              <div class="split" role="img" aria-label="{acPct}% AC, {100 - acPct}% DC">
                <span class="ac" style:width="{acPct}%"></span>
                <span class="dc" style:width="{100 - acPct}%"></span>
              </div>
              <div class="split-legend">
                <span><strong class="lcd mid">{acPct}%</strong> AC<br /><span class="muted small">{r.charging.ac.sessions} sessies · ~{km(r.charging.ac.kwh)} kWh</span></span>
                <span class="right"><strong class="lcd mid accent">{100 - acPct}%</strong> DC<br /><span class="muted small">{r.charging.dc.sessions} sessies · ~{km(r.charging.dc.kwh)} kWh</span></span>
              </div>
            {:else if card === 'badges'}
              <p class="kicker">Nieuwe badges</p>
              <p class="huge lcd">{r.newBadges.length}</p>
              {#if r.newBadges.length}
                <ul class="badge-grid">
                  {#each r.newBadges.slice(0, MAX_BADGE_ICONS) as b (b.id)}
                    <li title={b.name}><PixelIcon icon={b.icon} size={40} label={b.name} /></li>
                  {/each}
                </ul>
                {#if r.newBadges.length > MAX_BADGE_ICONS}
                  <p class="muted small">en nog {r.newBadges.length - MAX_BADGE_ICONS} meer</p>
                {/if}
                <p class="muted small">+{km(r.newBadges.reduce((s, b) => s + b.xp, 0))} bonus-XP</p>
              {:else}
                <p class="muted">Dit jaar nog geen nieuwe badges.</p>
              {/if}
            {:else if card === 'level'}
              <PixelIcon icon="levelUp" size={80} />
              <p class="kicker">Level-groei</p>
              <p class="huge lcd">{r.level.start}<span class="arrow">→</span>{r.level.end}</p>
              <p>+{km(r.level.xpGained)} XP</p>
              <p class="muted">
                {#if r.level.startRank !== r.level.endRank}Van {r.level.startRank} naar <strong>{r.level.endRank}</strong>{:else}{r.level.endRank}{/if}
              </p>
            {:else if card === 'earth'}
              <PixelIcon icon="earth" size={88} />
              <p class="kicker">Rondje aarde</p>
              {#if r.earth.laps >= 1}
                <p class="huge lcd">{num1(r.earth.laps)}×</p>
                <p>om de aarde gereden</p>
              {:else}
                <p class="huge lcd">{pct(r.earth.laps, 1)}%</p>
                <p>van een rondje om de aarde</p>
              {/if}
              <div class="lap" role="img" aria-label="Voortgang van een rondje om de aarde">
                <span style:width="{Math.min(1, r.earth.laps % 1 || (r.earth.laps >= 1 ? 1 : 0)) * 100}%"></span>
              </div>
              <p class="muted small">{km(r.totalKm)} van {km(r.earth.km)} km rond de evenaar</p>
            {:else if card === 'outro'}
              <PixelIcon icon="flag" size={88} />
              <h2 class="huge">Tot volgend jaar!</h2>
              <p class="muted">Blijf rijden, blijf verzamelen.</p>
              <button class="primary" onclick={onclose}>Sluiten</button>
            {/if}
          </div>
        </section>
      {/each}
    </div>

    <nav class="controls" aria-label="Kaarten">
      <button aria-label="Vorige kaart" disabled={index === 0} onclick={() => go(index - 1)}>‹</button>
      <div class="dots">
        {#each cards as _, i (i)}
          <button class="dot" class:on={i === index} aria-label="Kaart {i + 1}" aria-current={i === index ? 'true' : undefined} onclick={() => go(i)}></button>
        {/each}
      </div>
      <button aria-label="Volgende kaart" disabled={index >= cards.length - 1} onclick={() => go(index + 1)}>›</button>
    </nav>
  {/if}
</div>

<style>
  .year {
    position: fixed;
    inset: 0;
    z-index: 90;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }
  /* Subtle scanlines, like the reveal screen. */
  .year::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: repeating-linear-gradient(to bottom, var(--chart-dim) 0 1px, transparent 1px 3px);
  }
  header {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
  }
  .brand {
    font-family: var(--font-pixel);
    font-size: 2rem;
    line-height: 1;
    color: var(--accent);
    text-shadow: var(--accent-text-glow);
  }
  .tag {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border: 1px solid var(--accent);
    color: var(--accent);
    border-radius: 4px;
    padding: 1px 6px;
  }
  .close {
    margin-left: auto;
    width: 40px;
    height: 40px;
    padding: 0;
  }
  .message {
    margin: auto;
    padding: 16px;
    text-align: center;
  }
  .track {
    position: relative;
    flex: 1;
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
    overscroll-behavior-x: contain;
  }
  .track::-webkit-scrollbar {
    display: none;
  }
  .card {
    flex: 0 0 100%;
    scroll-snap-align: center;
    scroll-snap-stop: always;
    display: flex;
    padding: 8px 16px;
    min-height: 0;
  }
  .inner {
    margin: auto;
    width: 100%;
    max-width: 440px;
    max-height: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 6px;
    padding: 28px 20px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 16px;
    box-shadow: var(--glow);
  }
  .inner p {
    margin: 0;
  }
  .kicker {
    margin-top: 10px !important;
    font-family: var(--font-pixel);
    font-size: 1.4rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .huge {
    margin: 0;
    font-family: var(--font-pixel);
    font-weight: 400;
    font-size: clamp(2.6rem, 14vw, 4.2rem);
    line-height: 1;
  }
  .lcd {
    color: var(--accent);
    text-shadow: var(--accent-text-glow);
    font-variant-numeric: tabular-nums;
  }
  .mid {
    font-size: 1.8rem;
  }
  .accent {
    color: var(--accent);
  }
  .unit {
    font-size: 1.4rem;
    color: var(--muted);
    margin-left: 6px;
    text-shadow: none;
  }
  .arrow {
    color: var(--muted);
    margin: 0 10px;
    text-shadow: none;
  }
  .note {
    margin-top: 8px !important;
    font-size: 0.85rem;
    color: var(--muted);
    border: 1px dashed var(--line);
    border-radius: 8px;
    padding: 8px 10px;
  }
  .hint {
    margin-top: 10px !important;
  }
  .split {
    display: flex;
    width: 100%;
    height: 16px;
    border-radius: 3px;
    overflow: hidden;
    background: var(--track);
    margin-top: 8px;
  }
  .split .ac {
    background: var(--text);
  }
  .split .dc {
    background: var(--accent);
  }
  .split-legend {
    display: flex;
    justify-content: space-between;
    width: 100%;
    text-align: left;
    gap: 12px;
  }
  .split-legend .right {
    text-align: right;
  }
  .badge-grid {
    list-style: none;
    margin: 6px 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, 40px);
    gap: 10px;
    justify-content: center;
  }
  .lap {
    width: 100%;
    height: 10px;
    background: var(--track);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 8px;
  }
  .lap span {
    display: block;
    height: 100%;
    background: repeating-linear-gradient(90deg, var(--accent) 0 6px, var(--accent-dark) 6px 8px);
  }
  .primary {
    margin-top: 14px;
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
    padding: 8px 22px;
  }
  .controls {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 10px 16px calc(14px + env(safe-area-inset-bottom));
  }
  .dots {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
  }
  .dot {
    width: 10px;
    height: 10px;
    padding: 0;
    border-radius: 0;
    border: 1px solid var(--muted);
  }
  .dot.on {
    background: var(--accent);
    border-color: var(--accent);
  }
</style>
