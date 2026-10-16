# Referentie-implementatie peakshaving-model (Python)

`peakshaving_ref.py` is de normatieve beschrijving van het rekenmodel uit `docs/SPEC-peakshaving.md` §5. De TypeScript-implementatie in `src/concepts/peakshaving/model/` moet dezelfde uitkomsten geven (toleranties: zie spec §9).

- `run_cases.py <referentiejaren.json> <uitvoermap>` — draait de referentiecases en de gevoeligheidsreeksen en schrijft `referentiewaarden.json` (ook als fixture voor Vitest te gebruiken).
- `inspect_week.py <referentiejaren.json>` — print de uurreeksen van de koude week voor twee cases (handig om de dispatch te controleren).
- `referentiewaarden.json` — de uitkomsten die bij deze versie horen (gegenereerd 16-10-2026).

Vereist alleen Python 3.10+ (standaardbibliotheek). Draai met `python3 -I`.

Wijzig je het model, wijzig dan **eerst** dit bestand en de spec, draai `run_cases.py` opnieuw en vervang de fixture.
