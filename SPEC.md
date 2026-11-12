# SPEC — Q4 Quest

Een rustige maar verslavende game rond je elektrische auto: kilometers worden XP, een wereldreis en badges. Eén gebruiker, geen pushmeldingen. Wat nieuw is, valt direct op zodra je de app opent.

---

## 1. Platform

- **Home Assistant add-on**, geopend via Ingress (zijbalk-paneel, icoon `mdi:car-electric`, titel "Q4 Quest").
- `config.yaml`: `ingress: true`, `homeassistant_api: true`, `arch: [aarch64, amd64]`, `init: false`.
- HA-toegang via `ws://supervisor/core/websocket` en `http://supervisor/core/api` met `SUPERVISOR_TOKEN`.
- Lokaal ontwikkelen: `HA_URL` en `HA_TOKEN` uit `.env` (gitignored), of `MOCK=1`.
- Database: SQLite in `/data/q4quest.db`.
- De tijdzone wordt uit de HA-config gelezen (`get_config`). Dagen, weken en maanden worden in die tijdzone berekend.

### Add-on-opties (ingevuld door de gebruiker in HA, nooit in de repo)

| Optie | Type | Verplicht | Gebruik |
|---|---|---|---|
| `odometer_entity` | entity | ja | kilometerstand |
| `soc_entity` | entity | nee | accupercentage |
| `charging_power_entity` | entity | nee | laadvermogen (lees de eenheid uit de attributen: W of kW) |
| `charging_state_entity` | entity | nee | laadstatus |
| `charging_type_entity` | entity | nee | AC/DC |
| `range_entity` | entity | nee | actieradius |
| `parking_brake_entity` | entity | nee | hulp bij het afbakenen van ritten |
| `temperature_entity` | entity | nee | buitentemperatuur (°C of °F; opgeslagen in °C) |
| `battery_kwh` | float | nee, standaard 77 | bruikbare accucapaciteit, voor kWh-schattingen |
| `co2_petrol_kg_per_km` | float | nee, standaard 0.18 | CO₂ van een benzineauto per km |
| `co2_grid_kg_per_kwh` | float | nee, standaard 0.33 | CO₂ van stroom uit het net per kWh |
| `petrol_l_per_100km` | float | nee, standaard 6.5 | verbruik van een vergelijkbare benzineauto |

Defaults zijn leeg. Zonder `odometer_entity` toont de app een vriendelijk instelscherm met uitleg.

Functies die afhangen van een optionele sensor die niet is ingesteld, worden verborgen. Badges die daarvan afhangen, verschijnen niet.

---

## 2. Data

### Collectie
- Abonneer op `state_changed` voor de ingestelde entities. Sla elke geldige wijziging op als `readings(entity_key, ts, value, attrs_json)`.
- Negeer `unknown` en `unavailable`. Negeer een odometerwaarde die **lager** is dan de vorige: log hem, maar tel hem niet mee.
- Bij een herstart of herverbinding: haal de gemiste periode op via de history-API en ga verder. Gebruik reconnect met backoff.
- De verbinding bewaakt zichzelf: een verbindingspoging die binnen 30 seconden niet tot een geslaagde aanmelding komt (bijv. terwijl HA herstart), wordt afgebroken en opnieuw geprobeerd. Een actieve verbinding stuurt elke minuut een `ping`; komt er binnen 20 seconden geen `pong`, dan wordt de verbinding verbroken en opnieuw opgebouwd (met het ophalen van de gemiste periode).

### Backfill (eenmalig, en opnieuw te starten vanuit een instellingenpagina)
1. Haal long-term statistics op (`recorder/statistics_during_period`, per uur) voor de odometer, als die bestaan.
2. Haal ruwe historie op (`history/history_during_period`) voor alle ingestelde entities, zo ver als de recorder teruggaat.
3. Na de backfill worden alle afgeleide tabellen en badges opnieuw berekend.

### Afgeleide gegevens (pure functies, getest)
Afgeleide gegevens worden altijd uit de opgeslagen ruwe metingen berekend. Na een update van de add-on (bijv. een gewijzigde definitie van een laadsessie) worden alle afgeleide gegevens, sessies en badges dus opnieuw berekend; ontgrendeldata volgen uit de nieuwe berekening.

- **Dagtotaal:** de laatste odometerstand van de dag minus de laatste stand van de vorige dag met data (voor de allereerste dag: max − min). Dit is de primaire maat; OEM-data is niet realtime en komt soms pas na een rit binnen.
- **Ritblok:** opeenvolgende odometerstijgingen met minder dan 45 minuten ertussen. Gebruik de parkeerrem-sensor als extra scheidingssignaal als die is ingesteld. Ritblokken zijn indicatief.
- **Laadsessie:**
  - Kandidaat: een periode met status "laden" of laadvermogen > 0. Kandidaten waarin de SoC daalt (een SoC-meting lager dan de laatste SoC vóór de start), worden eerst weggegooid, zodat een vals-positieve blip het begin van een echte sessie niet naar voren haalt. De overgebleven kandidaten die minder dan 30 minuten uit elkaar liggen, worden daarna samengevoegd.
  - Een kandidaat is alleen een echte laadsessie als de SoC met **≥ 2 procentpunt** stijgt. Vergelijk daarvoor de laatste SoC vóór de start met de hoogste SoC tot 30 minuten na het einde (SoC-updates lopen achter). Zo vallen vals-positieve meldingen af (bijv. ±15 min "laden" op een vast vermogen terwijl de SoC daalt). Zonder SoC-sensor telt elke kandidaat.
  - Per sessie: start, eind, type (AC/DC), SoC begin en eind, geschatte kWh en gemiddeld vermogen.
  - Geschatte kWh: ΔSoC / 100 × `battery_kwh`. Het gemeten vermogen is onbetrouwbaar (het kan bijvoorbeeld tijdens DC-laden op een te lage waarde blijven hangen); vermogensintegratie (trapeziumregel) wordt alleen gebruikt als er geen SoC-sensor is ingesteld.
  - Gemiddeld vermogen ("gem."): kWh ÷ duur.
  - Type: DC als de laadtype-sensor tijdens de sessie of tot 10 minuten erna "dc" meldt, óf als het gemiddelde vermogen > 22 kW is. Anders AC.
