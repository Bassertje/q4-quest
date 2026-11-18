<script lang="ts">
  import BingoMini from './BingoMini.svelte';
  import { capitaliseFirst } from './format';
  import type { BingoData } from './types';

  /** Laadbingo tile on the charging page: mini card, "X / 99" and the line closest to a bingo. Opens the full card. */
  let { bingo }: { bingo: BingoData } = $props();
  const card = $derived(bingo.cards.at(-1)!);
  const sub = $derived(
    bingo.closest ? `Dichtstbij: ${bingo.closest.label}, nog ${bingo.closest.open}` : 'Kaart vol!',
  );
</script>

<a class="panel bingo-tile" href="#/laden/bingo" aria-label="Laadbingo: {card.stamps.length} van 99. {sub}. Open de kaart.">
  <BingoMini stamped={card.stamps.map((s) => s.n)} hot={bingo.mostFrequent?.n ?? null} size={68} />
  <span class="text">
    <span class="label">Laadbingo{card.index > 1 ? ` · kaart ${card.index}` : ''}<span class="chev" aria-hidden="true">›</span></span>
    <span class="value">{card.stamps.length}<span class="unit">/ 99</span></span>
    <span class="sub">{capitaliseFirst(sub)}</span>
  </span>
</a>

<style>
  .bingo-tile {
    display: flex;
    align-items: center;
    gap: 14px;
    color: inherit;
    text-decoration: none;
    min-width: 0;
  }
  .bingo-tile:hover,
  .bingo-tile:focus-visible {
    border-color: var(--accent);
    outline: none;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .text > * {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .label {
    color: var(--muted);
    font-size: 0.85rem;
  }
  .chev {
    margin-left: 4px;
    color: var(--accent);
  }
  .value {
    font-family: var(--font-pixel);
    font-size: 1.9rem;
    line-height: 1.1;
  }
  .unit {
    font-size: 0.55em;
    color: var(--muted);
    margin-left: 4px;
  }
  .sub {
    color: var(--muted);
    font-size: 0.8rem;
  }
</style>
