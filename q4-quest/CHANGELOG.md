# Changelog

## 0.4.0

Laden, en een paar verbeteringen in de Historie.

- Nieuw scherm **Laden** (alleen zichtbaar als een laadvermogen- of laadstatus-sensor is ingesteld):
  - Laadsessies worden herkend aan een laadvermogen boven 0 of de status "laden". Een onderbreking van maximaal 15 minuten hoort nog bij dezelfde sessie.
  - Per sessie: datum, AC/DC, geschatte kWh, accupercentage van → naar en piekvermogen. Het vermogen wordt in W of kW gelezen; de eenheid komt uit de sensor.
  - De kWh-schatting komt uit het gemeten vermogen (trapeziumregel). Bij minder dan 3 vermogensmetingen wordt het verschil in accupercentage × accucapaciteit gebruikt.
  - Zonder laadtype-sensor wordt AC/DC afgeleid uit het piekvermogen (gemarkeerd met een vraagteken).
  - Totalen (sessies, kWh, AC/DC) en een verbruiksschatting over de laatste 30 dagen. Die verschijnt pas vanaf 300 km en 3 sessies en heet altijd "schatting".
- Records in de Historie: snelste laadsessie (piek-kW) en meeste laadsessies in een maand.
- "Langste ritblok" heet nu "Grootste ritblok (indicatief)".
- Een ritblok met maar één meting toont "rond HH:MM" in plaats van een tijdvak.
- Grafiek: Week toont altijd 12 weken en Maand altijd 12 maanden, eindigend bij de huidige of gekozen periode. Periodes zonder data krijgen een staaf van 0; periodes van vóór de eerste meting zijn gedimd. De staven hebben een vaste breedte, zijn gelijkmatig verdeeld en raken nooit de rand.
- Nieuw icoon: een pixel-art gamecontroller. Het zijbalk-icoon is nu `mdi:gamepad-variant`.

## 0.3.0

Het Historie-scherm.

- Navigatie: onderaan op je telefoon, bovenaan op een groter scherm. Instellingen blijven achter het tandwiel.
- Staafgrafiek met gereden km per dag, week of maand. Tik of beweeg over een staaf voor de waarde, en blader met ‹ › terug in de tijd.
- Records: beste dag, beste week, beste maand, langste streak en langste ritblok. De laadrecords volgen met het Laden-scherm.
- Ritblokken: opeenvolgende kilometerstijgingen met minder dan 45 minuten ertussen. Als de parkeerrem-sensor is ingesteld, splitst het aanzetten van de parkeerrem ook een ritblok. Ritblokken zijn indicatief. De recentste ritblokken staan in een lijst.
- Tijdlijn met mijlpalen en level-ups, met terugwerkende kracht gedateerd. Wat je bij de eerste meting al had, staat samengevat als startpunt onderaan.

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
