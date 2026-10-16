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
9. **Perfecte voorspelling** bij de laadstrategie _voorspellend_ (de simulatie kent het weer van de komende 24 uur).
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

### Invoer en bediening (UI)

- **Schuifbereik piekvermogen:** het getalveld accepteert 1–2000 kW; de schuif loopt voor een woning van 1 tot 30 kW en
  voor een kantoor van 10 tot 500 kW, zodat de schuif bij gangbare waarden bruikbaar blijft.
- **Gebouwfunctie wisselen** (woning, meerdere woningen of kantoor) laadt alle standaardwaarden van die keuze (spec §3;
  meerdere woningen: zie hieronder); alleen het klimaatjaar blijft.
- **Tapwater aanzetten** zonder boiler (kantoor) vult een boiler van 500 l en 20 kWh/dag in (woning: 200 l en 10 kWh/dag),
  omdat tapwater zonder boiler elk uur een tekort geeft en de warmtepomp dan niet te dimensioneren is.
- **Batterijvermogen** wordt in het expertdeel als C-waarde (0,2–2 C) ingesteld en als kW opgeslagen; bij een andere
  capaciteit blijft de C-waarde gelijk.
- **Klimaatstatistiek in de keuzelijst** komt uit een kleine tabel (`data/climateStats.ts`) die overeenkomt met de meta
  van de JSON-bestanden (gecontroleerd door een test); zo laadt de pagina de uurdata alleen in de Web Worker.
- **Rekenmotor:** een module-Web Worker (`model/worker.ts`) met verzoeken per id; zonder Worker (tests) draait dezelfde
  motor in de hoofdthread. Herberekenen gebeurt 250 ms na de laatste wijziging; het gevoeligheidsraster alleen als dat
  tabblad open is, met een cache op de invoer waarvan het raster afhangt (dus niet op buffer, batterij en WP-vermogen).
- **Deelbare link:** `#/peakshaving?c=…` bevat alleen de afwijkingen van de standaard van de gekozen gebouwfunctie, plus
  een versienummer (`v: 1`). Een link met een nieuwer versienummer wordt geweigerd; onzinwaarden worden begrensd.
- **Footer:** de klimaatzin van spec §0.1 staat alleen op de pagina's van dit concept (veld `disclaimer` in de registry).

### Grafieken

- **Koude week:** uurwaarden staan als punt op het begin van het uur (x = t ↔ "t:00"); arcering van weekend,
  gebruikstijd, opstookuren, comfortverlies en overschrijding beslaat het interval [t, t+1). In het warmtepaneel zijn WP
  direct, buffer ontladen, bijstook en boiler laden in die volgorde gestapeld; de lijn "Gevraagd" (Q_req) betreft alleen
  ruimteverwarming en hoort dus bij de bovenkant van de laag bijstook. Omdat het overschrijdingsvlak bij een venster van 9
  dagen vaak maar enkele pixels breed is, krijgt elk overschrijdingsuur ook een rood streepje onderaan. Laadtoestand buffer
  = SoC / nuttige inhoud, batterij = SoC / (capaciteit × 0,9); reeksen zonder opslag vervallen.
- **Scrubber:** "Terug naar koude week" zet de zoom terug; "Naar piekuur" zet het gekozen uur terug op het uur met de
  hoogste P_net in de koude week. Afspelen vanaf het laatste uur begint opnieuw aan het begin van het venster; een klik
  direct na slepen (inzoomen) kiest geen uur.
- **Jaar:** de x-as van de duurkrommen is het rangnummer van het uur (1 = hoogste uur), standaard logaritmisch omdat de
  beslissende piekuren de eerste paar honderd zijn. Als referentie worden de direct kleinere en de direct grotere
  standaardaansluiting getoond (zelfde aandeel); "uur erboven" telt uren met P > P_limiet + 1e-6 kW, net als de simulatie.
  De lijnen in de thermische duurkromme zijn het WP-vermogen bij −10 °C (nominaal × capaciteitsfactor) met en zonder
  buffer. De maandbalans toont elektriciteit inclusief bijstook; maanden zonder elektriciteitsgebruik hebben geen SCOP.
