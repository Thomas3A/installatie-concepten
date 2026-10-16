// Alle Nederlandse teksten van het peakshaving-concept op één plek (UI, tooltips, meldingen, uitleg).
// Plaatshouders {naam} worden gevuld door model/messages.ts.

export type MessageCode =
  | 'sizingFailed'
  | 'backupPeak'
  | 'comfortLoss'
  | 'batteryEmpty'
  | 'batteryPower'
  | 'smallBufferDeltaT'
  | 'bufferPlateau'
  | 'coldSpell'
  | 'dhwPeak'
  | 'preheatPeak';

export interface MessageText {
  title: string;
  summary: string;
  why: string[];
  solutions: string[];
}

export const MESSAGE_TEXTS: Record<MessageCode, MessageText> = {
  sizingFailed: {
    title: 'Warmtepomp niet te dimensioneren',
    summary: 'Ook met 3 × het piekvermogen worden het comfort of het tapwater niet gehaald.',
    why: [
      'De dimensionering zoekt het kleinste WP-vermogen waarmee het comfortcriterium en het tapwater zonder elektrische begrenzing worden gehaald. Tot 3 × het piekvermogen lukt dat niet. Meestal ligt het aan de boiler (te klein voor de tapvraag: tijdens het laden van de boiler heeft tapwater voorrang), aan een te strenge eis voor comfortverlies, of aan een opwarmfactor van 0 bij nachtverlaging (dan is het setpoint niet terug te winnen).',
      '{fallbackNote}',
    ],
    solutions: [
      'Vergroot het boilervat of verlaag de tapwaterbehoefte.',
      'Sta een paar uur comfortverlies toe (Aansluiting → Expert).',
      'Controleer de opwarmfactor en het verlaagde setpoint (Gebouw → Expert).',
    ],
  },
  backupPeak: {
    title: 'Bijstook bepaalt de aansluiting',
    summary: 'De piek aan de meter ({peak} kW) valt in een uur met bijstook (element {backup} kW, COP 1).',
    why: [
      'Een elektrisch bijstookelement levert warmte met COP 1: elke kW warmte is een kW aan de meter. Valt de piek in een bijstookuur, dan bepaalt het element de benodigde aansluiting in plaats van de warmtepomp.',
    ],
    solutions: [
      'Vergroot de warmtepomp of de buffer, zodat de bijstook niet nodig is.',
      'Kies een kleiner bijstookelement of zet het uit.',
    ],
  },
  comfortLoss: {
    title: 'Comfortverlies bij begrenzen',
    summary:
      'Als de aansluiting begrenst: {hours} uur comfortverlies per jaar (toegestaan {allowed}), laagste binnentemperatuur {minTi} °C.',
    why: [
      'In de modus "aansluiting begrenst" mag de WP-groep niet boven het budget komen. Wat buffer en batterij niet kunnen overbruggen, wordt niet geleverd; de binnentemperatuur zakt dan meer dan 0,5 K onder het setpoint.',
    ],
    solutions: [
      'Vergroot de buffer (helpt tegen uurpieken) of de batterij (schaaft de elektrische piek af).',
      'Kies een grotere aansluiting of een groter aandeel voor de warmtepomp.',
    ],
  },
  batteryEmpty: {
    title: 'Batterij raakt leeg',
    summary: 'In {hours} uur is de batterij ({capacity} kWh) leeg terwijl de WP-groep boven het budget zit.',
    why: [
      'De overschrijding duurt langer dan de batterij kan leveren. De batterij laadt alleen bij in uren onder de budgetlijn, en tijdens een koude periode zijn dat er te weinig.',
    ],
    solutions: [
      'Kies een batterij met meer kWh.',
      'Vergroot de buffer: die vangt de warmtepiek thermisch op, zodat de elektrische piek kleiner wordt.',
    ],
  },
  batteryPower: {
    title: 'Batterijvermogen begrenst',
    summary: 'In {hours} uur is het ontlaadvermogen ({power} kW) de beperking, niet de lading.',
    why: [
      'De overschrijding boven het budget is groter dan het ontlaadvermogen van de batterij, terwijl er nog lading over is. Meer kWh helpt dan niet; meer kW wel.',
    ],
    solutions: ['Kies een batterij met een hogere C-waarde (Maatregelen → Expert).', 'Vergroot de buffer.'],
  },
  smallBufferDeltaT: {
    title: 'Kleine ΔT buffer',
    summary: 'De nuttige temperatuurslag van de buffer is maar {dT} K.',
    why: [
      'Met {preset}-afgifte en {maxSupply} °C maximale aanvoer slaat 1 m³ maar {kwh} kWh op; overweeg LT-afgifte of een warmtepomp met hogere aanvoertemperatuur.',
      'De buffer kan alleen ontladen tot de retourtemperatuur van het afgiftesysteem. De bruikbare slag is daarom de laadtemperatuur (maximale aanvoer − 2 K) min die retourtemperatuur.',
    ],
    solutions: [
      'Kies een lagere afgiftetemperatuur (LT of MT).',
      'Kies een warmtepomp met een hogere maximale aanvoertemperatuur.',
    ],
  },
  bufferPlateau: {
    title: 'Buffer helpt niet verder',
    summary: 'Meer buffer dan {volume} m³ maakt de warmtepomp ({pth} kW) nauwelijks kleiner.',
    why: [
      'Een buffer overbrugt uren, geen dagen: de koudste periode in {year} duurt {days} dagen met gemiddeld {meanT} °C; de warmtepomp moet het gemiddelde van die dagen zelf kunnen leveren.',
    ],
    solutions: [
      'Houd de buffer op het knikpunt van de gevoeligheidsgrafiek.',
      'Verlaag het warmteverlies of accepteer enkele uren comfortverlies.',
    ],
  },
  coldSpell: {
    title: 'Koudegolf bepaalt de maat',
    summary:
      '{share} % van de uren met comfortverlies bij een iets kleinere warmtepomp valt in de koude week van {year}.',
    why: [
      'Met 99 % van het benodigde WP-vermogen ontstaat het comfortverlies vooral in de koude week. Die valt in een koude periode van {days} dagen met gemiddeld {meanT} °C. De maat van de warmtepomp wordt dus bepaald door een aaneengesloten koude periode, niet door een enkel piekuur.',
    ],
    solutions: [
      'Vergelijk met het energiejaar en met T1 in de robuustheidstabel.',
      'Een grotere buffer helpt hier maar beperkt; een bijstookelement kan de laatste kW leveren.',
    ],
  },
  dhwPeak: {
    title: 'Tapwater veroorzaakt de piek',
    summary:
      'De elektrische piek van de warmtepomp ({peak} kW) valt in een uur waarin de boiler wordt geladen.',
    why: [
      'Boilerladen op tapwatertemperatuur kost COP: dezelfde warmte vraagt meer elektriciteit dan ruimteverwarming op de stooklijn. Valt het laden samen met een koud uur, dan ontstaat de piek.',
    ],
    solutions: [
      'Kies een grotere boiler, zodat minder vaak geladen hoeft te worden.',
      'Vergroot de buffer: die houdt een reserve voor de ruimteverwarming tijdens het boilerladen.',
    ],
  },
  preheatPeak: {
    title: 'Opstookpiek kantoor',
    summary: 'De piek van de warmtevraag valt in een opstookuur; het opwarmen draagt tot {boost} kW bij.',
    why: [
      'Na de nachtverlaging moet het gebouw vóór gebruiksaanvang terug naar het setpoint. Het extra opwarmvermogen (opwarmfactor × piekvermogen) komt bovenop het stationaire verlies in een koud nachtuur.',
    ],
    solutions: [
      'Verlaag de opwarmfactor en verleng tegelijk de opstooktijd: het gebouw warmt dan langzamer, maar op tijd op.',
      'Laat de nachtverlaging weg (bij warmtepompen vaak het advies).',
      'Een buffer vangt de opstookpiek goed op: die duurt maar enkele uren.',
    ],
  },
};

