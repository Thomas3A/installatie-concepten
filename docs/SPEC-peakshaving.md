# SPEC — Concept 2: Peakshaving van een lucht/water-warmtepomp met warmtebuffer en batterij

Versie 1.0 — 16 oktober 2026 — specificatie voor de bouw met Claude Code in de repo `Thomas3A/installatie-concepten`.

> **Leeswijzer voor Claude Code.** Dit document is de volledige bouwopdracht. §0 geeft de werkafspraken en de fasering, §1–§2 het doel en de gebruikersflow, §3 de invoer, §4 de klimaatdata, §5 het rekenmodel (normatief, samen met de Python-referentie-implementatie in `tools/peakshaving_ref/`), §6–§8 uitvoer, grafieken en conceptvisualisatie, §9 de referentiewaarden voor de tests, §10 de bestandsstructuur, §11 de uitlegteksten, §12 de aannames voor `docs/AANNAMES.md`, §13 de definitie van "klaar". Lees eerst alles, bouw daarna in de fasen van §0.4.

---

## 0. Werkafspraken, context en fasering

### 0.1 Repo-conventies (gelden onverkort, zie `CLAUDE.md`)

- UI-teksten, uitleg, meldingen, README en commentaar: **Nederlands**. Code, identifiers, bestandsnamen en commitberichten: **Engels**.
- **Geen merknamen** van fabrikanten (warmtepompen, buffervaten, batterijen, netbeheerders) in code, data, UI, tests of commits.
- **Pure kern**: `src/core/**` en `src/concepts/peakshaving/model/**` zijn pure TypeScript zonder React of DOM, volledig unit-testbaar met Vitest.
- **Eenheden intern**: in dit concept rekenen we intern in **kW, kWh, °C/K en uren** (afwijkend van het klimaatplafond-concept dat in SI-basiseenheden rekent; dit is bewust, omdat alle invoer en uitvoer in kW/kWh is en de referentie-implementatie dat ook doet). De UI toont kW, kWh, m³, A, °C, uren.
- Getalnotatie in de UI via `Intl.NumberFormat('nl-NL')` (`src/core/format.ts`).
- Footer-disclaimer op elke pagina: *"Indicatief rekenmodel voor uitleg en conceptkeuze. Geen vervanging van de productberekening van de fabrikant."* Voor dit concept wordt daar één zin aan toegevoegd: *"Klimaatdata: KNMI De Bilt (open data); referentiejaren zijn een reconstructie, geen officiële NEN 5060-data."*
- Aannames die niet in deze spec staan: noteren in `docs/AANNAMES.md` (sectie "Concept 2: peakshaving").
- Bestaande stack hergebruiken: Vite 6, React 18, TypeScript 5, react-router-dom 6 (HashRouter), zustand 5, **uPlot** voor grafieken, KaTeX voor formules in de uitleg, Vitest, ESLint, Prettier. Geen nieuwe grafiekbibliotheek toevoegen.

### 0.2 Waar het concept komt

- Nieuwe map `src/concepts/peakshaving/` met `data/`, `model/`, `ui/`, plus `scenarios.ts`, `texts.ts`, `share.ts`, `store.ts` (zelfde opzet als `src/concepts/klimaatplafond/`).
- Eén regel toevoegen aan `src/concepts/index.ts`:
  `{ id: 'peakshaving', titel: 'Peakshaving warmtepomp met buffer en batterij', beschrijving: 'Hoeveel buffervat en batterij zijn nodig om met een lucht/water-warmtepomp binnen de elektrische aansluiting te blijven? Uursimulatie met referentiejaren.', status: 'actief', route: '/peakshaving', component: lazy(...) }`
- De homepage-tegel "binnenkort" voor dit concept wordt daarmee actief.
- Documentatie: dit bestand als `docs/SPEC-peakshaving.md`; aannames in `docs/AANNAMES.md`; data-herkomst in `docs/klimaat/README.md`.

### 0.3 Terminologie

- **Lucht/water-warmtepomp**: buitenlucht als bron, water als afgiftemedium. (In de opdracht "water/lucht" genoemd; bedoeld is dezelfde machine. In de UI consequent "lucht/water-warmtepomp".)
- **Warmtebuffer / buffervat**: een vat water tussen warmtepomp en afgiftesysteem dat warmte opslaat op temperatuurniveau boven de aanvoertemperatuur.
- **Batterij**: elektrische opslag achter de meter, in dit concept exclusief ingezet voor de warmtepomp(groep).
- **Aansluitwaarde**: standaard kleinverbruikaansluiting (bijv. 3×25 A) of gecontracteerd vermogen (grootverbruik).
- **WP-budget / P_limiet**: het deel van de aansluiting dat aan warmtepomp + batterij is toegewezen.
- **Overschrijding**: uren waarin het netvermogen voor de WP-groep boven P_limiet komt.
- **Comfortverlies**: uren tijdens gebruikstijd waarin de binnentemperatuur meer dan 0,5 K onder het setpoint ligt.

### 0.4 Fasering (één commit per fase, `npm test`, `npm run lint` en `npm run build` groen vóór elke commit)

1. **Data + kern + tests.** Data-bestanden plaatsen (§4), `model/` bouwen volgens §5 met de Python-referentie als voorbeeld, alle tests van §9 schrijven en groen krijgen. Nog geen UI.
2. **UI-basis.** Store, invoerpanelen (§3), KPI-kaarten en advies-banner (§6), robuustheidstabel, deelbare link, scenario's. Web Worker voor de simulaties.
3. **Grafieken.** Koude-week-paneel met scrubber, jaarbelastingduurkromme, gevoeligheidsgrafiek (§7).
4. **Conceptvisualisatie.** SVG-schema gekoppeld aan de scrubber (§8).
5. **Uitleg, meldingen, polish, deploy.** Uitleg-tab (§11), meldingen met "Waarom?", printweergave, README en AANNAMES bijwerken, PR naar `main`, controleren dat GitHub Pages de nieuwe route serveert.

Werk op een feature-branch `claude/peakshaving` en maak aan het eind een PR naar `main` (de Pages-workflow publiceert vanaf `main`). Vraag niet om bevestiging tussen fasen tenzij iets in deze spec tegenstrijdig blijkt; noteer twijfelgevallen in `docs/AANNAMES.md` en ga door.

---

## 1. Doel en doelgroep

### 1.1 Kernvraag

Een installatieadviseur wil weten: **hoe groot moet een lucht/water-warmtepomp zijn, en past die binnen de bestaande (of een kleinere) elektrische aansluiting als ik een warmtebuffer en/of een batterij toevoeg?** De tool maakt zichtbaar hoe een buffervat de *thermische* piek van de warmtepomp afschaaft (kleinere machine), hoe een batterij de *elektrische* piek aan de meter afschaaft (kleinere aansluiting), en waar de grens ligt: een buffer helpt tegen uurpieken (opstoken, tapwater, avondpiek), niet tegen een koudegolf van dagen.

### 1.2 Doelgroep

Collega's en opdrachtgevers met installatietechnische kennis (adviseurs, installateurs, gebouweigenaren). Taalgebruik vakmatig, UI in het Nederlands.

### 1.3 De drie inzichten die de tool moet overbrengen

1. **Piekvermogen ≠ energie.** Op een koude dag met tapwater en opstoken is de uurpiek van de warmtevraag 30–70 % hoger dan het stationaire ontwerpverlies; de buffer vangt dat op zodat de warmtepomp op het *gemiddelde* van de koude dag kan worden gedimensioneerd. Daarboven levert meer buffer niets meer op (plateau in de gevoeligheidsgrafiek).
2. **Batterij schaaft de meterpiek.** De batterij levert de elektrische piek boven het WP-budget en laadt bij in de uren eronder; daarmee kan één (soms twee) aansluitstap lager, of blijft een bestaande aansluiting toereikend.
3. **Consequenties in uren.** Elke keuze wordt uitgedrukt in *uren overschrijding* van de aansluiting (en in *uren comfortverlies* als de aansluiting fysiek begrenst), zodat de adviseur kan afwegen of 8 uur per jaar overschrijding acceptabel is of niet.

---

## 2. Gebruikersflow en schermopbouw

### 2.1 Flow

1. **Stap 1 — Gebouw:** functie (woning/kantoor) en het piekvermogen verwarming (ontwerpwarmteverlies) invoeren. Pas daarna worden de bereiken van buffer en batterij afgeleid (§3.5) en worden de overige stappen actief.
2. **Stap 2 — Aansluiting:** aansluitwaarde kiezen (standaardlijst of gecontracteerd vermogen) en het aandeel voor de warmtepomp instellen.
3. **Stap 3 — Warmtepomp en afgifte:** stooklijn-preset, maximale WP-aanvoertemperatuur, WP-vermogen automatisch (gedimensioneerd) of handmatig.
4. **Stap 4 — Maatregelen:** buffervolume (schuif) en batterijcapaciteit (schuif).
5. **Resultaat:** KPI-kaarten, advies-banner, grafieken (koude week, jaar, gevoeligheid), conceptschema, uitleg. Alles herberekent live (debounced) bij elke wijziging.

### 2.2 Schermopbouw

- **Kop**: titel, keuzelijst **klimaatjaar** (§4.3), knop *Scenario's*, knop *Deel link*, knop *Print*.
- **Linkerkolom (invoer)**: vier genummerde blokken (Gebouw, Aansluiting, Warmtepomp & afgifte, Maatregelen). Elk blok heeft een uitklapbaar deel *Expert* voor de secundaire parameters. Elke invoer heeft een korte toelichting (tooltip of regel eronder) en een geldig bereik; ongeldige waarden worden begrensd, niet geweigerd.
- **Rechterkolom (resultaat)**:
  - rij **KPI-kaarten** (§6.1) met kleurcodering;
  - **advies-banner** (§6.2);
  - **tabbladen**: *Koude week* · *Jaar* · *Gevoeligheid* · *Concept* · *Uitleg*;
  - **meldingen** met knop *Waarom?* (§6.4), boven de tabbladen.