- **Verbruikte energie** over een periode = geladen kWh in die periode (sessies die in de periode eindigden) + (SoC aan het begin − SoC aan het eind) / 100 × `battery_kwh`. SoC aan het begin = laatste meting op of vóór de start; SoC aan het eind = laatste meting vóór het einde. Zonder SoC-sensor telt alleen de geladen kWh.
- **Verbruik** = verbruikte energie ÷ gereden km in dezelfde periode (km = laatste kilometerstand vóór het einde − stand op of vóór de start). Een periode begint nooit vóór het eerste moment waarop zowel odometer- als SoC-data beschikbaar zijn.
- **Verbruiksschatting (Laden-scherm):** bovenstaande methode over de gekozen periode (week, maand, jaar of alles; een lopende periode tot nu). Bij minder dan 100 km in de periode: "–" met "te weinig data". Dat het een schatting is, staat in de ⓘ-uitleg.
- Dezelfde methode geldt voor de weekschattingen (badges Zuinige week en Winterhard, de verbruiksuitdaging), de maandgrafiek verbruik/temperatuur en de stroomuitstoot in Groen.

---

## 3. Game-mechaniek

### XP en levels
- 1 XP per km op de teller (XP = totale kilometerstand), plus het bonus-XP van elke badge.
- De cumulatieve XP die nodig is voor level *L* is `50 × L × (L + 1)` (level 1 = 100 XP, level 10 = 5.500, level 20 = 21.000).
- Rangtitels per 5 levels:
  - Leerling (1–4), Pendelaar (5–9), Wegvreter (10–14), Kilometervreter (15–19), Snelwegridder (20–24), Asfaltlegende (25–29), Orbitaal (30+).

