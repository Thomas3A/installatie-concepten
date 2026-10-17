# UX-meting peakshaving: origin/main (8904168)

Gemeten op 2026-10-17 12:03 UTC met `tools/ux-check/measure.mjs` · origin/main @ 8904168 · opzet: oud · Chromium 141.0.7390.37 · locale nl-NL · prefers-reduced-motion: reduce.

Telregels (UX-plan §11): woorden met een letter of cijfer in zichtbare tekst die het venster raakt (niet aria-hidden, niet in een gesloten `<details>`, `<option>` telt niet, SVG-tekst wel). Bedieningselementen: knoppen, velden, keuzelijsten, summaries, links en tabs die zichtbaar in het venster staan. Tabstops: aantal keer Tab vanaf de bovenkant tot de focus in de oordeelkaart staat (oude opzet: in de regio "Resultaat"). Posities: documentcoördinaat (y) en of het element zonder scrollen volledig in beeld is. Geneste scroll: elementen met `overflow-y: auto/scroll` die verticaal scrollen, buiten ScrollRegion en tabellen.

## Basis open (eerste bezoek)

| Meting | 1280×800 | 1440×900 | 1920×1080 |
| --- | --- | --- | --- |
| Woorden boven de vouw | 335 | 405 | 474 |
| Zichtbare bedieningselementen bij laden | 26 | 38 | 51 |
| Tabstops tot de oordeelkaart | 57 | 57 | 57 |
| Skip-link (tabstop · focus op H2) | geen | geen | geen |
| Oordeelkop / eerste resultaat | y 333–485 · in beeld | y 294–412 · in beeld | y 241–359 · in beeld |
| Bufferschuif | y 1.594–1.618 · niet in beeld | y 1.555–1.579 · niet in beeld | y 1.502–1.526 · niet in beeld |
| Batterijschuif | y 1.798–1.822 · niet in beeld | y 1.760–1.784 · niet in beeld | y 1.707–1.731 · niet in beeld |
| Stapper aansluiting | ontbreekt | ontbreekt | ontbreekt |
| Horizontale overflow | nee | nee | nee |
| Geneste scroll | 1 | 1 | 1 |
| Paginahoogte (px) | 2.174 | 2.022 | 1.868 |
| Eerste doorrekening (ms, indicatief) | 901 | 1.031 | 775 |

- 1280×800: scrollt verticaal: `section._inputs_zozn4_48[aria-label="Invoer"] in "Invoer"` (1.708 in 784 px)
- 1440×900: scrollt verticaal: `section._inputs_zozn4_48[aria-label="Invoer"] in "Invoer"` (1.708 in 884 px)
- 1920×1080: scrollt verticaal: `section._inputs_zozn4_48[aria-label="Invoer"] in "Invoer"` (1.708 in 1.064 px)
- Eerste tabstop in de oordeelkaart (1440×900): summary "Robuustheid: zelfde configuratie in andere klimaatjaren".
- Woorden per gebied (1440×900): siteheader 1 · overig 94 · Scenario 31 · Invoer 47 · Resultaat 232.

## Basis ingeklapt (terugkerend of deellink)

n.v.t.: bestaat niet in de oude opzet.

## Melding onderaan zichtbaar (na een knop bij het oordeel)

n.v.t.: bestaat niet in de oude opzet.

## Print en "Bekijk het resultaat" (1440×900)

- Print (page.pdf via de knop "Print / PDF"): 2 pagina's, 595×842 pt (A4 staand).
- Bekijk het resultaat: n.v.t. (geen knop in deze opzet).

## Doelen (UX-plan §11, alleen desktop)

Dit is de oude opzet: de kolom "Oordeel" is alleen ter informatie.

| Doel | Norm | Gemeten | Baseline | Oordeel |
| --- | --- | --- | --- | --- |
| Woorden, 1440×900, Basis open | ≤ 230 en ≤ 40 % van de baseline | 405 | – | niet gehaald |
| Woorden, 1440×900, ingeklapt | ≤ 180 | n.v.t. | – | – |
| Zichtbare bedieningselementen, 1440×900 ingeklapt | ≤ 35 | 38 | – | niet gehaald |
| Tabstops tot de oordeelkaart, 1440×900 ingeklapt | ≤ 15 | 57 | – | niet gehaald |
| Skip-link, 1440×900 Basis open | tabstop 2 of 3; focus op H2 "Resultaat" | geen | – | niet gehaald |
| Scrolldiepte 1440×900 open: oordeelkop en bufferschuif in beeld | zonder scrollen | verdict ja · buffer nee | – | niet gehaald |
| Scrolldiepte 1440×900 ingeklapt: oordeel, buffer, batterij en stapper in beeld | zonder scrollen | verdict ja · buffer nee · battery nee · stepper nee | – | niet gehaald |
| Scrolldiepte 1280×800 ingeklapt: oordeel en bufferschuif in beeld | zonder scrollen | verdict ja · buffer nee | – | niet gehaald |
| Geen horizontale overflow (alle breedtes en toestanden) | scrollWidth ≤ breedte | geen | – | gehaald |
| Geen geneste scroll (alle breedtes en toestanden) | 0 buiten ScrollRegion en tabellen | 1280x800 open (1), 1440x900 open (1), 1920x1080 open (1) | – | niet gehaald |
| Print (page.pdf, A4 staand) | hoogstens 1 pagina meer dan de baseline | 2 pagina's | – | – |
