// Alle Nederlandse teksten van het peakshaving-concept op één plek (UI, tooltips, meldingen, uitleg).
// Plaatshouders {naam} worden gevuld door model/messages.ts; de sjabloonfuncties onderaan vullen hun getallen zelf
// met fmt() (nl-NL).
import { fmt } from '../../core/format';

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
      'Sta een paar uur comfortverlies toe (Meer instellingen → Beoordeling).',
      'Controleer de opwarmfactor en het verlaagde setpoint (Meer instellingen → Gebouw).',
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
      'Met begrenzer (de aansluiting begrenst) mag de WP-groep niet boven de limiet komen. Wat buffer en batterij niet kunnen overbruggen, wordt niet geleverd; de binnentemperatuur zakt dan meer dan 0,5 K onder het setpoint.',
    ],
    solutions: [
      'Vergroot de buffer (helpt tegen uurpieken) of de batterij (schaaft de elektrische piek af).',
      'Kies een grotere aansluiting of een groter aandeel voor de warmtepomp.',
    ],
  },
  batteryEmpty: {
    title: 'Batterij raakt leeg',
    summary: 'In {hours} uur is de batterij ({capacity} kWh) leeg terwijl de WP-groep boven de limiet zit.',
    why: [
      'De overschrijding duurt langer dan de batterij kan leveren. De batterij laadt alleen bij in uren onder de limiet, en tijdens een koude periode zijn dat er te weinig.',
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
      'De overschrijding boven de limiet is groter dan het ontlaadvermogen van de batterij, terwijl er nog lading over is. Meer kWh helpt dan niet; meer kW wel.',
    ],
    solutions: ['Kies een batterij met een hogere C-waarde (Wat als? → Verfijnen).', 'Vergroot de buffer.'],
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
      'Houd de buffer op het knikpunt in de grafiek boven de bufferschuif.',
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
      'Vergelijk de klimaatjaren in de robuustheidstabel, ook de stresstest 1978/79.',
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
/** Vraagregel onder de titel. */
export const PAGE_QUESTION =
  'Past de warmtepomp op de aansluiting, en hoeveel buffer of batterij is daarvoor nodig?';
/** Korte melding bovenaan op een telefoon of tablet (alleen via CSS zichtbaar); de pagina eronder blijft bruikbaar. */
export const SMALL_SCREEN_NOTICE =
  'Deze tool is gemaakt voor een pc of laptop. Op een telefoon of tablet past niet alles goed; je kunt gewoon verder scrollen, maar voor het beste overzicht open je hem op de pc.';
/** Knoppen Deel link en Print / PDF in de kop. */
export const HEADER_TEXTS = {
  share: 'Deel link',
  shareCopied: '✓ Link gekopieerd',
  shareShown: 'Link getoond',
  sharePrompt: 'Kopieer deze link:',
  print: 'Print / PDF',
  printing: 'Printversie voorbereiden…',
} as const;

/** Extra footerzin voor dit concept (spec §0.1). */
export const FOOTER_CLIMATE =
  'Klimaatdata: KNMI De Bilt (open data); referentiejaren zijn een reconstructie, geen officiële NEN 5060-data.';
export const CLIMATE_RECONSTRUCTION =
  'Reconstructie op basis van KNMI De Bilt; geen officiële NEN 5060-data.';
/** Toelichting onder de statistiekregel in Meer instellingen › Klimaat (spec §4.3), plus de betekenis van ★. */
export const CLIMATE_NOTE =
  'Dimensioneer op T1 (strenge winter, 1 %-ontwerpjaar) en controleer met de stresstest 1978/79. T5 toont een gemiddelde winter, het energiejaar is bedoeld voor jaarverbruik en SCOP. Herhalingstijden zijn empirisch uit 1951–2025 en in het huidige klimaat eerder langer. ★ = aanbevolen stresstestjaar.';
/**
 * Optietekst van de referentiejaren in de keuzelijst Klimaatjaar (spec §4.3). De NEN-jaren zonder
 * "(≈ NEN 5060:2018 …)", want dat staat al in de groepskop ("Referentiejaren (reconstructie NEN 5060:2018)");
 * zo past de gekozen optie in de kolom.
 */
export const CLIMATE_OPTION_LABELS = {
  T1: 'Ontwerpjaar T1 — strenge winter',
  T5: 'Ontwerpjaar T5 — gemiddelde winter',
  energie: 'Energiejaar — langjarig gemiddeld',
  winter1979: 'Stresstest strenge winter 1978/79 (≈ 1× per 25 jaar)',
  winter1963: 'Stresstest extreme winter 1962/63 (≈ 1× per eeuw)',
} as const;

/** Tabbladen van Verdieping, in deze volgorde; Schema (`concept`) is het standaardtabblad. */
export const TAB_LABELS = {
  concept: 'Schema',
  'koude-week': 'Koude week',
  jaar: 'Jaar',
  gevoeligheid: 'Gevoeligheid',
  uitleg: 'Uitleg',
} as const;

/** Toelichting per invoer (spec §3, kolom "Toelichting"). */
export const HELP = {
  use: 'Woning: één woning met een eigen warmtepomp. Meerdere woningen: een woongebouw met één collectieve warmtepomp op een eigen aansluiting. Kantoor: kantoorschema met nachtverlaging en opstoken.',
  dwellings:
    'Aantal woningen op dezelfde warmtepomp. Wijzigen schaalt piekvermogen, tapwaterbehoefte, boilervat, buffer, batterij en een handmatig WP-vermogen mee, zodat de waarden per woning gelijk blijven; de aansluiting blijft. Het piekvermogen stopt bij 2.000 kW: daarboven groeien alleen tapwaterbehoefte en boilervat nog mee, dus daalt het vermogen per woning.',
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
  connection:
    'Aansluitwaarde van het gebouw: P = 0,230·I (1-fase) of 0,400·√3·I (3-fase), cos φ = 1. Bij meerdere woningen: de eigen aansluiting van de collectieve installatie; de woningen hebben elk een eigen aansluiting die hier niet meetelt.',
  contracted: 'Gecontracteerd vermogen bij een grootverbruikaansluiting.',
  share:
    'Welk deel van de aansluiting de warmtepomp (met batterij) mag gebruiken. De rest is voor koken, wassen en laden en telt op het piekmoment volledig mee.',
  /** aanvulling bij meerdere woningen */
  shareMulti:
    'Bij meerdere woningen is dit de aansluiting van de collectieve installatie (de rest: pompen, ventilatie, algemene ruimten); de woningen hebben elk een eigen aansluiting.',
  nightSetback: 'Buiten gebruikstijd 2 K lager stoken; uit = altijd op het gebruikssetpoint.',
  allowedExceedance:
    'Aantal uren per jaar dat de WP-groep boven de limiet mag komen; gebruikt bij "kleinste passende aansluiting".',
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
    'Watervolume van het buffervat. Nuttig per m³ = ΔT × 1,163 × 0,9, met ΔT = laadtemperatuur − retour. Streepjes: opslag voor 2, 4 en 8 uur piekvermogen.',
  strategy:
    'Voorspellend: alleen laden als de warmtepomp binnen 24 uur tekortschiet (of als reserve voor tapwater). Altijd: laden zodra er restcapaciteit is.',
  batteryCapacity:
    'Bruto capaciteit; 90 % is bruikbaar en het rendement is 90 % heen en terug. De batterij is alleen voor de WP-groep. Streepjes: 2, 4 en 8 uur piekvermogen, elektrisch bij COP 3.',
  batteryPower: 'Laad- en ontlaadvermogen als C-waarde (vermogen / capaciteit). Automatisch = 0,5 C.',
  mode: 'Zonder begrenzer levert de warmtepomp altijd en tellen de uren boven de limiet; met begrenzer is de limiet hard en wordt een tekort comfortverlies. Het oordeel bovenaan toont altijd beide; deze keuze geldt voor de grafieken en Alle kerngetallen.',
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
      '**Overschrijding** is een uur waarin het netvermogen van de WP-groep (warmtepomp + bijstook + batterij) boven de WP-limiet $P_{limiet}$ komt. **Comfortverlies** is een uur in gebruikstijd waarin de binnentemperatuur meer dan 0,5 K onder het setpoint ligt. De tool telt dus de uren',
      '$$\\begin{aligned} h_{overschr} &= \\#\\{\\, t : P_{net} > P_{limiet} \\,\\} \\\\ h_{comfort} &= \\#\\{\\, t \\in \\text{gebruik} : T_i < T_{set} - 0{,}5\\,\\mathrm{K} \\,\\} \\end{aligned}$$',
      '*Zonder begrenzer* levert de warmtepomp altijd en telt de tool de uren boven de limiet; *met begrenzer* (de aansluiting begrenst) is de limiet hard, zodat tekorten als comfortverlies zichtbaar worden. Het resultaat toont altijd beide gevolgen: uren boven de limiet zonder begrenzer en uren te koud met begrenzer. De schakelaar boven deze tabbladen geldt voor de grafieken en Alle kerngetallen.',
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
      'De batterij ontlaadt alleen om het netvermogen op $P_{limiet}$ te houden en laadt in elk uur onder de limiet bij. Ze schaaft dus de **elektrische** piek aan de meter, terwijl de buffer de **thermische** piek van de warmtepomp afschaaft.',
    ],
  },
  {
    id: 'aansluiting',
    title: '6. Aansluiting en WP-limiet',
    body: [
      'De standaardaansluitwaarden zijn 1×25, 1×35 en 1×40 A en 3×25 tot 3×80 A; het vermogen is $P = U\\,I$ bij 1-fase (230 V) en',
      '$$P = \\sqrt{3}\\,U\\,I \\quad (U = 400\\ \\mathrm{V},\\ \\cos\\varphi = 1)$$',
      'bij 3-fase; 3×25 A is dus 17,3 kW. Grootverbruikers geven hun gecontracteerde vermogen op. De WP-limiet is het aandeel van de aansluiting voor warmtepomp en batterij: $P_{limiet} = P_{aansluiting} \\cdot aandeel$.',
      'De rest van de aansluiting wordt op het piekmoment volledig benut verondersteld (koken, wassen, laden): dat is de veilige aanname, omdat de koudste uren vaak samenvallen met de avondpiek van het overige gebruik. Overschrijding van de WP-limiet is daarmee overschrijding van de aansluiting.',
      'Bij **meerdere woningen** is de aansluiting die van de collectieve installatie (standaard 3×35 A, waarvan 80 % voor warmtepomp en batterij; de rest voor pompen, ventilatie en algemene ruimten). De woningen zelf hebben elk een eigen aansluiting die hier niet meetelt.',
    ],
  },
  {
    id: 'dimensioneren',
    title: '7. Dimensioneren',
    body: [
      'Het benodigde WP-vermogen is het kleinste vermogen (A7/W35) waarbij, zonder elektrische begrenzing en zonder batterij, het comfort in het gekozen klimaatjaar gehaald wordt en er geen tapwatertekort is. Dat wordt gevonden met bisectie tussen 0,1 en 3 × het piekvermogen (14 stappen).',
      '$$P_{th,min}(V) = \\min \\{ P : h_{comfort}(P, V) \\le h_{toegestaan} \\}$$',
      'Hierin is $h_{comfort}$ het aantal uren comfortverlies (sectie 1) en $h_{toegestaan}$ het toegestane aantal (Meer instellingen → Beoordeling). De kleinste passende aansluiting is de eerste standaardaansluiting (zelfde aandeel) waarbij de uren overschrijding niet boven het toegestane aantal komen. De benodigde batterij is de kleinste capaciteit (0,5 C) die de overschrijding bij de huidige aansluiting op 0 uur brengt.',
      'De **gevoeligheidsgrafiek** zet beide samen uit tegen het buffervolume: de oranje lijn (benodigd WP-vermogen) daalt eerst snel en vlakt dan af; de lijnen per batterijgrootte tonen de piek aan de meter. Duikt een lijn onder de referentielijn van een aansluiting, dan is die aansluiting vanaf dat buffervolume toereikend.',
    ],
  },
  {
    id: 'klimaat',
    title: '8. Klimaatjaren',
    body: [
      'NEN 5060:2018 bevat referentiejaren voor De Bilt die zijn samengesteld uit werkelijke kalendermaanden uit 1996–2015: het **energiejaar** (langjarig gemiddeld, voor jaarverbruik en SCOP) en de ontwerpjaren **T5** en **T1** (5 % en 1 % overschrijdingskans). Ze zijn gemaakt voor temperatuuroverschrijding en koellast; hoe streng hun winter is, is een bijproduct. De officiële uurdata zijn niet vrij beschikbaar.',
      'Vergeleken met alle 74 stookseizoenen van De Bilt sinds 1951 heeft **T1** een strenge winter: december 2010, januari 1997 en februari 1996, koudste week −7,6 °C, ongeveer plaats 8 van 74. Dat is goed voor piekvragen van 1 tot 3 dagen. **T5** heeft een gemiddelde winter (koudste week −4,2 °C), het energiejaar een zachte (−2,5 °C). Een winter als 1955/56, 1962/63, 1978/79 of 1986/87, met een koudste week van −9 tot −10 °C en vorst die weken aanhoudt, zit niet in 1996–2015. Juist die duur bepaalt het plateau in de gevoeligheidsgrafiek: de warmtepomp moet dagen tot weken het gemiddelde zelf leveren.',
      'Deze tool gebruikt een **reconstructie** uit open KNMI-uurdata van De Bilt: per maand is de werkelijke maand gekozen waarvan het maandgemiddelde overeenkomt met de gepubliceerde maandgemiddelden van NEN 5060:2018 (binnen 0,05 K), met vloeiende overgangen over 16 uur. Het jaar begint op een maandag, in MET zonder zomertijd, zonder 29 februari, en wordt cyclisch doorgerekend: december loopt door in januari. Het is geen officiële NEN 5060-data.',
      '$$\\overline{T}_{maand,reconstructie} - \\overline{T}_{maand,NEN} \\le 0{,}05\\ \\mathrm{K}$$',
      'De twee **stresstestjaren** zijn het T1-jaar met het complete werkelijke stookseizoen (1 november t/m 31 maart) van een strenge winter, zodat het weer in dat seizoen aaneengesloten en echt is. **1978/79**: koudste week −10,2 °C (31 december – 6 januari), T min −16,7 °C, Hellmann-getal 206; in 1951–2025 ongeveer eens per 25 jaar. **1962/63**: Hellmann-getal 346, de strengste winter sinds 1830, twee maanden aaneengesloten vorst; ordegrootte eens per eeuw. Het Hellmann-getal telt de vorst van een stookseizoen op over de daggemiddelden onder 0 °C:',
      '$$H = \\sum_{d:\\ \\overline{T}_d < 0} \\left| \\overline{T}_d \\right|$$',
      'De herhalingstijden zijn geteld in 1951–2025. Door de opwarming zijn zulke winters nu zeldzamer, dus in het huidige klimaat is de herhalingstijd eerder langer. Dimensioneer op T1 en controleer met de stresstest 1978/79; 1962/63 laat zien wat een uitzonderlijke winter doet.',
      'Daarnaast zijn de **werkelijke jaren 1951–2025** beschikbaar als stresstest met echt weer (alleen temperatuur, met de echte weekdagen); ★ markeert de aanbevolen jaren 1956, 1963, 1979, 1985, 1986, 1987, 1996, 1997, 2010 en 2012. De koude week in de grafieken is de week met de hoogste warmtevraag, niet per se de koudste week, en mag over de jaargrens lopen.',
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

// ---------------------------------------------------------------------------------------------------------------
// Werkbank: Basis → Resultaat → Wat als? (docs/UX-PLAN-peakshaving.md §7). Aanspreekvorm je/jouw, waar het kan
// onpersoonlijk. Getallen via fmt() (nl-NL); kW-waarden krijgen hun aantal decimalen (`d`) mee van de aanroeper.

/**
 * Buffervolume zonder eenheid: twee decimalen, zoals het getalveld ("0,20", "20,00"). Een rasterpunt naast de
 * schuifstap (het raster rekent met fracties van V_max: 0,05 × 2,5 m³ = 0,125 m³) krijgt zoveel decimalen als nodig
 * (hoogstens 4), zodat een knop, melding of kop de waarde noemt die er echt staat ("0,125 m³", niet "0,13 m³").
 */
export function fmtVolume(volumeM3: number): string {
  let d = 2;
  while (d < 4 && Math.abs(Math.round(volumeM3 * 10 ** d) - volumeM3 * 10 ** d) > 1e-6) d++;
  return fmt(volumeM3, d);
}

/** Tapwaterbehoefte zonder eenheid: hele getallen vanaf 10 zonder decimalen ("10", "12"), anders één ("6,0", "12,5"). */
function fmtKwhPerDay(kwh: number): string {
  return fmt(kwh, kwh >= 10 && Math.abs(kwh - Math.round(kwh)) < 1e-6 ? 0 : 1);
}

/** Stappen van de pagina (het stapnummer staat er in de UI aria-hidden voor). */
export const STEP_TITLES = {
  basis: 'Basis',
  result: 'Resultaat',
  whatIf: 'Wat als?',
  depth: 'Verdieping',
} as const;

/** Badge achter "Meer instellingen" en "Verfijnen": standaard of het aantal aangepaste velden. */
function changedBadge(n: number, none: string): string {
  return n > 0 ? `${fmt(n, 0)} aangepast` : none;
}

/** Knoppen, koppen en korte labels van de werkbank. */
export const UI_LABELS = {
  showResult: 'Bekijk het resultaat',
  edit: 'Wijzig',
  moreSettings: 'Meer instellingen',
  refine: 'Verfijnen',
  defaults: 'standaardwaarden',
  refineDefault: 'standaard',
  changed: (n: number): string => `${fmt(n, 0)} aangepast`,
  /** "Meer instellingen · standaardwaarden" of "Meer instellingen · 2 aangepast" */
  moreSettingsSummary: (n: number): string => `Meer instellingen · ${changedBadge(n, 'standaardwaarden')}`,
  /** "Verfijnen · standaard" of "Verfijnen · 1 aangepast" */
  refineSummary: (n: number): string => `Verfijnen · ${changedBadge(n, 'standaard')}`,
  skipToResult: 'Naar resultaat',
  withoutMeasures: 'Zonder maatregelen',
  undo: 'Ongedaan maken',
  backToOwnInput: 'Terug naar je invoer',
  showInCharts: 'toon in grafieken',
  fullSensitivity: 'volledige gevoeligheid',
  chooseOwnPower: 'eigen vermogen kiezen',
  tour: 'Rondleiding',
  nightSetback: 'Nachtverlaging',
  computing: 'Rekent…',
  calcError: (error: string): string => `Rekenfout: ${error}`,
  retry: 'Opnieuw proberen',
  stale: 'Verouderd',
  close: 'Sluiten',
  answerGroup: 'Antwoord',
  allKpis: (limited: boolean): string => `Alle kerngetallen (8) · ${limited ? 'met' : 'zonder'} begrenzer`,
  noteworthy: 'Opvallend',
  modeField: 'Grafieken en kerngetallen',
  modeOptions: { exceedance: 'Zonder begrenzer', limited: 'Met begrenzer' },
  /** regio en tabrij van Verdieping */
  detailView: 'Detailweergave',
} as const;

/** Groepen in Meer instellingen (H3). */
export const MORE_SETTINGS_GROUPS = {
  climate: 'Klimaat',
  building: 'Gebouw',
  dhw: 'Tapwater',
  heatPump: 'Warmtepomp',
  assessment: 'Beoordeling',
} as const;

/** Teksten van de Basis: regel boven de velden, hints, en het label en de chips van de ingeklapte strook. */
export const BASIS_TEXTS = {
  exampleLine: (shortTitle: string): string =>
    `Ingevuld met voorbeeld „${shortTitle}”. Pas het aan naar je eigen gebouw.`,
  ownInputLine: 'Eigen invoer.',
  stripExample: (shortTitle: string): string => `Voorbeeld · ${shortTitle}`,
  stripOwnInput: 'Eigen invoer',
  /** toegankelijke naam van een chip in de strook */
  chipName: (label: string, value: string): string => `${label}: ${value}, wijzigen`,
  /** limietbalk bij het aandeel: "WP-limiet **3,22 kW** · overig gebruik 4,83 kW" */
  budgetBar: (
    budgetKw: number,
    otherKw: number,
    d: number,
  ): { lead: string; budget: string; rest: string } => ({
    lead: 'WP-limiet ',
    budget: `${fmt(budgetKw, d)} kW`,
    rest: ` · overig gebruik ${fmt(otherKw, d)} kW`,
  }),
  /**
   * Samenvatting als hint onder het vinkje Warm tapwater: "10 kWh/dag · boiler 200 l"; bij meerdere woningen de
   * behoefte per woning (zoals het veld Tapwaterbehoefte per woning) en het collectieve vat:
   * "6,0 kWh/dag per woning · boiler 1.200 l".
   */
  dhwHint: (dailyKwh: number, tankL: number, perDwelling: boolean): string =>
    `${fmtKwhPerDay(dailyKwh)} kWh/dag${perDwelling ? ' per woning' : ''} · boiler ${fmt(tankL, 0)} l`,
  // Waarden van de chips in de ingeklapte strook (§2.3). Gebouw ("Woning", "10 woningen", "Kantoor"), piekvermogen
  // ("8,0 kW", bij meerdere woningen "50,0 kW (5,0 kW/woning)"), aansluiting en klimaatjaar ("T1") hebben al een tekst
  // in het model: buildingText, designLoadText en connectionText (model/kpis.ts) en climateShortName (model/climate.ts).
  /** "tapwater 10 kWh/dag"; bij meerdere woningen per woning: "tapwater 6,0 kWh/dag per woning" */
  chipDhw: (dailyKwh: number, perDwelling = false): string =>
    `tapwater ${fmtKwhPerDay(dailyKwh)} kWh/dag${perDwelling ? ' per woning' : ''}`,
  chipDhwOff: 'geen tapwater',
  /** "limiet 3,22 kW · 40 %"; `d` = decimalen van de limiet (kwDigitsFor) */
  chipBudget: (budgetKw: number, sharePct: number, d: number): string =>
    `limiet ${fmt(budgetKw, d)} kW · ${fmt(sharePct, 0)} %`,
  /** stooklijn als aanvoer/retour bij ontwerpcondities: "MT 45/35" */
  chipEmitter: (preset: string, supplyC: number, returnC: number): string =>
    `${preset} ${fmt(supplyC, 0)}/${fmt(returnC, 0)}`,
  /** knop van de stooklijn in de open Basis: "MT 45" */
  emitterOption: (preset: string, supplyC: number): string => `${preset} ${fmt(supplyC, 0)}`,
  /** kantoor: "gebruik 8–18 uur" */
  chipUseHours: (startH: number, endH: number): string => `gebruik ${fmt(startH, 0)}–${fmt(endH, 0)} uur`,
  /** kantoor: het vinkje Nachtverlaging */
  chipNightSetback: (on: boolean): string => (on ? 'nachtverlaging' : 'geen nachtverlaging'),
  /** kantoor: label van de chip met de gebruikstijden */
  useHoursLabel: 'Gebruikstijden',
  budgetLegend: 'WP-limiet',
  otherLegend: 'overig gebruik',
} as const;

/** Keuzelijst Voorbeelden in de kop. */
export const EXAMPLES_TEXTS = {
  label: 'Voorbeelden',
  ownInput: 'Eigen invoer',
  savedOwnInput: '↩ Je eigen invoer (bewaard)',
  groups: { single: 'Woning', multi: 'Meerdere woningen', office: 'Kantoor' },
} as const;

/** Meldingenlijst: lege lijst, ernst als tekst (kleur is nooit de enige drager) en "Waarom?". */
export const MESSAGE_UI = {
  region: 'Meldingen',
  empty: 'Geen bijzonderheden.',
  why: 'Waarom?',
  solutions: 'Wat helpt',
  severity: {
    error: { icon: '✕', text: 'Kritiek' },
    warning: { icon: '!', text: 'Let op' },
    info: { icon: 'i', text: 'Info' },
  },
} as const;

/** Toelichting boven de robuustheidstabel. */
export const ROBUSTNESS_NOTE = (heatPumpKw: number): string =>
  `Zelfde warmtepomp (${fmt(heatPumpKw, 1)} kW), ander weer. Overschrijding: zonder begrenzer; comfortverlies: als de aansluiting begrenst.`;

/**
 * Percentage in hele procenten; een klein maar echt verschil dat op 0 zou afronden wordt "< 1" ("0,01 kW (< 1 %)"),
 * zoals de tegel Boven de limiet "< 1 kWh/jaar" zegt.
 */
function fmtPct(pct: number): string {
  return pct > 0 && pct < 0.5 ? '< 1' : fmt(pct, 0);
}

/** Steekwoorden van het oordeel in de vaste balk onderaan. */
const VERDICT_WORDS = {
  sizingFailed: 'Niet te dimensioneren',
  nearlyFit: 'Past net niet',
  notFit: 'Past niet',
  withinAllowed: 'Past binnen toegestane uren',
  fitAmple: 'Past ruim',
  fit: 'Past',
} as const;

/** Oordeel, tegels, meterbalk en gevolgregels van het Resultaat (§4). */
export const VERDICT_TEXTS = {
  headline: {
    sizingFailed: 'Warmtepomp niet te dimensioneren',
    nearlyFit: (conn: string): string => `Past net niet op ${conn}`,
    notFit: (conn: string): string => `Past niet op ${conn}`,
    withinAllowed: (conn: string, allowedH: number): string =>
      `Past op ${conn}, binnen de toegestane ${fmt(allowedH, 0)} uur`,
    fitAmple: (conn: string, measures: string): string => `Past ruim op ${conn}${measures}`,
    fit: (conn: string, measures: string): string => `Past op ${conn}${measures}`,
  },
  /** " met 0,50 m³ buffer", " met 5,0 kWh batterij", " met 1,00 m³ buffer en 5,0 kWh batterij" of leeg */
  measures: (volumeM3: number, batteryKwh: number): string => {
    const parts: string[] = [];
    if (volumeM3 > 0) parts.push(`${fmtVolume(volumeM3)} m³ buffer`);
    if (batteryKwh > 0) parts.push(`${fmt(batteryKwh, 1)} kWh batterij`);
    return parts.length > 0 ? ` met ${parts.join(' en ')}` : '';
  },
  /**
   * Niet te dimensioneren: wat er bij de terugvalwaarde (3 × het piekvermogen) misgaat, gevolgd door de eerste
   * oplossing die bij de invoer past (view/verdict.ts kiest die). Zonder bekende oorzaak de algemene samenvatting.
   */
  sizingFailedCause: {
    comfort: 'Ook met 3 × het piekvermogen wordt het comfort niet gehaald.',
    dhw: 'Ook met 3 × het piekvermogen wordt het tapwater niet gehaald.',
    both: 'Ook met 3 × het piekvermogen worden het comfort en het tapwater niet gehaald.',
    unknown: MESSAGE_TEXTS.sizingFailed.summary,
  },
  sizingFailedDetail: (cause: string, solution: string | null): string =>
    solution ? `${cause} ${solution}` : cause,
  /** boven het toegestane aantal uren */
  over: (hours: number, budgetKw: number, overKw: number, pct: number, d: number): string =>
    `${fmt(hours, 0)} uur per jaar boven de WP-limiet van ${fmt(budgetKw, d)} kW, tot ${fmt(overKw, d)} kW (${fmtPct(pct)} %) erboven.`,
  /** boven de limiet, maar binnen het toegestane aantal uren */
  within: (hours: number, budgetKw: number, overKw: number, d: number): string =>
    `${fmt(hours, 0)} uur per jaar boven de WP-limiet van ${fmt(budgetKw, d)} kW, tot ${fmt(overKw, d)} kW erboven.`,
  margin: (peakKw: number, marginKw: number, pct: number, budgetKw: number, d: number): string =>
    `Piek aan de meter ${fmt(peakKw, d)} kW, ${fmt(marginKw, d)} kW (${fmtPct(pct)} %) onder de limiet van ${fmt(budgetKw, d)} kW.`,
  /** zonder afschaving, met een marge die afgerond 0 is (bijv. een buffer die precies tot de limiet laadt) */
  atBudget: (peakKw: number, d: number): string => `Piek aan de meter ${fmt(peakKw, d)} kW = limiet.`,
  shaved: (peakKw: number, shavedKw: number, d: number): string =>
    `Piek aan de meter ${fmt(peakKw, d)} kW = limiet; de batterij schaaft ${fmt(shavedKw, d)} kW af.`,
  /** modus "met begrenzer": de piek zonder batterij is daar niet bekend */
  shavedLimited: (peakKw: number, d: number): string =>
    `Piek aan de meter ${fmt(peakKw, d)} kW = limiet; de batterij schaaft de piek af.`,
  /** visueel verborgen statusregel */
  live: (headline: string, hours: number): string =>
    `${headline}: ${fmt(hours, 0)} uur per jaar boven de limiet.`,
  words: VERDICT_WORDS,
  /** vaste balk onderaan: "Past niet · 101 uur · WP 10,6 kW"; zonder WP-vermogen (null) zonder het laatste deel */
  mini: (status: keyof typeof VERDICT_WORDS, hours: number, heatPumpKw: number | null): string =>
    `${VERDICT_WORDS[status]} · ${fmt(hours, 0)} uur` +
    (heatPumpKw !== null ? ` · WP ${fmt(heatPumpKw, 1)} kW` : ''),
  fixesLabel: { help: 'Wat helpt', smaller: 'Kleinere aansluiting volstaat ook' },
  fix: {
    buffer: (volumeM3: number, withoutBattery: boolean): string =>
      `${fmtVolume(volumeM3)} m³ buffer${withoutBattery ? ' (zonder batterij)' : ''}`,
    battery: (kwh: number): string => `${fmt(kwh, 1)} kWh batterij`,
    share: (pct: number): string => `of ${fmt(pct, 0)} % voor de warmtepomp`,
    trySmaller: (conn: string): string => `Probeer ${conn}`,
    /** kleinere aansluiting die een batterij nodig heeft: alleen de aansluiting, het oordeel noemt dan de batterij */
    trySmallerBattery: (conn: string): string => `Probeer ${conn} (met batterij)`,
    trySmallerWith: (conn: string, volumeM3: number, kwh: number): string => {
      const parts: string[] = [];
      if (volumeM3 > 0) parts.push(`${fmtVolume(volumeM3)} m³ buffer`);
      if (kwh > 0) parts.push(`${fmt(kwh, 1)} kWh batterij`);
      return parts.length > 0 ? `Probeer ${conn} met ${parts.join(' en ')}` : `Probeer ${conn}`;
    },
    /** grijze plaatshouder zolang het gevoeligheidsraster rekent */
    pending: 'wordt berekend…',
  },
  /** tekst in de melding "… · Ongedaan maken" na een knop */
  undo: {
    buffer: (volumeM3: number): string => `Buffer op ${fmtVolume(volumeM3)} m³`,
    battery: (kwh: number): string => `Batterij op ${fmt(kwh, 1)} kWh`,
    connection: (conn: string): string => `Aansluiting ${conn}`,
    share: (pct: number): string => `Aandeel voor warmtepomp ${fmt(pct, 0)} %`,
    smaller: (conn: string, volumeM3: number, kwh: number): string => {
      const parts: string[] = [];
      if (volumeM3 > 0) parts.push(`${fmtVolume(volumeM3)} m³ buffer`);
      if (kwh > 0) parts.push(`${fmt(kwh, 1)} kWh batterij`);
      return parts.length > 0 ? `${conn} met ${parts.join(' en ')}` : `Aansluiting ${conn}`;
    },
    withoutMeasures: 'Zonder maatregelen',
    /** achter "Batterij op 1,0 kWh" als een knop een handmatig batterijvermogen op automatisch zet */
    powerAuto: ' · vermogen automatisch (0,5 C)',
  },
  tiles: {
    heatPump: 'Warmtepomp',
    heatPumpManual: 'Warmtepomp (handmatig)',
    /** thermisch vermogen, zoals op de KPI-kaart en in Verfijnen */
    heatPumpUnit: 'kW th',
    heatPumpLine: (kwAtMinus10: number, kwPerDwelling: number | null): string =>
      `A7/W35 · ${fmt(kwAtMinus10, 1)} kW bij −10 °C` +
      (kwPerDwelling !== null ? ` · ${fmt(kwPerDwelling, 1)} kW/woning` : ''),
    heatPumpNeeded: (kw: number): string =>
      Number.isFinite(kw) ? `benodigd ${fmt(kw, 1)} kW` : 'benodigd: niet te bepalen',
    /**
     * "zonder maatregelen 10,6 kW (−1,2)" bij een warmtepomp van `withKw` kW. Het verschil komt uit de getoonde
     * (afgeronde) waarden, zodat de rekensom op het scherm klopt (9,4 − 10,6 = −1,2); alleen als het niet 0 is.
     */
    heatPumpRef: (kw: number, withKw: number): string => {
      const delta = Math.round(withKw * 10) / 10 - Math.round(kw * 10) / 10;
      return (
        `zonder maatregelen ${fmt(kw, 1)} kW` +
        (Math.abs(delta) >= 0.05 ? ` (${delta > 0 ? '+' : ''}${fmt(delta, 1)})` : '')
      );
    },
    exceedance: 'Boven de limiet',
    /**
     * "12 kWh/jaar"; hoe ver de piek boven de limiet komt, staat al in de detailzin. Een kleine hoeveelheid die op 0
     * zou afronden wordt "< 1 kWh/jaar": er zijn immers uren boven de limiet.
     */
    exceedanceLine: (kwh: number): string => (kwh > 0 && kwh < 0.5 ? '< 1' : fmt(kwh, 0)) + ' kWh/jaar',
    exceedanceNone: 'geen enkel uur',
    exceedanceRef: (hours: number): string => `zonder maatregelen ${fmt(hours, 0)} uur`,
    smallest: 'Kleinste aansluiting',
    // de huidige aansluiting staat al in de kop ("Past niet op 1×35 A"), in de stapper en in de strook
    smallestEqual: 'gelijk aan de huidige',
    smallestSteps: (steps: number): string => {
      const n = Math.abs(steps);
      return `${fmt(n, 0)} ${n === 1 ? 'stap' : 'stappen'} ${steps > 0 ? 'groter' : 'kleiner'} dan de huidige`;
    },
    /** grootverbruik: geen aantal stappen */
    smallestLarger: 'groter dan de huidige',
    smallestSmaller: 'kleiner dan de huidige',
    smallestRef: (conn: string): string => `zonder maatregelen ${conn}`,
    hoursUnit: 'uur/jaar',
  },
  meter: {
    peak: (peakKw: number, d: number): string => `Piek aan de meter ${fmt(peakKw, d)} kW`,
    /** label van de limietstreep: "limiet 3,22 kW" (aandeel en aansluiting staan in de stapper en de strook) */
    budget: (budgetKw: number, d: number): string => `limiet ${fmt(budgetKw, d)} kW`,
    without: (kw: number, d: number): string => `zonder maatregelen ${fmt(kw, d)} kW`,
    aria: (peakKw: number, budgetKw: number, d: number): string =>
      `Piek aan de meter ${fmt(peakKw, d)} kW tegen de WP-limiet van ${fmt(budgetKw, d)} kW`,
  },
  /** gevolg met begrenzer (modus "aansluiting begrenst") */
  limiter: (hours: number, minIndoorC: number, dhwShortfallH: number): string =>
    `Met begrenzer: ${hours === 0 ? 'geen uur' : `${fmt(hours, 0)} uur`} te koud (laagste ${fmt(minIndoorC, 1)} °C)` +
    (dhwShortfallH > 0 ? ` · ${fmt(dhwShortfallH, 0)} uur tapwatertekort` : '') +
    '.',
  /** stresstest (spec §4.3): dimensioneren op T1, controleren met de strenge winter 1978/79 */
  stress: (exceedanceH: number, comfortLossH: number): string =>
    `Strenge winter 1978/79: ${fmt(exceedanceH, 0)} uur boven de limiet, ${fmt(comfortLossH, 0)} uur te koud.`,
  /**
   * 1978/79 zelf gekozen. Bij automatisch WP-vermogen is de warmtepomp op dat jaar gedimensioneerd: dat zeggen, want de
   * regel "Strenge winter 1978/79: … uur te koud" bij een ander jaar gold voor de warmtepomp van dat jaar.
   */
  stressSelf: (autoSized: boolean): string =>
    autoSized
      ? 'Dit is al de stresstest (1978/79); de warmtepomp is op dit jaar gedimensioneerd.'
      : 'Dit is al de stresstest (1978/79).',
} as const;

/** Hendels in Wat als? (§5): effectregels, stapper, mini-grafiek en Verfijnen. */
export const WHATIF_TEXTS = {
  bufferNone: (kwhPerM3: number): string => `Geen buffer · ${fmt(kwhPerM3, 1)} kWh per m³`,
  /** opslagdeel van de bufferregel, alleen uit de invoer: "12,0 kWh opslag ≈ 1,5 uur piekvermogen" */
  bufferStorage: (kwh: number, hours: number): string =>
    `${fmt(kwh, 1)} kWh opslag ≈ ${fmt(hours, 1)} uur piekvermogen`,
  /**
   * warmtepompdeel van de bufferregel, uit de doorrekening: "warmtepomp 10,6 → 9,4 kW". Niet te dimensioneren (NaN):
   * geen "– → – kW" maar "warmtepomp niet te dimensioneren"; lukt het alleen zonder buffer niet, dan alleen de waarde
   * met buffer.
   */
  bufferSizing: (withoutKw: number, withKw: number, manual: boolean): string => {
    const hp = manual ? 'benodigde warmtepomp' : 'warmtepomp';
    return !Number.isFinite(withKw)
      ? `${hp} niet te dimensioneren`
      : Number.isFinite(withoutKw)
        ? `${hp} ${fmt(withoutKw, 1)} → ${fmt(withKw, 1)} kW`
        : `${hp} ${fmt(withKw, 1)} kW (zonder buffer niet te dimensioneren)`;
  },
  bufferPlateau: 'Meer buffer maakt de warmtepomp niet kleiner: een buffer overbrugt uren, geen dagen.',
  batteryNeeded: (kwh: number): string => `Kleinste batterij voor 0 uur: ${fmt(kwh, 1)} kWh`,
  batteryInfeasible: 'Geen batterij binnen bereik haalt 0 uur boven de limiet.',
  batteryNotNeeded: (conn: string): string => `Niet nodig op ${conn}.`,
  batteryHelpsSmaller: 'Een batterij helpt pas bij een kleinere aansluiting.',
  /**
   * Warmtepomp niet te dimensioneren: geen advies, want dat zou rekenen met de terugvalwaarde (3 × het piekvermogen)
   * die het oordeel en de tegel juist niet tonen.
   */
  batterySizingFailed: 'Geen advies zolang de warmtepomp niet te dimensioneren is (zie Resultaat).',
  /** afgerond gelijk aan de limiet (bijv. een buffer die precies tot de limiet laadt): niet "onder" */
  batteryIdle: (peakKw: number, budgetKw: number, d: number): string =>
    fmt(peakKw, d) === fmt(budgetKw, d)
      ? `Doet nu niets: de piek (${fmt(peakKw, d)} kW) komt al niet boven de limiet.`
      : `Doet nu niets: de piek (${fmt(peakKw, d)} kW) blijft al onder de limiet (${fmt(budgetKw, d)} kW).`,
  batteryEffect: (
    usableKwh: number,
    powerKw: number,
    noBatteryKw: number,
    peakKw: number,
    d: number,
  ): string =>
    `${fmt(usableKwh, 1)} kWh bruikbaar · ${fmt(powerKw, 1)} kW · meterpiek ${fmt(noBatteryKw, d)} → ${fmt(peakKw, d)} kW`,
  batteryEffectLimited: (usableKwh: number, powerKw: number): string =>
    `${fmt(usableKwh, 1)} kWh bruikbaar · ${fmt(powerKw, 1)} kW`,
  batteryMore: (kwh: number): string => ` · voor 0 uur: ${fmt(kwh, 1)} kWh`,
  /** de batterij is ruim groter dan nodig: de kleinste batterij voor 0 uur (met de knop "Zet") */
  batteryEnough: (kwh: number): string => ` · ${fmt(kwh, 1)} kWh is al genoeg`,
  setTo: (kwh: number): string => `Zet op ${fmt(kwh, 1)} kWh`,
  set: 'Zet',
  /** knop bij de batterij; de UI zet er een ◀ (aria-hidden) voor */
  trySmaller: (conn: string): string => `Probeer ${conn}`,
  connectionLabel: 'Aansluiting',
  /** "1×35 A · 8,05 kW · limiet 3,22 kW (40 %)" */
  stepper: (label: string, kw: string, budget: string, pct: number): string =>
    `${label} · ${kw} kW · limiet ${budget} kW (${fmt(pct, 0)} %)`,
  smallerConnection: 'Kleinere aansluiting',
  largerConnection: 'Grotere aansluiting',
  miniTitle: 'Benodigde warmtepomp [kW]',
  miniPending: 'Grafiek wordt berekend…',
  miniError: 'Grafiek niet beschikbaar.',
  /** het raster is klaar, maar bij geen enkel buffervolume is de warmtepomp te dimensioneren */
  miniUnsizable: 'Grafiek niet beschikbaar: warmtepomp niet te dimensioneren.',
  miniManual: 'Suggesties gelden voor een automatisch gedimensioneerde warmtepomp.',
  miniPlateau: (minKw: number, kneeM3: number): string =>
    `${fmt(minKw, 1)} kW vanaf ${fmtVolume(kneeM3)} m³: meer helpt niet`,
  miniPlateauAtZero: (minKw: number): string =>
    `${fmt(minKw, 1)} kW: een buffer maakt de warmtepomp niet kleiner`,
  /** de lijn daalt tot het einde van de schuif: geen plateau, wel het laagste punt */
  miniEndOfRange: (minKw: number, maxM3: number): string =>
    `${fmt(minKw, 1)} kW bij ${fmtVolume(maxM3)} m³ (einde bereik)`,
  miniAriaPending: 'Benodigde warmtepomp per buffervolume',
  miniAriaEnd: (firstKw: number, minKw: number, maxM3: number): string =>
    `Benodigde warmtepomp per buffervolume: ${fmt(firstKw, 1)} kW zonder buffer, ${fmt(minKw, 1)} kW bij ${fmtVolume(maxM3)} m³`,
  miniAria: (firstKw: number, minKw: number, kneeM3: number): string =>
    `Benodigde warmtepomp per buffervolume: ${fmt(firstKw, 1)} kW zonder buffer, ${fmt(minKw, 1)} kW vanaf ${fmtVolume(kneeM3)} m³`,
  /** naam van een stip: "1×35 A" (stip (a), zonder batterij) of "1×25 A + 7,5 kWh" (stip (b)) */
  dotName: (conn: string, kwh: number): string => (kwh > 0 ? `${conn} + ${fmt(kwh, 1)} kWh` : conn),
  /** zichtbaar label van een stip, met het buffervolume (de x-as heeft geen m³): "1×35 A · 0,20 m³" */
  dotLabel: (name: string, volumeM3: number): string => `${name} · ${fmtVolume(volumeM3)} m³`,
  /** naam en tooltip van een stip: "1×25 A + 7,5 kWh past vanaf 0,60 m³: zet buffer, batterij en aansluiting" */
  dotAria: (label: string, volumeM3: number, alsoConnection: boolean, alsoBattery = alsoConnection): string =>
    `${label} past vanaf ${fmtVolume(volumeM3)} m³: zet buffer` +
    (alsoConnection ? (alsoBattery ? ', batterij en aansluiting' : ' en aansluiting') : ''),
  refineSizingHint: (factor: number, neededKw: number): string =>
    `${fmt(factor, 2)} × piekvermogen · benodigd ${Number.isFinite(neededKw) ? `${fmt(neededKw, 1)} kW` : 'niet te bepalen'}`,
  /** markering onder de schuiven van buffer en batterij: uren piekvermogen ("2 h") */
  markerHours: (hours: number): string => `${fmt(hours, 0)} h`,
} as const;

/** Wat als? › Verfijnen: labels en opties, ongewijzigd uit de oude panelen Warmtepomp & afgifte en Maatregelen. */
export const REFINE_TEXTS = {
  sizing: 'WP-vermogen',
  sizingOptions: { auto: 'Automatisch', manual: 'Handmatig' },
  nominal: 'WP-vermogen (A7/W35)',
  nominalUnit: 'kW th',
  strategy: 'Laadstrategie buffer',
  strategyOptions: { predictive: 'Voorspellend', always: 'Altijd' },
  batteryAuto: 'Batterijvermogen automatisch (0,5 C)',
  batteryCRate: 'Batterijvermogen (C-waarde)',
  batteryPowerHint: (kw: number): string => `= ${fmt(kw, 1)} kW laden/ontladen`,
} as const;

/** Meldingen onderaan (niet modaal, met één actie). */
export const TOAST_TEXTS = {
  exampleLoaded: (shortTitle: string): string => `Voorbeeld „${shortTitle}” geladen`,
  kindLoaded: (kind: 'single' | 'multi' | 'office'): string =>
    `Standaardwaarden voor ${{ single: 'woning', multi: 'meerdere woningen', office: 'kantoor' }[kind]} geladen`,
  /** terug naar de gebouwfunctie van de bewaarde eigen invoer: die komt terug in plaats van de standaardwaarden */
  ownInputRestored: 'Je eigen invoer teruggezet',
  undo: 'Ongedaan maken',
  backToOwnInput: 'Terug naar je invoer',
  close: 'Melding sluiten',
} as const;

export interface TourStep {
  /** data-tour-anker (ui/tour/anchors.ts) */
  anchor: 'basis' | 'budget' | 'verdict' | 'buffer' | 'battery-connection';
  title: string;
  text: string;
}

/**
 * Rondleiding (§8): één zin per stap, zonder getallen, zodat de tekst bij elke invoer klopt. De titels zonder het
 * stapnummer van de pagina: naast de teller "n van 5" zou dat een tweede, ander nummer zijn.
 */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    anchor: 'basis',
    title: STEP_TITLES.basis,
    text: 'Begin hier met je gebouw en aansluiting; de rest staat op gangbare standaardwaarden onder Meer instellingen.',
  },
  {
    anchor: 'budget',
    title: 'WP-limiet',
    text: 'Hier kies je welk deel van de aansluiting de warmtepomp mag gebruiken: tegen die WP-limiet wordt alles getoetst.',
  },
  {
    anchor: 'verdict',
    title: STEP_TITLES.result,
    text: 'Hier staat het antwoord: past de warmtepomp binnen de limiet, hoeveel uur per jaar niet, en wat zou helpen.',
  },
  {
    anchor: 'buffer',
    title: STEP_TITLES.whatIf,
    text: 'Schuif met de buffer: de benodigde warmtepomp daalt tot de lijn vlak wordt; meer buffer helpt daarna niet, want een buffer overbrugt uren, geen dagen.',
  },
  {
    anchor: 'battery-connection',
    title: 'Batterij en aansluiting',
    text: 'Een batterij schaaft de piek aan de meter af: probeer met ◀ ▶ een andere aansluiting en kijk welke batterij dan nodig is.',
  },
];

export const TOUR_TEXTS = {
  counter: (n: number, total: number): string => `${fmt(n, 0)} van ${fmt(total, 0)}`,
  previous: 'Vorige',
  next: 'Volgende',
  skip: 'Overslaan',
  done: 'Klaar',
} as const;
