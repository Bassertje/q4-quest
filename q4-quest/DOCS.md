# Q4 Quest

Een rustige maar verslavende game rond je elektrische auto. Gereden kilometers worden XP,
mijlpalen en badges. De add-on leest alleen gegevens uit Home Assistant en schrijft nooit iets terug.

## Installatie

1. Voeg deze repository toe in de Add-on Store (⋮ → Repositories).
2. Installeer **Q4 Quest**.
3. Vul op het tabblad **Configuratie** minimaal de kilometerstand-sensor in.
4. Start de add-on en open **Q4 Quest** in de zijbalk.

## Opties

| Optie | Verplicht | Uitleg |
|---|---|---|
| `odometer_entity` | ja | Sensor met de totale kilometerstand (km), bijv. `sensor.my_ev_odometer`. |
| `soc_entity` | nee | Accupercentage (%). |
| `charging_power_entity` | nee | Laadvermogen (W of kW; de eenheid wordt uit de sensor gelezen). |
| `charging_state_entity` | nee | Laadstatus (laden of niet). |
| `charging_type_entity` | nee | Laadtype, AC of DC. |
| `range_entity` | nee | Resterende actieradius (km). |
| `parking_brake_entity` | nee | Parkeerrem; helpt om ritten van elkaar te scheiden. |
| `battery_kwh` | nee | Bruikbare accucapaciteit in kWh (standaard 77), voor kWh-schattingen. |

Optionele sensoren die je niet invult, worden overgeslagen; functies en badges die ervan
afhangen, verschijnen dan niet. Zonder kilometerstand-sensor toont de app een instelscherm.

Na het wijzigen van opties moet je de add-on herstarten.

## Gegevens en privacy

- Alle gegevens blijven lokaal, in `/data/q4quest.db` binnen de add-on. Ze worden meegenomen in
  Home Assistant-back-ups.
- Er wordt niets naar externe diensten gestuurd.

## Hoe het werkt

- **XP en levels:** je krijgt 1 XP per kilometer op de teller. Voor level *L* heb je in totaal
  50 × L × (L + 1) XP nodig. Per 5 levels krijg je een nieuwe rangtitel.
- **Mijlpalen:** 1.000, 2.500, 5.000, 7.500, 10.000, 15.000, 20.000, 25.000, 40.075 ("Rondje aarde"),
  50.000, 75.000 en 100.000 km, daarna elke 25.000 km. De Maanreis loopt tot 384.400 km.
- **Dagtotaal:** de laatste kilometerstand van een dag min de laatste stand van de vorige dag met
  gegevens. Dagen, weken (maandag t/m zondag) en maanden volgen de tijdzone van Home Assistant.
- **Streak:** het aantal dagen op rij dat je minstens 1 km hebt gereden. Heb je vandaag nog niet
  gereden, dan telt de reeks tot en met gisteren nog mee.

- **Ritblok:** opeenvolgende stijgingen van de kilometerstand met minder dan 45 minuten ertussen.
  Met een parkeerrem-sensor splitst het aanzetten van de parkeerrem ook een ritblok. Een korte
  laadstop onderweg hoort dus bij hetzelfde ritblok. Ritblokken zijn indicatief, omdat de auto de
  kilometerstand niet realtime doorgeeft.
- **Records:** beste dag, week en maand, langste streak, grootste ritblok (indicatief), snelste
  laadsessie (gemiddeld vermogen) en meeste laadsessies in een maand.
- **Tijdlijn:** mijlpalen en level-ups, gedateerd op het moment dat ze voor het eerst werden gehaald.

## Laden

Het scherm **Laden** verschijnt als je een sensor voor het laadvermogen of de laadstatus hebt ingesteld.

- **Laadsessie:** een periode met status "laden" of laadvermogen boven 0 is een kandidaat. Kandidaten
  die minder dan 30 minuten uit elkaar liggen worden samengevoegd. Een kandidaat telt alleen als het
  accupercentage minstens 2 procentpunt stijgt (de laatste waarde vóór de start vergeleken met de
  hoogste waarde tot 30 minuten na het einde). Zo vallen valse meldingen weg. Zonder
  accupercentage-sensor telt elke kandidaat. Als statuswaarde voor laden worden onder meer
  `charging`, `laden` en `on` herkend.
- **kWh-schatting:** de stijging van het accupercentage × `battery_kwh`. Alleen zonder
  accupercentage-sensor wordt het gemeten vermogen opgeteld (trapeziumregel); de eenheid (W of kW)
  komt uit de sensor.
- **Gemiddeld vermogen ("gem."):** kWh gedeeld door de duur van de sessie.
- **AC/DC:** DC als de laadtype-sensor tijdens de sessie of tot 10 minuten erna "DC" meldt, of als het
  gemiddelde vermogen boven 22 kW ligt. Anders AC.
- **Verbruiksschatting:** geladen kWh gedeeld door gereden km over de laatste 30 dagen. Deze
  wordt pas getoond vanaf 300 km en 3 sessies en is altijd een schatting (laadverliezen, laden
  zonder gemeten sessie).

## Backfill

Bij de eerste start haalt de app de geschiedenis op uit Home Assistant: de langetermijnstatistieken
van de kilometerstand (per uur) en de gedetailleerde historie van alle ingestelde sensoren, zo ver als
de recorder teruggaat. Via **Instellingen → Backfill opnieuw starten** kun je dit later herhalen;
bestaande gegevens blijven bewaard en dubbele metingen worden overgeslagen.

## Weergave

Onder **Instellingen → Weergave** kies je Automatisch (volgt de licht/donker-instelling van je
apparaat), Licht of Donker. De keuze wordt in de database van de add-on bewaard.

## Export

Via **Instellingen → Exporteren** download je al je opgeslagen metingen als JSON-bestand.