- Onder 1024 px schermbreedte komt de invoer boven het resultaat (één kolom); grafieken schalen mee (uPlot `ResizeObserver`).
- **Printweergave**: invoer-samenvatting, KPI's, advies, koude-weekgrafiek, gevoeligheidsgrafiek en de robuustheidstabel op 1–2 A4-pagina's (zoals bij het klimaatplafond-concept).
- **Deelbare link**: volledige invoer in de URL-hash (compact, versie-nummer erin), zoals `share.ts` van het klimaatplafond.

---

## 3. Invoer

Alle defaults hieronder zijn de UI-defaults én de defaults van de Python-referentie (`woning_defaults(8.0)`, `kantoor_defaults(100.0)`). De kolom *TS-naam* is de identifier in `model/`.

### 3.1 Blok 1 — Gebouw

| Invoer | TS-naam | Woning | Kantoor | Bereik | UI | Toelichting |
|---|---|---|---|---|---|---|
| Gebouwfunctie | `building.use` | `'residential'` | `'office'` | — | segmentknop | Schakelt de schema's en de defaults hieronder. |
| Piekvermogen verwarming | `building.designLoadKw` | 8 | 100 | 1–2000 kW | getal + schuif | Ontwerpwarmteverlies (transmissie + ventilatie) bij T_e = −10 °C en T_i,ontwerp, **exclusief** opwarmtoeslag (NEN-EN 12831). Dit is de eerste invoer; alle bereiken worden hiervan afgeleid. |
| Ontwerpbuitentemperatuur | `building.designOutdoorC` | −10 | −10 | −15…−5 | expert | NEN-EN 12831, De Bilt. |
| Ontwerpbinnentemperatuur | `building.designIndoorC` | 20 | 21 | 18–24 | expert | Hoort bij het ingevoerde piekvermogen. |
| Setpoint tijdens gebruik | `building.setpointUseC` | 20 | 21 | 16–24 | expert | Woning: altijd "in gebruik". |
| Setpoint buiten gebruik | `building.setpointSetbackC` | 20 | 19 | 10–24 | expert | Woning default geen nachtverlaging (advies bij warmtepompen). Kantoor 2 K verlaging. |
| Stookgrens tijdens gebruik | `building.balanceTempC` | 15 | 12 | 8–18 | expert | Interne winsten tijdens gebruik = UA·(setpointUse − balanceTemp). Kantoor: verlichting, apparatuur, personen. |
| Gebouwmassa | `building.timeConstantH` | 40 (gemiddeld) | 20 | 8–120 h | preset licht 20 / gemiddeld 40 / zwaar 80 + expertgetal | Tijdconstante τ van de binnenknoop; C = τ·UA. Kantoor default 20 h (ventilatie domineert). |
| Traagheid gevel | `building.envelopeLagH` | 2 | 2 | 0–12 h | expert | 1e-orde filter op de buitentemperatuur. 0 = uit. |
| Opwarmfactor | `building.boostFraction` | 0,30 | 0,30 | 0–1 | expert | Max. extra vermogen boven het stationaire verlies om het setpoint terug te winnen, als fractie van het piekvermogen. |
| Gebruikstijden | `building.useStartH`, `building.useEndH` | — | 7, 18 | 0–24 | expert (kantoor) | Maandag t/m vrijdag. |
| Opstooktijd | `building.preheatH` | 0 | 4 | 0–8 h | expert (kantoor) | Uren vóór gebruiksaanvang waarin naar het gebruikssetpoint wordt gestookt. |
| Warm tapwater | `building.dhw.enabled` | aan | uit | — | schakelaar | |
| Tapwaterbehoefte | `building.dhw.dailyKwh` | 10 | 0 | 0–50 kWh/dag | getal | Nuttig, bij 10 °C koud water. |
| Boilervat | `building.dhw.tankLitre` | 200 | 0 | 0–2000 l | getal | |
| Boilertemperatuur | `building.dhw.tankTempC` | 55 | 55 | 45–65 | expert | Begrensd op `heatPump.maxSupplyC`. |

### 3.2 Blok 2 — Elektrische aansluiting

| Invoer | TS-naam | Woning | Kantoor | Bereik | UI | Toelichting |
|---|---|---|---|---|---|---|
| Aansluitwaarde | `grid.connection` | 1×35 A | 3×80 A | lijst §5.5 + *grootverbruik* | keuzelijst | Toont het vermogen in kW ernaast. |
| Gecontracteerd vermogen | `grid.contractedKw` | — | 100 | 10–5000 kW | getal, alleen bij grootverbruik | |
| Aandeel voor warmtepomp | `grid.heatPumpShare` | 0,40 | 0,50 | 0,10–1,00 | schuif (%) | Rest is voor overig gebruik (verondersteld volledig benut op het piekmoment). Toont P_limiet in kW. |
| Toegestane overschrijdingsuren | `grid.allowedExceedanceH` | 0 | 0 | 0–200 h/jaar | getal | Gebruikt bij "kleinste passende aansluiting". |
| Toegestane comfortverliesuren | `grid.allowedComfortLossH` | 0 | 0 | 0–200 h/jaar | expert | Gebruikt bij het dimensioneren van de warmtepomp. |

### 3.3 Blok 3 — Warmtepomp en afgifte

| Invoer | TS-naam | Default | Bereik | UI | Toelichting |
|---|---|---|---|---|---|
| Stooklijn-preset | `heatPump.emitterPreset` | `'MT'` | LT / MT / HT | segmentknop | LT 35/28 °C (vloerverwarming, klimaatplafond), MT 45/35 °C (LT-radiatoren), HT 55/45 °C (bestaande radiatoren); aanvoer/retour bij ontwerpcondities, zie §5.2. |
| Max. aanvoertemperatuur WP | `heatPump.maxSupplyC` | 60 | 55 / 60 / 65 / 70 / 75 | keuzelijst | Bepaalt de laadtemperatuur van de buffer (−2 K). |
| Carnot-rendement | `heatPump.carnotEfficiency` | 0,45 | 0,35–0,55 | expert | COP = η·T_aanvoer,K/(T_aanvoer − T_e)·f_ontdooi. |
| Bijstookelement | `heatPump.backupHeaterKw` | 0 | 0–50 kW | getal | Elektrisch, COP 1. Default uit. |
| WP-vermogen | `heatPump.sizingMode` + `heatPump.nominalKw` | automatisch | 0,1–3 × piekvermogen | schakelaar auto/handmatig + schuif | Automatisch = gedimensioneerd (§5.9) op het gekozen klimaatjaar. Thermisch bij A7/W35. |

### 3.4 Blok 4 — Maatregelen

| Invoer | TS-naam | Default | Bereik | UI | Toelichting |
|---|---|---|---|---|---|
| Buffervolume | `buffer.volumeM3` | 0 | 0 … V_max (§3.5), stap 0,05 (woning) / 0,5 (kantoor) | schuif + getal | Live ernaast: nuttige inhoud in kWh en "≈ x uur piekvermogen". |
| Laadstrategie | `buffer.strategy` | `'predictive'` | voorspellend / altijd | segmentknop | Zie §5.6 stap 5. |
| Batterijcapaciteit | `battery.capacityKwh` | 0 | 0 … E_max (§3.5), stap 0,5 / 5 | schuif + getal | Bruto. Live ernaast: nuttige kWh en vermogen. |
| Batterijvermogen | `battery.powerKw` | auto = 0,5 C | 0,2–2 C | expert | |
| Bedrijfsmodus | `grid.mode` | `'exceedance'` | overschrijding tonen / aansluiting begrenst | segmentknop | §5.8. |

### 3.5 Bereiken afgeleid van het piekvermogen (stap 1 bepaalt stap 4)

- Nuttige opslag per m³: `kwhPerM3 = 1.163 · ΔT_buffer · f_strat` (§5.3). Buffer-schuif: `V_max = roundUpNice(12 · designLoadKw / kwhPerM3)` (12 uur piekvermogen), minimaal 1 m³ (woning) / 10 m³ (kantoor). Markeringen op de schuif bij 2, 4 en 8 uur piekvermogen.
- Batterij-schuif: `E_max = roundUpNice(8 · designLoadKw / 2.5)` (8 uur van een geschatte elektrische piek bij COP 2,5), minimaal 10 kWh (woning) / 100 kWh (kantoor). Markeringen bij 2, 4 en 8 uur.
- Handmatige WP-schuif: 0,1–3 × designLoadKw.
- `roundUpNice` rondt af naar boven op 1-2-5-reeks (1, 2, 5, 10, 20, 50, …) met tussenstappen 1,5 / 2,5 / 3 / 4 toegestaan.
- Bij wijziging van het piekvermogen schalen de ingestelde buffer en batterij **proportioneel mee** als ze niet 0 zijn (de gebruiker houdt dezelfde "uren piekvermogen").

---

## 4. Klimaatdata

### 4.1 Herkomst en status

De officiële uurdata van **NEN 5060:2018** (referentiejaar *energie*, ontwerpjaren *T1* en *T5*; een *T2* bestaat in de 2018-versie niet meer) zijn auteursrechtelijk beschermd en mogen niet op een publieke site worden gepubliceerd. Daarom is een **reconstructie** gemaakt uit open KNMI-uurdata van station 260 De Bilt:

- NEN 5060:2018 is samengesteld uit werkelijke kalendermaanden van De Bilt uit de periode **1996–2015**. De gepubliceerde maandgemiddelde temperaturen per referentiejaar (W/E-rapport 9604 voor RVO, 2018, tabel 4) zijn per maand vergeleken met alle twintig kandidaatmaanden; voor vrijwel elke maand is er precies één maand die binnen 0,05 K overeenkomt. Die maanden zijn gebruikt (bronjaar per maand staat in `meta.jaren.<naam>.bronjaar_per_maand`). Alleen februari van het energiejaar was niet scherp (2004: 4,83 °C vs 4,96 °C); daar is de ISO 15927-4-selectie (Finkelstein-Schafer op T, RV en straling) doorslaggevend geweest, die eveneens 2004 geeft.
- Maandovergangen zijn, zoals in NEN 5060, over 16 uur (laatste 8 uur van de maand, eerste 8 uur van de volgende) vloeiend gemaakt; hier als cross-fade met de werkelijke vervolg-/voorgeschiedenis-uren van de bronjaren, ook over de jaargrens dec→jan.
- Het jaar telt 365 dagen (29 februari weggelaten), **begint op een maandag** (conform NEN 5060) en staat in **MET (UTC+1) zonder zomertijd**; uurindex 0 is 1 januari 00:00–01:00.
- Resultaat: de maandgemiddelden van de reconstructie wijken maximaal 0,05 K af van de NEN-tabel (zie `meta.jaren.<naam>.maandgemiddelde_T` vs `..._NEN5060_2018`).

