<script lang="ts">
  /**
   * Small pixel lamps around the edge of the LCD (dark mode, festive mode only),
   * blinking slowly in red, white and warm gold. CSS only; hidden unless
   * html.festive (see app.css).
   */
  const PER_SIDE = 9;
  const COLORS = ['#E30613', '#FFFFFF', '#F2B33D'];
  const lamps = [
    ...Array.from({ length: PER_SIDE }, (_, i) => ({ side: 'top', pos: ((i + 0.5) / PER_SIDE) * 100 })),
    ...Array.from({ length: PER_SIDE }, (_, i) => ({ side: 'bottom', pos: ((i + 0.5) / PER_SIDE) * 100 })),
  ].map((l, i) => ({ ...l, color: COLORS[i % COLORS.length], delay: -((i * 0.7) % 3.2) }));
</script>

<div class="festive-lights" aria-hidden="true">
  {#each lamps as l, i (i)}
    <i class={l.side} style:left="{l.pos}%" style:background={l.color} style:color={l.color} style:animation-delay="{l.delay}s"></i>
  {/each}
</div>
