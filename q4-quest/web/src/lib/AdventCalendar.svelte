<script lang="ts">
  import { onMount } from 'svelte';
  import { post } from './api';
  import PixelIcon from './PixelIcon.svelte';
  import type { AdventDoor, EventData } from './types';

  /**
   * Advent calendar (6–31 December): a horizontally scrolling row of pixel doors
   * with today in view. Only today's door can be opened (10 XP, stored); missed
   * days stay closed. In a preview the door opens in the browser only.
   */
  let {
    advent,
    preview,
    decorate,
    onopened,
  }: { advent: NonNullable<EventData['advent']>; preview: boolean; decorate: boolean; onopened: () => void } = $props();

  let row: HTMLDivElement;
  let busy = $state(false);
  let error = $state<string | null>(null);
  /** Door whose fact is shown (today's after opening, or an opened one that was tapped). */
  let shown = $state<string | null>(null);
  /** Doors opened in a preview (not stored). */
  let previewOpened = $state<Record<string, string>>({});
  let justOpened = $state<string | null>(null);

  const doors = $derived(
    advent.doors.map((d): AdventDoor => (previewOpened[d.day] ? { ...d, opened: true, fact: previewOpened[d.day] } : d)),
  );
  const shownDoor = $derived(doors.find((d) => d.day === shown && d.opened) ?? null);
  const dayNum = (day: string) => Number(day.slice(8));

  async function tap(d: AdventDoor) {
    error = null;
    if (d.opened) {
      shown = shown === d.day ? null : d.day;
      return;
    }
    if (d.day !== advent.today || busy) return;
    if (preview) {
      previewOpened = { ...previewOpened, [d.day]: advent.previewFact ?? '' };
      shown = justOpened = d.day;
      return;
    }
    busy = true;
    try {
      const res = await post('advent/open');
      if (!res.ok && res.status !== 409) throw new Error(`HTTP ${res.status}`);
      shown = justOpened = d.day;
      onopened();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      busy = false;
    }
  }

  /** Bring today's door into view without scrolling the page. */
  function centreToday() {
    const el = row?.querySelector<HTMLElement>('[data-today]');
    if (!el) return;
    const r = row.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    row.scrollLeft += e.left - r.left - (r.width - e.width) / 2;
  }

  onMount(() => {
    // After layout (and again once the fonts are in), so the widths are known.
    requestAnimationFrame(centreToday);
    void document.fonts?.ready.then(centreToday);
  });
</script>

<section class="panel advent" class:plain={!decorate} aria-label="Adventskalender">
  <div class="head">
    <h3>Adventskalender</h3>
    <span class="muted small">{doors.filter((d) => d.opened).length} / {doors.length} open</span>
  </div>
  <div class="row" bind:this={row}>
    {#each doors as d (d.day)}
      {@const isToday = d.day === advent.today}
      {@const past = d.day < advent.today}
      <button
        class="door"
        class:open={d.opened}
        class:today={isToday && !d.opened}
        class:missed={past && !d.opened}
        class:future={d.day > advent.today}
        data-today={isToday ? '' : undefined}
        disabled={!d.opened && !isToday}
        aria-label="{dayNum(d.day)} december{d.opened ? ', open' : isToday ? ', vandaag: tik om te openen' : past ? ', gemist' : ''}"
        onclick={() => tap(d)}
      >
        {#if d.opened}
          <PixelIcon icon="gift" size={22} />
        {:else}
          <span class="num">{dayNum(d.day)}</span>
          {#if decorate}<span class="bow" aria-hidden="true"></span>{/if}
        {/if}
      </button>
    {/each}
  </div>
  {#if shownDoor}
    <div class="explain fact" role="status">
      <p><strong>{dayNum(shownDoor.day)} december</strong>{preview ? ' · voorbeeld, geen XP' : justOpened === shownDoor.day ? ' · +10 XP' : ''}</p>
      <p>{shownDoor.fact}</p>
    </div>
  {:else if doors.some((d) => d.day === advent.today && !d.opened)}
    <p class="muted small hint">Tik op het deurtje van vandaag.</p>
  {/if}
  {#if error}<p class="muted small">Het deurtje kon niet worden geopend ({error}).</p>{/if}
</section>

<style>
  /* A grid item: without this the card grows to the width of all doors. */
  .advent {
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 8px;
  }
  h3 {
    margin: 0;
    font-size: 1rem;
  }
  .row {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    padding: 4px 2px 8px;
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
  }
  .door {
    position: relative;
    flex: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 56px;
    padding: 0;
    border: 2px solid var(--line);
    border-radius: 4px;
    background: var(--track);
    color: var(--muted);
    scroll-snap-align: center;
    box-shadow: none;
  }
  .num {
    align-self: end;
    padding-bottom: 6px;
    font-family: var(--font-pixel);
    font-size: 1.3rem;
    line-height: 1;
  }
  /* A pixel ribbon across the door (only with the festive mode on). */
  .bow {
    position: absolute;
    inset: 0;
    /* A ribbon across the top part of the door, clear of the number. */
    background:
      linear-gradient(var(--accent), var(--accent)) center top / 4px 16px no-repeat,
      linear-gradient(var(--accent), var(--accent)) center 12px / 100% 4px no-repeat;
    opacity: 0.35;
    pointer-events: none;
  }
  .door.today {
    border-color: var(--accent);
    color: var(--text);
    box-shadow: var(--glow);
    cursor: pointer;
  }
  .door.today .bow {
    opacity: 0.8;
  }
  .door.open {
    border-color: var(--line);
    background: var(--panel);
    cursor: pointer;
  }
  .door.missed {
    opacity: 0.45;
  }
  .door.future {
    opacity: 0.7;
  }
  .door:disabled {
    cursor: default;
  }
  .plain .door.today {
    box-shadow: none;
  }
  .fact {
    margin-bottom: 0;
  }
  .hint {
    margin: 4px 0 0;
  }
</style>
