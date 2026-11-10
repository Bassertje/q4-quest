<script lang="ts">
  import { onMount } from 'svelte';
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';
  import { THEME_EVENT } from './theme';

  /** SoC over a time range with charging sessions as shaded bands (DC stronger than AC). */
  let {
    soc,
    sessions,
    from,
    to,
    timeZone,
    height = 170,
  }: {
    soc: [number, number][];
    from: number;
    to: number;
    sessions: { start: number; end: number; type: 'AC' | 'DC' }[];
    timeZone?: string;
    height?: number;
  } = $props();

  /** Charging bands: accent red at a fixed coverage, identical in the legend and in both themes. */
  const BAND_RED = '#E30613';
  const AC_ALPHA = 0.18;
  const DC_ALPHA = 0.35;

  let container: HTMLDivElement;
  let chart: uPlot | null = null;
  let themeVersion = $state(0);
  const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const short = $derived(to - from <= 86_400_000 + 60_000);
  const long = $derived(to - from > 8 * 86_400_000);
  const fmt = $derived(
    new Intl.DateTimeFormat(
      'nl-NL',
      short ? { hour: '2-digit', minute: '2-digit', timeZone } : long ? { day: 'numeric', month: 'short', timeZone } : { weekday: 'short', timeZone },
    ),
  );

  function bands(u: uPlot) {
    const ctx = u.ctx;
    ctx.save();
    ctx.fillStyle = BAND_RED;
    for (const s of sessions) {
      const x1 = u.valToPos(s.start / 1000, 'x', true);
      const x2 = u.valToPos(s.end / 1000, 'x', true);
      if (x2 < u.bbox.left || x1 > u.bbox.left + u.bbox.width) continue;
      ctx.globalAlpha = s.type === 'DC' ? DC_ALPHA : AC_ALPHA;
      const l = Math.max(x1, u.bbox.left);
      ctx.fillRect(l, u.bbox.top, Math.max(2, Math.min(x2, u.bbox.left + u.bbox.width) - l), u.bbox.height);
    }
    ctx.restore();
  }

  function options(width: number): uPlot.Options {
    const muted = css('--muted');
    const font = '11px Inter, system-ui, sans-serif';
    return {
      width,
      height,
      padding: [8, 12, 0, 0],
      legend: { show: false },
      cursor: { show: false },
      scales: { x: { time: true, range: () => [from / 1000, to / 1000] }, y: { range: () => [0, 100] } },
      axes: [
        { stroke: muted, font, size: 26, grid: { show: false }, ticks: { show: false }, space: long ? 56 : 40, values: (_u, sp) => sp.map((v) => fmt.format(v * 1000).replace('.', '')) },
        { stroke: muted, font, size: 36, grid: { stroke: css('--line'), width: 1 }, ticks: { show: false }, splits: () => [0, 25, 50, 75, 100], values: (_u, sp) => sp.map((v) => `${v}%`) },
      ],
      series: [{}, { stroke: css('--text'), width: 2, points: { show: false } }],
      hooks: { drawClear: [bands] },
    };
  }

  $effect(() => {
    void themeVersion;
    const data: uPlot.AlignedData = [soc.map(([t]) => t / 1000), soc.map(([, v]) => v)];
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
</script>

<div class="chart" bind:this={container} role="img" aria-label="Accupercentage met laadsessies"></div>
<p class="legend muted small" style:--band={BAND_RED} style:--ac-alpha={AC_ALPHA} style:--dc-alpha={DC_ALPHA}><span class="sw line"></span>accu <span class="sw ac"></span>AC-laden <span class="sw dc"></span>DC-laden</p>

<style>
  .chart { width: 100%; touch-action: pan-y; }
  .legend { display: flex; align-items: center; gap: 6px; margin: 6px 0 0; flex-wrap: wrap; }
  .sw { display: inline-block; width: 12px; height: 10px; margin-left: 8px; }
  .sw.line { height: 2px; background: var(--text); margin-left: 0; }
  .sw.ac { background: var(--band); opacity: var(--ac-alpha); }
  .sw.dc { background: var(--band); opacity: var(--dc-alpha); }
</style>
