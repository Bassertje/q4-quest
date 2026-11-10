<script lang="ts">
  import { onMount, untrack } from 'svelte';

  let { value }: { value: number } = $props();

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
    // Count up from the last value seen on this device, or a short way below.
    const lastSeen = readLastSeen();
    const target = Math.round(value);
    const from = lastSeen !== null && lastSeen < target ? Math.max(lastSeen, target - 5000) : target - Math.min(target, 150);
    started = true;
    animate(from, target);
    saveLastSeen(target);
    return () => cancelAnimationFrame(frame);
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
  /* Subtle scanlines, only on the odometer. */
  .lcd::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(to bottom, var(--lcd-scanline) 0 1px, transparent 1px 3px);
    pointer-events: none;
  }
</style>
