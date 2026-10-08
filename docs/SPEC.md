# Installatieconcepten — Concept 1: Klimaatplafond met 6-weg-klep

> **Instructie voor Claude Code.** Lees dit document volledig voordat je begint. Bouw alles in één keer volgens de fasering in §12. Waar iets niet gespecificeerd is, kies je de natuurkundig verantwoorde, eenvoudigste oplossing en noteer je de aanname in `docs/AANNAMES.md`. Stel geen tussentijdse vragen.

---

## 0. Werkafspraken

- **Taal.** UI-teksten, uitleg, README en meldingen zijn Nederlands. Code, identifiers en commitberichten zijn Engels. Commentaar in de code mag Nederlands of Engels zijn, maar wel consequent.
- **Geen merknamen** van fabrikanten in code, data, UI, commentaar, testnamen of commits. De kleppen heten uitsluitend **Type A** en **Type B** (zie §5.7).
- **Pure kern.** De natuurkunde (`src/core/**` en `src/concepts/*/model/**`) is pure TypeScript zonder React of DOM. Alles daarin is unit-testbaar.
- **Eenheden.** Intern rekenen we in SI: m, s, kg, W, Pa, °C/K, m³/s. Alleen de UI rekent om naar l/h, kPa, mm, kW en kWh.
- **Getalnotatie.** De UI gebruikt `Intl.NumberFormat('nl-NL')`: decimale komma, punt als duizendtalscheiding.
- **Projectbestanden.** Sla dit document op als `docs/SPEC.md` in de repo. Maak daarnaast een korte `CLAUDE.md` met de werkafspraken uit deze paragraaf.
- **Disclaimer.** Zet in de footer van elke pagina: *"Indicatief rekenmodel voor uitleg en conceptkeuze. Geen vervanging van de productberekening van de fabrikant."*

---

## 1. Doel en doelgroep

We bouwen een website met interactieve visualisaties van installatieconcepten. Het eerste concept is een **klimaatplafond in een open kantoor**: metalen plafondpanelen met koperen meanderactivering, aangesloten op één tot drie 6-weg-kleppen in een 4-pijpssysteem.

**Doelgroep:** collega's en klanten met verstand van installatietechniek. Vakbegrippen hoeven dus niet versimpeld te worden, maar het *waarom* moet steeds helder zijn.

**Kernvraag die de tool inzichtelijk maakt ("de puzzel"):** hoe hangen de volgende grootheden samen?

- het aantal panelen in serie en het aantal parallelle strengen;
- buisdiameter en leidinglengte;
- debiet, drukval en Reynoldsgetal;
- watertemperatuurverschil en vermogen.

En daarnaast: wat gebeurt er als je strengen ongelijk maakt zonder inregeling na de klep, en wat verandert er als je een zone over meer kleppen verdeelt?

**Uitgangspunt inregeling.** Na de 6-weg-klep zitten géén inregelafsluiters. Het debiet wordt softwarematig per klep begrensd (Vmax per sequentie). Ongelijke verdeling over strengen moet daarom zichtbaar worden, niet weggeregeld.

---

## 2. Scope

**Wel:**

- Een homepage met concepttegels.
- Het concept *Klimaatplafond*, bestaande uit:
  - configuratie;
  - automatisch koppelen van panelen tot strengen;
  - hydraulisch netwerk per klep;
  - twee kleptypen;
  - dynamische ruimtesimulatie met regelaar;
  - plafondplattegrond met meanders en stromingsanimatie;
  - een 6-weg-klep-detail;
  - een puzzel-analyse;
  - grafieken;
  - meldingen met uitleg;
  - uitlegpagina;
  - scenario's;
  - een deelbare URL;
  - een printweergave.

**Niet:**

- andere concepten (alleen als tegels met "binnenkort");
- de luchtzijde of ventilatie als aparte installatie;
- dagprofielen of zonnebaan;
- glycol;
- kosten;
- warmteverlies van leidingen;
- 3D;
- een backend of accounts.

---

## 3. Techniek en projectstructuur

**Stack:**

- Vite, React 18+ en TypeScript (`strict`).
- Zustand voor state.
- uPlot voor tijdreeksen en xy-grafieken.
- KaTeX voor formules op de uitlegpagina.
- Vitest voor tests, ESLint en Prettier voor codekwaliteit.
- Styling met CSS Modules en CSS custom properties. Licht en donker thema via `prefers-color-scheme`.
- `HashRouter`, omdat de site op GitHub Pages draait en daar geen server-rewrites zijn.
- Deploy via een GitHub Actions-workflow naar GitHub Pages. Vite `base` = `/<reponaam>/`, gezet via een omgevingsvariabele.

**Mapstructuur (richtlijn):**

```
src/
  app/                    # router, layout, homepage met concepttegels
  core/                   # concept-onafhankelijk, puur TS
    water.ts              # stofwaarden water
    psychro.ts            # dauwpunt
    hydraulics/
      friction.ts         # Churchill, Darcy-Weisbach
      heatTransfer.ts     # Nusselt laminair/Gnielinski
      network.ts          # solver voor parallelle strengen met verdeelleiding
    control/pi.ts
    format.ts             # nl-NL formattering, eenheden
  concepts/
    index.ts              # registry: {id, titel, beschrijving, status, route, component}
    klimaatplafond/
      data/               # klepdata, buizen, verdeelleidingen, defaults, grenswaarden
      model/
        panel.ts          # meandergeometrie
        ceiling.ts        # karakteristiek, weerstanden, oppervlaktetemperatuur
        strand.ts         # thermiek + drukval van één streng
        zoneHydraulics.ts # verdeelleiding + strengen (netwerk)
        valves.ts         # Type A / Type B
        design.ts         # ontwerpdebieten, automatisch koppelen, klepadvies
        room.ts           # ruimtemodel + last
        controller.ts     # PI, modi, dauwpuntbeveiliging, ΔT-manager
        simulation.ts     # tijdstap
        checks.ts         # meldingen
      ui/                 # componenten (zie §7)
      scenarios.ts
      texts.ts            # alle uitlegteksten en meldingsteksten
tests/                    # of colocated *.test.ts
docs/SPEC.md, docs/AANNAMES.md
```

**Concept-registry.** Het klimaatplafond is `actief`. Daarnaast komen tegels met status `binnenkort`:

- Vloerverwarming/-koeling
- Betonkernactivering
- Ventilatorconvector (4-pijps)
- Actieve koelbalk

Een nieuw concept moet later toe te voegen zijn als nieuwe map onder `concepts/` plus één regel in de registry.

---

## 4. Invoerparameters

Alle invoer staat in één `KlimaatplafondConfig`-object, gevalideerd en geklemd op de bereiken hieronder. Elke invoer heeft een info-icoon met een korte toelichting.

### 4.1 Ruimte en last (open kantoor, globaal)

| Parameter | Bereik | Standaard | Toelichting |
|---|---|---|---|
| Vloeroppervlak open kantoor | 10–500 m² | 40 m² | Wordt verdeeld over de zones (§5.10) |
| Warmteverlies bij ontwerp | 0–20.000 W | 1.000 W | Toon ook W/m² |
| Koellast bij ontwerp | 0–20.000 W | 1.100 W | Toon ook W/m² |
| Thermische massa | licht / middel / zwaar | middel | 15 / 30 / 60 kJ/(m²·K) vloeroppervlak |
| RV ruimte | 30–70 % | 50 % | Voor het dauwpunt |
| Starttemperatuur | 10–30 °C | auto | Bij start verwarmen: setpoint − 3 K; bij start koelen: setpoint + 3 K. Checkbox "huidige temperatuur behouden" |

### 4.2 Watertemperaturen en setpoints

| Parameter | Bereik | Stap | Standaard |
|---|---|---|---|
| Aanvoer koelen | 14–18 °C | 0,5 | 16 °C |
| Aanvoer verwarmen | 28–40 °C | 0,5 | 35 °C |
| Ontwerp-ΔT koelen | 1,5–5 K | 0,5 | 3 K |
| Ontwerp-ΔT verwarmen | 2–10 K | 0,5 | 5 K |
| Setpoint verwarmen | 19–22 °C | 0,5 | 21 °C |
| Setpoint koelen | 23–26 °C | 0,5 | 24 °C |

Regel: setpoint koelen ≥ setpoint verwarmen + 1 K (dode zone). Dwing dit af in de UI.

### 4.3 Plafond

| Parameter | Keuzes | Standaard |
|---|---|---|
| Paneelmaat | 600×1200 mm / 600×600 mm | 600×1200 |
| Buissteek | 75 / 100 / 150 mm | 75 mm |
| Koperbuis | 8×0,5 (Di 7,0) / 10×0,5 (Di 9,0) / 12×0,6 (Di 10,8) | 8×0,5 |

### 4.4 Kleppen, zones en hydrauliek

