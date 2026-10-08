# Installatieconcepten

Interactieve rekenmodellen en visualisaties van installatieconcepten. Het eerste concept is een
**klimaatplafond met 6-weg-klep** in een open kantoor: metalen plafondpanelen met koperen meanderactivering,
aangesloten op één tot drie 6-weg-kleppen in een 4-pijpssysteem.

De tool maakt de "puzzel" zichtbaar: hoe hangen het aantal panelen in serie, buisdiameter, debiet, drukval,
Reynoldsgetal, ΔT en vermogen samen — en wat er gebeurt als strengen ongelijk zijn zonder inregeling na de klep.

**Live:** zie de GitHub Pages-link van deze repository (Settings → Pages).

> Indicatief rekenmodel voor uitleg en conceptkeuze. Geen vervanging van de productberekening van de fabrikant.

## Wat zit erin

- Homepage met concepttegels; het klimaatplafond is actief, de andere concepten staan als "binnenkort".
- Volledige configuratie (ruimte, water, plafond, kleppen, regeling) met bereiken en toelichting per invoer.
- Automatisch koppelen van panelen tot strengen (puzzelmatrix met ★-advies) en handmatige strengeditor.
- Hydraulisch netwerk per klep (direct retour of Tichelmann) zonder inregeling: ongelijke verdeling blijft zichtbaar.
- Type A (schakelende 6-weg + PICV) en Type B (modulerende 6-weg met flow- en ΔT-meting, ΔT-manager).
- Dynamische simulatie met PI-regeling, dauwpuntbeveiliging, paneeltraagheid en ruimtemodel (1–3 zones).
- Plafondplattegrond (SVG + canvas) met echte meanders, drie kleuroverlays, stromingsdeeltjes, zoomen/pannen.
- Tabbladen Dynamiek, Puzzel, Klep en Uitleg; meldingen met "Waarom?"; tien scenario's; deelbare link; printweergave.

## Lokaal starten

```bash
npm i
npm run dev        # ontwikkelserver op http://localhost:5173
npm test           # Vitest: kern, model, simulatie en referentiewaarden (docs/SPEC.md §9)
npm run lint       # ESLint
npm run build      # typecheck + productiebuild naar dist/
```

## Deploy (GitHub Pages)

De workflow `.github/workflows/ci.yml` draait bij elke push lint, tests en build en publiceert de site naar
GitHub Pages vanaf de standaardbranch (`main`). De Vite-`base` wordt gezet via `VITE_BASE=/<reponaam>/`. De router is een
`HashRouter`, dus er zijn geen server-rewrites nodig.

Eenmalig instellen: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Een concept toevoegen

1. Maak een map `src/concepts/<id>/` met een `model/` (pure TypeScript) en `ui/` (React).
2. Voeg één regel toe aan `src/concepts/index.ts` met `{ id, titel, beschrijving, status: 'actief', route, component }`
   (de component wordt lazy geladen). Gebruik de gedeelde kern in `src/core/` voor stofwaarden, wrijving en netwerken.

## Structuur

```
src/core/                 concept-onafhankelijke natuurkunde (water, wrijving, Nusselt, netwerk, PI)
src/concepts/klimaatplafond/
  data/                   klepdata, buizen, plafondkarakteristiek, grenswaarden
  model/                  paneel, streng, netwerk, kleppen, ontwerp, ruimte, regeling, simulatie, meldingen
  ui/                     instellingen, plattegrond, tabbladen, meldingen
  scenarios.ts texts.ts share.ts store.ts
docs/SPEC.md              de volledige specificatie
docs/AANNAMES.md          modelaannames en vereenvoudigingen
tests/                    Vitest
```
