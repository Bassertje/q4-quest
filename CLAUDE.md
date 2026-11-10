# CLAUDE.md — Q4 Quest

Lees dit bestand aan het begin van elke sessie. De productspecificatie staat in `SPEC.md`; lees die ook voordat je aan een fase begint.

## Over de gebruiker
- Technisch handig (Home Assistant, HTML/CSS), maar **beginner met Claude Code, backend en Docker**.
- Communiceer in het Nederlands, in gewone taal. Leg kort uit wat je doet en waarom.
- Stel een vraag als de spec onduidelijk is; gok niet.
- Werk **één fase per keer** uit `SPEC.md`. Sluit elke fase af met: wat er gebouwd is, hoe het te testen is, en het nieuwe versienummer.

## Wat dit is
Een gamification-webapp rond de kilometerstand en het laden van een elektrische auto. Draait als **Home Assistant add-on** op bescheiden ARM64-hardware en wordt geopend via **Ingress**.

## PRIVACY — HOOGSTE PRIORITEIT
Deze repository is **publiek**. Er mag niets in staan dat naar een persoon, adres, auto of installatie herleidbaar is.
1. **Geen persoonsgegevens**: geen namen, e-mailadressen, adressen, kentekens, VIN's, locaties, URL's van HA-installaties, Nabu Casa-adressen, IP-adressen of hostnamen. Ook niet in commentaar, commitberichten, testdata, voorbeeldconfig, screenshots of documentatie.
2. **Geen echte entity-ID's.** Alle sensoren worden ingesteld via de add-on-opties (zie SPEC). Gebruik in mock-data, tests en voorbeelden alleen fictieve ID's zoals `sensor.my_ev_odometer`.
3. **Geen merknaam van de auto** in code, UI-teksten of documentatie. De app-naam "Q4 Quest" is de enige uitzondering; leg die nergens uit of in verband met een automerk. Spreek verder van "de auto" of "je EV".
4. **Geen geheimen.** Authenticatie loopt via `SUPERVISOR_TOKEN` (runtime). Lokale `.env`-bestanden, `*.db`, `*.sqlite`, `/data` en exports staan in `.gitignore`.
5. **Geen echte data in de repo**, ook niet als testfixture of voorbeeld-export. Mock-data is volledig gegenereerd.
6. Doe vóór elke commit een korte check op bovenstaande punten. Twijfel je ergens over, laat het eruit en vraag het.

## Harde technische regels
1. **Licht houden**: één Node-proces, geen polling korter dan 1 minuut. Live updates gaan via de HA WebSocket-subscriptie.
2. **Geen native modules die gecompileerd moeten worden** als het niet hoeft. Gebruik `node:sqlite` (Node 22.13+). Lukt dat niet, overleg dan eerst.
3. **Ingress-proof**: gebruik in de frontend alleen relatieve paden (`./api/...`, `./assets/...`), nooit paden die met `/` beginnen.
4. **Alleen-lezen richting HA**: lees states en historie, schrijf nooit iets terug en roep geen services aan.
5. **Data in `/data`**: database in `/data/q4quest.db`. Schema-wijzigingen via genummerde migraties die nooit data verliezen.
6. **Mock-modus verplicht**: met `MOCK=1` draait alles zonder HA, met gegenereerde historie (enkele maanden ritten en laadsessies).
7. **Versie ophogen**: verhoog `version` in `q4-quest/config.yaml` (semver) bij elke wijziging die geïnstalleerd moet worden, en werk `CHANGELOG.md` bij in gewone taal.
8. **Geen merklogo's** of handelsmerken in de UI.

## Tech-stack
- Backend: Node.js 22+ in TypeScript, Fastify, `node:sqlite`, HA WebSocket API.
- Frontend: Svelte + Vite, statische build, geserveerd door de backend. Grafieken met een lichte library (uPlot of Chart.js).
- Tests: Vitest. De game-logica bestaat uit pure functies die zonder HA en zonder database te testen zijn.
- UI-teksten in het Nederlands, code en commentaar in het Engels.

## Repostructuur
```
repository.yaml          # maakt van de repo een HA add-on repository
README.md                # neutraal, Engels, geen persoonlijke info
q4-quest/
  config.yaml            # manifest: ingress, homeassistant_api, options, version
  Dockerfile             # multi-stage build, slanke runtime
  DOCS.md                # handleiding die HA bij de add-on toont
  CHANGELOG.md
  icon.png, logo.png
  server/                # backend
  web/                   # frontend
  game/                  # pure game-logica + tests
```

## Werkwijze
- Kleine commits met duidelijke, neutrale berichten.
- Draai de tests voordat je een fase afrondt.
- Leg na elke fase in 3–5 regels uit hoe de gebruiker het in de mock-modus kan bekijken.
