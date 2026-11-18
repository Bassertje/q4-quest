<script lang="ts">
  /**
   * Mini Laadbingo card: a 10×10 pixel grid. Stamped squares in accent red,
   * open ones in the dimmed line colour, ★ (the 100th square) in gold and the
   * square with the highest all-time count in a brighter red.
   */
  let { stamped, hot = null, size = 64, label = 'Laadbingo-kaart' }: { stamped: number[]; hot?: number | null; size?: number; label?: string } = $props();
  const set = $derived(new Set(stamped));
  const cells = Array.from({ length: 100 }, (_, i) => i + 1);
</script>

<svg class="mini" viewBox="0 0 39 39" width={size} height={size} role="img" aria-label="{label}: {stamped.length} van 99 vakjes afgestempeld">
  {#each cells as n (n)}
    {@const x = ((n - 1) % 10) * 4}
    {@const y = Math.floor((n - 1) / 10) * 4}
    <rect {x} {y} width="3" height="3" class={n === 100 ? 'star' : n === hot && set.has(n) ? 'hot' : set.has(n) ? 'on' : 'off'} />
  {/each}
</svg>

<style>
  .mini {
    display: block;
    flex: none;
    shape-rendering: crispEdges;
  }
  .off {
    fill: var(--line);
  }
  .on {
    fill: var(--accent);
  }
  .hot {
    fill: color-mix(in srgb, var(--accent), #ffffff 35%);
  }
  .star {
    fill: #f2b33d;
  }
</style>
