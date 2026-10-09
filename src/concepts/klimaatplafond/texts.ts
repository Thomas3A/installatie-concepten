// Alle uitlegteksten en meldingsteksten (Nederlands). Wiskunde in KaTeX-notatie tussen $...$ (inline) of $$...$$ (blok).

export interface MessageText {
  title: string;
  why: string[];
  formula?: string;
  solutions: string[];
}

export const MESSAGE_TEXTS: Record<string, MessageText> = {
  W01: {
    title: 'Te hoge drukval in streng',
    why: [
      'In het turbulente regime geldt $\\Delta p \\approx c\\,L\\,Q^{1{,}75}/D^{4{,}75}$. Meer panelen in serie betekent een langere streng én meer debiet: bij dezelfde ΔT neemt het vermogen per streng toe, dus ook het debiet. De drukval stijgt daardoor veel sneller dan lineair.',
    ],
    formula: '\\Delta p = \\left(f\\,\\frac{L}{D} + \\sum \\zeta\\right)\\frac{\\rho v^2}{2}',
    solutions: [
      'Minder panelen per streng (meer parallel)',
      'Een grotere buisdiameter',
      'Een grotere ontwerp-ΔT',
      'Een hogere Δp-grens accepteren',
    ],
  },
  W02: {
    title: 'Ontwerpdebiet niet haalbaar',
    why: [
      'Het beschikbare Δp vóór de klep moet het circuit dekken. Type A heeft daarnaast een minimaal Δp over de PICV nodig om drukonafhankelijk te regelen en een kleine vaste weerstand in de 6-weg-klep. Type B regelt softwarematig op het gemeten debiet; daar bepaalt alleen de circuitdrukval of Vmax haalbaar is.',
    ],
    formula:
      '\\Delta p_{beschikbaar} \\ge \\Delta p_{circuit}(V_{max}) \\quad (\\text{Type A: } + \\Delta p_{6\\text{-}weg} + \\Delta p_{min,PICV})',
    solutions: [
      'Het beschikbare Δp verhogen',
      'De circuitweerstand verlagen (kortere strengen, ruimere verdeelleiding, geen Tichelmann)',
      'Vmax verlagen',
      'Type A: een andere PICV-uitvoering of DN20 kiezen',
    ],
  },
  W03: {
    title: 'Laminaire stroming',
    why: [
      'Onder Re ≈ 2.300 valt de binnenzijdige warmteoverdracht terug naar Nu = 3,66 (turbulent Nu > 20). Alleen daardoor levert het plafond in dit model al ca. 10–15 % minder per paneel; door het lagere debiet loopt de gemiddelde watertemperatuur bovendien verder op. Daarnaast wordt lucht slecht afgevoerd.',
    ],
    formula: '\\mathrm{Re} = \\frac{4\\,\\dot m}{\\pi D \\mu}',
    solutions: [
      'Meer panelen in serie (meer debiet per streng)',
      'Een kleinere buisdiameter',
      'Een kleinere ontwerp-ΔT',
      'Vmax afstellen op "Max. plafondvermogen", of minder panelen activeren (bij Vmax op benodigd vermogen is het debiet per streng bewust laag)',
    ],
  },
  I01: {
    title: 'Overgangsgebied',
    why: [
      'Tussen Re 2.300 en 4.000 is de stroming niet volledig turbulent. De warmteoverdracht ligt tussen Nu = 3,66 en de turbulente waarde, en is gevoelig voor kleine debietveranderingen (deellast, temperatuur). Dit is acceptabel, maar laat weinig marge.',
    ],
    solutions: ['Geen actie nodig; houd bij het ontwerp wel marge ten opzichte van Re = 2.300.'],
  },
  W04: {
    title: 'Te lage stroomsnelheid',
    why: [
      'Onder ca. 0,25 m/s worden luchtbellen niet meegevoerd. Dat geeft ontluchtingsproblemen, geluid en strengen die "dichtslaan".',
    ],
    solutions: [
      'Dezelfde als bij laminaire stroming: meer panelen in serie, een kleinere buisdiameter of een kleinere ontwerp-ΔT.',
      'Vmax afstellen op "Max. plafondvermogen", of minder panelen activeren (bij Vmax op benodigd vermogen is het debiet per streng bewust laag).',
    ],
  },
  W05: {
    title: 'Te hoge stroomsnelheid',
    why: [
      'Boven ca. 1 m/s in dunne koperbuis ontstaan stromingsgeluid en erosierisico, en de drukval loopt hard op.',
    ],
    solutions: ['Meer parallelle strengen', 'Een grotere buisdiameter'],
  },
  W06: {
    title: 'Te klein watertemperatuurverschil',
    why: [
      'Veel water verpompen voor weinig vermogen. Dat kost pompenergie, en de opwekker (WKO, koelmachine, warmtepomp) werkt slechter bij een lage ΔT ("laag-ΔT-syndroom").',
    ],
    formula: 'P = \\dot V\\,\\rho\\,c_p\\,\\Delta T',
    solutions: [
      'Een grotere ontwerp-ΔT',
      'Vmax verlagen',
      'De ΔT-manager inschakelen (Type B), met het vermogensverlies als gevolg',
    ],
  },
  W07: {
    title: 'Uitgeputte streng',
    why: [
      'Het water heeft de ruimtetemperatuur bijna bereikt. De laatste panelen in de streng hebben nauwelijks drijvend temperatuurverschil en leveren vrijwel niets.',
    ],
    solutions: ['Meer debiet door deze streng', 'Kortere strengen', 'Een gelijkmatigere verdeling'],
  },
  W08: {
    title: 'Ongelijke verdeling',
    why: [
      'Zonder inregeling na de klep kiest het water de weg van de minste weerstand. Korte strengen en strengen dicht bij de klep krijgen te veel, lange en verre strengen te weinig, en kunnen daardoor zelfs laminair worden.',
    ],
    formula:
      '\\Delta P_i = \\Delta P_0 - \\sum_{k\\le i} 2\\,\\Delta p_{leiding}(F_k, l_k) = \\Delta p_{streng,i}(Q_i)',
    solutions: [
      'Gelijke strengen',
      'Langere strengen dicht bij de klep',
      'Een ruimere verdeelleiding',
      'Tichelmann (kost extra leiding en drukval)',
      'De zone over meer kleppen verdelen. Met meer kleppen regelt de software het debiet per zone.',
    ],
  },
  W09: {
    title: 'Condensatierisico',
    why: [
      'Het koudste plafondoppervlak (bij de aanvoer) ligt onder het dauwpunt plus marge. Er ontstaat dan condens op het plafond.',
    ],
    formula:
      '\\gamma = \\ln\\frac{RV}{100} + \\frac{17{,}62\\,T}{243{,}12+T},\\qquad T_{dauw} = \\frac{243{,}12\\,\\gamma}{17{,}62-\\gamma}',
    solutions: [
      'Een hogere aanvoertemperatuur (kost vermogen)',
      'De ruimte ontvochtigen via de ventilatie',
      'Dauwpuntbeveiliging gebruiken',
    ],
  },
  W10: {
    title: 'Plafond te warm voor comfort',
    why: [
      'Een warm plafond geeft stralingsasymmetrie boven het hoofd. Comfortnormen beperken die tot ca. 5 K.',
    ],
    solutions: ['Een lagere aanvoertemperatuur', 'Meer panelen', 'Een kleinere steek'],
  },
  W11: {
    title: 'Onvoldoende plafondvermogen',
    why: [
      'Het vermogen van de zone bij ontwerpcondities (met de werkelijke stroomverdeling) is lager dan het aandeel van de last.',
    ],
    solutions: [
      'Meer panelen',
      'Een kleinere buissteek',
      'Een lagere (koelen) of hogere (verwarmen) aanvoertemperatuur',
      'De last verlagen',
    ],
  },
  W13: {
    title: 'PICV buiten instelbereik (Type A)',
    why: [
      'Vmax moet binnen het instelbereik van het drukonafhankelijke regelventiel liggen: boven q_nom kan het ventiel dat debiet niet leveren, onder het minimum regelt het onnauwkeurig.',
    ],
    solutions: ['Een andere PICV-uitvoering; zie het advies bij de klepinstellingen.'],
  },
  W14: {
    title: 'Ontwerp-ΔT niet haalbaar',
    why: ['Het water kan niet verder opwarmen of afkoelen dan de ruimtetemperatuur.'],
    formula: '\\Delta T_{ontwerp} < |T_{set} - T_{aanvoer}| - 0{,}5\\,\\mathrm{K}',
    solutions: ['Een kleinere ΔT', 'Een andere aanvoertemperatuur'],
  },
  W15: {
    title: 'Te veel strengen',
    why: [
      'Voor een geldige koppeling zijn meer dan 16 parallelle strengen nodig. Dat is meer dan de verdeelleiding toelaat.',
    ],
    solutions: ['Splits de panelen over meer kleppen', 'Verleng de strengen (minder parallel)'],
  },
  W16: {
    title: 'Klep-Δp boven maximum',
    why: ['Het drukverschil over de klep ligt boven het toelaatbare maximum van dit kleptype.'],
    solutions: ['Verlaag het beschikbare Δp vóór de klep.'],
  },
  I02: {
    title: 'Hoge bezettingsgraad',
    why: [
      'Meer dan 80 % van het vloeroppervlak van de zone is met plafondpanelen bezet. Er is weinig ruimte voor verlichting, sprinklers en ventilatieroosters.',
    ],
    solutions: ['Controleer of de panelen geometrisch passen of verdeel over meer zones.'],
  },
  I03: {
    title: 'ΔT-manager begrenst het debiet',
    why: [
      'De gemeten ΔT ligt onder de minimale ΔT. De klep verlaagt het debietlimiet (0,1 % van Vmax per seconde) tot het ΔT weer voldoende is. Het plafondvermogen daalt hierdoor.',
    ],
    solutions: ['Dit is bedoeld gedrag; schakel de ΔT-manager uit om het volle vermogen te krijgen.'],
  },
  I04: {
    title: 'Dauwpuntbeveiliging actief',
    why: [
      'De koelwateraanvoer ligt minder dan 1 K boven het dauwpunt van de ruimte. De klep blijft dicht totdat dit weer veilig is (hysterese 0,5 K).',
    ],
    solutions: ['Verlaag de RV (ontvochtigen) of verhoog de aanvoertemperatuur.'],
  },
  I05: {
    title: 'Regelaar verzadigd',
    why: [
      'De vraag staat langer dan 10 minuten op 100 % en het setpoint is niet gehaald: het plafondvermogen is kleiner dan de last.',
    ],
    solutions: ['Meer panelen, een kleinere steek of een koudere / warmere aanvoer.'],
  },
};

