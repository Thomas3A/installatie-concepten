# UX-meting peakshaving (`measure.mjs`)

Meet de pagina `#/peakshaving` volgens UX-plan §11 ("Meetbaar met `tools/ux-check/measure.mjs`"). Alleen desktop:
1280×800, 1440×900 en 1920×1080. Telefoon en tablet worden niet gemeten.

Het script start een eigen Vite-server (of gebruikt er een via `--url`), opent de pagina in Chromium (locale `nl-NL`,
`prefers-reduced-motion: reduce`) en meet na de eerste doorrekening, als de pagina tot rust is gekomen (ook het
gevoeligheidsraster):

- woorden boven de vouw (telregel uit §11: zichtbare tekst die het venster raakt, niet `aria-hidden`, niet in een
  gesloten `<details>`, `<option>` telt niet, SVG-tekst wel);
- zichtbare bedieningselementen in het venster bij laden;
- tabstops vanaf de bovenkant tot het eerste focusbare element in de oordeelkaart (oude opzet: in de regio
  "Resultaat"), en de skip-link "Naar resultaat" (tabstop en focus op H2 `#ps-resultaat`);
- documentpositie van de oordeelkop (oude opzet: de eerste KPI-kaart), de buffer- en batterijschuif en de stapper, en
  of ze zonder scrollen volledig in beeld staan;
- horizontale overflow en geneste scroll (`overflow-y: auto/scroll` die echt scrollt, buiten ScrollRegion en tabellen);
- het aantal printpagina's: de knop "Print / PDF" bouwt de printversie op, `window.print` is vervangen en `page.pdf`
  maakt de PDF op A4 staand;
- "Bekijk het resultaat": klapt de Basis in, zet de focus op H2 "Resultaat" en blijft dicht na herladen.

Toestanden: **Basis open** (eerste bezoek, lege `localStorage`), **Basis ingeklapt** (`ps-basis-v1 = 'dicht'`) en
**melding onderaan** (na de eerste knop bij het oordeel). De oude opzet kent alleen de eerste; de andere zijn daar
"n.v.t.". Print en "Bekijk het resultaat" worden op 1440×900 gemeten.

## Gebruik

Vereist Playwright met Chromium (lokaal, globaal via `npm root -g`, of het pad in `PLAYWRIGHT_MODULE`).

```sh
# huidige werkmap meten en naast de baseline zetten (schrijft /tmp/ux-nu.json en .md)
node tools/ux-check/measure.mjs --out /tmp/ux-nu --compare tools/ux-check/baseline.json

# baseline opnieuw meten: origin/main in een tijdelijke git worktree (node_modules als symlink),
# schrijft tools/ux-check/baseline.json en baseline.md en ruimt de worktree daarna op
node tools/ux-check/measure.mjs --baseline

# een draaiende server gebruiken, alleen 1440×900, met schermafdrukken en de print-PDF
node tools/ux-check/measure.mjs --url http://localhost:5173/ --viewports 1440x900 --shots /tmp/ux-shots
```

Alle opties: `node tools/ux-check/measure.mjs --help`.

## Baseline

`baseline.json` en `baseline.md` zijn gemeten op `origin/main` (oude opzet). De getallen in §11 die met "nu" beginnen,
kwamen uit de audits en zijn met een andere telling gemaakt. Vergelijk daarom altijd met deze baseline: op 1440×900 zijn
dat 405 woorden boven de vouw, 38 zichtbare bedieningselementen, 57 tabstops tot het resultaat, de bufferschuif op
y = 1.555 (niet in beeld), één geneste scroll (de invoerkolom) en 2 printpagina's.