| Parameter | Bereik / keuzes | Standaard | Niveau |
|---|---|---|---|
| Aantal kleppen (= zones) | 1, 2, 3 | 1 | globaal |
| Beschikbaar Δp vóór elke klep | 10–60 kPa | 30 kPa | globaal (per klep te overschrijven in geavanceerd) |
| Max. drukval per streng ("gevraagde drukval") | 10–40 kPa | 25 kPa | globaal |
| Kleptype | Type A / Type B | Type B | per klep |
| DN | 15 / 20 | 15 | per klep |
| Type B: Kvs koelen en Kvs verwarmen | lijst per DN (§5.7) | advies (§5.9) | per klep |
| Type A: PICV-uitvoering | lijst per DN (§5.7) | advies | per klep |
| Aantal panelen | 1–64 | 28 | per klep |
| Koppeling | automatisch / handmatig | automatisch | per klep |
| Handmatig: strengen | lijst van panelen per streng (max 16 strengen, max 16 panelen per streng), elk met "extra aansluitlengte" 0–10 m | – | per klep |
| Vmax koelen / Vmax verwarmen | automatisch (Σ ontwerpdebieten) / handmatig l/h | automatisch | per klep |
| ΔT-manager (alleen Type B) | aan/uit, ΔT_min koelen 2 K, verwarmen 3 K | uit | per klep |
| Verdeelleiding na de klep | meerlagenbuis 16×2 (Di 12) / 20×2 (Di 16) / 26×3 (Di 20) | 20×2 | per klep |
| Afstand klep → eerste streng | 0,5–10 m | 1,0 m | per klep |
| Hart-op-hart afstand strengen | 0,6–3,0 m | 1,2 m | per klep |
| Aansluitwijze | direct retour / Tichelmann | direct retour | per klep |

Bij het wijzigen van het aantal kleppen worden de panelen standaard gelijk verdeeld vanuit het huidige totaal. De rest gaat naar de eerste klep(pen).

### 4.5 Regeling en simulatie

| Parameter | Bereik | Standaard |
|---|---|---|
| Dauwpuntbeveiliging | aan/uit | aan |
| Kp | 0,1–2,0 per K | 0,6 per K |
| Ti | 60–3.600 s | 900 s |
| Debietkarakteristiek (vraag → debiet) | gelijkprocentig / lineair | gelijkprocentig |
| Simulatiesnelheid | 1×, 10×, 60×, 300× | 60× |

### 4.6 Geavanceerd (inklapbaar, met knop "standaardwaarden herstellen")

- **Plafondkarakteristiek:**
  - koelen: K = 9,6, n = 1,05;
  - verwarmen: K = 6,1, n = 1,10;
  - steekfactor f_s: 75 mm → 1,05; 100 mm → 1,00; 150 mm → 0,90.
- **Warmteoverdracht:**
  - R_cond (buis → plaatoppervlak) = 0,010 m²·K/W;
  - Re_ref van de karakteristiek = 4.000.
- **Weerstanden:**
  - ζ per 180°-bocht = 0,3;
  - koppelslang: lengte 0,5 m, binnendiameter gelijk aan de paneelbuis, ζ per koppeling = 1,0 (2 per slang);
  - ζ per T-stuk aftakking = 1,0 (2 per streng).
- **Ruwheid:** koper 0,0015 mm; meerlagenbuis 0,007 mm.
- **Paneelcapaciteit:** C_paneel = 5 kJ/(m²·K) actief oppervlak (staal/aluminium plus waterinhoud).
- **Last:**
  - ontwerp-buitentemperatuur verwarmen = −10 °C;
  - transmissiecoëfficiënt koelen h_k = 1,0 W/(m²·K) vloeroppervlak.
- **Zones:**
  - koppeling tussen aangrenzende zones H_z = 200 W/K;
  - lastverdeling: naar aandeel panelen (standaard) of handmatig in %.
- **Klepdynamiek:**
  - Type B: looptijd 90 s per 90°;
  - Type A: omschakeltijd 6-weg 30 s, PICV volle slag 60 s;
  - Type B: n_gl = 3,2.
- **Grenswaarden** voor de meldingen (§6).

---

## 5. Rekenmodel

### 5.1 Stofwaarden water (T in °C, geldig van 0 tot 100 °C)

```
ρ(T)  = 1000·[1 − (T + 288.9414) / (508929.2·(T + 68.12963)) · (T − 3.9863)²]       kg/m³
cp(T) = 4217.4 − 3.720283·T + 0.1412855·T² − 2.654387e-3·T³ + 2.093236e-5·T⁴       J/(kg·K)
μ(T)  = 2.414e-5 · 10^(247.8 / (T + 133.15))                                          Pa·s
λ(T)  = 0.5650 + 0.00185·T − 7.5e-6·T²                                               W/(m·K)
Pr(T) = μ·cp/λ
```

### 5.2 Paneelgeometrie (meander)

- De meanderbenen lopen parallel aan de **lange zijde** L.
- Het aantal benen is **oneven**, zodat de aanvoer op de ene korte zijde zit en de afvoer op de andere. Daardoor kunnen panelen in serie in een rechte rij liggen.

```
L, B        paneellengte en -breedte (m); 600×1200 → L = 1.2, B = 0.6; 600×600 → L = 0.6, B = 0.6
s           buissteek (m)
e_zij       = 0.050 m (randafstand)
n_benen     = floor((B − 2·e_zij)/s) + 1;  als even: n_benen −= 1
l_been      = L − 2·(s/2 + 0.025)
n_bochten   = n_benen − 1                  (180°-bochten, straal s/2)
L_buis      = n_benen·l_been + n_bochten·π·s/2 + 2·0.10   (incl. 2 aansluitstukjes)
A_paneel    = L·B                          (actief oppervlak)
```

Controlewaarden (600×1200):

| Steek | n_benen | L_buis |
|---|---|---|
| 75 mm | 7 | 8,432 m |
| 100 mm | 5 | 6,078 m |
| 150 mm | 3 | 3,671 m |

Bij 600×600 en een steek van 100 mm: 5 benen, L_buis = 3,078 m.

### 5.3 Warmteoverdracht plafond

**Karakteristiek** per m² actief oppervlak, met ΔT = |T_ruimte − T_water|:

```
q(ΔT) = f_s · K · ΔT^n                       W/m²
koelen:    K = 9.6, n = 1.05   → q(8 K)  ≈ 85,2 W/m²  (steek 100)
verwarmen: K = 6.1, n = 1.10   → q(15 K) ≈ 120,0 W/m² (steek 100)
```

De karakteristiek geldt bij turbulente proefcondities. Het model splitst daarom een **binnenzijdige weerstand** af, zodat laminaire stroming zichtbaar vermogen kost. Alle weerstanden zijn per m² actief oppervlak:

```
R_char(ΔT)   = ΔT / q(ΔT) = ΔT^(1−n) / (f_s·K)          (ΔT geklemd op ≥ 0,1 K)
A_i'         = π·Di·L_buis / A_paneel                    (m² binnenoppervlak per m² paneel)
h_i(Re,T)    = Nu(Re,Pr)·λ/Di
R_int(Re,T)  = 1 / (h_i·A_i')
R_ext(ΔT,T)  = R_char(ΔT) − R_int(Re_ref = 4000, T)
R_tot        = R_ext(ΔT,T) + R_int(Re_werkelijk, T)
```

Bij Re = 4.000 reproduceert het model dus exact de karakteristiek. Bij laminaire stroming valt het vermogen terug.

**Nusselt** (VDI-aanpak):

```
Re ≤ 2300:            Nu = 3.66
Re ≥ 10 000:          Gnielinski: f = (0.790·ln Re − 1.64)^−2
                      Nu = (f/8)(Re − 1000)Pr / (1 + 12.7·√(f/8)·(Pr^(2/3) − 1))
2300 < Re < 10 000:   γ = (Re − 2300)/(10 000 − 2300);  Nu = (1−γ)·3.66 + γ·Nu_Gnielinski(10 000)
```

**Oppervlaktetemperatuur** (lokaal, per segment), voor de dauwpunt- en comfortcontrole:

```
T_opp = T_w + (T_ruimte − T_w) · (R_int + R_cond) / R_tot
```

### 5.4 Thermische berekening van één streng

Een streng is een aantal panelen in serie. De koppelslangen tussen de panelen wisselen geen warmte uit.

- Verdeel L_buis per paneel in `n_seg = ceil(L_buis / 0.25)` gelijke segmenten. Elk segment krijgt het oppervlak `A_seg = A_paneel / n_seg`.
- Per segment (predictor-corrector):

```
ṁ   = V̇·ρ(T_in)
R1  = R_tot(evalueer bij T_in)
T_uit* = T_r − (T_r − T_in)·exp(−A_seg / (R1·ṁ·cp))
R2  = R_tot(evalueer bij (T_in + T_uit*)/2)
T_uit  = T_r − (T_r − T_in)·exp(−A_seg / (R2·ṁ·cp))
P_seg  = ṁ·cp·(T_uit − T_in)                 (teken bepaalt koelen/verwarmen)
```