- **Gevoeligheid:** beide y-assen krijgen een eigen band van de grafiekhoogte (elektrisch onder, thermisch boven) zodat de
  lijnen elkaar niet bedekken; de assen beginnen daardoor niet altijd bij 0. Referentielijnen worden getekend voor de
  standaardaansluitingen in het relevante bereik, de huidige aansluiting en elke aansluiting met een overgangsstip. Een
  aansluiting is "toereikend" in een punt als de kleinste passende aansluiting van die cel (met de toegestane
  overschrijdingsuren) niet groter is; de stip staat op het eerste buffervolume V > 0 vanaf waar dat zo blijft, alleen voor
  aansluitingen die bij V = 0 nog niet toereikend waren. Klikken zet het buffervolume (afgerond op de schuifstap); in de
  tabel is per punt een knop "kies" als toetsenbordalternatief.

### Conceptschema (tab Concept)

- **Gekozen uur:** standaard het uur met de hoogste P_net in de koude week zelf (168 uur); bij gelijke P_net (een
  batterij die precies op het budget afschaaft) het uur met de hoogste P_el. Scrubber en schema gebruiken hetzelfde uur.
- **Meterkastbalk** is gestapeld: links het overige gebruik (grijs, (1 − aandeel)·P_aansluiting), daarna de WP-groep, zodat
  het WP-budget precies op het einde van de aansluiting eindigt. Een overschrijding (rood, P_net − P_limiet) steekt buiten
  de balk uit. Bij ontladen loopt blauw tot P_net en een smaller groen deel van P_net tot P_el; bij laden loopt blauw tot
  P_el en oranje van P_el tot P_net. Is het overige gebruik groter dan 2 × het bereik van de WP-groep in het venster, dan
  wordt het ingekort (25 % van de balk, met breukteken); de WP-groep blijft lineair.
- **Buffervat en boiler** worden gelaagd getekend: warm water bovenin tot de laadtoestand, met een korte spronglaag,
  daaronder water op retourtemperatuur.
- **Kleur van de buitenunit:** interpolatie tussen koud en warm op de aanvoertemperatuur van de stooklijn (25–55 °C);
  stilstaande compressor = neutraal grijs. Boiler- en bufferladen staan als extra regel met hun laadtemperatuur.
- **COP in het schema:** Q_wp / P_el,WP als de compressor draait (ook bij boiler- en bufferbedrijf); anders "COP –".
- **Waterzijdig schema:** boiler en buffervat parallel tussen aanvoer- en retourverzamelleiding (buitenunit → boiler →
  buffer → gebouw); het bijstookelement in de aanvoer in het gebouw, alleen getekend als het is ingesteld.
- **Stromen:** de deeltjessnelheid is evenredig met het thermische (leidingen) of elektrische (kabels) vermogen,
  genormaliseerd op het grootste vermogen in het venster; onder 0,005 kW staat een stroom stil. De ventilator draait in
  vijf snelheden naar Q_wp. Bij bewegingsarme weergave en bij afdrukken beweegt niets en tonen pijltjes de richting.
- Onder ongeveer 620 px breedte scrolt het schema binnen zijn kader; de pagina zelf scrolt niet horizontaal.

### Uitleg en printen

- **Printweergave** (spec §2.2): A4 staand, twee pagina's. Pagina 1: invoersamenvatting, KPI-kaarten, advies en
  robuustheidstabel; pagina 2: de koude week (panelen warmte en elektrisch; het toestandspaneel en de scrubber vallen weg)
  en de gevoeligheidsgrafiek. Meldingen, invoerblokken en tabbladen worden niet geprint. De knop "Print / PDF" rekent zo
  nodig eerst het gevoeligheidsraster uit en bouwt de grafieken buiten beeld op de printbreedte op; daarna opent het
  printvenster. Printen met Ctrl+P geeft dezelfde eerste pagina, maar zonder de grafieken.
- **Uitleg-tab:** de teksten staan in `texts.ts` (sectie per onderwerp van spec §11, één of meer formules per sectie,
  KaTeX); **vet** en _cursief_ worden in de gedeelde `MathText` alleen opgemaakt waar dat expliciet is aangezet.

### Na de eindreview

- **Werkelijke klimaatjaren** (1991–2025) worden in de browser met `fetch` als los JSON-bestand geladen in plaats van met
  een dynamische `import()`: een mislukte `import()` onthoudt de browser tot de pagina herlaadt, een mislukte `fetch`
  wordt bij het volgende verzoek opnieuw geprobeerd. Valt de Web Worker uit, dan rekent de pagina verder in de
  hoofdthread en worden de openstaande berekeningen daar opnieuw gestart. Bij een rekenfout staat naast de melding een
  knop "Opnieuw proberen"; de melding noemt voor welk jaar of welke invoer de getoonde resultaten nog gelden (de
  resultaten worden niet gedimd, omdat het contrast dan onder AA zakt).