**Let op bij de interpretatie van T1 en T5.** De NEN-ontwerpjaren zijn gemaakt voor temperatuuroverschrijdings- en koellastberekeningen; hun winterstrengheid is daarvan een bijproduct. Uit de vergelijking met alle 74 stookseizoenen van De Bilt sinds 1951 (`docs/klimaat/winterstatistiek_1951_2025.csv`) blijkt:

- **T1** heeft wél een strenge winter: het combineert de drie koudste maanden van 1996–2015 (december 2010, januari 1997, februari 1996). Koudste week −7,6 °C, Hellmann-getal ≈ 195 — vergelijkbaar met de winter 1984/85 en op plaats ~8 van 74 seizoenen. Goed voor piekvragen van 1–3 dagen.
- **T5** heeft een gemiddelde winter (koudste week −4,2 °C, Hellmann ≈ 122, middenmoot), en het **energiejaar** een zachte (koudste week −2,5 °C).
- De basisperiode 1996–2015 bevat **geen** winter van het kaliber 1955/56, 1962/63, 1978/79 of 1986/87 (koudste week −9 tot −10 °C, 1963 twee maanden aaneengesloten vorst). Juist het aanhoudende karakter van zulke winters is bepalend voor het plateau in de buffergevoeligheid (de warmtepomp moet dagen- tot wekenlang het gemiddelde leveren).

Daarom zijn er twee **stresstest-referentiejaren** toegevoegd, opgebouwd als het T1-jaar maar met het complete werkelijke stookseizoen (1 november t/m 31 maart) van een strenge winter uit de KNMI-reeks, zodat het weer binnen het seizoen aaneengesloten en echt is:

- **`winter1979`** — strenge winter 1978/79: koudste week −10,2 °C (31 dec – 6 jan), koudste 72 uur −11,4 °C, T min −16,7 °C, 98 uur onder −10 °C, Hellmann 206. In 1951–2025 komt zo'n winter ongeveer eens per 25 jaar voor (1956, 1963, 1979, 1985, 1987).
- **`winter1963`** — extreme winter 1962/63: Hellmann 346 (strengste sinds 1830), 727 uur onder −5 °C, koudste maand −5,3 °C, 3382 graaddagen. Ordegrootte eens per eeuw, en met de huidige opwarming zeldzamer dan dat.

De herhalingstijden zijn empirisch uit 1951–2025 en overschatten de kans in het huidige klimaat; dat staat in de tooltip.

Daarnaast zijn de **werkelijke jaren 1951–2025** (alleen temperatuur) beschikbaar als "stresstest met echt weer" (bijv. 1956, 1963, 1979, 1985, 1987, 1997, 2012); de aanbevolen stresstestjaren staan in `meta.aanbevolen_stresstest`.

In de UI altijd benoemen: *"Reconstructie op basis van KNMI De Bilt; geen officiële NEN 5060-data."* De bestanden mogen in de repo (KNMI open data, bronvermelding: *KNMI*).

### 4.2 Bestanden (meegeleverd in de hand-off, plaatsen in `src/concepts/peakshaving/data/`)

**`referentiejaren.json`** (≈ 550 kB; vijf jaren):

```jsonc
{
  "meta": {
    "bron": "...", "methode": "...", "tijdas": "...",
    "variabelen": { "T": "temperatuur 1,5 m [0,1 °C]", "U": "relatieve vochtigheid [%]", "FH": "windsnelheid [0,1 m/s]", "Q": "globale straling, uurgemiddelde [W/m2]" },
    "startWeekdag": 1,                               // 1 = maandag
    "jaren": {
      "energie": { "omschrijving": "...", "bronjaar_per_maand": [2001, 2004, 2004, 2002, 2000, 2011, 2008, 2001, 2011, 2010, 2003, 2003],
                   "maandgemiddelde_T": [...12], "maandgemiddelde_T_NEN5060_2018": [...12],   // null bij de stresstestjaren
                   "statistiek": { "Tgem": 10.72, "Tmin": -8.8, "uren_onder_0": 458, "uren_onder_min5": 42, "uren_onder_min10": 0,
                                   "koudste_24u": -5.02, "koudste_72u": -4.04, "koudste_168u": -2.46, "koudste_week_start_uur": 289,
                                   "graaddagen_18": 2778, "graaddagen_15_5": 2043 } },
      "T5": { "bronjaar_per_maand": [2013, 1996, 2013, 1996, 2006, 2011, 2013, 1997, 1999, 2001, 1999, 2009], ... },
      "T1": { "bronjaar_per_maand": [1997, 1996, 2005, 2007, 1998, 2006, 2006, 2003, 2011, 2011, 2010, 2010], ... },
      "winter1979": { "bronjaar_per_maand": [1979, 1979, 1979, 2007, 1998, 2006, 2006, 2003, 2011, 2011, 1978, 1978], ... },
      "winter1963": { "bronjaar_per_maand": [1963, 1963, 1963, 2007, 1998, 2006, 2006, 2003, 2011, 2011, 1962, 1962], ... }
    }
  },
  "data": {
    "energie": { "T": [8760 × int, 0,1 °C], "U": [8760 × int %], "FH": [8760 × int 0,1 m/s], "Q": [8760 × int W/m2] },
    "T5": { ... }, "T1": { ... }, "winter1979": { ... }, "winter1963": { ... }
  }
}
```

Statistiek van de vijf referentiejaren (ter controle en voor de UI-tooltip bij de keuzelijst):

| Jaar | T gem. | T min | uren < 0 °C | uren < −5 °C | uren < −10 °C | koudste 24 u | koudste 72 u | koudste week | graaddagen (18 °C) |
|---|---|---|---|---|---|---|---|---|---|
| energie (≈ RA2018EN) | 10,72 | −8,8 | 458 | 42 | 0 | −5,0 | −4,0 | −2,5 | 2778 |
| T5 — ontwerp 5 % (≈ RA2018T5) | 10,49 | −14,0 | 1202 | 199 | 21 | −9,2 | −6,6 | −4,2 | 2916 |
| T1 — ontwerp 1 % (≈ RA2018T1) | 10,36 | −15,8 | 1395 | 361 | 57 | −12,7 | −10,2 | −7,6 | 3043 |
| winter1979 — stresstest streng | 10,22 | −16,7 | 1357 | 366 | 98 | −12,5 | −11,4 | −10,2 | 3096 |
| winter1963 — stresstest extreem | 9,43 | −17,6 | 1778 | 727 | 145 | −12,0 | −10,3 | −8,7 | 3382 |

**`knmi-debilt-1951-2025.json`** (≈ 2,3 MB, **lazy laden** via dynamic import, alleen als de gebruiker een werkelijk jaar kiest):

```jsonc
{ "meta": { "bron": "...", "aanbevolen_stresstest": [1956, 1963, 1979, 1985, 1986, 1987, 1996, 1997, 2010, 2012],
            "startWeekdag": { "1951": 1, ..., "2025": 3 }, "statistiek": { "1951": {...}, ... } },
  "T": { "1951": [8760 × int 0,1 °C], ..., "2025": [...] } }
```

Werkelijke jaren: 29 februari weggelaten; `startWeekdag` is de echte weekdag van 1 januari (ISO, 1 = maandag), zodat kantoorweken op echte weekdagen vallen. Feestdagen worden genegeerd.

Leesbare CSV-versies (`docs/klimaat/referentiejaar_*.csv`, puntkomma-gescheiden, kolommen `uur_index;maand;dag;uur_MET;weekdag;T_C;RV_pct;wind_ms;Qglob_Wm2;bronjaar`) , `docs/klimaat/statistiek_jaren.csv` en `docs/klimaat/winterstatistiek_1951_2025.csv` (Hellmann-getal en koudste 24/72/168/336/720 uur per stookseizoen nov–mrt, 1951/52–2024/25) zijn documentatie, geen runtime-data.

Scripts om alles te reproduceren staan in `scripts/klimaat/` (`download_knmi.sh`, `parse_knmi.py`, `match_months.py`, `tmy_iso15927.py`, `winter_stats.py`, `build_reference_years.py`, zie `docs/klimaat/README.md`). Ze zijn niet nodig voor de build.

### 4.3 Keuzelijst klimaatjaar (in de kop)

- *Ontwerpjaar T1 — strenge winter (≈ NEN 5060:2018 ref T1)* — **default**
- *Ontwerpjaar T5 — gemiddelde winter (≈ NEN 5060:2018 ref T5)*
- *Energiejaar — langjarig gemiddeld (≈ NEN 5060:2018 energie)*
- *Stresstest strenge winter 1978/79 (≈ 1× per 25 jaar)*
- *Stresstest extreme winter 1962/63 (≈ 1× per eeuw)*
- *Werkelijk jaar KNMI De Bilt …* (sub-lijst 1951–2025, met per jaar T min en koudste week in de tooltip; aanbevolen stresstests gemarkeerd: 1956, 1963, 1979, 1985, 1986, 1987, 1996, 1997, 2010, 2012)

Tooltip per keuze: de omschrijving (`meta.jaren.<naam>.omschrijving`) plus de statistiekregel uit de tabel hierboven. Toelichting onder de keuzelijst: *"Dimensioneer op T1 (strenge winter, 1 %-ontwerpjaar) en controleer met de stresstest 1978/79. T5 toont een gemiddelde winter, het energiejaar is bedoeld voor jaarverbruik en SCOP. Herhalingstijden zijn empirisch uit 1951–2025 en in het huidige klimaat eerder langer."*

### 4.4 Koudste week