- Re per segment is gebaseerd op de lokale watertemperatuur.
- **Output per streng:**
  - watertemperatuur per segment (voor de kleuring);
  - T_retour;
  - vermogen P (W);
  - T_opp per segment, plus minimum en gemiddelde;
  - Re en v bij de gemiddelde strengtemperatuur.
- Bij V̇ = 0 is P = 0 en is T_retour ongedefinieerd (toon dan "–").

### 5.5 Drukval

Gebruik Darcy-Weisbach met de **Churchill-wrijvingsfactor**, die alle regimes continu dekt:

```
A  = [2.457·ln(1 / ((7/Re)^0.9 + 0.27·ε/D))]^16
B  = (37530/Re)^16
f  = 8·[(8/Re)^12 + (A + B)^(−1.5)]^(1/12)
Δp = (f·L/D + Σζ)·ρ·v²/2
```

**Drukval van een streng** (alles tussen de twee T-stukken op de verdeelleiding, die zelf meetellen). Stofwaarden bij de gemiddelde strengtemperatuur.

| Onderdeel | Formule |
|---|---|
| Paneelbuis | f·(n_panelen·L_buis/Di)·ρv²/2 |
| Bochten | n_panelen·n_bochten·0,3·ρv²/2 |
| Koppelslangen | (n_panelen + 1) slangen × (f·0,5/Di_slang + 2·1,0)·ρv_slang²/2. Dit omvat de slangen tussen de panelen en de aansluitslangen naar de verdeelleiding |
| T-stukken | 2·1,0·ρv_slang²/2 |
| Extra aansluitlengte (handmatig) | als extra slanglengte |

De **verdeelleiding** krijgt alleen buiswrijving (Churchill, ε = 0,007 mm). Doorgaande T-stukken verwaarlozen we.

**Klep:** `Δp_klep [kPa] = 100·(V̇ [m³/h] / Kv)²`.

### 5.6 Hydraulisch netwerk per klep

**Opbouw.** Na de klep loopt een aanvoer- en een retourverdeelleiding. Daarop takken de strengen af op posities:

- `x_1 = afstand klep → eerste streng`;
- `x_i = x_1 + (i−1)·hart-op-hart`.

**Direct retour.** Aanvoer- en retourleiding lopen allebei van de klep naar de verste streng. Segment k (tussen aftakking k−1 en k) voert in beide leidingen `F_k = Σ_{j≥k} Q_j`. Het beschikbare drukverschil over streng i is:

```
ΔP_i = ΔP_0 − Σ_{k=1..i} 2·Δp_leiding(F_k, l_k)
```

Hierin is ΔP_0 het drukverschil direct na de klep.

**Tichelmann.** De aanvoerleiding is als bij direct retour. De retourverzamelleiding begint bij streng 1 en loopt mee naar streng n. Segment k→k+1 voert `G_k = Σ_{j≤k} Q_j`. Vanaf streng n loopt een retourleiding van lengte x_n terug naar de klep, met debiet Q_tot. Druk:

```
P_s(i) = P_s0 − Σ_{k≤i} Δp(F_k, l_k)
P_r(n) = P_r0 + Δp(Q_tot, x_n)
P_r(i) = P_r(i+1) + Δp(G_i, l_{i+1})
ΔP_i   = P_s(i) − P_r(i)
```

**Oplossen.** Gegeven Q_tot (opgelegd door de klep) zijn de onbekenden `Q_1..Q_n` en `ΔP_0`. De residuen zijn:

- `ΔP_i − Δp_streng,i(Q_i) = 0` voor elke streng i;
- `ΣQ_i − Q_tot = 0`.

Los dit op met Newton-Raphson met een numerieke Jacobiaan (n ≤ 16, dus dat is goedkoop) en demping:

- startwaarde: gelijke verdeling;
- Q_i geklemd op ≥ 1e-9;
- convergentie: |residu| < 1e-6 relatief;
- maximaal 50 iteraties;
- daarna een fallback met successieve onderrelaxatie.

De viscositeit per streng volgt uit de gemiddelde watertemperatuur van de vorige iteratie of tijdstap. Twee iteraties tussen hydrauliek en thermiek per ontwerpberekening zijn voldoende.

**Circuitkarakteristiek.** `Δp_circuit(Q_tot) = ΔP_0`. Dit is het drukverschil dat de klep aan de plafondzijde "ziet".

### 5.7 Kleppen

Klepdata staan in `data/valves.ts`, met een opmerking dat de waarden centraal aanpasbaar zijn.

**Type B — modulerende gekarakteriseerde 6-weg-klep met flow- en ΔT-meting (energiemeting)**

- Eén kogelklep doet zowel de omschakeling als de modulatie.
- Rotatie:
  - 0–30° = sequentie 1, **koelen** (0° = volledig open);
  - 30–60° = **dicht** (45° middenstand, met drukcompensatie);
  - 60–90° = sequentie 2, **verwarmen** (90° = volledig open).
- Looptijd 90 s voor 90°, dus 1°/s.
- Kvs per sequentie is afzonderlijk te kiezen:
  - DN15: 0,25 / 0,4 / 0,63 / 1,0 / 1,3 / 1,8 m³/h;
  - DN20: 0,63 / 1,0 / 1,6 / 2,5 / 4,0 m³/h.
- Max. Δp over de klep: 110 kPa.
- Karakteristiek gelijkprocentig:
  ```
  h = relatieve opening in de actieve sequentie (0..1)
  Kv(h) = Kvs·exp(n_gl·(h − 1))      voor h ≥ 0,05     (n_gl = 3,2)
  Kv(h) = Kv(0,05)·h/0,05            voor h < 0,05
  koelen:    θ = 30·(1 − h);   verwarmen: θ = 60 + 30·h;   dicht: θ = 45
  ```
- **Elektronische flowregeling** (drukonafhankelijk via meting). Uit Q_set berekent de klep:
  - `Kv_nodig = Q_set / √(Δp_klep(Q_set)/100)`, met `Δp_klep = Δp_beschikbaar − Δp_circuit(Q_set)`;
  - daaruit h_doel en θ_doel.

  θ volgt θ_doel met een snelheidsbegrenzing van 1°/s. Het werkelijke debiet lost op uit:
  ```
  Δp_beschikbaar = Δp_circuit(Q) + 100·(Q/Kv(θ))²
  ```
  Bij een modusomschakeling draait de kogel door de dode zone, en is het debiet daar 0.
- **Energiemeting:**
  - Toon gemeten debiet, T_aanvoer, T_retour (gemengd, debietgewogen), ΔT en vermogen P = ρ·cp·Q·|ΔT|.
  - Toon energie in kWh, apart voor koude en warmte.
- **ΔT-manager** (optioneel). Als de klep actief is:
  - ΔT_gemeten < ΔT_min: `Q_limiet −= 0,001·Vmax per s`;
  - ΔT_gemeten > ΔT_min + 0,3 K: `Q_limiet += 0,001·Vmax per s`, tot Vmax;
  - `Q_set = min(g(vraag)·Vmax, Q_limiet)` (g volgens §5.11).

**Type A — schakelende 6-weg-klep + drukonafhankelijk regelventiel (PICV)**

- **De 6-weg-klep schakelt alleen** tussen koelen en verwarmen:
  - DN15: Kvs 2,4 (totaal);
  - DN20: Kvs 4,0 (totaal);
  - omschakeltijd 30 s, waarin het debiet 0 is.
- **De PICV** zit in de plafondretour en regelt het debiet drukonafhankelijk. Vmax per sequentie wordt softwarematig ingesteld.

| Uitvoering | q_nom (l/h) | Δp_min (kPa) | Instelbereik |
|---|---|---|---|
| DN15 LF | 200 | 16 | 10–100 % |
| DN15 | 650 | 16 | 20–100 % |
| DN15 HF | 1.200 | 25 | 40–100 % |
| DN20 | 1.100 | 16 | 20–100 % |
| DN20 HF | 1.900 | 25 | 40–100 % |

- Vmax voor de actieve modus moet binnen het instelbereik liggen (zie melding W13).
- Q_set volgt de regelaar met een snelheidsbegrenzing van Vmax per 60 s.
- Haalbaar debiet:
  ```
  Kv_PICV,open = Vmax_modus / √(Δp_min/100)
  Q_haalbaar lost op uit: Δp_beschikbaar = Δp_circuit(Q) + 100·(Q/Kvs_6weg)² + 100·(Q/Kv_PICV,open)²
  Q = min(Q_set, Q_haalbaar)
  ```
  Bij voldoende Δp is het debiet dus exact Q_set (drukonafhankelijk). Bij te weinig Δp zakt het debiet.
- **Modusomschakeling:** eerst sluit de PICV (debiet 0), dan schakelt de 6-weg-klep (30 s), daarna opent de PICV weer volgens de regelaar.
- **Energiewaarden:** toon dezelfde grootheden als bij Type B, met het label "berekend" in plaats van "gemeten".

**Benodigd Δp** (KPI per klep, ontwerp):

```
Type B: Δp_benodigd = Δp_circuit(Vmax) + 100·(Vmax/Kvs_modus)²
Type A: Δp_benodigd = Δp_circuit(Vmax) + 100·(Vmax/Kvs_6weg)² + Δp_min
```

