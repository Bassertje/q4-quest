<script lang="ts">
  import { getJson } from '../lib/api';
  import { date, km, kw, num1 } from '../lib/format';
  import PixelBattery from '../lib/PixelBattery.svelte';
  import PixelIcon from '../lib/PixelIcon.svelte';
  import SocChart from '../lib/SocChart.svelte';
  import type { ChargingData, ChargingSession } from '../lib/types';
  import WeekKwhChart from '../lib/WeekKwhChart.svelte';

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

  const pct = (v: number | null) => (v === null ? '?' : `${Math.round(v)}`);
  const TREE_MAX = 20;
  let info = $state({ consumption: false, green: false });
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
        <div class="muted small nw">{data.totals.ac.sessions} AC · {data.totals.dc.sessions} DC</div>
      </div>
      <div class="panel tile">
        <div class="label">Geladen</div>
        <div class="pixel">{km(data.totals.kwh)}<span class="unit">kWh</span></div>
        <div class="muted small">schatting</div>
      </div>
      <div class="panel tile">
        <div class="label head">
          Verbruik
          <button class="info" aria-label="Uitleg verbruik" aria-expanded={info.consumption} onclick={() => (info.consumption = !info.consumption)}>ⓘ</button>
        </div>
        {#if data.consumption?.kwhPer100km != null}
          <div class="pixel">{num1(data.consumption.kwhPer100km)}</div>
          <div class="muted small">kWh/100 km · 30 dagen</div>
        {:else}
          <div class="pixel muted">–</div>
          <div class="muted small">nog te weinig data</div>
        {/if}
      </div>
    </section>
    {#if info.consumption && data.consumption}
      <p class="muted small note panel">
        Schatting over de laatste 30 dagen: verbruikte energie gedeeld door de gereden km. Verbruikte energie =
        geladen kWh + (accupercentage aan het begin − aan het eind) × {num1(data.batteryKwh)} kWh. Het venster
        begint nooit vóór de eerste meting van kilometerstand én accu. Getoond vanaf 300 km
        (nu {km(data.consumption.km)} km, {km(data.consumption.kwh)} kWh verbruikt).
      </p>
    {/if}
  {/if}

  {#if data.weeklyKwh.length}
    <section class="panel">
      <h3>Geladen per week</h3>
      <WeekKwhChart weeks={data.weeklyKwh} />
    </section>
  {/if}

  {#if data.socLast7d.length > 1}
    <section class="panel">
      <h3>Accu, laatste 7 dagen</h3>
      <SocChart soc={data.socLast7d} sessions={data.sessions.filter((s) => s.end >= Date.now() - 7 * 86_400_000)} timeZone={tz} />
    </section>
  {/if}

  {#if data.green && data.green.co2Kg !== null}
    {@const g = data.green}
    <section class="panel green">
      <h3 class="head">
        Groen <span class="muted small">(schatting)</span>
        <button class="info" aria-label="Uitleg Groen" aria-expanded={info.green} onclick={() => (info.green = !info.green)}>ⓘ</button>
      </h3>
      {#if info.green}
        <p class="muted small note">
          Vergeleken met een benzineauto: km × CO₂ per km min verbruikte kWh × CO₂ per kWh, en km × liters per
          100 km. Eén boom neemt ongeveer 20 kg CO₂ per jaar op. De factoren stel je in bij de add-on-opties.
        </p>
      {/if}
      <div class="green-grid">
        <div><span class="label">CO₂ bespaard</span><span class="pixel">{km(g.co2Kg ?? 0)}<span class="unit">kg</span></span></div>
        <div><span class="label">Benzine niet verbrand</span><span class="pixel">{km(g.liters)}<span class="unit">liter</span></span></div>
        <div>
          <span class="label">Gelijk aan</span>
          <span class="pixel">{num1(g.trees ?? 0)}<span class="unit">bomen</span></span>
          <span class="muted small">die een jaar lang CO₂ opnemen</span>
        </div>
      </div>
      {#if g.trees}
        <div class="trees" role="img" aria-label="{num1(g.trees)} bomen">
          {#each Array(Math.min(TREE_MAX, Math.ceil(g.trees))) as _, i (i)}
            {@const fill = Math.min(1, g.trees - i)}
            <span class="tree" style:--fill="{fill * 100}%"><PixelIcon icon="tree" size={22} /></span>
          {/each}
          {#if g.trees > TREE_MAX}<span class="muted small more-trees">+ {km(Math.ceil(g.trees) - TREE_MAX)}</span>{/if}
        </div>
      {/if}
      {#if data.nextGreen}
        {@const n = data.nextGreen}
        <div class="next">
          <span class="muted small">Volgende badge: <strong>{n.name}</strong> · {km(n.current)} / {km(n.target)} {n.unit}</span>
          <span class="next-bar"><span style:width="{(n.current / n.target) * 100}%"></span></span>
        </div>
      {/if}
    </section>
  {/if}

  <section class="panel">
    <h3>Sessies</h3>
    {#if data.sessions.length === 0}
      <p class="muted small">Nog geen laadsessies gevonden.</p>
    {:else}
      <ul class="rows sessions">
        {#each data.sessions.slice(0, shown) as s (s.start)}
          <li class:live={s.ongoing}>
            <span class="row-main">{date(s.start, tz)}</span>
            <span class="row-value">{s.kwh === null ? '–' : `~${num1(s.kwh)} kWh`}</span>
            <span class="row-sub">
              <span class="badge" class:dc={s.type === 'DC'}>{s.type}</span>
              <span class="nw">{time(s.start)} · {s.ongoing ? 'bezig' : duration(s)}</span> ·
              <span class="nw">gem. {s.avgKw === null ? '–' : `${kw(s.avgKw)} kW`}</span>
              {#if s.socStart !== null || s.socEnd !== null}
                · <span class="nw"><PixelBattery from={s.socStart} to={s.socEnd} /> {pct(s.socStart)} → {pct(s.socEnd)}%</span>
              {/if}
            </span>
          </li>
        {/each}
      </ul>
      {#if shown < data.sessions.length}
        <button class="more" onclick={() => (shown += STEP)}>Meer tonen</button>
      {/if}
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
  .sessions li.live {
    border-left: 2px solid var(--accent);
    padding-left: 10px;
  }
  .sessions .row-sub {
    font-variant-numeric: tabular-nums;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .info {
    border: 0;
    padding: 0 2px;
    background: none;
    color: var(--muted);
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
  }
  .info[aria-expanded='true'] {
    color: var(--accent);
  }
  .note.panel {
    margin: 0;
    padding: 12px;
  }
  .trees {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    margin-top: 12px;
  }
  .tree {
    position: relative;
    display: inline-block;
    width: 22px;
    height: 22px;
    /* The last tree is filled partially (left to right). */
    clip-path: inset(0 calc(100% - var(--fill)) 0 0);
  }
  .more-trees {
    margin-left: 6px;
  }
  .next {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 12px;
  }
  .next-bar {
    display: block;
    height: 4px;
    background: var(--track);
    border-radius: 2px;
    overflow: hidden;
  }
  .next-bar span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .badge {
    margin-right: 6px;
    vertical-align: 1px;
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