export interface ExplainSection {
  id: string;
  title: string;
  /** Alinea's; $...$ = inline wiskunde, $$...$$ = blokformule */
  body: string[];
}

export const EXPLAIN: ExplainSection[] = [
  {
    id: 'plafond',
    title: '1. Hoe werkt een klimaatplafond?',
    body: [
      'Een klimaatplafond bestaat uit metalen panelen met een gemeanderde koperbuis. Het water in de buis wisselt warmte uit met de ruimte, voor een groot deel door straling (richting vloer, meubels en mensen) en voor een kleiner deel door convectie. Het vermogen per m² volgt uit de karakteristiek die de fabrikant bij normproefcondities meet:',
      '$$q = f_s\\,K\\,\\Delta T^{\\,n}\\quad[\\mathrm{W/m^2}]$$',
      'Hierin is ΔT het verschil tussen ruimtetemperatuur en (gemiddelde) watertemperatuur, K en n zijn fabrieksconstanten (koelen: K = 9,6; n = 1,05; verwarmen: K = 6,1; n = 1,10) en f_s een correctie voor de buissteek: een kleinere steek geeft meer vermogen per m². De proefcondities zijn turbulent (Re ≈ 4.000). Dit model splitst daarom een binnenzijdige weerstand af, zodat laminaire stroming zichtbaar vermogen kost: $R_{tot} = R_{ext}(\\Delta T) + R_{int}(\\mathrm{Re})$.',
    ],
  },
  {
    id: 'puzzel',
    title: '2. De puzzel: serie versus parallel',
    body: [
      'Hoeveel panelen je in serie schakelt bepaalt het debiet per streng, en daarmee Reynoldsgetal, stroomsnelheid en drukval. Bij een vast temperatuurverschil volgt het debiet uit het gewenste vermogen: meer panelen in serie leveren meer vermogen, dus meer debiet door dezelfde dunne buis.',
      '$$\\mathrm{Re} = \\frac{4\\,\\dot m}{\\pi D \\mu},\\qquad \\Delta p = \\left(f\\frac{L}{D}+\\sum\\zeta\\right)\\frac{\\rho v^2}{2}$$',
      'Turbulent geldt ruwweg $\\Delta p \\propto L\\,Q^{1{,}75}$. Verdubbel je het aantal panelen per streng, dan verdubbelt L én ongeveer Q, en de drukval stijgt dus met een factor 2 · 2^1,75 ≈ 6,7. Daar staat tegenover dat bij te weinig panelen per streng de stroming laminair wordt: de Nusselt-waarde valt terug van ruim 20 (turbulent) naar 3,66, en de warmteoverdracht binnenin de buis wordt de bottleneck. Het werkbare venster ligt tussen die twee grenzen. Het tabblad Puzzel laat per aantal panelen per streng zien waar dat venster zit.',
    ],
  },
  {
    id: 'dt',
    title: '3. Ontwerp-ΔT en debiet',
    body: [
      'Het benodigde debiet volgt uit het vermogen en het watertemperatuurverschil:',
      '$$\\dot V = \\frac{P}{\\rho\\,c_p\\,\\Delta T}$$',
      'Een kleine ΔT vraagt dus veel water: halveer je ΔT, dan verdubbelt het debiet (en de drukval stijgt ruwweg met een factor 3,4). Voor de opwekker is een grote ΔT gunstig: een warmtepomp of koelmachine werkt efficiënter bij een lage retourtemperatuur (verwarmen) of hoge retourtemperatuur (koelen), en een WKO levert meer energie per m³. Een te klein ΔT in bedrijf heet het laag-ΔT-syndroom.',
    ],
  },
  {
    id: 'klep',
    title: '4. De 6-weg-klep',
    body: [
      'Een 6-weg-klep schakelt één plafondcircuit tussen een koud- en een warmwatercircuit (4-pijpssysteem), met een dode zone ertussen. Dit model kent twee uitvoeringen.',
      'Type A combineert een schakelende 6-weg-klep (alleen koelen of verwarmen, 30 s omschakeltijd) met een drukonafhankelijk regelventiel (PICV) in de retour. De PICV regelt het debiet onafhankelijk van het beschikbare Δp zolang het Δp over de PICV boven het minimum ligt; Vmax wordt softwarematig per sequentie ingesteld.',
      'Type B is één modulerende kogelklep: 0–30° koelen, 30–60° dicht, 60–90° verwarmen. De klep meet debiet en temperaturen en regelt het debiet softwarematig op het gemeten debiet (drukonafhankelijk via meting). Vmax per sequentie is 100 % opening, dus een Kvs-keuze is niet nodig; de gelijkprocentige karakteristiek $Q/V_{max} = e^{n(h-1)}$ geeft ook bij lage debieten een fijne regeling. Omdat de klep ΔT en debiet meet, levert hij direct energiemeting (P = ρ·c_p·Q·ΔT) en kan de ΔT-manager het debiet begrenzen als het gemeten ΔT onder de minimale ΔT zakt.',
    ],
  },
  {
    id: 'inregeling',
    title: '5. Waarom geen inregeling na de klep?',
    body: [
      'Na de klep zitten geen inregelafsluiters; het debiet wordt softwarematig per klep begrensd (Vmax per sequentie). Het gevolg is dat de verdeling over de strengen puur hydraulisch ontstaat: het water kiest de weg van de minste weerstand. Strengen dicht bij de klep en korte strengen krijgen meer, lange en verre strengen minder.',
      'Dit is te beperken door de langste strengen het dichtst bij de klep te leggen (dat compenseert deels de leidingverliezen), door gelijke strengen te maken, door een ruime verdeelleiding te kiezen of door aansluiting volgens Tichelmann (gelijke leidinglengte voor alle strengen, ten koste van extra leiding en drukval). De effectiefste maatregel is de zone over meer kleppen te verdelen: met korte verdeelleidingen per klep blijft de verdeling binnen enkele procenten.',
    ],
  },
  {
    id: 'dauwpunt',
    title: '6. Dauwpunt en comfort',
    body: [
      'Koelen kan alleen als het koudste plafondoppervlak boven het dauwpunt blijft. Het dauwpunt volgt uit temperatuur en relatieve vochtigheid (Magnus):',
      '$$\\gamma = \\ln\\frac{RV}{100}+\\frac{17{,}62\\,T}{243{,}12+T},\\qquad T_{dauw}=\\frac{243{,}12\\,\\gamma}{17{,}62-\\gamma}$$',
      'De oppervlaktetemperatuur ligt vlak bij de aanvoer iets boven de watertemperatuur: $T_{opp} = T_w + (T_r - T_w)\\,(R_{int}+R_{cond})/R_{tot}$. Het model houdt een marge van 1 K aan. Bij verwarmen begrenst het comfort de plafondtemperatuur (ca. 5 K stralingsasymmetrie boven het hoofd).',
    ],
  },
  {
    id: 'regeling',
    title: '7. Regeling en dynamiek',
    body: [
      'Per zone regelt een PI-regelaar op de luchttemperatuur. De vraag (0–1) wordt via een debietkarakteristiek omgezet in een debietsetpoint: $Q_{set} = g(u)\\,V_{max}$.',
      'Het plafondvermogen stijgt sterk bij lage debieten en vlakt daarna af. Een gelijkprocentige debietkarakteristiek $g(u) = e^{3{,}2(u-1)}$ compenseert dat, zodat het verband tussen vraag en vermogen ongeveer lineair wordt. Met een lineaire karakteristiek schiet de regeling merkbaar meer door (verwarmen vanaf 18 °C: ca. 0,6 K overshoot tegenover ca. 0,3 K). Probeer het zelf in scenario S1.',
      'De dynamiek bestaat uit de traagheid van het plafond (eerste-orde, tijdconstante van enkele minuten) en de thermische massa van de ruimte (uren). De operatieve temperatuur is het gemiddelde van luchttemperatuur en gemiddelde stralingstemperatuur; de regelaar gebruikt de luchttemperatuur.',
    ],
  },
  {
    id: 'aannames',
    title: '8. Modelaannames en beperkingen',
    body: [
      'Dit is een indicatief rekenmodel voor uitleg en conceptkeuze, geen vervanging van de productberekening van de fabrikant. Belangrijke vereenvoudigingen: één luchtknoop per zone, geen leidingverliezen, constante ζ-waarden en een constant minimaal Δp over de PICV. Alle aannames staan in docs/AANNAMES.md.',
    ],
  },
];

