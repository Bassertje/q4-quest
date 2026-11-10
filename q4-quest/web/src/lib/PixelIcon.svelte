<script lang="ts">
  import { ICONS, pixelRuns } from './icons';

  let {
    icon,
    size = 48,
    locked = false,
    label,
  }: { icon: string; size?: number; locked?: boolean; label?: string } = $props();

  const runs = $derived(pixelRuns(ICONS[icon] ?? ICONS.flag));
  const FILL = { '#': 'var(--accent)', '+': 'var(--text)', '-': 'var(--muted)' } as const;
</script>

<svg
  class:locked
  width={size}
  height={size}
  viewBox="0 0 16 16"
  shape-rendering="crispEdges"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
>
  {#each runs as r, i (i)}
    <rect x={r.x} y={r.y} width={r.w} height="1" fill={locked ? 'currentColor' : FILL[r.tone]} />
  {/each}
</svg>

<style>
  svg {
    display: block;
    image-rendering: pixelated;
    flex: none;
  }
  /* Locked: a flat silhouette. */
  svg.locked {
    color: var(--muted);
    opacity: 0.35;
  }
</style>
