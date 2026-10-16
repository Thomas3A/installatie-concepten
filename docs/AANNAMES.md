# Modelaannames en vereenvoudigingen

Dit document beschrijft de aannames achter het rekenmodel. Het model is bedoeld voor uitleg en conceptkeuze,
niet als vervanging van de productberekening van de fabrikant.

## Plafond

- **Karakteristiek en weerstanden.** Het vermogen volgt `q = f_s·K·ΔT^n` per m² actief oppervlak (koelen K = 9,6; n = 1,05;
  verwarmen K = 6,1; n = 1,10). Die karakteristiek geldt bij turbulente proefcondities (Re_ref = 4.000). Het model splitst
  een binnenzijdige weerstand `R_int(Re)` af en houdt `R_ext = R_char − R_int(Re_ref)` constant per ΔT, zodat bij Re = 4.000
  de karakteristiek exact terugkomt en laminaire stroming vermogen kost. De buis→plaat-geleiding (R_cond = 0,010 m²K/W)
  zit in R_ext en wordt alleen gebruikt voor de oppervlaktetemperatuur.
- **Steekfactoren** f_s: 75 mm → 1,05; 100 mm → 1,00; 150 mm → 0,90. Dit zijn aanpasbare, gemiddelde correcties.
- **Nusselt in het overgangsgebied** (2.300 < Re < 10.000): lineaire interpolatie tussen Nu = 3,66 en Gnielinski bij Re = 10.000.
  In werkelijkheid is dit gebied instabiel en afhankelijk van instroomcondities en ruwheid.
- **Segmentering.** Een paneel wordt in `ceil(L_buis/0,25 m)` gelijke segmenten verdeeld; koppelslangen wisselen geen warmte uit.
  Per segment predictor-corrector op de uitlaattemperatuur.
- **Aansluitstukjes** zijn 2 × 0,10 m per paneel en horen bij de buislengte; de bochten zijn halve cirkels met straal s/2.

## Hydrauliek

- **Constante ζ-waarden:** 0,3 per 180°-bocht, 1,0 per koppeling (2 per slang) en 1,0 per T-stuk (2 per streng). In werkelijkheid
  zijn die afhankelijk van Re en uitvoering.
- **Doorgaande T-stukken** op de verdeelleiding worden verwaarloosd; de verdeelleiding krijgt alleen buiswrijving.
- **Aanvoer en retour** van de verdeelleiding gebruiken dezelfde (gemiddelde) watertemperatuur voor de viscositeit.
- **Δp_min van de PICV** wordt constant genomen (onafhankelijk van het ingestelde debiet).
- **Netwerkoplossing:** Newton-Raphson met numerieke Jacobiaan en demping; fallback met successieve onderrelaxatie.
  De viscositeit per streng volgt uit de gemiddelde strengtemperatuur van de vorige iteratie of tijdstap.
- **Circuitkarakteristiek in de simulatie** is een log-log-interpolatietabel op de ontwerptemperaturen; de verdeling over de
  strengen wordt opnieuw opgelost zodra het totaaldebiet > 2 % afwijkt of na 300 s, en daartussen geschaald.
- **Kalibratiefactor netwerk (`netFactor` = 0,75, Geavanceerd → Kalibratie).** De referentiewaarden voor Δp_circuit en de verdeling
  (spec §9: S1 14,9 kPa, S5 32,9 / 58,3 kPa, S6) komen consistent overeen met 0,75 × de losse strengdrukval uit de puzzelmatrix
  (die zelf exact met de referentie klopt). De factor is daarom als expliciete parameter opgenomen. Met `netFactor` = 1,0 is de
  netwerkdrukval fysisch gelijk aan de strengdrukval in de puzzel (S1: Δp_circuit ≈ 19,3 kPa in plaats van 15 kPa); alleen de
  netwerk-gerelateerde uitkomsten (Δp_circuit, verdeling, klepadvies, benodigd Δp) verschuiven dan. De strengdrukval in de
  puzzelmatrix, W01 en de ontwerpdebieten worden niet beïnvloed.