- **Gevoeligheidsraster:** hangt niet af van de bedrijfsmodus (het rekent altijd in "overschrijding tonen") en bij een
  standaardaansluiting niet van het gecontracteerd vermogen; die tellen niet mee in de cachesleutel. Tijdens een
  herberekening blijft het vorige volledige raster gedimd staan tot de eerste nieuwe rij er is. De overgangen
  ("aansluiting toereikend vanaf …") staan ook als tekst onder de grafiek, omdat labels bij de stippen op een smalle
  grafiek kunnen wegvallen. Een budgetlijn hoger dan 2 × de hoogste kromme rekt de as niet op, maar staat als label met ↑
  aan de bovenrand (Gevoeligheid en Jaar).
- **Printen** wacht op het gevoeligheidsraster, maar niet eindeloos: eindigt het raster in een fout of komt er 20 s geen
  voortgang, dan wordt zonder raster geprint met een korte notitie. In de printversie vervallen de uitleesregel en de lange
  toelichting van de gevoeligheidsgrafiek; grafieken schalen mee naar de paginabreedte.
- **Deelbare link:** een link waarvan de invoer precies gelijk is aan een scenario toont dat scenario. Na het openen haalt
  de pagina `?c=` uit de adresbalk; herladen daarna geeft de standaardinvoer (de invoer wordt niet in de browser bewaard).
- **Getallen:** negatieve getallen krijgen het echte minteken (U+2212) via `fmt()` (ook in concept 1); een waarde die op
  nul afrondt, wordt zonder teken getoond. Invoervelden lezen komma of punt als decimaalteken, "1.234" (groepen van drie)
  als duizendtal en −, – of - als minteken; lege of ongeldige tekst zet de vorige waarde terug.
- **Koude week:** het venster is te verschuiven met "◀ 1 dag" / "1 dag ▶" en met Shift + scrollwiel, binnen het hele
  jaar; een klik kiest een uur binnen de koude week ± 1 dag (het bereik van de scrubber). De tellingen in de legenda gelden
  voor de koude week ± 1 dag.
- **Smalle grafieken** (container < 560 px) krijgen smalle y-assen zonder gedraaide astitels; de astitels staan dan boven
  de grafiek. De **PNG-export** bevat een titelregel (grafiek, klimaatjaar, bij de koude week de periode), de grafiek zoals
  die in beeld is en de zichtbare legenda.
- **Robuustheidstabel:** korte koppen "Overschrijding [uur/jaar]" (zonder begrenzer) en "Comfortverlies [uur/jaar]" (als
  de aansluiting begrenst); de toelichting staat boven de tabel.
- **Indeling:** tussen 640 en 1023 px staan de vier invoerblokken in twee kolommen boven het resultaat. Onder de kop staat
  de statistiek van het gekozen klimaatjaar, omdat browsers de tooltips op opties van een keuzelijst niet tonen.
- **Toegankelijkheid:** horizontaal scrollende gebieden (tabel, schema, formules) zijn benoemd en met het toetsenbord
  bereikbaar zodra ze scrollen; legenda-knoppen zijn minstens 24 px hoog (WCAG 2.5.8); de pagina's van beide concepten
  staan in één `main`-landmark.
- **Uitleg:** sectie 1 telt de uren (h_overschr, h_comfort), sectie 9 toont de 1R1C-balans; elke sectie heeft een formule.

### Meerdere woningen (buiten de spec)

De spec kent één woning of een kantoor. Daarnaast is er de keuze **meerdere woningen op één warmtepomp**: een
woongebouw (of een rij woningen) met één collectieve warmtepomp, collectief boilervat en eventueel buffer en batterij.

- **Rekenen met totalen:** het rekenmodel (de port van de Python-referentie) is niet gewijzigd. Het rekent met de totalen
  van het gebouw: piekvermogen, tapwaterbehoefte per dag en boilervat gelden voor alle woningen samen. Het aantal woningen
  (`building.dwellings`) dient alleen voor de invoer en de weergave; een waarde per woning is het totaal gedeeld door het
  aantal. Een gebouw van n woningen rekent dus precies als één gebouw met dezelfde totalen (gecontroleerd door een test).
  Alle woningen volgen samen één thermische knoop met dezelfde setpoints, tijdconstante en stookgrens.
