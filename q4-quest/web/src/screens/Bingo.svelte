<script lang="ts">
  import { getJson } from '../lib/api';
  import { capitaliseFirst, dayNoYear } from '../lib/format';
  import type { BingoData } from '../lib/types';

  /** The full Laadbingo card: 10×10 grid with stamps, counts, completed lines and earlier cards. */
  let { refresh, cardIndex = null }: { refresh: number; cardIndex?: number | null } = $props();

  let data = $state<BingoData | null>(null);
  let error = $state<string | null>(null);
  let selected = $state<number | null>(null);

  async function load() {
    try {
      data = await getJson<BingoData>('bingo');
      error = null;
    } catch (err) {
      error = (err as Error).message;
    }
  }

  $effect(() => {
    void refresh;
    load();
  });

  const card = $derived(data ? (data.cards.find((c) => c.index === cardIndex) ?? data.cards.at(-1)!) : null);
  const stampOf = $derived(new Map((card?.stamps ?? []).map((s) => [s.n, s.ts])));
  const latest = $derived(card?.stamps.at(-1)?.n ?? null);
  const cells = Array.from({ length: 100 }, (_, i) => i + 1);
  const lineById = $derived(new Map((data?.lines ?? []).map((l) => [l.id, l])));
  /** Grid position (in cells) of a number, for drawing the bingo lines. */
  const pos = (n: number) => ({ x: ((n - 1) % 10) + 0.5, y: Math.floor((n - 1) / 10) + 0.5 });

  function info(n: number): string {
    if (!data || !card) return '';
    if (n === 100) return '★ Gratis vakje: altijd afgestreept';
    const count = data.counts[n] ?? 0;
    const ts = stampOf.get(n);
    const times = `${count}× gestart`;
    if (ts === undefined) return `${n}% · ${times} · nog niet op deze kaart`;
    return `${n}% · ${times} · eerste keer ${dayNoYear(ts, data.timeZone)}`;
  }
</script>

<div class="top">
  <a class="back" href="#/laden" aria-label="Terug naar Laden">‹ Laden</a>
  <h2 class="title">Laadbingo</h2>
</div>

