// Invoervelden van het Geavanceerd-paneel (tabelgestuurd), los van React zodat ze testbaar zijn.
import type { AdvancedConfig } from '../model/config';

export type AdvKey = string[];

export interface AdvDef {
  path: AdvKey;
  label: string;
  unit?: string;
  min: number;
  max: number;
  step: number;
  scale?: number;
  info?: string;
}

export const ADV_GROUPS: { title: string; fields: AdvDef[] }[] = [
  {
    title: 'Plafondkarakteristiek q = f_s · K · ΔT^n',
    fields: [
      { path: ['charKoelen', 'K'], label: 'K koelen', min: 1, max: 50, step: 0.1 },
      { path: ['charKoelen', 'n'], label: 'n koelen', min: 0.8, max: 1.5, step: 0.01 },
      { path: ['charVerwarmen', 'K'], label: 'K verwarmen', min: 1, max: 50, step: 0.1 },
      { path: ['charVerwarmen', 'n'], label: 'n verwarmen', min: 0.8, max: 1.5, step: 0.01 },
      { path: ['fs', '75'], label: 'f_s steek 75', min: 0.5, max: 1.5, step: 0.01 },
      { path: ['fs', '100'], label: 'f_s steek 100', min: 0.5, max: 1.5, step: 0.01 },
      { path: ['fs', '150'], label: 'f_s steek 150', min: 0.5, max: 1.5, step: 0.01 },
    ],
  },
  {
    title: 'Warmteoverdracht',
    fields: [
      {
        path: ['rCond'],
        label: 'R_cond (buis → plaat)',
        unit: 'm²K/W',
        min: 0,
        max: 0.1,
        step: 0.001,
        info: 'Geleidingsweerstand van buis naar plaatoppervlak.',
      },
      {
        path: ['reRef'],
        label: 'Re_ref karakteristiek',
        min: 2500,
        max: 20000,
        step: 100,
        info: 'Reynoldsgetal waarbij de karakteristiek is gemeten.',
      },
    ],
  },
  {
    title: 'Weerstanden en ruwheid',
    fields: [
      { path: ['zetaBend'], label: 'ζ per 180°-bocht', min: 0, max: 5, step: 0.05 },
      { path: ['hoseLength'], label: 'Koppelslang lengte', unit: 'm', min: 0.05, max: 3, step: 0.05 },
      { path: ['zetaHose'], label: 'ζ per koppeling', min: 0, max: 5, step: 0.1 },
      { path: ['zetaT'], label: 'ζ per T-stuk', min: 0, max: 5, step: 0.1 },
      { path: ['epsCopper'], label: 'Ruwheid koper', unit: 'mm', min: 0, max: 1, step: 0.0005 },
      { path: ['epsMulti'], label: 'Ruwheid meerlagenbuis', unit: 'mm', min: 0, max: 1, step: 0.001 },
    ],
  },
  {
    title: 'Paneel, last en zones',
    fields: [
      { path: ['cPanel'], label: 'C_paneel', unit: 'kJ/(m²K)', min: 0.5, max: 50, step: 0.5 },
      {
        path: ['tOutDesign'],
        label: 'Ontwerp-buitentemp. verwarmen',
        unit: '°C',
        min: -30,
        max: 10,
        step: 1,
      },
      { path: ['hK'], label: 'Transmissie koelen h_k', unit: 'W/(m²K)', min: 0, max: 10, step: 0.1 },
      { path: ['hZone'], label: 'Koppeling zones H_z', unit: 'W/K', min: 0, max: 5000, step: 10 },
    ],
  },
  {
    title: 'Klepdynamiek',
    fields: [
      { path: ['valveB', 'runtime90'], label: 'Type B: looptijd 90°', unit: 's', min: 10, max: 600, step: 5 },
      { path: ['valveB', 'nGl'], label: 'Type B: n_gl', min: 1, max: 6, step: 0.1 },
      {
        path: ['valveA', 'switchTime'],
        label: 'Type A: omschakeltijd',
        unit: 's',
        min: 5,
        max: 300,
        step: 5,
      },
      {
        path: ['valveA', 'picvStroke'],
        label: 'Type A: PICV volle slag',
        unit: 's',
        min: 10,
        max: 600,
        step: 5,
      },
    ],
  },
  {
    title: 'Kalibratie op de referentieberekening',
    fields: [
      {
        path: ['netFactor'],
        label: 'Strengdrukval in netwerk',
        min: 0.3,
        max: 1.5,
        step: 0.01,
        info: 'Factor op de strengdrukval binnen het netwerk (circuitdrukval en verdeling). 0,75 reproduceert de referentiewaarden (S1, S5, S6); 1,0 gebruikt exact dezelfde strengdrukval als de puzzelmatrix.',
      },
      {
        path: ['tauFactor'],
        label: 'Paneel-tijdconstante',
        min: 0.1,
        max: 2,
        step: 0.05,
        info: 'Factor op τ = C_paneel·R_char(8 K) + verblijftijd. 0,5 reproduceert de referentiedynamiek; 1,0 is de letterlijke formule (verwarmen is dan zwak gedempt).',
      },
    ],
  },
  {
    title: 'Grenswaarden meldingen',
    fields: [
      { path: ['limits', 'vMin'], label: 'v min', unit: 'm/s', min: 0, max: 2, step: 0.05 },
      { path: ['limits', 'vMax'], label: 'v max', unit: 'm/s', min: 0.2, max: 3, step: 0.05 },
      { path: ['limits', 'reLaminar'], label: 'Re laminair', min: 500, max: 5000, step: 50 },
      { path: ['limits', 'reTransition'], label: 'Re overgang', min: 1000, max: 10000, step: 100 },
      { path: ['limits', 'dtMinCool'], label: 'ΔT min koelen', unit: 'K', min: 0.5, max: 6, step: 0.5 },
      { path: ['limits', 'dtMinHeat'], label: 'ΔT min verwarmen', unit: 'K', min: 0.5, max: 10, step: 0.5 },
      {
        path: ['limits', 'exhaustedDt'],
        label: 'Uitgeputte streng (W07)',
        unit: 'K',
        min: 0.1,
        max: 5,
        step: 0.1,
      },
      {
        path: ['limits', 'maldistWarn'],
        label: 'Ongelijkheid waarschuwing',
        unit: '%',
        min: 1,
        max: 100,
        step: 1,
        scale: 100,
      },
      {
        path: ['limits', 'maldistInfo'],
        label: 'Ongelijkheid info',
        unit: '%',
        min: 1,
        max: 100,
        step: 1,
        scale: 100,
      },
      { path: ['limits', 'dewMargin'], label: 'Marge boven dauwpunt', unit: 'K', min: 0, max: 5, step: 0.5 },
      {
        path: ['limits', 'ceilingMaxHeat'],
        label: 'Plafond max. verwarmen',
        unit: '°C',
        min: 25,
        max: 45,
        step: 1,
      },
      {
        path: ['limits', 'feasibleFraction'],
        label: 'Haalbaar debiet (W02)',
        unit: '%',
        min: 50,
        max: 100,
        step: 1,
        scale: 100,
      },
      { path: ['limits', 'maxDpB'], label: 'Max. Δp Type B', unit: 'kPa', min: 10, max: 1000, step: 10 },
      { path: ['limits', 'maxDpA'], label: 'Max. Δp Type A', unit: 'kPa', min: 10, max: 1000, step: 10 },
      {
        path: ['limits', 'occupancy'],
        label: 'Bezetting (I02)',
        unit: '%',
        min: 10,
        max: 100,
        step: 1,
        scale: 100,
      },
    ],
  },
];

export function getPath(obj: unknown, path: AdvKey): number {
  return path.reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as number;
}

export function setPath(adv: AdvancedConfig, path: AdvKey, value: number): AdvancedConfig {
  const next = JSON.parse(JSON.stringify(adv)) as Record<string, unknown>;
  let o = next;
  for (let i = 0; i < path.length - 1; i++) o = o[path[i]] as Record<string, unknown>;
  o[path[path.length - 1]] = value;
  return next as unknown as AdvancedConfig;
}
