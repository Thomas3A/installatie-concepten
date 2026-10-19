# Update klimaatjaren — opdracht voor Claude Code

Pak `peakshaving-update-klimaatjaren.zip` uit in de repo-root (bestaande bestanden overschrijven), verwijder daarna handmatig het oude `src/concepts/peakshaving/data/knmi-debilt-1991-2025.json`, en geef Claude Code onderstaande opdracht.

## Wat er in de zip zit

| Pad | Status | Inhoud |
|---|---|---|
| `src/concepts/peakshaving/data/referentiejaren.json` | **vervangen** | nu vijf jaren: `energie`, `T5`, `T1` (ongewijzigd) + `winter1979`, `winter1963`; per jaar een veld `omschrijving`; bij de stresstestjaren is `maandgemiddelde_T_NEN5060_2018` = `null` |
| `src/concepts/peakshaving/data/knmi-debilt-1951-2025.json` | **nieuw** (vervangt `knmi-debilt-1991-2025.json`) | werkelijke jaren 1951–2025; `meta.aanbevolen_stresstest` toegevoegd |
| `tests/peakshaving/fixtures/referentiewaarden.json` en `tools/peakshaving_ref/referentiewaarden.json` | **vervangen** | cases W9–W11 en K6–K7 erbij; `koudste_week_start` nu cyclisch |
| `tools/peakshaving_ref/peakshaving_ref.py`, `run_cases.py`, `README.md` | **vervangen** | `koudste_week` is cyclisch (mag over de jaargrens dec→jan lopen); extra cases |
| `docs/SPEC-peakshaving.md` | **vervangen** | §4.1–4.4, §6.3, §9.2, §9.5, §10, §11, §12 bijgewerkt |
| `docs/klimaat/README.md`, `referentiejaar_winter1979.csv`, `referentiejaar_winter1963.csv`, `statistiek_jaren.csv`, `winterstatistiek_1951_2025.csv` | vervangen / nieuw | documentatie |
| `scripts/klimaat/build_reference_years.py`, `winter_stats.py`, `parse_knmi.py`, `download_knmi.sh` | vervangen / nieuw | reproductie |

---

## Opdracht (plakken in Claude Code)

De klimaatdata van het peakshaving-concept zijn bijgewerkt; de code moet daarop worden aangepast. Lees eerst `docs/SPEC-peakshaving.md` §4.1 t/m §4.4 en §9.2, en `docs/klimaat/README.md`. Werk op branch `claude/peakshaving-klimaatjaren`, commit per stap, `npm test` / `npm run lint` / `npm run build` groen vóór elke commit, PR naar `main`.

1. **Data-import.** `referentiejaren.json` bevat nu vijf jaren (`energie`, `T5`, `T1`, `winter1979`, `winter1963`) en per jaar een veld `omschrijving`; `maandgemiddelde_T_NEN5060_2018` is `null` bij de twee stresstestjaren. De werkelijke jaren staan in `knmi-debilt-1951-2025.json` (75 jaren; `meta.aanbevolen_stresstest` = `[1956, 1963, 1979, 1985, 1986, 1987, 1996, 1997, 2010, 2012]`). Pas `model/climate.ts`, de types en de dynamic import aan; verwijder alle verwijzingen naar `knmi-debilt-1991-2025.json`.
2. **Keuzelijst klimaatjaar** (spec §4.3): volgorde en labels overnemen; **default wordt T1** (was T5); de twee stresstestjaren erbij met hun omschrijving als tooltip; de sub-lijst werkelijke jaren loopt nu van 1951 t/m 2025 met de aanbevolen stresstestjaren gemarkeerd; de toelichtingstekst onder de keuzelijst vervangen door de nieuwe tekst uit §4.3.
3. **Koudste week cyclisch** (spec §4.4): `coldestWeekStart` moet het 168-uursvenster ook over de jaargrens laten lopen (startuur mag > 8760 − 168 zijn; vensterindex `(start + k) mod 8760`). De koude-weekgrafieken en de scrubber moeten zo'n venster correct tonen (x-as "31 dec … 7 jan", data uit december vóór 1 januari geplakt). Controle: `winter1979` met de woning-defaults geeft startuur 8736.
4. **Robuustheidstabel** (spec §6.3): vijf rijen (energie, T5, T1, winter1979, winter1963).
5. **Tests** (spec §9.2 en §9.5): `climate.test.ts` uitbreiden (vijf jaren, `null`-veld, 75 werkelijke jaren, `startWeekdag[1963] = 2`, `startWeekdag[1979] = 1`, cyclische koude week), `simulate.test.ts` uitbreiden met W9–W11 en K6–K7 uit de nieuwe fixture, binnen de toleranties van §9. Bestaande referentiewaarden voor energie/T5/T1 zijn ongewijzigd en moeten groen blijven.
6. **Scenario 8** heet nu *"Kantoor 100 kW — stresstest strenge winter 1978/79 met 20 m³ buffer"* en gebruikt klimaatjaar `winter1979`.
7. **Uitleg-tab en aannames**: sectie 8 van de uitleg (spec §11) en aanname 8 in `docs/AANNAMES.md` (spec §12) bijwerken met de stresstestjaren en de kanttekening over herhalingstijden; de tooltip-/toelichtingsteksten in `texts.ts`.
8. README: sectie "Concept 2" aanvullen met de vijf klimaatjaren en de bron (KNMI, reconstructie).

Geen wijzigingen aan het rekenmodel zelf behalve `coldestWeekStart`; alle andere referentiewaarden moeten onveranderd blijven.
