<script lang="ts">
  import { postJson } from './api';
  import PixelIcon from './PixelIcon.svelte';
  import type { RevealItem } from './types';

  let { items, timeZone, ondone }: { items: RevealItem[]; timeZone?: string; ondone: () => void } = $props();

  /** After this many items one by one, a "show all" button appears. */
  const ONE_BY_ONE = 3;

  let index = $state(0);
  let showAll = $state(false);
  let busy = $state(false);

  const TITLES: Record<RevealItem['kind'], string> = {
    badge: 'Badge ontgrendeld',
    milestone: 'Mijlpaal bereikt',
    level: 'Level omhoog',
    record: 'Nieuw record',
  };

  const current = $derived(items[index]);
  const remaining = $derived(items.length - index - 1);
  const canShowAll = $derived(index >= ONE_BY_ONE - 1 && remaining > 0);

  // Pixel burst: squares flying outward in a ring.
  const burst = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2;
    const dist = 70 + (i % 3) * 18;
    return { dx: Math.round(Math.cos(angle) * dist), dy: Math.round(Math.sin(angle) * dist), size: 6 + (i % 2) * 4 };
  });

  const date = (ts: number) =>
    new Date(ts).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone });

  async function markSeen(list: RevealItem[]) {
    const keys = list.flatMap((i) => i.keys);
    if (keys.length) await postJson('seen', { keys }).catch(() => {});
  }

  async function next() {
    if (busy) return;
    busy = true;
    await markSeen([current]);
    busy = false;
    if (index < items.length - 1) index++;
    else ondone();
  }

  function openAll() {
    showAll = true;
  }

  async function finish() {
    busy = true;
    await markSeen(items.slice(index));
    busy = false;
    ondone();
  }
</script>

<div class="overlay" role="dialog" aria-modal="true" aria-label="Nieuw ontgrendeld">
  {#if !showAll && current}
    <div class="stage">
      <p class="count muted small">{index + 1} / {items.length}</p>
      {#key index}
        <div class="burst" aria-hidden="true">
          {#each burst as b, i (i)}
            <span style:--dx="{b.dx}px" style:--dy="{b.dy}px" style:--s="{b.size}px"></span>
          {/each}
        </div>
        <div class="card">
          <p class="kind">{TITLES[current.kind]}</p>
          <div class="icon"><PixelIcon icon={current.icon} size={112} label={current.name} /></div>
          <h2>{current.name}</h2>
          <p class="desc">{current.description}</p>
          <p class="muted small">{date(current.ts)}</p>
          {#if current.xp > 0}<p class="xp">+{current.xp.toLocaleString('nl-NL')} XP</p>{/if}
        </div>
      {/key}
      <div class="actions">
        {#if canShowAll}
          <button onclick={openAll}>Toon alles ({remaining})</button>
        {/if}
        <button class="primary" onclick={next} disabled={busy}>{remaining > 0 ? 'Verder' : 'Klaar'}</button>
      </div>
    </div>
  {:else}
    <div class="all">
      <h2>Nieuw ontgrendeld</h2>
      <ul>
        {#each items.slice(index) as item (item.keys[0])}
          <li>
            <PixelIcon icon={item.icon} size={40} />
            <span class="text">
              <span class="muted small">{TITLES[item.kind]}</span>
              <strong>{item.name}</strong>
              <span class="muted small">{item.description}</span>
            </span>
            {#if item.xp > 0}<span class="xp small-xp">+{item.xp.toLocaleString('nl-NL')}</span>{/if}
          </li>
        {/each}
      </ul>
      <div class="actions">
        <button class="primary" onclick={finish} disabled={busy}>Klaar</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
    padding: 16px;
    background: var(--bg);
    overflow-y: auto;
  }
  /* Subtle scanlines on the reveal screen. */
  .overlay::before {
    content: '';
    position: fixed;
    inset: 0;
    pointer-events: none;
    background: repeating-linear-gradient(to bottom, var(--chart-dim) 0 1px, transparent 1px 3px);
  }
  .stage,
  .all {
    position: relative;
    /* Centred, but scrolls safely when taller than the screen. */
    margin: auto;
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }
  .count {
    margin: 0 0 8px;
  }
  .card {
    position: relative;
    width: 100%;
    padding: 24px 16px;
    background: var(--panel);
    border: 1px solid var(--accent);
    border-radius: 14px;
    box-shadow: var(--glow);
    animation: pop 0.45s steps(6, end);
  }
  .kind {
    margin: 0 0 12px;
    font-family: var(--font-pixel);
    font-size: 1.5rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent);
    text-shadow: var(--accent-text-glow);
  }
  .icon {
    display: grid;
    place-items: center;
    margin-bottom: 12px;
  }
  h2 {
    margin: 0 0 4px;
    font-family: var(--font-pixel);
    font-weight: 400;
    font-size: 2.1rem;
    line-height: 1.05;
  }
  .desc {
    margin: 0 0 6px;
  }
  .xp {
    margin: 8px 0 0;
    font-family: var(--font-pixel);
    font-size: 1.8rem;
    line-height: 1;
    color: var(--accent);
  }
  .burst {
    position: absolute;
    left: 50%;
    top: 42%;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: 1;
  }
  .burst span {
    position: absolute;
    width: var(--s);
    height: var(--s);
    margin: calc(var(--s) / -2) 0 0 calc(var(--s) / -2);
    background: var(--accent);
    opacity: 0;
    animation: fly 0.7s steps(7, end) forwards;
  }
  .burst span:nth-child(3n) {
    background: var(--text);
  }
  @keyframes fly {
    0% {
      transform: translate(0, 0);
      opacity: 1;
    }
    100% {
      transform: translate(var(--dx), var(--dy));
      opacity: 0;
    }
  }
  @keyframes pop {
    0% {
      transform: scale(0.6);
      opacity: 0;
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
    margin-top: 18px;
  }
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    border-color: var(--accent);
    padding: 8px 22px;
  }
  .all h2 {
    margin-bottom: 12px;
  }
  .all ul {
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
    display: grid;
    gap: 8px;
    text-align: left;
  }
  .all li {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .small-xp {
    margin: 0;
    font-size: 1.3rem;
  }
</style>
