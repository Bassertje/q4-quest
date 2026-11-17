<script lang="ts">
  /**
   * Subtle pixel snow (light mode, festive mode only): a handful of small
   * squares drifting down. CSS only; hidden unless html.festive (see app.css).
   */
  let { count = 12 }: { count?: number } = $props();
  // Deterministic spread, so the flakes do not jump between renders.
  const flakes = $derived(
    Array.from({ length: count }, (_, i) => ({
      left: (i * 37 + 11) % 100,
      size: i % 3 === 0 ? 3 : 2,
      duration: 9 + ((i * 7) % 6),
      delay: -((i * 13) % 12),
      grey: i % 2 === 0,
    })),
  );
</script>

<div class="festive-snow" aria-hidden="true">
  {#each flakes as f, i (i)}
    <i
      class:grey={f.grey}
      style:left="{f.left}%"
      style:width="{f.size}px"
      style:height="{f.size}px"
      style:animation-duration="{f.duration}s"
      style:animation-delay="{f.delay}s"
    ></i>
  {/each}
</div>