De koude week waarop de grafieken automatisch inzoomen is de aaneengesloten periode van **168 uur met de hoogste som van de ideale warmtevraag** `Q_ideal` (§5.6, pass 1), bij gelijke som de laagste gemiddelde buitentemperatuur. De zoektocht is **cyclisch**: het venster mag over de jaargrens lopen (het jaar wordt immers ook cyclisch gesimuleerd), en het startuur kan dus groter zijn dan 8760 − 168; de weergave plakt dan de laatste decemberuren vóór 1 januari (x-as "31 dec … 7 jan"). Getoond wordt die week **plus 24 uur ervoor en erna** (216 uur). De gebruiker kan in de grafiek pannen/zoomen; knop *Terug naar koude week*. Referentie: voor woning én kantoor met defaults in T5 begint de koude week op uurindex **314** (14 januari 02:00 MET); voor het energiejaar op 289; voor `winter1979` op **8736** (31 december 00:00, doorlopend tot 6 januari).

### 4.5 Optioneel (fase 2 of later, niet in v1): lokale import NEN 5060

Een bestandsveld waarmee een licentiehouder een eigen CSV met 8760 temperatuurwaarden (°C of 0,1 °C, met of zonder header) **lokaal in de browser** laadt; niets wordt geüpload of opgeslagen. UI-label: *"Eigen klimaatbestand (blijft lokaal)"*. Weekdag van 1 januari instelbaar (default maandag).

---

## 5. Rekenmodel (normatief)

De Python-referentie `tools/peakshaving_ref/peakshaving_ref.py` **is** het model; onderstaande tekst beschrijft dezelfde regels. Bij twijfel is de Python leidend. Port de regels één-op-één naar TypeScript; gebruik Engelse identifiers (vertaaltabel §5.11). Tijdstap 1 uur, 8760 uur per jaar, voorafgegaan door een inregelperiode van 168 uur (de laatste week van hetzelfde jaar, cyclisch), waarvan de uitkomsten niet meetellen.

### 5.1 Gebouw (1R1C met gevelfilter)

- `UA = designLoadKw / (designIndoorC − designOutdoorC)` [kW/K]
- `C = timeConstantH · UA` [kWh/K]
- Gefilterde buitentemperatuur (traagheid gevel): `alpha = 1 − exp(−1/envelopeLagH)` (als `envelopeLagH = 0`: `alpha = 1`); per uur `T_ef += alpha · (T_e − T_ef)`. Startwaarde: `T_e` op het eerste inregeluur.
- Weekdag van uur `t`: `((startWeekday − 1 + floor(t/24)) mod 7) + 1`.
- In gebruik: woning altijd; kantoor als weekdag ≤ 5 en `useStartH ≤ (t mod 24) < useEndH`.
- Setpoint `T_set(t)`: in gebruik → `setpointUseC`; kantoor met `preheatH > 0` en gebruik begint binnen `preheatH` uur → `setpointUseC` (opstoken); anders `setpointSetbackC`.
- Interne winsten `G(t)` [kW]: woning altijd `UA · (setpointUseC − balanceTempC)`; kantoor alleen in gebruik, anders 0. Zonnewinsten worden niet meegenomen (conservatief; de stralingsdata zit wel in het bestand voor later).
- Regelaar (gevraagd vermogen ruimteverwarming): `Q_ss = UA · (T_i − T_ef) − G`; `Q_req = max(0, Q_ss + min(C · (T_set − T_i) / 1 h, boostFraction · designLoadKw))`.
- Energiebalans binnenknoop na levering `Q_del`: `T_i += (Q_del − UA · (T_i − T_ef) + G) / C` (expliciet Euler, 1 h; stabiel omdat τ ≥ 8 h).
- Startwaarde `T_i = setpointUseC`.

### 5.2 Lucht/water-warmtepomp

- Capaciteitsfactor t.o.v. A7/W35, lineair geïnterpoleerd en buiten het bereik geklemd (incl. ontdooien en capaciteitsverlies bij lage buitentemperatuur):
  `(−20, 0,55) (−15, 0,62) (−10, 0,70) (−7, 0,76) (2, 0,86) (7, 1,00) (15, 1,10) (25, 1,15)`.
  Beschikbaar thermisch vermogen: `cap(t) = nominalKw · capFactor(T_e(t))`. (Onafhankelijk van de aanvoertemperatuur — vereenvoudiging, zie §12.)
- Ontdooifactor op de COP: `f_defrost(T_e)` lineair door `(−7, 1,0) (−5, 0,9) (5, 0,9) (7, 1,0)`, daarbuiten 1,0.
- COP: `cop(T_e, T_sup) = clamp(carnotEfficiency · (T_sup + 273,15) / max(T_sup − T_e, 8) · f_defrost(T_e), 1,2, 7,0)`.
- Stooklijn (weersafhankelijke aanvoer): preset geeft `(T_sup,design, T_ret,design, T_sup,min)`: LT (35, 28, 25), MT (45, 35, 30), HT (55, 45, 35). `T_sup(T_e)` = `T_sup,design` bij `T_e ≤ designOutdoorC`, lineair naar `T_sup,min` bij `T_e ≥ 15 °C`, daarboven constant.
- Buffer-laadtemperatuur: `T_buf,max = maxSupplyC − 2`. COP bij bufferladen: `cop(T_e, T_buf,max)`; bij boilerladen: `cop(T_e, tankTempC)`.
- Modulatie/cycling wordt niet gemodelleerd (continu modulerend tussen 0 en `cap`).
- Bijstookelement: COP 1, vermogen `backupHeaterKw`.

Controlewaarden (exact): `capFactor(7) = 1,0`, `capFactor(−10) = 0,70`, `capFactor(−8,5) = 0,73`, `capFactor(4,5) = 0,93`, `capFactor(20) = 1,125`, `capFactor(−25) = 0,55`; `f_defrost(−6) = 0,95`, `f_defrost(0) = 0,9`, `f_defrost(10) = 1,0`; `cop(7, 35) = 4,952`, `cop(−7, 35) = 3,302`, `cop(2, 35) = 3,782`, `cop(−10, 45) = 2,603`, `cop(−10, 58) = 2,191`, `cop(15, 30) = 7,0` (geklemd); stooklijn MT bij 2,5 °C = 37,5 °C, LT bij −12 °C = 35,0 °C, HT bij 20 °C = 35,0 °C.

### 5.3 Warmtebuffer

- Nuttige temperatuurslag: `ΔT_buffer = max(T_buf,max − T_ret,design, 0)`.
- Nuttige inhoud: `E_buffer = volumeM3 · 1,163 · ΔT_buffer · f_strat` met `f_strat = 0,90` (menging/stratificatie). Controle: 1 m³ bij MT en `maxSupplyC = 60` → ΔT 23 K → **24,074 kWh**; LT → 30 K → 31,401 kWh; HT → 13 K → 13,607 kWh.
- Stilstandsverlies: `UA_buffer = 1,5 W/K · volumeM3^(2/3)` (≈ 100 mm PUR op een kubus-equivalente mantel), omgeving 15 °C. Gemiddelde vattemperatuur `T_buf,gem = T_ret,design + SoC/E_buffer · ΔT_buffer`; verlies per uur `min(SoC, UA_buffer · (T_buf,gem − 15))` [kWh]. Controle: 10 m³ → 6,96 W/K; 1 m³ → 1,5 W/K.
- Ontlaadvermogen onbegrensd (hydraulisch), laadvermogen begrensd door de restcapaciteit van de WP en door het WP-budget (§5.6).
- Laadstrategie `'predictive'` (default) of `'always'`, zie §5.6 stap 9, horizon 24 uur.

### 5.4 Batterij

- Nuttig: `E_bat = capacityKwh · DoD`, `DoD = 0,90`. Vermogen `P_bat = powerKw` of `capacityKwh / 2` (0,5 C). Rendement per richting `η = sqrt(0,90) = 0,9487`.
- Ontladen alleen om het netvermogen op `P_limiet` te houden; laden gretig in elk uur met ruimte onder `P_limiet` (eerst bufferladen, dan batterij).

### 5.5 Elektrische aansluiting

- Standaardlijst (`data/connections.ts`), `P = 0,230 · I` (1-fase) of `P = 0,400 · √3 · I` (3-fase), cos φ = 1:
  1×25 A 5,75 kW · 1×35 A 8,05 · 1×40 A 9,20 · 3×25 A 17,32 · 3×35 A 24,25 · 3×40 A 27,71 · 3×50 A 34,64 · 3×63 A 43,65 · 3×80 A 55,43 · *grootverbruik: gecontracteerd vermogen [kW]*.
- `P_limiet = P_aansluiting · heatPumpShare`. Overig gebruik `(1 − share) · P_aansluiting` wordt geacht op het piekmoment volledig benut te zijn; overschrijding van het WP-budget is dus overschrijding van de aansluiting.

### 5.6 Dispatch per uur (pass 2) — exact in deze volgorde

Vooraf (**pass 1**): `Q_ideal(t)` = `Q_req` uit een run met onbegrensde warmtelevering (T_i volgt het setpoint; alleen de opwarmbegrenzing `boostFraction` werkt). `Q_ideal` definieert de KPI *piek warmtevraag*, de koude week (§4.4) en de voorspellende laadregel. Verder per uur vooraf: `cap(t)` en `grens(t) = min(cap(t), P_limiet · cop(T_e, T_sup(T_e)))` (zonder limiet: `grens = cap`).

Begintoestand: buffer vol, batterij vol, boiler vol, `T_i = setpointUseC`, `dhwMode = false`. Inregelperiode 168 uur.

Per uur `t`:

