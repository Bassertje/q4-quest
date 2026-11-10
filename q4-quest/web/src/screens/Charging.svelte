<script lang="ts">
  import { getJson } from '../lib/api';
  import { date, km, kw, num1 } from '../lib/format';
  import type { ChargingData, ChargingSession } from '../lib/types';

  let { refresh }: { refresh: number } = $props();

  const STEP = 20;

  let data = $state<ChargingData | null>(null);
  let error = $state<string | null>(null);
  let shown = $state(STEP);

  async function load() {
    try {
      data = await getJson<ChargingData>('charging');
      error = null;
    } catch (err) {
      error = (err as Error).message;
    }
  }

  $effect(() => {
    void refresh;
    load();
  });

  const tz = $derived(data?.timeZone);
  const time = (ts: number) =>
    new Date(ts).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: tz });

  function duration(s: ChargingSession): string {
    const min = Math.round((s.end - s.start) / 60_000);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    return `${h} u ${String(min % 60).padStart(2, '0')}`;
  }

  const soc = (v: number | null) => (v === null ? '?' : `${Math.round(v)}%`);
</script>

<h2 class="title">Laden</h2>

{#if error && !data}
  <section class="panel">
    <p>De gegevens konden niet worden geladen ({error}).</p>
    <button onclick={load}>Opnieuw</button>
  </section>
{:else if !data}
  <p class="muted">Laden…</p>
{:else if !data.available}
  <section class="panel">
    <h3>Geen laadsensoren ingesteld</h3>
    <p class="muted">
      Stel in de add-on-configuratie een sensor voor het laadvermogen of de laadstatus in om je laadsessies te zien.
    </p>
  </section>
{:else}
  {#if data.totals}
    <section class="tiles">
      <div class="panel tile">
        <div class="label">Sessies</div>
        <div class="pixel">{data.totals.sessions}</div>
        <div class="muted small">{data.totals.ac.sessions} AC · {data.totals.dc.sessions} DC</div>
      </div>
      <div class="panel tile">
        <div class="label">Geladen</div>
        <div class="pixel">{km(data.totals.kwh)}<span class="unit">kWh</span></div>
        <div class="muted small">schatting</div>
      </div>
      <div class="panel tile">
        <div class="label">Verbruik</div>
        {#if data.consumption?.kwhPer100km != null}
          <div class="pixel">{num1(data.consumption.kwhPer100km)}</div>
          <div class="muted small">kWh/100 km<br />schatting, 30 dagen</div>
        {:else}
          <div class="pixel muted">–</div>
          <div class="muted small">nog te weinig data</div>
        {/if}
      </div>
    </section>
    {#if data.consumption}
      <p class="muted small note">
        Verbruiksschatting: geladen kWh gedeeld door gereden km over de laatste 30 dagen
        ({km(data.consumption.kwh)} kWh, {km(data.consumption.km)} km, {data.consumption.sessions} sessies).
        Wordt getoond vanaf 300 km en 3 sessies. Laadverliezen en laden buiten de gemeten sessies tellen mee
        of ontbreken, dus het blijft een indicatie.
      </p>
    {/if}
  {/if}

  {#if data.green && data.green.co2Kg !== null}
    <section class="panel green">
      <h3>Groen <span class="muted small">(schatting)</span></h3>
      <div class="green-grid">
        <div><span class="label">CO₂ bespaard</span><span class="pixel">{km(data.green.co2Kg)}<span class="unit">kg</span></span></div>
        <div><span class="label">Benzine niet verbrand</span><span class="pixel">{km(data.green.liters)}<span class="unit">liter</span></span></div>
        <div><span class="label">Bomen (een jaar)</span><span class="pixel">{num1(data.green.trees ?? 0)}</span></div>
      </div>
      <p class="muted small note">
        Vergeleken met een benzineauto: km × CO₂ per km min geladen kWh × CO₂ per kWh, en km × liters per
        100 km. Eén boom neemt ongeveer 20 kg CO₂ per jaar op. De factoren stel je in bij de add-on-opties.
      </p>
    </section>
  {/if}

  <section class="panel">
    <h3>Sessies</h3>
    {#if data.sessions.length === 0}
      <p class="muted small">Nog geen laadsessies gevonden.</p>
    {:else}
      <ul class="sessions">
        {#each data.sessions.slice(0, shown) as s (s.start)}
          <li class:live={s.ongoing}>
            <div class="top">
              <span>
                {date(s.start, tz)}
                <span class="muted small">· {time(s.start)} · {s.ongoing ? 'bezig' : duration(s)}</span>
              </span>
              <span class="badge" class:dc={s.type === 'DC'}>{s.type}</span>
            </div>
            <div class="facts">
              <span><span class="muted">kWh</span> {s.kwh === null ? '–' : `~${num1(s.kwh)}`}</span>
              <span><span class="muted">SoC</span> {soc(s.socStart)} → {soc(s.socEnd)}</span>
              <span><span class="muted">gem.</span> {s.avgKw === null ? '–' : `${kw(s.avgKw)} kW`}</span>
            </div>
          </li>
        {/each}
      </ul>
      {#if shown < data.sessions.length}
        <button class="more" onclick={() => (shown += STEP)}>Meer tonen</button>
      {/if}
      <p class="muted small note">
        Een sessie telt alleen als het accupercentage minstens 2 procentpunt stijgt. kWh is een schatting:
        de stijging van het accupercentage × {num1(data.batteryKwh)} kWh. "Gem." is kWh gedeeld door de duur.
        DC als de laadtype-sensor dat meldt of als het gemiddelde boven 22 kW ligt.
      </p>
    {/if}
  </section>
{/if}

<style>
  .title {
    font-size: 2rem;
  }
  h3 {
    font-size: 1rem;
    margin: 0 0 8px;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
  }
  .tile {
    padding: 12px;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .label {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .pixel {
    font-family: var(--font-pixel);
    font-size: 1.9rem;
    line-height: 1.05;
  }
  .unit {
    font-size: 1rem;
    color: var(--muted);
    margin-left: 4px;
  }
  .note {
    margin: 4px 2px 0;
  }
  .green-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }
  .green-grid div {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .sessions {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .sessions li {
    padding: 10px 0;
    border-top: 1px solid var(--line);
  }
  .sessions li:first-child {
    border-top: 0;
    padding-top: 0;
  }
  .sessions li.live {
    border-left: 2px solid var(--accent);
    padding-left: 10px;
  }
  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }
  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    margin-top: 2px;
    font-variant-numeric: tabular-nums;
  }
  .badge {
    font-family: var(--font-pixel);
    font-size: 1.1rem;
    line-height: 1;
    padding: 2px 6px;
    border: 1px solid var(--line);
    border-radius: 4px;
    color: var(--muted);
  }
  .badge.dc {
    color: var(--accent);
    border-color: var(--accent);
    box-shadow: var(--glow);
  }
  .more {
    margin-top: 8px;
  }
</style>