### 5.8 Ontwerp en automatisch koppelen (de puzzel)

Per klep en per modus ({koelen, verwarmen}) gelden de ontwerpcondities:

- T_in = aanvoertemperatuur van de modus;
- T_ruimte = setpoint van de modus;
- ΔT = ontwerp-ΔT van de modus.

**Ontwerpdebiet van een streng met s panelen.** Het debiet waarbij `|T_retour − T_in| = ΔT_ontwerp`. Los dit op met bisectie in log-ruimte op [0,5; 3.000] l/h, met 60 iteraties; ΔT daalt monotoon met het debiet. Is ΔT_ontwerp ≥ |T_ruimte − T_in| − 0,5 K, dan is het ontwerp onhaalbaar (melding W14).

**Kandidaten.** Voor `s = 1..min(N, 16)`:

1. `p = ceil(N/s)` strengen. Als p > 16: kandidaat ongeldig ("te veel strengen").
2. Verdeel de panelen zo gelijk mogelijk: `N mod p` strengen krijgen `floor(N/p)+1` panelen, de rest `floor(N/p)`.
3. **Volgorde: de langste strengen het dichtst bij de klep.** Dit compenseert deels de verdeelleidingverliezen; leg dat uit in de UI.
4. Bereken per modus en per afzonderlijke strenglengte: ontwerpdebiet, Re, v, Δp_streng (§5.5) en vermogen.

**Geldig** is een kandidaat als in **beide** modi voor **alle** strengen geldt:

- Δp_streng ≤ Δp_max;
- Re ≥ 2.300;
- 0,25 ≤ v ≤ 1,0 m/s;
- ΔT haalbaar.

**Keuze:**

- Kies de geldige kandidaat met de **minste strengen** (dus de langste strengen).
- Is er geen geldige kandidaat, kies dan de kandidaat met de laagste strafscore:
  ```
  straf = max over modi en strengen van Σ overschrijdingen:
          max(0, Δp/Δp_max − 1) + max(0, (2300 − Re)/2300)
        + max(0, (0.25 − v)/0.25) + max(0, (v − 1.0)/1.0)
  ```
  Bij gelijke straf kies je de kandidaat met de minste strengen. Toon de bijbehorende meldingen.

**Gevolgen van de keuze:**

- **Vmax per modus** = Σ ontwerpdebieten van de strengen, afgerond naar boven op 1 l/h, tenzij de gebruiker Vmax handmatig instelt.
- Bereken daarna het **netwerk bij Vmax**, met de werkelijke verdeelleiding en aansluitwijze. Dit levert:
  - de werkelijke verdeling per streng;
  - Δp_circuit;
  - het zonevermogen bij ontwerpcondities;
  - de meldingen W08 en W11.
- In **handmatige modus** gebruikt de tool de strengenlijst van de gebruiker. Vmax wordt dan de Σ van de ontwerpdebieten van díe strengen.

Laat de berekening alleen bij een configuratiewijziging opnieuw draaien (debounce 150 ms), niet elke tijdstap.

### 5.9 Klepadvies

Bepaal het advies per klep na de netwerkberekening, met `Δp_klep,beschikbaar = Δp_beschikbaar − Δp_circuit(Vmax)` per modus.

- **Type B** (per sequentie):
  - `Kv_nodig = Vmax[m³/h] / √(Δp_klep,beschikbaar/100)`.
  - Advies: de kleinste Kvs uit de DN-lijst met `Kv_nodig ≤ 0,9·Kvs`.
  - Bestaat die niet en is de DN 15: adviseer DN20. Anders: "Δp te laag".
  - Toon ook "opening bij Vmax ≈ h %", met h uit de gelijkprocentige karakteristiek.
- **Type A:**
  - Advies: de kleinste PICV met `q_nom ≥ max(Vmax_koel, Vmax_verw)` en `min(Vmax) ≥ bereik_min·q_nom`.
  - Toon de controle `Δp_benodigd ≤ Δp_beschikbaar`.

De gebruiker kiest zelf de DN en de Kvs/PICV. De tool toont het advies met een knop **"Advies toepassen"**. Bij het laden van de app en van scenario's zonder expliciete Kvs wordt het advies automatisch toegepast.

### 5.10 Ruimte en last

- Het open kantoor bestaat uit één tot drie zones, één per klep, naast elkaar.
- **Zonevloeroppervlak** = vloeroppervlak × aandeel panelen van die zone (of het handmatige %). De last wordt op dezelfde manier verdeeld.
- **Per zone één luchtknoop** met capaciteit `C = c_eff · A_zone` (c_eff volgens de thermische massa).

```
C_i·dT_i/dt = P_plafond,i + P_last,i(T_i) + Σ_j H_z·(T_j − T_i)        (j = aangrenzende zone)

P_last(T) = P0 − H·(T − T_set,modus)
  verwarmen: P0 = −Q_verlies,i;   H = Q_verlies,i / (T_set,verw − T_e,ontwerp)       (T_e,ontwerp = −10 °C)
  koelen:    P0 = +Q_koel,i;      H = h_k·A_zone                                      (h_k = 1,0 W/(m²·K))
  stop:      laatste modus blijft gelden
```

P_plafond is positief als het plafond warmte aan de ruimte afgeeft.

**Operatieve temperatuur** (alleen indicatief, de regelaar gebruikt de luchttemperatuur):

```
bezetting = (n_panelen·A_paneel)/A_zone
F         = 0.35·min(1, bezetting)
T_mrt     = T_lucht + F·(T_opp,gem − T_lucht)
T_op      = (T_lucht + T_mrt)/2
```

### 5.11 Regeling

- **Modusknoppen:** `Verwarmen`, `Koelen`, `Stop` (alle kleppen dicht), `Reset` (terug naar de starttemperatuur, tijd op 0, energietellers op 0).
- **PI-regelaar per klep** op de luchttemperatuur van de eigen zone:
  ```
  e = T_set,verw − T   (verwarmen)   of   e = T − T_set,koel   (koelen)
  vraag = clamp(Kp·e + I, 0, 1)
  I    += Kp·e·dt/Ti   (alleen als dit de verzadiging niet verder in duwt: anti-windup)
  ```
- **Debietsetpoint:** `Q_set = g(vraag)·Vmax_modus`, eventueel begrensd door de ΔT-manager.
  - Gelijkprocentig (standaard): `g(u) = exp(3,2·(u − 1))` voor u ≥ 0,05; daaronder lineair naar 0.
  - Lineair: `g(u) = u`.

  Waarom gelijkprocentig de standaard is: het plafondvermogen stijgt sterk bij lage debieten en vlakt daarna af. Een gelijkprocentige debietkarakteristiek maakt het verband tussen vraag en vermogen ongeveer lineair. Met lineair schiet de regeling merkbaar meer door (verwarmen vanaf 18 °C: ca. 0,6 K overshoot tegenover ca. 0,3 K). Leg dit uit op de uitlegpagina en in scenario S1.
- **Dauwpuntbeveiliging** (koelen):
  - dauwpunt volgens Magnus: `γ = ln(RV/100) + 17.62·T/(243.12 + T)`, `T_dauw = 243.12·γ/(17.62 − γ)`;
  - als `T_aanvoer,koel < T_dauw + marge` (marge 1 K), dan is de vraag 0 en is de melding "Dauwpuntbeveiliging actief" zichtbaar;
  - hysterese 0,5 K.

### 5.12 Simulatielus

- Vaste tijdstap `dt = 2 s` (simulatietijd).
- Per animatieframe draai je `snelheid × frameTijd / dt` stappen, met een maximum per frame zodat de UI vloeiend blijft.
- De stap-functie is puur: `step(state, config, design, dt) → state`.

Per stap, per klep:

1. **Regelaar:** vraag → Q_set (dauwpunt, ΔT-manager).
2. **Klepdynamiek:** θ (Type B), of 6-weg-positie en PICV-setpoint (Type A), met snelheidsbegrenzing.
3. **Werkelijk Q_tot** via de klep- en circuitvergelijking (§5.7).
4. **Netwerkverdeling** Q_i (§5.6).
5. **Stationaire strengthermiek** per streng (§5.4): P_ss,i, de temperatuurprofielen en T_opp.
6. **Paneeltraagheid** per streng:
   ```
   dP_i/dt = (P_ss,i − P_i)/τ_i
   τ_i = C_paneel·R_char(8 K) + min(V_water,i/Q_i, 300 s)
   ```
   Hierin is V_water,i de waterinhoud van de streng. Is Q_i = 0, dan is P_ss,i = 0. De weergegeven T_retour volgt uit P_i: `T_retour = T_aanvoer ± P_i/(ṁ·cp)`.
7. **Ruimte:** expliciete Euler voor alle zones.
8. **Energietellers** en **meldingen in bedrijf** bijwerken.
9. **Tijdreeks loggen:** elke 30 s simulatietijd één punt, maximaal 24 uur historie (ringbuffer).

