<script lang="ts">
  let { fraction, label }: { fraction: number; label: string } = $props();
  const width = $derived(`${Math.max(0, Math.min(1, fraction)) * 100}%`);
</script>

<div
  class="bar"
  role="progressbar"
  aria-label={label}
  aria-valuemin="0"
  aria-valuemax="100"
  aria-valuenow={Math.round(fraction * 100)}
>
  <div class="fill" style:width></div>
</div>

<style>
  .bar {
    height: 10px;
    background: #0d0e11;
    border: 1px solid var(--line);
    border-radius: 2px;
    overflow: hidden;
  }
  .fill {
    height: 100%;
    background: repeating-linear-gradient(90deg, var(--accent) 0 6px, #b8050f 6px 8px);
    box-shadow: 0 0 10px rgba(227, 6, 19, 0.5);
    transition: width 0.8s ease-out;
  }
</style>