{#if error && !data}
  <section class="panel">
    <p>De kaart kon niet worden geladen ({error}).</p>
    <button onclick={load}>Opnieuw</button>
  </section>
{:else if !data || !card}
  <p class="muted">Laden…</p>
{:else if !data.available}
  <section class="panel">
    <p class="muted">Laadbingo heeft een laadsensor én een accupercentage-sensor nodig.</p>
  </section>
{:else}
  <section class="panel">
    <p class="muted small intro">
      Elke laadsessie stempelt het afgeronde accupercentage waarop hij begon. Een volle rij, kolom of diagonaal is
      150 XP; een volle kaart 1.000 XP.
    </p>
    <div class="board">
      <div class="grid" role="grid" aria-label="Kaart {card.index}">
        {#each cells as n (n)}
          {@const stamped = n === 100 || stampOf.has(n)}
          {@const count = n === 100 ? 0 : (data.counts[n] ?? 0)}
          <button
            class="cell"
            class:stamped
            class:star={n === 100}
            class:latest={n === latest}
            class:sel={selected === n}
            role="gridcell"
            aria-label={info(n)}
            onclick={() => (selected = selected === n ? null : n)}
          >
            <span class="num">{n === 100 ? '★' : n}</span>
            {#if count >= 2}<span class="times">×{count}</span>{/if}
          </button>
        {/each}
      </div>
      <!-- Completed lines: a red line through the grid. -->
      <svg class="lines" viewBox="0 0 10 10" preserveAspectRatio="none" aria-hidden="true">
        {#each card.lines as l (l.lineId)}
          {@const line = lineById.get(l.lineId)}
          {#if line}
            {@const a = pos(line.cells[0])}
            {@const b = pos(line.cells[line.cells.length - 1])}
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          {/if}
        {/each}
      </svg>
    </div>
    <p class="cell-info" role="status">{selected !== null ? info(selected) : 'Tik op een vakje voor details.'}</p>
  </section>

  <section class="panel summary">
    <div>
      <span class="label">Bingo's op deze kaart</span>
      <span class="value">{card.lines.length}</span>
    </div>
    <div>
      <span class="label">Meest gestart</span>
      <span class="value">{data.mostFrequent ? `${data.mostFrequent.n}%` : '–'}{#if data.mostFrequent}<span class="unit">{data.mostFrequent.count}×</span>{/if}</span>
    </div>
    <div class="cards">
      <span class="label">Kaart {card.index}{card.completedTs ? ' · vol' : ''}</span>
      {#if data.cards.length > 1}
        <div class="segmented small-seg" role="group" aria-label="Kies een kaart">
          {#each data.cards as c (c.index)}
            <a class="seg" class:active={c.index === card.index} aria-current={c.index === card.index ? 'true' : undefined} href="#/laden/bingo/{c.index}">{c.index}</a>
          {/each}
        </div>
      {:else}
        <span class="muted small">{data.closest ? capitaliseFirst(`${data.closest.label}: nog ${data.closest.open}`) : ''}</span>
      {/if}
    </div>
  </section>
{/if}

<style>
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .back {
    color: var(--muted);
    text-decoration: none;
    padding: 6px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    white-space: nowrap;
  }
  .back:hover,
  .back:focus-visible {
    color: var(--text);
    border-color: var(--accent);
    outline: none;
  }
  .title {
    font-size: 2rem;
    margin: 0;
  }
  .intro {
    margin: 0 0 12px;
  }
  .board {
    position: relative;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(10, minmax(0, 1fr));
    gap: 2px;
  }
  .cell {
    position: relative;
    aspect-ratio: 1;
    display: grid;
    place-items: center;
    min-width: 0;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 3px;
    background: var(--panel);
    color: var(--text);
    box-shadow: none;
    cursor: pointer;
  }
  .num {
    position: relative;
    z-index: 1;
    font-family: var(--font-pixel);
    font-size: clamp(0.8rem, 3.6vw, 1.15rem);
    line-height: 1;
  }
  /* The pixel stamp: a blocky red disc under the number. */
  .cell.stamped::before {
    content: '';
    position: absolute;
    inset: 12%;
    background: var(--accent);
    clip-path: polygon(30% 0, 70% 0, 70% 10%, 90% 10%, 90% 30%, 100% 30%, 100% 70%, 90% 70%, 90% 90%, 70% 90%, 70% 100%, 30% 100%, 30% 90%, 10% 90%, 10% 70%, 0 70%, 0 30%, 10% 30%, 10% 10%, 30% 10%);
    opacity: 0.9;
  }
  .cell.stamped .num {
    color: #ffffff;
  }
  .cell.star::before {
    background: #f2b33d;
  }
  .cell.star .num {
    color: #3a2a00;
  }
  /* The most recent stamp lights up briefly. */
  .cell.latest::before {
    animation: stamp-glow 0.9s steps(4, end) 2;
  }
  @keyframes stamp-glow {
    0% {
      transform: scale(1.35);
      filter: brightness(1.6);
    }
    100% {
      transform: scale(1);
      filter: none;
    }
  }
  .cell.sel {
    border-color: var(--accent);
    box-shadow: var(--glow);
  }
  .times {
    position: absolute;
    right: 1px;
    bottom: 0;
    z-index: 1;
    font-size: clamp(0.45rem, 1.9vw, 0.6rem);
    line-height: 1;
    color: var(--muted);
  }
  .cell.stamped .times {
    color: rgba(255, 255, 255, 0.75);
  }
  .lines {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
  .lines line {
    stroke: var(--accent);
    stroke-width: 0.12;
    stroke-linecap: square;
    opacity: 0.85;
    filter: drop-shadow(0 0 0.15px var(--accent));
  }
  .cell-info {
    margin: 10px 0 0;
    min-height: 1.4em;
    color: var(--muted);
    font-size: 0.9rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .summary {
    display: grid;
    gap: 10px;
  }
  .summary > div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
  }
  .label {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .value {
    font-family: var(--font-pixel);
    font-size: 1.6rem;
    line-height: 1;
  }
  .unit {
    font-size: 0.55em;
    color: var(--muted);
    margin-left: 4px;
  }
  .cards {
    align-items: center !important;
  }
  .seg {
    padding: 3px 10px;
    color: inherit;
    text-decoration: none;
    font-size: 0.85rem;
  }
  .seg + .seg {
    border-left: 1px solid var(--line);
  }
  .seg.active {
    background: var(--accent);
    color: var(--on-accent);
  }
</style>
