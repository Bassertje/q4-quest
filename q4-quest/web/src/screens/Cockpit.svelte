<script lang="ts">
  import { getJson } from '../lib/api';
  import Bar from '../lib/Bar.svelte';
  import { ago, date, km, pct } from '../lib/format';
  import Odometer from '../lib/Odometer.svelte';
  import Setup from '../lib/Setup.svelte';
  import type { CockpitData } from '../lib/types';

  let { refresh }: { refresh: number } = $props();

  let data = $state<CockpitData | null>(null);
  let error = $state<string | null>(null);

  async function load() {
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
  <section class="panel odo">
    <Odometer value={c.odometer} />
    <p class="muted small center">Bijgewerkt {ago(c.odometerTs)}</p>
  </section>

  <section class="panel">
    <div class="row">
      <div>
        <div class="pixel big">LEVEL {c.level.level}</div>
        <div class="rank">{c.level.rank}</div>
      </div>
      <div class="muted small right">
        {km(c.level.xp)} / {km(c.level.nextLevelXp)} XP<br />
        nog {km(c.level.nextLevelXp - c.level.xp)} XP
      </div>
    </div>
    <Bar fraction={c.level.fraction} label="Voortgang naar het volgende level" />
  </section>

  <section class="panel">
    <div class="row">
      <div>
        <div class="label">Volgende mijlpaal</div>
        <div class="pixel mid">{c.milestone.next.name}</div>
      </div>
      <div class="muted small right">nog {km(c.milestone.remainingKm)} km</div>
    </div>
    <Bar fraction={c.milestone.fraction} label="Voortgang naar de volgende mijlpaal" />
  </section>

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
    <div class="panel tile">
      <div class="label">Laatst ontgrendeld</div>
      {#if c.lastMilestone}
        <div class="pixel mid">{c.lastMilestone.milestone.name}</div>
        <div class="muted small">{date(c.lastMilestone.ts, data.timeZone)}</div>
      {:else}
        <div class="muted">Nog niets, eerste mijlpaal: 1.000 km</div>
      {/if}
    </div>
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

  <section class="panel">
    <div class="row">
      <div>
        <div class="label">Maanreis</div>
        <div class="pixel mid">{pct(c.moon.fraction)}</div>
      </div>
      <div class="muted small right">{km(c.odometer)} / {km(c.moon.km)} km</div>
    </div>
    <Bar fraction={c.moon.fraction} label="Voortgang van de maanreis" />
  </section>
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
    text-shadow: 0 0 10px rgba(227, 6, 19, 0.45);
  }
  .mid {
    font-size: 1.9rem;
  }
  .unit {
    font-size: 1.1rem;
    color: var(--muted);
    margin-left: 4px;
  }
  .rank {
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
  .tile {
    padding: 12px;
    min-width: 0;
    overflow-wrap: anywhere;
  }
</style>
