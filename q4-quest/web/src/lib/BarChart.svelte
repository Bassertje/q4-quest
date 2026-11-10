<script lang="ts">
  import { onMount } from 'svelte';
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';
  import { km, periodLabel } from './format';
  import type { Series } from './types';

  let { data, height = 200 }: { data: Series; height?: number } = $props();

  let container: HTMLDivElement;
  let chart: uPlot | null = null;
  let selected = $state<number | null>(null);

  const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function options(width: number): uPlot.Options {
    const muted = css('--muted');
    const line = css('--line');
    const accent = css('--accent');
    const font = '11px Inter, system-ui, sans-serif';
    return {
      width,
      height,
      padding: [8, 18, 0, 0],
      legend: { show: false },
      cursor: { x: false, y: false, points: { show: false }, drag: { x: false, y: false } },
      scales: { x: { time: false }, y: { range: (_u, _min, max) => [0, Math.max(10, max * 1.1)] } },
      axes: [
        {
          stroke: muted,
          font,
          size: 26,
          grid: { show: false },
          ticks: { show: false },
          values: (_u, splits) => splits.map((i) => (Number.isInteger(i) && data[i] ? periodLabel(data[i][0]) : '')),
        },
        {
          stroke: muted,
          font,
          size: 44,
          grid: { stroke: line, width: 1 },
          ticks: { show: false },
          values: (_u, splits) => splits.map((v) => km(v)),
        },
      ],
      series: [
        {},
        {
          label: 'km',
          fill: accent,
          stroke: accent,
          width: 0,
          paths: uPlot.paths.bars!({ size: [0.7, 28], gap: 1 }),
          points: { show: false },
        },
      ],
      hooks: {
        setCursor: [
          (u) => {
            const idx = u.cursor.idx;
            selected = idx === null || idx === undefined ? null : idx;
          },
        ],
      },
    };
  }

  function toAligned(series: Series): uPlot.AlignedData {
    return [series.map((_, i) => i), series.map(([, v]) => Math.round(v))];
  }

  // (Re)create the chart whenever the data changes.
  $effect(() => {
    const series = data;
    chart = new uPlot(options(container.clientWidth), toAligned(series), container);
    selected = null;
    return () => {
      chart?.destroy();
      chart = null;
    };
  });

  onMount(() => {
    const ro = new ResizeObserver(() => chart?.setSize({ width: container.clientWidth, height }));
    ro.observe(container);
    return () => ro.disconnect();
  });

  const shownIndex = $derived(selected ?? data.length - 1);
  const shown = $derived(data[shownIndex]);
</script>

<div class="readout" aria-live="polite">
  {#if shown}
    <span class="pixel">{km(shown[1])}<span class="unit">km</span></span>
    <span class="muted small">{periodLabel(shown[0], true)}</span>
  {/if}
</div>
<div class="chart" bind:this={container} role="img" aria-label="Staafgrafiek van gereden kilometers"></div>

<style>
  .readout {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-height: 2rem;
  }
  .pixel {
    font-family: var(--font-pixel);
    font-size: 1.8rem;
    line-height: 1;
  }
  .unit {
    font-size: 1rem;
    color: var(--muted);
    margin-left: 4px;
  }
  .chart {
    width: 100%;
    touch-action: pan-y;
  }
  .chart :global(.u-over) {
    cursor: crosshair;
  }
</style>
