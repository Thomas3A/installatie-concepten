# UX-plan peakshaving: één pagina in drie stappen (Basis → Resultaat → Wat als?)

Dit plan komt uit een UX-analyse van de pagina `#/peakshaving`. Vier audits (eerste gebruik, inventaris, heuristieken en
mobiel, taakanalyse) leverden drie ontwerpvoorstellen op (_stepper_, _progressive_, _workbench_). Twee beoordelaars
kozen _workbench_. Dit plan bouwt daarop voort en neemt de beste ideeën van de andere twee over. Alle getallen zijn
met het model nagerekend.

**Afwijkingen bij de uitvoering** (gaan vóór de tekst hieronder):

- **Branch:** alles staat op `claude/peakshaving-ux` (afgesplitst van `main`). Terug naar de oude opzet = `main`. Er
  gaat niets naar `main` zonder akkoord van de gebruiker.
- **Aanspreekvorm:** waar de tekst de gebruiker aanspreekt, is dat **je/jouw** (informeel), nooit u/uw. Lees elke
  "u"/"uw" in de voorbeeldteksten hieronder als "je"/"jouw". Waar het kan, blijft de tekst onpersoonlijk, zoals de
  bestaande teksten.
- **Alleen pc/laptop:** de tool is bedoeld voor een browser op een pc of laptop (vanaf 1024 px breed). Er wordt niets
  voor de telefoon ontworpen, afgesteld of getest: de telefoonschetsen (§2.4), telefoonbreekpunten, aanraakvarianten,
  de bottom sheet van de rondleiding en alle meetpunten op 390 px vervallen. Op een telefoon of tablet staat bovenaan
  alleen een korte melding dat de tool beter op een pc of laptop werkt; de pagina eronder blijft gewoon scrollbaar en
  de gebruiker beslist zelf. Gemeten en gecontroleerd wordt op 1280×800, 1440×900 en 1920×1080.
- **Na de review van de indeling** (tekstdieet en dubbele bediening): de meterbalk zegt alleen "budget {budget} kW",
  de tegels herhalen de aansluiting en de max. overschrijding niet, Opvallend toont alleen de titel (toelichting onder
  "Waarom?"), de T1-regel heeft geen link "Robuustheid ▸" en de batterijknop heet "Zet". Details en de stand van de
  meetbare doelen: `docs/AANNAMES.md` › "Schermopbouw (werkbank)".
- **Rondleiding:** wordt in deze ronde gebouwd (WP-H), als aparte commit nadat de indeling aan de acceptatiecriteria
  voldoet. `TOUR_ENABLED` gaat dan aan.

## 0. Werkwijze en branch

- Branch `claude/peakshaving-ux` (afgesplitst van `main`). Teruggaan is `main`. Er wordt niets naar main gemerged zonder akkoord van de gebruiker.
- Per werkpakket één commit. Na elk pakket moeten `npm test`, `npm run lint` en `npm run build` groen zijn.
- Ongewijzigd blijven:
  - `src/concepts/peakshaving/model/**`
  - `tests/peakshaving/fixtures/referentiewaarden.json`
  - `src/ui/**` (gedeeld met het klimaatplafond)
  - `share.ts` (versie 1)

---

## 1. Besluiten

| #   | Onderwerp       | Besluit                                                                                                                                                                                                   | Afgewezen                                                                                                       | Waarom                                                                                                                                                                                                                                                                                                                |
| --- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | Paginavorm      | Eén pagina zonder `?stap=`. Basis bovenaan over de volle breedte; daaronder Resultaat en Wat als? naast elkaar (vanaf 1024 px); daaronder Verdieping.                                                     | Twee weergaven met URL-stap (stepper)                                                                           | Geen tweede bron van waarheid naast `?c=`. Het oordeel beweegt mee tijdens het invullen. Minste testbreuk.                                                                                                                                                                                                            |
| B2  | Basis           | Open bij een eerste bezoek. Klapt in tot een strook na **Bekijk het resultaat**. Open of dicht wordt bewaard in localStorage. Een deellink (`?c=`) opent ingeklapt.                                       | Altijd open (progressive)                                                                                       | De gevraagde volgorde "eerst basis, dan resultaat" zonder extra weergave.                                                                                                                                                                                                                                             |
| B3  | Hoofdgetallen   | Oordeelzin, meterbalk (piek aan de meter tegen budget) en **3 tegels**: Warmtepomp, Boven budget, Kleinste aansluiting. De 8 kaarten ongewijzigd ingeklapt onder "Alle kerngetallen".                     | 4 tegels                                                                                                        | De meterbalk is al het vierde getal. Minder cijfers op het eerste scherm.                                                                                                                                                                                                                                             |
| B4  | Effectgrafiek   | Eén mini-grafiek in SVG boven de bufferschuif: P_th,min(V) met plateau, op dezelfde x-schaal als de schuif, met maximaal 2 klikbare stippen "toereikend vanaf". Het tabblad Gevoeligheid blijft volledig. | Tweede uPlot-paneel "piek aan de meter tegen buffer" (progressive); Gevoeligheid omzetten tot variant (stepper) | Het raster rekent met het budget van de _huidige_ aansluiting. Een batterijlijn ligt daardoor per definitie op dat budget en zegt niets over de kleinere aansluiting; dat misleidt. Inzicht 2 komt via de meterbalk (batterijdeel gearceerd), de aansluitingsstapper, de stip "1×25 A + 7,5 kWh" en de batterijregel. |
| B5  | Klimaatjaar     | In Meer instellingen › Klimaat. Chip "T5" in de strook. De stresstest staat als T1-regel in het oordeel.                                                                                                  | Klimaatjaar in de Basis (progressive)                                                                           | Het oordeel beantwoordt de T1-vraag al zonder van jaar te wisselen. Zo bestaan er niet twee T1-antwoorden.                                                                                                                                                                                                            |
| B6  | Bedrijfsmodus   | Schakelaar boven de tabbladen in Verdieping. Het oordeel hangt niet af van de modus: `exceedanceKpis(a)` voor overschrijding, `limitedKpis(a)` voor comfort.                                              | Schakelaar bij de maatregelen                                                                                   | De modus is een rekenwijze, geen maatregel.                                                                                                                                                                                                                                                                           |
| B7  | Terugzetten     | Knop **↺ Zonder maatregelen** (buffer en batterij op 0). Een éénstaps-undo met toast voor elke "zet"-knop. `ownInput` bewaart de eigen invoer bij voorbeelden en bij wisselen van gebouwfunctie.          | `entryInput`-snapshot (stepper)                                                                                 | Een snapshot verschuift van betekenis bij elke terugkeer. "Zonder maatregelen" en "ongedaan maken" zijn eenduidig.                                                                                                                                                                                                    |
| B8  | Verfijnen       | WP-vermogen automatisch/handmatig, laadstrategie en batterijvermogen staan onder Wat als? › Verfijnen. Max. aanvoertemperatuur, bijstook en Carnot-rendement staan in Meer instellingen.                  | Alles in Meer instellingen (workbench)                                                                          | Vuistregel: **Basis = wat er is, Wat als? = wat u kiest.**                                                                                                                                                                                                                                                            |
| B9  | Chip batterij   | `requiredBattery.capacityKwh` naar boven afgerond op `ranges.batteryStepKwh`: 0,527 wordt 1,0 kWh.                                                                                                        | 0,5 kWh (workbench)                                                                                             | 0,5 kWh geeft nog 2 uur boven budget (geverifieerd).                                                                                                                                                                                                                                                                  |
| B10 | Chip buffer     | Alleen het kleinste exacte rasterpunt met `cells[0].exceedanceHours ≤ toegestaan`. Alleen bij automatische WP-dimensionering en alleen als het raster bij `analysis.input` hoort.                         | Benaderde "≈"-waarden                                                                                           | Het verband is niet monotoon (0,20 m³ geeft 0 uur, 0,25 m³ geeft 1 uur). Alleen berekende punten kloppen gegarandeerd.                                                                                                                                                                                                |
| B11 | Chip aandeel    | Alleen bij V = 0 en E = 0: ⌈100 · piek / aansluitvermogen − 1e-9⌉ %, mits ≤ 100 % en groter dan de huidige waarde.                                                                                        | Bij elke invoer                                                                                                 | Alleen zonder opslag is de drempel exact.                                                                                                                                                                                                                                                                             |
| B12 | Raster          | Rekent na elke doorrekening via de storevlag `autoSensitivity`. Standaard `import.meta.env.MODE !== 'test'`, dus uit in tests en aan in tests die er expliciet om vragen.                                 | Instellen in `helpers.ts`                                                                                       | `helpers.ts` is geen setup-bestand. Zo hoeft geen bestaand testbestand te veranderen.                                                                                                                                                                                                                                 |
| B13 | Mini-oordeel    | Eén gedrag op alle breedtes: een vaste balk onderaan, alleen zichtbaar als de oordeelkaart buiten beeld is.                                                                                               | Boven op desktop, onder op de telefoon                                                                          | Eén toestand minder. Op de telefoon ziet u ook tijdens het invullen van de Basis meteen het oordeel.                                                                                                                                                                                                                  |
| B14 | Labels          | Alle bestaande veldlabels blijven, ook "Aandeel voor warmtepomp". Tegeltitel "Kleinste aansluiting", tegelgroep `aria-label="Antwoord"`.                                                                  | "Deel voor de warmtepomp" (workbench)                                                                           | Voorkomt testbreuk en botsingen in `getBy*`.                                                                                                                                                                                                                                                                          |
| B15 | Oordeelswoorden | "Past net niet" (max. overschrijding ≤ 3 % van het budget) en "Past ruim" (marge > 25 % en geen batterij die afschaaft). Geen apart "krap".                                                               | "Krap"                                                                                                          | Met opslag ligt de piek bewust op het budget, dus "krap" zou daar altijd verschijnen.                                                                                                                                                                                                                                 |
| B16 | Uitleg vooraf   | Schema wordt het standaardtabblad (tab `concept`, label "Schema"). Geen compact schema bij de Basis in deze ronde.                                                                                        | Compact schema in stap 1 (stepper)                                                                              | Houdt de Basis rustig. De vraagregel en de rondleiding vertellen wat de tool doet.                                                                                                                                                                                                                                    |
| B17 | Rondleiding     | 5 stappen zonder getallen in de teksten. Nu alleen de haken; de component volgt later.                                                                                                                    | Rondleidingstekst met `{budget}`                                                                                | Teksten blijven kloppen bij elke invoer.                                                                                                                                                                                                                                                                              |

---

## 2. Paginastructuur

### 2.1 Componentenboom (DOM-volgorde = tabvolgorde = printvolgorde)

```
<main .page>
  <SkipLink/>                     knop "Naar resultaat" (zichtbaar bij focus; GEEN href="#…", want de HashRouter navigeert dan)
  <PageHeader/>                   H1 · vraagregel · Voorbeelden ▾ · [Rondleiding]* · Deel link · Print / PDF   (noPrint)
  <PrintSummary/>                 ongewijzigd (printOnly)
  <BasisSection/>                 section aria-label="Invoer", H2 "Basis", data-tour="basis"   (noPrint)
  <section aria-label="Resultaat" aria-busy .results>
     <div .workbench>             grid-areas: "verdict whatif" / "more whatif"; onder 1024 px één kolom
        <VerdictCard/>            H2 "Resultaat" (id ps-resultaat, tabIndex -1), data-tour="verdict"
        <WhatIfPanel/>            H2 "Wat als?", data-tour="whatif"   (noPrint)
        <ResultMore/>             Advies (printOnly) · Opvallend (noPrint) · ▸ Alle kerngetallen · ▸ Robuustheid
     </div>
     <DepthSection/>              H2 "Verdieping"; modusschakelaar; section aria-label="Detailweergave" met tabbladen  (noPrint)
  </section>
  <MiniVerdictBar/> <UndoToast/>  (noPrint)
  <PrintView/>                    ongewijzigd
```

