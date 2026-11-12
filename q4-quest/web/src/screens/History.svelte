<script lang="ts">
  import { getJson, putJson } from '../lib/api';
  import { periodRangeLabel } from '../../../game/src/history-period.ts';
  import BarChart from '../lib/BarChart.svelte';
  import ConsumptionChart from '../lib/ConsumptionChart.svelte';
  import { date, dayShort, km, kw, num1, periodLabel } from '../lib/format';
  import PeriodPicker from '../lib/PeriodPicker.svelte';
  import Setup from '../lib/Setup.svelte';
  import StatTile from '../lib/StatTile.svelte';
  import type { HistoryData, TimelineEvent, ViewPeriodMode, YearsData } from '../lib/types';

  let { refresh }: { refresh: number } = $props();

  const TIMELINE_STEP = 15;
  const TRIPS_STEP = 5;

  let data = $state<HistoryData | null>(null);
  let error = $state<string | null>(null);
  /** Null until the first response tells us the saved choice. */
  let mode = $state<ViewPeriodMode | null>(null);
  /** Null = the current period. */
  let periodKey = $state<string | null>(null);
  let timelineShown = $state(TIMELINE_STEP);
  let tripsShown = $state(TRIPS_STEP);
  let challengesShown = $state(8);
  /** Daily average temperature, shown in the day chart readout. */
  const dayTempNotes = $derived(
    new Map((data?.dailyTemps ?? []).map(([d, t]) => [d, `gem. ${num1(t)} °C`] as [string, string])),
  );

  let years = $state<YearsData | null>(null);

  async function load() {
    getJson<YearsData>('years')
      .then((y) => (years = y))
      .catch(() => {});
    try {
      const q = mode ? `?period=${mode}${periodKey ? `&key=${encodeURIComponent(periodKey)}` : ''}` : '';
      const next = await getJson<HistoryData>(`history${q}`);
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

  $effect(() => {
    void refresh;
    load();
  });

  function setMode(m: ViewPeriodMode) {
    mode = m;
    periodKey = null;
    tripsShown = TRIPS_STEP;
    load();
    void putJson('settings', { historyPeriod: m }).catch(() => {});
  }

  function go(key: string) {
    periodKey = key;
    tripsShown = TRIPS_STEP;
    load();
  }

  const h = $derived(data?.history ?? null);
  const p = $derived(data?.period ?? null);

  function eventTitle(e: TimelineEvent): string {
    if (e.type === 'milestone') return `Wereldreis: ${e.name} (+${km(e.xp)} XP)`;
    if (e.type === 'badge' && e.id.startsWith('challenge_')) return `${e.name} gehaald (+${km(e.xp)} XP)`;
    if (e.type === 'badge') return e.xp > 0 ? `Badge: ${e.name} (+${km(e.xp)} XP)` : `Badge: ${e.name}`;
    return e.newRank ? `Level ${e.level}, nieuwe rang: ${e.rank}` : `Level ${e.level}`;
  }

  const initialSummary = $derived.by(() => {
    const initial = h?.timeline.initial ?? [];
    if (initial.length === 0) return null;
    const levels = initial.filter((e) => e.type === 'level');
    const milestones = initial.filter((e) => e.type === 'milestone');
    const badges = initial.filter((e) => e.type === 'badge');
    const top = levels[0];
    const parts: string[] = [];
    if (top && top.type === 'level') parts.push(`level ${top.level} (${top.rank})`);
    if (milestones.length) parts.push(`${milestones.length} ${milestones.length === 1 ? 'bestemming' : 'bestemmingen'}`);
    if (badges.length) parts.push(`${badges.length} ${badges.length === 1 ? 'badge' : 'badges'}`);
    return { ts: initial[0].ts, text: `Start van de meting: al ${parts.join(' en ')}` };
  });

  const tz = $derived(data?.timeZone);
  const time = (ts: number) =>
    new Date(ts).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: tz });
  const STATUS_LABEL = { active: 'loopt', done: 'gehaald', missed: 'gemist' } as const;

  /** Records as uniform two-line rows: label and value, then the period or date. */
  const recordRows = $derived.by(() => {
    const rows: { label: string; note?: string; value: string; sub: string }[] = [];
    const rec = data?.history?.records;
    if (!rec) return rows;
    if (rec.bestDay) rows.push({ label: 'Beste dag', value: `${km(rec.bestDay.km)} km`, sub: periodLabel(rec.bestDay.key, true) });
    if (rec.bestWeek) rows.push({ label: 'Beste week', value: `${km(rec.bestWeek.km)} km`, sub: periodLabel(rec.bestWeek.key, true) });
    if (rec.bestMonth) rows.push({ label: 'Beste maand', value: `${km(rec.bestMonth.km)} km`, sub: periodLabel(rec.bestMonth.key, true) });
    if (rec.longestStreak)
      rows.push({
        label: 'Langste streak',
        value: `${rec.longestStreak.days} ${rec.longestStreak.days === 1 ? 'dag' : 'dagen'}`,
        sub: `${dayShort(rec.longestStreak.start)} – ${dayShort(rec.longestStreak.end)}`,
      });
    if (rec.longestTrip)
      rows.push({ label: 'Grootste ritblok', note: '(indicatief)', value: `${km(rec.longestTrip.km)} km`, sub: date(rec.longestTrip.start, tz) });
    const cr = data?.chargingRecords;
    if (cr?.fastest)
      rows.push({ label: 'Snelste laadsessie', note: '(gem.)', value: `${kw(cr.fastest.avgKw ?? 0)} kW`, sub: date(cr.fastest.start, tz) });
    if (cr?.busiestMonth)
      rows.push({ label: 'Meeste laadsessies', value: `${cr.busiestMonth.sessions} sessies`, sub: periodLabel(cr.busiestMonth.key, true) });
    return rows;
  });

  /** A block with a single reading has no real duration: show an approximate time. */
  const tripTime = (t: { start: number; end: number }) =>
    t.start === t.end ? `rond ${time(t.start)}` : `${time(t.start)}–${time(t.end)}`;
