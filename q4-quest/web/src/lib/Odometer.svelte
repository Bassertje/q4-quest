<script lang="ts">
  import { onMount, untrack } from 'svelte';

  import { ago, agoShort } from './format';

  let { value, updatedTs = null }: { value: number; updatedTs?: number | null } = $props();

  /** Older than this, the "updated" label becomes more prominent. */
  const STALE_MS = 6 * 3_600_000;
  let now = $state(Date.now());
  let showTip = $state(false);
  const stale = $derived(updatedTs !== null && now - updatedTs > STALE_MS);

  const DIGITS = 6;
  const DURATION_MS = 1400;
  const STORAGE_KEY = 'q4quest.lastOdometer';

  let shown = $state(0);
  let started = false;
  let frame = 0;

  function readLastSeen(): number | null {
    try {
      const v = Number(localStorage.getItem(STORAGE_KEY));
      return Number.isFinite(v) && v > 0 ? v : null;
    } catch {
      return null;
    }
  }

  function saveLastSeen(v: number) {
    try {
      localStorage.setItem(STORAGE_KEY, String(v));
    } catch {
      // Storage unavailable; the count-up simply starts from a fixed offset.
    }
  }

  function animate(from: number, to: number) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || from >= to) {
      shown = to;
      return;
    }
    cancelAnimationFrame(frame);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      shown = Math.round(from + (to - from) * eased);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  onMount(() => {
    // Refresh the relative time once a minute (display only, no data polling).
    const clock = setInterval(() => (now = Date.now()), 60_000);
    // Count up from the last value seen on this device, or a short way below.
    const lastSeen = readLastSeen();
    const target = Math.round(value);
    const from = lastSeen !== null && lastSeen < target ? Math.max(lastSeen, target - 5000) : target - Math.min(target, 150);
    started = true;
    animate(from, target);
    saveLastSeen(target);
    return () => {
      cancelAnimationFrame(frame);
      clearInterval(clock);
    };
  });

  // Later live updates count up from what is currently shown.
  // Only `value` is tracked here; `shown` is read untracked to avoid a loop.
  $effect(() => {
    const target = Math.round(value);
    untrack(() => {
      if (!started || target === shown) return;
      animate(shown, target);
      saveLastSeen(target);
    });
  });

  const digits = $derived(String(Math.max(0, shown)).padStart(DIGITS, '0'));
  const leading = $derived(digits.length - String(Math.max(0, shown)).length);
</script>

<div class="lcd" aria-label={`Kilometerstand ${Math.round(value)} km`} role="img">
  <span class="stack" aria-hidden="true">
    <span class="ghost">{'8'.repeat(digits.length)}</span>
    <span class="digits">{#each digits.split('') as d, i}<span class:dim={i < leading}>{d}</span>{/each}</span>
  </span>
  <span class="unit" aria-hidden="true">km</span>
  {#if updatedTs !== null}
    <button
      class="updated"
      class:stale
      aria-label="Bijgewerkt {ago(updatedTs, now)}"
      title="Bijgewerkt {ago(updatedTs, now)}"
      onclick={() => (showTip = !showTip)}
      onblur={() => (showTip = false)}
    >↻ {agoShort(updatedTs, now)}</button>
    {#if showTip}<span class="tip" role="status">Bijgewerkt {ago(updatedTs, now)}</span>{/if}
  {/if}
</div>

<style>
  .lcd {
    position: relative;
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 8px;
    padding: 14px 12px 10px;
    background: var(--lcd-bg);
    border: 1px solid var(--lcd-line);
    box-shadow: var(--lcd-shadow);
    border-radius: 8px;
    overflow: hidden;
    font-family: var(--font-pixel);
    line-height: 1;
  }
  .digits,
  .ghost {
    font-size: clamp(3.4rem, 17vw, 5.5rem);
    letter-spacing: 0.06em;
    font-variant-numeric: tabular-nums;
  }
  .digits {
    position: relative;
    color: var(--lcd-digit);
    text-shadow: 0 0 12px var(--lcd-glow);
  }
  .stack {
    display: grid;
  }
  .stack > span {
    grid-area: 1 / 1;
  }
  .ghost {
    color: var(--lcd-ghost);
  }
  .dim {
    color: var(--lcd-dim);
    text-shadow: none;
  }
  .unit {
    position: relative;
    font-size: 1.6rem;
    color: var(--lcd-muted);
  }
  /* Small "updated" label in the bottom-right corner of the LCD. */
  .updated {
    position: absolute;
    right: 8px;
    bottom: 4px;
    z-index: 1;
    padding: 0;
    border: 0;
    background: none;
    font-family: var(--font-pixel);
    font-size: 0.56rem; /* ~35% of the "km" unit */
    line-height: 1;
    letter-spacing: 0.05em;
    color: var(--lcd-digit);
    opacity: 0.35;
    cursor: pointer;
  }
  .updated.stale {
    opacity: 0.7;
  }
  .updated:hover,
  .updated:focus-visible {
    box-shadow: none;
    outline: none;
    opacity: 0.9;
  }
  .tip {
    position: absolute;
    right: 6px;
    bottom: 18px;
    z-index: 2;
    padding: 3px 8px;
    font-family: var(--font-sans);
    font-size: 0.75rem;
    white-space: nowrap;
    color: var(--text);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
  }
  /* Subtle scanlines, only on the odometer. */
  .lcd::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(to bottom, var(--lcd-scanline) 0 1px, transparent 1px 3px);
    pointer-events: none;
  }
</style>
