<script lang="ts">
  import { getJson, post } from '../lib/api';
  import { km } from '../lib/format';
  import { cachedTheme, saveTheme, type ThemeChoice } from '../lib/theme';
  import type { StatusData } from '../lib/types';

  let { refresh }: { refresh: number } = $props();

  const SENSOR_LABELS: Record<string, string> = {
    odometer: 'Kilometerstand',
    soc: 'Accupercentage',
    charging_power: 'Laadvermogen',
    charging_state: 'Laadstatus',
    charging_type: 'Laadtype (AC/DC)',
    range: 'Actieradius',
    parking_brake: 'Parkeerrem',
  };

  const STATE_LABELS: Record<string, string> = {
    mock: 'Mock-modus (geen Home Assistant nodig)',
    connected: 'Verbonden met Home Assistant',
    connecting: 'Bezig met verbinden…',
    disconnected: 'Geen verbinding, opnieuw proberen…',
    auth_failed: 'Inloggen bij Home Assistant mislukt',
    not_configured: 'Geen Home Assistant-verbinding ingesteld',
  };

  const BACKFILL_LABELS: Record<string, string> = {
    idle: 'Nog niet uitgevoerd',
    running: 'Bezig…',
    done: 'Klaar',
    error: 'Mislukt',
  };

  const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
    { value: 'auto', label: 'Automatisch' },
    { value: 'light', label: 'Licht' },
    { value: 'dark', label: 'Donker' },
  ];
  let theme = $state<ThemeChoice>(cachedTheme());

  async function chooseTheme(choice: ThemeChoice) {
    theme = choice;
    await saveTheme(choice);
  }

  let status = $state<StatusData | null>(null);
  let error = $state<string | null>(null);
  let starting = $state(false);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  async function load() {
    try {
      status = await getJson<StatusData>('status');
      error = null;
    } catch (err) {
      error = (err as Error).message;
    }
    // While a backfill runs, check again in a few seconds (local API only).
    if (pollTimer) clearTimeout(pollTimer);
    if (status?.backfill.state === 'running') pollTimer = setTimeout(load, 3000);
  }

  $effect(() => {
    void refresh;
    load();
    getJson<{ theme: ThemeChoice }>('settings')
      .then((s) => (theme = s.theme))
      .catch(() => {});
    return () => {
      if (pollTimer) clearTimeout(pollTimer);
    };
  });

  async function startBackfill() {
    starting = true;
    await post('backfill');
    starting = false;
    load();
  }

  const ok = $derived(status?.ha.state === 'connected' || status?.ha.state === 'mock');
  const totalReadings = $derived(Object.values(status?.db.readings ?? {}).reduce((a, b) => a + b, 0));
</script>

<h2 class="title">Instellingen</h2>

{#if error && !status}
  <section class="panel">
    <p>De app kon de server niet bereiken ({error}).</p>
    <button onclick={load}>Opnieuw</button>
  </section>
{:else if !status}
  <p class="muted">Laden…</p>
{:else}
  <section class="panel">
    <h3>Weergave</h3>
    <div class="segmented" role="group" aria-label="Thema">
      {#each THEME_OPTIONS as o (o.value)}
        <button class:active={theme === o.value} aria-pressed={theme === o.value} onclick={() => chooseTheme(o.value)}>
          {o.label}
        </button>
      {/each}
    </div>
    <p class="muted small hint">Automatisch volgt de instelling van je apparaat.</p>
  </section>

  <section class="panel">
    <h3>Verbinding</h3>
    <div class="conn">
      <span class="dot" class:on={ok}></span>
      <strong>{STATE_LABELS[status.ha.state] ?? status.ha.state}</strong>
    </div>
    <dl>
      {#if status.ha.haVersion}
        <dt>Home Assistant</dt>
        <dd>{status.ha.haVersion}</dd>
      {/if}
      <dt>Tijdzone</dt>
      <dd>{status.timeZone}</dd>
      <dt>Versie</dt>
      <dd>{status.version}</dd>
      <dt>Opgeslagen</dt>
      <dd>{km(totalReadings)} metingen</dd>
    </dl>
    {#if status.ha.lastError && !ok}
      <p class="muted small">{status.ha.lastError}</p>
    {/if}
  </section>

  <section class="panel">
    <h3>Sensoren</h3>
    <ul class="sensors">
      {#each status.sensors as s (s.key)}
        <li>
          <span>{SENSOR_LABELS[s.key] ?? s.key}</span>
          {#if s.configured}
            <span class="right">
              <code>{s.entityId}</code>
              <span class="muted small">{km(status.db.readings[s.key] ?? 0)} metingen</span>
            </span>
          {:else}
            <span class="muted">niet ingesteld</span>
          {/if}
        </li>
      {/each}
      <li>
        <span>Accucapaciteit</span>
        <span>{status.batteryKwh} kWh</span>
      </li>
    </ul>
    <p class="muted small">Sensoren wijzig je in Home Assistant bij de configuratie van de add-on.</p>
  </section>

  <section class="panel">
    <h3>Historie ophalen (backfill)</h3>
    <p class="muted small">
      Haalt de geschiedenis van je sensoren op uit Home Assistant, zo ver als die teruggaat. Dit gebeurt
      automatisch bij de eerste start. Bestaande gegevens blijven bewaard.
    </p>
    <dl>
      <dt>Status</dt>
      <dd>
        {BACKFILL_LABELS[status.backfill.state]}{status.backfill.step ? ` (${status.backfill.step})` : ''}
      </dd>
      {#if status.backfill.state !== 'idle'}
        <dt>Nieuw opgeslagen</dt>
        <dd>{km(status.backfill.stored)} metingen</dd>
      {/if}
      {#if status.backfill.finishedAt}
        <dt>Klaar op</dt>
        <dd>{new Date(status.backfill.finishedAt).toLocaleString('nl-NL')}</dd>
      {/if}
    </dl>
    {#if status.backfill.error}
      <p class="muted small">{status.backfill.error}</p>
    {/if}
    <button onclick={startBackfill} disabled={starting || status.backfill.state === 'running'}>
      Backfill opnieuw starten
    </button>
  </section>

  <section class="panel">
    <h3>Export</h3>
    <p class="muted small">Download al je opgeslagen metingen als JSON-bestand.</p>
    <a class="button" href="./api/export" download>Exporteren</a>
  </section>
{/if}

<style>
  .title {
    font-size: 2rem;
  }
  .hint {
    margin: 8px 0 0;
  }
  h3 {
    font-size: 1rem;
    margin: 0 0 8px;
  }
  .conn {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid var(--muted);
    flex: none;
  }
  .dot.on {
    background: var(--accent);
    border-color: var(--accent);
    box-shadow: 0 0 10px var(--accent);
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 4px 16px;
    margin: 0 0 12px;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    min-width: 0;
  }
  .sensors {
    list-style: none;
    margin: 0 0 8px;
    padding: 0;
  }
  .sensors li {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 4px 12px;
    padding: 8px 0;
    border-top: 1px solid var(--line);
  }
  .sensors li:first-child {
    border-top: 0;
  }
  .right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    min-width: 0;
  }
</style>
