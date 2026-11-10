<script lang="ts">
  import { onMount } from 'svelte';

  type Sensor = { key: string; entityId: string | null; configured: boolean };
  type Status = {
    version: string;
    mode: 'mock' | 'live';
    setupNeeded: boolean;
    ha: {
      state: string;
      haVersion: string | null;
      timeZone: string | null;
      lastError: string | null;
    };
    sensors: Sensor[];
    batteryKwh: number;
    db: { schemaVersion: number };
    mock: { readings: number; days: number; odometer: number } | null;
  };

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

  let status = $state<Status | null>(null);
  let error = $state<string | null>(null);
  let loading = $state(false);

  const ok = $derived(status?.ha.state === 'connected' || status?.ha.state === 'mock');

  async function load() {
    loading = true;
    error = null;
    try {
      // Relative path: works behind Ingress.
      const res = await fetch('./api/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      status = await res.json();
    } catch (err) {
      error = (err as Error).message;
    } finally {
      loading = false;
    }
  }

  onMount(load);
</script>

<main>
  <header>
    <h1>Q4 QUEST</h1>
    {#if status}<span class="version">v{status.version}</span>{/if}
  </header>

  {#if error}
    <section class="panel">
      <p>De app kon de server niet bereiken ({error}).</p>
      <button onclick={load}>Opnieuw</button>
    </section>
  {:else if !status}
    <p class="muted">Laden…</p>
  {:else}
    <section class="panel hello">
      <p class="lcd">HALLO!</p>
      <div class="conn">
        <span class="dot" class:on={ok}></span>
        <strong>{STATE_LABELS[status.ha.state] ?? status.ha.state}</strong>
      </div>
      <dl>
        {#if status.ha.haVersion}
          <dt>Home Assistant</dt>
          <dd>{status.ha.haVersion}</dd>
        {/if}
        {#if status.ha.timeZone}
          <dt>Tijdzone</dt>
          <dd>{status.ha.timeZone}</dd>
        {/if}
        <dt>Database</dt>
        <dd>schema v{status.db.schemaVersion}</dd>
        {#if status.mock}
          <dt>Mock-data</dt>
          <dd>
            {status.mock.readings.toLocaleString('nl-NL')} metingen over {status.mock.days} dagen,
            stand {status.mock.odometer.toLocaleString('nl-NL')} km
          </dd>
        {/if}
      </dl>
      {#if status.ha.lastError && !ok}
        <p class="muted small">{status.ha.lastError}</p>
      {/if}
      <button onclick={load} disabled={loading}>{loading ? 'Bezig…' : 'Vernieuwen'}</button>
    </section>

    {#if status.setupNeeded}
      <section class="panel setup">
        <h2>Nog even instellen</h2>
        <p>
          Q4 Quest heeft minimaal een sensor met de <strong>kilometerstand</strong> van je EV nodig.
        </p>
        <ol>
          <li>Ga in Home Assistant naar <em>Instellingen → Add-ons → Q4 Quest → Configuratie</em>.</li>
          <li>Vul bij <em>Kilometerstand-sensor</em> de entity-ID in, bijvoorbeeld <code>sensor.my_ev_odometer</code>.</li>
          <li>Vul eventueel de andere sensoren in (accu, laden, actieradius). Die zijn optioneel.</li>
          <li>Sla op en herstart de add-on.</li>
        </ol>
      </section>
    {/if}

    <section class="panel">
      <h2>Sensoren</h2>
      <ul class="sensors">
        {#each status.sensors as s (s.key)}
          <li class:off={!s.configured}>
            <span>{SENSOR_LABELS[s.key] ?? s.key}</span>
            {#if s.configured}<code>{s.entityId}</code>{:else}<span class="muted">niet ingesteld</span>{/if}
          </li>
        {/each}
        <li>
          <span>Accucapaciteit</span>
          <span>{status.batteryKwh} kWh</span>
        </li>
      </ul>
    </section>
  {/if}
</main>

<style>
  main {
    max-width: 640px;
    margin: 0 auto;
    padding: 16px;
    display: grid;
    gap: 16px;
  }
  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  h1 {
    font-family: var(--font-pixel);
    font-weight: 400;
    font-size: 2.6rem;
    letter-spacing: 0.08em;
    margin: 0;
    color: var(--accent);
    text-shadow: 0 0 12px rgba(227, 6, 19, 0.45);
  }
  h2 {
    font-family: var(--font-pixel);
    font-weight: 400;
    font-size: 1.6rem;
    margin: 0 0 8px;
  }
  .version,
  .muted {
    color: var(--muted);
  }
  .small {
    font-size: 0.85rem;
  }
  .panel {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 16px;
  }
  .hello {
    box-shadow: var(--glow);
  }
  .lcd {
    position: relative;
    font-family: var(--font-pixel);
    font-size: 3.4rem;
    line-height: 1;
    margin: 0 0 12px;
    padding: 12px 16px;
    background: #050506;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--accent);
    text-shadow: 0 0 10px rgba(227, 6, 19, 0.6);
    overflow: hidden;
  }
  /* Subtle scanlines, only on the LCD. */
  .lcd::after {
    content: '';
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 0 1px, transparent 1px 3px);
    pointer-events: none;
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
    margin: 0;
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
  .setup {
    border-color: var(--accent);
  }
  .setup ol {
    padding-left: 1.2em;
    margin: 0;
  }
  button {
    font: inherit;
    color: var(--text);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 6px 14px;
    cursor: pointer;
  }
  button:hover,
  button:focus-visible {
    border-color: var(--accent);
    outline: none;
    box-shadow: var(--glow);
  }
</style>
