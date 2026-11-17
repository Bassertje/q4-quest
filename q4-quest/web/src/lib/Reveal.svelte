<script lang="ts">
  import { onMount } from 'svelte';
  import { postJson } from './api';
  import PixelIcon from './PixelIcon.svelte';
  import type { RevealItem } from './types';

  let {
    items,
    timeZone,
    theme = null,
    ondone,
  }: { items: RevealItem[]; timeZone?: string; theme?: 'winter' | null; ondone: () => void } = $props();

  // Fireworks on 1 January: three bursts at different places, in red, gold and white.
  const FIREWORK_COLORS = ['#E30613', '#F2B33D', '#FFFFFF'];
  const fireworks = [
    { x: 22, y: 22, delay: 0 },
    { x: 76, y: 16, delay: 0.5 },
    { x: 50, y: 34, delay: 1 },
  ].map((f, n) => ({
    ...f,
    sparks: Array.from({ length: 12 }, (_, i) => {
      const angle = (i / 12) * Math.PI * 2;
      const dist = 46 + (i % 2) * 14;
      return { dx: Math.round(Math.cos(angle) * dist), dy: Math.round(Math.sin(angle) * dist), color: FIREWORK_COLORS[(i + n) % 3] };
    }),
  }));

  /** After this many items one by one, a "show all" button appears. */
  const ONE_BY_ONE = 3;

  let index = $state(0);
  let showAll = $state(false);
  let busy = $state(false);

  const TITLES: Record<RevealItem['kind'], string> = {
    week: 'Weekterugblik',
    challenge: 'Uitdaging gehaald',
    badge: 'Badge ontgrendeld',
    milestone: 'Bestemming bereikt',
    level: 'Level omhoog',
    rank: 'Nieuwe rang',
    record: 'Nieuw record',
    yearready: 'Jaaroverzicht',
    newyear: 'Nieuwjaar',
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

  function prev() {
    if (index > 0) index--;
  }

  // Swipe: left = next (like "Verder"), right = previous. The card follows the
  // finger a little; vertical movement is left to scrolling.
  const SWIPE_PX = 50;
  let drag = $state<{ x: number; y: number; id: number } | null>(null);
  let dx = $state(0);

  function onDown(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dx = 0;
  }

  function onMove(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const mx = e.clientX - drag.x;
    const my = e.clientY - drag.y;
    if (Math.abs(mx) > Math.abs(my)) dx = mx;
  }

  function onUp(e: PointerEvent) {
    if (!drag || e.pointerId !== drag.id) return;
    const mx = e.clientX - drag.x;
    const my = e.clientY - drag.y;
    drag = null;
    dx = 0;
    if (Math.abs(mx) < SWIPE_PX || Math.abs(mx) < Math.abs(my) * 1.5) return;
    if (mx < 0) void next();
    else prev();
  }

  function onCancel() {
    drag = null;
    dx = 0;
  }

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (showAll) return;
      if (e.key === 'ArrowRight') void next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /** Go to another screen (e.g. the year review) after marking this item as seen. */
  async function follow(href: string) {
    await markSeen([current]);
    ondone();
    location.hash = href;
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
  {#if !showAll && current?.kind === 'newyear'}
    {#key index}
      <!-- Fireworks over the whole screen (outside the swipe area, which is transformed). -->
      <div class="fireworks" aria-hidden="true">
        {#each fireworks as f, n (n)}
          <div class="firework" style:left="{f.x}%" style:top="{f.y}%" style:--delay="{f.delay}s">
            {#each f.sparks as sp, i (i)}
              <span style:--dx="{sp.dx}px" style:--dy="{sp.dy}px" style:background={sp.color}></span>
            {/each}
          </div>
        {/each}
      </div>
    {/key}
  {/if}
  {#if !showAll && current}
    <div class="stage">
      <p class="count muted small">{index + 1} / {items.length}{#if remaining > 0}{' '}· veeg voor de volgende{/if}</p>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="swipe"
        class:dragging={drag !== null}
        style:transform="translateX({dx * 0.6}px) rotate({dx * 0.02}deg)"
        onpointerdown={onDown}
        onpointermove={onMove}
        onpointerup={onUp}
        onpointercancel={onCancel}
      >
      {#key index}
        <div class="burst" class:snow={theme === 'winter'} aria-hidden="true">
          {#each burst as b, i (i)}
            <span style:--dx="{b.dx}px" style:--dy="{b.dy}px" style:--s="{b.size}px"></span>
          {/each}
        </div>
        <div class="card">
          <p class="kind">{TITLES[current.kind]}</p>
          <div class="icon"><PixelIcon icon={current.icon} size={112} label={current.name} /></div>
          <h2>{current.name}</h2>
          {#if current.stats}
            <div class="stats">
              {#each current.stats as st (st.label)}
                <div><span class="muted small">{st.label}</span><strong class="stat">{st.value}</strong></div>
              {/each}
            </div>
          {/if}
          <p class="desc">{current.description}</p>
          {#if current.kind !== 'week'}<p class="muted small">{date(current.ts)}</p>{/if}
          {#if current.xp > 0}<p class="xp">+{current.xp.toLocaleString('nl-NL')} XP</p>{/if}
        </div>
      {/key}
      </div>
      <div class="actions">
        {#if current.link}
          <button onclick={() => follow(current.link!.href)} disabled={busy}>{current.link.label}</button>
        {/if}
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
  /* Swipe area: horizontal drags are ours, vertical ones still scroll. */
  .swipe {
    position: relative;
    width: 100%;
    touch-action: pan-y;
    user-select: none;
    transition: transform 0.2s ease-out;
  }
  .swipe.dragging {
    transition: none;
    cursor: grabbing;
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
  .stats {
    display: flex;
    justify-content: center;
    gap: 28px;
    margin: 4px 0 10px;
  }
  .stats div {
    display: flex;
    flex-direction: column;
  }
  .stat {
    font-family: var(--font-pixel);
    font-weight: 400;
    font-size: 2rem;
    line-height: 1;
    color: var(--accent);
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
  /* Winterrit: the pixel burst becomes small pixel snowflakes (a plus of five pixels). */
  .burst.snow span,
  .burst.snow span:nth-child(3n) {
    --snow: color-mix(in srgb, var(--text) 30%, #cfe0f2);
    width: 2px;
    height: 2px;
    margin: -1px 0 0 -1px;
    background: var(--snow);
    box-shadow:
      2px 0 0 var(--snow),
      -2px 0 0 var(--snow),
      0 2px 0 var(--snow),
      0 -2px 0 var(--snow);
    animation-duration: 1.1s;
  }
  .fireworks {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 0;
  }
  .firework {
    position: absolute;
    width: 0;
    height: 0;
  }
  .firework span {
    position: absolute;
    width: 4px;
    height: 4px;
    margin: -2px 0 0 -2px;
    opacity: 0;
    animation: fly 1.2s steps(8, end) var(--delay) 3 both;
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