1. **Vraag.** `T_ef` bijwerken, `T_set`, `G`, `Q_req` (§5.1).
2. **Tapwater (alleen met boiler).** Tapvraag `tap = dailyKwh · profiel[t mod 24] / Σprofiel` (profiel §5.7) van de boiler-SoC afhalen; tekort tellen als *tapwatertekort*. Hysterese: `dhwMode` aan als SoC < 50 %, uit als vol.
3. **Budget.** `bat_dis_max = min(P_bat, SoC_bat · η)`; `budget = P_limiet + bat_dis_max` (∞ zonder limiet). `P_el = 0`.
4. **Boilerladen** (prioriteit): `Q_tap = min(cap, E_boiler − SoC_boiler, (budget − P_el) · cop_tap)`; `P_el += Q_tap / cop_tap`; `cap_rest = cap − Q_tap`.
5. **Ruimteverwarming direct:** `Q_cv = min(Q_req, cap_rest, (budget − P_el) · cop_cv)`; `P_el += Q_cv / cop_cv`; `cap_rest −= Q_cv`; `tekort = Q_req − Q_cv`.
6. **Buffer ontladen:** `Q_buf,uit = min(tekort, SoC_buf)`.
7. **Modus 'exceedance' (zacht):** als `tekort > 0` en `cap_rest > 0`: `Q_extra = min(tekort, cap_rest)` extra door de WP, óók boven het budget (`P_el += Q_extra / cop_cv`). In modus 'limited' (hard) vervalt deze stap.
8. **Bijstook:** `Q_bij = min(tekort, backupHeaterKw, hard ? max(0, budget − P_el) : backupHeaterKw)`; COP 1.
9. **Buffer laden** met `cap_rest`, alleen als laden is toegestaan en alleen binnen `P_limiet` (niet met batterijstroom): `Q_buf,in = min(cap_rest, E_buffer − SoC_buf, max(0, P_limiet − P_el) · cop_buf)`.
   Laden toegestaan: strategie `'always'` → altijd; `'predictive'` → als (a) er binnen 24 uur een uur `k` is met `Q_ideal(k) > grens(k)`, of (b) `SoC_buf < reserve` met `reserve = min(E_buffer, max_k Q_ideal(k)/cap(k) · E_boiler/2)` over dezelfde horizon (reserve om de ruimteverwarming te overbruggen tijdens boilerbedrijf; 0 zonder boiler).
10. **Bufferverlies** (§5.3).
11. **Batterij:** als `P_el > P_limiet`: ontladen `P_bat,out = min(P_el − P_limiet, bat_dis_max)`, `SoC_bat −= P_bat,out / η`; anders als ruimte en niet vol: laden `P_bat,in = min(P_limiet − P_el, P_bat, (E_bat − SoC_bat) / η)`, `SoC_bat += P_bat,in · η`. `P_net = P_el − P_bat,out + P_bat,in`.
12. **Gebouw:** `Q_del = Q_cv + Q_buf,uit + Q_bij` (incl. `Q_extra`); `T_i` bijwerken (§5.1).
13. **Tellen** (alleen `t ≥ 0`): overschrijding als `P_net > P_limiet + 1e-6` (uren, max kW, kWh); comfortverlies als in gebruik en `T_i < T_set − 0,5`; `min T_i`; energieën (§5.10).

### 5.7 Tapwaterprofiel (fractie per uur, MET, wordt genormaliseerd op som 1)

`[0,005 0,003 0,002 0,002 0,005 0,02 0,07 0,12 0,10 0,05 0,04 0,035 0,035 0,03 0,03 0,03 0,04 0,06 0,09 0,09 0,06 0,04 0,025 0,012]` (uur 0 t/m 23). Boilerinhoud nuttig: `E_boiler = tankLitre/1000 · 1,163 · (tankTempC − 10) · 0,85` → 200 l / 55 °C = **8,897 kWh**. Controle: uur 7 bij 10 kWh/dag = 1,207 kWh.

### 5.8 Twee bedrijfsmodi

- **`'exceedance'` — overschrijding tonen (default).** De begrenzer probeert binnen `P_limiet` te blijven (buffer en batterij eerst); lukt dat niet, dan levert de WP toch (comfort behouden) en wordt de overschrijding geteld in uren, maximale kW en kWh. Dit beantwoordt: *hoe vaak en hoe ver kom ik boven mijn aansluiting?*
- **`'limited'` — aansluiting begrenst.** `P_el ≤ P_limiet + batterij` is hard; tekorten leiden tot dalende binnentemperatuur. Dit beantwoordt: *wat merkt de gebruiker als de aansluiting (of een slimme begrenzer) fysiek begrenst?* KPI's: uren comfortverlies, laagste T_i, kWh tekort.

De KPI-rij toont altijd beide gezichtspunten: de hoofdsimulatie in de gekozen modus én de "tegenhanger" in de andere modus als secundaire regel op de betreffende kaart (twee simulaties, goedkoop).

### 5.9 Dimensionering en afgeleide adviezen

- **WP-vermogen automatisch** (`sizeHeatPump`): kleinste `nominalKw` waarvoor in modus 'limited' **zonder elektrische limiet** (P_limiet = ∞, batterij 0, buffer zoals ingesteld) geldt: `uren comfortverlies ≤ allowedComfortLossH` én geen tapwatertekort. Bisectie op `[0,1 ; 3] · designLoadKw`, 14 iteraties, resultaat = bovengrens. Als 3 × piekvermogen niet volstaat: `NaN` → melding.
- **Kleinste passende aansluiting**: loop over de standaardlijst oplopend (zelfde `heatPumpShare`), eerste met `uren overschrijding ≤ allowedExceedanceH` in modus 'exceedance' met de huidige WP, buffer en batterij; anders *grootverbruik* met het benodigde vermogen `ceil(P_net,max / share / 5) · 5` kW.
- **Benodigde batterij voor 0 overschrijdingsuren** bij de huidige aansluiting, WP en buffer: bisectie op `capacityKwh ∈ [0, E_max·4]` (P = 0,5 C), 12 iteraties; "niet haalbaar" als het maximum niet volstaat.
- **Gevoeligheidsraster** (tab *Gevoeligheid*): voor `V` op 13 punten `0, V_max·{0,05 0,1 0,15 0,2 0,3 0,4 0,5 0,6 0,7 0,8 0,9 1,0}` en batterij op `{0, E_max·{0,25 0,5 1,0}}`: per `V` eerst `P_th,min(V)` (sizing), dan per batterij `P_net,max`, uren overschrijding en kleinste aansluiting. Alles in de Web Worker, met tussenresultaten per `V` naar de UI (progressief tekenen).

### 5.10 KPI-definities

| KPI | Definitie |
|---|---|
| Piek warmtevraag gebouw [kW] | `max Q_ideal` (incl. opwarmen; excl. tapwater) |
| Jaarwarmtevraag [MWh] | `Σ Q_ideal` + `Σ tapvraag` |
| Benodigd WP-vermogen zonder maatregelen [kW th, A7/W35] | `sizeHeatPump` met buffer 0 |
| Benodigd WP-vermogen met buffer [kW th] | `sizeHeatPump` met ingestelde buffer |
| Piek elektrisch WP [kW] | `max P_el` |
| Piek aan de meter (WP-groep) [kW] | `max P_net` |
| WP-budget [kW] | `P_limiet` |
| Uren overschrijding / max / kWh | §5.6 stap 13 |
| Kleinste passende aansluiting | §5.9 |
| Benodigde batterij voor 0 uur | §5.9 |
| Uren comfortverlies, laagste T_i, kWh tekort | modus 'limited' |
| Uren tapwatertekort | §5.6 stap 2 |
| Elektriciteit WP [kWh/jaar], bijstook [kWh] | `Σ P_el` (excl./incl. bijstook) |
| SCOP | `(Σ Q_del + Σ Q_tap) / Σ (P_el incl. bijstook)` — nuttige levering aan gebouw en boiler gedeeld door alle WP-elektriciteit (incl. bufferladen en bijstook; bufferverliezen drukken dus op de SCOP). Batterijverliezen zitten in `E_net`, niet in de SCOP: apart tonen. |
| Bufferverlies [kWh/jaar], laadcycli buffer | `Σ verlies`; `Σ Q_buf,uit / E_buffer` |
| Batterijverlies [kWh/jaar], laadcycli batterij | `Σ P_bat,in − Σ P_bat,out`; `Σ P_bat,out / E_bat` |
| Nuttige bufferinhoud [kWh] en ΔT | §5.3 |

### 5.11 Vertaaltabel Python-referentie → TypeScript

| Python | TypeScript | Python | TypeScript |
|---|---|---|---|
| `Gebouw` | `Building` | `Q_req` | `qRequested` |
| `Warmtepomp` | `HeatPump` | `Q_ideaal` | `qIdeal` |
| `Buffer` | `ThermalBuffer` | `cap` | `capacityKw` |
| `Batterij` | `Battery` | `Q_cv`, `Q_tap`, `Q_buf_in`, `Q_buf_uit` | `qSpaceHeating`, `qDhw`, `qBufferCharge`, `qBufferDischarge` |
| `Elektra` | `GridConnection` | `tekort` | `shortfall` |
| `Klimaatjaar` | `ClimateYear` | `soc_buf`, `soc_bat`, `soc_boiler` | `socBuffer`, `socBattery`, `socTank` |
| `ideale_vraag` | `computeIdealDemand` | `P_el`, `P_bat`, `P_net` | `pElectric`, `pBattery`, `pGrid` |
| `simuleer` | `simulate` | `grens` | `soloLimitKw` |
| `dimensioneer_wp` | `sizeHeatPump` | `uren_overschrijding` | `exceedanceHours` |
| `kleinste_aansluiting` | `smallestConnection` | `uren_comfort` | `comfortLossHours` |
| `koudste_week` | `coldestWeekStart` | `hard` | `mode === 'limited'` |
| `stooklijn` | `supplyTemperature` | `voorspellend`/`altijd` | `'predictive'`/`'always'` |

---

## 6. Uitvoer: KPI-kaarten, advies, robuustheid, meldingen

### 6.1 KPI-kaarten (rij van 8, met secundaire regel in kleiner lettertype)

1. **Piek warmtevraag** — `max Q_ideal` kW; secundair: ontwerpverlies (invoer) en jaarwarmtevraag.
2. **Benodigd WP-vermogen** — met huidige buffer (kW th A7/W35); secundair: zonder buffer (doorgestreept als lager) en bij −10 °C geleverd vermogen (`× capFactor(−10)`).
3. **Piek aan de meter** — `max P_net` kW; secundair: WP-budget `P_limiet` en piek zonder batterij. Kleur: groen ≤ budget, oranje ≤ 110 %, rood daarboven.
4. **Uren overschrijding** — uren/jaar; secundair: max overschrijding kW en kWh/jaar. Kleur: groen 0, oranje ≤ toegestaan, rood daarboven.
5. **Kleinste passende aansluiting** — label; secundair: huidige aansluiting en "zonder maatregelen: …".
6. **Comfort bij begrenzen** — uren comfortverlies (modus 'limited'); secundair: laagste T_i en tapwatertekort-uren.
7. **Buffer** — nuttige kWh en ΔT; secundair: laadcycli/jaar en verlies kWh/jaar.
8. **Energie** — SCOP; secundair: kWh elektriciteit per jaar en batterijverlies.

