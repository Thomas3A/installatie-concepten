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
5. **Batterij** exclusief voor de WP-groep; gretig laden onder de WP-limiet; geen degradatie, geen stilstandsverlies, geen
   tariefsturing.
6. **Tapwater** via een boiler met hysterese 50 %/100 %, boiler op 55 °C, 85 % nuttig; vast dagprofiel; geen
   legionellaprogramma.
7. **Aansluitingen** met cos φ = 1; overig gebruik op het piekmoment volledig benut; geen gelijktijdigheidsfactor.
8. **Klimaat:** reconstructie van de NEN 5060:2018-referentiejaren uit KNMI De Bilt-uurdata (maandkeuze op basis van de
   gepubliceerde maandgemiddelden; cross-fade van 16 uur aan maandgrenzen); stresstestjaren = T1 met het werkelijke
   stookseizoen nov–mrt van 1978/79 resp. 1962/63; het jaar begint op maandag; tijd in MET zonder zomertijd;
   schrikkeldag weggelaten; geen correctie voor locatie of klimaatverandering. De herhalingstijden van de stresstestjaren
   (≈ 1× per 25 jaar, ≈ 1× per eeuw) zijn empirisch geteld in 1951–2025; door de opwarming zijn ze in het huidige klimaat
   eerder langer. Herkomst: `docs/klimaat/README.md`.
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
  Zonder eindige WP-limiet wordt geen batterijadvies berekend. De bisectie gebruikt altijd 0,5 C.
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
  meter, SCOP en elektriciteit uit de gekozen modus. Vijf rijen (energie, T5, T1, winter 1978/79, winter 1962/63); is
  een werkelijk jaar gekozen, dan komt dat als zesde rij erbij.

### Meldingen (spec §6.4)

- **Buffer helpt niet verder:** een verdubbeling van het buffervolume levert minder dan 2 % kleiner WP-vermogen op én
  minder dan een kwart van de winst van het eerste volume (dat sluit kleine buffers uit, waar het effect nog lineair is);
  of de buffer is minstens half V_max en geeft minder dan 2 % winst ten opzichte van geen buffer.
- **De koudste periode** in de uitleg is de langste reeks aaneengesloten dagen met een daggemiddelde onder 0 °C die de
  koude week raakt; is die korter dan 2 dagen, dan de koude week zelf (7 dagen). Net als de koude week mag de reeks over
  de jaargrens lopen (december → januari); voor energie, T5 en T1 verandert de uitkomst daardoor niet.
- **Koudegolf bepaalt de maat:** bij 99 % van P_th,min valt minstens de helft van de uren met comfortverlies of
  tapwatertekort in de koude week (168 uur, zonder de marge van de grafieken).
