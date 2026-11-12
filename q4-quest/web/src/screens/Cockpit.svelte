<script lang="ts">
  import { getJson } from '../lib/api';
  import Bar from '../lib/Bar.svelte';
  import { date, km, num1 } from '../lib/format';
  import Odometer from '../lib/Odometer.svelte';
  import PixelIcon from '../lib/PixelIcon.svelte';
  import BadgeRing from '../lib/BadgeRing.svelte';
  import RankOverview from '../lib/RankOverview.svelte';
  import Setup from '../lib/Setup.svelte';
  import type { CockpitData, YearsData } from '../lib/types';

  let { refresh }: { refresh: number } = $props();

  let data = $state<CockpitData | null>(null);
  let error = $state<string | null>(null);

  let years = $state<YearsData | null>(null);
  let showRanks = $state(false);

  /** In December the new overview is announced; in January last year's. */
  const banner = $derived.by(() => {
    if (!years) return null;
    const month = years.today.slice(5, 7);
    const wanted = month === '12' ? years.currentYear : month === '01' ? years.currentYear - 1 : null;
    return years.years.find((y) => y.year === wanted && y.available) ?? null;
  });

  async function load() {
    getJson<YearsData>('years')
      .then((y) => (years = y))
      .catch(() => {});
    try {
      data = await getJson<CockpitData>('cockpit');
      error = null;
    } catch (err) {
      error = (err as Error).message;
    }
  }

  $effect(() => {
    void refresh; // reload whenever the parent signals new data
    load();
  });

  const c = $derived(data?.cockpit ?? null);
</script>