### 6.2 Advies-banner (één alinea, automatisch gegenereerd)

Sjabloon: *"Met **{V} m³ buffer** en **{E} kWh batterij** heeft de warmtepomp **{P_th,min} kW** (A7/W35) nodig en blijft de WP-groep **{uren}** uur per jaar boven het budget van **{P_limiet} kW** ({aansluiting}, {share} %). Kleinste passende aansluiting: **{kleinste}**. Zonder maatregelen: {P_th,min,0} kW warmtepomp, {uren_0} uur overschrijding, {kleinste_0}."* Bij 0 uur: *"…en blijft de WP-groep het hele jaar binnen het budget…"*.

### 6.3 Robuustheidstabel (onder de KPI's, inklapbaar)

Dezelfde configuratie doorgerekend voor *energie*, *T5*, *T1*, *winter1979* en *winter1963* (vijf simulaties; WP-vermogen vast op de huidige waarde): kolommen piek warmtevraag, piek aan de meter, uren overschrijding, uren comfortverlies, SCOP, kWh/jaar. Markeer het geselecteerde jaar.

### 6.4 Meldingen (met knop *Waarom?* die een uitlegregel uitklapt)

Genereer in `model/messages.ts` (puur) op basis van de resultaten; toon maximaal 4, gesorteerd op ernst (rood/oranje/blauw):

- **Buffer helpt niet verder** (blauw): als `P_th,min(V) − P_th,min(2V) < 2 %` of `V ≥ 0,5·V_max` zonder effect. *Waarom:* "Een buffer overbrugt uren, geen dagen: de koudste periode in {jaar} duurt {n} dagen met gemiddeld {T} °C; de warmtepomp moet het gemiddelde van die dagen zelf kunnen leveren."
- **Koudegolf bepaalt de maat** (blauw): als de bepalende uren van de sizing in de koude week liggen (comfortverlies ontstaat daar bij 0,99·P_th,min).
- **Batterij raakt leeg** (oranje): als op ≥ 1 uur `SoC_bat = 0` terwijl `P_net > P_limiet`. *Waarom:* overschrijding duurt langer dan de batterij kan leveren → meer kWh nodig, of buffer vergroten.
- **Batterijvermogen begrenst** (oranje): als `P_bat` het limiterende is (`P_el − P_limiet > P_bat` op ≥ 1 uur met SoC > 0).
- **Tapwater veroorzaakt de piek** (blauw): als het uur van `max P_el` een boilerlaad-uur is. *Waarom:* boilerladen op 55 °C kost COP; grotere boiler of buffer-reserve verlaagt de piek.
- **Opstookpiek kantoor** (blauw): als `max Q_ideal` in een opstookuur valt; toon de bijdrage `boostFraction · designLoadKw`.
- **Kleine ΔT buffer** (oranje): als `ΔT_buffer < 15 K` → "Met HT-afgifte en {maxSupplyC} °C maximale aanvoer slaat 1 m³ maar {kWh} kWh op; overweeg LT-afgifte of een warmtepomp met hogere aanvoertemperatuur."
- **Bijstook bepaalt de aansluiting** (rood): als `backupHeaterKw > 0` en de piek aan de meter in een bijstook-uur valt.
- **Comfortverlies bij begrenzen** (rood/oranje): als modus 'limited' > toegestaan.
- **WP niet te dimensioneren** (rood): sizing geeft NaN.

---

## 7. Grafieken (uPlot)

Gebruik dezelfde uPlot-wrapper, kleuren en lettertypen als het klimaatplafond-concept; voeg in `src/core/` alleen generieke helpers toe (bijv. `linkedCursor`, `bandPlugin`). Alle grafieken: Nederlandse aslabels met eenheid, legenda klikbaar (reeks aan/uit), hover-tooltip met alle waarden van dat uur, exportknop *PNG*.

### 7.1 Tab *Koude week* — drie gekoppelde panelen (zelfde x-as, cursor gesynchroniseerd)

Venster: koude week ± 24 h (§4.4); x-as in dag + uur ("do 16 jan 14:00"); weekend licht gearceerd; opstook-/gebruiksuren van het kantoor als band.

1. **Warmte [kW]**: `Q_req` (gevraagd, grijs gestippeld), `Q_cv` (WP direct, blauw gevuld), `Q_buf,uit` (buffer, oranje gestapeld op WP), `Q_bij` (rood gestapeld), `Q_buf,in` (bufferladen, oranje negatief/arcering), `Q_tap` (boiler, paars gestapeld); rechter y-as `T_e` en `T_ef` (dunne lijnen).
2. **Elektrisch [kW]**: `P_el` (WP, blauw), `P_net` (aan de meter, zwart), batterij laden/ontladen (groen, negatief = laden), horizontale lijn `P_limiet` (rood gestippeld), overschrijding rood gearceerd tussen `P_net` en `P_limiet`.
3. **Toestand**: `SoC_buf` en `SoC_bat` als % (linker as), `T_i` en `T_set` in °C (rechter as), comfortverliesuren als rode markering.

Onder de panelen een **scrubber** (range-input over het venster) die het conceptschema (§8) en een regel met getallen van dat uur stuurt; knop *Speel af* (1 uur per 0,15 s), *Terug naar koude week*.

### 7.2 Tab *Jaar*

- **Jaarbelastingduurkromme elektrisch**: gesorteerd `P_net` (met maatregelen, zwart) en `P_el` zonder batterij (blauw) en de referentie "zonder buffer" (WP op `P_th,min(0)`, grijs); horizontale lijnen voor `P_limiet` van de huidige en de twee naastgelegen aansluitwaarden met label; het aantal uren boven elke lijn als getal in de legenda.
- **Jaarbelastingduurkromme thermisch**: gesorteerd `Q_ideal` met horizontale lijn `cap(−10)` van de gedimensioneerde WP met en zonder buffer.
- **Maandbalans** (staaf): warmtelevering WP direct / buffer / bijstook en elektriciteit per maand; SCOP per maand als lijn.

### 7.3 Tab *Gevoeligheid* — de kerngrafiek

- x-as: buffervolume [m³] (0 … V_max, secundaire as in "uren piekvermogen").
- Linker y-as [kW el]: **piek aan de meter** per batterijgrootte (4 lijnen: 0, 0,25·E_max, 0,5·E_max, E_max), met horizontale referentielijnen voor de `P_limiet` van alle standaardaansluitingen in het relevante bereik (label rechts: "1×35 A · 40 % = 3,2 kW"). Waar een lijn onder een referentielijn duikt, is die aansluiting toereikend (0 uur, of ≤ toegestaan): markeer het snijpunt met een stip en label "{aansluiting} vanaf {V} m³".
- Rechter y-as [kW th]: **benodigd WP-vermogen** `P_th,min(V)` (dikke oranje lijn), met de referentie `designLoadKw` gestippeld.
- Verticale markering van het huidige buffervolume; klik op de grafiek zet het buffervolume.
- Onder de grafiek een kleine tabel met dezelfde punten (uren overschrijding per combinatie), inklapbaar.
- Resultaten komen progressief uit de Worker; toon een voortgangsbalk.

### 7.4 Interactie en prestaties

- Herberekenen debounced (250 ms) in een **Web Worker** (`model/worker.ts`); de hoofdsimulatie + tegenhanger + sizing + robuustheid (≈ 20 simulaties) binnen 300 ms; het gevoeligheidsraster (≈ 13 × (14 + 4 + ≤ 9) ≈ 350 simulaties) alleen als het tabblad open is, met cache op invoer-hash.
- Hourly loop met `Float64Array`; geen allocaties in de binnenlus; voorspellende regel met een 24-uurs vooruitblik (O(8760·24) is acceptabel).

---

## 8. Conceptvisualisatie (tab *Concept*, SVG)

Een schematische weergave van het concept die **live** de toestand toont van het uur dat met de scrubber (§7.1) is gekozen (default: het uur van `max P_net` in de koude week). Geen merknamen, geen productafbeeldingen; stijl gelijk aan de klimaatplafond-plattegrond (SVG + lichte canvas-animatie voor deeltjes).

Componenten en wat ze tonen:

- **Buitenunit lucht/water-WP** (ventilatorsymbool, draait sneller bij hoger vermogen): `Q_wp` kW th, `P_el` kW el, COP, `T_e` °C, aanvoertemperatuur; kleur blauw→rood met de aanvoertemperatuur.
- **Buffervat** (cilinder, vulniveau = SoC met kleurgradiënt warm boven/koud onder): `SoC` %, kWh, `T_buf,max`; pijlen in (laden) / uit (ontladen) met vermogen.
- **Boiler** (woning): vulniveau, "boilerbedrijf" indicator.
- **Gebouw** (woning: huisje; kantoor: kantoorblok met verdiepingen): `T_i` en `T_set`, `Q_req`, winsten; rood randje bij comfortverlies.
- **Meterkast** (balk = aansluitvermogen): segmenten *overig gebruik* (grijs, `(1−share)·P`), *WP* (blauw, `P_el`), *batterij* (groen bij ontladen, trekt het blauwe segment onder de budgetlijn; oranje bij laden), budgetlijn, en een rood "overflow"-segment als `P_net > P_limiet` met de overschrijding in kW en de tekst "overschrijding".
- **Batterij** (blok met vulniveau): SoC %, laden/ontladen kW.
- **Stromen**: waterleidingen (rood aanvoer, blauw retour) en kabels (zwart) met bewegende deeltjes; snelheid evenredig met vermogen; richting wisselt bij laden/ontladen.
- Onder het schema de uurregel: datum/uur, T_e, Q_req, Q_wp, buffer in/uit, P_el, batterij, P_net, overschrijding.

---

## 9. Referentiewaarden en tests

Alle tests in `tests/peakshaving/`. Data voor de integratietests: `tools/peakshaving_ref/referentiewaarden.json` (kopieer naar `tests/peakshaving/fixtures/`). Toleranties: vermogens/energieën ± 2 % (relatief) of ± 0,02 kW absoluut (wat groter is); uren ± 2; temperaturen ± 0,05 K; `P_th,min` ± 1 %.

