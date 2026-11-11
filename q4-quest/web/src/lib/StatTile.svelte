<script lang="ts">
  /**
   * One statistics tile: label (with an optional ⓘ), value in the pixel font with
   * a small unit, and one muted line. Place tiles inside `.stat-tiles` (app.css).
   */
  let {
    label,
    value,
    unit = '',
    sub,
    info,
  }: {
    label: string;
    /** Null shows "–". */
    value: string | null;
    unit?: string;
    sub: string;
    info?: { open: boolean; toggle: () => void; aria: string };
  } = $props();
</script>

<div class="panel stat-tile">
  <div class="st-label">
    <span>{label}</span>
    {#if info}
      <button class="st-info" aria-label={info.aria} aria-expanded={info.open} onclick={info.toggle}>ⓘ</button>
    {/if}
  </div>
  {#if value === null}
    <div class="st-value muted">–</div>
  {:else}
    <div class="st-value">{value}{#if unit}<span class="st-unit">{unit}</span>{/if}</div>
  {/if}
  <div class="st-sub">{sub}</div>
</div>