`*` = Rondleiding is verborgen achter `TOUR_ENABLED = false` tot de rondleiding er is.

Er zijn alleen deze regio's: "Invoer", "Resultaat" en de bestaande "Detailweergave". Binnen de regio Resultaat zijn de blokken `<div>`s met een H2, dus er ontstaat geen tweede regio met de naam "Resultaat". Het stapnummer in elke H2 is `aria-hidden`.

### 2.2 Desktop 1440×900, eerste bezoek (Basis open)

```
y   ┌────────────────────────────────────────────────────────────────────────────────────────────────┐
0   │ Installatieconcepten (siteheader, ongewijzigd)                                                  │
44  │ Peakshaving warmtepomp met buffer en batterij       Voorbeelden [Woning jaren '70 · zonder m… ▾] │
    │ Past de warmtepomp op de aansluiting, en hoeveel buffer           [Deel link] [Print / PDF]     │
    │ of batterij is daarvoor nodig?                                                                  │
130 ├────────────────────────────────────────────────────────────────────────────────────────────────┤
    │ (1) Basis   Ingevuld met voorbeeld "Woning jaren '70 · zonder maatregelen". Pas het aan.        │
    │ Gebouwfunctie ⓘ          Piekvermogen verwarming ⓘ  Stooklijn (afgifte) ⓘ    ☑ Warm tapwater ⓘ │
    │ [Woning|Meerdere w.|Kant.] [ 8,0 ] kW ●──────────    [LT 35|MT 45|HT 55]     10 kWh/dag · 200 l │
    │ Aansluitwaarde ⓘ          Aandeel voor warmtepomp ⓘ                                              │
    │ [1×35 A — 8,05 kW    ▾]  [ 40 ] % ●──────                                                       │
    │                           [▓▓ WP-budget 3,22 kW ▓▓|░░░ overig gebruik 4,83 kW ░░░]              │
    │ ▸ Meer instellingen · klimaatjaar T5 · standaardwaarden            [ Bekijk het resultaat ↓ ]   │
≈480├───────────────────────────────────────────────┬────────────────────────────────────────────────┤
    │ (2) Resultaat                        ─Rekent…─ │ (3) Wat als?                                   │
    │ ┃ ✕ Past niet op 1×35 A                       │ Benodigde warmtepomp [kW]                      │
    │ ┃ 101 uur per jaar boven het WP-budget van    │ 10,6 ●╲                                        │
    │ ┃ 3,22 kW, tot 0,26 kW (8 %) erboven.         │       ╲●1×35 A ╲●1×25 A + 7,5 kWh ░plateau░░░  │
    │ ┃ Wat helpt: [0,20 m³ buffer] [1,0 kWh batterij]│     8,7 kW vanaf 0,80 m³: meer helpt niet      │
    │ ┃            [1×40 A] [of 44 % voor de warmtepomp]│ Buffervolume ⓘ                   [0,00] m³   │
    │ ┃ Piek aan de meter                   3,48 kW │ ●────────┬──────┬─────────────┬──────────  4   │
    │ ┃ [████████████████████████████████▓▓]┆       │          2 h    4 h           8 h              │
    │ ┃ budget 3,22 kW = 40 % van 1×35 A (8,05 kW)  │ Geen buffer · 24,1 kWh per m³                   │
    │ ┃ Warmtepomp     Boven budget   Kleinste aansl.│ Batterijcapaciteit ⓘ              [0,0] kWh   │
    │ ┃ 10,6 kW        101 uur/jaar   1×40 A        │ ●──────────────────────────────────────── 30   │
    │ ┃ 7,4 kW bij     12 kWh/jaar ·  1 stap groter │ Kleinste batterij voor 0 uur: 1,0 kWh [Zet]    │
    │ ┃ −10 °C         max. 0,26 kW   dan uw 1×35 A │ Aansluiting [◀] 1×35 A · budget 3,22 kW [▶]    │
    │ ┃ Met begrenzer: geen uur te koud (laagste 19,5 °C). toon in grafieken                         │
    │ ┃ Strenge winter (T1): 111 uur boven budget, 40 uur te koud. Robuustheid ▸                     │
900 ═══════════════════════════════════════ vouw ═══════════════════════════════════════════════════
    │ Opvallend: ! Tapwater veroorzaakt de piek … Waarom? ▸ │ ▸ Verfijnen · standaard                │
    │ ▸ Alle kerngetallen (8) · zonder begrenzer             │                                        │
    │ ▸ Robuustheid: zelfde configuratie in andere klimaatjaren                                       │
    │ Verdieping   Grafieken en kerngetallen: [Zonder begrenzer|Met begrenzer]                         │
    │ [Schema] Koude week  Jaar  Gevoeligheid  Uitleg                                                  │
```

### 2.3 Desktop 1440×900, terugkerend of gedeelde link (Basis ingeklapt)

```
44  │ (kop zoals hierboven)                                                                           │
130 │ (1) Basis  Voorbeeld · Woning jaren '70 · zonder maatregelen                                    │
    │   [Woning] [8,0 kW] [MT 45/35] [tapwater 10 kWh/dag] [1×35 A] [budget 3,22 kW · 40 %] [T5]  [Wijzig] │
≈195├───────────────────────────────────────────────┬────────────────────────────────────────────────┤
    │ (2) Resultaat … (oordeelkaart, ≈350 px)        │ (3) Wat als? … (≈520 px: buffer, batterij,     │
    │                                               │      stapper, Verfijnen)                       │
≈720│ Opvallend · ▸ Alle kerngetallen · ▸ Robuustheid │                                                │
≈800│ Verdieping …                                                                                     │
```

- De strook is één `role="toolbar"` (`aria-label="Basis"`) met roving tabindex: één tabstop, pijltjestoetsen tussen de chips, daarna de knop "Wijzig".
- Een chip opent de Basis en zet de focus op het bijbehorende veld. Voor velden in Meer instellingen klapt die eerst open.
- Toegankelijke naam van een chip: `"{label}: {waarde}, wijzigen"`, bijvoorbeeld "Piekvermogen verwarming: 8,0 kW, wijzigen". Die botst niet met de exacte labelzoekopdrachten in de tests.

**Breekpunten:**

- **≥ 1280 px:** Basis in 4 kolommen; werkbank `minmax(0,1.1fr) minmax(380px,1fr)`.
- **1024–1279 px:** Basis in 3 kolommen; de strookchips mogen over 2 regels.
- **640–1023 px:** alles in één kolom; Basis in 2 kolommen.
- **< 640 px:** telefoon.
- Container query in Wat als?: vanaf 620 px paneelbreedte staan buffer (links) en batterij plus stapper (rechts) naast elkaar.

### 2.4 Telefoon 390×844

```
EERSTE BEZOEK (Basis open)                  INGEKLAPT (terugkerend / deellink)
0    Installatieconcepten                   0    Installatieconcepten
44   Peakshaving warmtepomp met buffer en   44   (kop ≈ 200 px)
     batterij                               ≈250 (1) Basis                       [Wijzig]
     Past de warmtepomp op de aansluiting,       Voorbeeld · Woning jaren '70 · zonder m…
     en hoeveel buffer of batterij is            [Woning][8,0 kW][MT 45/35][tapwater]
     daarvoor nodig?                             [1×35 A][budget 3,22 kW · 40 %][T5]
     Voorbeelden [Woning jaren '70 · … ▾]   ≈380 (2) Resultaat
     [Deel link] [Print / PDF]                   ✕ Past niet op 1×35 A
≈250 (1) Basis                                   101 uur per jaar boven het WP-budget van
     Ingevuld met een voorbeeld. Pas het aan.    3,22 kW, tot 0,26 kW (8 %) erboven.
     Gebouwfunctie ⓘ [Woning|Meerdere w.|K.]     Wat helpt: [0,20 m³ buffer] [1,0 kWh bat.]
     Piekvermogen verwarming ⓘ [8,0] kW ●──      [1×40 A] [of 44 % voor de WP]
     Stooklijn (afgifte) ⓘ [LT|MT|HT]            Piek aan de meter 3,48 kW [██████▓]┆
     ☑ Warm tapwater ⓘ 10 kWh/dag · 200 l   844 ═══ vouw ═══
≈790 ┌✕ Past niet · 101 uur · WP 10,6 kW  ↓┐       budget 3,22 kW = 40 % van 1×35 A
844 ═══ vouw (balk vast onderaan, 52 px)          [WP 10,6 kW][101 uur/jaar][1×40 A]
     Aansluitwaarde ⓘ [1×35 A — 8,05 kW ▾]       Met begrenzer … · Strenge winter (T1) …
     Aandeel voor warmtepomp ⓘ [40] % ●──   ≈950 (3) Wat als?  mini-grafiek (80 px)
     [▓ WP-budget 3,22 ▓|░ overig 4,83 ░]  ≈1100 Buffervolume [0,00] m³ ●────
     ▸ Meer instellingen · standaardwaarden ≈1250 Batterijcapaciteit … · Aansluiting [◀ ▶]
     [      Bekijk het resultaat ↓      ]        Opvallend · ▸ Alle kerngetallen · ▸ Robuustheid
≈1150 (2) Resultaat …                             Verdieping [Schema|Koude week|Jaar|…] → (scrolt)
                                                 ┌✕ Past niet · 101 uur · WP 10,6 kW  ↑┐ (vast, als de kaart uit beeld is)
```

- Tegels: 3 naast elkaar bij een containerbreedte ≥ 360 px, anders onder elkaar.
- Aanraakvlakken minimaal 44 px onder `(pointer: coarse)`, met lokale klassen.
- Op de telefoon krijgt de body `padding-bottom` gelijk aan de hoogte van de balk, zolang de balk zichtbaar is.

### 2.5 Toestanden

| Situatie                                      | Basis                                                                                                   | Opgeslagen              | Rondleiding (later) |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------- |
| Eerste bezoek: geen `ps-basis-v1`, geen `?c=` | open                                                                                                    | niets                   | start automatisch   |
| Klik op **Bekijk het resultaat**              | dicht; scrol naar het oordeel en zet de focus op H2 "Resultaat" (`behavior: 'auto'` bij reduced motion) | `ps-basis-v1 = 'dicht'` | –                   |
| Klik op **Wijzig** of een chip                | open; focus op het veld                                                                                 | `'open'`                | –                   |
| Deellink `?c=`                                | dicht (`fromShareHash` zet `basisOpen: false`)                                                          | niets                   | nee                 |
| localStorage niet beschikbaar                 | open                                                                                                    | – (alles in try/catch)  | –                   |

Open en dicht zijn **UI-toestand**. Die komt nooit in `?c=`.

---

## 3. Basis

### 3.1 Velden per gebouwfunctie (labels ongewijzigd)