### Wereldreis (op kilometerstand)
De categorie **Wereldreis** vervangt de vroegere kale mijlpalen. Elke bestemming is een badge die je haalt zodra de kilometerstand de afstand bereikt. XP = km ÷ 10 (naar beneden afgerond). Het verhaal (één zin) staat bij de badge, in de detailweergave, als hint bij een vergrendelde badge en in het reveal-scherm. Elke bestemming heeft een eigen pixel-art icoon (geen logo's of merkafbeeldingen).

| km | id | Naam | Verhaal | Icoon |
|---|---|---|---|---|
| 100 | karman | Kármánlijn | Recht omhoog was je nu in de ruimte. | raket |
| 408 | iss | Aanmeren bij het ISS | Zo hoog cirkelt het ruimtestation boven ons. | ruimtestation |
| 1.000 | milestone_1000 | 1.000 km | Je eerste duizend kilometer. | vlag |
| 1.650 | rome | Alle wegen leiden naar Rome | Net zo ver als van Amsterdam naar Rome over de weg. | zuil |
| 3.940 | route66 | Route 66 | Chicago naar Santa Monica, van begin tot eind. | verkeersbord "66" |
| 5.860 | atlantic | Over de plas | Hemelsbreed van Amsterdam naar New York. | golven |
| 9.289 | transsib | Trans-Siberië Express | Moskou naar Vladivostok, de langste treinreis ter wereld. | trein |
| 16.600 | downunder | Down Under | Hemelsbreed van Amsterdam naar Sydney. | kangoeroe |
| 21.196 | greatwall | De Chinese Muur | Alle delen van de muur achter elkaar gelegd. | muur |
| 30.000 | panam | Pan-Americana | Van Alaska tot Vuurland. | bergen |
| 40.075 | milestone_40075 | Rondje aarde | Eén keer rond de evenaar. | wereldbol |

- De **Maanreis** (384.400 km) blijft een badge in de categorie "Legendarisch".
- Migratie (1.2.0): de kale mijlpalen (2.500 t/m 100.000 km en de doorlopende per 25.000 km) zijn verwijderd, inclusief hun seen-vlaggen en een eventuele keuze om er een te volgen (dan valt de app terug op de automatische keuze). 1.000 km en Rondje aarde behouden hun id, datum en seen-status. De nieuwe bestemmingen worden met terugwerkende kracht berekend en verschijnen in het reveal-scherm.

### Badges
Badges worden gedefinieerd als **data** (een array met `id`, `naam`, `beschrijving`, `hint`, `categorie`, `xp`, `vereist` (benodigde sensoren) en `check(context)`). Zo zijn ze makkelijk uit te breiden.

Een badge wordt **met terugwerkende kracht** berekend. **Badges worden nooit afgepakt:** gehaalde badges worden vastgelegd (tabel `earned_badges`); bevestigt een latere berekening (bijv. na een gewijzigde verbruiksmethode) een badge niet meer, dan blijft hij staan met zijn vastgelegde datum. Bij de overstap (1.4.0) gelden badges die al in een reveal gezien zijn als gehaald. De ontgrendeldatum is het moment waarop de voorwaarde voor het eerst werd gehaald, niet het moment van berekenen. `check(context)` geeft dat moment terug (of niets). Het bonus-XP van een badge telt mee voor het level vanaf de ontgrendeldatum.

Uitwerking van "het eerste moment":
- Afstandsbadges (dag, week, maand, weekend): de odometermeting waarmee de afstand binnen die periode werd gehaald.
- Streaks: de meting waarmee op de laatste dag van de reeks 1 km werd gehaald.
- `rest_day`: middernacht na de 7e volledige dag zonder te rijden.
- `night_owl`/`early_bird`: de tweede meting van het ritblok (pas dan telt het ritblok, zie hieronder).
- Laadbadges: het einde van de sessie die de voorwaarde haalt. Lopende sessies tellen nog niet mee. `full_tank`: SoC aan het einde ≥ 100%. `running_on_fumes`: de eerste SoC-meting ≤ 10%.
- `eco_week`: alleen afgeronde ISO-weken met minstens één laadsessie; ontgrendeld op middernacht na die week.

**Rijden**

| id | Naam | Voorwaarde | XP |
|---|---|---|---|
| first_100_day | Lekker op weg | ≥ 100 km op één dag | 50 |
| day_300 | Lange adem | ≥ 300 km op één dag | 150 |
| day_500 | IJzeren zitvlees | ≥ 500 km op één dag | 300 |
| streak_7 | Gewoontedier | 7 dagen op rij ≥ 1 km | 100 |
| streak_30 | Onstuitbaar | 30 dagen op rij ≥ 1 km | 400 |
| month_1000 | Maandmonster | ≥ 1.000 km in een kalendermaand | 200 |
| week_1000 | Week van de weg | ≥ 1.000 km in een kalenderweek | 300 |
| weekend_warrior | Weekendkrijger | ≥ 200 km in één weekend (za+zo) | 100 |
| night_owl | Nachtuil | een ritblok dat start tussen 00:00 en 04:00 | 75 |
| early_bird | Vroege vogel | een ritblok dat start tussen 05:00 en 06:00 | 75 |
| rest_day | Rustdag | 7 dagen zonder te rijden (verborgen badge) | 25 |

Badges die op tijdstip gebaseerd zijn (`night_owl`, `early_bird`) tellen alleen voor ritblokken met minstens twee odometer-metingen. Een ritblok met één meting (begin = eind) zegt te weinig over het werkelijke vertrektijdstip.

**Laden** (alleen als de sensoren zijn ingesteld)

| id | Naam | Voorwaarde | XP |
|---|---|---|---|
| first_charge | Eerste prik | eerste laadsessie | 25 |
| first_dc | Snelle jongen | eerste DC-sessie | 50 |
| charges_10 / _50 / _100 | Stekkervaste I/II/III | 10/50/100 sessies | 50/150/300 |
| full_tank | Tot de nok | sessie eindigt op 100% | 50 |
| running_on_fumes | Op de valreep | SoC ≤ 10% gemeten | 75 |
| dc_150 | Volle bak | gemiddeld ≥ 75 kW in één sessie | 100 |
| mwh_1 | Eerste megawattuur | cumulatief ≥ 1.000 kWh geladen | 250 |

**Zuinigheid** (indicatief)

| id | Naam | Voorwaarde | XP |
|---|---|---|---|
| eco_week | Zuinige week | weekschatting ≤ 17 kWh/100 km bij ≥ 150 km | 100 |

**Rijden – temperatuur** (alleen met `temperature_entity`)

| id | Naam | Voorwaarde | XP |
|---|---|---|---|
| ice_cold | IJskoud | ritblok gestart bij < 0 °C, met minstens twee odometer-metingen | 75 |
| winter_hard | Winterhard | afgeronde week met gemiddeld < 5 °C en verbruiksschatting < 20 kWh/100 km bij ≥ 150 km (ook laadsensoren nodig) | 150 |

**Groen** (schattingen; zie Groen hieronder)

| id | Naam | Voorwaarde | XP |
|---|---|---|---|
| green_start | Groene start | 100 kg CO₂ bespaard (laadsensoren nodig) | 50 |
| first_ton | Eerste ton | 1.000 kg CO₂ bespaard (laadsensoren nodig) | 200 |
| climate_champion | Klimaatkampioen | 5.000 kg CO₂ bespaard (laadsensoren nodig) | 500 |
| never_refuel | Nooit meer tanken | 1.000 liter benzine niet verbrand | 250 |

**Uitdagingen**

| id | Naam | Voorwaarde | XP |
|---|---|---|---|
| challenger | Uitdager | 10 weekuitdagingen gehaald | 150 |
| persistent | Doorzetter | 25 weekuitdagingen gehaald | 300 |
| challenge_year | Een jaar vol uitdagingen | 52 weekuitdagingen gehaald | 600 |

Alle nieuwe badges hebben een eigen pixel-art icoon en worden met terugwerkende kracht berekend. Badges met voortgang (Groen, Uitdagingen) zijn te volgen; IJskoud en Winterhard zijn ja/nee-badges zonder meetbare voortgang.

**Legendarisch**

| id | Naam | Voorwaarde | XP |
|---|---|---|---|
| moon_trip | Maanreis | kilometerstand ≥ 384.400 km (de afstand tot de maan), met voortgang | 5.000 |

### Temperatuur (alleen met `temperature_entity`)
- De temperatuur wordt meegelezen zoals de andere sensoren (ook in de backfill) en opgeslagen in °C.
- Elk ritblok krijgt de temperatuur bij de start (de laatste meting vóór de start, mits niet ouder dan 3 uur). Elke dag krijgt het daggemiddelde (gemiddelde van de metingen van die dag).
- Historie toont de temperatuur bij de recente ritblokken en in de daggrafiek, en een grafiek met verbruik per maand (staven) en de gemiddelde temperatuur (lijn). Het maandverbruik is een schatting en wordt pas getoond vanaf 100 km in die maand.

### Groen
- CO₂ bespaard = km × `co2_petrol_kg_per_km` − verbruikte energie (zie Data) × `co2_grid_kg_per_kwh`; nooit negatief getoond. Zonder laadsensoren wordt geen CO₂ getoond.
- Liters niet verbrand = km × `petrol_l_per_100km` / 100.
- Bomen = CO₂ ÷ 20 kg (wat één boom per jaar opneemt).
- De km zijn de gemeten km (som van de dagtotalen), niet de totale kilometerstand.
- Getoond op het Laden-scherm (met "schatting"), in een slide van het jaaroverzicht en op de deelkaart. De bomen heten overal "Gelijk aan": waarde "X bomen", subtekst "die een jaar lang CO₂ opnemen".

### Weekuitdaging
- Elke week (maandag 00:00 in de HA-tijdzone) wordt één uitdaging gekozen. De keuze gebeurt de eerste keer dat de app in die week rekent, met alleen de gegevens van vóór die maandag; een week waarin de app niet draait, krijgt geen uitdaging. Bij de eerste start na de update krijgt de lopende week meteen een uitdaging.
- Pool (laaduitdagingen alleen met laadsensoren):
  - **km** – rij deze week minstens X km. Doel = gemiddelde van de laatste 4 volledige weken × 1,1, afgerond op 10 (minimaal 50). Startwaarde 200 km.
  - **days** – rij op minstens X dagen. Doel = afgerond gemiddelde + 1 (tussen 2 en 7). Startwaarde 4.
  - **max_charges** – laad hooguit X keer. Doel = gemiddelde × 0,9, naar beneden (minimaal 1). Startwaarde 3.
  - **consumption** – verbruiksschatting ≤ X kWh/100 km bij minstens 100 km. Doel = gemiddelde × 0,95. Startwaarde 18.
- Zonder 4 volledige weken meting worden de startwaarden gebruikt. Het type wordt deterministisch per week gekozen en is nooit hetzelfde als vorige week.
- km- en dagen-uitdagingen zijn gehaald zodra het doel bereikt is; laad- en verbruiksuitdagingen worden aan het eind van de week beoordeeld. Gehaald = 100 bonus-XP (telt mee voor het level) en een item in het reveal-scherm. Niet gehaald aan het eind van de week = gemist.
- Uitdagingen en resultaten staan in de database (tabel `challenges`) en blijven als geschiedenis zichtbaar in Historie. De cockpit toont de uitdaging van deze week met doel, voortgang en resterende dagen.

### Weekterugblik
- Bij de eerste keer openen in een nieuwe week verschijnt vóór de reveal-items één kaart "Vorige week": gereden km, aantal laadsessies (met laadsensoren) en het meest opvallende feit. Volgorde: een nieuw record dat vorige week is gezet > de weekuitdaging (gehaald of gemist) > de beste dag van de week. De kaart heeft een eigen seen-vlag per week en verschijnt pas als er een volledige week meting achter ligt.

### Gevolgde badge
- Op de cockpit staat één **gevolgde badge** in de rechterhelft van de Badges-kaart: icoon met voortgangsring, naam en wat er nog resteert. Een tik opent die badge op het Badges-scherm.
- Op het Badges-scherm opent een tik op een badge een detailweergave met de knop **Volgen**. De keuze wordt in de database opgeslagen.
- Alleen badges met meetbare voortgang zijn te volgen, en geen verborgen badges.
- Zonder keuze, of als de gevolgde badge gehaald is, kiest de app automatisch de niet-gehaalde badge met het hoogste voortgangspercentage (bij gelijke stand: de kleinste rest).

### Records
Beste dag, beste week, beste maand, langste streak, langste ritblok, snelste laadsessie (gem. kW) en meeste laadsessies in een maand.

### "Nieuw"-moment
- Elke badge (inclusief Wereldreis-bestemmingen), level-up, nieuwe rang en elk nieuw record heeft een `seen`-vlag.
- Bij het openen van de app verschijnt eerst een **reveal-scherm**: niet-geziene items één voor één (oudste eerst), met een korte retro-animatie (pixel-burst, geen geluid). Elk item wordt als gezien gemarkeerd zodra je verder gaat.
- Na 3 items verschijnt een knop **"Toon alles"**: de overige items staan dan in één lijst en worden met "Klaar" allemaal als gezien gemarkeerd. Zo wordt een grote inhaalslag (bijv. de eerste keer na de badge-update) geen reeks van 20 losse schermen.
- Level-ups worden samengevoegd tot één item: het hoogste nieuwe level, met het aantal gestegen levels.
- Een gehaalde weekuitdaging is een eigen item ("Uitdaging gehaald", +100 XP). De weekterugblik staat altijd vooraan.
- Een nieuwe rang is een eigen item ("Nieuwe rang", met het pixel-art icoon van die rang). Zijn er meerdere nieuwe rangen tegelijk, dan verschijnt alleen de hoogste.
- Ook records die al bestonden vóór de eerste reveal, verschijnen daarin (net als badges, bestemmingen en level-ups). Daarna verschijnt een record alleen opnieuw als het wordt verbeterd in een andere periode of rit.
- Daarbuiten is alles rustig: geen meldingen.

---

## 4. Schermen

Navigatie met de tabs Cockpit, Badges, Historie en Laden (Laden alleen met laadsensoren). Instellingen zitten achter een tandwiel. De navigatie-iconen zijn pixel-art (Cockpit: een stuur; Instellingen: een tandwiel met 8 tanden en een rond gat). De positie is instelbaar (Instellingen → Navigatie):
- **Boven** (standaard): een sticky balk direct onder de kop "Q4 QUEST", met een achtergrond in de themakleur zodat content er niet doorheen schijnt, pixel-iconen met label en een rode onderstreping voor de actieve tab.
- **Onder**: een vaste balk onderaan het scherm.
- **Automatisch**: onder als de user agent "Home Assistant/" bevat (de Companion-app), anders boven.
- Onderaan is er altijd ca. 24px + `env(safe-area-inset-bottom)` marge; bij navigatie onder komt daar de hoogte van de balk bij.

1. **Cockpit** (in deze volgorde: kilometerteller, level, weekuitdaging, vandaag/week/maand, de tegels "Op rij gereden" en "Accu · bereik", en als laatste de Badges-kaart)
   - Grote kilometerteller in LCD-cijfers die bij het openen kort "doortelt" naar de huidige stand. Er staat geen regel "Bijgewerkt … geleden" onder; de kaart is zo compact mogelijk.
   - Bijgewerkt-indicator rechtsonder binnen het LCD-scherm: een klein label in het pixel-font (ca. 55% van de hoogte van de "km"-eenheid) in het accentrood met ca. 50% opaciteit: "↻" + korte notatie van de laatste update van de kilometerstand (`NU` bij minder dan 2 minuten, anders `12M`, `3U` of `2D`). Is de update ouder dan 6 uur, dan wordt de opaciteit ca. 85%. Bij een tik of hover verschijnt de volledige tekst ("Bijgewerkt 3 uur geleden") als tooltip. Werkt in de lichte en de donkere LCD-variant.
   - Levelkaart: level, rangtitel en XP-balk. Onder de balk één regel in de gedempte tekstkleur, met dezelfde opbouw en tekstgrootte als de onderste regel van de weekuitdaging-kaart: links "X XP" (totaal), rechts "nog Y tot level N+1". Geen aparte kolom met XP-tekst naast het level. Een tik op de rang opent het **rangenoverzicht**: bovenaan een kleine samenvatting (totaal XP in het pixel-font, daaronder "X uit kilometers · Y bonus"), dan alle rangen met levelbereik, XP-drempel en een eigen pixel-art icoon; de huidige rang gemarkeerd, toekomstige rangen gedimd.
   - De weekuitdaging van deze week. Regel 1: klein label "WEEKUITDAGING" (gedempt, hoofdletters) links en "+100 XP" als kleine badge rechts. Regel 2: de titel (vet) en regel 3: de opdracht, beide over de volle breedte met het icoon links ervan. Dan de voortgangsbalk. Laatste regel: voortgang ("2 / 4 dagen") links en resterend ("nog 6 dagen") rechts. Korte labels breken nooit af.
   - Vandaag, deze week en deze maand in km.
   - **Streak** en **Accu** naast elkaar, in dezelfde opbouw als de kaarten Vandaag/Week/Maand: label bovenaan, waarde eronder, geen subtekst. Streak: label "Op rij gereden", waarde "9 dagen". Accu: label "Accu · bereik", waarde "87% · 335 km" (met maar één sensor alleen "Accu" of "Bereik" met die waarde); verschijnt alleen met een SoC- of actieradius-sensor.
   - Als laatste blok de kaart **Badges** met twee helften. Links de laatst ontgrendelde badge (icoon, naam, datum). Rechts de gevolgde badge (zie Badges → Gevolgde badge) met een cirkelvormige voortgangsring in pixel-stijl (blokjes in rood op de lijnkleur) om het icoon, met de naam en "nog X" eronder. Een tik op een helft opent die badge op het Badges-scherm (`#/badges/<id>`: scrollt ernaartoe en opent de detailweergave). Er is geen losse kaart voor de gevolgde badge, en geen aparte maanreis- of bestemmingskaart.
2. **Badges**
   - Raster per categorie (Rijden, Laden, Zuinigheid, Groen, Uitdagingen, Wereldreis, Legendarisch). Ontgrendeld: icoon in kleur met datum en bonus-XP. Vergrendeld: silhouet met hint. Verborgen badges tonen "???" (naam en hint blijven geheim tot ontgrendeling). Badges die van een niet-ingestelde sensor afhangen, verschijnen niet.
   - Voortgang: vergrendelde telbare badges (Wereldreis, Maanreis, laadaantallen, streaks, maand-/week-km, megawattuur) tonen een dun voortgangsbalkje met "huidig / doel". Streaks tellen de huidige reeks, maand/week de lopende periode.
   - Kaarten: twee kolommen op schermen smaller dan 420px, anders drie (vier vanaf 560px). Namen worden nooit midden in een woord afgebroken.
   - Teller "x / y".
3. **Historie** (van boven naar beneden)
   - **Periodekeuze** (gedeeld onderdeel, zie Periodekeuze hieronder; eigen bewaarde keuze `setting.history_period`, standaard Alles).
   - **Vier tegels** in een raster van 2×2, met dezelfde opbouw als de Laden-tegels (zie Statistiektegels):
     - Gereden: km in de periode / de werkelijke periode in korte datums ("2 nov – 11 nov"; jaartal alleen bij een jaargrens), vanaf de start van de meting en tot en met vandaag (bij Alles dus vanaf de start van de meting). Bij **Alles**: de huidige kilometerstand van de odometer (het echte totaal, ook de km vóór de start van de meting) met de subtekst "totaal".
     - Rijdagen: aantal dagen met ≥ 1 km / "van Y" (Y = dagen in de periode vanaf de start van de meting tot en met vandaag).
     - Gem. per dag: gereden km ÷ alle dagen in de periode vanaf de start van de meting tot en met vandaag (dagen zonder ritten tellen mee als 0 km), met één decimaal / "hoogste X km" (de hoogste dagafstand in de periode).
     - Drukste dag: de weekdag met het meeste totaal aantal km in de periode ("ma") / "X km totaal".
     - Zonder data in de periode: "–" met "geen data".
   - **km-grafiek** ("Gereden · <periode>"): volgt de periodekeuze; Week en Maand per dag, Jaar en Alles per maand; vaste vensters (alle dagen/maanden van de periode, ook zonder data), dagen/maanden vóór de meting gedimd. Geen eigen Dag/Week/Maand-knoppen of pijltjes in de kaart. Boven de grafiek de waarde van de aangetikte staaf, of anders van vandaag (met de daggemiddelde temperatuur bij dagen). Onder de grafiek een samenvattingsregel: de km van de periode vet links ("705 km") en gedempt het gemeten bereik met korte datums ("12 okt – 11 nov"; jaartal alleen als de periode over een jaargrens gaat), nooit afgebroken (`white-space: nowrap`). Bij **Alles** staat links een gedimde staaf "eerder" met de km vóór de start van de meting (= de eerste bekende odometerstand), alleen als die > 0 is; de samenvattingsregel toont dan het totaal van alle staven (gelijk aan de kilometerstand) met "totaal t/m <datum>". Rijdagen, Gem. per dag en Drukste dag blijven op de gemeten dagen gebaseerd; bij Week, Maand en Jaar is er geen "eerder"-staaf.
   - Verbruik per maand met gemiddelde temperatuur (zie Temperatuur); de uitlezing "november 2026 · gem. 4,8 °C" (met spaties rond de punt). Waarde en label breken niet af; op een smal scherm schuift het label als geheel onder de waarde.
   - **Records · altijd**: de recordlijst over alle tijd.
   - **Ritblokken · <periode>**: ritblokken die in de gekozen periode begonnen (nieuwste eerst, max. 100), met de temperatuur bij de start.
   - Jaaroverzichten en de geschiedenis van de weekuitdagingen (regel 2: titel van de uitdaging · voortgang / doel).
   - Tijdlijn van gebeurtenissen (badges, Wereldreis-bestemmingen, level-ups).
4. **Laden**
   - Volgorde van boven naar beneden: Accu, periodekeuze, tegels (Sessies, Geladen, Verbruik, Gem. laadvermogen), de grafiek Geladen, Groen en Sessies. Er is geen scheidingskop; de titels van Geladen, Groen en Sessies tonen de gekozen periode erachter ("Geladen · november 2026"), zodat duidelijk is welke onderdelen de periode volgen.
   - **Accu** bovenaan (lijngrafiek van de SoC met laadsessies als gearceerde vlakken), los van de periodekeuze, met een eigen kleine segmentknop 24 uur · 7 dagen · 30 dagen (standaard 7 dagen). Laadvlakken in het accentrood `#E30613`: AC met ca. 18% en DC met ca. 35% dekking, in de lichte en de donkere modus; de legenda gebruikt exact dezelfde kleur en dekking. Alleen met een SoC-sensor.
   - **Periodekeuze** (gedeeld onderdeel, zie hieronder; eigen bewaarde keuze `setting.charging_period`, standaard Alles). De keuze geldt voor de tegels, de grafiek Geladen, Groen en de sessielijst.
   - **Vier tegels** in een raster van 2×2 (zie Statistiektegels): Sessies "9" / "8 AC · 1 DC". Geladen ⓘ "208 kWh" / "AC X · DC Y". Verbruik ⓘ "25,2 kWh" / "per 100 km" (zie Verbruiksschatting; minder dan 100 km: "–" / "te weinig data"). Gem. laadvermogen "11,2 kW" / "AC X · DC Y": het gemiddelde over de afgeronde sessies in de periode van kWh ÷ duur per sessie, met de gemiddelden per type (ontbreekt een type, dan valt dat deel weg; zonder sessies "–" / "geen sessies"). De ⓘ bij Geladen legt uit dat de kWh een schatting is; de ⓘ bij Verbruik bevat de uitleg van de methode.
   - **Geladen** (staafgrafiek): Week en Maand per dag, Jaar en Alles per maand; AC en DC gestapeld in twee tinten rood, met legenda. Vaste vensters: alle dagen/maanden van de periode staan erin, ook zonder data; dagen/maanden vóór de start van de meting zijn gedimd. Boven de grafiek het totaal van de periode ("totaal · AC X · DC Y"), of van de aangetikte staaf.
   - **Groen** over de gekozen periode: CO₂ bespaard, liters niet verbrand en "Gelijk aan X bomen" (zie Groen), berekend met dezelfde verbruikte energie als Verbruik (geladen kWh + verschil in accupercentage × accucapaciteit) en de km in de periode. Bij Alles zijn het precies de totalen sinds de start. Een rij pixel-boompjes volgt dezelfde waarde (één per boom, de laatste gedeeltelijk gevuld, max. 20 zichtbaar, daarna "+ X"). Uitleg achter een ⓘ. Daaronder een dunne voortgangsbalk die altijd het **totaal** toont: "Totaal X kg · nog Y kg tot <badgenaam>" (volgende CO₂-badge); zijn alle CO₂-badges gehaald, dan "Alle Groen-badges gehaald" (volle balk).
   - **Sessies**: alleen sessies die in de gekozen periode begonnen (datum, AC/DC, kWh-schatting, SoC van → naar), gegroepeerd per maand met een kop ("November 2026"); datums in de rijen zonder jaartal, kort ("ma 9 nov").
   - Elke rij is een grid met drie vaste kolommen en twee regels. Links het AC/DC-label (vaste breedte, verticaal gecentreerd). Midden: regel 1 de datum, regel 2 "HH:MM · duur" (gedempt). Rechts (rechts uitgelijnd): regel 1 "~X kWh" (vet), regel 2 het SoC-bereik "71% → 100%" (gedempt). Alles `white-space: nowrap`; niets springt naar een extra regel.
   - Onder elke rij een dunne (4px) balk over de volle breedte: gedempte kleur tot het startpercentage, rood van start tot eind, de rest leeg. Geen los accu-icoon in de rij.
   - **Lopende sessie:** dezelfde uitlijning als de andere rijen, zonder extra streep. In plaats van de duur (en bij Einde in het detail) staat "● nu": een klein rood bolletje (accentkleur) met een rustige pulsanimatie, gevolgd door "nu". Het rode deel van de SoC-balk krijgt een subtiele, langzaam bewegende glans. Bij `prefers-reduced-motion` staan beide animaties uit (bolletje en balk blijven statisch).
   - Gemiddeld vermogen staat alleen in een uitklapdetail: een tik op de rij toont begin- en eindtijd, gemiddeld kW en het type ("AC" of "DC", zonder uitleg over hoe het is bepaald). Er is maar één rij tegelijk open.
   - Alle grafieken werken in de lichte en de donkere modus.
- **Periodekeuze** (één herbruikbaar onderdeel, gebruikt op Laden en Historie): segmentknop Week · Maand · Jaar · Alles (zelfde stijl als de andere segmentknoppen). Bij Week/Maand/Jaar staan eronder pijltjes ‹ › om door periodes te bladeren, met de periode als tekst ("week 46, 2026", "november 2026", "2026"). Bladeren gaat niet verder terug dan de periode van de eerste meting en niet verder vooruit dan de huidige. Elke pagina onthoudt haar eigen keuze; standaard Alles. De API neemt `?period=week|month|year|all&key=…`; zonder `period` geldt de bewaarde keuze.
- **Statistiektegels** (Laden en Historie): vier tegels in een raster van 2×2, met exact dezelfde opbouw en hoogte. Regel 1: label (gedempt), met een ⓘ rechts waar van toepassing. Regel 2: waarde in het LCD-/pixel-font met een kleine eenheid, op één regel. Regel 3: één gedempte regel. Geen losse teksten zoals "schatting". Lettergroottes schalen mee met de breedte van het raster, zodat alles ook op een smal scherm (375px) op één regel past.
- **x-as van staafgrafieken:** het label van de eerste staaf is links uitgelijnd en dat van de laatste staaf rechts, zodat niets wordt afgekapt; de andere labels staan gecentreerd onder hun staaf.
5. **Instellingen** (klein, via een tandwiel)
   - Status van de HA-verbinding.
   - Welke sensoren zijn ingesteld.
   - Backfill opnieuw starten.
   - Export van de eigen data als JSON (download, nooit naar de repo).
   - Weergave: Automatisch / Licht / Donker (standaard Automatisch, via `prefers-color-scheme`). De keuze wordt in de database opgeslagen.
   - Navigatie: Boven / Onder / Automatisch (standaard Boven). De keuze wordt in de database opgeslagen.
   - Knop "Voorbeeld jaaroverzicht": toont het jaaroverzicht van het lopende jaar met de data tot nu toe, ook vóór 1 december.
6. **Jaaroverzicht** (volledig scherm, geen tab)
   - Swipebare kaarten (vegen, pijlen, toetsenbord of stippen): intro, totaal km (en aantal rijdagen), beste dag, beste week, langste streak, aantal laadsessies en geladen kWh, AC/DC-verhouding, Groen (CO₂, liters, bomen), nieuwe badges (met iconen en bonus-XP), level-groei (level aan het begin → nu/eind, met XP en rang), "Rondje aarde"-vergelijking (km ÷ 40.075) en een afsluiter. Kaarten zonder gegevens (bijv. laden zonder laadsensoren) vallen weg.
   - **Deelkaart** als laatste slide: een PNG van 1080×1920, getekend met canvas (geen screenshot-library) in de huisstijl van het actieve thema, pas nadat de fonts geladen zijn. Inhoud: "Q4 Quest" + jaar, grote LCD-weergave van de gereden km dat jaar, een raster met hoogtepunten (beste dag, beste week, langste streak, laadsessies, geladen kWh, AC/DC-verhouding, level en rang aan het eind van het jaar), een rij met CO₂ bespaard, liters niet verbrand en bomen, en de in dat jaar gehaalde badges als pixel-iconen. Niets herleidbaars: geen totale kilometerstand van de auto, geen ritdatums of -tijden. De slide toont een voorbeeld; de knop **Delen** gebruikt `navigator.share` met het bestand als `canShare({ files })` dat ondersteunt, en downloadt anders `q4-quest-<jaar>.png`.
   - Alles per kalenderjaar in de tijdzone van HA. Begon de meting in dat jaar, dan loopt het overzicht vanaf de eerste meting; badges die al bij de eerste meting gehaald waren, tellen niet als nieuw.
   - Beschikbaar vanaf 1 december van dat jaar; eerdere jaren blijven altijd terug te kijken (lijst "Jaaroverzichten" in Historie). In december (en in januari voor het vorige jaar) staat een melding op de Cockpit.

---

## 5. Vormgeving: "Night Drive Retro"

- **Thema's:** alle kleuren lopen via CSS-variabelen. De gebruiker kiest Automatisch, Licht of Donker (zie Instellingen).
  - **Donker:** achtergrond `#0A0A0C`, panelen `#141519`, lijnen `#24262C`, tekst `#E8E8EA`, gedempte tekst `#8A8D96`.
  - **Licht:** achtergrond `#F4F4F2`, panelen `#FFFFFF`, lijnen `#E2E2E0`, tekst `#141519`, gedempte tekst `#6A6D76`.
  - De kilometerteller is een LCD-instrument met rode cijfers: in de donkere modus donker, in de lichte modus een licht LCD (achtergrond `#E9E9E6` met een subtiele inset-schaduw, cijfers `#E30613`, lege voorloopnullen in rood met ca. 12% opaciteit, sterk verminderde scanlines en gloed, "km" in gedempt grijs). Grafieken passen mee.
- **Accent:** signaalrood `#E30613` voor voortgang, focus en nieuwe items. Daarnaast een zachte gloed (`box-shadow` in rood met lage opaciteit).
- **Retro:** LCD-/pixelfont voor cijfers en koppen (bijv. VT323 of "Press Start 2P", spaarzaam gebruikt), een strakke moderne sans-serif voor de rest (bijv. Inter of Space Grotesk). Subtiele scanlines alleen op de kilometerteller en het reveal-scherm.
- **Badge-iconen:** eigen pixel-art in SVG (16×16 of 24×24 raster), opgeschaald met `image-rendering: pixelated`.
- **App-iconen** (lichte stijl): `icon.png` (128×128) en `logo.png` (250×100) van de add-on, plus de favicon (32×32) en `apple-touch-icon` (180×180) van de webapp. Lichte achtergrond `#F0F0ED` met subtiele horizontale scanlines, een rode (`#E30613`) pixel-art gamecontroller (kruis links, vier knoppen in ruitvorm rechts) met een zachte rode gloed, en daaronder (icoon) of ernaast (logo) "Q4" of "Q4 QUEST" in het pixelfont. De favicon toont alleen de controller. Gemaakt met `tools/make-icons.mjs`.
- **Algemeen:**
  - Een SoC-bereik wordt overal geschreven met beide procenttekens: "71% → 100%" (nooit afgebroken, `white-space: nowrap`).
  - Geen merklogo's.
  - Respecteer `prefers-reduced-motion`.
  - Goed leesbaar op een telefoon, zonder horizontaal scrollen.
  - Lijsten (ritblokken, laadsessies, records, weekuitdagingen) gebruiken één vaste rij van twee regels: regel 1 de hoofdtekst links (bijv. datum) en de waarde rechts (vet, nooit afgebroken); regel 2 klein en gedempt (bijv. tijdvak of "rond HH:MM", en indien beschikbaar " · temperatuur"). De tijdlijn toont titel en daaronder de datum.
  - Fonts lokaal meeleveren, niet via een CDN (de add-on moet offline werken).

---

## 6. Fasen

Werk ze op volgorde af. Elke fase eindigt met een werkende, installeerbare versie.

0. **Skelet:** repo-structuur, `repository.yaml`, add-on-manifest met opties, Dockerfile en een "Hallo"-pagina via Ingress die toont of de HA-verbinding werkt. Mock-modus bestaat al. → `0.1.0`
1. **Collector + Cockpit:** WebSocket-subscriptie, opslag, backfill, XP/levels/mijlpalen en het Cockpit-scherm. → `0.2.0`
2. **Historie:** dagtotalen, ritblokken, records, het Historie-scherm en de grafieken. → `0.3.0`
3. **Laden:** laadsessies, kWh-schatting, verbruik en het Laden-scherm. → `0.4.0`
4. **Badges:** badge-engine met terugwerkende kracht, het Badges-scherm, het reveal-scherm en de seen-vlaggen. → `0.5.0`
5. **Jaaroverzicht:** een swipebare reeks kaarten met de hoogtepunten van het jaar (zie Schermen → Jaaroverzicht), beschikbaar vanaf 1 december en daarna per jaar terug te kijken, met een voorbeeldknop in Instellingen. → `1.0.0`

## 7. Niet in scope
Locatie/GPS, meerdere gebruikers of bestuurders, pushmeldingen, iets terugschrijven naar HA, en externe diensten of analytics.