Prestatie-eis: 3 kleppen × 16 strengen bij 300× moet vloeiend lopen (≥ 50 fps op een gangbare laptop). Gebruik eventueel een vereenvoudigde thermiek per stap (bijvoorbeeld hergebruik van het profiel als Q en de temperaturen < 0,5 % veranderd zijn).

---

## 6. Controles en meldingen

Er zijn twee groepen meldingen:

- **Ontwerp:** berekend bij Vmax en ontwerpcondities, opnieuw bij elke configuratiewijziging.
- **Bedrijf:** live tijdens de simulatie.

Ernst: 🔴 fout · 🟠 waarschuwing · 🔵 info. Elke melding toont de betrokken klep of streng, de actuele waarden en een uitklapbaar **"Waarom?"** met uitleg, formule en oplossingen. Alle grenswaarden zijn instelbaar in het geavanceerde paneel. Klikken op een melding markeert de betreffende streng of klep in de plattegrond.

| Code | Melding | Voorwaarde | Ernst |
|---|---|---|---|
| W01 | Te hoge drukval in streng | Δp_streng > Δp_max | 🟠 |
| W02 | Ontwerpdebiet niet haalbaar | Q_max,haalbaar < 0,98·Vmax | 🔴 |
| W03 | Laminaire stroming | Re < 2.300 in een streng (bij ontwerpdebiet) | 🟠 |
| I01 | Overgangsgebied | 2.300 ≤ Re < 4.000 | 🔵 |
| W04 | Te lage stroomsnelheid | v < 0,25 m/s | 🟠 |
| W05 | Te hoge stroomsnelheid | v > 1,0 m/s | 🟠 |
| W06 | Te klein watertemperatuurverschil | ontwerp-ΔT, of in bedrijf gemeten ΔT (na 5 min stabiel bedrijf), < 2 K (koelen) / < 3 K (verwarmen) | 🟠 |
| W07 | Uitgeputte streng | \|T_retour − T_ruimte\| < 1 K in een streng | 🟠 |
| W08 | Ongelijke verdeling | \|Q_i/Q_ontwerp,i − 1\| > 15 % (🟠) of > 5 % (🔵), netwerk bij Vmax | 🟠/🔵 |
| W09 | Condensatierisico | koelen: T_opp,min < T_dauw + 1 K | 🔴 |
| W10 | Plafond te warm voor comfort | verwarmen: T_opp,gem > 35 °C | 🟠 |
| W11 | Onvoldoende plafondvermogen | zonevermogen (werkelijke verdeling, ontwerpcondities) < aandeel last | 🟠 |
| W12 | Kvs te groot (Type B) | Kv_nodig/Kvs < 0,3 bij Vmax | 🟠 |
| W13 | PICV buiten instelbereik (Type A) | Vmax > q_nom (🔴) of Vmax < bereik_min·q_nom (🟠) | 🔴/🟠 |
| W14 | Ontwerp-ΔT niet haalbaar | ΔT_ontwerp ≥ \|T_set − T_aanvoer\| − 0,5 K | 🔴 |
| W15 | Te veel strengen | > 16 strengen nodig | 🔴 |
| W16 | Klep-Δp boven maximum | Δp over de klep > 110 kPa (B) / 600 kPa (A) | 🔴 |
| I02 | Hoge bezettingsgraad | panelen/vloer > 80 % | 🔵 |
| I03 | ΔT-manager begrenst | Q_limiet < g(vraag)·Vmax | 🔵 (bedrijf) |
| I04 | Dauwpuntbeveiliging actief | zie §5.11 | 🔵 (bedrijf) |
| I05 | Regelaar verzadigd | vraag = 100 % langer dan 10 min en setpoint niet gehaald | 🔵 (bedrijf) |

Laminair bij deellast is normaal. Toon laminaire stroming tijdens bedrijf daarom alleen als badge op de streng, niet als waarschuwing.

**Uitleg per melding** (opnemen in `texts.ts`; formuleringen mogen worden verbeterd, de inhoud niet):

- **W01 — Te hoge drukval.**
  - *Waarom:* in turbulent regime geldt Δp ≈ c·L·Q^1,75/D^4,75. Meer panelen in serie betekent een langere streng *én* meer debiet: bij dezelfde ΔT neemt het vermogen per streng toe, dus ook het debiet. De drukval stijgt daardoor veel sneller dan lineair.
  - *Oplossingen:* minder panelen per streng (meer parallel), een grotere buisdiameter, een grotere ontwerp-ΔT, of een hogere Δp-grens accepteren.
- **W02 — Ontwerpdebiet niet haalbaar.**
  - *Waarom:* het beschikbare Δp vóór de klep moet het circuit én de klep dekken. Type A heeft een minimaal Δp over de PICV nodig om drukonafhankelijk te regelen. Bij Type B begrenst de Kvs het debiet bij volledig open.
  - *Oplossingen:* het beschikbare Δp verhogen, een grotere Kvs of DN20 kiezen, de circuitweerstand verlagen (kortere strengen, ruimere verdeelleiding) of Vmax verlagen.
- **W03 — Laminaire stroming.**
  - *Waarom:* onder Re ≈ 2.300 valt de binnenzijdige warmteoverdracht terug naar Nu = 3,66 (turbulent Nu > 20). Alleen daardoor levert het plafond in dit model al ca. 10–15 % minder per paneel; door het lagere debiet loopt de gemiddelde watertemperatuur bovendien verder op. Daarnaast wordt lucht slecht afgevoerd.
  - *Oplossingen:* meer panelen in serie (meer debiet per streng), een kleinere buisdiameter of een kleinere ontwerp-ΔT.
- **W04 — Te lage stroomsnelheid.**
  - *Waarom:* onder ca. 0,25 m/s worden luchtbellen niet meegevoerd. Dat geeft ontluchtingsproblemen, geluid en strengen die "dichtslaan".
  - *Oplossingen:* dezelfde als bij W03.
- **W05 — Te hoge stroomsnelheid.**
  - *Waarom:* boven ca. 1 m/s in dunne koperbuis ontstaan stromingsgeluid en erosierisico, en de drukval loopt hard op.
  - *Oplossingen:* meer parallelle strengen of een grotere buisdiameter.
- **W06 — Te klein ΔT.**
  - *Waarom:* veel water verpompen voor weinig vermogen. Dat kost pompenergie, en de opwekker (WKO, koelmachine, warmtepomp) werkt slechter bij een lage ΔT ("laag-ΔT-syndroom").
  - *Oplossingen:* een grotere ontwerp-ΔT, Vmax verlagen of de ΔT-manager inschakelen (Type B), met het vermogensverlies als gevolg.
- **W07 — Uitgeputte streng.**
  - *Waarom:* het water heeft de ruimtetemperatuur bijna bereikt. De laatste panelen in de streng hebben nauwelijks drijvend temperatuurverschil en leveren vrijwel niets.
  - *Oplossingen:* meer debiet door deze streng, kortere strengen of een gelijkmatigere verdeling.
- **W08 — Ongelijke verdeling.**
  - *Waarom:* zonder inregeling na de klep kiest het water de weg van de minste weerstand. Korte strengen en strengen dicht bij de klep krijgen te veel, lange en verre strengen te weinig, en kunnen daardoor zelfs laminair worden.
  - *Oplossingen:* gelijke strengen, langere strengen dicht bij de klep, een ruimere verdeelleiding, Tichelmann (kost extra leiding en drukval) of de zone over meer kleppen verdelen. Met meer kleppen regelt de software het debiet per zone.
- **W09 — Condensatie.**
  - *Waarom:* het koudste plafondoppervlak (bij de aanvoer) ligt onder het dauwpunt plus marge. Er ontstaat dan condens op het plafond.
  - *Oplossingen:* een hogere aanvoertemperatuur (kost vermogen), de ruimte ontvochtigen via de ventilatie, of dauwpuntbeveiliging gebruiken.
- **W10 — Plafond te warm.**
  - *Waarom:* een warm plafond geeft stralingsasymmetrie boven het hoofd. Comfortnormen beperken die tot ca. 5 K.
  - *Oplossingen:* een lagere aanvoertemperatuur, meer panelen of een kleinere steek.
- **W11 — Onvoldoende vermogen.**
  - *Oplossingen:* meer panelen, een kleinere buissteek, een lagere (koelen) of hogere (verwarmen) aanvoertemperatuur, of de last verlagen. Toon het tekort in W en in W/m².
- **W12 — Kvs te groot.**
  - *Waarom:* de klep regelt in een klein deel van haar slag. De regeling wordt dan grof en gaat pendelen.
  - *Oplossing:* een kleinere Kvs; toon het advies.
- **W13 — PICV buiten bereik.**
  - *Oplossing:* een andere uitvoering; toon het advies.
- **W14 — Ontwerp-ΔT onhaalbaar.**
  - *Waarom:* het water kan niet verder opwarmen of afkoelen dan de ruimtetemperatuur.
  - *Oplossing:* een kleinere ΔT of een andere aanvoertemperatuur.
