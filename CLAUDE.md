# Werkafspraken (zie docs/SPEC.md §0)

- **Taal:** UI-teksten, uitleg, README en meldingen zijn Nederlands. Code, identifiers en commitberichten zijn Engels. Commentaar in de code is Nederlands.
- **Geen merknamen** van fabrikanten in code, data, UI, commentaar, testnamen of commits. De kleppen heten uitsluitend **Type A** en **Type B**.
- **Pure kern:** `src/core/**` en `src/concepts/*/model/**` zijn pure TypeScript zonder React of DOM en zijn unit-testbaar.
- **Eenheden:** intern SI (m, s, kg, W, Pa, °C/K, m³/s). Alleen de UI rekent om naar l/h, kPa, mm, kW en kWh. Uitzondering: concept 2 (peakshaving) rekent bewust in kW, kWh, °C/K en uren (`docs/SPEC-peakshaving.md` §0.1).
- **Getalnotatie:** de UI gebruikt `Intl.NumberFormat('nl-NL')` (zie `src/core/format.ts`).
- **Disclaimer** in de footer van elke pagina: "Indicatief rekenmodel voor uitleg en conceptkeuze. Geen vervanging van de productberekening van de fabrikant."
- Aannames die niet in de spec staan: noteren in `docs/AANNAMES.md`.

## Commando's

- `npm run dev` — ontwikkelserver · `npm test` — Vitest · `npm run lint` — ESLint · `npm run build` — typecheck + productiebuild.
- Na elke wijziging in `model/`: `npm test` (de referentiewaarden uit spec §9 staan in `tests/`).
- Peakshaving: de Python-referentie `tools/peakshaving_ref/peakshaving_ref.py` is leidend; pas `tests/peakshaving/fixtures/referentiewaarden.json` nooit aan om een test te laten slagen.