export interface FieldInfo {
  label: string;
  info: string;
}

export const FIELD_INFO: Record<string, FieldInfo> = {
  floorArea: {
    label: 'Vloeroppervlak open kantoor',
    info: 'Totaal vloeroppervlak; wordt verdeeld over de zones naar aandeel panelen.',
  },
  heatLoss: {
    label: 'Warmteverlies bij ontwerp',
    info: 'Warmteverlies van het hele kantoor bij ontwerp-buitentemperatuur (−10 °C).',
  },
  coolLoad: {
    label: 'Koellast bij ontwerp',
    info: 'Koellast van het hele kantoor bij ontwerpcondities (personen, verlichting, apparatuur, zon).',
  },
  mass: {
    label: 'Thermische massa',
    info: 'Warmtecapaciteit per m² vloeroppervlak: licht 15, middel 30, zwaar 60 kJ/(m²·K).',
  },
  rh: { label: 'RV ruimte', info: 'Relatieve vochtigheid bij het koelsetpoint; bepaalt het dauwpunt.' },
  startTemp: {
    label: 'Starttemperatuur',
    info: 'Automatisch: setpoint verwarmen − 3 K of setpoint koelen + 3 K. Of kies een vaste starttemperatuur.',
  },
  tSupplyCool: {
    label: 'Aanvoer koelen',
    info: 'Aanvoertemperatuur koelwater. Dichter bij het dauwpunt betekent meer vermogen maar meer condensatierisico.',
  },
  tSupplyHeat: { label: 'Aanvoer verwarmen', info: 'Aanvoertemperatuur warmwater.' },
  dtCool: {
    label: 'Ontwerp-ΔT koelen',
    info: 'Gewenst temperatuurverschil aanvoer–retour bij ontwerpdebiet.',
  },
  dtHeat: {
    label: 'Ontwerp-ΔT verwarmen',
    info: 'Gewenst temperatuurverschil aanvoer–retour bij ontwerpdebiet.',
  },
  setHeat: { label: 'Setpoint verwarmen', info: 'Gewenste luchttemperatuur bij verwarmen.' },
  setCool: {
    label: 'Setpoint koelen',
    info: 'Gewenste luchttemperatuur bij koelen. Minimaal 1 K boven het setpoint verwarmen (dode zone).',
  },
  panelSize: { label: 'Paneelmaat', info: 'De meanderbenen lopen parallel aan de lange zijde.' },
  pitch: {
    label: 'Buissteek',
    info: 'Hart-op-hart afstand van de buisbenen. Kleiner = meer vermogen per m², maar langere buis en meer drukval.',
  },
  tube: { label: 'Koperbuis', info: 'Buisafmeting van de paneelbuis en de koppelslangen.' },
  valveCount: {
    label: 'Aantal kleppen (zones)',
    info: 'Elke klep bedient één zone. Het kantoor wordt in zones naast elkaar verdeeld.',
  },
  dpAvailable: {
    label: 'Beschikbaar Δp vóór klep',
    info: 'Verschildruk die het distributienet vóór de klep levert.',
  },
  dpMax: {
    label: 'Max. drukval per streng',
    info: 'De "gevraagde drukval": bovengrens voor de drukval van één streng bij ontwerpdebiet.',
  },
  type: {
    label: 'Kleptype',
    info: 'Type A: schakelende 6-weg + PICV. Type B: modulerende gekarakteriseerde 6-weg met flow- en ΔT-meting.',
  },
  dn: { label: 'DN', info: 'Nominale diameter van de klep.' },
  picv: { label: 'PICV-uitvoering', info: 'Drukonafhankelijk regelventiel in de plafondretour.' },
  panelCount: { label: 'Aantal panelen', info: 'Panelen aan deze klep.' },
  coupling: {
    label: 'Koppeling',
    info: 'Automatisch: de tool kiest het aantal panelen per streng (zie tabblad Puzzel). Handmatig: stel zelf de strengen in.',
  },
  vmaxBasis: {
    label: 'Vmax afstellen op',
    info: 'Waarop de automatische Vmax wordt ingeregeld. Max. plafondvermogen: Vmax is de som van de ontwerpdebieten van alle strengen (het plafond levert zijn volle vermogen). Benodigd vermogen: Vmax is het kleinste debiet waarbij de zone de last volgens de koellast-/warmteverliesberekening haalt; bedoeld voor situaties met meer plafond dan nodig. Het debiet per streng en dus Re en v dalen dan; het ΔT stijgt. Is het plafond kleiner dan de last, dan blijft Vmax gelijk aan het maximale plafondvermogen. Er is geen regelreserve: de last wordt precies bij het setpoint gehaald, dus opwarmen of terugkoelen duurt dan lang.',
  },
  vmax: {
    label: 'Vmax',
    info: 'Debietbegrenzing per sequentie. Automatisch (zie "Vmax afstellen op") of handmatig in l/h.',
  },
  dtManager: {
    label: 'ΔT-manager',
    info: 'Begrenst het debiet als het gemeten ΔT onder het minimum zakt (alleen Type B).',
  },
  distPipe: { label: 'Verdeelleiding', info: 'Leiding tussen klep en strengen (meerlagenbuis).' },
  distanceFirst: {
    label: 'Afstand klep → eerste streng',
    info: 'Lengte van de verdeelleiding tot de eerste aftakking.',
  },
  spacing: {
    label: 'Hart-op-hart strengen',
    info: 'Afstand tussen opeenvolgende aftakkingen op de verdeelleiding.',
  },
  layout: {
    label: 'Aansluitwijze',
    info: 'Direct retour: kortste leiding. Tichelmann: gelijke leidinglengte voor alle strengen, meer leiding en drukval.',
  },
  dewProtection: {
    label: 'Dauwpuntbeveiliging',
    info: 'Sluit de klep als de aanvoer binnen 1 K van het dauwpunt komt.',
  },
  Kp: { label: 'Kp', info: 'Proportionele versterking van de PI-regelaar (per K).' },
  Ti: { label: 'Ti', info: 'Integratietijd van de PI-regelaar.' },
  flowChar: {
    label: 'Debietkarakteristiek',
    info: 'Vertaling van vraag naar debiet. Gelijkprocentig geeft een bijna lineair verband tussen vraag en vermogen.',
  },
  speed: { label: 'Simulatiesnelheid', info: 'Hoeveel sneller dan real-time de simulatie loopt.' },
};
