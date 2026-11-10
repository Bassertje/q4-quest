<script lang="ts">
  import { onMount } from 'svelte';
  import { date, km } from './format';
  import PixelIcon from './PixelIcon.svelte';
  import type { BadgeView } from './types';

  let {
    badge,
    timeZone,
    followed,
    onfollow,
    onclose,
  }: {
    badge: BadgeView;
    timeZone: string;
    /** This badge is the one the user chose to follow. */
    followed: boolean;
    onfollow: (id: string | null) => Promise<void>;
    onclose: () => void;
  } = $props();

  let busy = $state(false);
  const open = $derived(badge.unlockedTs !== null);

  async function toggle() {
    busy = true;
    await onfollow(followed ? null : badge.id);
    busy = false;
  }

  onMount(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onclose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}></div>
<div class="sheet" role="dialog" aria-modal="true" aria-label={badge.name ?? 'Verborgen badge'}>
  <button class="close" aria-label="Sluiten" onclick={onclose}>✕</button>
  <PixelIcon icon={badge.icon} size={96} locked={!open} />
  <h2>{badge.name ?? '???'}</h2>
  <p>{open ? badge.description : badge.hint}</p>
  {#if open}
    <p class="muted">Ontgrendeld op {date(badge.unlockedTs!, timeZone)}</p>
  {:else if badge.progress}
    <div class="bar"><span style:width="{(badge.progress.current / badge.progress.target) * 100}%"></span></div>
    <p class="muted count">
      {km(badge.progress.current)} / {km(badge.progress.target)} {badge.progress.unit}
      · nog {km(badge.progress.target - badge.progress.current)} {badge.progress.unit}
    </p>
  {/if}
  {#if badge.xp > 0}<p class="xp">+{km(badge.xp)} XP</p>{/if}
  {#if badge.followable}
    <button class="follow" class:on={followed} onclick={toggle} disabled={busy} aria-pressed={followed}>
      {followed ? 'Gevolgd ✓ · niet meer volgen' : 'Volgen'}
    </button>
    <p class="muted small">De gevolgde badge staat op je cockpit.</p>
  {/if}
</div>

<style>
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
    max-width: 440px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 6px;
    padding: 24px 20px calc(24px + env(safe-area-inset-bottom));
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
  .close {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 40px;
    height: 40px;
    padding: 0;
  }
  h2 {
    margin: 8px 0 0;
  }
  p {
    margin: 0;
  }
  .bar {
    width: 100%;
    height: 8px;
    margin-top: 6px;
    background: var(--track);
    border-radius: 2px;
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
  }
  .count {
    font-variant-numeric: tabular-nums;
  }
  .xp {
    font-family: var(--font-pixel);
    font-size: 1.6rem;
    color: var(--accent);
    line-height: 1;
  }
  .follow {
    margin-top: 10px;
    background: var(--accent);
    border-color: var(--accent);
    color: var(--on-accent);
    padding: 8px 20px;
  }
  .follow.on {
    background: transparent;
    color: var(--text);
  }
</style>
