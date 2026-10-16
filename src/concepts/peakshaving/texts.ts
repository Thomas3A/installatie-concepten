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

export const UNIT_HOURS_PER_YEAR = 'uren/jaar';
