<script lang="ts">
  import { rangeTrend, usableCycles } from '../../../game/src/cycles.ts';
  import { km, num1 } from './format';
  import type { DriveCycle } from './types';

  /**
   * Estimated range on a full battery against the outdoor temperature: one
   * dot per cycle (enough battery used, temperature known), with a trend line
   * once there are at least 5 dots over 5 °C or more.
   */
  let { cycles }: { cycles: DriveCycle[] } = $props();

  const W = 320;
  const H = 180;
  const PAD = { left: 40, right: 10, top: 10, bottom: 26 };

  const points = $derived(usableCycles(cycles).filter((c) => !c.ongoing && c.avgTemp !== null) as (DriveCycle & { avgTemp: number; rangeKm: number })[]);
  const trend = $derived(rangeTrend(points));
  const xMin = $derived(Math.floor(Math.min(...points.map((p) => p.avgTemp)) / 5) * 5 - (points.length ? 0 : 5));
  const xMax = $derived(Math.max(xMin + 10, Math.ceil(Math.max(...points.map((p) => p.avgTemp)) / 5) * 5));
  const yMin = $derived(Math.floor((Math.min(...points.map((p) => p.rangeKm)) * 0.95) / 50) * 50);
  const yMax = $derived(Math.max(yMin + 100, Math.ceil((Math.max(...points.map((p) => p.rangeKm)) * 1.03) / 50) * 50));
  const x = (t: number) => PAD.left + ((t - xMin) / (xMax - xMin)) * (W - PAD.left - PAD.right);
  const y = (r: number) => PAD.top + (1 - (r - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
  const xTicks = $derived.by(() => {
    const step = xMax - xMin > 20 ? 10 : 5;
    const out: number[] = [];
    for (let t = Math.ceil(xMin / step) * step; t <= xMax; t += step) out.push(t);
    return out;
  });
  const yTicks = $derived.by(() => {
    const step = yMax - yMin > 200 ? 100 : 50;
    const out: number[] = [];
    for (let r = Math.ceil(yMin / step) * step; r <= yMax; r += step) out.push(r);
    return out;
  });
  const tempLabel = (t: number) => `${t < 0 ? '−' : ''}${Math.abs(t)}°`;
  /** "bij −5 °C ~ 420 km · bij 10 °C ~ 450 km": the trend at the coldest and warmest whole degree measured. */
  const summary = $derived.by(() => {
    if (!trend) return null;
    const lo = Math.round(Math.min(...points.map((p) => p.avgTemp)));
    const hi = Math.round(Math.max(...points.map((p) => p.avgTemp)));
    const fmt = (t: number) => `${t < 0 ? '−' : ''}${Math.abs(t)} °C`;
    return `bij ${fmt(lo)} ~ ${km(trend.at(lo))} km · bij ${fmt(hi)} ~ ${km(trend.at(hi))} km`;
  });
  let selected = $state<number | null>(null);
  const sel = $derived(selected === null ? null : points[selected]);
</script>

{#if points.length >= 2}
  <div class="wrap">
    <svg viewBox="0 0 {W} {H}" role="img" aria-label="Geschat bereik op een volle accu tegen de buitentemperatuur, {points.length} ladingen">
      {#each yTicks as r (r)}
        <line class="grid" x1={PAD.left} x2={W - PAD.right} y1={y(r)} y2={y(r)} />
        <text class="tick" x={PAD.left - 6} y={y(r) + 3} text-anchor="end">{km(r)}</text>
      {/each}
      {#each xTicks as t (t)}
        <text class="tick" x={x(t)} y={H - 8} text-anchor={t === xTicks[0] && x(t) - PAD.left < 10 ? 'start' : 'middle'}>{tempLabel(t)}</text>
      {/each}
      {#if trend}
        <line class="trend" x1={x(xMin)} y1={y(trend.intercept + trend.slope * xMin)} x2={x(xMax)} y2={y(trend.intercept + trend.slope * xMax)} />
      {/if}
      {#each points as p, i (p.start)}
        <rect
          class="dot"
          class:on={selected === i}
          x={x(p.avgTemp) - 3}
          y={y(p.rangeKm) - 3}
          width="6"
          height="6"
          role="button"
          tabindex="0"
          aria-label="{num1(p.avgTemp)} °C, {km(p.rangeKm)} km"
          onclick={() => (selected = selected === i ? null : i)}
          onkeydown={(e) => e.key === 'Enter' && (selected = selected === i ? null : i)}
        />
      {/each}
    </svg>
  </div>
  <p class="muted small caption">
    {#if sel}
      {num1(sel.avgTemp)} °C · geschat bereik {km(sel.rangeKm)} km · {km(sel.km)} km gereden
    {:else if summary}
      Trend: {summary}
    {:else}
      Geschat bereik op een volle accu per lading. De trendlijn verschijnt vanaf 5 ladingen over minstens 5 °C.
    {/if}
  </p>
{:else}
  <p class="muted small">Nog te weinig ladingen met een temperatuur om bereik en temperatuur te vergelijken.</p>
{/if}

<style>
  .wrap {
    width: 100%;
  }
  svg {
    display: block;
    width: 100%;
    height: auto;
    shape-rendering: crispEdges;
  }
  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }
  .tick {
    fill: var(--muted);
    font: 10px Inter, system-ui, sans-serif;
  }
  .trend {
    stroke: var(--text);
    stroke-width: 1.5;
    stroke-dasharray: 4 3;
    opacity: 0.6;
    shape-rendering: geometricPrecision;
  }
  .dot {
    fill: var(--accent);
    cursor: pointer;
  }
  .dot.on {
    fill: var(--text);
  }
  .caption {
    margin: 6px 0 0;
  }
</style>