## Ruimte en regeling

- **Eén luchtknoop per zone**; geen aparte massa voor constructie/meubilair. Capaciteit `C = c_eff·A_zone`.
- **Lastmodellen:** verwarmen `P_last = −Q_verlies − H·(T − T_set)` met `H = Q_verlies/(T_set − T_e,ontwerp)` (T_e = −10 °C);
  koelen `P_last = Q_koel − h_k·A·(T − T_set)` met h_k = 1,0 W/(m²K). Bij Stop blijft de laatste modus gelden.
  Zones zijn gekoppeld met H_z = 200 W/K tussen aangrenzende zones.
- **Paneeltraagheid als eerste-orde systeem** `dP/dt = (P_ss − P)/τ` met `τ = f_τ·C_paneel·R_char(8 K) + min(V_water/Q, 300 s)`.
  De kalibratiefactor `tauFactor` (f*τ = 0,5, Geavanceerd → Kalibratie) volgt uit de referentiedynamiek: met f*τ = 1,0 is het
  koelgedrag gelijk aan de referentie, maar verwarmen (hogere lusversterking) is dan zwak gedempt (overshoot ≈ 0,45 K, na 5 uur
  nog ± 0,35 K). Met 0,5 volgt verwarmen vanaf 18 °C de referentie (1,0 h tot 20,7 °C, maximum 21,35 °C).
- **PI-regelaar** op de luchttemperatuur met conditionele integratie (anti-windup): de integrator staat stil zolang de uitgang verzadigd
  is en de fout de verzadiging verder in zou duwen. De integrator wordt op [−1, 2] begrensd.
- **Dauwpunt:** Magnus op het koelsetpoint en de opgegeven RV (de RV is gegeven bij die temperatuur). Zo kan koelen vanaf een warme
  ruimte (27 °C) starten zonder dat de beveiliging de klep blokkeert. Marge 1 K, hysterese 0,5 K.
- **Operatieve temperatuur** is indicatief: `F = 0,35·min(1, bezetting)`; de regelaar gebruikt de luchttemperatuur.
- **Oppervlaktetemperatuur** wordt per segment aan de segmentingang bepaald (het koudste/warmste punt) en volgt de paneeltraagheid
  in de weergave via een eerste-orde filter.

## Kleppen

- **Type B (geen Kvs-keuze):** de klep regelt softwarematig op het gemeten debiet (drukonafhankelijk via meting). Vmax per sequentie
  komt overeen met 100 % opening; de gelijkprocentige karakteristiek `Q/Vmax = exp(n_gl·(h − 1))` koppelt opening en debietfractie
  (de vraag-naar-debiet-karakteristiek `g(u)` is dezelfde functie, dus bij gelijkprocentig geldt h ≈ vraag). θ is snelheidsbegrensd (1°/s);
  in de dode zone (30°–60°) is het debiet 0. Het circuit begrenst het debiet bij het beschikbare Δp; een eigen klepweerstand wordt niet
  gemodelleerd (de klepselectie volgt uit de rekentool van de fabrikant). De ΔT-manager past de limiet met 0,1 % van Vmax per seconde
  aan, begrensd tot 2 %…100 %.
- **Type A:** de PICV regelt het debiet drukonafhankelijk zolang het Δp ≥ Δp_min; daaronder zakt het debiet (`Q_haalbaar`). De 6-weg-klep
  heeft een vaste weerstand (Kvs 2,4 / 4,0 m³/h) die niet door de gebruiker wordt gekozen. Omschakelen: PICV sluit
  (snelheidsbegrensd), 6-weg schakelt 30 s met debiet 0, PICV opent weer.
- **Klepadvies:** alleen voor Type A (PICV-uitvoering, op basis van Vmax en het netwerk bij Vmax). Bij laden van de app of een scenario
  zonder expliciete PICV wordt het advies automatisch toegepast.
