<script lang="ts">
  /**
   * One statistics tile: label (with an optional ⓘ), value in the pixel font with
   * a small unit, and one muted line. Place tiles inside `.stat-tiles` (app.css).
   * A value or line that does not fit gets a smaller font instead of wrapping.
   */
  let {
    label,
    value,
    unit = '',
    sub,
    info,
    inset = false,
  }: {
    label: string;
    /** Null shows "–". */
    value: string | null;
    unit?: string;
    sub: string;
    info?: { open: boolean; toggle: () => void; aria: string };
    /** Tinted tile inside another card (no panel border). */
    inset?: boolean;
  } = $props();

  /** Shrink the font of a node until its content fits its width. */
  function fit(node: HTMLElement, _watch: unknown) {
    const run = () => {
      node.style.fontSize = '';
      const width = node.clientWidth;
      const needed = node.scrollWidth;
      if (width > 0 && needed > width + 0.5) {
        node.style.fontSize = `${(parseFloat(getComputedStyle(node).fontSize) * width) / needed}px`;
      }
    };
    const ro = new ResizeObserver(run);
    ro.observe(node);
    void document.fonts?.ready.then(run);
    run();
    return { update: run, destroy: () => ro.disconnect() };
  }
</script>

<div class="panel stat-tile" class:inset>
  <div class="st-label">
    <span>{label}</span>
    {#if info}
      <button class="st-info" aria-label={info.aria} aria-expanded={info.open} onclick={info.toggle}>ⓘ</button>
    {/if}
  </div>
  {#if value === null}
    <div class="st-value muted">–</div>
  {:else}
    <div class="st-value" use:fit={`${value}${unit}`}>{value}{#if unit}<span class="st-unit">{unit}</span>{/if}</div>
  {/if}
  <div class="st-sub" use:fit={sub}>{sub}</div>
</div>
