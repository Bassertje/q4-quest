<script lang="ts">
  import { getJson } from '../lib/api';
  import Bar from '../lib/Bar.svelte';
  import { ago, date, km, num1 } from '../lib/format';
  import Odometer from '../lib/Odometer.svelte';
  import PixelIcon from '../lib/PixelIcon.svelte';
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
    <Odometer value={c.odometer} />
    <p class="muted small center">Bijgewerkt {ago(c.odometerTs)}</p>
  </section>

  <section class="panel">
    <div class="row">
      <div>
        <div class="pixel big">LEVEL {c.level.level}</div>
        <button class="rank" onclick={() => (showRanks = true)} aria-haspopup="dialog">
          {c.level.rank} <span class="chev" aria-hidden="true">›</span>
        </button>
      </div>
      <div class="muted small right">
        {km(c.level.xp)} / {km(c.level.nextLevelXp)} XP<br />
        {#if c.bonusXp > 0}waarvan {km(c.bonusXp)} bonus<br />{/if}
        nog {km(c.level.nextLevelXp - c.level.xp)} XP
      </div>
    </div>
    <Bar fraction={c.level.fraction} label="Voortgang naar het volgende level" />
  </section>


  {#if data.challenge}
    {@const ch = data.challenge}
    {@const cur = ch.current ?? 0}
    <section class="panel challenge" class:done={ch.status === 'done'}>
      <div class="row">
        <div class="unlocked">
          <PixelIcon icon="target" size={36} />
          <span>
            <span class="label">Weekuitdaging · {ch.title}</span>
            <span class="badge-name block">{ch.goal}</span>
          </span>
        </div>
        <div class="muted small right">
          {#if ch.status === 'done'}<strong class="accent">Gehaald!</strong><br />+{ch.xp} XP{:else}nog {ch.daysLeft} {ch.daysLeft === 1 ? 'dag' : 'dagen'}<br />+{ch.xp} XP{/if}
        </div>
      </div>
      {#if ch.type === 'max_charges'}
        <Bar fraction={Math.min(1, cur / ch.target)} label="Laadsessies deze week" />
        <div class="muted small count">{cur} van max. {ch.target} {ch.unit} · wordt zondag beoordeeld</div>
      {:else if ch.type === 'consumption'}
        <Bar fraction={ch.current === null ? 0 : Math.min(1, ch.target / Math.max(ch.current, 0.1))} label="Verbruik deze week" />
        <div class="muted small count">
          {ch.current === null ? 'nog te weinig data deze week' : `nu ${num1(ch.current)} ${ch.unit}`} · doel ≤ {num1(ch.target)} · wordt zondag beoordeeld
        </div>
      {:else}
        <Bar fraction={Math.min(1, cur / ch.target)} label="Voortgang weekuitdaging" />
        <div class="muted small count">{km(cur)} / {km(ch.target)} {ch.unit}</div>
      {/if}
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
      <div class="label">Streak</div>
      <div class="pixel mid">{c.streak}<span class="unit">{c.streak === 1 ? 'dag' : 'dagen'}</span></div>
      <div class="muted small">{c.streak > 0 ? 'op rij gereden' : 'rij vandaag om te starten'}</div>
    </div>
    <a class="panel tile link" href="#/badges">
      <div class="label">Laatst ontgrendeld</div>
      {#if c.lastUnlocked}
        <div class="unlocked">
          <PixelIcon icon={c.lastUnlocked.icon} size={32} />
          <span class="badge-name">{c.lastUnlocked.name}</span>
        </div>
        <div class="muted small">{date(c.lastUnlocked.ts, data.timeZone)}</div>
      {:else}
        <div class="muted">Nog niets. Bekijk de badges.</div>
      {/if}
    </a>
  </section>

  {#if data.soc || data.range}
    <section class="tiles two">
      {#if data.soc}
        <div class="panel tile">
          <div class="label">Accu</div>
          <div class="pixel mid">{Math.round(data.soc.value)}<span class="unit">%</span></div>
        </div>
      {/if}
      {#if data.range}
        <div class="panel tile">
          <div class="label">Actieradius</div>
          <div class="pixel mid">{km(data.range.value)}<span class="unit">km</span></div>
        </div>
      {/if}
    </section>
  {/if}

  {#if data.followed}
    {@const f = data.followed}
    <a class="panel followed link" href="#/badges">
      <div class="row">
        <div class="unlocked">
          <PixelIcon icon={f.icon} size={36} />
          <span>
            <span class="label">Gevolgde badge{f.auto ? ' · automatisch' : ''}</span>
            <span class="badge-name block">{f.name}</span>
          </span>
        </div>
        <div class="muted small right">nog {km(f.remaining)} {f.unit}</div>
      </div>
      <Bar fraction={f.current / f.target} label="Voortgang van {f.name}" />
      <div class="muted small count">{km(f.current)} / {km(f.target)} {f.unit}</div>
    </a>
  {/if}
{/if}

{#if showRanks && c}
  <RankOverview current={c.level.rank} level={c.level.level} xp={c.level.xp} onclose={() => (showRanks = false)} />
{/if}

<style>
  .odo {
    box-shadow: var(--glow);
  }
  .center {
    text-align: center;
    margin: 8px 0 0;
  }
  .right {
    text-align: right;
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
  .challenge.done {
    border-color: var(--accent);
    box-shadow: var(--glow);
  }
  .accent {
    color: var(--accent);
  }
  .followed .row {
    align-items: center;
  }
  .block {
    display: block;
  }
  .challenge .count {
    text-align: left;
  }
  .count {
    margin-top: 6px;
    text-align: right;
    font-variant-numeric: tabular-nums;
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
  .link {
    color: inherit;
    text-decoration: none;
  }
  .link:hover,
  .link:focus-visible {
    border-color: var(--accent);
    outline: none;
  }
  .unlocked {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 4px 0 2px;
  }
  .badge-name {
    font-weight: 600;
    line-height: 1.2;
  }
  .tile {
    padding: 12px;
    min-width: 0;
    overflow-wrap: anywhere;
  }
</style>
