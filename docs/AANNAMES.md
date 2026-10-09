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
  de strengen (netwerk bij dat debiet, twee iteraties hydrauliek/thermiek) en gezocht met regula falsi (Illinois) in log-ruimte tussen 5 % van
  het maximale plafondvermogen (minimaal 10 l/h) en dat maximum. Is de last groter dan het plafond kan leveren, dan is Vmax het maximale
  plafondvermogen. Gevolg: het debiet per streng daalt, dus Re en v dalen (W03/W04) en ΔT stijgt.

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
