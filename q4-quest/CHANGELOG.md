# Changelog

## 0.2.0

De cockpit en het verzamelen van gegevens.

- De app luistert live mee naar je sensoren in Home Assistant en slaat elke geldige wijziging op.
- Waarden als `unknown` en `unavailable` worden genegeerd. Een kilometerstand die lager is dan de vorige (of onmogelijk hoog springt) wordt gelogd en niet meegeteld. Mijlen worden omgerekend naar km.
- Na een herstart of verbroken verbinding haalt de app de gemiste periode op uit de historie van Home Assistant.
- Backfill: bij de eerste start haalt de app de langetermijnstatistieken van de kilometerstand en de volledige historie van alle sensoren op. Je kunt dit opnieuw starten via Instellingen.
- XP en levels: 1 XP per kilometer op de teller, met rangtitels van Leerling tot Orbitaal.
- Mijlpalen op de kilometerstand (van 1.000 km tot en met 100.000 km, daarna elke 25.000 km) en de Maanreis naar 384.400 km.
- Nieuw scherm **Cockpit**: kilometerteller in LCD-cijfers die kort doortelt, level en XP-balk, volgende mijlpaal, km vandaag/deze week/deze maand, streak, laatst gehaalde mijlpaal, en accu en actieradius als die sensoren zijn ingesteld.
- Een dagtotaal is de laatste stand van die dag min de laatste stand van de vorige dag met gegevens. Zo gaan er geen kilometers verloren als de auto weinig metingen doorgeeft.
- Nieuw scherm **Instellingen** (tandwiel): verbindingsstatus, sensoren met het aantal metingen, backfill opnieuw starten en export van je eigen gegevens als JSON.
- De cockpit ververst vanzelf zodra er nieuwe gegevens binnenkomen.

## 0.1.0

Eerste versie: het skelet.

- De add-on is te installeren en opent via de zijbalk (Ingress).
- Een "Hallo"-pagina laat zien of de verbinding met Home Assistant werkt, welke Home Assistant-versie en tijdzone er gevonden zijn en welke sensoren zijn ingesteld.
- Zonder kilometerstand-sensor verschijnt een instelscherm met uitleg.
- Alle sensoren stel je in via de add-on-opties.
- Mock-modus (`MOCK=1`): de app draait zonder Home Assistant met een paar maanden gegenereerde ritten en laadsessies.
- De database (`/data/q4quest.db`) wordt aangemaakt met genummerde migraties.