| Veld                                                         | Woning                         | Meerdere woningen                               | Kantoor                             |
| ------------------------------------------------------------ | ------------------------------ | ----------------------------------------------- | ----------------------------------- |
| Gebouwfunctie                                                | ✔                             | ✔                                              | ✔                                  |
| Aantal woningen                                              | –                              | ✔                                              | –                                   |
| Piekvermogen verwarming / "(totaal)"                         | ✔                             | ✔ met hint "≈ 5,0 kW per woning" (ongewijzigd) | ✔                                  |
| Stooklijn (afgifte)                                          | ✔                             | ✔                                              | ✔                                  |
| Warm tapwater (vinkje) met samenvatting als hint             | ✔ "10 kWh/dag · boiler 200 l" | ✔ "6,0 kWh/dag per woning · boiler 1.200 l"    | – (in Meer instellingen › Tapwater) |
| Gebruik vanaf / Gebruik tot (één cel, twee getallen)         | –                              | –                                               | ✔                                  |
| **Nachtverlaging** (vinkje, nieuw)                           | –                              | –                                               | ✔                                  |
| Aansluitwaarde (+ Gecontracteerd vermogen bij grootverbruik) | ✔                             | ✔                                              | ✔                                  |
| Aandeel voor warmtepomp, met budgetbalk als hint             | ✔ 40 %                        | ✔ 80 %                                         | ✔ 50 %                             |
| **Aantal velden**                                            | **6**                          | **7**                                           | **8**                               |

Nu staan er 16 velden zichtbaar en 13 onder Expert.

**Nachtverlaging (alleen UI-vertaling):**

- _Aangevinkt_ betekent `setpointSetbackC < setpointUseC`.
- Aanvinken zet `setpointSetbackC = clamp(setpointUseC − 2)`; uitvinken zet `setpointSetbackC = setpointUseC`.
- De standaardwaarden voor kantoor (21/19 °C) geven dus "aan".
- Effect bij kantoor-basis: 327 uur gaat naar 255 uur.
- Een eigen waarde (bijvoorbeeld 17 °C) gaat verloren bij uit- en weer aanvinken. De exacte waarde blijft in Meer instellingen › Gebouw. Vastleggen in AANNAMES.

**Budgetbalk** (`BudgetBar`, als `hint` van het veld Aandeel, dus ook `aria-describedby`):

- Een balk op de schaal van het aansluitvermogen: [WP-budget 3,22 kW | overig gebruik 4,83 kW].
- Tekst: "WP-budget **3,22 kW** · overig gebruik 4,83 kW".

**Rasterindeling:**

- Desktop ≥ 1280 px: 4 kolommen; 1024–1279 px: 3; 640–1023 px: 2; daaronder 1.
- Grootverbruik voegt de cel "Gecontracteerd vermogen" toe.
- Onderaan altijd een voetregel: links de summary van Meer instellingen, rechts **Bekijk het resultaat ↓**.

**Regel boven de velden** (vaste hoogte, één regel met ellips):

- "Ingevuld met voorbeeld „{shortTitle}”. Pas het aan naar uw gebouw."
- Bij eigen invoer: "Eigen invoer."

### 3.2 Meer instellingen

Eén `<details>` met de tekst "Meer instellingen · {badge}". De badge luidt "standaardwaarden" of "{n} aangepast". Groepen als H3, op desktop in 3 kolommen:

| Groep       | Velden (labels ongewijzigd)                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Klimaat     | Klimaatjaar (alle 38 opties, tooltips, ★); daaronder de statistiekregel (id `ps-klimaat-statistiek`, tekst begint met "Klimaatjaar T5:") en de noot van één regel                                                   |
| Gebouw      | Gebouwmassa (knoppen, direct boven) + Gebouwmassa (tijdconstante); ontwerpbuiten- en ontwerpbinnentemperatuur; setpoint tijdens en buiten gebruik; stookgrens; traagheid gevel; opwarmfactor; opstooktijd (kantoor) |
| Tapwater    | Warm tapwater (alleen bij kantoor); Tapwaterbehoefte (per woning); Boilervat (collectief); Boilertemperatuur. Velden alleen als tapwater aan staat, zoals nu                                                        |
| Warmtepomp  | Max. aanvoertemperatuur warmtepomp; Bijstookelement; Carnot-rendement                                                                                                                                               |
| Beoordeling | Toegestane overschrijdingsuren; Toegestane comfortverliesuren                                                                                                                                                       |

**Badge.** `moreSettingsChanged(input)` vergelijkt de velden hierboven met `normalizeInput(defaultInputOfKind(kind))`:

- Tapwater bij meerdere woningen per woning (`/dwellings`) tegen de standaard per woning.
- Klimaatjaar telt als aangepast als het afwijkt van `DEFAULT_CLIMATE_YEAR`.

Velden in `<details>` blijven altijd in de DOM; de tests vinden ze.

---

## 4. Resultaat

### 4.1 Het oordeel: pure functie `view/verdict.ts` → `buildVerdict(a, sens)`

Bronnen, steeds onafhankelijk van de modus:

- `ex = exceedanceKpis(a)` en `lim = limitedKpis(a)`;
- `budget = a.pLimitKw`, `peak = ex.pGridMaxKw`, `over = peak − budget`;
- `allowed = input.grid.allowedExceedanceH`;
- `{conn} = currentConnectionText(a)`;
- `{met}`: " met 0,50 m³ buffer", " met 5,0 kWh batterij", " met 1,00 m³ buffer en 5,0 kWh batterij" of leeg.