- **Vmax afstellen op benodigd vermogen:** Vmax is het kleinste debiet (naar boven afgerond op 1 l/h) waarbij het zonevermogen bij
  ontwerpcondities de last haalt (zonelast = aandeel × koellast of warmteverlies). Het vermogen wordt bepaald met de werkelijke verdeling over
  de strengen (netwerk bij dat debiet, drie iteraties hydrauliek/thermiek, dezelfde berekening als de eindberekening, zodat het vermogen bij het
  gekozen Vmax de last gegarandeerd haalt) en gezocht met regula falsi (Illinois) in log-ruimte. De ondergrens volgt uit de energiebalans:
  V ≥ last/(ρ·cp·|T_aanvoer − T_ruimte|); onder dat debiet haalt het plafond de last nooit. De bovengrens is het maximale plafondvermogen
  (Σ ontwerpdebieten). Is de last groter dan het plafond kan leveren, dan is Vmax dat maximum (W11 meldt het tekort). Vmax hangt dus niet af
  van het ontwerp-ΔT. Gevolg: het debiet per streng daalt, dus Re en v dalen (W03/W04) en ΔT stijgt. Er is geen regelreserve: de last wordt
  precies bij het setpoint gehaald, dus opwarmen of terugkoelen duurt lang (de regelaar blijft op 100 %, I05).
- **Lastaandeel per zone** (bij handmatige lastverdeling) is minimaal 1 %: een zone zonder vloeroppervlak heeft geen warmtecapaciteit.
- **PICV-advies** blijft binnen het gekozen DN: past Vmax in geen enkele PICV van dat DN, dan wordt de best passende van dat DN
  aanbevolen en meldt W13 dat Vmax buiten het instelbereik valt.

## Meldingen

- Strengafhankelijke ontwerpmeldingen (W01, W03–W05, I01, W07, W08) gebruiken de **werkelijke debieten uit het netwerk bij Vmax**
  (niet alleen het ontwerpdebiet), omdat daar de ongelijke verdeling zichtbaar wordt. W08 vergelijkt met het ontwerpdebiet, genormaliseerd
  op Vmax (bij handmatig ingestelde Vmax blijft de vergelijking zinvol).
- W06 gebruikt het kleinste van het ontwerp-ΔT en het ΔT van de gemengde retour bij Vmax.
- Laminaire stroming tijdens bedrijf wordt alleen als badge op de streng getoond, niet als waarschuwing.
- W11 heeft een tolerantie van 0,5 W, omdat bij Vmax op benodigd vermogen het zonevermogen per constructie gelijk is aan de last.
- W12 (Kvs te groot) vervalt, omdat Type B geen Kvs-keuze heeft.

## Overig

- Aanvoer verwarmen is instelbaar tot 45 °C; stofwaarden gelden tot 100 °C. Bij hoge aanvoer geeft W10 een melding bij een gemiddelde plafondtemperatuur > 35 °C.
- Geen leidingverliezen (warmte) en geen glycol; stofwaarden van water van 0–100 °C. Stofwaarden worden in de strenginnerlus uit een tabel
  (stap 0,05 K, lineair geïnterpoleerd) gehaald; de afwijking t.o.v. de formules is < 1e-6 relatief.
- Het ontwerpdebiet wordt met een regula falsi (Illinois-variant) in log-ruimte bepaald in plaats van 60 bisectiestappen; de wortel is
  dezelfde, de rekentijd ~10× korter.

---

# Concept 2: peakshaving

Het rekenmodel staat in `docs/SPEC-peakshaving.md` §5; de Python-referentie `tools/peakshaving_ref/peakshaving_ref.py` is
normatief. De TypeScript-port reproduceert de referentiewaarden binnen de toleranties van spec §9 (in de praktijk
vrijwel exact: de grootste afwijking is de afronding van de referentiewaarden op 3 decimalen).

## Aannames uit de specificatie (§12)

