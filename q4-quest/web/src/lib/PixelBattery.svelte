<script lang="ts">
  /** Small pixel battery: filled to the end %, the charged part red and the start part muted. */
  let { from, to }: { from: number | null; to: number | null } = $props();
  const CELLS = 10;
  const startCells = $derived(Math.round(Math.max(0, Math.min(100, from ?? 0)) / 10));
  const endCells = $derived(Math.round(Math.max(0, Math.min(100, to ?? 0)) / 10));
</script>

<svg width="26" height="12" viewBox="0 0 26 12" shape-rendering="crispEdges" aria-hidden="true">
  <rect x="0" y="0" width="24" height="12" fill="var(--text)" />
  <rect x="1" y="1" width="22" height="10" fill="var(--panel)" />
  <rect x="24" y="3" width="2" height="6" fill="var(--text)" />
  {#each Array(CELLS) as _, i (i)}
    {#if i < endCells}
      <rect x={2 + i * 2} y="2" width="2" height="8" fill={i < startCells ? 'var(--muted)' : 'var(--accent)'} />
    {/if}
  {/each}
</svg>

<style>
  svg {
    display: inline-block;
    vertical-align: -1px;
    image-rendering: pixelated;
  }
</style>
