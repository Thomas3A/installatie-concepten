# Startopdracht voor Claude Code (plakken als eerste bericht)

Vooraf: pak `peakshaving-handoff.zip` uit in de root van de repo `installatie-concepten` (de mappen `docs/`, `scripts/`, `tools/` en `src/concepts/peakshaving/data/` komen dan op hun plek), commit dat als "Add peakshaving hand-off: spec, climate data, reference model", en start Claude Code in de repo-root.

---

Bouw concept 2 van deze website: **peakshaving van een lucht/water-warmtepomp met warmtebuffer en batterij**.

1. Lees eerst volledig: `CLAUDE.md`, `docs/SPEC.md` §0 (werkafspraken), `docs/SPEC-peakshaving.md` (de bouwopdracht), `tools/peakshaving_ref/peakshaving_ref.py` (normatief rekenmodel) en `docs/klimaat/README.md`. Bekijk daarna de bestaande opzet van `src/concepts/klimaatplafond/` zodat het nieuwe concept dezelfde structuur, stijl, uPlot-wrapper, share-mechanisme en printweergave hergebruikt.
2. Werk op branch `claude/peakshaving` in de vijf fasen van spec §0.4; één commit per fase; `npm test`, `npm run lint` en `npm run build` moeten groen zijn vóór elke commit. Begin met fase 1 (data + pure kern + alle tests van spec §9) en controleer de TypeScript-uitkomsten tegen `tools/peakshaving_ref/referentiewaarden.json` binnen de toleranties van §9 voordat je aan de UI begint. Wijkt iets af, zoek dan de afwijking in de port (de Python is leidend) — pas de referentiewaarden niet aan.
3. Houd je aan de werkafspraken: Nederlandse UI/teksten/commentaar, Engelse code en commits, geen merknamen, pure kern zonder React/DOM, `Intl.NumberFormat('nl-NL')`, disclaimer in de footer (met de klimaatzin uit spec §0.1). Aannames buiten de spec noteer je in `docs/AANNAMES.md`; vraag niet om bevestiging tussen de fasen.
4. Na fase 5: README bijwerken, PR openen naar `main` met een samenvatting per fase en een screenshot van het resultaat; melden welke stappen ik nog moet doen om `https://thomas3a.github.io/installatie-concepten/#/peakshaving` live te krijgen.