- **W15 — Te veel strengen:** splits over meer kleppen of verleng de strengen.
- **W16 — Klep-Δp boven maximum:** verlaag het beschikbare Δp vóór de klep.

---

## 7. UI en visualisatie

### 7.1 Layout (desktop-first, bruikbaar op tablet ≥ 1024 px, leesbaar op mobiel)

- **Header:**
  - titel "Installatieconcepten" en de conceptnaam;
  - scenario-keuzelijst;
  - knoppen "Deel link", "Print / PDF" en "Uitleg".
- **Links: instellingenpaneel** (scrollbaar, met accordeons per groep uit §4). Per klep een kaart met de klepinstellingen.
- **Midden: plafondplattegrond** (groot). Daaronder een **bedieningsbalk**:
  - Verwarmen / Koelen / Stop / Reset;
  - snelheid;
  - simulatieklok (hh:mm);
  - modusindicator.
- **Rechts:**
  - **KPI-kaarten per zone:**
    - T_lucht, T_op en setpoint;
    - klepstand (° of %) en vraag %;
    - debiet / Vmax;
    - T_aanvoer, T_retour en ΔT;
    - vermogen versus last;
    - Δp benodigd versus beschikbaar;
    - energie (kWh).
  - Daaronder het **meldingenpaneel**.
- **Onder: tabbladen** Dynamiek · Puzzel · Klep · Uitleg.

### 7.2 Plafondplattegrond (SVG, coördinaten in meters)

- **Zones** liggen naast elkaar in x-richting, met 1,0 m tussenruimte. Per zone:
  - de klep op `(x0, 0)`;
  - de aanvoer- en retourverdeelleiding horizontaal (y = 0 en y = −0,15);
  - de strengen verticaal naar beneden vanaf y = 0,4 m, op hart-op-hart-afstand;
  - panelen van 0,6 m breed in x en L lang in y, met 0,10 m tussenruimte voor de koppelslang.
- **Tichelmann:** de retour loopt als extra lijn (y = −0,30) van de eerste naar de laatste streng en vanaf daar terug naar de klep.
- **Elk paneel** toont:
  - de paneelomtrek;
  - de **meander** als pad (benen plus halfronde bochten, echte steek en echt aantal benen);
  - de aansluitpunten op de korte zijden;
  - de koppelslangen als boogjes tussen de panelen.
- **Kleuring** (keuze via een overlay-schakelaar):
  1. **Watertemperatuur** (standaard): elk segment krijgt een kleur uit een divergerende schaal. Koud (blauw) → T_ruimte (neutraal lichtgrijs) → warm (rood/oranje); kleurenblind-vriendelijk. Schaal: van de koudste tot de warmste aanvoer, rond T_ruimte. Legenda met °C.
  2. **Oppervlaktetemperatuur:** de paneelvlakken krijgen een heatmap per segmentstrook. Bij koelen worden zones onder T_dauw + 1 K gearceerd.
  3. **Verdeling:** elke streng gekleurd naar Q_i/Q_ontwerp,i (−30 % … +30 %).
- **Stromingsanimatie:**
  - deeltjes bewegen over het werkelijke pad (verdeelleiding → streng → retour);
  - de snelheid is evenredig met de **werkelijke** watersnelheid (ca. 0,5 m/s ≈ 1 paneellengte per seconde op het scherm) en **onafhankelijk** van de simulatiesnelheid;
  - de deeltjeskleur volgt de lokale watertemperatuur; bij Q = 0 staan de deeltjes stil;
  - gebruik een `<canvas>`-overlay die met de SVG-transformatie meeloopt; maximaal ca. 1.500 deeltjes.
- **Labels per streng** (aan/uit): Q (l/h), v, Re, Δp, T_aanvoer → T_retour, P (W). Badge "laminair" of "overgang" waar van toepassing.
- **Interactie:**
  - hover → tooltip;
  - klik op een streng → markeren en openen in het puzzel- en dynamiektabblad;
  - zoom met het muiswiel, pannen met slepen, knop "Passend maken";
  - een schaalbalk van 1 m.
- **Klepsymbool** bij elke zone, met een minidraaiknop of PICV-balk en het label "Type B · DN15 · Kvs 1,3/1,0".

### 7.3 Tabblad "Klep" (detail van de geselecteerde klep)

- **Type B:**
  - Een schematisch klephuis met zes poorten. Boven: koud-aanvoer, plafond-aanvoer en warm-aanvoer. Onder: koud-retour, plafond-retour en warm-retour.
  - De kogel als draaiende schijf met een kanaal dat de plafondpoorten met de koude of de warme poorten verbindt.
  - Een **draaischaal van 0–90°** met de vlakken koelen (0–30, blauw), dicht (30–60, grijs) en verwarmen (60–90, rood). Een naald op θ, met een doel-naald (θ_doel) als stippellijn.
  - Uitlezing: opening h %, Kv(θ), Δp over de klep, flowmeting, T_aanvoer, T_retour, ΔT, P en energie.
  - Grafiek: Kv/Kvs tegen θ (gelijkprocentig), met het actuele punt.
- **Type A:**
  - Hetzelfde klephuis, maar met een twee-standenschakeling (en een omschakelanimatie van 30 s).
  - Daarnaast een PICV-symbool in de plafondretour met een slagbalk, Q_set versus Q_werkelijk en Δp over de PICV versus Δp_min, als balk met de minimumlijn. Is Δp over de PICV lager dan Δp_min, dan kleurt de balk oranje met de tekst "niet meer drukonafhankelijk".
- **Gemeenschappelijk:**
  - de kleur van de stromen in het schema volgt de actieve modus;
  - de omschakelsequentie wordt geanimeerd;
  - een tekstblok "Hoe werkt dit kleptype?" (3–5 zinnen).

### 7.4 Tabblad "Puzzel" (de kern van de uitleg)

- **Zonekeuze** bovenaan.
- **Matrix** met één kolom per kandidaat `s = 1..min(N,16)`. Kolomkop: "s panelen per streng → p strengen (verdeling, bijvoorbeeld 4·4·4·4·4·4·4)". Rijen per modus:
  - debiet per streng (l/h);
  - v (m/s);
  - Re;
  - Δp streng (kPa);
  - zonevermogen (W);
  - statusiconen.

  Cellen krijgen een kleur naar status. De automatische keuze krijgt een **★ advies**. Klik op een kolom en dan **"Toepassen"** zet de klep op handmatig met deze configuratie.
- **Grafiek 1:** Δp_streng tegen s, voor koelen en verwarmen. Logaritmische y-as, een horizontale lijn op Δp_max en het geldige venster gearceerd.
- **Grafiek 2:** Re tegen s, met lijnen op 2.300 en 4.000. Tweede reeks: v tegen s met de grenzen 0,25 en 1,0, op een tweede as of als aparte mini-grafiek.
- **Grafiek 3:** voor de geselecteerde streng het **vermogen én Δp tegen het debiet** (0–3× ontwerpdebiet) bij ontwerpcondities. Verticale lijnen op het ontwerpdebiet en het werkelijke debiet. Dit maakt zichtbaar dat meer debiet steeds minder extra vermogen oplevert maar wel veel extra drukval kost.
- **Verdeling bij Vmax:** een staafdiagram per streng met Q_werkelijk versus Q_ontwerp (en T_retour), plus een schakelaar "direct retour ↔ Tichelmann" om het effect direct te vergelijken. Hiermee wordt de configuratie niet gewijzigd; het is een vergelijkingsberekening.
- **"Wat zie je?"-kaart** met een gegenereerde zin uit de data, bijvoorbeeld: *"Met Cu 8×0,5 ligt het werkbare venster bij 4 panelen per streng: bij 3 is de stroming laminair (Re 1.861), bij 5 wordt de drukval 41 kPa (> 25 kPa)."*

### 7.5 Tabblad "Dynamiek" (uPlot, gesynchroniseerde cursors, tijdas hh:mm)

1. **Temperaturen:** T_lucht per zone, setpoint (stippel), T_op (gestreept), en per klep T_aanvoer en T_retour.
2. **Vermogen:** P_plafond per zone versus last (W).
3. **Klep:** vraag %, Q / Vmax (l/h), en θ (Type B) of PICV-slag (Type A).
4. **Strengdebieten** van de geselecteerde zone (l/h per streng).

Knop "Exporteer CSV" voor de tijdreeks.

### 7.6 Meldingenpaneel

- Gegroepeerd naar "Ontwerp" en "Bedrijf" en daarbinnen naar zone. Gesorteerd op ernst.
- Uitklapbaar "Waarom?" met de tekst, de actuele waarden (bijvoorbeeld "Re = 1.866 in streng 1"), een KaTeX-formule en de oplossingen.
- Waar dat kan een actieknop, bijvoorbeeld "Toon in puzzel", "Advies toepassen" of "Tichelmann proberen".
- Zijn er geen meldingen, dan een groene status "Ontwerp voldoet aan alle grenswaarden".

### 7.7 Tabblad "Uitleg" (KaTeX)

Secties, elk 1–3 alinea's met formule(s):