| Status          | Voorwaarde                                                 | Toon   | Kop                                            | Detailzin                                                                                                                                                                                                     |
| --------------- | ---------------------------------------------------------- | ------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sizingFailed`  | `!isFinite(a.sizing.withBuffer)` bij automatisch           | err ✕  | "Warmtepomp niet te dimensioneren"             | De oorzaak bij 3 × het piekvermogen (comfort en/of tapwater) + de eerste passende oplossing (boiler alleen met tapwater); toelichting en alle passende oplossingen onder "Waarom?" in de kaart (zie AANNAMES) |
| `nearlyFit`     | uren > toegestaan en `over ≤ 0,03·budget`                  | err ✕  | "Past net niet op {conn}"                      | als bij `notFit`                                                                                                                                                                                              |
| `notFit`        | uren > toegestaan                                          | err ✕  | "Past niet op {conn}"                          | "{u} uur per jaar boven het WP-budget van {budget} kW, tot {over} kW ({pct} %) erboven."                                                                                                                      |
| `withinAllowed` | 0 < uren ≤ toegestaan                                      | warn ! | "Past op {conn}, binnen de toegestane {t} uur" | "{u} uur per jaar boven het WP-budget van {budget} kW, tot {over} kW erboven."                                                                                                                                |
| `fitAmple`      | uren = 0, marge > 25 % en geen afschaving door de batterij | ok ✓   | "Past ruim op {conn}{met}"                     | "Piek aan de meter {peak} kW, {marge} kW ({pct} %) onder het budget van {budget} kW."                                                                                                                         |
| `fit`           | uren = 0                                                   | ok ✓   | "Past op {conn}{met}"                          | zonder afschaving: zoals hierboven. Met afschaving (alleen modus exceedance, `a.noBattery.pGridMaxKw − peak > 0,005`): "Piek aan de meter {peak} kW = budget; de batterij schaaft {Δ} kW af."                 |

- **Getalnotatie:** alles via `fmt` (nl-NL). kW onder 20 met 2 decimalen, daarboven met 1. WP-vermogen 1 decimaal, uren 0, procenten 0.
- **Kleur:** alleen de kaart draagt kleur (linkerrand en icoon ✓/!/✕ plus tekst), uit `--ok`, `--warn` en `--err`. De tegels zijn neutraal en de teal-accentkleur komt hier niet voor.
- **Live-regio:** een visueel verborgen `<p role="status">` met `liveText` = kop + ": {u} uur per jaar boven het budget." Wordt alleen bijgewerkt als die tekst verandert. De adviesbanner verliest `aria-live`.
- **Rekenen en fouten:**
  - Tijdens rekenen: een dunne voortgangsbalk bovenin de kaart en de tekst "Rekent…" naast de H2. Na 150 ms worden de waarden gedimd (opacity 0,55).
  - Bij een fout: in de kaart een balk "Rekenfout: {error}" (tekst exact zo, de test zoekt die) met de knop **Opnieuw proberen**. De waarden worden gedimd met het label "Verouderd".
  - Er is precies één retry-knop op de pagina buiten het tabblad Gevoeligheid.
- **Skelet:** vóór de eerste doorrekening een skelet met `min-height: 340px`.

### 4.2 Tegels (`role="group" aria-label="Antwoord"`)

| Tegel                                                  | Waarde                        | Regel                                                                                                                                                                                                                                                                        | Verwijzing (alleen als V > 0 of E > 0)                          |
| ------------------------------------------------------ | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Warmtepomp**, bij handmatig "Warmtepomp (handmatig)" | `a.nominalKw` kW              | "A7/W35 · {capacityAtMinus10.withBuffer} kW bij −10 °C"; bij meerdere woningen + " · {x} kW/woning" (nooit "per woning"). Handmatig: "benodigd {sizing.withBuffer} kW" (warn als gekozen < benodigd). Link "eigen vermogen kiezen" (alleen bij automatisch): opent Verfijnen | "zonder maatregelen {withoutMeasures.nominalKw} kW (−1,1)"      |
| **Boven budget**                                       | `ex.exceedanceHours` uur/jaar | "{kWh} kWh/jaar · max. {over} kW", bij 0: "geen enkel uur"                                                                                                                                                                                                                   | "zonder maatregelen {withoutMeasures.kpis.exceedanceHours} uur" |
| **Kleinste aansluiting**                               | `connectionText(a.smallest)`  | "1 stap groter dan uw {conn}" / "{n} stappen …" / "gelijk aan uw aansluiting" / "{n} stap(pen) kleiner dan uw {conn}". Stappen = verschil in index in `CONNECTIONS`; bij grootverbruik zonder aantal ("groter dan uw 3×80 A")                                                | "zonder maatregelen {connectionText(withoutMeasures.smallest)}" |

### 4.3 Meterbalk (`MeterBar`, HTML/CSS, `role="img"`)

- **Schaal:** 0 tot max(budget, piek, piek zonder maatregelen) × 1,1.
- **Onderdelen:**
  - neutraal blauw vlak van 0 tot min(piek, budget);
  - `--err` van budget tot piek;
  - groen gearceerd van piek tot `a.noBattery.pGridMaxKw` (alleen als `a.main.mode === 'exceedance'`);
  - zwarte streep op het budget;
  - grijze schaduwstreep op `withoutMeasures.kpis.pGridMaxKw` bij V > 0 of E > 0.
- **Labels:** "Piek aan de meter {peak} kW" en "budget {budget} kW = {aandeel} % van {conn} ({aansluitvermogen} kW)". Bij maatregelen erbij: "zonder maatregelen {x} kW".
- **aria-label:** "Piek aan de meter 3,48 kW tegen een budget van 3,22 kW".

### 4.4 Gevolgregels

- **Begrenzer:** "Met begrenzer: geen uur te koud (laagste {minTi} °C)." of "{c} uur te koud (laagste {minTi} °C)."
  - Plus " · {n} uur tapwatertekort" als dat > 0.
  - Toon warn als `c > allowedComfortLossH`.
  - Link **toon in grafieken**: zet `grid.mode = 'limited'` en tab `koude-week`, en scrolt naar Verdieping.
- **Stresstest:** "Strenge winter (T1): {h} uur boven budget, {c} uur te koud." uit `a.robustness` (rij T1).
  - Is T1 zelf gekozen: "Dit is al de stresstest (T1)."
  - Link **Robuustheid ▸**: opent die `<details>` in ResultMore en scrolt erheen.

### 4.5 Knoppen "Wat helpt" en "Kleinere aansluiting volstaat ook" (`view/fixes.ts`)

Een knop zet de waarde via `applyFix(label, fn)`: de oude invoer gaat naar `undo` en er verschijnt een toast "{label} · Ongedaan maken". De focus gaat naar de bijbehorende hendel. De weergave volgt het getalveld dat wordt gezet: "0,20 m³", "1,0 kWh", "20,00 m³", "200,0 kWh".

**"Wat helpt:"** (bij `notFit`, `nearlyFit` en `withinAllowed`; maximaal 4, in deze volgorde):

| Knop                                                      | Regel                                                                                                                                                       | Toon als                                                                                                                                                                                                        |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buffer "{V} m³ buffer" (+ " (zonder batterij)" bij E > 0) | Kleinste rasterrij i > 0 met `rows[i].cells[0].exceedanceHours ≤ allowed`; zet `buffer.volumeM3 = rows[i].volumeM3` (rasterpunten liggen op `bufferStepM3`) | `sizingMode === 'auto'` en `gridMatches(sens, a.input)` (`sens.key === sensitivityKey(a.input)`, done, geen fout). Zolang het raster rekent een grijze plaatshouder met vaste breedte; als niets past geen knop |
| Batterij "{E} kWh batterij"                               | `ceilToStep(a.requiredBattery.capacityKwh, ranges.batteryStepKwh)` (via `Math.ceil(x/step − 1e-9)·step`)                                                    | `requiredBattery?.feasible` en > 0 en > de huidige E                                                                                                                                                            |
| Aansluiting "{conn}"                                      | `a.smallest` (bij grootverbruik ook `contractedKw`)                                                                                                         | `a.smallest.powerKw > a.connectionKw`                                                                                                                                                                           |
| Aandeel "of {p} % voor de warmtepomp"                     | `p = ⌈100·ex.pGridMaxKw/a.connectionKw − 1e-9⌉`                                                                                                             | V = 0, E = 0, p ≤ 100 en p > huidig                                                                                                                                                                             |

**"Kleinere aansluiting volstaat ook:"** (bij `fit` of `fitAmple`; maximaal 1):

- **Exact:** als `a.smallest.powerKw < a.connectionKw` → [Probeer {connectionText(a.smallest)}].
- **Anders, uit het raster:** de eerstvolgende kleinere standaardaansluiting c. Zoek de eerste rij met V ≥ de huidige buffer en daarin de kleinste batterij-index j waarvoor `fitsConnection(row, j, c)` geldt. Knop: [Probeer {c} met {V} m³ buffer en {E} kWh batterij]. Zet buffer, batterij en aansluiting.
  - Alleen bij automatisch WP-vermogen, `battery.powerKw === null` en `gridMatches`.

**Geverifieerde uitkomsten** (worden unit-tests, zie §10):

| Geval                                  | Kop en detail                                                                                                                                                                                                                                                               | Knoppen                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Woning-basis (8 kW, 1×35 A, 40 %)      | ✕ Past niet op 1×35 A · 101 uur per jaar boven het WP-budget van 3,22 kW, tot 0,26 kW (8 %) erboven.                                                                                                                                                                        | [0,20 m³ buffer] [1,0 kWh batterij] [1×40 A] [of 44 % voor de warmtepomp]                 |
| + 0,5 m³ (voorbeeld 2)                 | ✓ Past op 1×35 A met 0,50 m³ buffer · Piek aan de meter 3,18 kW, 0,04 kW (1 %) onder het budget van 3,22 kW. Tegels: 9,4 kW (zonder maatregelen 10,6 kW, −1,1), 0 uur (zonder maatregelen 101), 1×35 A (zonder maatregelen 1×40 A). T1: 0 uur boven budget, 48 uur te koud. | [Probeer 1×25 A met 0,60 m³ buffer en 7,5 kWh batterij] (geverifieerd: 0 uur)             |
| Voorbeeld 3 (1 m³ + 5 kWh, 1×35 A)     | ✓ Past op 1×35 A met 1,00 m³ buffer en 5,0 kWh batterij · Piek aan de meter 2,95 kW, 0,27 kW (8 %) onder het budget van 3,22 kW.                                                                                                                                            | [Probeer 1×25 A] (exact)                                                                  |
| Voorbeeld 3 op 1×25 A                  | ✓ Past op 1×25 A met … · Piek aan de meter 2,30 kW = budget; de batterij schaaft 0,62 kW af. Met begrenzer: 11 uur te koud (laagste 18,7 °C).                                                                                                                               | –                                                                                         |
| 10 woningen                            | ✕ Past niet op 3×35 A · 121 uur …, tot 2,18 kW (11 %) erboven.                                                                                                                                                                                                              | [1,25 m³ buffer] [4,5 kWh batterij] [3×40 A] [of 90 % voor de warmtepomp]                 |
| Kantoor-basis                          | ✕ Past niet op 3×80 A · 327 uur …, tot 18,6 kW (67 %) erboven. Met begrenzer: 115 uur te koud (laagste 15,2 °C). T1: 424 uur boven budget, 157 uur te koud.                                                                                                                 | [20,00 m³ buffer] [200,0 kWh batterij] [Grootverbruik 95 kW] [of 84 % voor de warmtepomp] |
| Woning, aandeel 43 %, toegestaan 5 uur | ! Past op 1×35 A, binnen de toegestane 5 uur · 4 uur per jaar boven het WP-budget van 3,46 kW …                                                                                                                                                                             | (Wat helpt, zoals hierboven)                                                              |
| Kantoor + tijdconstante 80 h           | ✕ Warmtepomp niet te dimensioneren                                                                                                                                                                                                                                          | –                                                                                         |

### 4.6 Wat zichtbaar blijft en waar de rest staat

- **Altijd zichtbaar:** kop, detailzin, knoppen, meterbalk, 3 tegels en de 2 gevolgregels.
- **`ResultMore`, in DOM-volgorde:**
  1. `AdviceBanner`: `u.printOnly` en zonder `aria-live`. Tekst ongewijzigd, voor de print.
  2. **Opvallend** (noPrint): `<Messages include={['dhwPeak','preheatPeak','coldSpell','comfortLoss','backupPeak']} compact/>`. Zonder meldingen: "Geen bijzonderheden."
  3. `<details data-print-open>` "Alle kerngetallen (8) · {zonder|met} begrenzer" met de ongewijzigde `KpiCards` (`aria-label="Kerngetallen"` blijft; auto-fill minmax(170px,1fr)).
  4. `RobustnessTable`: titel ongewijzigd, ingekorte toelichting.
- **Meldingen bij hun hendel:** `bufferPlateau` en `smallBufferDeltaT` onder de buffer; `batteryEmpty` en `batteryPower` onder de batterij. `sizingFailed` is de oordeelstoestand en verschijnt niet in de lijsten.

---

## 5. Wat als? (`WhatIfPanel`)

Alle hendels sturen bestaande invoer aan; er is geen tweede toestand. De bereiken komen uit de store (`ranges`):

| Hendel                                             | Bereik en stap                                                                                                                                                                                                                                                                                                                                                                                                               | Markeringen                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **Buffervolume** (`RangeField`, label ongewijzigd) | 0…`ranges.bufferMaxM3`, stap `bufferStepM3`. Woning 0–4 m³ / 0,05; 10 woningen 0–25 m³ / 0,05; kantoor 0–50 m³ / 0,5                                                                                                                                                                                                                                                                                                         | `bufferMarkersM3` (2 h / 4 h / 8 h) |
| **Batterijcapaciteit**                             | 0…`batteryMaxKwh`, stap `batteryStepKwh`. Woning 0–30 kWh / 0,5; 10 woningen 0–200 kWh / 0,5; kantoor 0–400 kWh / 5                                                                                                                                                                                                                                                                                                          | `batteryMarkersKwh`                 |
| **Aansluiting** (stapper)                          | Volgorde van `CONNECTIONS`, daarna grootverbruik. ◀ vanaf grootverbruik gaat naar 3×80 A; ▶ vanaf 3×80 A gaat naar grootverbruik met `contractedKw = max(huidig, ⌈3×80 A-vermogen/5⌉·5)`. Knoppen `aria-label` "Kleinere aansluiting" en "Grotere aansluiting"; uitgeschakeld aan de randen. **Geen** label "Aansluitwaarde" (dat blijft uniek in de Basis). Tekst: "{label} · {kW} kW · budget {budget} kW ({aandeel} %)" | –                                   |

### 5.1 Mini-grafiek boven de bufferschuif

`BufferMiniChart` is SVG, 96 px hoog (80 px op de telefoon). De geometrie komt uit de pure module `view/miniChart.ts`.

- **x-schaal:** gelijk aan de schuif: `x(V) = 8 + (W − 16)·V/bufferMaxM3`, dezelfde formule als de markeringen in `controls.tsx`.
- **Inhoud:**
  - de lijn P_th,min(V) = `rows[i].nominalKw` (NaN geeft een onderbreking);
  - het plateau grijs gearceerd vanaf de knik = eerste V met `nominalKw ≤ 1,02 × minimum`. Label "{min} kW vanaf {knik} m³: meer buffer helpt niet". Bij de woning: 8,7 kW vanaf 0,80 m³;
  - een verticale lijn op de huidige V. Die volgt direct de invoer, niet de analyse;
  - maximaal 2 stippen uit `transitionsOf`:
    - (a) de huidige aansluiting zonder batterij, label "{conn}". Woning: 1×35 A op 0,20 m³;
    - (b) de eerstvolgende kleinere aansluiting met de kleinste rasterbatterij, label "{conn} + {E} kWh". Woning: 1×25 A + 7,5 kWh op 0,60 m³.
- **Stippen zijn knoppen** (focusbaar), bijvoorbeeld "1×35 A past vanaf 0,20 m³: zet buffer". Een klik werkt als een fix-knop (undo en toast). Stip (b) zet ook batterij en aansluiting.
- **Klik op de grafiek** (alleen muis of aanraking): zet de buffer op het dichtstbijzijnde rasterpunt.
- **`role="img"`** met de naam "Benodigde warmtepomp per buffervolume: {x} kW zonder buffer, {min} kW vanaf {knik} m³".
- **Rechtsonder** de link "volledige gevoeligheid →": zet tab `gevoeligheid` en scrolt naar Verdieping.
- **Verouderd raster** (sleutel ≠ invoer, bijvoorbeeld na een stap van de stapper): de vorige volledige rijen gedimd tonen (opacity 0,45, `aria-busy`) tot het nieuwe raster klaar is. Stippen pas weer na `done`. Zonder raster: een plaatshouder van vaste hoogte, "Grafiek wordt berekend…".
- **Bij een rasterfout:** de tekst "Grafiek niet beschikbaar." **zonder** retry-knop.
- **Bij handmatig WP-vermogen:** de lijn blijft staan, maar zonder stippen en met de regel "Suggesties gelden voor een automatisch gedimensioneerde warmtepomp."

### 5.2 Effectregels onder de hendels (live, uit `view/levers.ts`)

| Hendel      | Toestand                                                 | Tekst                                                                                                                                                                   |
| ----------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buffer      | V = 0                                                    | "Geen buffer · {kwhPerM3} kWh per m³"                                                                                                                                   |
|             | V > 0                                                    | "{kWh} kWh opslag ≈ {uur} uur piekvermogen · warmtepomp {sizing.withoutBuffer} → {sizing.withBuffer} kW" (bij handmatig: "benodigde warmtepomp …")                      |
|             | V ≥ knik                                                 | + "Meer buffer maakt de warmtepomp niet kleiner: een buffer overbrugt uren, geen dagen."                                                                                |
| Batterij    | E = 0 en uren > toegestaan en batterij haalbaar          | "Kleinste batterij voor 0 uur: {ceilToStep} kWh **[Zet op {x} kWh]**"                                                                                                   |
|             | E = 0, geen overschrijding, kleinere aansluiting bestaat | "Niet nodig op {conn}. Een batterij helpt pas bij een kleinere aansluiting. **[◀ Probeer {kleiner}]**"                                                                 |
|             | E > 0 en `requiredBattery.capacityKwh === 0`             | "Doet nu niets: de piek ({ex.pGridMaxKw} kW) blijft al onder het budget ({budget} kW). Een batterij helpt pas bij een kleinere aansluiting. **[◀ Probeer {kleiner}]**" |
|             | E > 0 met effect, modus exceedance                       | "{bruikbaar} kWh bruikbaar · {vermogen} kW · meterpiek {noBattery} → {piek} kW"                                                                                         |
|             | E > 0 met effect, modus limited                          | "{bruikbaar} kWh bruikbaar · {vermogen} kW" (geen pijl; `noBattery` volgt dan de modus)                                                                                 |
|             | 0 < E < benodigd                                         | + " · voor 0 uur: {ceilToStep} kWh **[Zet]**"                                                                                                                           |
| Aansluiting | altijd                                                   | Het budget staat in de stappertekst. Geen extra regel.                                                                                                                  |

### 5.3 Verfijnen, terugzetten en live gedrag

- **Verfijnen** (`<details>` "Verfijnen · {standaard | n aangepast}", noPrint):
  - WP-vermogen Automatisch/Handmatig, met "WP-vermogen (A7/W35)" en de hint "{x} × piekvermogen · benodigd {y} kW";
  - Laadstrategie buffer;
  - Batterijvermogen automatisch (0,5 C), met C-waarde.
  - De badge telt `sizingMode ≠ auto`, `strategy ≠ predictive` en `battery.powerKw ≠ null`.
- **↺ Zonder maatregelen:** alleen zichtbaar bij V > 0 of E > 0. Zet buffer en batterij via `applyFix` op 0, dus met undo.
- **Zonder tegenover met maatregelen** staat op 4 plekken:
  1. de verwijzingsregel per tegel (§4.2);
  2. de schaduwstreep op de meterbalk;
  3. de effectregels "a → b";
  4. in de mini-grafiek V = 0 als vertrekpunt.
  - De kop noemt de maatregelen ("met 0,50 m³ buffer").
  - De losse regels "Zonder buffer / batterij / maatregelen" komen alleen nog voor in Alle kerngetallen.
- **Live gedrag:**
  - Een schuif wijzigt de invoer meteen. De mini-grafieklijn en de getalvelden bewegen direct mee.
  - Na 250 ms debounce (zoals nu) rekent de analyse (circa 0,3–0,6 s). Daarna bewegen oordeel, tegels, meterbalk, effectregels en mini-oordeelbalk.
  - Buffer of batterij verandert `sensitivityKey` niet, dus het raster rekent niet opnieuw.
  - De stapper en elke Basis-wijziging veranderen de sleutel wel: het raster rekent opnieuw (0,25–0,8 s) en het oude raster blijft gedimd staan.
  - Fix-knoppen uit het raster verschijnen alleen bij `gridMatches(sens, a.input)`.

---

## 6. Verdieping, voorbeelden, klimaatjaar, delen, printen, toast

- **Verdieping:**
  - H2 "Verdieping". Daarboven de `SegField` "Grafieken en kerngetallen" met de opties "Zonder begrenzer" en "Met begrenzer" (`grid.mode`, blijft in de deellink). De (i) gebruikt de nieuwe `HELP.mode`.
  - Tabbladen in deze volgorde: **Schema** (`concept`, standaard), Koude week, Jaar, Gevoeligheid, Uitleg. De `TabId`s blijven; `TAB_LABELS` krijgt de nieuwe volgorde en `concept: 'Schema'`.
  - Op de telefoon scrolt de tabrij horizontaal via een lokale klasse naast `u.tabList`.
  - De schema-animatie pauzeert buiten beeld (IntersectionObserver) en bij `prefers-reduced-motion`.
- **Voorbeelden:**
  - Keuzelijst "Voorbeelden" in de kop met optgroups Woning, Meerdere woningen en Kantoor. De optietekst is `shortTitle`, de beschrijving staat als `title`.
  - Bij `scenarioId === null` de optie "Eigen invoer". Is er een `ownInput`, dan ook "↩ Uw eigen invoer (bewaard)".
  - Laden over eigen invoer heen bewaart `ownInput` en toont de toast "Voorbeeld „{shortTitle}” geladen · **Terug naar uw invoer**".
  - Wisselen van gebouwfunctie over eigen invoer heen: dezelfde bewaring, met de toast "Standaardwaarden voor {kantoor} geladen · **Ongedaan maken**".
- **`shortTitle` en `group`** in `scenarios.ts` (ids, `title`, `description` en `build` blijven ongewijzigd):

  | id                        | `shortTitle`                                     |
  | ------------------------- | ------------------------------------------------ |
  | `woning-basis`            | Woning jaren '70 · zonder maatregelen            |
  | `woning-buffer`           | Woning jaren '70 · 0,5 m³ buffer                 |
  | `woning-buffer-batterij`  | Woning jaren '70 · 1 m³ buffer + 5 kWh batterij  |
  | `nieuwbouw`               | Nieuwbouwwoning all-electric (4 kW, LT)          |
  | `woningen-basis`          | 10 woningen · zonder maatregelen                 |
  | `woningen-buffer`         | 10 woningen · 1 m³ buffer                        |
  | `kantoor-basis`           | Kantoor 100 kW · zonder maatregelen              |
  | `kantoor-buffer`          | Kantoor 100 kW · 20 m³ buffer                    |
  | `kantoor-buffer-batterij` | Kantoor 100 kW · 10 m³ buffer + 100 kWh batterij |
  | `kantoor-t1`              | Kantoor 100 kW · stresstest T1, 20 m³ buffer     |

- **Toast (`UndoToast`):**
  - Niet modaal, `role="status"`, 8 s zichtbaar, noPrint.
  - Op desktop linksonder, op de telefoon over de volle breedte, steeds boven de mini-oordeelbalk.
  - `undo` vervalt bij de volgende handmatige invoerwijziging of als de toast sluit. `ownInput` blijft tot hij wordt teruggezet.
- **Deellink:** ongewijzigd (`?c=`, versie 1, alleen invoer). `ownInput`, `undo`, `basisOpen` en `tourStep` komen nooit in de link. `fromShareHash` zet `basisOpen: false` (niet bewaard) en `openedFromLink: true`.
- **Printen:**
  - Volgorde: PrintSummary (ongewijzigd) → oordeelkaart (knoppen en links noPrint) → Advies → Alle kerngetallen (open via `data-print-open`) → Robuustheid (open) → PrintView (koude week en gevoeligheid).
  - Basis, Wat als?, Opvallend, Verdieping, toast en balk zijn noPrint.

---

## 7. Tekstdieet (vóór → na)

Alle nieuwe en ingekorte teksten zet WP-A in één keer in `texts.ts`. Uitzondering: teksten die inline in grafiekcomponenten staan, past WP-E ter plekke aan.

| #   | Tekst                                                | Vóór                                                                                                                                                                    | Na                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Subtitel (`PAGE_SUBTITLE` → `PAGE_QUESTION`)         | "Lucht/water-warmtepomp · warmtebuffer · batterij · uursimulatie over een referentiejaar"                                                                               | "Past de warmtepomp op de aansluiting, en hoeveel buffer of batterij is daarvoor nodig?"                                                                                                                                                                                                                                                                                                          |
| 2   | Klimaatnoot in de kop (75 woorden + statistiek)      | "Klimaatjaar T5: T gem. 10,49 °C · … / Voor dimensioneren is T5 de gebruikelijke keuze; T1 is de stresstest. Het energiejaar … ★ = aanbevolen stresstest."              | Kop: niets. Meer instellingen › Klimaat: de statistiekregel (ongewijzigd) en `CLIMATE_NOTE_SHORT` = "T5 = gebruikelijk ontwerpjaar · T1 = stresstest · ★ = aanbevolen stressjaar." De reconstructiezin alleen in footer en tooltip.                                                                                                                                                               |
| 3   | Scenariobanner                                       | "Woning jaren '70 na isolatie — 8 kW, 1×35 A, zonder maatregelen — De warmtepomp wordt …"                                                                               | Basis: "Ingevuld met voorbeeld „{shortTitle}”. Pas het aan naar uw gebouw." Strook: "Voorbeeld · {shortTitle}" of "Eigen invoer"                                                                                                                                                                                                                                                                  |
| 4   | Advies op het scherm (45 woorden, herhaalt zichzelf) | "Zonder buffer en batterij heeft de warmtepomp 10,6 kW … Zonder maatregelen: 10,6 kW warmtepomp, 101 uur overschrijding, 1×40 A."                                       | Kop en detail van het oordeel (circa 20 woorden). De alinea alleen in print.                                                                                                                                                                                                                                                                                                                      |
| 5   | `HELP.use`                                           | "… Wisselen zet alle invoer op de standaardwaarden."                                                                                                                    | Zonder die laatste zin. De toast met Ongedaan maken vervangt hem.                                                                                                                                                                                                                                                                                                                                 |
| 6   | `HELP.share` (45 woorden)                            | "Deel van de aansluiting voor warmtepomp + batterij. De rest is voor overig gebruik en wordt op het piekmoment volledig benut verondersteld. Bij meerdere woningen …"   | "Welk deel van de aansluiting de warmtepomp (met batterij) mag gebruiken. De rest is voor koken, wassen en laden en telt op het piekmoment volledig mee." Nieuw `HELP.shareMulti`, alleen bij meerdere woningen, met de bestaande zin over de collectieve installatie.                                                                                                                            |
| 7   | Hint bij het aandeel                                 | "WP-budget P_limiet = 8,05 kW × 40 % = 3,22 kW"                                                                                                                         | Budgetbalk: "WP-budget **3,22 kW** · overig gebruik 4,83 kW"                                                                                                                                                                                                                                                                                                                                      |
| 8   | Regel bij de stooklijn                               | "LT-radiatoren; aanvoer 45 °C bij −10 °C, 30 °C vanaf 15 °C."                                                                                                           | Weg; staat al in `HELP.emitter`.                                                                                                                                                                                                                                                                                                                                                                  |
| 9   | Regel bij automatisch WP-vermogen                    | "Gedimensioneerd op het klimaatjaar: 10,6 kW thermisch bij A7/W35."                                                                                                     | Weg; staat in de tegel Warmtepomp.                                                                                                                                                                                                                                                                                                                                                                |
| 10  | Bufferhint                                           | "Nuttig 0,0 kWh (ΔT × 1,163 × 0,9 = 24,1 kWh/m³) · ≈ 0,0 uur piekvermogen"                                                                                              | Zie §5.2. De formule gaat naar `HELP.bufferVolume`: "Watervolume van het buffervat. Nuttig per m³ = ΔT × 1,163 × 0,9, met ΔT = laadtemperatuur − retour."                                                                                                                                                                                                                                         |
| 11  | Batterijhint                                         | "Nuttig 4,5 kWh · vermogen 2,5 kW (0,50 C) · rendement 90 % heen en terug"                                                                                              | Zie §5.2. Het rendement gaat naar `HELP.batteryCapacity` ("… 90 % heen en terug.").                                                                                                                                                                                                                                                                                                               |
| 12  | Comfortkaart als hoofdgetal                          | "0 uur/jaar · Laagste binnentemperatuur 19,5 °C · tekort 202 kWh"                                                                                                       | "Met begrenzer: geen uur te koud (laagste 19,5 °C)." De kWh alleen nog in Alle kerngetallen.                                                                                                                                                                                                                                                                                                      |
| 13  | Kleinste aansluiting op 3×25 A                       | "1×35 A — huidige volstaat"                                                                                                                                             | Tegel "1×35 A · 2 stappen kleiner dan uw 3×25 A". Kop "Past ruim op 3×25 A". Knop "Kleinere aansluiting volstaat ook: [Probeer 1×35 A]".                                                                                                                                                                                                                                                          |
| 14  | Lead Gevoeligheid (68 woorden)                       | "Van links naar rechts neemt het buffervolume toe … om bij te laden."                                                                                                   | "Waar de lijnen vlak worden, helpt meer buffer niet meer; een stip markeert vanaf welk buffervolume een aansluiting volstaat." De batterijnuance onder `<details>` "Hoe lees ik dit?".                                                                                                                                                                                                            |
| 15  | Plaatshouder Gevoeligheid (36 woorden)               | "De gevoeligheid wordt berekend: per buffervolume eerst …"                                                                                                              | "De gevoeligheid wordt berekend…" (het testanker blijft).                                                                                                                                                                                                                                                                                                                                         |
| 16  | Hint Koude week (27 woorden)                         | "Sleep in een grafiek om in te zoomen, schuif met ◀ ▶ of Shift + scrollwiel door het jaar en klik om een uur te kiezen. De panelen bewegen samen."                    | Muis: "Sleep om te zoomen, klik om een uur te kiezen; ◀ ▶ schuift door het jaar." Aanraking (`pointer: coarse`): "Tik om een uur te kiezen; ◀ ▶ schuift door het jaar."                                                                                                                                                                                                                       |
| 17  | Intro Schema (48 woorden)                            | "Schema van het concept in het gekozen uur: wat de warmtepomp, … door een leiding of kabel gaat."                                                                       | "Wat de installatie doet in het gekozen uur, standaard het piekuur van de koude week."                                                                                                                                                                                                                                                                                                            |
| 18  | Leads Jaar (36 / 35 / 26) en x-as-hint (23)          | "Elk punt is één uur van het jaar …" / "Ideale warmtevraag van het gebouw per uur …" / "Per maand links de geleverde warmte …" / "Klimaatjaar T5. Logaritmisch toont …" | Elektrisch: "Alle uren van het jaar, van hoog naar laag; boven een lijn is die aansluiting te klein (uren in de legenda)." Thermisch: "Warmtevraag per uur, van hoog naar laag, met wat de warmtepomp bij −10 °C levert." Maandbalans: "Warmte per bron en elektriciteit per maand; de lijn is de SCOP." x-as: "Klimaatjaar T5. Logaritmisch: de piekuren groot." plus de hint per invoermethode. |
| 19  | Toelichting robuustheid (47 woorden)                 | "WP-vermogen vast op 10,6 kW (A7/W35). Piek aan de meter, SCOP en …"                                                                                                    | "Zelfde warmtepomp ({kW} kW), ander weer. Overschrijding: zonder begrenzer; comfortverlies: als de aansluiting begrenst." (bevat beide zinsdelen die de test controleert)                                                                                                                                                                                                                         |
| 20  | Paneelpaden in `MESSAGE_TEXTS` en EXPLAIN §7         | "(Aansluiting → Expert)", "(Gebouw → Expert)", "(Maatregelen → Expert)"                                                                                                 | "(Meer instellingen → Beoordeling)", "(Meer instellingen → Gebouw)", "(Wat als? → Verfijnen)"                                                                                                                                                                                                                                                                                                     |
| 21  | Oplossing bij `bufferPlateau`                        | "Houd de buffer op het knikpunt van de gevoeligheidsgrafiek."                                                                                                           | "Houd de buffer op het knikpunt in de grafiek boven de bufferschuif."                                                                                                                                                                                                                                                                                                                             |
| 22  | EXPLAIN §1, laatste zin                              | "De KPI-kaarten tonen altijd beide gezichtspunten."                                                                                                                     | "Het resultaat toont altijd beide gevolgen: uren boven het budget zonder begrenzer en uren te koud met begrenzer."                                                                                                                                                                                                                                                                                |
| 23  | `HELP.mode`                                          | "Overschrijding tonen: … Aansluiting begrenst: …"                                                                                                                       | "Zonder begrenzer levert de warmtepomp altijd en tellen de uren boven het budget; met begrenzer is het budget hard en wordt een tekort comfortverlies. Het oordeel bovenaan toont altijd beide; deze keuze geldt voor de grafieken en Alle kerngetallen."                                                                                                                                         |
| 24  | Lege meldingen                                       | "✓ Geen meldingen: de configuratie heeft geen bijzonderheden."                                                                                                          | "Geen bijzonderheden."                                                                                                                                                                                                                                                                                                                                                                            |
| 25  | Ernsticonen                                          | 🔴 🟠 🔵 (alleen kleur)                                                                                                                                                 | Tekstlabels "✕ Kritiek", "! Let op", "i Info". "Waarom?" krijgt een ▸/▾-marker via een lokale klasse.                                                                                                                                                                                                                                                                                             |
| 26  | Keuzelijst "Scenario's"                              | "2. … met 0,5 m³ buffer"                                                                                                                                                | "Voorbeelden" met optgroups en `shortTitle`.                                                                                                                                                                                                                                                                                                                                                      |

**Nieuwe constanten** (WP-A):

- `PAGE_QUESTION`, `STEP_TITLES` (`{ basis: 'Basis', result: 'Resultaat', whatIf: 'Wat als?', depth: 'Verdieping' }`);
- `UI_LABELS`: Bekijk het resultaat, Wijzig, Meer instellingen, Verfijnen, standaardwaarden, `{n} aangepast`, Naar resultaat, Zonder maatregelen, Ongedaan maken, Terug naar uw invoer, toon in grafieken, Robuustheid, volledige gevoeligheid, eigen vermogen kiezen, Rondleiding;
- `VERDICT_TEXTS` en `WHATIF_TEXTS` (sjabloonfuncties met `fmt`), `CLIMATE_NOTE_SHORT`, `HELP.shareMulti`, `HELP.nightSetback` ("Buiten gebruikstijd 2 K lager stoken; uit = altijd op het gebruikssetpoint."), `TOUR_STEPS`, `TOAST_TEXTS`.

---

## 8. Onboarding: haken nu, rondleiding later

**Nu bouwen (WP-A, WP-F):**

- `ui/tour/anchors.ts` met `TOUR_ANCHORS` en `TOUR_ENABLED = false`. Dit zijn de `data-tour`-attributen:

  | Anker                | Element                               |
  | -------------------- | ------------------------------------- |
  | `basis`              | open paneel én strook                 |
  | `budget`             | wrapper van "Aandeel voor warmtepomp" |
  | `verdict`            | oordeelkaart                          |
  | `buffer`             | bufferhendel met mini-grafiek         |
  | `battery-connection` | batterijhendel en stapper samen       |
  | `depth`              | Verdieping                            |
  | `examples`           | keuzelijst Voorbeelden                |

- **Store:** `tourStep: number | null`, `startTour()`, `setTourStep(n)`, `endTour()`, `openedFromLink`.
- **localStorage-sleutel** `ps-rondleiding-v1`, met try/catch.
- **Knop "Rondleiding"** in de kop, verborgen zolang `TOUR_ENABLED` false is.

**Stappen** (`TOUR_STEPS`; één zin per stap, geen getallen):

| #   | Anker                | Titel                   | Tekst                                                                                                                        |
| --- | -------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | `basis`              | 1 · Basis               | "Begin hier met uw gebouw en aansluiting; wat u niet invult, staat op een gangbare standaardwaarde onder Meer instellingen." |
| 2   | `budget`             | Het WP-budget           | "De warmtepomp mag maar een deel van de aansluiting gebruiken: dat WP-budget is de grens waartegen alles wordt getoetst."    |
| 3   | `verdict`            | 2 · Resultaat           | "Hier staat het antwoord: past de warmtepomp binnen het budget, hoeveel uur per jaar niet, en wat zou helpen."               |
| 4   | `buffer`             | 3 · Wat als?            | "Schuif met de buffer: de warmtepomp wordt kleiner tot de lijn vlak wordt, want een buffer overbrugt uren, geen dagen."      |
| 5   | `battery-connection` | Batterij en aansluiting | "Een batterij schaaft de piek aan de meter af: zet de aansluiting een stap lager en kijk welke batterij dan nodig is."       |

**Gedrag (voor de latere bouw, vastgelegd):**

- **Automatisch starten** alleen als `ps-rondleiding-v1` ontbreekt, niet via een deellink (`openedFromLink`), en als `tourAutoStart` aan staat (uit in testmodus, zelfde regel als B12).
- **Knoppen** Vorige, Volgende en Overslaan, en Klaar in de laatste stap, met de teller "n van 5".
- **Sluiten:** Esc staat gelijk aan Overslaan. "Gezien" wordt geschreven bij Overslaan of Klaar. De knop Rondleiding start hem opnieuw.
- **Invoer:** de rondleiding wijzigt nooit invoer. Stap 1 opent de Basis als die ingeklapt is; dat is alleen UI-toestand.
- **Scrollen:** het anker scrolt naar het midden, direct bij `prefers-reduced-motion`.
- **Focus** gaat naar de kop van de popover en na afloop terug naar de knop Rondleiding.
- **Telefoon:** de popover is een bottom sheet van maximaal 40 % hoogte; het anker staat in de bovenste helft.
- **Ontbrekend anker:** die stap wordt overgeslagen.

---

## 9. Waar elk bestaand element naartoe gaat (samenvatting)

| Nu                                                 | Nieuw                                                                                                                                                                                                                              |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Kop: titel                                         | Blijft                                                                                                                                                                                                                             |
| Kop: subtitel                                      | Vraagregel (#1)                                                                                                                                                                                                                    |
| Kop: keuzelijst Klimaatjaar                        | Meer instellingen › Klimaat; chip "T5" in de strook                                                                                                                                                                                |
| Kop: keuzelijst Scenario's                         | "Voorbeelden" in de kop                                                                                                                                                                                                            |
| Kop: Deel link, Print / PDF                        | Blijven in de kop                                                                                                                                                                                                                  |
| ClimateNote                                        | Statistiekregel en korte noot in Meer instellingen › Klimaat                                                                                                                                                                       |
| Scenariobanner                                     | Regel in de Basis / label in de strook; beschrijving als tooltip                                                                                                                                                                   |
| Blok 1 Gebouw                                      | Basis (functie, aantal, piekvermogen, tapwater; bij kantoor gebruikstijden en nachtverlaging) en Meer instellingen › Gebouw / Tapwater (alle Expert-velden, Gebouwmassa-knoppen, tapwatergetallen, boilertemperatuur, opstooktijd) |
| Blok 2 Aansluiting                                 | Basis (aansluitwaarde, gecontracteerd vermogen, aandeel) en Meer instellingen › Beoordeling (beide toegestane-urenvelden); plus de stapper in Wat als?                                                                             |
| Blok 3 Warmtepomp en afgifte                       | Stooklijn naar de Basis. Max. aanvoertemperatuur, bijstook en Carnot naar Meer instellingen › Warmtepomp. Automatisch/Handmatig met het WP-vermogen naar Wat als? › Verfijnen. De regel "Gedimensioneerd …" vervalt.               |
| Blok 4 Maatregelen                                 | Buffer en batterij naar Wat als?. Laadstrategie en batterijvermogen naar Verfijnen. Bedrijfsmodus naar de kop van Verdieping.                                                                                                      |
| Bloknummers 1–4, vier Expert-summaries, `Block`    | Vervangen door de stapnummers 1–3, één "Meer instellingen" en één "Verfijnen". `Block` wordt verwijderd.                                                                                                                           |
| Statusregel (Rekent…, Rekenfout, Opnieuw proberen) | In de oordeelkaart                                                                                                                                                                                                                 |
| 8 KPI-kaarten                                      | Hoofdbeeld: oordeel, meterbalk, 3 tegels, gevolgregels. De kaarten ongewijzigd onder "Alle kerngetallen (8)".                                                                                                                      |
| Adviesbanner                                       | Alleen in print                                                                                                                                                                                                                    |
| Robuustheidstabel                                  | ResultMore (ingeklapt, print open); de T1-regel staat in het oordeel                                                                                                                                                               |
| Meldingen                                          | Bij de hendels / Opvallend / oordeelstoestand                                                                                                                                                                                      |
| Tabbladen                                          | Verdieping, met Schema als standaard                                                                                                                                                                                               |
| Koude week, Jaar, Gevoeligheid, Uitleg             | Inhoud ongewijzigd, alleen teksten ingekort                                                                                                                                                                                        |
| PrintSummary, PrintView, footer en disclaimer      | Ongewijzigd                                                                                                                                                                                                                        |

---

## 10. Werkpakketten, bestandseigenaarschap, contracten

**Regels:**

- Elk bestand heeft precies één eigenaar.
- B, C, D en E **voegen alleen toe** en bewerken alleen hun eigen bestanden.
- Oude exports en bestanden verwijdert uitsluitend WP-F.
- Elk pakket heeft een eigen CSS-module. `peakshaving.module.css` is van WP-F, maar anderen mogen er bestaande klassen uit importeren. WP-F verwijdert een klasse pas na een grep op gebruik.
- Alleen WP-A schrijft in `texts.ts`.

### Volgorde

1. Fase 1: WP-A.
2. Fase 2: B, C, D en E parallel; F begint met de kop, toast, skip-link en CSS.
3. Fase 3: WP-F koppelt alles en ruimt op.
4. Fase 4: WP-G meet en documenteert. Bevindingen gaan terug naar het pakket dat eigenaar is.
5. Daarna, als de indeling aan §11 voldoet: WP-H, de rondleiding (aparte commit).

### WP-A Fundament (M)

Bestanden:

- `store.ts`, `texts.ts`, `scenarios.ts` (`group`, `shortTitle`);
- nieuw `view/verdict.ts`, `view/fixes.ts`, `view/levers.ts`, `view/sensitivityFacts.ts` (`gridModel`, `fitsConnection` en `transitionsOf` verhuizen uit `SensitivityChart.tsx`, plus `gridMatches`, `firstFitVolume`, `plateauStart`, `smallerOption`), `view/miniChart.ts`, `view/settingsDiff.ts`;
- `ui/storage.ts` (`readKey`/`writeKey` met try/catch), `ui/hooks.ts` (`useInView`, `usePointerCoarse`), `ui/tour/anchors.ts`;
- `ui/charts/SensitivityChart.tsx`: alleen de importregels voor de verhuisde helpers;
- `ui/results/Messages.tsx`: props `include?`/`exclude?: MessageCode[]` en `compact?`, tekstlabels voor de ernst, lokale marker-klasse, "Geen bijzonderheden.";
- tests: `ui.test.tsx` (zie testimpact) en de nieuwe tests hieronder.

Store-contract (puur additief, plus de standaardtab):

```ts
type FieldKey = 'kind'|'dwellings'|'designLoad'|'emitter'|'dhw'|'useHours'|'nightSetback'|'connection'|'share'
  |'climate'|'mass'|'designTemps'|'dhwDetails'|'heatPumpMore'|'allowedHours'|'sizing'|'buffer'|'battery';
