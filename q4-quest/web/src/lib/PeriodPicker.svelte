<script lang="ts">
  import type { PeriodNav, ViewPeriodMode } from './types';

  /** Shared period choice: Week · Maand · Jaar · Alles, with ‹ › paging for the first three. */
  let {
    mode,
    period,
    onmode,
    ongo,
  }: {
    /** Null until the first response has told which choice was saved. */
    mode: ViewPeriodMode | null;
    period: PeriodNav | null;
    onmode: (m: ViewPeriodMode) => void;
    ongo: (key: string) => void;
  } = $props();

  const MODES: { id: ViewPeriodMode; label: string }[] = [
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Maand' },
    { id: 'year', label: 'Jaar' },
    { id: 'all', label: 'Alles' },
  ];
</script>

<div class="picker">
  <div class="segmented" role="group" aria-label="Periode">
    {#each MODES as m (m.id)}
      <button class:active={mode === m.id} aria-pressed={mode === m.id} onclick={() => m.id !== mode && onmode(m.id)}>{m.label}</button>
    {/each}
  </div>
  {#if period && period.mode !== 'all'}
    <div class="pager">
      <button aria-label="Vorige periode" disabled={!period.prev} onclick={() => period.prev && ongo(period.prev)}>‹</button>
      <span class="plabel" aria-live="polite">{period.label}</span>
      <button aria-label="Volgende periode" disabled={!period.next} onclick={() => period.next && ongo(period.next)}>›</button>
    </div>
  {/if}
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    margin-bottom: 12px;
  }
  .segmented {
    display: flex;
  }
  .segmented button {
    flex: 1;
  }
  .pager {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 8px;
  }
  .pager button {
    min-width: 40px;
  }
  .plabel {
    text-align: center;
    font-weight: 600;
    white-space: nowrap;
  }
</style>
