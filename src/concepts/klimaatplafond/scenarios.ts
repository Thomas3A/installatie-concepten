// Tien scenario's (§7.8). Basis is steeds de standaardconfiguratie, plus de genoemde wijzigingen.
import {
  defaultConfig,
  defaultValve,
  normalizeConfig,
  type KlimaatplafondConfig,
  type ValveConfig,
} from './model/config';
import { resolveAdvice } from './model/design';

export interface Scenario {
  id: string;
  name: string;
  /** Wat zie je? */
  wat: string;
  /** Probeer zelf */
  probeer: string;
  /** Verwachte ontwerpmeldingen (codes die minimaal aanwezig moeten zijn) */
  expect: string[][];
  /** Aanbevolen starttab */
  tab?: 'dynamiek' | 'puzzel' | 'klep' | 'uitleg';
  build: () => KlimaatplafondConfig;
}

function withValve(cfg: KlimaatplafondConfig, patch: Partial<ValveConfig>): KlimaatplafondConfig {
  cfg.valves[0] = { ...cfg.valves[0], ...patch };
  return cfg;
}

const manual = (...panels: number[]) => panels.map((p) => ({ panels: p, extraLength: 0 }));

export const SCENARIOS: Scenario[] = [
  {
    id: 'S1',
    name: 'S1 · Uitgangssituatie: het optimum',
    wat: '7 strengen × 4 panelen. Koelen: Re ≈ 2.640, Δp ≈ 18 kPa. In de puzzel is te zien dat bij 3 panelen de stroming laminair is en dat bij 5 panelen de drukval oploopt tot ≈ 41 kPa. Er zijn geen fouten of waarschuwingen, alleen info I01 (overgangsgebied). Start koelen vanaf 27 °C en zie de klep terugregelen rond 24 °C.',
    probeer: 'Zet de debietkarakteristiek op lineair en zie de regeling meer doorschieten.',
    expect: [],
    tab: 'dynamiek',
    build: () => defaultConfig(),
  },
  {
    id: 'S2',
    name: 'S2 · Elk paneel apart',
    wat: '12 panelen, elk in een eigen streng (12 × 1): Re ≈ 620 en v ≈ 0,09 m/s. Dat geeft W03 en W04 en een lager vermogen per paneel.',
    probeer: 'Probeer 3 × 4 (zet de koppeling op handmatig of automatisch).',
    expect: [['W03'], ['W04']],
    tab: 'puzzel',
    build: () =>
      withValve(defaultConfig(), {
        panelCount: 12,
        coupling: 'manual',
        manualStrands: manual(...Array(12).fill(1)),
      }),
  },
  {
    id: 'S3',
    name: 'S3 · Alles in serie',
    wat: '12 panelen in één streng: ca. 180 l/h door Cu 8 mm, v ≈ 1,3 m/s en Δp > 400 kPa. Dat geeft W01, W02 en W05.',
    probeer: 'Verdeel de panelen over 3 strengen van 4.',
    expect: [['W01'], ['W02'], ['W05']],
    tab: 'puzzel',
    build: () =>
      withValve(defaultConfig(), { panelCount: 12, coupling: 'manual', manualStrands: manual(12) }),
  },
  {
    id: 'S4',
    name: 'S4 · Ongelijke strengen zonder inregeling',
    wat: '10 panelen als 4·3·3. De streng met 4 panelen krijgt ca. 39 l/h in plaats van 56 (−29 %) en wordt laminair; de strengen met 3 panelen krijgen +21 %. Dat geeft W08 en W03.',
    probeer: 'Probeer 5·5 (de Δp wordt te hoog) of 12 panelen.',
    expect: [['W03'], ['W08']],
    tab: 'puzzel',
    build: () =>
      withValve(defaultConfig(), { panelCount: 10, coupling: 'manual', manualStrands: manual(4, 3, 3) }),
  },
  {
    id: 'S5',
    name: 'S5 · Lange verdeelleiding',
    wat: '40 panelen (automatisch 10 × 4), verdeelleiding 16×2, eerste streng op 2,0 m, Δp 60 kPa. Bij direct retour krijgt de eerste streng +28 % en de laatste −11 % (W08). Schakel naar Tichelmann: +7 % / −5 %, maar de circuitdrukval stijgt van ca. 33 naar ca. 58 kPa en vult daarmee vrijwel het hele beschikbare Δp van 60 kPa.',
    probeer: 'Schakel de aansluitwijze om tussen direct retour en Tichelmann, of vergroot de verdeelleiding.',
    expect: [['W08']],
    tab: 'puzzel',
    build: () => {
      const cfg = defaultConfig();
      cfg.dpAvailable = 60;
      return withValve(cfg, { panelCount: 40, distPipe: '16x2', distanceFirst: 2 });
    },
  },
  {
    id: 'S6',
    name: 'S6 · Eén grote klep of drie kleine',
    wat: 'Vloer 86 m², koellast 2.400 W, warmteverlies 2.100 W, 1 klep met 60 panelen: 15 × 4 aan één verdeelleiding 20×2, +23 % / −9 % ongelijk, circuitdrukval ca. 25 van de 30 kPa.',
    probeer:
      'Zet het aantal kleppen op 3 (elk 20 panelen, 5 × 4): de circuitdrukval daalt naar ca. 14 kPa en de verdeling blijft binnen ±3 %.',
    expect: [['W08']],
    tab: 'puzzel',
    build: () => {
      const cfg = defaultConfig();
      cfg.floorArea = 86;
      cfg.coolLoad = 2400;
      cfg.heatLoss = 2100;
      return withValve(cfg, { panelCount: 60 });
    },
  },
  {
    id: 'S7',
    name: 'S7 · Te kleine ΔT',
    wat: 'Ontwerp-ΔT koelen 1,5 K: het debiet per streng verdubbelt ruwweg. Bij 2 panelen per streng is koelen in orde (Δp ≈ 14 kPa), maar wordt verwarmen laminair (Re ≈ 1.420). Bij 3 panelen loopt de koel-Δp op tot ca. 44 kPa. Er is geen geldige koppeling meer: W06 plus W01 of W03. Vmax koelen stijgt naar ca. 650–900 l/h.',
    probeer: 'Zet de ΔT-manager aan (Type B) en zie debiet én vermogen dalen.',
    expect: [['W06'], ['W01', 'W03']],
    tab: 'puzzel',
    build: () => {
      const cfg = defaultConfig();
      cfg.dtCool = 1.5;
      return cfg;
    },
  },
  {
    id: 'S8',
    name: 'S8 · Condensatie',
    wat: 'RV 65 %: T_dauw ≈ 17,0 °C en T_opp,min ≈ 17,5 °C, dus W09. Met dauwpuntbeveiliging blijft de klep dicht bij koelen (I04). Ook 18 °C aanvoer zit op de grens (T_dauw + 1 K ≈ 18,0 °C) en kost bovendien ca. 35 % vermogen: laminaire strengen en W11.',
    probeer:
      'Verlaag de RV naar 55 % (ontvochtigen via de ventilatie): T_dauw ≈ 14,4 °C en koelen met 16 °C werkt weer.',
    expect: [['W09']],
    tab: 'dynamiek',
    build: () => {
      const cfg = defaultConfig();
      cfg.rh = 65;
      return cfg;
    },
  },
  {
    id: 'S9',
    name: 'S9 · Type A bij beperkt Δp',
    wat: 'Type A, DN15: benodigd Δp ca. 34 kPa (circuit 15 + 6-weg 2,6 + PICV 16) > 30 kPa, dus W02.',
    probeer: 'Zet Δp op 40 kPa: OK. Vergelijk met Type B, dat bij 30 kPa wel voldoet.',
    expect: [['W02']],
    tab: 'klep',
    build: () => withValve(defaultConfig(), { type: 'A', dn: 15 }),
  },
  {
    id: 'S10',
    name: 'S10 · Meer plafond dan nodig',
    wat: '40 panelen (10 × 4) voor een koellast van 1.100 W en een warmteverlies van 1.000 W, met Vmax ingeregeld op het benodigde vermogen. Het plafond kan 1.941 W koelen (Σ ontwerpdebieten 558 l/h), maar Vmax wordt 148 l/h: ca. 15 l/h per streng. Bij verwarmen is Vmax 68 l/h in plaats van 453 l/h. De strengen worden laminair en de stroomsnelheid zakt onder 0,25 m/s (W03, W04); het ΔT loopt op tot ca. 6 K (koelen) en 13 K (verwarmen). Er is geen regelreserve: Vmax levert alleen de last bij het setpoint, dus opwarmen of terugkoelen duurt lang en de regelaar blijft op 100 % (I05).',
    probeer:
      'Zet "Vmax afstellen op" op "Max. plafondvermogen": Vmax stijgt naar 558 l/h en het plafond levert dan 1.941 W (meer dan nodig). Probeer ook 28 panelen.',
    expect: [['W03'], ['W04']],
    tab: 'puzzel',
    build: () => withValve(defaultConfig(), { panelCount: 40, vmaxBasis: 'last' }),
  },
];

export function buildScenario(id: string): KlimaatplafondConfig | null {
  const sc = SCENARIOS.find((s) => s.id === id);
  if (!sc) return null;
  return resolveAdvice(normalizeConfig(sc.build()));
}

export { defaultValve };
