# Changelog

## 1.2.0

- **Wereldreis:** de categorie Mijlpalen is vervangen door een wereldreis met bestemmingen, elk met een eigen pixel-art icoon en een kort verhaal: Kármánlijn (100 km), Aanmeren bij het ISS (408 km), 1.000 km, Alle wegen leiden naar Rome (1.650 km), Route 66 (3.940 km), Over de plas (5.860 km), Trans-Siberië Express (9.289 km), Down Under (16.600 km), De Chinese Muur (21.196 km), Pan-Americana (30.000 km) en Rondje aarde (40.075 km). XP = km ÷ 10. De Maanreis blijft legendarisch.
- Het verhaal staat bij de badge, in het reveal-scherm, en als hint bij badges die je nog niet hebt (met je voortgang).
- **Cockpit:** "Volgende mijlpaal" is nu **Volgende bestemming**, met icoon, naam, voortgang, "nog X km" en het verhaal.
- De kale mijlpalen (2.500 tot en met 100.000 km en de doorlopende per 25.000 km) zijn verdwenen. 1.000 km en Rondje aarde behouden hun datum. Volgde je een verwijderde mijlpaal, dan kiest de app weer automatisch. Nieuwe bestemmingen die je al hebt gehaald, verschijnen bij het volgende openen in het reveal-scherm.
- XP en levels worden automatisch herberekend.

## 1.1.0

- **Deel je jaar:** het jaaroverzicht eindigt met een deelkaart (een afbeelding van 1080×1920 in de stijl van je thema) met je gereden km van dat jaar, je hoogtepunten, je level en rang en de badges van dat jaar. Er staat niets herleidbaars op: geen kilometerstand van de auto en geen datums of tijden. Met **Delen** gaat de afbeelding naar het deelmenu van je telefoon; waar dat niet kan, wordt hij gedownload als `q4-quest-<jaar>.png`.
- **Gevolgde badge:** op de cockpit staat nu één badge die je volgt, met een voortgangsbalk en hoeveel er nog resteert. Tik op het Badges-scherm op een badge en kies **Volgen**. Zonder keuze volgt de app automatisch de badge waar je het dichtst bij bent.
- **Maanreis** is nu een badge in de nieuwe categorie **Legendarisch** (384.400 km, 5.000 XP), met voortgang. De vaste maanreis-kaart op de cockpit is vervangen door de gevolgde badge.
- **Rangenoverzicht:** tik op je rang op de cockpit voor alle rangen met hun levels, XP-drempel en een eigen pixel-art icoon. Een nieuwe rang verschijnt voortaan ook in het reveal-scherm.
- Het instellingen-icoon is een strak pixel-art tandwiel.
- XP en levels worden automatisch herberekend (de Maanreis telt mee zodra je hem haalt).

## 1.0.0

Het jaaroverzicht, en daarmee is Q4 Quest compleet.

- **Jaaroverzicht:** een reeks kaarten die je kunt doorvegen, met de hoogtepunten van het jaar: totaal gereden km, beste dag, beste week, langste streak, laadsessies en geladen kWh, de verhouding AC/DC, je nieuwe badges, hoeveel levels je bent gestegen, en hoeveel van een rondje om de aarde je hebt gereden.
  - Beschikbaar vanaf 1 december. In december (en in januari voor het vorige jaar) staat er een melding op de cockpit. Eerdere jaren blijven terug te kijken via Historie → Jaaroverzichten.
  - Via Instellingen → **Voorbeeld jaaroverzicht** kun je het nu al bekijken met de data tot nu toe.
- **Mijlpalen geven XP:** mijlpaal-km ÷ 10 (1.000 km = 100 XP, Rondje aarde = 4.007 XP). Je XP en level worden automatisch herberekend; de "+XP" staat ook bij mijlpalen.
- **Voortgang bij badges:** vergrendelde telbare badges (mijlpalen, aantal laadsessies, streaks, km per maand/week, megawattuur) tonen een balkje met "huidig / doel".
- **Badgekaarten:** geen afbreking meer midden in een woord, en twee kolommen op smalle schermen.
- **Navigatie:** het Cockpit-icoon is nu een pixel-art stuur.

## 0.5.1

