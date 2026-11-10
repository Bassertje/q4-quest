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
| `battery_kwh` | float | nee, standaard 77 | bruikbare accucapaciteit, voor kWh-schattingen |

Defaults zijn leeg. Zonder `odometer_entity` toont de app een vriendelijk instelscherm met uitleg.

Functies die afhangen van een optionele sensor die niet is ingesteld, worden verborgen. Badges die daarvan afhangen, verschijnen niet.

---

## 2. Data

### Collectie
- Abonneer op `state_changed` voor de ingestelde entities. Sla elke geldige wijziging op als `readings(entity_key, ts, value, attrs_json)`.
- Negeer `unknown` en `unavailable`. Negeer een odometerwaarde die **lager** is dan de vorige: log hem, maar tel hem niet mee.
- Bij een herstart of herverbinding: haal de gemiste periode op via de history-API en ga verder. Gebruik reconnect met backoff.

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
- **Verbruiksschatting:** geladen kWh ÷ gereden km over voortschrijdende 30 dagen. Toon dit alleen bij minstens 300 km en 3 sessies, en altijd met het label "schatting".

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

Een badge wordt **met terugwerkende kracht** berekend. De ontgrendeldatum is het moment waarop de voorwaarde voor het eerst werd gehaald, niet het moment van berekenen. `check(context)` geeft dat moment terug (of niets). Het bonus-XP van een badge telt mee voor het level vanaf de ontgrendeldatum.

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

**Legendarisch**

| id | Naam | Voorwaarde | XP |
|---|---|---|---|
| moon_trip | Maanreis | kilometerstand ≥ 384.400 km (de afstand tot de maan), met voortgang | 5.000 |

### Gevolgde badge
- Op de cockpit staat één **gevolgde badge**: icoon, naam, voortgangsbalk "huidig / doel" en wat er nog resteert. Een tik opent het Badges-scherm.
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
- Een nieuwe rang is een eigen item ("Nieuwe rang", met het pixel-art icoon van die rang). Zijn er meerdere nieuwe rangen tegelijk, dan verschijnt alleen de hoogste.
- Ook records die al bestonden vóór de eerste reveal, verschijnen daarin (net als badges, bestemmingen en level-ups). Daarna verschijnt een record alleen opnieuw als het wordt verbeterd in een andere periode of rit.
- Daarbuiten is alles rustig: geen meldingen.

---

## 4. Schermen

Navigatie onderaan (mobiel-eerst), bovenaan op desktop, met de tabs Cockpit, Badges, Historie en Laden (Laden alleen met laadsensoren). Instellingen zitten achter een tandwiel. De navigatie-iconen zijn pixel-art (Cockpit: een stuur; Instellingen: een tandwiel met 8 tanden en een rond gat).

1. **Cockpit**
   - Grote kilometerteller in LCD-cijfers die bij het openen kort "doortelt" naar de huidige stand.
   - Level, rangtitel en XP-balk. Een tik op de rang opent het **rangenoverzicht**: alle rangen met levelbereik, XP-drempel en een eigen pixel-art icoon; de huidige rang gemarkeerd, toekomstige rangen gedimd.
   - **Volgende bestemming**: naam, icoon en voortgang naar de eerstvolgende Wereldreis-badge, met "nog X km" en het verhaal. Is de hele wereldreis voltooid, dan staat er "Volgende stop: de maan".
   - Vandaag, deze week en deze maand in km.
   - De huidige streak.
   - Laatst ontgrendelde badge.
   - SoC en actieradius, als die zijn ingesteld.
   - De gevolgde badge (zie Badges → Gevolgde badge). Er is geen aparte maanreis-kaart meer; de Maanreis is een badge.
2. **Badges**
   - Raster per categorie (Rijden, Laden, Zuinigheid, Wereldreis, Legendarisch). Ontgrendeld: icoon in kleur met datum en bonus-XP. Vergrendeld: silhouet met hint. Verborgen badges tonen "???" (naam en hint blijven geheim tot ontgrendeling). Badges die van een niet-ingestelde sensor afhangen, verschijnen niet.
   - Voortgang: vergrendelde telbare badges (Wereldreis, Maanreis, laadaantallen, streaks, maand-/week-km, megawattuur) tonen een dun voortgangsbalkje met "huidig / doel". Streaks tellen de huidige reeks, maand/week de lopende periode.
   - Kaarten: twee kolommen op schermen smaller dan 420px, anders drie (vier vanaf 560px). Namen worden nooit midden in een woord afgebroken.
   - Teller "x / y".
3. **Historie**
   - Staafgrafiek km per dag, week en maand (schakelbaar).
   - Recordlijst.
   - Tijdlijn van gebeurtenissen (badges, Wereldreis-bestemmingen, level-ups).
4. **Laden**
   - Lijst met sessies (datum, AC/DC, kWh-schatting, SoC van → naar, gem. kW).
   - Totalen en de verbruiksschatting.
5. **Instellingen** (klein, via een tandwiel)
   - Status van de HA-verbinding.
   - Welke sensoren zijn ingesteld.
   - Backfill opnieuw starten.
   - Export van de eigen data als JSON (download, nooit naar de repo).
   - Weergave: Automatisch / Licht / Donker (standaard Automatisch, via `prefers-color-scheme`). De keuze wordt in de database opgeslagen.
   - Knop "Voorbeeld jaaroverzicht": toont het jaaroverzicht van het lopende jaar met de data tot nu toe, ook vóór 1 december.
6. **Jaaroverzicht** (volledig scherm, geen tab)
   - Swipebare kaarten (vegen, pijlen, toetsenbord of stippen): intro, totaal km (en aantal rijdagen), beste dag, beste week, langste streak, aantal laadsessies en geladen kWh, AC/DC-verhouding, nieuwe badges (met iconen en bonus-XP), level-groei (level aan het begin → nu/eind, met XP en rang), "Rondje aarde"-vergelijking (km ÷ 40.075) en een afsluiter. Kaarten zonder gegevens (bijv. laden zonder laadsensoren) vallen weg.
   - **Deelkaart** als laatste slide: een PNG van 1080×1920, getekend met canvas (geen screenshot-library) in de huisstijl van het actieve thema, pas nadat de fonts geladen zijn. Inhoud: "Q4 Quest" + jaar, grote LCD-weergave van de gereden km dat jaar, een raster met hoogtepunten (beste dag, beste week, langste streak, laadsessies, geladen kWh, AC/DC-verhouding, level en rang aan het eind van het jaar) en de in dat jaar gehaalde badges als pixel-iconen. Niets herleidbaars: geen totale kilometerstand van de auto, geen ritdatums of -tijden. De slide toont een voorbeeld; de knop **Delen** gebruikt `navigator.share` met het bestand als `canShare({ files })` dat ondersteunt, en downloadt anders `q4-quest-<jaar>.png`.
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
- **Algemeen:**
  - Geen merklogo's.
  - Respecteer `prefers-reduced-motion`.
  - Goed leesbaar op een telefoon, zonder horizontaal scrollen.
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
