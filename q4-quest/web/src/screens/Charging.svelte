<script lang="ts">
  import { getJson, putJson } from '../lib/api';
  import ChargeKwhChart from '../lib/ChargeKwhChart.svelte';
  import { dayNoYear, km, kw, monthTitle, num1 } from '../lib/format';
  import PeriodPicker from '../lib/PeriodPicker.svelte';
  import PixelIcon from '../lib/PixelIcon.svelte';
  import StatTile from '../lib/StatTile.svelte';
  import SocChart from '../lib/SocChart.svelte';
  import type { ChargePeriodMode, ChargingData, ChargingSession, SocData, SocRange } from '../lib/types';

  let { refresh }: { refresh: number } = $props();

  const STEP = 20;
  const SOC_RANGES: { id: SocRange; label: string }[] = [
    { id: '24h', label: '24 uur' },
    { id: '7d', label: '7 dagen' },
    { id: '30d', label: '30 dagen' },
  ];

  let data = $state<ChargingData | null>(null);
  let error = $state<string | null>(null);
  let shown = $state(STEP);
  /** Null until the first response tells us the saved choice. */
  let mode = $state<ChargePeriodMode | null>(null);
  /** Null = the current period. */
  let periodKey = $state<string | null>(null);
  let socRange = $state<SocRange>('7d');
  let soc = $state<SocData | null>(null);

  async function load() {
    try {
      const q = mode ? `?period=${mode}${periodKey ? `&key=${encodeURIComponent(periodKey)}` : ''}` : '';
      const next = await getJson<ChargingData>(`charging${q}`);
      data = next;
      if (next.period) {
        mode = next.period.mode;
        if (periodKey !== null) periodKey = next.period.key;
      }
      error = null;
    } catch (err) {
      error = (err as Error).message;
    }
  }

  async function loadSoc() {
    try {
      soc = await getJson<SocData>(`charging/soc?range=${socRange}`);
    } catch {
      soc = null;
    }
  }

  $effect(() => {
    void refresh;
    load();
    loadSoc();
  });

  function setMode(m: ChargePeriodMode) {
    mode = m;
    periodKey = null;
    shown = STEP;
    openSession = null;
    load();
    void putJson('settings', { chargingPeriod: m }).catch(() => {});
  }

  function go(key: string) {
    periodKey = key;
    shown = STEP;
    openSession = null;
    load();
  }

  function setSocRange(r: SocRange) {
    if (r === socRange) return;
    socRange = r;
    loadSoc();
  }

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
  const clamp = (v: number | null) => Math.max(0, Math.min(100, v ?? 0));
  let openSession = $state<number | null>(null);
  /** "AC X · DC Y" with the averages per type; a missing type is left out. */
  function powerSub(p: { acKw: number | null; dcKw: number | null }): string {
    const parts = [p.acKw !== null ? `AC ${kw(p.acKw)}` : '', p.dcKw !== null ? `DC ${kw(p.dcKw)}` : ''].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'geen sessies';
  }
  /** Shown sessions grouped per month (newest first). */
  const groups = $derived.by(() => {
    const out: { title: string; items: ChargingSession[] }[] = [];
    for (const s of data?.period?.sessions.slice(0, shown) ?? []) {
      const title = monthTitle(s.start, tz);
      const last = out.at(-1);
      if (last && last.title === title) last.items.push(s);
      else out.push({ title, items: [s] });
    }
    return out;
  });
  const TREE_MAX = 20;
  let info = $state({ charged: false, consumption: false, green: false });
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
  {@const p = data.period}
  {#if data.hasSoc}
    <section class="panel">
      <div class="panel-head">
        <h3>Accu</h3>
        <div class="segmented small-seg" role="group" aria-label="Bereik accugrafiek">
          {#each SOC_RANGES as r (r.id)}
            <button class:active={socRange === r.id} aria-pressed={socRange === r.id} onclick={() => setSocRange(r.id)}>{r.label}</button>
          {/each}
        </div>
      </div>
      {#if soc && soc.soc.length > 1}
        <SocChart soc={soc.soc} sessions={soc.sessions} from={soc.from} to={soc.to} timeZone={tz} />
      {:else}
        <p class="muted small">Nog te weinig accumetingen in dit bereik.</p>
      {/if}
    </section>
  {/if}

  <PeriodPicker {mode} period={p} onmode={setMode} ongo={go} />

  {#if p}
    {@const t = p.totals}
    {@const c = p.consumption}
    {@const pw = p.power}
    <div class="stat-tiles-wrap">
      <section class="stat-tiles">
        <StatTile label="Sessies" value={String(t.sessions)} sub="{t.ac.sessions} AC · {t.dc.sessions} DC" />
        <StatTile
          label="Geladen"
          value={km(t.kwh)}
          unit="kWh"
          sub="AC {km(t.ac.kwh)} · DC {km(t.dc.kwh)}"
          info={{ open: info.charged, toggle: () => (info.charged = !info.charged), aria: 'Uitleg geladen' }}
        />
        <StatTile
          label="Verbruik"
          value={c?.kwhPer100km != null ? num1(c.kwhPer100km) : null}
          unit="kWh"
          sub={c?.kwhPer100km != null ? 'per 100 km' : 'te weinig data'}
          info={{ open: info.consumption, toggle: () => (info.consumption = !info.consumption), aria: 'Uitleg verbruik' }}
        />
        <StatTile
          label="Gem. laadvermogen"
          value={pw.avgKw !== null ? kw(pw.avgKw) : null}
          unit="kW"
          sub={powerSub(pw)}
        />
      </section>
    </div>
    {#if info.charged}
      <p class="muted small note panel">
        Geladen kWh is een schatting: de stijging van het accupercentage × {num1(data.batteryKwh)} kWh accucapaciteit,
        of (zonder accusensor) het laadvermogen opgeteld over de tijd. Laadverliezen tellen niet mee.
      </p>
    {/if}
    {#if info.consumption}
      <p class="muted small note panel">
        Schatting over de gekozen periode: verbruikte energie gedeeld door de gereden km. Verbruikte energie =
        geladen kWh + (accupercentage aan het begin − aan het eind) × {num1(data.batteryKwh)} kWh. De periode
        begint nooit vóór de eerste meting van kilometerstand én accu. Getoond vanaf 100 km{#if c}
          (nu {km(c.km)} km, {km(c.usedKwh)} kWh verbruikt){/if}.
      </p>
    {/if}

    <section class="panel">
      <h3>Geladen<span class="muted per">· {p.label}</span></h3>
      <ChargeKwhChart buckets={p.buckets} bucket={p.bucket} periodLabel={p.label} />
    </section>
  {/if}

  {#if p?.green && p.green.co2Kg !== null}
    {@const g = p.green}
    <section class="panel green">
      <h3 class="head">
        <span>Groen<span class="muted per">· {p.label}</span></span>
        <button class="info" aria-label="Uitleg Groen" aria-expanded={info.green} onclick={() => (info.green = !info.green)}>ⓘ</button>
      </h3>
      {#if info.green}
        <p class="muted small note">
          Schatting over de gekozen periode, vergeleken met een benzineauto: km × CO₂ per km min verbruikte kWh ×
          CO₂ per kWh, en km × liters per 100 km. Verbruikte energie zoals bij Verbruik. Eén boom neemt ongeveer
          20 kg CO₂ per jaar op. De factoren stel je in bij de add-on-opties.
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
      {#if data.greenProgress}
        {@const gp = data.greenProgress}
        <div class="next">
          {#if gp.next}
            <span class="muted next-label">Totaal {km(gp.totalKg)} kg · nog {km(Math.max(0, gp.next.target - gp.totalKg))} kg tot <strong>{gp.next.name}</strong></span>
            <span class="next-bar"><span style:width="{Math.min(100, (gp.totalKg / gp.next.target) * 100)}%"></span></span>
          {:else}
            <span class="muted next-label">Totaal {km(gp.totalKg)} kg · Alle Groen-badges gehaald</span>
            <span class="next-bar"><span style:width="100%"></span></span>
          {/if}
        </div>
      {/if}
    </section>
  {/if}

  <section class="panel">
    <h3>Sessies{#if p}<span class="muted per">· {p.label}</span>{/if}</h3>
    {#if !p || p.sessions.length === 0}
      <p class="muted small">Geen laadsessies in deze periode.</p>
    {:else}
      {#each groups as g (g.title)}
        <h4 class="month">{g.title}</h4>
        <ul class="sessions">
          {#each g.items as s (s.start)}
            {@const open = openSession === s.start}
            <li class:live={s.ongoing}>
              <button class="srow" aria-expanded={open} onclick={() => (openSession = open ? null : s.start)}>
                <span class="badge" class:dc={s.type === 'DC'}>{s.type}</span>
                <span class="mid">
                  <span class="l1">{dayNoYear(s.start, tz)}</span>
                  <span class="l2">{time(s.start)} · {s.ongoing ? 'bezig' : duration(s)}</span>
                </span>
                <span class="end">
                  <span class="l1 strong">{s.kwh === null ? '–' : `~${num1(s.kwh)} kWh`}</span>
                  <span class="l2">{pct(s.socStart)} → {pct(s.socEnd)}%</span>
                </span>
              </button>
              <span class="socbar" aria-hidden="true">
                <span class="from" style:width="{clamp(s.socStart)}%"></span>
                <span class="added" style:width="{Math.max(0, clamp(s.socEnd) - clamp(s.socStart))}%"></span>
              </span>
              {#if open}
                <dl class="detail">
                  <dt>Begin</dt><dd>{time(s.start)}</dd>
                  <dt>Einde</dt><dd>{s.ongoing ? 'bezig' : time(s.end)}</dd>
                  <dt>Gemiddeld</dt><dd>{s.avgKw === null ? '–' : `${kw(s.avgKw)} kW`}</dd>
                  <dt>Type</dt><dd>{s.type}</dd>
                </dl>
              {/if}
            </li>
          {/each}
        </ul>
      {/each}
      {#if shown < p.sessions.length}
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
    font-size: 0.55em;
    color: var(--muted);
    margin-left: 3px;
  }
  .pixel .unit {
    font-size: 1rem;
    margin-left: 4px;
  }
  .per {
    margin-left: 0.3em;
    font-weight: 400;
  }
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }
  .panel-head h3 {
    margin: 0;
  }
  .small-seg button {
    padding: 3px 8px;
    font-size: 0.8rem;
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
  .month {
    margin: 14px 0 4px;
    font-size: 0.8rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  .month:first-of-type {
    margin-top: 0;
  }
  .sessions {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .sessions li {
    border-top: 1px solid var(--line);
  }
  .sessions li:first-child {
    border-top: 0;
  }
  .sessions li.live .srow {
    box-shadow: inset 2px 0 0 var(--accent);
  }
  /* Three fixed columns, two lines; nothing wraps. */
  .srow {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    align-items: center;
    column-gap: 10px;
    width: 100%;
    padding: 9px 0 6px;
    border: 0;
    border-radius: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .srow:hover,
  .srow:focus-visible {
    box-shadow: none;
  }
  .srow:focus-visible .l1 {
    text-decoration: underline;
  }
  .mid,
  .end {
    display: flex;
    flex-direction: column;
    min-width: 0;
    white-space: nowrap;
  }
  .end {
    align-items: flex-end;
    text-align: right;
  }
  .mid .l1 {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .strong {
    font-weight: 600;
  }
  .l2 {
    font-size: 0.85rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .socbar {
    display: flex;
    height: 4px;
    margin-bottom: 8px;
    background: var(--track);
    border-radius: 2px;
    overflow: hidden;
  }
  .socbar .from {
    background: var(--muted);
    opacity: 0.6;
  }
  .socbar .added {
    background: var(--accent);
  }
  .detail {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 2px 14px;
    margin: 0 0 10px;
    padding: 8px 10px;
    font-size: 0.85rem;
    background: var(--track);
    border-radius: 8px;
  }
  .detail dt {
    color: var(--muted);
  }
  .detail dd {
    margin: 0;
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
  .next {
    container-type: inline-size;
  }
  /* One line, also on a narrow screen. */
  .next-label {
    font-size: min(0.85rem, 3.8cqi);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
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
    justify-self: center;
    text-align: center;
    width: 40px;
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