1. **Hoe werkt een klimaatplafond?** Straling en convectie, de karakteristiek q = K·ΔT^n, de normproefcondities.
2. **De puzzel: serie versus parallel.** Re, Darcy-Weisbach, waarom Δp zo snel stijgt, laminair versus turbulent en het effect op Nu.
3. **Ontwerp-ΔT en debiet.** Q = P/(ρ·cp·ΔT), de gevolgen voor de opwekker.
4. **De 6-weg-klep.** Type A versus Type B, sequenties, dode zone, drukonafhankelijkheid, energiemeting en de ΔT-manager.
5. **Waarom geen inregeling na de klep?** Softwarematige Vmax, ongelijke verdeling, Tichelmann, langste strengen vooraan, meer kleppen.
6. **Dauwpunt en comfort.**
7. **Regeling en dynamiek.** PI-regelaar, gelijkprocentige versus lineaire debietkarakteristiek (waarom het vermogen niet lineair met het debiet stijgt), traagheid van plafond en ruimte, operatieve temperatuur.
8. **Modelaannames en beperkingen.** Kort; verwijs naar `docs/AANNAMES.md`.

### 7.8 Scenario's (keuzelijst in de header)

Een scenario laadt een configuratie, reset de simulatie en toont een kaart met **"Wat zie je?"** en **"Probeer zelf"**. Basis is steeds de standaardconfiguratie, plus de genoemde wijzigingen.

| # | Naam | Wijzigingen | Wat zie je (verwacht) |
|---|---|---|---|
| S1 | Uitgangssituatie: het optimum | – | 7 strengen × 4 panelen. Koelen: Re ≈ 2.640, Δp ≈ 18 kPa. Puzzel: bij 3 panelen laminair, bij 5 Δp ≈ 41 kPa. Geen fouten of waarschuwingen (alleen info I01, overgangsgebied). Start koelen vanaf 27 °C en zie de klep terugregelen rond 24 °C. Probeer zelf: zet de debietkarakteristiek op lineair en zie de regeling meer doorschieten |
| S2 | Elk paneel apart | 12 panelen, handmatig 12 × 1 | Re ≈ 620, v ≈ 0,09 m/s → W03 en W04; lager vermogen per paneel. Probeer 3 × 4 |
| S3 | Alles in serie | 12 panelen, handmatig 1 × 12 | Ca. 180 l/h door Cu 8 mm: v ≈ 1,3 m/s, Δp > 400 kPa → W01, W02, W05 |
| S4 | Ongelijke strengen zonder inregeling | 10 panelen, handmatig 4·3·3 | De 4-panelenstreng krijgt ca. 39 l/h in plaats van 56 (−29 %) en wordt laminair; de 3-panelenstrengen krijgen +21 % → W08, W03. Probeer 5·5 (Δp te hoog) of 12 panelen |
| S5 | Lange verdeelleiding | 40 panelen (auto 10 × 4), verdeelleiding 16×2, eerste streng op 2,0 m, Δp beschikbaar 60 kPa, DN20 | Direct retour: +28 % / −11 % → W08. Schakel naar Tichelmann: +7 % / −5 %, maar de circuitdrukval stijgt van ca. 33 naar ca. 58 kPa → W02 |
| S6 | Eén grote klep of drie kleine | Vloer 86 m², koellast 2.400 W, warmteverlies 2.100 W, 1 klep DN20, 60 panelen | 15 × 4 aan één verdeelleiding 20×2: +23 % / −9 % ongelijk, Kv_nodig ≈ 3,6. Zet het aantal kleppen op 3 (elk 20 panelen, 5 × 4, DN15): Kv ≈ 0,7, verdeling binnen ±3 % |
| S7 | Te kleine ΔT | Ontwerp-ΔT koelen 1,5 K | Het debiet per streng verdubbelt ruwweg. Bij 2 panelen per streng is koelen in orde (Δp ≈ 14 kPa), maar wordt verwarmen laminair (Re ≈ 1.420). Bij 3 panelen loopt de koel-Δp op tot ca. 44 kPa. Er is geen geldige koppeling meer → W06 plus W01 of W03. Vmax koelen stijgt naar ca. 650–900 l/h, waardoor klep en verdeelleiding zwaar belast worden. Zet de ΔT-manager aan en zie debiet én vermogen dalen |
| S8 | Condensatie | RV 65 % | T_dauw ≈ 17,0 °C en T_opp,min ≈ 17,5 °C → W09. Met dauwpuntbeveiliging blijft de klep dicht bij koelen (I04). Ook 18 °C aanvoer zit op de grens (T_dauw + 1 K ≈ 18,0 °C) en kost bovendien ca. 35 % vermogen: laminaire strengen en W11. Verlaag de RV naar 55 % (ontvochtigen via de ventilatie): T_dauw ≈ 14,4 °C en koelen met 16 °C werkt weer |
| S9 | Type A bij beperkt Δp | Type A, DN15 | Benodigd ca. 34 kPa (circuit 15 + 6-weg 2,6 + PICV 16) > 30 kPa → W02. Zet Δp op 40 kPa → OK. Vergelijk met Type B, dat bij 30 kPa wel voldoet |
| S10 | Kvs te groot | 8 panelen, Type B DN20, Kvs 4,0/4,0 | Vmax koelen ≈ 112 l/h, Kv_nodig ≈ 0,32 → W12 (Kv/Kvs ≈ 0,08), ook voor verwarmen. Advies binnen DN20: Kvs 0,63. Met DN15 wordt het advies Kvs 0,4 |

### 7.9 Delen en printen

- **"Deel link":** de configuratie (niet de simulatiestatus) als compacte JSON → base64url in de hash, bijvoorbeeld `#/klimaatplafond?c=...`. Bij het laden decoderen, valideren en klemmen. Toon een bevestiging "Link gekopieerd".
- **"Print / PDF":** een printstylesheet op A4 liggend met de titel, configuratiesamenvatting, plattegrond (zonder animatie), puzzelmatrix, KPI's per zone en meldingen. Geen bedieningselementen.

### 7.10 Vormgeving

- Rustig en technisch: veel witruimte, één accentkleur, en blauw/rood alléén voor koud en warm.
- Monospace cijfers (tabular-nums) voor waarden.
- Lees het skill-document `frontend-design` als dat beschikbaar is; anders volg je deze richtlijnen.
- Toegankelijkheid:
  - alle bedieningselementen bereikbaar met het toetsenbord;
  - aria-labels;
  - kleur nooit als enige informatiedrager (gebruik ook iconen en tekst).

---

## 8. Data (`concepts/klimaatplafond/data`)

- `valves.ts`:
  - Type B: Kvs-lijsten per DN, looptijd, max Δp, n_gl en rotatiesequenties.
  - Type A: Kvs van de 6-weg-klep per DN, omschakeltijd, PICV-tabel.
- `pipes.ts`:
  - koperbuizen (8×0,5 / 10×0,5 / 12×0,6, met Di en ε);
  - meerlagenbuizen (16×2 / 20×2 / 26×3, met Di en ε).
- `ceiling.ts`: de karakteristieken, steekfactoren, C_paneel en R_cond.
- `defaults.ts` en `limits.ts`: alle standaardwaarden en grenswaarden uit §4 en §6.

Zet bij elke databron het commentaar `// waarden uit leveranciersdocumentatie, geanonimiseerd`. Gebruik geen merknamen.

---

## 9. Tests en referentiewaarden

Gebruik Vitest. De referentiewaarden zijn met een onafhankelijke implementatie van precies dit model berekend. Tolerantie: ±1 % tenzij anders vermeld.

**Stofwaarden**

| T | ρ | cp | μ | λ |
|---|---|---|---|---|
| 20 °C | 998,23 kg/m³ | 4.181,6 J/(kg·K) | 1,0017e-3 Pa·s | 0,599 W/(m·K) |
| 35 °C | 994,06 | 4.177,9 | 7,185e-4 | 0,6206 |

**Geometrie:** de controlewaarden uit §5.2 moeten exact kloppen (3 decimalen).

**Karakteristiek:** q_koel(8 K, steek 100) = 85,2 W/m² en q_verw(15 K, steek 100) = 120,0 W/m² (±0,2).

**Wrijving en drukval:**

- Di 7 mm, L 10 m, 60 l/h, 17,5 °C → Re = 2.841, f = 0,0419 (±2 %), Δp = 5,61 kPa (±3 %).
- Bij 20 l/h is f gelijk aan 64/Re binnen 0,5 %.

**Nusselt:**

- Re 1.500 → 3,66.
- Re 4.000 → 20,9 (±3 %).
- Re 10.000 bij 17,5 °C → 81,5 (±2 %).

**Klep:** 0,25 m³/h door Kv 1,0 → precies 6,25 kPa.

**Dauwpunt:** 24 °C/50 % → 12,93 °C; 26 °C/60 % → 17,63 °C; 24 °C/65 % → 17,01 °C (±0,05).