- **Batterij raakt leeg / batterijvermogen begrenst:** beoordeeld in de modus "overschrijding tonen" (in "aansluiting
  begrenst" ligt P_net per definitie onder de limiet), alleen met een batterij; "leeg" = lading < 0,001 Wh.
- **Tapwater veroorzaakt de piek / bijstook bepaalt de aansluiting:** het uur van de hoogste P_el respectievelijk P_net in
  de modus "overschrijding tonen", omdat in "aansluiting begrenst" veel uren precies op de limiet liggen.
- **Comfortverlies bij begrenzen:** rood als het aantal uren meer dan 24 boven het toegestane aantal ligt, anders oranje.
- **Kleine ΔT buffer** wordt ook getoond zonder buffer (het is een ontwerpadvies over de afgiftetemperatuur).
- **Opstookpiek kantoor** alleen bij een opwarmfactor > 0.

### Invoer en bediening (UI)

- **Schuifbereik piekvermogen:** het getalveld accepteert 1–2000 kW; de schuif loopt voor een woning van 1 tot 30 kW,
  voor een kantoor van 10 tot 500 kW en bij meerdere woningen (n woningen, totaal) van 5 kW tot max(500, ⌈n/10⌉·100) kW
  (ten hoogste 2000 kW), stap 1 kW, zodat de schuif bij gangbare waarden bruikbaar blijft.
- **Gebouwfunctie wisselen** (woning, meerdere woningen of kantoor) laadt alle standaardwaarden van die keuze (spec §3;
  meerdere woningen: zie hieronder); alleen het klimaatjaar en de bedrijfsmodus (een weergavekeuze) blijven.
- **Tapwater aanzetten** zonder boiler (kantoor) vult een boiler van 500 l en 20 kWh/dag in (woning: 200 l en 10 kWh/dag),
  omdat tapwater zonder boiler elk uur een tekort geeft en de warmtepomp dan niet te dimensioneren is.
- **Batterijvermogen** wordt onder Wat als? › Verfijnen als C-waarde (0,2–2 C) ingesteld en als kW opgeslagen; bij een
  andere capaciteit blijft de C-waarde gelijk.
- **Klimaatstatistiek in de keuzelijst** komt uit een kleine tabel (`data/climateStats.ts`) die overeenkomt met de meta
  van de JSON-bestanden (gecontroleerd door een test); zo laadt de pagina de uurdata alleen in de Web Worker.
- **Rekenmotor:** een module-Web Worker (`model/worker.ts`) met verzoeken per id; zonder Worker (tests) draait dezelfde
  motor in de hoofdthread. Herberekenen gebeurt 250 ms na de laatste wijziging; het gevoeligheidsraster rekent na elke
  doorrekening mee (zie "Schermopbouw (werkbank)"), met een cache op de invoer waarvan het raster afhangt (dus niet op
  buffer, batterij en WP-vermogen).
- **Deelbare link:** `#/peakshaving?c=…` bevat alleen de afwijkingen van de standaard van de gebouwfunctie (woning of
  kantoor; bij meerdere woningen de woningstandaard, zie "Meerdere woningen"), plus een versienummer (`v: 2`). Een link met een nieuwer versienummer wordt geweigerd; onzinwaarden worden begrensd.
  Versie 2 hoort bij het standaardklimaatjaar T1; een link van versie 1 (of zonder versie) zonder klimaatjaar bedoelde
  de toenmalige standaard en opent dus in T5.
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
  Bij die andere aansluitingen zijn de uren geteld in de getoonde doorrekening (buffer, batterij en boiler laden tegen de
  huidige limiet) en staat er "≈": het oordeel rekent een andere aansluiting opnieuw door en kan een uur verschillen
  (1×25 A: "≈ 299 uur" in de legenda, 298 uur in het oordeel). De lijnen in de thermische duurkromme zijn het WP-vermogen
  bij −10 °C (nominaal × capaciteitsfactor) met en zonder buffer; het korte label op de lijn zegt "WP bij −10 °C" (en
  "gekozen WP bij −10 °C"), zodat het niet botst met het nominale vermogen in de tegel Warmtepomp. De maandbalans toont
  elektriciteit inclusief bijstook; maanden zonder elektriciteitsgebruik hebben geen SCOP.
- **Gevoeligheid:** beide y-assen krijgen een eigen band van de grafiekhoogte (elektrisch onder, thermisch boven) zodat de
  lijnen elkaar niet bedekken; de assen beginnen daardoor niet altijd bij 0. Referentielijnen worden getekend voor de
  standaardaansluitingen in het relevante bereik, de huidige aansluiting en elke aansluiting met een overgangsstip. Een
  aansluiting is "toereikend" in een punt als de kleinste passende aansluiting van die cel (met de toegestane
  overschrijdingsuren) niet groter is; de stip staat op het eerste buffervolume V > 0 vanaf waar dat zo blijft, alleen voor
  aansluitingen die bij V = 0 nog niet toereikend waren. Klikken zet het buffervolume (afgerond op de schuifstap); in de
  tabel is per punt een knop "kies" als toetsenbordalternatief.

### Conceptschema (tab Concept)

- **Gekozen uur:** standaard het uur met de hoogste P_net in de koude week zelf (168 uur); bij gelijke P_net (een
  batterij die precies op de limiet afschaaft) het uur met de hoogste P_el. Scrubber en schema gebruiken hetzelfde uur.
- **Meterkastbalk** is gestapeld: links het overige gebruik (grijs, (1 − aandeel)·P_aansluiting), daarna de WP-groep, zodat
  de WP-limiet precies op het einde van de aansluiting eindigt. Een overschrijding (rood, P_net − P_limiet) steekt buiten
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

- **Printweergave** (spec §2.2): A4 staand, twee pagina's. Pagina 1: invoersamenvatting, het oordeel, advies,
  KPI-kaarten en robuustheidstabel; pagina 2: de koude week (panelen warmte en elektrisch; het toestandspaneel en de
  scrubber vallen weg) en de gevoeligheidsgrafiek. Basis, Wat als?, Opvallend, Verdieping, knoppen en meldingen worden
  niet geprint. De knop "Print / PDF" rekent zo
  nodig eerst het gevoeligheidsraster uit en bouwt de grafieken buiten beeld op de printbreedte op; daarna opent het
  printvenster. Printen met Ctrl+P geeft dezelfde eerste pagina, maar zonder de grafieken.
- **Uitleg-tab:** de teksten staan in `texts.ts` (sectie per onderwerp van spec §11, één of meer formules per sectie,
  KaTeX); **vet** en _cursief_ worden in de gedeelde `MathText` alleen opgemaakt waar dat expliciet is aangezet.

### Na de eindreview

- **Werkelijke klimaatjaren** (1951–2025, 2,3 MB) worden in de browser met `fetch` als los JSON-bestand geladen in plaats van met
  een dynamische `import()`: een mislukte `import()` onthoudt de browser tot de pagina herlaadt, een mislukte `fetch`
  wordt bij het volgende verzoek opnieuw geprobeerd. Valt de Web Worker uit, dan rekent de pagina verder in de
  hoofdthread en worden de openstaande berekeningen daar opnieuw gestart. Bij een rekenfout staat naast de melding een
  knop "Opnieuw proberen"; de melding noemt voor welk jaar of welke invoer de getoonde resultaten nog gelden (de
  resultaten worden niet gedimd, omdat het contrast dan onder AA zakt).
- **Gevoeligheidsraster:** hangt niet af van de bedrijfsmodus (het rekent altijd in "overschrijding tonen") en bij een
  standaardaansluiting niet van het gecontracteerd vermogen; die tellen niet mee in de cachesleutel. Tijdens een
  herberekening blijft het vorige volledige raster gedimd staan tot de eerste nieuwe rij er is. De overgangen
  ("aansluiting toereikend vanaf …") staan ook als tekst onder de grafiek, omdat labels bij de stippen op een smalle
  grafiek kunnen wegvallen. Een limietlijn hoger dan 2 × de hoogste kromme rekt de as niet op, maar staat als label met ↑
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
- **Indeling:** vervangen door de werkbank (zie "Schermopbouw (werkbank)"). De statistiek van het gekozen klimaatjaar
  staat onder de keuzelijst in Meer instellingen › Klimaat, omdat browsers de tooltips op opties van een keuzelijst niet
  tonen.
- **Toegankelijkheid:** horizontaal scrollende gebieden (tabel, schema, formules) zijn benoemd en met het toetsenbord
  bereikbaar zodra ze scrollen; legenda-knoppen zijn minstens 24 px hoog (WCAG 2.5.8); de pagina's van beide concepten
  staan in één `main`-landmark.
- **Uitleg:** sectie 1 telt de uren (h_overschr, h_comfort), sectie 9 toont de 1R1C-balans; elke sectie heeft een formule.

### Klimaatjaren 1951–2025 en stresstestjaren

- **Koude week en venster over de jaargrens** (spec §4.4): de zoektocht naar de koude week is cyclisch, en het venster
  van de grafieken (koude week ± 24 uur) dan ook: altijd 216 uur, ook als de marge vóór 1 januari begint (T1: de week
  begint op uur 4, het venster op 31 december 04:00). Venster, gekozen uur van de scrubber en het standaarduur zijn
  doorlopende uren (negatief = december, ≥ 8760 = januari); de waarden staan in de jaarreeksen op `wrapHour(t)`. De as
  van de koude-weekgrafieken is het jaar, zo nodig verlengd met de uren van het venster buiten het jaar: december vóór
  1 januari geplakt of januari na 31 december. Bij een jaar van 365 dagen dat op maandag begint, volgt op maandag
  31 december weer maandag 1 januari; zo rekent de cyclische simulatie ook (kantoorschema).
- **Statistiek van de klimaatjaren** (T min, koudste 24/72/168 uur, enzovoort) gebruikt cyclische lopende gemiddelden,
  zoals `scripts/klimaat/build_reference_years.py`. Daardoor verandert alleen de koudste week van 2008 (−2,5 in plaats van
  −2,2 °C, over de jaargrens) en begint de koudste week van winter1979 op uur 8736.
- **Spectabel §4.2:** de koudste 24 uur van winter1979 staat er als −12,5 °C; de meta zegt −12,45 (exact −12,446), dus
  dubbel afgerond. De test gebruikt −12,45.
- **Namen:** in tabellen, de strook en de statistiekregel heten de stresstestjaren "winter 1978/79" en "winter 1962/63",
  in een zin "de winter 1978/79". De aanbevolen stresstestjaren (★) staan als constante in `model/climate.ts`, omdat de
  pagina het bestand met de werkelijke jaren pas laadt als er een gekozen wordt; een test controleert dat ze gelijk zijn
  aan `meta.aanbevolen_stresstest`.
- **Voorbeeld 8** heet nu `kantoor-winter1979` (was `kantoor-t1`). Deelbare links vergelijken de invoer, niet het id, en
  blijven dus werken.
- **Standaardklimaatjaar T1** (spec §4.3, was T5), ook voor meerdere woningen en een ongeldig klimaatjaar in een link.
  De voorbeelden bouwen op de standaardinvoer en rekenen dus in T1, de startpagina (voorbeeld 1) ook. Hun configuratie
  volgt spec §10 ongewijzigd; de beschrijvingen zijn op de T1-uitkomsten herschreven, want in T1 halen vijf voorbeelden
  hun T5-belofte niet meer (bijvoorbeeld kantoor met 20 m³ buffer: 41 uur boven 3×80 A bij 50 %, zelfs met 40 m³ nog
  30 uur). De orde van grootte van spec §9.6 (T5) wordt per voorbeeld apart getest.
- **Geverifieerde uitkomsten van het UX-plan** (§4.5, "Strenge winter (T1): 111 uur …" enzovoort) zijn in T5
  doorgerekend. De tests die de oordeel-, hendel- en rasterlogica met die uitkomsten controleren, zetten het klimaatjaar
  daarom expliciet op T5; alleen de stresstestregel noemt nu de getallen van 1978/79.

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
- **Standaardwaarden:** 10 woningen × 5 kW (appartement na isolatie), per woning 6 kWh/dag tapwater en 120 l boilervat,
  samen dus 50 kW, 60 kWh/dag en 1200 l. Een appartement gebruikt minder tapwater dan de woningstandaard van spec §3
  (10 kWh/dag, 200 l); 120 l per woning geeft dezelfde voorraad in dagen (nuttig 5,3 kWh ≈ 0,9 dag). Met 10 kWh/dag per woning
  zou het tapwater de warmtepomp domineren (89 kW voor 50 kW piekvermogen). De collectieve installatie heeft een eigen
  aansluiting van 3×35 A, waarvan 80 % voor warmtepomp + batterij; de rest is voor pompen, ventilatie en algemene
  ruimten. De woningen hebben elk een eigen aansluiting die hier niet meetelt. Alle overige waarden zijn die van de
  woning (spec §3), klimaatjaar T1 (de standaard, spec §4.3).
- **Waarom 3×35 A en 80 %** (gekozen toen T5 de standaard was): zo laat het standaardgeval, net als bij de ene woning,
  de rol van de buffer zien (T5):
  zonder maatregelen wordt de warmtepomp 65,8 kW, is de piek aan de meter 21,6 kW tegen een WP-limiet van 19,4 kW, zijn er
  121 uur overschrijding en is 3×40 A de kleinste passende aansluiting. Met 1 m³ buffer wordt de warmtepomp 63,6 kW en
  blijft de piek aan de meter met 0 uur binnen 3×35 A. Alle 121 uren zonder maatregelen zijn uren waarin de
  boiler wordt bijgeladen ('s ochtends om 8 en 's avonds om 19 uur). Met 2 m³ buffer is er weer 1 uur overschrijding: de
  warmtepomp wordt dan kleiner gedimensioneerd (61,2 kW) en bij het bijladen van de boiler op een koude avond raakt de
  buffer net leeg (19,5 kW tegen 19,4 kW); met 20 kWh batterij erbij is het weer 0 uur. In T1 wordt de warmtepomp zonder
  maatregelen zo'n 80 kW (160 uur boven de limiet, 3×50 A) en met 1 m³ buffer 75 kW (15 uur, 3×40 A).
- **Aantal woningen wijzigen:** het gebouw groeit met dezelfde woningen mee. Piekvermogen, tapwaterbehoefte en boilervat
  schalen met nieuw/oud aantal, en via het piekvermogen (zie "Piekvermogen wijzigen") ook buffer, batterij (capaciteit en
  een handmatig vermogen) en een handmatig WP-vermogen; de waarden per woning blijven zo gelijk. De aansluiting blijft
  staan: die is een keuze van de gebruiker. Komt het piekvermogen boven 2000 kW, dan stopt het daar (en schalen buffer en
  batterij met de begrensde factor), terwijl het tapwater wel doorschaalt; de toelichting bij "Aantal woningen" noemt
  deze grens.
- **Piekvermogen wijzigen** bij meerdere woningen verandert het vermogen per woning; het aantal woningen blijft.
- **Bereiken:** 1–500 woningen (geheel getal; een kantoor is altijd 1). Ontbreken tapwaterbehoefte of boilervat in de
  invoer, dan geldt de standaard per woning (bij meerdere woningen 6 kWh/dag en 120 l) × het aantal. Tapwaterbehoefte en boilervat zijn begrensd op
  het bereik per woning × het aantal (0–50 kWh/dag en 0–2000 l per woning). Het piekvermogen blijft 1–2000 kW in totaal;
  de bereiken van buffer, batterij en WP-vermogen volgen zoals altijd uit het totale piekvermogen. Een gebouw met 1 woning
  is weer de keuze "woning". In de invoer loopt het aantal woningen van 2 tot 500 (schuif 2–100; een lager getal wordt 2);
  terug naar één woning gaat via de keuze "Woning". Tapwater aanzetten zonder boiler vult 120 l en 6 kWh/dag per woning
  in (bij één woning 200 l en 10 kWh/dag).
- **Hint bij één woning:** boven 20 kW piekvermogen toont de keuze "woning" de hint "Groot voor één woning" met de
  verwijzing naar meerdere woningen. Het is alleen een wegwijzer; de invoer wordt niet begrensd.
- **Deelbare link:** het aantal woningen staat in de link als afwijking van de woningstandaard (één woning); het
  versienummer bleef daarvoor 1 (sinds de klimaatupdate 2, zie "Deelbare link"). Een oudere link zonder aantal woningen
  opent als één woning.
- **Scenario's:** naast de acht van spec §10 zijn er twee met meerdere woningen: "10 woningen op één warmtepomp — 50 kW,
  3×35 A, zonder maatregelen" en "… met 1 m³ buffer". Ze staan in de lijst direct na de vier woningscenario's (nummers 5
  en 6; de kantoorscenario's worden 7–10).

### Schermopbouw (werkbank)

De pagina volgt `docs/UX-PLAN-peakshaving.md`: één pagina met Basis (invoer) bovenaan, daaronder Resultaat en Wat als?
naast elkaar (de werkbank) en daaronder Verdieping. Dit wijkt af van spec §2.2 (twee kolommen met vier invoerblokken en
Expert-delen). Waar dit hoofdstuk en eerdere punten verschillen, geldt dit hoofdstuk.

**Alleen pc of laptop.** De tool is ontworpen, afgesteld en gemeten voor een browser vanaf 1024 px breed (gemeten op
1280×800, 1440×900 en 1920×1080). Op een telefoon of tablet (smaller dan 760 px, of een aanraakscherm tot 1024 px) staat
bovenaan alleen een korte melding dat de tool beter werkt op een pc of laptop; de pagina eronder blijft gewoon
scrollbaar. Onder 1024 px valt de werkbank terug op één kolom, zonder verdere afstelling.

**Indeling**

- **Basis:** vier kolommen vanaf 1280 px, drie tussen 1024 en 1279 px, twee daaronder. De eerste kolom is minstens
  340 px breed, zodat de drie knoppen van Gebouwfunctie ("Woning | Meerdere woningen | Kantoor") op één regel passen.
  Meer instellingen staat in drie kolommen vanaf 1280 px en in twee daaronder. "Bekijk het resultaat" klapt de Basis in
  tot een strook met chips; wijkt Meer instellingen af op meer dan het klimaatjaar (dat heeft een eigen chip), dan staat
  er ook een chip "Meer instellingen · 3 aangepast" (zelfde telling als de kop van Meer instellingen; een klik opent
  Meer instellingen), zodat ook na een deellink zichtbaar is dat het oordeel van verborgen waarden kan afhangen. Open of
  dicht wordt bewaard in `localStorage` (`ps-basis-v1`), een deellink opent ingeklapt zonder dat te bewaren. Na "Bekijk het resultaat" krijgt H2 "Resultaat" de focus; de pagina scrolt alleen als de
  oordeelkaart niet helemaal in beeld staat (en dan zo weinig mogelijk), zodat de kop en de strook met "Wijzig" in beeld
  blijven als alles past.
- **Werkbank:** Resultaat links met daaronder Opvallend, Alle kerngetallen en Robuustheid; Wat als? rechts over beide
  rijen. Geen sticky kolom en geen eigen scrollgebied. Tussen werkbank en Verdieping staat iets meer ruimte (24 px) dan
  tussen de blokken van de werkbank: Verdieping is een volgende laag.
- **Hoofdgetallen** (afwijking van spec §6.1): een oordeelzin, een meterbalk (piek aan de meter tegen de WP-limiet) en
  drie tegels (Warmtepomp, Boven de limiet, Kleinste aansluiting). De acht KPI-kaarten staan ongewijzigd ingeklapt onder
  "Alle kerngetallen (8)" en zijn op papier open.
- **Advies** (spec §6.2) staat alleen nog op papier; op het scherm vervangen kop en detailzin van het oordeel het.
- **Balk onderaan:** een vaste balk met het oordeel in het kort verschijnt zodra de kop van het oordeel (icoon, kop en
  detailzin) uit beeld is, rekening houdend met de hoogte van de balk zelf (52 px). Eén gedrag op alle breedtes.
- **Bedrijfsmodus** ("Zonder begrenzer" / "Met begrenzer") is een weergavekeuze boven de tabbladen van Verdieping en
  geldt voor de grafieken en Alle kerngetallen. Wisselen (ook via "toon in grafieken") telt niet als invoerwijziging:
  het voorbeeld blijft staan (een voorbeeld wordt herkend zonder naar de modus te kijken), net als de eigen invoer, het
  ongedaan maken en de melding. De gekozen modus blijft ook staan bij een ander voorbeeld, een andere gebouwfunctie,
  ongedaan maken en "Terug naar je invoer". Hij gaat wel mee in de deellink, zodat de ontvanger dezelfde grafieken ziet.
  Kop, status, tegels en gevolgregels hangen er niet van af: overschrijding komt altijd uit de doorrekening zonder
  begrenzer, comfortverlies altijd uit die met begrenzer. Eén uitzondering, zoals in plan §4.1 en §4.3: hoeveel een
  batterij afschaaft, is alleen bekend zonder begrenzer, want de doorrekening zonder batterij volgt de gekozen modus.
  Met begrenzer zegt de detailzin daarom "de batterij schaaft de piek af" zonder bedrag, ontbreekt de arcering in de
  meterbalk en noemt de batterijregel in Wat als? geen meterpiek "zonder → met". Een bedrag in beide modi vraagt een
  extra doorrekening in het model; dat valt buiten deze ronde.
- **Gevoeligheidsraster** (afwijking van spec §7.4): het raster rekent na elke doorrekening mee (storevlag
  `autoSensitivity`, in tests standaard uit), omdat de mini-grafiek boven de bufferschuif en de knoppen bij het oordeel het
  nodig hebben. Buffer en batterij zitten niet in de cachesleutel, dus schuiven met de hendels rekent het raster niet
  opnieuw.

**Oordeel en knoppen**

- **Drempels:** "Past net niet" als de piek aan de meter hoogstens 3 % boven de limiet ligt; "Past ruim" bij meer dan
  25 % marge onder de limiet en geen batterij die afschaaft. Een batterij schaaft af als de piek zonder batterij meer
  dan 5 W hoger ligt. Er is geen apart oordeel "krap": met opslag ligt de piek bewust op de limiet.
- **Knop batterij (B9):** de benodigde capaciteit naar boven afgerond op de schuifstap (0,527 kWh wordt 1,0 kWh), binnen
  het schuifbereik. Knoppen zetten een batterij altijd met automatisch vermogen (0,5 C), want daarmee rekenen de
  benodigde batterij en het raster; staat er een handmatig batterijvermogen, dan zegt de melding dat ("Batterij op
  1,0 kWh · vermogen automatisch (0,5 C)"), en de mini-grafiek toont dan geen stip (b). De KPI-kaart in Alle kerngetallen en de print tonen de exacte benodigde capaciteit,
  afgerond op 0,1 kWh ("Batterij voor 0 uur: 0,5 kWh"; het model verandert niet). De knop en de batterijregel in Wat
  als? ("Kleinste batterij voor 0 uur: 1,0 kWh") ronden naar boven af op de schuifstap, omdat 0,5 kWh nog 2 uur boven
  de limiet geeft. Beide getallen kloppen dus: het eerste is de exacte behoefte, het tweede de kleinste instelbare
  waarde die 0 uur haalt.
- **Knop buffer (B10):** alleen het kleinste exacte rasterpunt V > 0 waarop de warmtepomp zonder batterij past, alleen
  bij automatisch WP-vermogen en alleen als het raster bij de invoer hoort; zolang het raster rekent een grijze
  plaatshouder. Het volume is het exacte rasterpunt, ook als dat naast de schuifstap ligt. Bij "binnen de toegestane
  uren" moet de buffer 0 uur geven, anders zou de knop niets verbeteren.
- **Knop aandeel (B11):** alleen zonder buffer en batterij, en ook niet als de limiet het laden van de boiler ergens
  afremt: de boiler is dan opslag en een hogere limiet kan de piek aan de meter laten stijgen, zodat de drempel niet
  exact is.
- **Knop aansluiting en aandeel** zetten de focus op de aansluitingsstapper in Wat als? (die toont de nieuwe limiet),
  niet op het veld in de Basis: dat zou de ingeklapte Basis boven het oordeel openklappen.
- **Kleinere aansluiting volstaat ook:** exact uit het model als de kleinste passende aansluiting kleiner is. Anders
  uit het raster voor de eerstvolgende kleinere aansluiting, zodat de knop dezelfde route noemt als de stip in de
  mini-grafiek en de batterij niet groter maakt dan nodig (het raster kent maar vier batterijgroottes, bij de woning
  0 / 7,5 / 15 / 30 kWh). (1) **Alleen buffer** als die aansluiting zonder batterij past: het grootste passende
  rasterpunt tot en met de huidige buffer (nooit meer buffer dan nodig), anders hetzelfde punt als stip (b) ("Probeer
  1×35 A met 0,20 m³ buffer" bij de woning op 1×40 A, niet meer "met 7,5 kWh batterij"); de batterij blijft zoals hij
  is. (2) **Alleen de aansluiting** als er een batterij nodig is en die al bij een rasterpunt tot en met de huidige
  buffer past: "Probeer 1×25 A (met batterij)". Buffer en batterij blijven staan; het oordeel noemt daarna de exacte
  kleinste batterij als knop ("9,0 kWh batterij") en in de batterijregel. Deze knop belooft dus geen 0 uur maar die
  tweede knop; de test over alle voorbeelden controleert dat die er is en 0 uur haalt. (3) Anders **stip (b)**: meer
  buffer met de kleinste rasterbatterij (geverifieerd: 0 uur). Eerder koos de knop het eerste rasterpunt vanaf de
  huidige buffer met de kleinste rasterbatterij daar; dan stonden er op één scherm drie antwoorden voor dezelfde
  aansluiting (1,0 kWh in de batterijregel, 7,5 kWh bij de knop, alleen buffer bij de stip) en kon de knop de buffer
  verhogen terwijl minder al genoeg was.
- **Ongedaan maken:** elke knop past de invoer toe met één stap ongedaan maken en een melding van 8 s. Voorbeelden en
  het wisselen van gebouwfunctie bewaren de eigen invoer (`ownInput`) tot je hem terugzet. Kies je daarna weer de
  gebouwfunctie van die eigen invoer terwijl er een ongewijzigd voorbeeld of standaardinvoer staat (er gaat dus niets
  verloren), dan komt de eigen invoer terug in plaats van de standaardwaarden, met de melding "Je eigen invoer
  teruggezet · Ongedaan maken" (ongedaan maken bewaart hem weer). Eerder gaf Meerdere woningen 40 kW → Woning →
  Meerdere woningen de standaard 50 kW, zonder melding. Ongedaan maken, eigen invoer,
  open/dicht en de rondleiding komen nooit in de deellink.

**Teksten en bediening**

- **Terminologie** (afwijking van spec §0.3): het deel van de aansluiting voor warmtepomp en batterij (P_limiet, in de
  spec "WP-budget") heet in de tool "WP-limiet", kort "limiet" waar het duidelijk over de WP-groep gaat; op verzoek van
  de gebruiker, omdat "budget" in deze context niet goed past.
- **Voorbeelden** vervangen de scenario's: een keuzelijst in de kop met groepen per gebouwfunctie en korte titels; ids,
  titels en invoer van de scenario's zijn ongewijzigd.
- **Nachtverlaging** (kantoor) is alleen een vertaling naar het setpoint buiten gebruik: aangevinkt betekent
  `setpointSetbackC < setpointUseC`; aanvinken zet het setpoint buiten gebruik 2 K onder het gebruikssetpoint (begrensd),
  uitvinken zet het gelijk. Een eigen waarde (bijvoorbeeld 17 °C) gaat bij uit- en weer aanvinken verloren; de exacte
  waarde staat in Meer instellingen › Gebouw.
- **Meterbalk:** het label bij de limietstreep is alleen "limiet 3,22 kW"; het aandeel en de aansluiting staan al in de
  strook, de aansluitingsstapper en de limietbalk van de Basis.
- **Verwijzingen "zonder maatregelen …"** (tegels, schaduwstreep en label bij de meterbalk) alleen bij automatisch
  WP-vermogen. De doorrekening zonder maatregelen dimensioneert de warmtepomp altijd automatisch (het model verandert
  niet); bij een handmatig vermogen noemde de verwijzing dus een andere warmtepomp dan de knop "↺ Zonder maatregelen"
  (die het handmatige vermogen houdt), en suggereerde "(+1,4)" dat de maatregelen de warmtepomp groter maakten.
- **Tegel Warmtepomp** heeft de eenheid "kW th" (zoals de KPI-kaart en Verfijnen): naast de piek aan de meter en de
  limiet (elektrisch) leek "10,6 kW" anders niet in "limiet 3,22 kW" te passen.
- **Kop:** "Past op … met 1,05 m³ buffer en 5,5 kWh batterij" noemt de batterij alleen als hij meetelt; is hij niet
  nodig (zonder batterij al 0 uur, de batterijregel zegt "Doet nu niets"), dan zonder de batterij.
- **Percentages** in de detailzin: een klein maar echt verschil dat op 0 zou afronden, is "< 1 %" ("tot 0,01 kW
  (< 1 %) erboven"), zoals "< 1 kWh/jaar" in de tegel.
- **Tegels:** "Boven de limiet" toont alleen de kWh per jaar (hoe ver de piek boven de limiet komt, staat in de detailzin);
  "Kleinste aansluiting" zegt "1 stap groter dan de huidige" zonder de aansluiting te herhalen (die staat in de kop). Het
  verschil in de verwijzing "zonder maatregelen 10,6 kW (−1,2)" komt uit de getoonde, afgeronde waarden, zodat de
  rekensom op het scherm klopt. De regel in een tegel breekt alleen bij " · " af, nooit tussen een getal en zijn
  eenheid ("6,6 kW/woning").
- **Niet te dimensioneren:** de detailzin noemt wat er met de terugvalwaarde (3 × het piekvermogen) misgaat en de eerste
  oplossing die bij de invoer past. De oorzaak komt uit de doorrekening zonder begrenzer, die net als de dimensionering
  geen elektrische grens heeft: tapwatertekort wijst naar de boiler, comfortverlies met nachtverlaging naar de
  opwarmfactor en het verlaagde setpoint. Advies over boiler of tapwater verschijnt alleen als er tapwater is (een
  kantoor heeft standaard geen tapwater). De melding staat niet in Opvallend; de toelichting en alle passende
  oplossingen staan onder "Waarom?" in de oordeelkaart (op papier open). De mini-grafiek toont dan "Grafiek niet
  beschikbaar: warmtepomp niet te dimensioneren." zodra het raster klaar is. Wat als? geeft dan geen batterijadvies
  (geen "Kleinste batterij voor 0 uur", "Zet" of "Probeer {kleiner}"), want dat zou rekenen met de terugvalwaarde;
  de batterijregel zegt "Geen advies zolang de warmtepomp niet te dimensioneren is (zie Resultaat).", met een batterij
  voorafgegaan door de bruikbare capaciteit en het vermogen, en de meldingen bij de batterij ("Batterij raakt leeg",
  "Batterijvermogen begrenst") staan er dan niet onder. De bufferregel zegt "warmtepomp niet te dimensioneren" in
  plaats van "– → – kW". De tegel Warmtepomp toont "–" en ook geen verwijzing "zonder maatregelen …" (die zou de
  terugvalwaarde noemen). De tegels Boven de limiet en Kleinste aansluiting en de meterbalk rekenen wel met de
  terugvalwaarde; kop en detailzin zeggen dan al dat de warmtepomp niet te dimensioneren is.
- **Boven de limiet:** zijn er uren boven de limiet met samen minder dan 0,5 kWh, dan zegt de tegel "< 1 kWh/jaar" in
  plaats van "0 kWh/jaar".
- **Stresstest (1978/79)** is een regel zonder eigen link: de robuustheidstabel staat direct onder de oordeelkaart.
  Sinds de klimaatupdate is T1 het ontwerpjaar en de strenge winter 1978/79 de controle (spec §4.3), dus de regel komt
  uit de robuustheidsrij winter1979: "Strenge winter 1978/79: … uur boven de limiet, … uur te koud." (eerder: T1). Is
  1978/79 zelf gekozen, dan zegt de regel bij automatisch WP-vermogen "Dit is al de stresstest (1978/79); de warmtepomp
  is op dit jaar gedimensioneerd.": de regel bij een ander jaar gold voor de warmtepomp van dat jaar (het vermogen zelf
  noemen vraagt een extra doorrekening). De regel heeft geen eigen toon: bij een automatisch gedimensioneerde warmtepomp
  is er in de strengere winter bijna altijd comfortverlies, dus een waarschuwing zou er altijd staan.
- **Opvallend** toont bij een handmatig WP-vermogen ook "Warmtepomp niet te dimensioneren" (met "De berekening gebruikt
  het handmatig gekozen WP-vermogen."): het oordeel rekent dan met het gekozen vermogen en is geen "niet te
  dimensioneren", dus anders stond die melding nergens.
- **Opvallend** toont per melding alleen de ernst en de titel; de korte toelichting staat bovenaan onder "Waarom?". Dat
  geldt ook voor de meldingen bij de buffer en de batterij.
- **Batterijregel:** de knop heet "Zet" (toegankelijke naam "Zet op 1,0 kWh"), want de waarde staat al in de regel ervoor.
  Ligt de piek afgerond precies op de limiet, dan zegt de regel "komt al niet boven de limiet" in plaats van "blijft al
  onder de limiet". Is de batterij meer dan één schuifstap groter dan nodig, dan volgt " · 3,0 kWh is al genoeg" met
  "Zet". De knop "◀ Probeer {kleiner}" bij een batterij die niets doet, wijst naar een aansluiting waar een batterij echt
  nodig is: past een kleinere aansluiting al zonder batterij (6 kW op 3×25 A: het oordeel zegt "Probeer 1×35 A"), dan
  één stap onder die kleinste passende (1×25 A), niet één stap onder de huidige (1×40 A, waar de batterij nog steeds
  niets doet). Met een batterij is de kleinste passende met die batterij berekend; dan die zelf, zoals bij het oordeel.
- **Bufferregel:** het opslagdeel ("12,0 kWh opslag ≈ 1,5 uur piekvermogen", of "Geen buffer · 24,1 kWh per m³") hangt
  alleen van de invoer af en volgt de schuif direct, ook tijdens het slepen; het warmtepompdeel ("warmtepomp 10,6 →
  9,4 kW") komt uit de doorrekening en is gedimd zolang er een nieuwe loopt. Eerder stond tijdens het slepen
  "Geen buffer" naast een getalveld met 1,20 m³. Het herberekenen blijft 250 ms na de laatste wijziging (`DEBOUNCE_MS`
  valt buiten deze ronde, plan §12); het oordeel volgt dus pas na het loslaten. De melding "Buffer helpt niet verder"
  staat er niet onder als de regel "Meer buffer maakt de warmtepomp niet kleiner: …" er al staat (die zegt hetzelfde);
  zonder raster, zonder die regel, staat de melding er wel.
- **Mini-grafiek:** het label van een stip noemt het volume ("1×35 A · 0,20 m³", "1×25 A + 7,5 kWh · 0,60 m³"), want de
  x-as heeft geen m³; de stip heeft een tooltip met wat een klik doet ("… past vanaf 0,20 m³: zet buffer en
  aansluiting"). Stip (b) zonder rasterbatterij laat de batterij zoals hij is. De y-as is minstens 20 % van het maximum
  hoog: een bijna vlakke lijn (bijstookelement 2 kW: 7,6 → 7,3 kW) is geen klif over de volle hoogte. De streepjes
  2 h / 4 h / 8 h onder de buffer- en batterijschuif staan uitgelegd in de toelichting (ⓘ) van die velden: opslag voor
  2, 4 en 8 uur piekvermogen, bij de batterij elektrisch bij COP 3.
- **Aansluitingsstapper:** de tekst tussen ◀ en ▶ is gewone uitvoertekst, zonder vlak of rand (met vlak leek het een
  derde knop).
- **Mini-grafiek (stippen):** vallen de twee stippen (vrijwel) samen, bijvoorbeeld bij 9 kW en LT 35 allebei "vanaf 0,20 m³", dan
  blijft stip (a) op de lijn en schuift stip (b) een raakvlak (24 px) omlaag, of omhoog als daar geen ruimte is, met een
  stippellijn naar het punt op de lijn. Zo heeft elke stip een eigen klikvlak en een eigen label. Het getal bovenaan de
  y-as heeft een rand in de kaartkleur, zodat de lijn van de huidige buffer er bij een kleine buffer achter langs loopt.
  Een plateau ("meer helpt niet") verschijnt alleen als er na het knikpunt nog een berekend punt ligt. Daalt de lijn tot
  het einde van de schuif (bijvoorbeeld kantoor in T1 met 20 m³ buffer), dan staat er "{min} kW bij {V_max} m³ (einde
  bereik)" en ook onder de bufferschuif geen regel "Meer buffer maakt de warmtepomp niet kleiner".
- **Keuzelijsten:** de optie grootverbruik heet "Grootverbruik" (het veld ernaast heet al "Gecontracteerd vermogen") en
  de NEN-referentiejaren heten "Ontwerpjaar T1 — strenge winter" enzovoort, zonder "(≈ NEN 5060:2018 …)", dat al in de
  groepskop staat. Zo past de gekozen optie in de kolom. De stresstestjaren staan in een eigen groep ("Stresstest strenge
  winter (T1 met een werkelijk stookseizoen)") met hun volledige label uit spec §4.3.

**Rondleiding**

- **Vijf stappen** langs de Basis, de WP-limiet, het oordeel, de buffer en batterij met aansluiting, met de teksten uit
  plan §8 (zonder getallen). Een niet-modale popover naast het onderdeel met titel, tekst, "n van 5" en Vorige /
  Volgende / Overslaan (Klaar in de laatste stap, zonder Overslaan); een ring om het onderdeel en een lichte dimming van
  de rest. Ring en dimming vangen geen klikken af: de pagina blijft bruikbaar, ook de bufferschuif in stap 4.
- **Afwijkingen van plan §8 (teksten):**
  - De titels hebben geen stapnummer meer: "Basis", "Resultaat" en "Wat als?" in plaats van "1 · Basis",
    "2 · Resultaat" en "3 · Wat als?". Naast de teller stond anders een tweede, ander nummer ("2 · Resultaat" bij
    "3 van 5"). Het nummer van het onderdeel staat al als badge in de kop op de pagina.
  - Stap 1 zegt niet meer "wat je niet invult, staat op een gangbare standaardwaarde". Alle velden van de Basis zijn
    ingevuld (met het voorbeeld), dus dat klopte niet. Nu staat er: "Begin hier met je gebouw en aansluiting; de rest
    staat op gangbare standaardwaarden onder Meer instellingen."
  - Stap 4 zegt nu waar "meer" op slaat, en wat er daalt: "Schuif met de buffer: de benodigde warmtepomp daalt tot de
    lijn vlak wordt; meer buffer helpt daarna niet, want een buffer overbrugt uren, geen dagen." (eerder "… de
    warmtepomp wordt kleiner tot de lijn vlak wordt; meer helpt dan niet, …").
  - Stap 5 zegt niet meer "zet de aansluiting een stap lager": in het voorbeeld waarmee de rondleiding vanzelf start,
    is de aansluiting al te klein ("Past niet op 1×35 A"), dus dat maakte het erger en sprak de knop "1×40 A" tegen. Nu:
    "Een batterij schaaft de piek aan de meter af: probeer met ◀ ▶ een andere aansluiting en kijk welke batterij dan
    nodig is."
  - Stap 2 heet "WP-limiet" (zonder lidwoord, zoals de andere titels) en zegt dat je daar het aandeel kiest: "Hier kies
    je welk deel van de aansluiting de warmtepomp mag gebruiken: tegen die WP-limiet wordt alles getoetst." (eerder
    met lidwoord en met "De warmtepomp mag maar een deel van de aansluiting gebruiken: …").
- **Plaats:** rechts naast het onderdeel als dat past, anders eronder, anders links, anders erboven. Het onderdeel
  scrolt bij het openen van een stap naar het midden (direct bij verminderde beweging); komt de popover eronder, dan
  scrollen onderdeel en popover samen naar het midden, met ruimte voor de balk onderaan. Op 1280×800 en 1440×900 staat
  de popover bij de Basis, de buffer en de batterij eronder (zo blijft het oordeel in beeld terwijl je schuift) en bij
  het aandeel en het oordeel rechts; op 1920×1080 bij de buffer rechts.
- **Vast aan het onderdeel** (afwijkend van de eerste bouw, die de popover altijd binnen het venster hield): de popover
  zit vast aan zijn kant van het onderdeel en komt er nooit overheen. Scrol je zelf, of groeit het onderdeel (Meer
  instellingen open in stap 1, de regels onder de buffer na het schuiven), dan gaat hij mee, ook uit beeld: eerder werd
  hij dan in het venster geklemd en bedekte hij juist de velden waar de stap over ging (in stap 1 acht velden van Meer
  instellingen, in stap 4 de bufferschuif na omhoog scrollen), of bleef hij bovenaan hangen met een pijltje naar niets.
  Langs de kant schuift hij wel mee binnen het venster (naast een hoog onderdeel als het oordeel), boven de balk
  onderaan, zolang het pijltje nog naar het onderdeel wijst. Verandert het onderdeel van maat, dan wordt de kant opnieuw
  gekozen; verschijnt of verdwijnt de balk onderaan, dan wordt hij opnieuw geplaatst. De pagina scrolt niet vanzelf als
  het onderdeel groeit (je kijkt naar wat je openklapte); wel als je met Tab de popover in gaat terwijl die buiten beeld
  staat, want een vaste popover scrolt de browser niet zelf in beeld. Staat het onderdeel na een andere venstergrootte
  niet meer goed in beeld (of de popover niet), dan scrolt het, 0,2 s na de laatste wijziging, terug naar het midden.
- **Tabvolgorde:** de popover staat in de DOM aan het einde van de pagina, maar in de tabvolgorde direct na zijn
  onderdeel: Tab vanaf de laatste tabstop in het onderdeel gaat naar de eerste knop van de popover, Tab vanaf de laatste
  knop naar de eerste tabstop na het onderdeel, en Shift+Tab omgekeerd (zoals een niet-modale "floating focus
  manager"). Vanaf de kop van stap 4 is de bufferschuif zo met twee keer Shift+Tab bereikbaar (eerder negentien keer,
  en twintig keer Tab terug). De knoppen van de popover hebben daarvoor tabIndex -1, zodat Tab aan het einde van de
  pagina de pagina gewoon verlaat in plaats van nog eens de popover in te gaan.
- **Basis:** stap 1 en 2 (het aandeel staat in de Basis) klappen een ingeklapte Basis open zonder dat te bewaren:
  `ps-basis-v1` blijft staan. Na afloop (Overslaan, Klaar, Esc of de pagina verlaten) klapt de rondleiding hem weer in,
  zodat pagina en bewaarde keuze het eens zijn. Het onderdeel van de laatste stap blijft daarbij op zijn plek (de pagina
  scrolt evenveel mee). Hij blijft open als je hem tijdens de rondleiding zelf open of dicht zette (ook via een knop die
  een veld van de Basis toont) of als de focus bij het afsluiten in de Basis staat (je werkt er nog in). De rondleiding
  verandert nooit invoer.
- **Zelf ingeklapt tijdens de rondleiding:** klik je in stap 1 of 2 op "Bekijk het resultaat", dan ben je klaar met de
  Basis: de rondleiding gaat in beide stappen door naar het resultaat (stap 3), en de focus blijft op H2 "Resultaat".
  Eerder bleef stap 1 staan met de popover onder de strook, over de oordeelzin waar je net naartoe sprong, en klapte
  Volgende de Basis weer open. Stappen in het ingeklapte paneel (het aandeel) worden in die ronde overgeslagen, ook met
  Vorige; stap 1 wijst dan naar de strook. Zet je de Basis zelf weer open (Wijzig), dan is het aandeel er weer. Een
  volgende ronde klapt hem weer open zoals altijd.
- **Ontbrekend anker:** die stap wordt overgeslagen; de teller houdt het nummer van de stap ("3 van 5" na een
  overgeslagen stap 2). Ontbreekt het laatste anker, dan krijgt de stap ervoor Klaar. **Verdwijnt** het anker tijdens
  een stap (weg of verborgen), dan zoekt de rondleiding het eerst opnieuw op; is het er niet, dan gaat hij door naar de
  volgende stap (anders de vorige, anders stopt hij zonder "gezien"). Zo blijft er geen popover los op de pagina
  hangen.
- **Vanzelf starten:** alleen als `ps-rondleiding-v1` ontbreekt, de pagina niet via een deellink is geopend,
  `tourAutoStart` aan staat (uit in de tests, net als `autoSensitivity`), de eerste doorrekening klaar is, het scherm
  geen telefoon of tablet is (dezelfde mediaquery als de melding bovenaan) en je nog niet met de pagina bezig bent:
  sinds het laden geen toets, klik of aanraking, scrollwiel of gewijzigd veld, en de focus niet in een veld. Anders zou
  de rondleiding de focus wegnemen terwijl je typt. Dat wordt één keer per bezoek bekeken, een halve seconde na de
  eerste doorrekening, zodat de pagina eerst is opgebouwd. Start hij niet, dan wordt niets bewaard: een volgend bezoek
  probeert het weer, en de knop Rondleiding werkt altijd.
- **Afsluiten:** Overslaan, Esc (ook met de focus op de pagina) en Klaar bewaren "gezien". Wie de pagina verlaat
  tijdens de rondleiding, bewaart niets: een volgend bezoek start hem weer. De knop Rondleiding in de kop start hem
  altijd opnieuw bij stap 1, ook als stap 1 al openstaat (dan scrolt die stap opnieuw in beeld en krijgt de kop weer de
  focus).
- **Focus:** bij elke stap op de kop van de popover (zonder focusring, want de kop is niet te bedienen). Uitzondering:
  gaat de rondleiding vanzelf door omdat het anker verdween of omdat je de Basis inklapte, en staat de focus op de
  pagina (bijv. op H2 "Resultaat" na "Bekijk het resultaat"), dan blijft hij daar.
- **Focus na afloop, afwijkend van plan §8** ("focus na afloop terug naar de knop Rondleiding"): alleen als je de
  rondleiding met het toetsenbord vanuit de popover sluit (Enter of spatie op Overslaan of Klaar, of Esc na Tab of
  Enter), gaat de focus naar de knop Rondleiding; die scrolt dan in beeld, met focusring. Met de muis (een klik op
  Overslaan of Klaar, of Esc na een muisklik) niet: de knop staat dan meestal buiten beeld en zonder zichtbare focus,
  en de volgende spatie, de gewone manier om te scrollen, drukte hem in, waarna de rondleiding opnieuw begon en de
  pagina naar boven sprong. Dat raakte juist het vaakste pad: overslaan direct na het vanzelf starten en dan scrollen.
  Nu valt de focus op de pagina (body) en scrolt een spatie. Stond de focus nergens (body), dan blijft hij daar; stond
  hij op de pagina (bijv. op de bufferschuif na het slepen in stap 4, of in een veld), dan blijft hij daar en scrolt de
  pagina niet.

**Meetbare doelen (UX-plan §11)**

Gemeten met `tools/ux-check/measure.mjs` op 1440×900 tegen de baseline van `main` (405 woorden, 38 bedieningselementen,
57 tabstops). Sinds de rondleiding telt de knop Rondleiding in de kop mee (één woord, één bedieningselement en één
tabstop meer); de meting zet de rondleiding op "gezien" en meet dus de pagina zonder popover. Gehaald: tabstops tot de
oordeelkaart (9), skip-link (tabstop 2, focus op H2), scrolldiepte op 1440×900 en 1280×800, geen horizontale overflow,
geen geneste scroll en print (2 pagina's). Niet gehaald; de norm is bijgesteld, omdat de pagina na het schrappen van dubbele teksten rustig leest (≈ 45 %
minder woorden boven de vouw dan `main`) en verder schrappen inhoud zou kosten:

| Doel                                     | Norm                            | Gemeten | Toelichting                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------- | ------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Woorden boven de vouw, Basis open        | ≤ 230 en ≤ 40 % van de baseline | 232     | ≤ 230 was gehaald (230). 40 % van 405 is 162: kop (27) en open Basis (62) zijn samen al 89 woorden, en de schets in §2.2 bevat zelf ongeveer 230. De term "limiet" in plaats van "budget" (op verzoek van de gebruiker) kost twee woorden: "Boven de limiet" in de tegel en "boven de limiet" in de T1-regel. Bijgesteld: alleen het aantal woorden, ≤ 235 (eerst ≤ 230). |
| Woorden boven de vouw, ingeklapt         | ≤ 180                           | 214     | Na het schrappen van dubbele teksten (limiet bij de meterbalk, max. overschrijding in de tegel, toelichting in Opvallend, de aansluiting in de tegel, "Zet op", de link Robuustheid) blijft over: kop 27, strook 23, oordeel 95, Wat als? 45, Opvallend en de twee samenvattingen 18, kop van Verdieping 9. Bijgesteld: ≤ 215.                                            |
| Zichtbare bedieningselementen, ingeklapt | ≤ 35                            | 38      | Baseline 38. De knop Rondleiding telt mee. Twee bewuste snelkoppelingen blijven: "eigen vermogen kiezen" (naar Verfijnen) en "volledige gevoeligheid →" (naar het tabblad Gevoeligheid). De kop van Verdieping (toelichting en "Zonder/Met begrenzer") staat onderaan in beeld; zo is zichtbaar dat er meer onder staat. Bijgesteld: ≤ 38 (niet meer dan de baseline).    |

De doelen op 390 px (telefoon) vervallen: de tool is alleen voor een pc of laptop.
