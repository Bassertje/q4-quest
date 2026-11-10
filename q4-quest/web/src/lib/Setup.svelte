<section class="panel setup">
  <h2>Nog even instellen</h2>
  <p>Q4 Quest heeft minimaal een sensor met de <strong>kilometerstand</strong> van je EV nodig.</p>
  <ol>
    <li>Ga in Home Assistant naar <em>Instellingen → Add-ons → Q4 Quest → Configuratie</em>.</li>
    <li>Vul bij <em>Kilometerstand-sensor</em> de entity-ID in, bijvoorbeeld <code>sensor.my_ev_odometer</code>.</li>
    <li>Vul eventueel de andere sensoren in (accu, laden, actieradius). Die zijn optioneel.</li>
    <li>Sla op en herstart de add-on.</li>
  </ol>
</section>

<style>
  .setup {
    border-color: var(--accent);
  }
  ol {
    padding-left: 1.2em;
    margin: 0;
  }
</style>
