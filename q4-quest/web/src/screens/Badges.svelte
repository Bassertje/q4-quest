<script lang="ts">
  import { getJson } from '../lib/api';
  import { date, km } from '../lib/format';
  import { putJson } from '../lib/api';
  import BadgeDetail from '../lib/BadgeDetail.svelte';
  import PixelIcon from '../lib/PixelIcon.svelte';
  import Setup from '../lib/Setup.svelte';
  import type { BadgesData, BadgeView } from '../lib/types';

  let { refresh }: { refresh: number } = $props();

  let data = $state<BadgesData | null>(null);
  let error = $state<string | null>(null);
  let selected = $state<BadgeView | null>(null);

  async function follow(id: string | null) {
    await putJson('settings', { followedBadge: id });
    await load();
    selected = null;
  }

  async function load() {
    try {
      data = await getJson<BadgesData>('badges');
      error = null;
    } catch (err) {
      error = (err as Error).message;
    }
  }

  $effect(() => {
    void refresh;
    load();
  });

  const count = (badges: { unlockedTs: number | null }[]) => badges.filter((b) => b.unlockedTs !== null).length;
</script>

<div class="head">
  <h2 class="title">Badges</h2>
  {#if data && !data.setupNeeded}
    <div class="counter">
      <span class="pixel">{data.unlocked} / {data.total}</span>
      <span class="muted small">+{km(data.bonusXp)} bonus-XP</span>
    </div>
  {/if}
</div>

{#if error && !data}
  <section class="panel">
    <p>De badges konden niet worden geladen ({error}).</p>
    <button onclick={load}>Opnieuw</button>
  </section>
{:else if !data}
  <p class="muted">Laden…</p>
{:else if data.setupNeeded}
  <Setup />
{:else}
  {#each data.categories as cat (cat.id)}
    <section class="panel">
      <div class="cat">
        <h3>{cat.name}</h3>
        <span class="muted small">{count(cat.badges)} / {cat.badges.length}</span>
      </div>
      <ul class="grid">
        {#each cat.badges as b (b.id)}
          {@const open = b.unlockedTs !== null}
          <li>
            <button
              class="card"
              class:open
              class:new={b.isNew}
              class:following={data.followedId === b.id}
              onclick={() => (selected = b)}
              aria-haspopup="dialog"
            >
            <PixelIcon icon={b.icon} size={44} locked={!open} />
            <span class="name">{open ? b.name : b.name ?? '???'}</span>
            {#if open}
              <span class="muted small">{date(b.unlockedTs!, data.timeZone)}</span>
              {#if b.xp > 0}<span class="xp">+{km(b.xp)} XP</span>{/if}
            {:else}
              <span class="muted small hint">{b.hint}</span>
              {#if b.progress}
                <span class="progress" role="progressbar" aria-label="Voortgang {b.name}" aria-valuemin="0" aria-valuemax={b.progress.target} aria-valuenow={b.progress.current}>
                  <span class="fill" style:width="{(b.progress.current / b.progress.target) * 100}%"></span>
                </span>
                <span class="count">{km(b.progress.current)} / {km(b.progress.target)} {b.progress.unit}</span>
              {/if}
            {/if}
            {#if b.isNew}<span class="tag">nieuw</span>{:else if data.followedId === b.id}<span class="tag follow-tag">volgt</span>{/if}
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
{/if}

{#if selected && data}
  <BadgeDetail
    badge={selected}
    timeZone={data.timeZone}
    followed={data.followedId === selected.id && !data.followedAuto}
    onfollow={follow}
    onclose={() => (selected = null)}
  />
{/if}

<style>
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }
  .title {
    font-size: 2rem;
  }
  @media (max-width: 419px) {
    .title {
      font-size: 1.7rem;
    }
  }
  .counter {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .pixel {
    font-family: var(--font-pixel);
    font-size: 1.8rem;
    line-height: 1;
    color: var(--accent);
  }
  .cat {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  h3 {
    font-size: 1rem;
    margin: 0 0 10px;
  }
  .grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  @media (min-width: 420px) {
    .grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }
  @media (min-width: 560px) {
    .grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }
  li {
    display: flex;
    min-width: 0;
  }
  .card {
    width: 100%;
    font: inherit;
    color: inherit;
    background: none;
    cursor: pointer;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 2px;
    padding: 10px 6px;
    border: 1px solid var(--line);
    border-radius: 10px;
    min-width: 0;
  }
  .card.following {
    border-color: var(--muted);
  }
  .card.new {
    border-color: var(--accent);
    box-shadow: var(--glow);
  }
  .name {
    font-weight: 600;
    font-size: 0.85rem;
    line-height: 1.25;
    margin-top: 4px;
    /* Never break inside a word. */
    hyphens: none;
    overflow-wrap: normal;
    max-width: 100%;
  }
  .card:not(.open) .name {
    color: var(--muted);
  }
  .hint {
    line-height: 1.3;
  }
  .progress {
    display: block;
    width: 100%;
    height: 4px;
    margin-top: 6px;
    background: var(--track);
    border-radius: 2px;
    overflow: hidden;
  }
  .progress .fill {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .count {
    font-size: 0.75rem;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .xp {
    font-family: var(--font-pixel);
    font-size: 1.05rem;
    color: var(--accent);
    line-height: 1;
  }
  .tag.follow-tag {
    background: var(--muted);
  }
  .tag {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--accent);
    color: var(--on-accent);
    padding: 1px 4px;
    border-radius: 3px;
  }
</style>
