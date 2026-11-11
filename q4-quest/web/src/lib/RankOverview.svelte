<script lang="ts">
  import { onMount } from 'svelte';
  import { rankList } from '../../../game/src/levels.ts';
  import { km } from './format';
  import PixelIcon from './PixelIcon.svelte';

  let {
    current,
    level,
    xp,
    bonusXp,
    onclose,
  }: { current: string; level: number; xp: number; bonusXp: number; onclose: () => void } = $props();

  const ranks = rankList();
  const currentIndex = $derived(ranks.findIndex((r) => r.title === current));

  onMount(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onclose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label="Rangen">
  <div class="head">
    <h2>Rangen</h2>
    <button class="close" aria-label="Sluiten" onclick={onclose}>✕</button>
  </div>
  <div class="xp-summary">
    <div class="xp-total">{km(xp)}<span class="xp-unit">XP</span></div>
    <div class="muted small nw">{km(xp - bonusXp)} uit kilometers · {km(bonusXp)} bonus</div>
  </div>
  <p class="muted small">Je bent level {level}. Elke 5 levels krijg je een nieuwe rang.</p>
  <ol>
    {#each ranks as r, i (r.title)}
      <li class:current={i === currentIndex} class:future={i > currentIndex}>
        <PixelIcon icon={r.icon} size={40} locked={i > currentIndex} />
        <span class="text">
          <strong>{r.title}</strong>
          <span class="muted small">
            Level {r.fromLevel}{r.toLevel === null ? '+' : `–${r.toLevel}`} · vanaf {km(r.xp)} XP
          </span>
        </span>
        {#if i === currentIndex}<span class="tag">nu</span>{/if}
      </li>
    {/each}
  </ol>
</div>

<style>
  .xp-summary {
    margin: 0 0 8px;
  }
  .xp-total {
    font-family: var(--font-pixel);
    font-size: 1.8rem;
    line-height: 1.1;
  }
  .xp-unit {
    font-size: 1rem;
    color: var(--muted);
    margin-left: 4px;
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: rgba(0, 0, 0, 0.5);
  }
  .sheet {
    position: fixed;
    z-index: 81;
    left: 50%;
    bottom: 0;
    transform: translateX(-50%);
    width: 100%;
    max-width: 520px;
    max-height: 90vh;
    overflow-y: auto;
    padding: 16px 16px calc(20px + env(safe-area-inset-bottom));
    background: var(--panel);
    border: 1px solid var(--line);
    border-bottom: 0;
    border-radius: 16px 16px 0 0;
  }
  @media (min-width: 768px) {
    .sheet {
      bottom: auto;
      top: 50%;
      transform: translate(-50%, -50%);
      border-bottom: 1px solid var(--line);
      border-radius: 16px;
    }
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h2 {
    margin: 0;
  }
  .close {
    width: 40px;
    height: 40px;
    padding: 0;
  }
  ol {
    list-style: none;
    margin: 12px 0 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }
  li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  li.current {
    border-color: var(--accent);
    box-shadow: var(--glow);
  }
  li.future {
    opacity: 0.55;
  }
  .text {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .tag {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--accent);
    color: var(--on-accent);
    padding: 2px 6px;
    border-radius: 4px;
  }
</style>
