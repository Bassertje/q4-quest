<script lang="ts">
  import { getJson } from '../lib/api';
  import { chartWindow, periodOf, shiftPeriod, type PeriodMode } from '../../../game/src/periods.ts';
  import BarChart from '../lib/BarChart.svelte';
  import ConsumptionChart from '../lib/ConsumptionChart.svelte';
  import { date, dayShort, km, kw, num1, periodLabel } from '../lib/format';
  import Setup from '../lib/Setup.svelte';
  import type { HistoryData, Series, TimelineEvent, YearsData } from '../lib/types';

  let { refresh }: { refresh: number } = $props();

  type Mode = 'dag' | 'week' | 'maand';
  /** Fixed number of bars per view; the window ends at the current (or chosen) period. */
  const WINDOW: Record<Mode, number> = { dag: 31, week: 12, maand: 12 };
  const PERIOD: Record<Mode, PeriodMode> = { dag: 'day', week: 'week', maand: 'month' };
  const TIMELINE_STEP = 15;
  const TRIPS_SHOWN = 5;

  let data = $state<HistoryData | null>(null);
  let error = $state<string | null>(null);
  let mode = $state<Mode>('dag');
  let offset = $state(0); // number of windows back from the current period
  let timelineShown = $state(TIMELINE_STEP);
  let allTrips = $state(false);
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
      data = await getJson<HistoryData>('history');
      error = null;
    } catch (err) {
      error = (err as Error).message;
    }
  }

  $effect(() => {
    void refresh;
    load();
  });

  const h = $derived(data?.history ?? null);
  const full = $derived<Series>(h ? (mode === 'dag' ? h.daily : mode === 'week' ? h.weekly : h.monthly) : []);
  const today = $derived(h?.daily.at(-1)?.[0] ?? null);
  const firstKey = $derived(h && h.daily.length ? periodOf(PERIOD[mode], h.daily[0][0]) : null);
  const bars = $derived.by(() => {
    if (!today || !firstKey) return [];
    const current = periodOf(PERIOD[mode], today);
    const end = shiftPeriod(PERIOD[mode], current, -offset * WINDOW[mode]);
    return chartWindow(full, PERIOD[mode], end, WINDOW[mode], firstKey);
  });
  // Allow going back as long as the window still starts after the first measurement.
  const canGoBack = $derived(bars.length > 0 && firstKey !== null && bars[0].key > firstKey);
  const windowTotal = $derived(bars.reduce((sum, b) => sum + b.km, 0));

  function setMode(m: Mode) {
    mode = m;
    offset = 0;
  }

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
  <section class="panel">
    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Periode">
        {#each ['dag', 'week', 'maand'] as m (m)}
          <button class:active={mode === m} aria-pressed={mode === m} onclick={() => setMode(m as Mode)}>
            {m === 'dag' ? 'Dag' : m === 'week' ? 'Week' : 'Maand'}
          </button>
        {/each}
      </div>
      <div class="paging">
        <button aria-label="Eerder" disabled={!canGoBack} onclick={() => offset++}>‹</button>
        <button aria-label="Later" disabled={offset === 0} onclick={() => offset--}>›</button>
      </div>
    </div>
    <BarChart {bars} notes={mode === 'dag' ? dayTempNotes : undefined} />
    {#if bars.length}
      <p class="muted small range">
        {periodLabel(bars[0].key, true)} – {periodLabel(bars[bars.length - 1].key, true)}:
        {km(windowTotal)} km
      </p>
    {/if}
  </section>

  {#if data.monthly.length}
    <section class="panel">
      <h3>Verbruik per maand{data.hasTemperature ? ' en temperatuur' : ''}</h3>
      <ConsumptionChart months={data.monthly.slice(-12)} showTemp={data.hasTemperature} />
    </section>
  {/if}

  <section class="panel">
    <h3>Records</h3>
    <ul class="list">
      {#if h.records.bestDay}
        <li>
          <span>Beste dag</span>
          <span class="right"><strong>{km(h.records.bestDay.km)} km</strong><span class="muted small">{periodLabel(h.records.bestDay.key, true)}</span></span>
        </li>
      {/if}
      {#if h.records.bestWeek}
        <li>
          <span>Beste week</span>
          <span class="right"><strong>{km(h.records.bestWeek.km)} km</strong><span class="muted small">{periodLabel(h.records.bestWeek.key, true)}</span></span>
        </li>
      {/if}
      {#if h.records.bestMonth}
        <li>
          <span>Beste maand</span>
          <span class="right"><strong>{km(h.records.bestMonth.km)} km</strong><span class="muted small">{periodLabel(h.records.bestMonth.key, true)}</span></span>
        </li>
      {/if}
      {#if h.records.longestStreak}
        <li>
          <span>Langste streak</span>
          <span class="right">
            <strong>{h.records.longestStreak.days} {h.records.longestStreak.days === 1 ? 'dag' : 'dagen'}</strong>
            <span class="muted small">{dayShort(h.records.longestStreak.start)} – {dayShort(h.records.longestStreak.end)}</span>
          </span>
        </li>
      {/if}
      {#if h.records.longestTrip}
        <li>
          <span>Grootste ritblok <span class="muted small">(indicatief)</span></span>
          <span class="right"><strong>{km(h.records.longestTrip.km)} km</strong><span class="muted small">{date(h.records.longestTrip.start, tz)}</span></span>
        </li>
      {/if}
      {#if data.chargingRecords?.fastest}
        <li>
          <span>Snelste laadsessie <span class="muted small">(gem.)</span></span>
          <span class="right"><strong>{kw(data.chargingRecords.fastest.avgKw ?? 0)} kW</strong><span class="muted small">{date(data.chargingRecords.fastest.start, tz)}</span></span>
        </li>
      {/if}
      {#if data.chargingRecords?.busiestMonth}
        <li>
          <span>Meeste laadsessies</span>
          <span class="right"><strong>{data.chargingRecords.busiestMonth.sessions} sessies</strong><span class="muted small">{periodLabel(data.chargingRecords.busiestMonth.key, true)}</span></span>
        </li>
      {/if}
    </ul>
    {#if !h.records.bestDay}
      <p class="muted small">Nog geen records: rij eerst een stukje.</p>
    {/if}
  </section>

  {#if h.recentTrips.length}
    <section class="panel">
      <h3>Recente ritblokken</h3>
      <p class="muted small">Indicatief: opeenvolgende kilometerstijgingen met minder dan 45 minuten ertussen.</p>
      <ul class="list">
        {#each allTrips ? h.recentTrips : h.recentTrips.slice(0, TRIPS_SHOWN) as t (t.start)}
          <li>
            <span>{date(t.start, tz)}<span class="muted small">&nbsp;· {tripTime(t)}{#if t.startTemp !== null}&nbsp;· {num1(t.startTemp)} °C{/if}</span></span>
            <strong>{km(t.km)} km</strong>
          </li>
        {/each}
      </ul>
      {#if h.recentTrips.length > TRIPS_SHOWN}
        <button class="more" onclick={() => (allTrips = !allTrips)}>{allTrips ? 'Minder tonen' : 'Meer tonen'}</button>
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
      <ul class="list">
        {#each data.challenges.slice(0, challengesShown) as c (c.week)}
          <li>
            <span>
              {periodLabel(c.week, true)}
              <span class="muted small block">{c.goal}</span>
            </span>
            <span class="right">
              <strong class:accent={c.status === 'done'}>{STATUS_LABEL[c.status]}</strong>
              <span class="muted small">{c.current === null ? '–' : num1(c.current)} / {num1(c.target)} {c.unit}</span>
            </span>
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
  .toolbar {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }
  .block {
    display: block;
  }
  .accent {
    color: var(--accent);
  }
  .years {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .paging {
    display: flex;
    gap: 6px;
  }
  .paging button {
    padding: 6px 12px;
  }
  .range {
    margin: 8px 0 0;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 12px;
    padding: 8px 0;
    border-top: 1px solid var(--line);
  }
  .list li:first-child {
    border-top: 0;
  }
  .right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    margin-left: auto;
    text-align: right;
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
