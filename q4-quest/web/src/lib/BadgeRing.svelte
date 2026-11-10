<script lang="ts">
  import PixelIcon from './PixelIcon.svelte';

  /** A pixel-style progress ring (square blocks on a circle) around a badge icon. */
  let { icon, fraction, size = 84 }: { icon: string; fraction: number; size?: number } = $props();

  const BLOCKS = 32;
  const lit = $derived(Math.round(Math.max(0, Math.min(1, fraction)) * BLOCKS));
  // Blocks on a circle in a 100×100 box, starting at the top, clockwise.
  const blocks = Array.from({ length: BLOCKS }, (_, i) => {
    const a = (i / BLOCKS) * Math.PI * 2 - Math.PI / 2;
    return { x: 50 + Math.cos(a) * 43, y: 50 + Math.sin(a) * 43 };
  });
</script>

<span class="ring" style:width="{size}px" style:height="{size}px">
  <svg viewBox="0 0 100 100" aria-hidden="true" shape-rendering="crispEdges">
    {#each blocks as b, i (i)}
      <rect x={b.x - 4} y={b.y - 4} width="8" height="8" class:on={i < lit} />
    {/each}
  </svg>
  <span class="icon"><PixelIcon {icon} size={Math.round(size * 0.48)} /></span>
</span>

<style>
  .ring {
    position: relative;
    display: inline-grid;
    place-items: center;
    flex: none;
  }
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  rect {
    fill: var(--line);
  }
  rect.on {
    fill: var(--accent);
  }
  .icon {
    position: relative;
  }
</style>