{#if error && !data}
  <section class="panel">
    <p>De gegevens konden niet worden geladen ({error}).</p>
    <button onclick={load}>Opnieuw</button>
  </section>
{:else if !data}
  <p class="muted">Laden…</p>
{:else if data.setupNeeded}
  <Setup />
{:else if !c}
  <section class="panel">
    <h2>Nog geen kilometerstand</h2>
    <p class="muted">
      Er is nog geen geldige kilometerstand binnengekomen. Zodra Home Assistant er een doorgeeft, of de
      backfill klaar is, verschijnt hier je cockpit.
    </p>
  </section>
{:else}
  {#if banner}
    <a class="panel year-banner" href="#/jaar/{banner.year}">
      <PixelIcon icon="wheel" size={36} />
      <span>
        <strong>Je jaaroverzicht {banner.year} staat klaar</strong>
        <span class="muted small">Bekijk je hoogtepunten van het jaar →</span>
      </span>
    </a>
  {/if}

  <section class="panel odo">
    <Odometer value={c.odometer} updatedTs={c.odometerTs} />
  </section>

  <section class="panel">
    <div class="row">
      <div>
        <div class="pixel big">LEVEL {c.level.level}</div>
        <button class="rank" onclick={() => (showRanks = true)} aria-haspopup="dialog">
          {c.level.rank} <span class="chev" aria-hidden="true">›</span>
        </button>
      </div>
    </div>
    <Bar fraction={c.level.fraction} label="Voortgang naar het volgende level" />
    <div class="ch-foot">
      <span class="nw">{km(c.level.xp)} XP</span>
      <span class="nw">nog {km(c.level.nextLevelXp - c.level.xp)} XP tot level {c.level.level + 1}</span>
    </div>
  </section>


  {#if data.challenge}
    {@const ch = data.challenge}
    {@const cur = ch.current ?? 0}
    <section class="panel challenge" class:done={ch.status === 'done'}>
      <div class="ch-top">
        <span class="kicker">Weekuitdaging</span>
        <span class="xp-badge">+{ch.xp} XP</span>
      </div>
      <div class="ch-body">
        <PixelIcon icon="target" size={36} />
        <div class="ch-text">
          <div class="ch-title">{ch.title}</div>
          <div class="ch-goal">{ch.goal}</div>
        </div>
      </div>
      {#if ch.type === 'max_charges'}
        <Bar fraction={Math.min(1, cur / ch.target)} label="Laadsessies deze week" />
      {:else if ch.type === 'consumption'}
        <Bar fraction={ch.current === null ? 0 : Math.min(1, ch.target / Math.max(ch.current, 0.1))} label="Verbruik deze week" />
      {:else}
        <Bar fraction={Math.min(1, cur / ch.target)} label="Voortgang weekuitdaging" />
      {/if}
      <div class="ch-foot">
        <span class="nw">
          {#if ch.type === 'consumption'}
            {ch.current === null ? 'nog te weinig data' : `${num1(ch.current)} / ≤ ${num1(ch.target)} ${ch.unit}`}
          {:else if ch.type === 'max_charges'}
            {cur} / max. {ch.target} {ch.unit}
          {:else}
            {km(cur)} / {km(ch.target)} {ch.unit}
          {/if}
        </span>
        <span class="nw">
          {#if ch.status === 'done'}<strong class="accent">Gehaald!</strong>{:else}nog {ch.daysLeft} {ch.daysLeft === 1 ? 'dag' : 'dagen'}{/if}
        </span>
      </div>
    </section>
  {/if}

  <section class="tiles">
    <div class="panel tile">
      <div class="label">Vandaag</div>
      <div class="pixel mid">{km(c.distance.today)}<span class="unit">km</span></div>
    </div>
    <div class="panel tile">
      <div class="label">Deze week</div>
      <div class="pixel mid">{km(c.distance.week)}<span class="unit">km</span></div>
    </div>
    <div class="panel tile">
      <div class="label">Deze maand</div>
      <div class="pixel mid">{km(c.distance.month)}<span class="unit">km</span></div>
    </div>
  </section>

  <section class="tiles two">
    <div class="panel tile">
      <div class="label">Op rij gereden</div>
      <div class="pixel mid">{c.streak}<span class="unit">{c.streak === 1 ? 'dag' : 'dagen'}</span></div>
    </div>
    {#if data.soc || data.range}
      <div class="panel tile">
        <div class="label">{data.soc && data.range ? 'Accu · bereik' : data.soc ? 'Accu' : 'Bereik'}</div>
        <div class="pixel mid accu">
          {#if data.soc}{Math.round(data.soc.value)}<span class="unit">%</span>{/if}{#if data.soc && data.range}<span class="sep">·</span>{/if}{#if data.range}{km(data.range.value)}<span class="unit">km</span>{/if}
        </div>
      </div>
    {/if}
  </section>

  {#if c.lastUnlocked || data.followed}
    <section class="panel badges-card" aria-label="Badges">
      <div class="label">Badges</div>
      <div class="halves">
        {#if c.lastUnlocked}
          <a class="half" href="#/badges/{c.lastUnlocked.id}">
            <PixelIcon icon={c.lastUnlocked.icon} size={52} />
            <span class="muted small">Laatst ontgrendeld</span>
            <span class="badge-name">{c.lastUnlocked.name}</span>
            <span class="muted small">{date(c.lastUnlocked.ts, data.timeZone)}</span>
          </a>
        {:else}
          <a class="half" href="#/badges"><span class="muted small">Nog niets ontgrendeld</span></a>
        {/if}
        {#if data.followed}
          {@const f = data.followed}
          <a class="half" href="#/badges/{f.id}">
            <BadgeRing icon={f.icon} fraction={f.current / f.target} size={84} />
            <span class="muted small">Gevolgd{f.auto ? ' · automatisch' : ''}</span>
            <span class="badge-name">{f.name}</span>
            <span class="muted small">nog {km(f.remaining)} {f.unit}</span>
          </a>
        {/if}
      </div>
    </section>
  {/if}
{/if}

{#if showRanks && c}
  <RankOverview current={c.level.rank} level={c.level.level} xp={c.level.xp} bonusXp={c.bonusXp} onclose={() => (showRanks = false)} />
{/if}

<style>
  .odo {
    box-shadow: var(--glow);
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    gap: 12px;
    margin-bottom: 10px;
  }
  .label {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .pixel {
    font-family: var(--font-pixel);
    line-height: 1.05;
  }
  .big {
    font-size: 2.4rem;
    color: var(--accent);
    text-shadow: var(--accent-text-glow);
  }
  .mid {
    font-size: 1.9rem;
  }
  .unit {
    font-size: 1.1rem;
    color: var(--muted);
    margin-left: 4px;
  }
  .ch-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .kicker {
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
  }
  .xp-badge {
    font-family: var(--font-pixel);
    font-size: 1rem;
    line-height: 1;
    padding: 2px 6px;
    border: 1px solid var(--accent);
    border-radius: 4px;
    color: var(--accent);
    white-space: nowrap;
  }
  .ch-body {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 8px 0 10px;
  }
  .ch-text {
    min-width: 0;
  }
  .ch-title {
    font-weight: 700;
  }
  .ch-goal {
    font-size: 0.95rem;
  }
  .ch-foot {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 6px;
    font-size: 0.85rem;
    color: var(--muted);
  }
  .challenge.done {
    border-color: var(--accent);
    box-shadow: var(--glow);
  }
  .accent {
    color: var(--accent);
  }
  .chev {
    color: var(--accent);
  }
  .rank {
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
    cursor: pointer;
    font-weight: 600;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .tiles.two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .badges-card .label {
    margin-bottom: 8px;
  }
  .halves {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .half {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    text-align: center;
    gap: 2px;
    padding: 8px 4px;
    border: 1px solid var(--line);
    border-radius: 10px;
    color: inherit;
    text-decoration: none;
    min-width: 0;
  }
  .half:hover,
  .half:focus-visible {
    border-color: var(--accent);
    outline: none;
  }
  .half .badge-name {
    margin-top: 4px;
  }
  .accu .sep {
    color: var(--muted);
    margin: 0 6px;
  }
  .year-banner {
    display: flex;
    align-items: center;
    gap: 12px;
    color: inherit;
    text-decoration: none;
    border-color: var(--accent);
    box-shadow: var(--glow);
  }
  .year-banner span {
    display: flex;
    flex-direction: column;
  }
  .badge-name {
    font-weight: 600;
    line-height: 1.2;
  }
  /* Value and unit stay together; the size shrinks on narrow screens. */
  .tiles .pixel {
    white-space: nowrap;
    font-size: clamp(1.45rem, 6.2vw, 1.9rem);
  }
  .tile {
    padding: 12px;
    min-width: 0;
    overflow-wrap: anywhere;
  }
</style>
