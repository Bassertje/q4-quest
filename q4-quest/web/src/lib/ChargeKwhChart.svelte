<script lang="ts">
  import { onMount } from 'svelte';
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';
  import { bucketTick, drawXLabels, pickLabels } from './chartAxis';
  import { km, num1, periodLabel } from './format';
  import { THEME_EVENT } from './theme';

  /** Charged kWh per day or month of a period, AC and DC stacked in two shades of red. */
  let {
    buckets,
    bucket,
    periodLabel: title,
    height = 180,
  }: {
    buckets: { key: string; ac: number; dc: number; beforeStart: boolean }[];
    bucket: 'day' | 'month';
    /** Label of the whole period, shown when no bar is selected. */
    periodLabel: string;
    height?: number;
  } = $props();
  const weeks = $derived(buckets);

  function drawLabels(u: uPlot) {
    const n = weeks.length;
    const texts = weeks.map((w) => bucketTick(w.key, bucket, n));
    const labels = pickLabels(u, texts).map((i) => [i, texts[i]] as [number, string]);
    drawXLabels(u, labels, n, css('--muted'));
  }

  let container: HTMLDivElement;
  let chart: uPlot | null = null;
  let selected = $state<number | null>(null);
  let themeVersion = $state(0);
  const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  function draw(u: uPlot) {
    const ctx = u.ctx;
    const n = weeks.length;
    const slot = u.bbox.width / n;
    const w = Math.min(26 * devicePixelRatio, slot * 0.6);
    const y0 = u.valToPos(0, 'y', true);
    ctx.save();
    weeks.forEach((b, i) => {
      const x = u.valToPos(i, 'x', true) - w / 2;
      if (b.beforeStart) {
        ctx.fillStyle = css('--chart-dim');
        ctx.fillRect(u.bbox.left + slot * i + 1, u.bbox.top, slot - 2, u.bbox.height);
        return;
      }
      const yAc = u.valToPos(b.ac, 'y', true);
      const yAll = u.valToPos(b.ac + b.dc, 'y', true);
      ctx.globalAlpha = selected === null || selected === i ? 1 : 0.55;
      ctx.fillStyle = css('--accent');
      ctx.globalAlpha *= 0.45;
      ctx.fillRect(x, yAc, w, y0 - yAc); // AC: lighter red
      ctx.globalAlpha = selected === null || selected === i ? 1 : 0.55;
      ctx.fillRect(x, yAll, w, yAc - yAll); // DC: full red
      if (b.ac + b.dc === 0) {
        ctx.fillStyle = css('--muted');
        ctx.fillRect(x, y0 - 2 * devicePixelRatio, w, 2 * devicePixelRatio);
      }
    });
    ctx.restore();
  }

  function options(width: number): uPlot.Options {
    const muted = css('--muted');
    const font = '11px Inter, system-ui, sans-serif';
    const n = weeks.length;
    return {
      width,
      height,
      padding: [8, 12, 0, 0],
      legend: { show: false },
      cursor: { x: false, y: false, points: { show: false }, drag: { x: false, y: false } },
      scales: { x: { time: false, range: () => [-0.5, n - 0.5] }, y: { range: (_u, _a, max) => [0, Math.max(10, (max ?? 0) * 1.15)] } },
      axes: [
        {
          stroke: muted, font, size: 26, grid: { show: false }, ticks: { show: false },
          // Labels are drawn in drawLabels(), so the outer ones can be aligned inside the chart.
          splits: () => [],
          values: () => [],
        },
        { stroke: muted, font, size: 40, grid: { stroke: css('--line'), width: 1 }, ticks: { show: false } },
      ],
      series: [{}, { stroke: 'transparent', width: 0, points: { show: false } }],
      hooks: {
        draw: [draw, drawLabels],
        setCursor: [(u) => { const i = u.cursor.idx ?? null; if (i !== selected) { selected = i; u.redraw(false); } }],
      },
    };
  }

  $effect(() => {
    void themeVersion;
    const data: uPlot.AlignedData = [weeks.map((_, i) => i), weeks.map((w) => w.ac + w.dc)];
    chart = new uPlot(options(container.clientWidth), data, container);
    return () => { chart?.destroy(); chart = null; };
  });

  onMount(() => {
    const ro = new ResizeObserver(() => chart?.setSize({ width: container.clientWidth, height }));
    ro.observe(container);
    const onTheme = () => themeVersion++;
    window.addEventListener(THEME_EVENT, onTheme);
    return () => { ro.disconnect(); window.removeEventListener(THEME_EVENT, onTheme); };
  });

  const shown = $derived(selected === null ? null : weeks[selected]);
  const total = $derived(weeks.reduce((t, b) => ({ ac: t.ac + b.ac, dc: t.dc + b.dc }), { ac: 0, dc: 0 }));
</script>

<div class="readout" aria-live="polite">
  {#if shown}
    <span class="pixel">{shown.beforeStart ? '–' : km(shown.ac + shown.dc)}<span class="unit">kWh</span></span>
    <span class="muted small">{periodLabel(shown.key, true)}{shown.beforeStart ? '' : ` · AC ${num1(shown.ac)} · DC ${num1(shown.dc)}`}</span>
  {:else}
    <span class="pixel">{km(total.ac + total.dc)}<span class="unit">kWh</span></span>
    <span class="muted small" title={title}>totaal · AC {num1(total.ac)} · DC {num1(total.dc)}</span>
  {/if}
</div>
<div class="chart" bind:this={container} role="img" aria-label="Geladen kWh per {bucket === 'day' ? 'dag' : 'maand'}, AC en DC"></div>
<p class="legend muted small"><span class="sw ac"></span>AC <span class="sw dc"></span>DC</p>

<style>
  .readout { display: flex; align-items: baseline; gap: 10px; min-height: 2rem; flex-wrap: wrap; }
  .pixel { font-family: var(--font-pixel); font-size: 1.8rem; line-height: 1; }
  .unit { font-size: 1rem; color: var(--muted); margin-left: 4px; }
  .chart { width: 100%; touch-action: pan-y; }
  .legend { display: flex; align-items: center; gap: 6px; margin: 6px 0 0; }
  .sw { display: inline-block; width: 12px; height: 10px; }
  .sw.ac { background: var(--accent); opacity: 0.45; }
  .sw.dc { background: var(--accent); margin-left: 10px; }
</style>
