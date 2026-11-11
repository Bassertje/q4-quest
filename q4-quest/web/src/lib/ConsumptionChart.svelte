<script lang="ts">
  import { onMount } from 'svelte';
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';
  import { num1, periodLabel } from './format';
  import { THEME_EVENT } from './theme';
  import type { MonthStats } from './types';

  /** Consumption per month as bars, average temperature as a line (optional). */
  let { months, showTemp, height = 200 }: { months: MonthStats[]; showTemp: boolean; height?: number } = $props();

  let container: HTMLDivElement;
  let chart: uPlot | null = null;
  let selected = $state<number | null>(null);
  let themeVersion = $state(0);

  const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function drawBars(u: uPlot) {
    const ctx = u.ctx;
    const n = months.length;
    const slot = u.bbox.width / Math.max(1, n);
    const w = Math.min(26 * devicePixelRatio, slot * 0.55);
    const y0 = u.valToPos(0, 'y', true);
    ctx.save();
    months.forEach((m, i) => {
      if (m.kwhPer100km === null) return;
      const x = u.valToPos(i, 'x', true);
      const y = u.valToPos(m.kwhPer100km, 'y', true);
      ctx.fillStyle = css('--accent');
      ctx.globalAlpha = selected === null || selected === i ? 1 : 0.55;
      ctx.fillRect(x - w / 2, y, w, y0 - y);
    });
    ctx.restore();
  }

  function options(width: number): uPlot.Options {
    const muted = css('--muted');
    const font = '11px Inter, system-ui, sans-serif';
    const n = months.length;
    const temps = months.map((m) => m.avgTemp).filter((t): t is number => t !== null);
    const tMin = Math.min(0, ...temps) - 2;
    const tMax = Math.max(10, ...temps) + 2;
    return {
      width,
      height,
      padding: [8, showTemp ? 4 : 12, 0, 0],
      legend: { show: false },
      cursor: { x: false, y: false, points: { show: false }, drag: { x: false, y: false } },
      scales: {
        x: { time: false, range: () => [-0.5, n - 0.5] },
        y: { range: (_u, _min, max) => [0, Math.max(10, (max ?? 0) * 1.15)] },
        temp: { range: () => [tMin, tMax] },
      },
      axes: [
        {
          stroke: muted,
          font,
          size: 26,
          grid: { show: false },
          ticks: { show: false },
          splits: () => months.map((_, i) => i),
          values: (_u, splits) => splits.map((i) => (months[i] ? periodLabel(months[i].month) : '')),
        },
        { stroke: muted, font, size: 36, grid: { stroke: css('--line'), width: 1 }, ticks: { show: false } },
        ...(showTemp
          ? [{ scale: 'temp', side: 1, stroke: muted, font, size: 36, grid: { show: false }, ticks: { show: false }, values: (_u: uPlot, s: number[]) => s.map((v) => `${v}°`) } as uPlot.Axis]
          : []),
      ],
      series: [
        {},
        { stroke: 'transparent', width: 0, points: { show: false } },
        ...(showTemp ? [{ scale: 'temp', stroke: css('--text'), width: 2, points: { show: true, size: 6, fill: css('--text') } } as uPlot.Series] : []),
      ],
      hooks: {
        draw: [drawBars],
        setCursor: [
          (u) => {
            const idx = u.cursor.idx ?? null;
            if (idx !== selected) {
              selected = idx;
              u.redraw(false);
            }
          },
        ],
      },
    };
  }

  $effect(() => {
    void themeVersion;
    const data: uPlot.AlignedData = [
      months.map((_, i) => i),
      months.map((m) => m.kwhPer100km),
      ...(showTemp ? [months.map((m) => m.avgTemp)] : []),
    ];
    chart = new uPlot(options(container.clientWidth), data, container);
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

  const shown = $derived(months[selected ?? months.length - 1]);
</script>

<div class="readout" aria-live="polite">
  {#if shown}
    <span class="pixel">{shown.kwhPer100km === null ? '–' : num1(shown.kwhPer100km)}<span class="unit">kWh/100 km</span></span>
    <span class="muted small">
      {periodLabel(shown.month, true)}{#if showTemp && shown.avgTemp !== null}{' · '}gem. {num1(shown.avgTemp)} °C{/if}
    </span>
  {/if}
</div>
<div class="chart" bind:this={container} role="img" aria-label="Verbruik per maand{showTemp ? ' met gemiddelde temperatuur' : ''}"></div>
<p class="muted small legend">
  <span class="item"><span class="sw bar"></span> verbruik (schatting)</span>{#if showTemp}<span class="item"><span class="sw line"></span> gem. temperatuur</span>{/if}
</p>

<style>
  /* Value and label never break; on a narrow screen the label moves below the value as a whole. */
  .readout {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 10px;
    min-height: 2rem;
  }
  .readout > * {
    white-space: nowrap;
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
  .legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
    margin: 6px 0 0;
  }
  .legend .item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .sw {
    display: inline-block;
    width: 12px;
    height: 10px;
    margin-left: 8px;
  }
  .sw.bar {
    background: var(--accent);
    margin-left: 0;
  }
  .sw.line {
    height: 2px;
    background: var(--text);
  }
</style>
