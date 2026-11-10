# Changelog

## 0.1.0

Eerste versie: het skelet.

- De add-on is te installeren en opent via de zijbalk (Ingress).
- Een "Hallo"-pagina laat zien of de verbinding met Home Assistant werkt, welke Home Assistant-versie en tijdzone er gevonden zijn en welke sensoren zijn ingesteld.
- Zonder kilometerstand-sensor verschijnt een instelscherm met uitleg.
- Alle sensoren stel je in via de add-on-opties.
- Mock-modus (`MOCK=1`): de app draait zonder Home Assistant met een paar maanden gegenereerde ritten en laadsessies.
- De database (`/data/q4quest.db`) wordt aangemaakt met genummerde migraties.