/** Opmerking bij "niet te dimensioneren", afhankelijk van automatisch of handmatig WP-vermogen. */
export const SIZING_FALLBACK_NOTE = {
  auto: 'Voor de berekening is het WP-vermogen op 3 × het piekvermogen gezet.',
  manual: 'De berekening gebruikt het handmatig gekozen WP-vermogen.',
} as const;

// ---------------------------------------------------------------------------------------------------------------
// KPI-kaarten en advies (spec §6.1, §6.2)

export const KPI_TITLES = {
  peakDemand: 'Piek warmtevraag',
  heatPumpAuto: 'Benodigd WP-vermogen',
  heatPumpManual: 'WP-vermogen (handmatig)',
  meterPeak: 'Piek aan de meter',
  exceedance: 'Uren overschrijding',
  smallest: 'Kleinste passende aansluiting',
  comfort: 'Comfort bij begrenzen',
  buffer: 'Buffer',
  energy: 'Energie',
} as const;

export const MODE_LABELS = {
  exceedance: 'overschrijding tonen',
  limited: 'aansluiting begrenst',
} as const;

/** Begin van de secundaire regel met de waarde in de andere modus (spec §5.8). */
export const COUNTERPART_PREFIX = {
  exceedance: 'Zonder begrenzer',
  limited: 'Als de aansluiting begrenst',
} as const;

