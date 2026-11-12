<script lang="ts">
  import { onMount } from 'svelte';
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';
  import type { ChartBar } from '../../../game/src/periods.ts';
  import { bucketTick, drawXLabels, tickIndexes } from './chartAxis';
  import { km, periodLabel } from './format';
  import { THEME_EVENT } from './theme';

  let {
    bars,
    bucket,
    height = 200,
    notes,
    current = null,
  }: {
    /** `earlier`: a dimmed bar with the km before the measurement started (label "eerder"). */
    bars: (ChartBar & { earlier?: boolean })[];
    bucket: 'day' | 'month';
    height?: number;
    notes?: Map<string, string>;
    /** Key of the bar shown when none is selected (default: the last bar). */
    current?: string | null;
  } = $props();

  const MAX_BAR_PX = 28;
  const BAR_FRACTION = 0.6;
  const ZERO_STUB_PX = 2;

  let container: HTMLDivElement;
  let chart: uPlot | null = null;
  let selected = $state<number | null>(null);
  let themeVersion = $state(0); // bumped when the theme changes, to redraw with new colours

  const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /** Draw every bar ourselves: fixed width, centred in its slot, never at the edge. */
  function drawBars(u: uPlot) {
    const ctx = u.ctx;
    const { left, top, width, height: h } = u.bbox;
    const n = bars.length;
    if (!n) return;
    const slot = width / n;
    const barWidth = Math.min(MAX_BAR_PX * devicePixelRatio, slot * BAR_FRACTION);
    const y0 = u.valToPos(0, 'y', true);
    const accent = css('--accent');
    ctx.save();
    bars.forEach((bar, i) => {
      const cx = u.valToPos(i, 'x', true);
      if (bar.beforeStart) {
        // Faint band: there was no measurement yet.
        ctx.fillStyle = css('--chart-dim');
        ctx.fillRect(left + slot * i + 1, top, slot - 2, h);
        ctx.fillStyle = css('--line');
        ctx.fillRect(cx - barWidth / 2, y0 - ZERO_STUB_PX * devicePixelRatio, barWidth, ZERO_STUB_PX * devicePixelRatio);
        return;
      }
      if (bar.earlier) {
        // Km before the measurement started: dimmed, not part of the measured data.
        const y = u.valToPos(bar.km, 'y', true);
        ctx.fillStyle = css('--muted');
        ctx.globalAlpha = selected === null || selected === i ? 0.45 : 0.25;
        ctx.fillRect(cx - barWidth / 2, y, barWidth, y0 - y);
        ctx.globalAlpha = 1;
        return;
      }
      if (bar.km <= 0) {
        ctx.fillStyle = css('--muted');
        ctx.fillRect(cx - barWidth / 2, y0 - ZERO_STUB_PX * devicePixelRatio, barWidth, ZERO_STUB_PX * devicePixelRatio);
        return;
      }
      const y = u.valToPos(bar.km, 'y', true);
      ctx.fillStyle = accent;
      ctx.globalAlpha = selected === null || selected === i ? 1 : 0.55;
      if (selected === i) {
        ctx.shadowColor = accent;
        ctx.shadowBlur = 10 * devicePixelRatio;
      }
      ctx.fillRect(cx - barWidth / 2, y, barWidth, y0 - y);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  }

  function drawLabels(u: uPlot) {
    const n = bars.length;
    const tick = (i: number) => (bars[i].earlier ? 'eerder' : bucketTick(bars[i].key, bucket, n));
    const longest = Math.max(1, ...bars.map((_, i) => tick(i).length));
    // As many labels as fit (about 7px per character plus room), at most 8.
    const fit = Math.floor(u.bbox.width / devicePixelRatio / (longest * 7 + 14));
    let labels = tickIndexes(n, Math.max(1, Math.min(8, fit)));
    if (bars[0]?.earlier && labels[0] !== 0) {
      // Always label the "earlier" bar; drop a label that would sit too close to it.
      const step = labels.length > 1 ? labels[1] - labels[0] : n;
      labels = [0, ...labels.filter((i) => i >= step)];
    }
    drawXLabels(u, labels.map((i) => [i, tick(i)] as [number, string]), n, css('--muted'));
  }

  function options(width: number): uPlot.Options {
    const muted = css('--muted');
    const font = '11px Inter, system-ui, sans-serif';
    const n = bars.length;
    return {
      width,
      height,
      padding: [8, 8, 0, 0],
      legend: { show: false },
      cursor: { x: false, y: false, points: { show: false }, drag: { x: false, y: false } },
      scales: {
        // Half a slot of room on both sides, so bars never touch the edges.
        x: { time: false, range: () => [-0.5, n - 0.5] },
        y: { range: (_u, _min, max) => [0, Math.max(10, max * 1.1)] },
      },
      axes: [
        {
          stroke: muted,
          font,
          size: 26,
          grid: { show: false },
          ticks: { show: false },
          // Labels are drawn in drawLabels(), so the outer ones can be aligned inside the chart.
          splits: () => [],
          values: () => [],
        },
        {
          stroke: muted,
          font,
          size: 44,
          grid: { stroke: css('--line'), width: 1 },
          ticks: { show: false },
          values: (_u, splits) => splits.map((v) => km(v)),
        },
      ],
      series: [{}, { stroke: 'transparent', width: 0, points: { show: false } }],
      hooks: {
        draw: [drawBars, drawLabels],
        setCursor: [
          (u) => {
            const idx = u.cursor.idx;
            const next = idx === null || idx === undefined ? null : idx;
            if (next !== selected) {
              selected = next;
              u.redraw(false);
            }
          },
        ],
      },
    };
  }

  // (Re)create the chart whenever the bars change.
  $effect(() => {
    void themeVersion;
    const data: uPlot.AlignedData = [bars.map((_, i) => i), bars.map((b) => Math.round(b.km))];
    chart = new uPlot(options(container.clientWidth), data, container);
    selected = null;
    return () => {
      chart?.destroy();
      chart = null;
    };
  });

  onMount(() => {
    const ro = new ResizeObserver(() => chart?.setSize({ width: container.clientWidth, height }));
    ro.observe(container);
    const onTheme = () => themeVersion++;
    window.addEventListener(THEME_EVENT, onTheme);
    return () => {
      ro.disconnect();
      window.removeEventListener(THEME_EVENT, onTheme);
    };
  });

  const fallback = $derived.by(() => {
    const i = current === null ? -1 : bars.findIndex((b) => b.key === current);
    return i >= 0 ? i : bars.length - 1;
  });
  const shown = $derived(bars[selected ?? fallback]);
</script>

<div class="readout" aria-live="polite">
  {#if shown}
    <span class="pixel">{shown.beforeStart ? '–' : km(shown.km)}<span class="unit">km</span></span>
    <span class="muted small">
      {shown.earlier ? 'vóór de start van de meting' : periodLabel(shown.key, true)}{shown.beforeStart ? ' · nog geen meting' : ''}{notes?.get(shown.key) ? ` · ${notes.get(shown.key)}` : ''}
    </span>
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