### 9.1 Componenten (`components.test.ts`, exact tot 3 decimalen)

Alle controlewaarden uit §5.2, §5.3, §5.5, §5.7. Verder: `UA` woning 8 kW = 0,2667 kW/K, `C` = 10,667 kWh/K; kantoor 100 kW: `UA` = 3,2258, `C` = 64,516, winsten in gebruik = 29,032 kW. Batterij 10 kWh: `P` = 5, `E_bat` = 9,0, `η` = 0,9487.

### 9.2 Klimaatdata (`climate.test.ts`)

- Vijf referentiejaren, elk 8760 waarden, geen NaN, `startWeekdag = 1`.
- Maandgemiddelde T van `energie`, `T5` en `T1` wijkt < 0,06 K af van `maandgemiddelde_T_NEN5060_2018`; bij `winter1979`/`winter1963` is dat veld `null`; hun maanden apr–okt komen uit dezelfde bronmaanden als T1 (`bronjaar_per_maand[3..9]` identiek).
- Statistiek klopt met §4.2 (T min, uren < 0, koudste week; `winter1979` koudste week −10,2 °C vanaf uur 8736).
- `coldestWeekStart` is cyclisch: voor `winter1979` met de woning-defaults geeft het 8736 (de week 31 dec – 6 jan), niet 0.
- Werkelijke jaren: 75 jaren (1951–2025), elk 8760 waarden; `startWeekdag[2012] = 7`, `startWeekdag[1997] = 3`, `startWeekdag[1963] = 2`, `startWeekdag[1979] = 1`; `aanbevolen_stresstest` bevat 1963 en 1979.

### 9.3 Gebouwschema (`schedule.test.ts`)

Kantoor defaults, T5: weekdag van uur 0 = 1 (ma); in gebruik bij uur 7 = ja, uur 6 = nee, zaterdag 10:00 (uur 130) = nee; setpoint bij uur 2 = 19, uur 3 = 21 (opstook), uur 7 = 21, uur 18 = 19. Woning: tapvraag uur 7 = 1,207 kWh, dagsom = 10,0.

### 9.4 Ideale vraag en koude week (`ideal.test.ts`)

T5: woning 8 kW → `max Q_ideal` = 7,524 kW, `Σ Q_ideal` = 13 580 kWh, koude week start 314. Kantoor 100 kW → 133,921 kW, 210 504 kWh, start 314.

### 9.5 Integratie — referentiecases (`simulate.test.ts`)

Alle cases met defaults van §3 tenzij vermeld. Woning: 1×35 A, aandeel 40 % (P_limiet 3,22 kW), MT, maxSupply 60. Kantoor: 3×80 A, aandeel 50 % (27,71 kW), MT, maxSupply 60. Batterij P = 0,5 C.

| Case | Jaar | Modus | Q_vraag,max | P_el,WP,max | P_net,max | uren overschr. | max overschr. | uren comfort | min T_i | E_el,WP [kWh] | SCOP | E_buf,uit | E_buf,verlies | P_th,min |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| W1 woning 8 kW, WP 8 kW, geen buffer/batterij | T5 | zacht | 7,52 | 2,75 | 2,75 | 0 | 0,00 | 78 | 17,51 | 4966 | 3,46 | 0 | 0 | 10,56 |
| W2 idem, buffer 1 m³ | T5 | zacht | 7,52 | 2,75 | 2,75 | 0 | 0,00 | 15 | 18,32 | 5116 | 3,37 | 500,8 | 227,4 | 8,72 |
| W3 idem, buffer 1 m³ + batterij 10 kWh | T5 | zacht | 7,52 | 2,75 | 2,75 | 0 | 0,00 | 15 | 18,32 | 5116 | 3,37 | 500,8 | 227,4 | — |
| W4 WP 6 kW, buffer 1 m³ + batterij 10 kWh | T5 | hard | 7,52 | 2,12 | 2,12 | 0 | 0,00 | 520 | 13,66 | 5001 | 3,38 | 685,8 | 207,8 | — |
| W5 WP 8 kW, buffer 1 m³, strategie 'altijd' | T5 | zacht | 7,52 | 2,75 | 2,75 | 0 | 0,00 | 6 | 19,14 | 5225 | 3,30 | 513,6 | 561,5 | — |
| W6 WP 8 kW, buffer 2 m³ | T5 | zacht | 7,52 | 2,75 | 2,75 | 0 | 0,00 | 15 | 18,25 | 5152 | 3,34 | 500,0 | 331,9 | 8,74 |
| W7 WP 8 kW, geen buffer | T1 | zacht | 8,15 | 2,74 | 2,74 | 0 | 0,00 | 253 | 13,88 | 5274 | 3,39 | 0 | 0 | 12,93 |
| W8 WP 8 kW, geen buffer | energie | zacht | 6,23 | 2,73 | 2,73 | 0 | 0,00 | 2 | 19,47 | 4188 | 3,79 | 0 | 0 | 8,14 |
| W9 WP 8 kW, geen buffer | winter1979 | zacht | 8,28 | 2,75 | 2,75 | 0 | 0,00 | 228 | 13,25 | 5319 | 3,40 | 0 | 0 | 12,18 |
| W10 WP 8 kW, buffer 1 m³ | winter1979 | zacht | 8,28 | 2,75 | 2,75 | 0 | 0,00 | 189 | 13,38 | 5477 | 3,31 | — | — | 10,57 |
| W11 WP 8 kW, geen buffer | winter1963 | zacht | 8,17 | 2,75 | 2,75 | 0 | 0,00 | 595 | 14,38 | 6082 | 3,26 | 0 | 0 | 12,92 |
| K1 kantoor 100 kW, WP 100 kW, geen buffer/batterij | T5 | zacht | 133,92 | 28,80 | 28,80 | 132 | 1,09 | 121 | 14,79 | 56 388 | 3,71 | 0 | 0 | 172,40 |
| K2 idem, buffer 10 m³ | T5 | zacht | 133,92 | 28,48 | 28,48 | 2 | 0,77 | 8 | 17,48 | 57 967 | 3,63 | 5898 | 1280 | 125,81 |
| K3 WP 70 kW, buffer 10 m³ + batterij 50 kWh | T5 | zacht | 133,92 | 25,64 | 25,64 | 0 | 0,00 | 271 | 10,30 | 55 800 | 3,65 | 10 912 | 1378 | — |
| K4 als K3, modus 'limited' | T5 | hard | 133,92 | 25,64 | 25,64 | 0 | 0,00 | 271 | 10,30 | 55 800 | 3,65 | 10 912 | 1378 | — |
| K5 WP 100 kW, geen buffer | T1 | zacht | 144,74 | 28,80 | 28,80 | 183 | 1,09 | 155 | 12,28 | 60 137 | 3,61 | 0 | 0 | 205,75 |
| K6 WP 100 kW, geen buffer | winter1979 | zacht | 145,13 | 28,80 | 28,80 | 190 | 1,09 | 140 | 11,10 | 60 812 | 3,61 | 0 | 0 | 209,39 |
| K7 WP 100 kW, buffer 20 m³ | winter1963 | zacht | 138,60 | 28,80 | 28,80 | 42 | 1,09 | 88 | 13,43 | 73 239 | 3,33 | — | — | 117,37 |

(W1–W3: de piek aan de meter is in deze cases laag omdat de WP van 8 kW thermisch te klein is — dat is precies wat de comfortverliesuren laten zien; de sizing-kolom geeft de werkelijk benodigde machine. Vergelijk de laatste kolom per klimaatjaar: woning zonder buffer 8,1 (energie) → 10,6 (T5) → 12,9 (T1) → 12,2 (1979) → 12,9 kW (1963); met 1 m³ buffer 8,7 (T5) → 10,6 kW (1979). Kantoor met 20 m³ buffer: 96 kW in T5 tegen 117 kW in 1963 — het plateau ligt in een aanhoudend strenge winter hoger. De cellen "—" zijn in de fixture wel aanwezig en moeten ook getest worden.)

### 9.6 Gevoeligheid (`sweep.test.ts`) — woning 8 kW, T5, WP = `P_th,min(V)`

| V [m³] | P_th,min | P_net,max | uren overschr. (bat 0) | kleinste aansluiting bat 0 / 5 kWh / 10 kWh |
|---|---|---|---|---|
| 0 | 10,56 | 3,48 | 101 | 1×40 A / 1×35 A / 1×35 A |
| 0,25 | 10,01 | 3,23 | 1 | 1×40 A / 1×35 A / 1×25 A |
| 0,5 | 9,42 | 3,18 | 0 | 1×35 A / 1×35 A / 1×25 A |
| 1,0 | 8,72 | 2,95 | 0 | 1×35 A / 1×25 A / 1×25 A |
| 2,0 | 8,74 | 2,96 | 0 | 1×35 A / 1×25 A / 1×25 A |
| 3,0 | 8,73 | 2,96 | 0 | 1×35 A / 1×25 A / 1×25 A |

Kantoor 100 kW, T5, 3×80 A / 50 %:

| V [m³] | P_th,min | P_net,max (bat 0) | uren overschr. bat 0 / 50 / 100 / 200 kWh |
|---|---|---|---|
| 0 | 172,40 | 46,36 | 327 / 38 / 7 / 0 |
| 5 | 142,33 | 38,82 | 46 / 8 / 4 / 0 |
| 10 | 125,81 | 33,85 | 9 / 5 / 0 / 0 |
| 20 | 96,38 | 27,71 | 0 / 0 / 0 / 0 |
| 40 | 82,89 | 27,71 | 0 / 0 / 0 / 0 |

### 9.7 Invarianten (`invariants.test.ts`, op alle cases)

- Geen `NaN`/`Infinity` in reeksen en KPI's.
- Energiebalans gebouw: `Σ(Q_del + G) − Σ UA·(T_i − T_ef) = C·(T_i,eind − T_i,begin)` binnen 1e-6 relatief (begin/eind van de 8760 getelde uren).
- Energiebalans buffer: `Σ Q_buf,in − Σ Q_buf,uit − Σ verlies = SoC_eind − SoC_begin`.
- Energiebalans batterij: `Σ P_bat,in·η − Σ P_bat,out/η = SoC_eind − SoC_begin`.
- In modus 'limited' geldt in elk uur `P_net ≤ P_limiet + 1e-6` (geen enkele overschrijding).
- Monotonie: `P_th,min(V)` niet-stijgend in `V` binnen +1 % ruis; uren overschrijding niet-stijgend in batterijcapaciteit (strikt).
- Prestaties: één simulatie (8760 h) < 20 ms in Vitest (Node), sizing < 300 ms.