- Je bestaande records (beste dag, week en maand, langste streak, grootste ritblok en de laadrecords) verschijnen nu ook in het reveal-scherm. Had je 0.5.0 al geopend, dan komen ze bij de volgende keer openen alsnog voorbij. Badges, mijlpalen en levels die je al hebt gezien, komen niet opnieuw.
- Nieuw logo: dezelfde pixel-art-gamecontroller als het icoon, met "Q4 QUEST" ernaast.

## 0.5.0

Badges! En twee verbeteringen.

- **Badges:** 21 badges in de categorieën Rijden, Laden en Zuinigheid, plus de mijlpalen als badges.
  - Alles wordt met terugwerkende kracht berekend: de datum is het moment waarop je de badge voor het eerst verdiende, ook als dat vóór deze update was.
  - Het bonus-XP van badges telt mee voor je level (mijlpalen geven geen bonus-XP; de kilometers tellen al).
  - Nieuwe tab **Badges** met per categorie een raster: ontgrendeld in kleur met datum, vergrendeld als silhouet met een hint, en één verborgen badge.
  - Elke badge heeft een eigen pixel-art-icoon dat in de lichte en donkere modus werkt.
  - Laadbadges gebruiken de gecorrigeerde laadsessies. "Volle bak" is nu: gemiddeld 75 kW of meer in één sessie.
  - "Nachtuil" en "Vroege vogel" tellen alleen voor ritblokken met minstens twee metingen.
  - Badges die van een niet-ingestelde sensor afhangen, verschijnen niet.
- **Reveal-scherm:** bij het openen van de app zie je eerst wat er nieuw is (badges, mijlpalen, level-ups en nieuwe records), één voor één met een pixel-burst. Na 3 items kun je met "Toon alles" de rest in één lijst zien. Level-ups worden samengevoegd tot één melding. De eerste keer na deze update komt alles wat je al had verdiend op deze manier voorbij.
- De cockpit toont bij "Laatst ontgrendeld" je nieuwste badge met icoon, en bij het level hoeveel bonus-XP erin zit. De tijdlijn in Historie toont nu ook badges.
- **Kilometerteller in de lichte modus:** geen zwart vlak meer, maar een licht LCD-instrument met rode cijfers. De donkere modus is ongewijzigd.
- **Laadsessies:** een korte valse melding waarin het accupercentage daalt, wordt nu weggegooid vóór het samenvoegen. Zo kan zo'n melding het begin van een echte sessie niet meer naar voren halen. Alle sessies en badges worden automatisch opnieuw berekend.

## 0.4.1

Betrouwbaardere laadsessies en een lichte modus.

- **Laadsessies (bugfix):** de laadstatus en het laadvermogen gaven soms valse sessies (een kwartier "laden" op een vast vermogen terwijl het accupercentage daalde), en tijdens DC-laden bleef het vermogen soms op een te lage waarde hangen.
  - Een periode met status "laden" of vermogen boven 0 telt nu alleen als laadsessie als het accupercentage minstens 2 procentpunt stijgt. Periodes die minder dan 30 minuten uit elkaar liggen worden eerst samengevoegd. Omdat het accupercentage vaak later wordt bijgewerkt, telt de hoogste waarde tot 30 minuten na het einde mee.
  - De kWh-schatting is nu het verschil in accupercentage × accucapaciteit. Het gemeten vermogen wordt alleen nog gebruikt als er geen accupercentage-sensor is ingesteld.
  - In plaats van het piekvermogen toont de app nu het gemiddelde vermogen ("gem." = kWh ÷ duur), ook bij het record "Snelste laadsessie".
  - DC als de laadtype-sensor tijdens de sessie of tot 10 minuten erna "DC" meldt, of als het gemiddelde vermogen boven 22 kW ligt. Anders AC.
  - Alle bestaande sessies, totalen, records en de verbruiksschatting worden automatisch opnieuw berekend uit de opgeslagen metingen; je hoeft niets te doen.
- **Lichte modus:** kies in Instellingen → Weergave tussen Automatisch (volgt je apparaat), Licht en Donker. De keuze wordt in de database bewaard. De kilometerteller blijft altijd een donker instrument met rode cijfers; de grafieken kleuren mee.

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