export const UNIT_HOURS_PER_YEAR = 'uur/jaar';

// ---------------------------------------------------------------------------------------------------------------
// UI-teksten

export const PAGE_TITLE = 'Peakshaving warmtepomp met buffer en batterij';
export const PAGE_SUBTITLE =
  'Lucht/water-warmtepomp · warmtebuffer · batterij · uursimulatie over een referentiejaar';

/** Extra footerzin voor dit concept (spec §0.1). */
export const FOOTER_CLIMATE =
  'Klimaatdata: KNMI De Bilt (open data); referentiejaren zijn een reconstructie, geen officiële NEN 5060-data.';
export const CLIMATE_RECONSTRUCTION =
  'Reconstructie op basis van KNMI De Bilt; geen officiële NEN 5060-data.';
export const CLIMATE_NOTE =
  'Voor dimensioneren is T5 de gebruikelijke keuze; T1 is de stresstest. Het energiejaar is bedoeld voor jaarverbruik en SCOP, niet voor pieken.';

export const TAB_LABELS = {
  'koude-week': 'Koude week',
  jaar: 'Jaar',
  gevoeligheid: 'Gevoeligheid',
  concept: 'Concept',
  uitleg: 'Uitleg',
} as const;

export const BLOCK_TITLES = ['Gebouw', 'Aansluiting', 'Warmtepomp & afgifte', 'Maatregelen'] as const;