### 9.8 UI-smoketest (`ui.test.tsx`, met @testing-library/react — toevoegen als devDependency als die ontbreekt)

Pagina rendert met defaults; het wijzigen van het piekvermogen schaalt de schuifbereiken; de deelbare link reproduceert de state.

---

## 10. Bestanden en structuur

```
src/concepts/peakshaving/
  data/
    referentiejaren.json          (meegeleverd)
    knmi-debilt-1951-2025.json    (meegeleverd; lazy import)
    connections.ts                 standaardaansluitingen §5.5
    heatPumpCurves.ts              capaciteitsfactor, ontdooifactor, stooklijnpresets §5.2
    dhwProfile.ts                  tapwaterprofiel §5.7
    defaults.ts                    defaults woning/kantoor §3
  model/
    types.ts                       Building, HeatPump, ThermalBuffer, Battery, GridConnection, ClimateYear, SimulationResult, Kpis
    climate.ts                     laden/decoderen van de jaren, statistiek, coldestWeekStart
    building.ts                    UA, C, schedule, setpoint, gains, dhw demand
    heatPump.ts                    capFactor, defrost, cop, supplyTemperature
    buffer.ts                      bufferEnergy, bufferDeltaT, bufferUA
    battery.ts                     usable energy, power, efficiency
    grid.ts                        connection power, limit
    idealDemand.ts                 pass 1
    simulate.ts                    pass 2 (§5.6), beide modi
    sizing.ts                      sizeHeatPump, smallestConnection, requiredBattery, sensitivityGrid
    kpis.ts                        KPI-berekening uit reeksen
    messages.ts                    meldingen §6.4 (puur)
    worker.ts                      Web Worker-entry (Comlink is niet nodig; postMessage met request-id)
  ui/
    PeakshavingPage.tsx            layout, tabs, kop
    inputs/BuildingPanel.tsx, GridPanel.tsx, HeatPumpPanel.tsx, MeasuresPanel.tsx
    results/KpiCards.tsx, AdviceBanner.tsx, RobustnessTable.tsx, Messages.tsx
    charts/ColdWeekCharts.tsx, YearCharts.tsx, SensitivityChart.tsx, Scrubber.tsx
    concept/ConceptDiagram.tsx     §8
    explain/ExplainTab.tsx         §11 (KaTeX)
  scenarios.ts  texts.ts  share.ts  store.ts
tests/peakshaving/
  components.test.ts climate.test.ts schedule.test.ts ideal.test.ts simulate.test.ts sweep.test.ts invariants.test.ts ui.test.tsx
  fixtures/referentiewaarden.json
tools/peakshaving_ref/             (meegeleverd) peakshaving_ref.py run_cases.py inspect_week.py referentiewaarden.json README.md
scripts/klimaat/                   (meegeleverd) download_knmi.sh parse_knmi.py match_months.py tmy_iso15927.py winter_stats.py build_reference_years.py
docs/SPEC-peakshaving.md  docs/klimaat/README.md  docs/klimaat/*.csv  docs/AANNAMES.md (sectie toevoegen)
```

- `store.ts` (zustand): invoerstate + afgeleide bereiken + resultaten uit de Worker + UI-state (tab, scrubberuur, geselecteerd klimaatjaar). Acties: `setDesignLoad` schaalt buffer/batterij mee (§3.5), `applyScenario`, `fromShareHash`, `toShareHash`.
- `scenarios.ts`: acht scenario's met titel en één zin toelichting:
  1. *Woning jaren '70 na isolatie — 8 kW, 1×35 A, zonder maatregelen*
  2. *… met 0,5 m³ buffer* (past binnen 1×35 A)
  3. *… met 1 m³ buffer en 5 kWh batterij* (kan naar 1×25 A)
  4. *Nieuwbouwwoning all-electric — 4 kW LT, 1×25 A, tapwater 12 kWh/dag*
  5. *Kantoor 100 kW, 3×80 A — zonder maatregelen*
  6. *Kantoor 100 kW — 20 m³ buffer* (past binnen 3×80 A bij 50 %)
  7. *Kantoor 100 kW — 10 m³ buffer en 100 kWh batterij*
  8. *Kantoor 100 kW — stresstest strenge winter 1978/79 met 20 m³ buffer*
- `texts.ts`: alle UI-teksten, tooltips, meldingteksten (Nederlands) op één plek.

---

## 11. Uitleg-tab (tekst, Nederlands; formules met KaTeX)

Secties met korte alinea's en één formule per sectie:

1. **Wat de tool berekent** — uursimulatie van warmtevraag, warmtepomp, buffer en batterij over een referentiejaar; wat "overschrijding" en "comfortverlies" betekenen.
2. **Warmtevraag van het gebouw** — \(Q = UA\,(T_i - T_{e,f}) - G\), ontwerpverlies bij −10 °C, interne winsten via de stookgrens, opwarmen begrensd met de opwarmfactor, gebouwmassa als tijdconstante \(C = \tau \cdot UA\).
3. **Lucht/water-warmtepomp** — capaciteit daalt bij kou (tabel), COP via Carnot \( COP = \eta \frac{T_{aanvoer}}{T_{aanvoer}-T_e} \), ontdooien, stooklijn.
4. **Warmtebuffer** — \(E = V \cdot 1{,}163 \cdot \Delta T \cdot f_{strat}\); waarom ΔT afhangt van afgiftetemperatuur en maximale WP-aanvoer; stilstandsverlies; laadstrategie; "uren, geen dagen".
5. **Batterij** — nuttig deel, rendement, 0,5 C; laden onder de budgetlijn, ontladen erboven.
6. **Aansluiting en budget** — standaardaansluitwaarden, \(P = \sqrt{3}\,U\,I\), aandeel voor de WP, waarom overig gebruik volledig wordt meegerekend.
7. **Dimensioneren** — bisectie op comfortcriterium; kleinste aansluiting; de gevoeligheidsgrafiek lezen.
8. **Klimaatjaren** — NEN 5060:2018 (1996–2015), T1/T5/energie en wat hun winters wél en niet zijn, de reconstructie uit KNMI-data en haar beperkingen, de stresstestjaren 1978/79 en 1962/63 (met de empirische herhalingstijd en de kanttekening klimaatverandering), werkelijke jaren 1951–2025.
9. **Beperkingen** — samenvatting van §12.

---

## 12. Aannames (toevoegen aan `docs/AANNAMES.md`, sectie "Concept 2: peakshaving")

1. Gebouw als één thermische knoop (1R1C) met tijdconstante τ; gevelmassa benaderd met een 1e-orde filter op de buitentemperatuur (default 2 h). Geen aparte zones, geen zonnewinsten (conservatief), interne winsten constant via de stookgrens.
2. Opwarmen begrensd op `boostFraction · designLoadKw` (NEN-EN 12831 opwarmtoeslag-orde); geen optimum-start-regeling (vaste opstooktijd).
3. Warmtepompcapaciteit alleen afhankelijk van de buitentemperatuur (niet van de aanvoertemperatuur); COP via Carnot met vast rendement en ontdooifactor; geen cycling, geen minimale modulatie, geen deellastbonus.
4. Buffer als ideale energie-opslag met vaste nuttige ΔT (laadtemperatuur − ontwerpretour) en stratificatiefactor 0,9; stilstandsverlies met UA ∝ V^(2/3); ontladen hydraulisch onbegrensd.
5. Batterij exclusief voor de WP-groep; gretig laden onder de budgetlijn; geen degradatie, geen stilstandsverlies, geen tariefsturing.
6. Tapwater via boiler met hysterese 50 %/100 %, boiler op 55 °C, 85 % nuttig; vast dagprofiel; geen legionellaprogramma.
7. Aansluitingen met cos φ = 1; overig gebruik op het piekmoment volledig benut; geen gelijktijdigheidsfactor.
8. Klimaat: reconstructie van NEN 5060:2018-referentiejaren uit KNMI De Bilt-uurdata (maandkeuze op basis van gepubliceerde maandgemiddelden; cross-fade van 16 uur aan maandgrenzen); stresstestjaren = T1 met het werkelijke stookseizoen nov–mrt van 1978/79 resp. 1962/63; jaar begint op maandag; tijd in MET zonder zomertijd; schrikkeldag weggelaten; geen correctie voor locatie of klimaatverandering (herhalingstijden empirisch uit 1951–2025).
9. Perfecte voorspelling bij de laadstrategie 'voorspellend' (de simulatie kent het weer van de komende 24 uur).
10. Rekenresultaten zijn indicatief voor conceptkeuze; productselectie altijd met fabrikantdata (capaciteitstabellen, geluid, hydrauliek).

---

## 13. Definitie van "klaar"

- `npm test`, `npm run lint`, `npm run build` groen; alle tests van §9 aanwezig en groen.
- Homepage toont het concept als actief; route `#/peakshaving` werkt lokaal (`npm run dev`) en na de PR-merge op `https://thomas3a.github.io/installatie-concepten/#/peakshaving`.
- Alle acht scenario's laden en geven de verwachte orde van grootte (vergelijk met §9.6).
- Koude week zoomt automatisch; scrubber stuurt het conceptschema; gevoeligheidsgrafiek toont de aansluitlijnen en snijpunten.
- README bijgewerkt (sectie "Concept 2"), `docs/AANNAMES.md` aangevuld, `docs/klimaat/README.md` aanwezig met bronvermelding KNMI en de reconstructie-uitleg.
- Geen merknamen; UI volledig Nederlands; footer-disclaimer met klimaatzin.

## 14. Buiten scope (mogelijk later)

Lokale NEN 5060-import (§4.5); PV-opwek en teruglevering; dynamische tarieven en kosten; koeling in de zomer; 15-minutenresolutie en gelijktijdigheid met EV-laden; meerdere warmtepompen/cascade; grondgebonden bron; klimaatscenario's (KNMI'23) en andere stations.
