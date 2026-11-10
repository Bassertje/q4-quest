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

## Status van deze versie

Versie 0.1.0 is het skelet: de pagina laat zien of de verbinding met Home Assistant werkt en
welke sensoren zijn ingesteld. Het spel zelf volgt in de volgende versies.