/** Toelichting per invoer (spec §3, kolom "Toelichting"). */
export const HELP = {
  use: 'Woning: één woning met een eigen warmtepomp. Meerdere woningen: een woongebouw met één collectieve warmtepomp op een eigen aansluiting. Kantoor: kantoorschema met nachtverlaging en opstoken. Wisselen zet alle invoer op de standaardwaarden.',
  dwellings:
    'Aantal woningen op dezelfde warmtepomp. Wijzigen schaalt piekvermogen, tapwaterbehoefte, boilervat, buffer en batterij mee, zodat de waarden per woning gelijk blijven; de aansluiting blijft.',
  designLoad:
    'Ontwerpwarmteverlies (transmissie + ventilatie) bij een buitentemperatuur van −10 °C en de ontwerpbinnentemperatuur, exclusief opwarmtoeslag (NEN-EN 12831). Dit is de eerste invoer; de bereiken van buffer, batterij en warmtepomp worden hiervan afgeleid.',
  designLoadMulti:
    'Ontwerpwarmteverlies van alle woningen samen (NEN-EN 12831, exclusief opwarmtoeslag). Bij −10 °C hebben alle woningen tegelijk hun ontwerpverlies, dus geen gelijktijdigheidsfactor. Wijzigen verandert het piekvermogen per woning; het aantal woningen blijft.',
  singleDwellingLarge: 'Groot voor één woning. Gaat het om een woongebouw, kies dan "Meerdere woningen".',
  designOutdoor: 'Ontwerpbuitentemperatuur volgens NEN-EN 12831 voor De Bilt.',
  designIndoor: 'Binnentemperatuur die hoort bij het ingevoerde piekvermogen.',
  setpointUse: 'Setpoint tijdens gebruik. Een woning is altijd "in gebruik".',
  setpointSetback:
    'Setpoint buiten gebruik. Woning: standaard geen nachtverlaging (advies bij warmtepompen); kantoor: 2 K verlaging.',
  balanceTemp:
    'Stookgrens tijdens gebruik: interne winsten = UA·(setpoint gebruik − stookgrens). Kantoor: verlichting, apparatuur en personen.',
  mass: 'Tijdconstante τ van het gebouw; C = τ·UA. Licht 20 h, gemiddeld 40 h, zwaar 80 h. Kantoor standaard 20 h (ventilatie domineert).',
  envelopeLag: 'Traagheid van de gevel: eerste-orde filter op de buitentemperatuur. 0 = uit.',
  boost:
    'Maximaal extra vermogen boven het stationaire verlies om het setpoint terug te winnen, als fractie van het piekvermogen.',
  useHours: 'Gebruikstijden van het kantoor, maandag tot en met vrijdag (feestdagen worden genegeerd).',
  preheat: 'Uren vóór gebruiksaanvang waarin naar het gebruikssetpoint wordt gestookt.',
  dhw: 'Warm tapwater via een boilervat dat de warmtepomp met voorrang laadt.',
  dhwDaily: 'Nuttige tapwaterbehoefte per dag, bij 10 °C koud water.',
  dhwDailyPerDwelling:
    'Nuttige tapwaterbehoefte per woning per dag, bij 10 °C koud water. Het gebouw rekent met het aantal woningen × deze waarde en hetzelfde gemiddelde uurprofiel.',
  tank: 'Inhoud van het boilervat; 85 % is benutbaar.',
  tankCollective: 'Inhoud van het collectieve boilervat voor alle woningen samen; 85 % is benutbaar.',
  tankTemp: 'Boilertemperatuur; begrensd op de maximale aanvoertemperatuur van de warmtepomp.',
  connection: 'Aansluitwaarde van het gebouw: P = 0,230·I (1-fase) of 0,400·√3·I (3-fase), cos φ = 1.',
  contracted: 'Gecontracteerd vermogen bij een grootverbruikaansluiting.',
  share:
    'Deel van de aansluiting voor warmtepomp + batterij. De rest is voor overig gebruik en wordt op het piekmoment volledig benut verondersteld. Bij meerdere woningen is dit de aansluiting van de collectieve installatie (de rest: pompen, ventilatie, algemene ruimten); de woningen hebben elk een eigen aansluiting.',
  allowedExceedance:
    'Aantal uren per jaar dat de WP-groep boven het budget mag komen; gebruikt bij "kleinste passende aansluiting".',
  allowedComfort:
    'Aantal uren comfortverlies per jaar dat bij het dimensioneren van de warmtepomp is toegestaan.',
  emitter:
    'Stooklijn: LT 35/28 °C (vloerverwarming, klimaatplafond), MT 45/35 °C (LT-radiatoren), HT 55/45 °C (bestaande radiatoren); aanvoer/retour bij ontwerpcondities.',
  maxSupply:
    'Maximale aanvoertemperatuur van de warmtepomp; de buffer wordt geladen tot deze temperatuur − 2 K.',
  carnot:
    'Carnot-rendement η: COP = η · T aanvoer / (T aanvoer − T buiten) × ontdooifactor, met temperaturen in kelvin.',
  backup: 'Elektrisch bijstookelement met COP 1. Standaard uit.',
  sizing:
    'Automatisch: het kleinste vermogen (A7/W35) waarbij zonder elektrische begrenzing het comfort en het tapwater gehaald worden, in het gekozen klimaatjaar. Handmatig: zelf kiezen.',
  bufferVolume:
    'Watervolume van het buffervat. Ernaast: nuttige inhoud en het aantal uren piekvermogen dat erin past.',
  strategy:
    'Voorspellend: alleen laden als de warmtepomp binnen 24 uur tekortschiet (of als reserve voor tapwater). Altijd: laden zodra er restcapaciteit is.',
  batteryCapacity: 'Bruto capaciteit; 90 % is bruikbaar. De batterij is alleen voor de WP-groep.',
  batteryPower: 'Laad- en ontlaadvermogen als C-waarde (vermogen / capaciteit). Automatisch = 0,5 C.',
  mode: 'Overschrijding tonen: de warmtepomp levert altijd en de uren boven het budget worden geteld. Aansluiting begrenst: het budget is hard; tekorten geven comfortverlies.',
} as const;