- **Geen gelijktijdigheidsfactor op de verwarming:** het piekvermogen is de som van de ontwerpverliezen. Bij −10 °C hebben
  alle woningen tegelijk hun ontwerpverlies, dus het totaal wordt niet verlaagd. Ook de opwarmfactor geldt voor het
  totaal.
- **Tapwater:** het aantal woningen × de behoefte per woning, met hetzelfde gemiddelde uurprofiel (spec §5.7) en één
  collectief boilervat (85 % benutbaar, dezelfde hysterese en boilertemperatuur). Er is geen extra spreiding door
  gelijktijdigheid (de dagbehoefte per woning wordt bij veel woningen niet verlaagd); dat is voor de pieken aan de veilige
  kant. Circulatieverlies van een collectief tapwatersysteem zit er niet in; wie dat wil meenemen, verhoogt de
  tapwaterbehoefte per woning.
- **Standaardwaarden:** 10 woningen × 5 kW (appartement na isolatie), per woning 10 kWh/dag tapwater en 200 l boilervat
  (gelijk aan de woningstandaard), samen dus 50 kW, 100 kWh/dag en 2000 l. De collectieve installatie heeft een eigen
  aansluiting van 3×40 A, waarvan 80 % voor warmtepomp + batterij; de rest is voor pompen, ventilatie en algemene
  ruimten. De woningen hebben elk een eigen aansluiting die hier niet meetelt. Alle overige waarden zijn die van de
  woning (spec §3), klimaatjaar T5.
- **Waarom 3×40 A en 80 %:** zo laat het standaardgeval, net als bij de ene woning, de rol van buffer en batterij zien
  (T5): zonder maatregelen wordt de warmtepomp 89,1 kW, is de piek aan de meter 29,7 kW tegen een budget van 22,2 kW,
  zijn er 215 uur overschrijding en is 3×63 A de kleinste passende aansluiting. Met 1 m³ buffer blijven er 47 uur over
  (kleinste 3×50 A); met 2 m³ buffer wordt de warmtepomp 64,6 kW en past het gebouw met 0 uur binnen 3×40 A; met 2 m³
  buffer en 20 kWh batterij kan het naar 3×35 A.
- **Aantal woningen wijzigen:** het gebouw groeit met dezelfde woningen mee. Piekvermogen, tapwaterbehoefte en boilervat
  schalen met nieuw/oud aantal, en via het piekvermogen (zie "Piekvermogen wijzigen") ook buffer, batterij (capaciteit en
  een handmatig vermogen) en een handmatig WP-vermogen; de waarden per woning blijven zo gelijk. De aansluiting blijft
  staan: die is een keuze van de gebruiker. Komt het piekvermogen boven 2000 kW, dan stopt het daar (en schalen buffer en
  batterij met de begrensde factor), terwijl het tapwater wel doorschaalt.
- **Piekvermogen wijzigen** bij meerdere woningen verandert het vermogen per woning; het aantal woningen blijft.
- **Bereiken:** 1–500 woningen (geheel getal; een kantoor is altijd 1). Tapwaterbehoefte en boilervat zijn begrensd op
  het bereik per woning × het aantal (0–50 kWh/dag en 0–2000 l per woning). Het piekvermogen blijft 1–2000 kW in totaal;
  de bereiken van buffer, batterij en WP-vermogen volgen zoals altijd uit het totale piekvermogen. Een gebouw met 1 woning
  is weer de keuze "woning". Tapwater aanzetten zonder boiler vult 200 l en 10 kWh/dag per woning in.
- **Hint bij één woning:** boven 20 kW piekvermogen toont de keuze "woning" de hint "Groot voor één woning" met de
  verwijzing naar meerdere woningen. Het is alleen een wegwijzer; de invoer wordt niet begrensd.
- **Deelbare link:** het aantal woningen staat in de link als afwijking van de woningstandaard (één woning); het
  versienummer blijft 1. Een oudere link zonder aantal woningen opent als één woning.
- **Scenario's:** naast de acht van spec §10 zijn er twee met meerdere woningen: "10 woningen op één warmtepomp — 50 kW,
  3×40 A, zonder maatregelen" en "… met 2 m³ buffer". Ze staan in de lijst direct na de vier woningscenario's (nummers 5
  en 6; de kantoorscenario's worden 7–10).