1. **Gebouw** als één thermische knoop (1R1C) met tijdconstante τ; gevelmassa benaderd met een eerste-orde filter op de
   buitentemperatuur (standaard 2 h). Geen aparte zones, geen zonnewinsten (conservatief), interne winsten constant via de
   stookgrens.
2. **Opwarmen** begrensd op opwarmfactor × piekvermogen (orde van de opwarmtoeslag van NEN-EN 12831); geen
   optimum-start-regeling, maar een vaste opstooktijd.
3. **Warmtepompcapaciteit** alleen afhankelijk van de buitentemperatuur (niet van de aanvoertemperatuur); COP via Carnot
   met vast rendement en ontdooifactor; geen cycling, geen minimale modulatie, geen deellastbonus.
4. **Buffer** als ideale energieopslag met vaste nuttige ΔT (laadtemperatuur − ontwerpretour) en stratificatiefactor 0,9;
   stilstandsverlies met UA ∝ V^(2/3); ontladen hydraulisch onbegrensd.
5. **Batterij** exclusief voor de WP-groep; gretig laden onder de budgetlijn; geen degradatie, geen stilstandsverlies, geen
   tariefsturing.
6. **Tapwater** via een boiler met hysterese 50 %/100 %, boiler op 55 °C, 85 % nuttig; vast dagprofiel; geen
   legionellaprogramma.
7. **Aansluitingen** met cos φ = 1; overig gebruik op het piekmoment volledig benut; geen gelijktijdigheidsfactor.
8. **Klimaat:** reconstructie van de NEN 5060:2018-referentiejaren uit KNMI De Bilt-uurdata (maandkeuze op basis van de
   gepubliceerde maandgemiddelden; cross-fade van 16 uur aan maandgrenzen); het jaar begint op maandag; tijd in MET zonder
   zomertijd; schrikkeldag weggelaten; geen correctie voor locatie of klimaatverandering. Herkomst: `docs/klimaat/README.md`.
9. **Perfecte voorspelling** bij de laadstrategie *voorspellend* (de simulatie kent het weer van de komende 24 uur).
10. Rekenresultaten zijn **indicatief** voor conceptkeuze; productselectie altijd met fabrikantdata (capaciteitstabellen,
    geluid, hydrauliek).

## Aanvullende aannames en interpretaties (niet in de specificatie)

### Rekenmodel en invoer

- **Eenheden:** dit concept rekent intern in kW, kWh, °C/K en uren (spec §0.1), anders dan het klimaatplafond (SI).
- **Invoer begrenzen:** ongeldige waarden worden begrensd, niet geweigerd. Aanvullend: het verlaagde setpoint en de
  stookgrens liggen nooit boven het gebruikssetpoint (anders negatieve interne winsten of "opstoken" naar een lager
  setpoint); gebruikstijden en opstooktijd zijn hele uren, met minimaal één gebruiksuur; de boilertemperatuur is begrensd
  op de maximale WP-aanvoer; een handmatig batterijvermogen is begrensd op 0,2–2 C en vervalt (terug naar 0,5 C) als de
  capaciteit 0 is.
- **Piekvermogen wijzigen** (spec §3.5): buffer, batterij én een handmatig WP-vermogen schalen proportioneel mee met het
  (eerst begrensde) nieuwe piekvermogen; daarna worden ze begrensd op de nieuwe bereiken.
- **Vroegtijdig stoppen in bisecties:** bij het dimensioneren, de kleinste aansluiting en de benodigde batterij stopt een
  simulatie zodra de teller (comfortverlies, tapwatertekort, overschrijding) boven de drempel komt. De uitkomst van de toets
  "teller ≤ drempel" is daardoor identiek aan een volledige simulatie, maar de rekentijd is veel korter.