export const MASS_PRESETS = [
  { label: 'Licht', value: 20 },
  { label: 'Gemiddeld', value: 40 },
  { label: 'Zwaar', value: 80 },
] as const;

// ---------------------------------------------------------------------------------------------------------------
// Uitleg-tab (spec §11). Wiskunde in KaTeX-notatie tussen $...$ (inline) of $$...$$ (blok).

export interface ExplainSection {
  id: string;
  title: string;
  body: string[];
}

export const EXPLAIN: ExplainSection[] = [
  {
    id: 'wat',
    title: '1. Wat de tool berekent',
    body: [
      'De tool simuleert uur voor uur een heel jaar (8760 uur, na een inregelweek): de warmtevraag van het gebouw, wat de lucht/water-warmtepomp daarvan direct kan leveren, wat het buffervat aanvult of opslaat, het tapwater in de boiler en wat de batterij aan de meterkant afschaaft.',
      '**Overschrijding** is een uur waarin het netvermogen van de WP-groep (warmtepomp + bijstook + batterij) boven het WP-budget $P_{limiet}$ komt. **Comfortverlies** is een uur in gebruikstijd waarin de binnentemperatuur meer dan 0,5 K onder het setpoint ligt. De tool telt dus de uren',
      '$$\\begin{aligned} h_{overschr} &= \\#\\{\\, t : P_{net} > P_{limiet} \\,\\} \\\\ h_{comfort} &= \\#\\{\\, t \\in \\text{gebruik} : T_i < T_{set} - 0{,}5\\,\\mathrm{K} \\,\\} \\end{aligned}$$',
      'De modus *overschrijding tonen* laat de warmtepomp altijd leveren en telt de uren boven het budget; de modus *aansluiting begrenst* houdt het budget hard aan, zodat tekorten als comfortverlies zichtbaar worden. De KPI-kaarten tonen altijd beide gezichtspunten.',
    ],
  },
  {
    id: 'gebouw',
    title: '2. Warmtevraag van het gebouw',
    body: [
      'Het gebouw is één thermische knoop met warmteverliescoëfficiënt $UA$ en warmtecapaciteit $C$. $UA$ volgt uit het ontwerpwarmteverlies bij −10 °C: $UA = P_{ontwerp} / (T_{i,ontwerp} - T_{e,ontwerp})$; de gebouwmassa is een tijdconstante $\\tau$ met $C = \\tau \\cdot UA$.',
      '$$Q = UA\\,(T_i - T_{e,f}) - G$$',
      'Hierin is $T_{e,f}$ de buitentemperatuur na een eerste-orde filter (traagheid van de gevel) en $G$ de interne winst, die via de stookgrens wordt ingevoerd: $G = UA\\,(T_{set} - T_{stookgrens})$. Boven de stookgrens is er dus geen warmtevraag. Na een nachtverlaging mag de regelaar tot de opwarmfactor × het piekvermogen extra leveren om het setpoint terug te winnen; dat geeft de opstookpiek van een kantoor.',
      '**Meerdere woningen** op één warmtepomp rekenen als één gebouw met de totalen. Het piekvermogen is het ontwerpverlies van alle woningen samen: bij −10 °C hebben alle woningen tegelijk hun ontwerpverlies, dus er is geen gelijktijdigheidsfactor. Het tapwater is het aantal woningen × de behoefte per woning, met hetzelfde gemiddelde uurprofiel en één collectief boilervat; omdat dat profiel al een gemiddelde is, past het beter bij veel woningen dan bij één.',
      '$$P_{ontwerp} = n \\cdot P_{woning} \\qquad E_{tap} = n \\cdot E_{tap,woning}$$',
    ],
  },
  {
    id: 'wp',
    title: '3. Lucht/water-warmtepomp',
    body: [
      'Het vermogen wordt opgegeven bij A7/W35. Bij kou daalt het beschikbare vermogen (inclusief ontdooien): factor 0,55 bij −20 °C, 0,70 bij −10 °C, 0,76 bij −7 °C, 0,86 bij 2 °C, 1,00 bij 7 °C en 1,10–1,15 daarboven.',
      '$$COP = \\eta \\, \\frac{T_{aanvoer}}{T_{aanvoer} - T_e} \\cdot f_{ontdooi}$$',
      'met $T$ in kelvin in de teller, een minimale temperatuurlift van 8 K, Carnot-rendement $\\eta$ (standaard 0,45) en een ontdooifactor van 0,9 tussen −5 en 5 °C. De aanvoertemperatuur volgt de stooklijn: de ontwerpaanvoer bij −10 °C, lineair dalend naar de minimale aanvoer bij 15 °C. Bufferladen gebeurt op de maximale aanvoertemperatuur − 2 K en boilerladen op de boilertemperatuur; beide kosten COP.',
    ],
  },
  {
    id: 'buffer',
    title: '4. Warmtebuffer',
    body: [
      '$$E = V \\cdot 1{,}163 \\cdot \\Delta T \\cdot f_{strat}$$',
      'De nuttige temperatuurslag $\\Delta T$ is de laadtemperatuur (maximale WP-aanvoer − 2 K) min de retourtemperatuur van het afgiftesysteem: verder kan het vat niet ontladen. Met MT-afgifte (retour 35 °C) en 60 °C maximale aanvoer is dat 23 K, dus 24 kWh per m³; met HT-afgifte (retour 45 °C) slaat dezelfde kuub maar 14 kWh op. $f_{strat} = 0{,}9$ verdisconteert menging.',
      'Het vat verliest warmte met $UA = 1{,}5\\ \\mathrm{W/K} \\cdot V^{2/3}$ naar een omgeving van 15 °C. *Voorspellend* laden gebeurt alleen als de warmtepomp binnen 24 uur tekortschiet (of als reserve voor de ruimteverwarming tijdens boilerbedrijf); *altijd* laden houdt het vat vol, wat meer stilstandsverlies geeft.',
      'Een buffer overbrugt **uren, geen dagen**: hij vangt opstoken, tapwater en de avondpiek op, zodat de warmtepomp op het gemiddelde van de koude dag kan worden gedimensioneerd. Tegen een koudegolf van dagen helpt hij niet; daarom vlakt de gevoeligheidsgrafiek af.',
    ],
  },
  {
    id: 'batterij',
    title: '5. Batterij',
    body: [
      'Van de bruto capaciteit is 90 % bruikbaar; het rendement is 90 % heen en terug ($\\sqrt{0{,}9} \\approx 0{,}949$ per richting). Het vermogen is standaard 0,5 C (een batterij van 10 kWh levert 5 kW).',
      '$$\\begin{aligned} P_{net} &= P_{el} - P_{bat} \\\\ P_{bat} &= \\min(P_{el} - P_{limiet},\\ P_{bat,max},\\ SoC \\cdot \\eta) \\end{aligned}$$',
      'De batterij ontlaadt alleen om het netvermogen op $P_{limiet}$ te houden en laadt in elk uur onder de budgetlijn bij. Ze schaaft dus de **elektrische** piek aan de meter, terwijl de buffer de **thermische** piek van de warmtepomp afschaaft.',
    ],
  },
  {
    id: 'aansluiting',
    title: '6. Aansluiting en budget',
    body: [
      'De standaardaansluitwaarden zijn 1×25, 1×35 en 1×40 A en 3×25 tot 3×80 A; het vermogen is $P = U\\,I$ bij 1-fase (230 V) en',
      '$$P = \\sqrt{3}\\,U\\,I \\quad (U = 400\\ \\mathrm{V},\\ \\cos\\varphi = 1)$$',
      'bij 3-fase; 3×25 A is dus 17,3 kW. Grootverbruikers geven hun gecontracteerde vermogen op. Het WP-budget is het aandeel van de aansluiting voor warmtepomp en batterij: $P_{limiet} = P_{aansluiting} \\cdot aandeel$.',
      'De rest van de aansluiting wordt op het piekmoment volledig benut verondersteld (koken, wassen, laden): dat is de veilige aanname, omdat de koudste uren vaak samenvallen met de avondpiek van het overige gebruik. Overschrijding van het WP-budget is daarmee overschrijding van de aansluiting.',
      'Bij **meerdere woningen** is de aansluiting die van de collectieve installatie (standaard 3×40 A, waarvan 80 % voor warmtepomp en batterij; de rest voor pompen, ventilatie en algemene ruimten). De woningen zelf hebben elk een eigen aansluiting die hier niet meetelt.',
    ],
  },
  {
    id: 'dimensioneren',
    title: '7. Dimensioneren',
    body: [
      'Het benodigde WP-vermogen is het kleinste vermogen (A7/W35) waarbij, zonder elektrische begrenzing en zonder batterij, het comfort in het gekozen klimaatjaar gehaald wordt en er geen tapwatertekort is. Dat wordt gevonden met bisectie tussen 0,1 en 3 × het piekvermogen (14 stappen).',
      '$$P_{th,min}(V) = \\min \\{ P : h_{comfort}(P, V) \\le h_{toegestaan} \\}$$',
      'Hierin is $h_{comfort}$ het aantal uren comfortverlies (sectie 1) en $h_{toegestaan}$ het toegestane aantal (Aansluiting → Expert). De kleinste passende aansluiting is de eerste standaardaansluiting (zelfde aandeel) waarbij de uren overschrijding niet boven het toegestane aantal komen. De benodigde batterij is de kleinste capaciteit (0,5 C) die de overschrijding bij de huidige aansluiting op 0 uur brengt.',
      'De **gevoeligheidsgrafiek** zet beide samen uit tegen het buffervolume: de oranje lijn (benodigd WP-vermogen) daalt eerst snel en vlakt dan af; de lijnen per batterijgrootte tonen de piek aan de meter. Duikt een lijn onder de referentielijn van een aansluiting, dan is die aansluiting vanaf dat buffervolume toereikend.',
    ],
  },
  {
    id: 'klimaat',
    title: '8. Klimaatjaren',
    body: [
      'NEN 5060:2018 bevat referentiejaren voor De Bilt die zijn samengesteld uit werkelijke kalendermaanden uit 1996–2015: het **energiejaar** (langjarig gemiddeld, voor jaarverbruik en SCOP) en de ontwerpjaren **T5** en **T1** (5 % en 1 % overschrijdingskans, voor pieken). De officiële uurdata zijn niet vrij beschikbaar.',
      'Deze tool gebruikt daarom een **reconstructie** uit open KNMI-uurdata van De Bilt: per maand is de werkelijke maand gekozen waarvan het maandgemiddelde overeenkomt met de gepubliceerde maandgemiddelden van NEN 5060:2018 (binnen 0,05 K), met vloeiende overgangen over 16 uur. Het jaar begint op een maandag, in MET zonder zomertijd, zonder 29 februari. Het is geen officiële NEN 5060-data.',
      '$$\\overline{T}_{maand,reconstructie} - \\overline{T}_{maand,NEN} \\le 0{,}05\\ \\mathrm{K}$$',
      'Daarnaast zijn de werkelijke jaren 1991–2025 beschikbaar als stresstest met echt weer (bijvoorbeeld januari 1997, december 2010, februari 2012). De koude week in de grafieken is de week met de hoogste warmtevraag, niet per se de koudste week.',
    ],
  },
  {
    id: 'beperkingen',
    title: '9. Beperkingen',
    body: [
      'Het gebouw is één thermische knoop: één warmtebalans voor de hele binnentemperatuur, zonder onderscheid tussen ruimtes en zonder zonnewinsten (conservatief).',
      '$$C\\,\\frac{dT_i}{dt} = Q_{geleverd} + G - UA\\,(T_i - T_{e,f})$$',
      'Het opwarmen gebeurt met een vaste opstooktijd. De warmtepompcapaciteit hangt alleen af van de buitentemperatuur; COP via Carnot met een vast rendement; geen cycling of minimale modulatie.',
      'De buffer is een ideale opslag met vaste nuttige ΔT; de batterij is alleen voor de WP-groep, zonder degradatie of tariefsturing. Tapwater volgt een vast dagprofiel; bij meerdere woningen zonder circulatieverlies en zonder extra spreiding door gelijktijdigheid. Aansluitingen rekenen met cos φ = 1 en een volledig benut overig gebruik. De voorspellende laadregel kent het weer van de komende 24 uur.',
      'De uitkomsten zijn indicatief voor conceptkeuze. Productselectie gebeurt altijd met fabrikantdata (capaciteitstabellen, geluid, hydrauliek).',
    ],
  },
];
