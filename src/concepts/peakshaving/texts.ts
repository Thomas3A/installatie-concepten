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

export const UNIT_HOURS_PER_YEAR = 'uren/jaar';

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
  use: 'Schakelt de gebruiksschema’s en de standaardwaarden van alle invoer.',
  designLoad:
    'Ontwerpwarmteverlies (transmissie + ventilatie) bij T_e = −10 °C en de ontwerpbinnentemperatuur, exclusief opwarmtoeslag (NEN-EN 12831). Dit is de eerste invoer; de bereiken van buffer, batterij en warmtepomp worden hiervan afgeleid.',
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
  tank: 'Inhoud van het boilervat; 85 % is benutbaar.',
  tankTemp: 'Boilertemperatuur; begrensd op de maximale aanvoertemperatuur van de warmtepomp.',
  connection: 'Aansluitwaarde van het gebouw: P = 0,230·I (1-fase) of 0,400·√3·I (3-fase), cos φ = 1.',
  contracted: 'Gecontracteerd vermogen bij een grootverbruikaansluiting.',
  share:
    'Deel van de aansluiting voor warmtepomp + batterij. De rest is voor overig gebruik en wordt op het piekmoment volledig benut verondersteld.',
  allowedExceedance:
    'Aantal uren per jaar dat de WP-groep boven het budget mag komen; gebruikt bij "kleinste passende aansluiting".',
  allowedComfort:
    'Aantal uren comfortverlies per jaar dat bij het dimensioneren van de warmtepomp is toegestaan.',
  emitter:
    'Stooklijn: LT 35/28 °C (vloerverwarming, klimaatplafond), MT 45/35 °C (LT-radiatoren), HT 55/45 °C (bestaande radiatoren); aanvoer/retour bij ontwerpcondities.',
  maxSupply:
    'Maximale aanvoertemperatuur van de warmtepomp; de buffer wordt geladen tot deze temperatuur − 2 K.',
  carnot: 'Carnot-rendement: COP = η·T_aanvoer/(T_aanvoer − T_e)·f_ontdooi.',
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