- **Grootverbruik als advies:** past geen standaardaansluiting, dan is het advies grootverbruik met
  ceil(P_net,max / aandeel / 5)·5 kW, met P_net,max uit de simulatie bij de grootste standaardaansluiting (3×80 A, zelfde
  aandeel). Dat is een veilige bovengrens; het advies kan één stap van 5 kW boven het strikt benodigde vermogen liggen.
- **Benodigde batterij voor 0 uur:** is er zonder batterij al geen overschrijding, dan is het advies 0 kWh (geen bisectie).
  Zonder eindig budget wordt geen batterijadvies berekend. De bisectie gebruikt altijd 0,5 C.
- **"Zonder maatregelen"** (KPI-kaarten en advies): buffer 0, batterij 0 en een warmtepomp gedimensioneerd zonder buffer
  (P_th,min(0)), ook als de gebruiker het WP-vermogen handmatig kiest; in de modus "overschrijding tonen".
- **Niet te dimensioneren:** volstaat 3 × het piekvermogen niet, dan rekent de tool bij automatische dimensionering verder
  met 3 × het piekvermogen en toont de rode melding. Let op: bij een kleine woning met tapwater kan dat al optreden
  (tijdens het boilerladen heeft tapwater voorrang), net als bij een opwarmfactor 0 met nachtverlaging.
- **Tegenhanger in de andere modus** (spec §5.8): de kaarten "Piek aan de meter", "Uren overschrijding" en "Comfort bij
  begrenzen" tonen de gekozen modus én, als secundaire regel, de waarde in de andere modus. "Comfort bij begrenzen" komt
  per definitie uit de modus "aansluiting begrenst". In die modus noemt het advies het comfortverlies in plaats van de
  uren overschrijding (die zijn dan per definitie 0).
- **Batterijverlies:** Σ P_bat,in − Σ P_bat,out, gecorrigeerd voor het verschil in lading tussen begin en eind van het jaar
  (de batterij begint vol); zo is het verlies nooit negatief.
- **Robuustheidstabel:** per klimaatjaar twee simulaties met het WP-vermogen vast op de huidige waarde: de uren
  overschrijding komen uit de modus "overschrijding tonen", de uren comfortverlies uit "aansluiting begrenst"; piek aan de
  meter, SCOP en elektriciteit uit de gekozen modus. Is een werkelijk jaar gekozen, dan komt dat als vierde rij erbij.

### Meldingen (spec §6.4)

- **Buffer helpt niet verder:** een verdubbeling van het buffervolume levert minder dan 2 % kleiner WP-vermogen op én
  minder dan een kwart van de winst van het eerste volume (dat sluit kleine buffers uit, waar het effect nog lineair is);
  of de buffer is minstens half V_max en geeft minder dan 2 % winst ten opzichte van geen buffer.
- **De koudste periode** in de uitleg is de langste reeks aaneengesloten dagen met een daggemiddelde onder 0 °C die de
  koude week raakt; is die korter dan 2 dagen, dan de koude week zelf (7 dagen).
- **Koudegolf bepaalt de maat:** bij 99 % van P_th,min valt minstens de helft van de uren met comfortverlies of
  tapwatertekort in de koude week (168 uur, zonder de marge van de grafieken).
- **Batterij raakt leeg / batterijvermogen begrenst:** beoordeeld in de modus "overschrijding tonen" (in "aansluiting
  begrenst" ligt P_net per definitie onder het budget), alleen met een batterij; "leeg" = lading < 0,001 Wh.
- **Tapwater veroorzaakt de piek / bijstook bepaalt de aansluiting:** het uur van de hoogste P_el respectievelijk P_net in
  de modus "overschrijding tonen", omdat in "aansluiting begrenst" veel uren precies op het budget liggen.
- **Comfortverlies bij begrenzen:** rood als het aantal uren meer dan 24 boven het toegestane aantal ligt, anders oranje.
- **Kleine ΔT buffer** wordt ook getoond zonder buffer (het is een ontwerpadvies over de afgiftetemperatuur).
- **Opstookpiek kantoor** alleen bij een opwarmfactor > 0.