**Strengontwerp** (steek 100, Cu 8×0,5, koelen, aanvoer 16 °C, ruimte 24 °C, ΔT 3 K, 600×1200). Tolerantie: V̇ en P ±3 %, Re ±3 %, Δp ±6 % (bij s = 5 ±10 %, overgangsgebied).

| s | V̇ (l/h) | P (W) | Re | v (m/s) | Δp streng (kPa) |
|---|---|---|---|---|---|
| 1 | 12,1 | 42 | 572 | 0,09 | 0,5 |
| 2 | 24,2 | 84 | 1.144 | 0,17 | 1,8 |
| 3 | 36,2 | 126 | 1.716 | 0,26 | 4,1 |
| 4 | 49,0 | 171 | 2.320 | 0,35 | 8,5 |
| 5 | 68,2 | 237 | 3.229 | 0,49 | 27,4 |
| 6 | 83,3 | 290 | 3.945 | 0,60 | 46,5 |

**Laminaire straf:** 1 paneel (steek 100, koelen 16/24 °C) levert bij 20 l/h 46,0 W en bij 200 l/h 61,7 W (±3 %).

**Standaardconfiguratie** (steek 75, 28 panelen, 1 klep, direct retour, 20×2, x1 = 1,0 m, hart-op-hart 1,2 m):

- De automatische koppeling kiest **7 × 4**. Gevalideerde kandidaatwaarden (±5 %):

  | Modus | s | V̇ (l/h) | Re | Δp (kPa) |
  |---|---|---|---|---|
  | koelen | 3 | 39,3 | 1.861 | 6,0 |
  | koelen | 4 | 55,8 | 2.641 | 17,7 |
  | koelen | 5 | 72,3 | 3.423 | 40,6 |
  | verwarmen | 3 | 32,0 | 2.128 | 3,6 |
  | verwarmen | 4 | 45,2 | 3.007 | 12,9 |
  | verwarmen | 5 | 57,4 | 3.818 | 24,8 |

- **Koelen:** Vmax = 390 l/h (±3 %), zonevermogen = 1.359 W (±3 %), Δp_circuit = 14,9 kPa (±8 %), verdeling max/min = 1,034 (±0,01).
- **Verwarmen:** Vmax = 317 l/h, zonevermogen = 1.828 W, Δp_circuit = 10,7 kPa.
- **Klepadvies Type B DN15:** Kvs koelen **1,3**, Kvs verwarmen **1,0**.
- **Type A DN15 bij 30 kPa:** benodigd ≈ 33,6 kPa → W02.
- T_opp,min bij koelen ≈ 17,5 °C (±0,2).
- Geen meldingen W01–W16 bij Type B.

**Netwerk:**

- S4 (steek 75, 4·3·3, Vmax = 134,4 l/h): verdeling ≈ [39,4; 47,5; 47,5] l/h (±5 %).
- S5 (10 × 4, 16×2, x1 = 2,0 m):

  | Aansluitwijze | Verdeling t.o.v. ontwerp (±3 %-punt) | Δp_circuit (±8 %) |
  |---|---|---|
  | Direct retour | +27,6 % / −11,2 % | 32,9 kPa |
  | Tichelmann | +7,4 % / −4,9 % | 58,3 kPa |

- **Algemeen:**
  - massabehoud < 1e-9;
  - het drukverschil over alle parallelle paden is gelijk binnen 1e-6 relatief;
  - gelijke strengen met verdeelleidinglengte 0 → exact gelijke verdeling;
  - bij Tichelmann met gelijke strengen zijn de verdelingen symmetrisch.

**Dynamiek:**

- **(a)** Standaardconfiguratie (gelijkprocentig, Kp 0,6, Ti 900 s):
  - **Verwarmen vanaf 18 °C:** de ruimte is binnen 1,5 uur boven 20,7 °C, met een overshoot ≤ 0,4 K, en zit na 5 uur binnen 21 ± 0,15 °C.
  - **Koelen vanaf 27 °C:** de ruimte is binnen 2,5 uur onder 24,3 °C, met een ondershoot ≤ 0,3 K, en zit na 5 uur binnen 24 ± 0,15 °C.

  Ter referentie: een onafhankelijke simulatie gaf bij verwarmen ca. 1,0 h tot 20,7 °C en een maximum van 21,33 °C, en bij koelen ca. 1,8 h tot 24,3 °C en een minimum van 23,88 °C.
- **(b)** Energiebalans over 6 uur: `∫(P_plafond + P_last + koppeling)dt = Σ C·ΔT` binnen 1 %.
- **(c)** Last > vermogen: de klep blijft op 100 % en de ruimte stabiliseert waar P_plafond = −P_last(T).
- **(d)** Modusomschakeling Type B: het debiet is 0 terwijl θ tussen 30° en 60° ligt.
- **(e)** Type A: het debiet is 0 tijdens de omschakeltijd.

**Meldingen:** voor elk scenario een test op de verwachte ontwerpmeldingen uit §7.8. De test controleert dat de genoemde codes *minimaal* aanwezig zijn; andere meldingen mogen ook voorkomen, behalve bij S1:

| Scenario | Bevat minimaal |
|---|---|
| S1 | geen 🔴/🟠 |
| S2 | W03, W04 |
| S3 | W01, W02, W05 |
| S4 | W03, W08 |
| S5 | W08 |
| S6 | W08 |
| S7 | W06 én (W01 of W03) |
| S8 | W09 |
| S9 | W02 |
| S10 | W12 |

---

## 10. Oplevering

- **README.md** (Nederlands): doel, lokaal starten (`npm i`, `npm run dev`), tests, deploy, hoe je een concept toevoegt.
- **docs/AANNAMES.md**: alle modelaannames en vereenvoudigingen. Minimaal:
  - de karakteristiek en de decompositie in weerstanden;
  - de steekfactoren;
  - Nu in het overgangsgebied;
  - de constante ζ-waarden;
  - Δp_min van de PICV constant genomen;
  - één luchtknoop per zone;
  - de lastmodellen;
  - de paneeltraagheid als eerste-orde systeem;
  - geen leidingverliezen.
- **GitHub Actions-workflow:** lint, test en build bij elke push; deploy naar Pages vanaf `main`.
- `npm run build` zonder fouten of waarschuwingen. ESLint schoon. Alle tests groen.

---

## 11. Acceptatiecriteria

- [ ] Homepage met concepttegels; het klimaatplafond opent, de overige tegels tonen "binnenkort".
- [ ] Alle invoer uit §4 met bereiken, stappen, info-iconen, en geavanceerd paneel met resetknop.
- [ ] Automatische koppeling volgens §5.8, met puzzelmatrix, de drie grafieken en "Toepassen".
- [ ] Handmatige strengen bewerken: toevoegen, verwijderen, panelen ±, extra lengte, volgorde.
- [ ] Netwerkverdeling zonder inregeling, direct retour en Tichelmann, zichtbaar in plattegrond, labels en staafdiagram.
- [ ] Type A en Type B volledig gemodelleerd, inclusief detailweergave, dynamiek, energiemeting en ΔT-manager (B).
- [ ] Klepadvies met "Advies toepassen".
- [ ] Simulatie met Verwarmen / Koelen / Stop / Reset, vier snelheden en vloeiende animatie.
- [ ] Plattegrond met echte meanders, drie kleuroverlays, stromingsdeeltjes op werkelijke snelheid en zoomen/pannen.
- [ ] Alle meldingen uit §6 met "Waarom?" en klik-naar-streng.
- [ ] Dynamiek-grafieken met CSV-export.
- [ ] Uitlegtabblad met formules.
- [ ] Tien scenario's met kaarten en de verwachte meldingen.
- [ ] Deelbare link en printweergave.
- [ ] Alle referentietests uit §9 groen.
- [ ] Geen merknamen in de repository (zoek op de bekende fabrikantnamen en verwijder ze).
- [ ] Werkt in de actuele Chrome, Edge, Firefox en Safari.

---

## 12. Fasering (in deze volgorde, tests na elke fase)

1. **Setup.** Vite, React en TS-project; lint/test-config; registry; homepage; deploy-workflow; `CLAUDE.md` en `docs/`.
2. **Kern.** `water`, `psychro`, `friction`, `heatTransfer` en `network`, met tests.
3. **Klimaatplafondmodel.** Paneel, plafond, streng, zonehydrauliek, kleppen, ontwerp/automatisch koppelen, klepadvies en meldingen, met alle referentietests uit §9.
4. **Simulatie.** Ruimte, regelaar en tijdstap, met de dynamiektests.
5. **UI-basis.** Layout, instellingen, state (Zustand), KPI's en meldingen.
6. **Visualisatie.** Plattegrond (SVG plus canvas-deeltjes), kleptabblad, puzzeltabblad en dynamiekgrafieken.
7. **Uitleg, scenario's, delen en printen.**
8. **Afwerking.** Prestaties (300× vloeiend), toegankelijkheid, responsiviteit, README, AANNAMES en een eindcontrole op de acceptatiecriteria.

Lever na afloop een korte samenvatting op met wat er gebouwd is, eventuele afwijkingen van deze spec, en de open punten.