tab: TabId                       // standaard 'concept'
basisOpen: boolean               // init: readKey('ps-basis-v1') !== 'dicht'
setBasisOpen(open: boolean, persist = true): void
reveal: { target: FieldKey; seq: number } | null; revealSetting(t: FieldKey): void
ownInput: PeakshavingInput | null; restoreOwnInput(): void          // gezet door applyScenario/setKind als scenarioId === null
undo: { input: PeakshavingInput; scenarioId: string | null } | null
applyFix(label: string, fn: (i: PeakshavingInput) => PeakshavingInput): void   // bewaart undo, zet notice
undoLast(): void
notice: { kind: 'example' | 'kind' | 'fix'; text: string } | null; dismissNotice(): void
autoSensitivity: boolean         // init import.meta.env.MODE !== 'test'
setAutoSensitivity(on: boolean): void
openedFromLink: boolean; tourStep: number | null; startTour(); setTourStep(n: number); endTour()
```

- `computeNow`: raster opvragen bij `tab === 'gevoeligheid' || printing || autoSensitivity`.
- `update`, `setDesignLoad` en de andere invoeracties wissen `undo`.
- `fromShareHash` zet `basisOpen: false` (zonder te bewaren) en `openedFromLink: true`.

Puur contract:

```ts
buildVerdict(a: Analysis, sens: SensitivityState | null): Verdict
// Verdict = { status; tone; icon; headline; detail; liveText; mini; meter: MeterModel; tiles: Tile[3];
//             limiterLine: { text; tone }; stressLine: string | null; fixesLabel: 'Wat helpt' | 'Kleinere aansluiting volstaat ook' | null;
//             fixes: Fix[] }   Fix = { id; label; undoLabel; pending: boolean; apply: (i) => PeakshavingInput }
bufferEffect(a), batteryState(a, ranges), connectionSteps(grid)            // view/levers.ts
miniChartGeometry(rows, ranges, current, width, height); sliderX(v, max, width)  // view/miniChart.ts
moreSettingsChanged(input): number; refineChanged(input): number              // view/settingsDiff.ts
```

Klaar als: tests groen en de UI ongewijzigd, op de standaardtab Schema, de tabvolgorde en de nieuwe teksten na.

### WP-B Basis (M)

- **Bestanden:** nieuw `ui/basis/BasisSection.tsx` (open paneel met `hidden` bij dicht, strook, reveal-afhandeling), `BasisForm.tsx`, `BasisStrip.tsx` (toolbar met roving tabindex), `MoreSettings.tsx`, `BudgetBar.tsx`, `fields.tsx` (veldcomponenten in `<div data-field=…>`, code gekopieerd uit de oude panelen), `Basis.module.css`; `ui/ClimateSelect.tsx` (nieuw `ClimateField` en `ClimateStats`; de oude `ClimateSelect`/`ClimateNote`-exports blijven tot WP-F ze verwijdert).
- **Tests:** nieuw `tests/peakshaving/basis-ui.test.tsx`; eigenaar van `dwellings-ui.test.tsx` (wijziging naar verwachting niet nodig).
- **Klaar als:**
  - de velden per functie kloppen met §3.1;
  - Nachtverlaging werkt volgens §3.1;
  - de badge telt goed;
  - een chip opent de Basis en zet de focus op het veld;
  - de strook rendert alleen als de Basis dicht is;
  - nergens "per woning" bij kantoor;
  - de strook gebruikt "kW/woning" en nooit "≈ … kW per woning".

### WP-C Wat als? (L)

- **Bestanden:** nieuw `ui/whatif/WhatIfPanel.tsx`, `BufferLever.tsx`, `BufferMiniChart.tsx`, `BatteryLever.tsx`, `ConnectionStepper.tsx`, `Refine.tsx`, `WhatIf.module.css`.
- **Tests:** nieuw `tests/peakshaving/whatif-ui.test.tsx`.
- **Klaar als:**
  - de effectregels kloppen met §5.2 voor de voorbeelden 1, 2 en 3, en voor 3 op 1×25 A;
  - Zet, Probeer en de stippen werken met undo;
  - het oude raster blijft gedimd staan;
  - er is geen retry-knop;
  - de container query werkt.

### WP-D Resultaat (L)

- **Bestanden:** nieuw `ui/result/VerdictCard.tsx`, `MeterBar.tsx`, `AnswerTiles.tsx`, `FixChips.tsx`, `ConsequenceLines.tsx`, `MiniVerdictBar.tsx`, `ResultMore.tsx`, `Result.module.css`; `ui/results/AdviceBanner.tsx` (printOnly, zonder `aria-live`), `RobustnessTable.tsx` (toelichting, prop `forceOpen` via store-event), `KpiCards.tsx` (ongewijzigd).
- **Tests:** nieuw `tests/peakshaving/verdict-ui.test.tsx`.
- **Klaar als:**
  - kop en detail van §4.5 letterlijk;
  - één `role="status"` voor het oordeel;
  - wisselen van modus verandert kop en tegels niet;
  - "Opnieuw proberen" verschijnt alleen bij een fout;
  - het skelet heeft een vaste hoogte.

### WP-E Verdieping en grafiekteksten (S–M)

- **Bestanden:** nieuw `ui/depth/DepthSection.tsx` (tabcode uit de pagina, modus-`SegField`, scrollende tabrij), `Depth.module.css`; `charts/ColdWeekCharts.tsx`, `YearCharts.tsx`, `SensitivityChart.tsx` (lead en "Hoe lees ik dit?"; de testteksten blijven), `concept/ConceptDiagram.tsx` (intro, pauze buiten beeld).
- **Tests:** eigenaar van `charts-ui.test.tsx` en `concept-diagram.test.tsx`; nieuw `depth-ui.test.tsx`.
- **Klaar als:** hints per invoermethode, de tabvolgorde, horizontaal scrollen op 390 px en de animatie pauzeert.

### WP-F Schil en integratie (M)

- **Bestanden:** `ui/PeakshavingPage.tsx`, nieuw `ui/shell/PageHeader.tsx`, `ExamplesSelect.tsx`, `UndoToast.tsx`, `SkipLink.tsx`, `ui/peakshaving.module.css` (`.inputs` zonder sticky, `max-height` en `overflow`; `.workbench`-grid; padding voor de balk), `ui/PrintView.tsx` (alleen als nodig); verwijdert `ui/inputs/{Building,Grid,HeatPump,Measures}Panel.tsx`, `Block` uit `controls.tsx` en de oude Climate-exports.
- **Tests:** eigenaar van `page-ui.test.tsx`, `verify-ui.test.tsx` en `plumbing-print.test.tsx`; nieuw `tests/peakshaving/workbench-ui.test.tsx`.
- **Klaar als:** de structuur van §2.1 staat, de print-volgorde van §6 klopt en er geen geneste scroll meer is.

### WP-G Acceptatie en documentatie (S)

- **Bestanden:** nieuw `tools/ux-check/measure.mjs` (Playwright, zie §11), `docs/AANNAMES.md`, `README.md` (screenshot in `docs/img/`).
- **Inhoud AANNAMES**, nieuwe sectie "Schermopbouw (werkbank)":
  - afwijkingen van spec §2.2 (opbouw), §6.1 (3 tegels en meterbalk, 8 kaarten ingeklapt), §6.2 (advies alleen in print) en §7.4 (raster altijd, `autoSensitivity`);
  - modus als weergavekeuze en het oordeel onafhankelijk van de modus;
  - drempels "net niet" (≤ 3 %) en "ruim" (> 25 %);
  - regels voor de knoppen (B9–B11);
  - nachtverlaging 2 K;
  - voorbeelden in plaats van scenario's, en `ownInput`/`undo` niet in de link.

### WP-H Rondleiding (later, M)

`ui/tour/Tour.tsx` op basis van de haken in §8.

### Testimpact

| Test                                                                             | Effect                                                                                                                                                                                                   | Wie              |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `ui.test.tsx` › "tabbladen Koude week, Jaar en Gevoeligheid"                     | Standaardtab is nu Schema, dus eerst `click(tab 'Koude week')`                                                                                                                                           | WP-A             |
| `ui.test.tsx`, overige                                                           | Blijven groen: "Piek warmtevraag" en "Kleinste passende aansluiting" zijn uniek (tegel "Kleinste aansluiting"); "Advies" staat in de DOM; de Basis staat in tests open; "Buffervolume" staat in Wat als? | –                |
| `page-ui.test.tsx` › "statistiek … onder de kop"                                 | Assertions blijven gelden (zelfde id en tekst in Meer instellingen); alleen de testtitel aanpassen                                                                                                       | WP-F             |
| `page-ui.test.tsx` › robuustheid, "Eigen 37,5 h", structuur, uitleg, afspeelknop | Groen: de knop staat in een gesloten `<details>` en `getByRole` vindt hem (geverifieerd); de regio's blijven                                                                                             | –                |
| `dwellings-ui.test.tsx`                                                          | Groen als de strook niet rendert terwijl de Basis open is en tegels en strook "kW/woning" gebruiken                                                                                                      | WP-B controleert |
| `verify-ui.test.tsx` › rekenfout                                                 | Groen bij precies één retry-knop en de tekst "Rekenfout: …"                                                                                                                                              | WP-D, WP-F       |
| `charts-ui.test.tsx`                                                             | Groen; "Klik in de grafiek om het buffervolume te kiezen.", "De gevoeligheid wordt berekend", "Herberekenen: …" en het voortgangslabel blijven                                                           | WP-E             |
| `plumbing-store.test.ts`, `plumbing-print.test.tsx`                              | Groen: `setTab('gevoeligheid')` blijft geldig en `autoSensitivity` staat uit in tests                                                                                                                    | –                |

**Nieuwe tests:**

- **`view-verdict.test.ts`:** echte engine in de hoofdthread. Alle rijen van §4.5 letterlijk, inclusief "1,0 kWh", "90 %", "200,0 kWh" en de knop "Kleinere aansluiting volstaat ook" bij voorbeeld 2. **Elke knop doet wat hij belooft:** patch toepassen, opnieuw analyseren, en dan uren ≤ toegestaan. Dit geldt voor woning-basis, 10 woningen en kantoor-basis.
- **`view-sensitivity-facts.test.ts`:** transities voor het woningraster (1×35 A @ 0,20; 1×25 A @ 0,60 met 7,5 kWh).
- **`view-mini-chart.test.ts`:** knik op 0,80 m³ en `sliderX` gelijk aan de markeringsformule.
- **`view-settings-diff.test.ts`.**
- **`store-ux.test.ts`:**
  - undo en `ownInput` bij voorbeelden, gebouwfunctie en knoppen;
  - `basisOpen` en de opslag, met een mock van localStorage die een fout gooit;
  - `?c=` maakt dicht;
  - `encodeInput` bevat geen UI-toestand;
  - `autoSensitivity` vraagt het raster op;
  - buffer wijzigen vraagt geen nieuw raster op.
- **UI-tests:** `basis-ui`, `whatif-ui`, `verdict-ui`, `depth-ui`, `workbench-ui`. Elk met `localStorage.clear()` in `beforeEach`; tests met het raster zetten `setAutoSensitivity(true)`.

---

## 11. Acceptatiecriteria

### Functioneel

1. Eerste bezoek: de Basis staat open met de voorbeeldregel. **Bekijk het resultaat** klapt in, scrolt en zet de focus op H2 "Resultaat". Na herladen staat de Basis dicht. Een deellink opent dicht.
2. Elk huidig invoerveld is bereikbaar. Een test loopt de lijst van alle labels van nu na en vindt elk via `getByLabelText` in de DOM, voor elke gebouwfunctie en bij grootverbruik.
3. Kop en tegels veranderen niet als de modus wisselt.
4. Alle knoppen doen wat ze beloven (unit-test van §10).
5. Undo en `ownInput` zetten de invoer exact terug.
6. Deellinks versie 1 werken: bestaande tests groen en een oude link opent.
7. Print bevat: PrintSummary, het oordeel, het advies, 8 kaarten, de robuustheidstabel open, koude week en gevoeligheid. Print bevat niet: Basis, Wat als?, Verdieping, toast en balk.
8. `git diff --stat main -- src/ui src/concepts/peakshaving/model tests/peakshaving/fixtures` is leeg en de klimaatplafond-tests zijn groen.
9. `npm test`, `npm run lint` en `npm run build` zijn groen.

### Meetbaar met `tools/ux-check/measure.mjs`

Opzet: eigen Vite-server, Chromium met locale nl-NL. De baseline wordt **met hetzelfde script** op `main` gemeten en beide uitkomsten worden gerapporteerd.

- **Woorden boven de vouw:** woorden met een letter of cijfer in tekstknopen waarvan het element zichtbaar is (`checkVisibility()`, niet `aria-hidden`, niet in een gesloten `<details>` of `hidden`) en waarvan de rect de viewport raakt. `<option>` telt niet mee; SVG-tekst wel. Gemeten na de eerste doorrekening.

Alleen pc of laptop: gemeten op 1280×800, 1440×900 en 1920×1080. De doelen op 390 px (telefoon) zijn vervallen en staan
hieronder doorgehaald. Stand na de review: zie `docs/AANNAMES.md` › "Schermopbouw (werkbank)" (drie doelen niet gehaald;
de norm is daar bijgesteld, met de reden).

| Meting                                                                                     | Doel                                                                                                             | Stand (1440×900)                                       |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Woorden, 1440×900, Basis open                                                              | ≤ 230 en ≤ 40 % van de baseline                                                                                  | 228; 40 % (162) niet gehaald, bijgesteld: alleen ≤ 230 |
| Woorden, 1440×900, ingeklapt                                                               | ≤ 180                                                                                                            | 210, bijgesteld: ≤ 215                                 |
| ~~Woorden, 390×844, open~~                                                                 | ~~≤ 120~~                                                                                                        | vervallen (alleen pc/laptop)                           |
| ~~Woorden, 390×844, ingeklapt~~                                                            | ~~≤ 130~~                                                                                                        | vervallen                                              |
| Zichtbare interactieve elementen bij laden, 1440×900 ingeklapt                             | ≤ 35 (baseline 38)                                                                                               | 37, bijgesteld: ≤ 38                                   |
| Tabstops vanaf de bovenkant tot het eerste focusbare element in de oordeelkaart, ingeklapt | ≤ 15 (baseline 57)                                                                                               | 8                                                      |
| Skip-link, Basis open                                                                      | Tabstop 2 of 3; activeren zet de focus op H2 "Resultaat"                                                         | tabstop 2, focus op H2                                 |
| Scrolldiepte, 1440×900 open                                                                | Oordeelkop volledig in beeld en bufferschuif in beeld zonder scrollen                                            | gehaald                                                |
| Scrolldiepte, 1440×900 ingeklapt                                                           | Oordeel, buffer- en batterijschuif en stapper in beeld zonder scrollen                                           | gehaald                                                |
| Scrolldiepte, 1280×800 ingeklapt                                                           | Oordeel en bufferschuif in beeld                                                                                 | gehaald                                                |
| ~~Telefoon 390×844 ingeklapt~~                                                             | ~~Oordeelkop top ≤ 420 px; bufferschuif top ≤ 1150 px~~                                                          | vervallen                                              |
| ~~Telefoon, mini-oordeelbalk~~                                                             | ~~Zichtbaar zolang de bufferschuif in beeld is~~                                                                 | vervallen                                              |
| ~~Telefoon, eerste bezoek~~                                                                | ~~Gebouwfunctie top < 450 px en de balk zichtbaar~~                                                              | vervallen                                              |
| Geen horizontale overflow                                                                  | `document.documentElement.scrollWidth` ≤ vensterbreedte op 1280, 1440 en 1920, zie de toestanden hieronder       | gehaald                                                |
| Geen geneste scroll                                                                        | Geen element buiten ScrollRegion of tabelwrappers met `overflow-y: auto/scroll` en `scrollHeight > clientHeight` | gehaald                                                |
| Print (`page.pdf` A4 staand)                                                               | Hoogstens 1 pagina langer dan de baseline                                                                        | 2 pagina's (baseline 2)                                |

De overflowcontrole op de drie desktopbreedtes geldt voor alle combinaties van:

- Basis open of dicht;
- Woning, Meerdere woningen of Kantoor;
- grootverbruik;
- Meer instellingen open, Verfijnen open;
- elk tabblad;
- toast zichtbaar.

Daarnaast screenshots op 1280, 1440 en 1920 in licht en donker, plus de klimaatplafondpagina als regressiebeeld. Op een
telefoon of tablet wordt alleen gecontroleerd dat de korte melding bovenaan staat.

---

## 12. Bewust niet in deze ronde

- Het model, de drempels in `model/kpis.ts` en `model/messages.ts`, en daarmee het verschil in ernst tussen kaarten en meldingen (B3). De kaarten staan nu ingeklapt.
- `src/ui/**` en het klimaatplafond.
- De inhoud van de 8 KPI-kaarten, PrintSummary en PrintView.
- Het tabblad Gevoeligheid als grafiek (alleen de lead). De matrix "buffer × batterij → aansluiting".
- Een tweede effectgrafiek (B4) en een compact schema bij de Basis (B16).
- Reeksen met alleen nullen verbergen in de legenda's van Koude week en Jaar (E1).
- Gebouwmassa-knoppen en tijdconstante samenvoegen tot één bediening. Ze staan nu naast elkaar.
- Warmteverlies schatten uit gasverbruik of bouwjaar.
- Varianten vastpinnen en vergelijken.
- CSV-export.
- Eigen invoer bewaren over F5 heen.
- Piekvermogen per woning invoeren.
- `DEBOUNCE_MS`, klimaatdata en scenario-ids.

---

## 13. Risico's en maatregelen

| Risico                                        | Maatregel                                                                                                                                                                          |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Het raster rekent altijd (CPU op de telefoon) | De sleutel bevat geen buffer of batterij, de engine breekt een lopend raster af en het oude raster blijft gedimd staan. In WP-G meten voor 200 woningen en een kantoor van 500 kW. |
| Twee bedieningen voor de aansluiting          | Eén storeveld; de strook en de stapper tonen dezelfde tekst; de rondleiding stap 5 legt het uit.                                                                                   |
| Knoppen op verouderde rasterdata              | De `gridMatches`-poort; anders een plaatshouder.                                                                                                                                   |
| Sticky en vaste elementen op iOS              | De geneste scroll verdwijnt; de balk gebruikt `env(safe-area-inset-bottom)`.                                                                                                       |
| Een kantoor heeft een langere Basis           | Bij een open Basis valt Wat als? daar mogelijk deels onder de vouw. Het meetdoel geldt voor de woning; een kantoor wordt alleen op overflow gecontroleerd.                         |