</script>

<h2 class="title">Historie</h2>

{#if error && !data}
  <section class="panel">
    <p>De gegevens konden niet worden geladen ({error}).</p>
    <button onclick={load}>Opnieuw</button>
  </section>
{:else if !data}
  <p class="muted">Laden…</p>
{:else if data.setupNeeded}
  <Setup />
{:else if !h}
  <section class="panel"><p class="muted">Nog geen kilometerstand ontvangen.</p></section>
{:else}
  <PeriodPicker {mode} period={p} onmode={setMode} ongo={go} />

  {#if p}
    {@const st = p.stats}
    <div class="stat-tiles-wrap">
      <section class="stat-tiles">
        {#if p.odometerKm !== null}
          <!-- "Alles": the real total, i.e. the current odometer value. -->
          <StatTile label="Gereden" value={km(p.odometerKm)} unit="km" sub="totaal" />
        {:else}
          <StatTile label="Gereden" value={st ? km(st.km) : null} unit="km" sub={st ? periodRangeLabel(p.dataFrom, p.dataTo) : 'geen data'} />
        {/if}
        <StatTile label="Rijdagen" value={st ? String(st.drivingDays) : null} sub={st ? `van ${st.days}` : 'geen data'} />
        <StatTile
          label="Gem. per dag"
          value={st ? num1(st.avgPerDay) : null}
          unit="km"
          sub={st ? `hoogste ${km(st.maxDayKm)} km` : 'geen data'}
        />
        <StatTile
          label="Drukste dag"
          value={st?.busiestWeekday ? st.busiestWeekday.day : null}
          sub={st?.busiestWeekday ? `${km(st.busiestWeekday.km)} km totaal` : 'geen data'}
        />
      </section>
    </div>

    <section class="panel">
      <h3>Gereden<span class="muted per">· {p.label}</span></h3>
      <BarChart
        bars={p.buckets}
        bucket={p.bucket}
        notes={p.bucket === 'day' ? dayTempNotes : undefined}
        current={p.dataTo ? (p.bucket === 'day' ? p.dataTo : p.dataTo.slice(0, 7)) : null}
      />
      <p class="summary">
        <!-- Total of all bars; with "Alles" including the km before the measurement. -->
        <strong class="nw">{km(p.buckets.reduce((sum, b) => sum + b.km, 0))} km</strong>
        <span class="muted nw">{p.buckets[0]?.earlier ? `totaal t/m ${periodRangeLabel(p.dataTo, p.dataTo)}` : periodRangeLabel(p.dataFrom, p.dataTo)}</span>
      </p>
    </section>
  {/if}

  {#if data.monthly.length}
    <section class="panel">
      <h3>Verbruik per maand{data.hasTemperature ? ' en temperatuur' : ''}</h3>
      <ConsumptionChart months={data.monthly.slice(-12)} showTemp={data.hasTemperature} />
    </section>
  {/if}

  <section class="panel">
    <h3>Records<span class="muted per">· altijd</span></h3>
    <ul class="rows">
      {#each recordRows as r (r.label)}
        <li>
          <span class="row-main">{r.label}{#if r.note}&nbsp;<span class="muted small">{r.note}</span>{/if}</span>
          <span class="row-value">{r.value}</span>
          <span class="row-sub">{r.sub}</span>
        </li>
      {/each}
    </ul>
    {#if !h.records.bestDay}
      <p class="muted small">Nog geen records: rij eerst een stukje.</p>
    {/if}
  </section>

  {#if p}
    <section class="panel">
      <h3>Ritblokken<span class="muted per">· {p.label}</span></h3>
      <p class="muted small">Indicatief: opeenvolgende kilometerstijgingen met minder dan 45 minuten ertussen.</p>
      {#if p.trips.length === 0}
        <p class="muted small">Geen ritblokken in deze periode.</p>
      {:else}
        <ul class="rows">
          {#each p.trips.slice(0, tripsShown) as t (t.start)}
            <li>
              <span class="row-main">{date(t.start, tz)}</span>
              <span class="row-value">{km(t.km)} km</span>
              <span class="row-sub">{tripTime(t)}{t.startTemp !== null ? ` · ${num1(t.startTemp)} °C` : ''}</span>
            </li>
          {/each}
        </ul>
        {#if tripsShown < p.trips.length}
          <button class="more" onclick={() => (tripsShown += 20)}>Meer tonen</button>
        {:else if p.tripCount > p.trips.length}
          <p class="muted small">De nieuwste {p.trips.length} van {km(p.tripCount)} ritblokken.</p>
        {/if}
      {/if}
    </section>
  {/if}

  {#if years?.years.some((y) => y.available)}
    <section class="panel">
      <h3>Jaaroverzichten</h3>
      <div class="years">
        {#each years.years.filter((y) => y.available).reverse() as y (y.year)}
          <a class="button" href="#/jaar/{y.year}">{y.year}</a>
        {/each}
      </div>
    </section>
  {/if}

  {#if data.challenges.length}
    <section class="panel">
      <h3>Weekuitdagingen</h3>
      <ul class="rows">
        {#each data.challenges.slice(0, challengesShown) as c (c.week)}
          <li>
            <span class="row-main">{periodLabel(c.week, true)}</span>
            <span class="row-value" class:accent={c.status === 'done'}>{STATUS_LABEL[c.status]}</span>
            <span class="row-sub nw" title={c.goal}>{c.title} · {c.current === null ? '–' : num1(c.current)} / {num1(c.target)} {c.unit}</span>
          </li>
        {/each}
      </ul>
      {#if challengesShown < data.challenges.length}
        <button class="more" onclick={() => (challengesShown += 8)}>Meer tonen</button>
      {/if}
    </section>
  {/if}

  <section class="panel">
    <h3>Tijdlijn</h3>
    <ol class="timeline">
      {#each h.timeline.events.slice(0, timelineShown) as e (e.type + e.ts + (e.type === 'level' ? e.level : e.type === 'badge' ? e.id : e.km))}
        <li class:accent={e.type === 'milestone' || e.type === 'badge' || (e.type === 'level' && e.newRank)}>
          <span class="marker" aria-hidden="true"></span>
          <span class="what">{eventTitle(e)}</span>
          <span class="muted small">{date(e.ts, tz)}</span>
        </li>
      {/each}
      {#if initialSummary && timelineShown >= h.timeline.events.length}
        <li class="start">
          <span class="marker" aria-hidden="true"></span>
          <span class="what">{initialSummary.text}</span>
          <span class="muted small">{date(initialSummary.ts, tz)}</span>
        </li>
      {/if}
    </ol>
    {#if timelineShown < h.timeline.events.length}
      <button class="more" onclick={() => (timelineShown += TIMELINE_STEP)}>Meer tonen</button>
    {/if}
    {#if h.timeline.events.length === 0 && !initialSummary}
      <p class="muted small">Nog geen gebeurtenissen.</p>
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
  .accent {
    color: var(--accent);
  }
  .per {
    margin-left: 0.3em;
    font-weight: 400;
  }
  .summary {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin: 8px 0 0;
  }
  .nw {
    white-space: nowrap;
  }
  .years {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .more {
    margin-top: 8px;
  }
  .timeline {
    list-style: none;
    margin: 0;
    padding: 0 0 0 4px;
  }
  .timeline li {
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 0 0 14px 22px;
    border-left: 2px solid var(--line);
  }
  .timeline li:last-child {
    border-left-color: transparent;
    padding-bottom: 0;
  }
  .marker {
    position: absolute;
    left: -6px;
    top: 4px;
    width: 10px;
    height: 10px;
    background: var(--muted);
  }
  .timeline li.accent .marker {
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent-glow-color);
  }
  .timeline li.start .marker {
    background: var(--panel);
    border: 2px solid var(--muted);
  }
</style>
