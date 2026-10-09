// Configuratie van het klimaatplafond: types, standaardwaarden, validatie en klemmen.
import { CEILING_DEFAULTS, type PanelSize, type Pitch } from '../data/ceiling';
import { DEFAULTS, VALVE_DEFAULTS } from '../data/defaults';
import { DEFAULT_CHECK_LIMITS, LIMITS, type CheckLimits } from '../data/limits';
import { TYPE_A, TYPE_B, type Dn, type PicvId, type ValveType } from '../data/valves';
import type { CopperTubeId, DistPipeId } from '../data/pipes';

export type Mode = 'koelen' | 'verwarmen';
export type Thermal = 'licht' | 'middel' | 'zwaar';
export type FlowChar = 'gelijkprocentig' | 'lineair';
export type Layout = 'direct' | 'tichelmann';
/** Waarop Vmax (bij automatisch) wordt ingeregeld: max. plafondvermogen of benodigd vermogen (last). */
export type VmaxBasis = 'plafond' | 'last';

export const MASS_KJ: Record<Thermal, number> = { licht: 15, middel: 30, zwaar: 60 };

export interface ManualStrand {
  panels: number;
  /** Extra aansluitlengte in m */
  extraLength: number;
}

export interface ValveConfig {
  type: ValveType;
  /** DN van de 6-weg-klep; bepaalt de PICV-keuze (alleen Type A) */
  dn: Dn;
  /** Type A: PICV-uitvoering. null = advies toepassen bij laden. */
  picv: PicvId | null;
  panelCount: number;
  coupling: 'auto' | 'manual';
  manualStrands: ManualStrand[];
  vmaxAuto: boolean;
  /** Uitgangspunt van de automatische Vmax */
  vmaxBasis: VmaxBasis;
  /** l/h, alleen gebruikt als vmaxAuto = false */
  vmaxKoelen: number;
  vmaxVerwarmen: number;
  dtManager: boolean;
  dtMinKoelen: number;
  dtMinVerwarmen: number;
  distPipe: DistPipeId;
  distanceFirst: number;
  spacing: number;
  layout: Layout;
  /** Beschikbaar Δp vóór deze klep (kPa); null = globale waarde */
  dpAvailable: number | null;
  /** Handmatig aandeel van de last (%), alleen bij loadSplit = manual */
  loadShare: number;
}

export interface AdvancedConfig {
  charKoelen: { K: number; n: number };
  charVerwarmen: { K: number; n: number };
  fs: Record<Pitch, number>;
  rCond: number;
  reRef: number;
  zetaBend: number;
  hoseLength: number;
  zetaHose: number;
  zetaT: number;
  /** Ruwheid in mm */
  epsCopper: number;
  epsMulti: number;
  /** kJ/(m²·K) actief oppervlak */
  cPanel: number;
  tOutDesign: number;
  hK: number;
  hZone: number;
  /** Kalibratiefactor op de strengdrukval binnen het netwerk (zie docs/AANNAMES.md) */
  netFactor: number;
  /** Kalibratiefactor op de paneel-tijdconstante τ = f·C·R_char(8 K) + verblijftijd (zie docs/AANNAMES.md) */
  tauFactor: number;
  loadSplit: 'panels' | 'manual';
  valveB: { runtime90: number; nGl: number };
  valveA: { switchTime: number; picvStroke: number };
  limits: CheckLimits;
}

export interface KlimaatplafondConfig {
  // Ruimte en last
  floorArea: number;
  heatLoss: number;
  coolLoad: number;
  mass: Thermal;
  rh: number;
  /** null = auto (setpoint ∓ 3 K) */
  startTemp: number | null;
  keepCurrent: boolean;
  // Water en setpoints
  tSupplyCool: number;
  tSupplyHeat: number;
  dtCool: number;
  dtHeat: number;
  setHeat: number;
  setCool: number;
  // Plafond
  panelSize: PanelSize;
  pitch: Pitch;
  tube: CopperTubeId;
  // Kleppen
  valveCount: 1 | 2 | 3;
  dpAvailable: number;
  dpMax: number;
  valves: ValveConfig[];
  // Regeling en simulatie
  dewProtection: boolean;
  Kp: number;
  Ti: number;
  flowChar: FlowChar;
  speed: 1 | 10 | 60 | 300;
  advanced: AdvancedConfig;
}

export const defaultAdvanced = (): AdvancedConfig => ({
  charKoelen: { ...CEILING_DEFAULTS.charKoelen },
  charVerwarmen: { ...CEILING_DEFAULTS.charVerwarmen },
  fs: { ...CEILING_DEFAULTS.fs },
  rCond: CEILING_DEFAULTS.rCond,
  reRef: CEILING_DEFAULTS.reRef,
  zetaBend: 0.3,
  hoseLength: 0.5,
  zetaHose: 1.0,
  zetaT: 1.0,
  epsCopper: 0.0015,
  epsMulti: 0.007,
  cPanel: CEILING_DEFAULTS.cPanel,
  tOutDesign: -10,
  hK: 1.0,
  hZone: 200,
  netFactor: 0.75,
  tauFactor: 0.5,
  loadSplit: 'panels',
  valveB: { runtime90: TYPE_B.runtime90, nGl: TYPE_B.nGl },
  valveA: { switchTime: TYPE_A.switchTime, picvStroke: TYPE_A.picvStroke },
  limits: { ...DEFAULT_CHECK_LIMITS },
});

export const defaultValve = (panelCount: number = VALVE_DEFAULTS.panelCount): ValveConfig => ({
  type: VALVE_DEFAULTS.type,
  dn: VALVE_DEFAULTS.dn,
  picv: null,
  panelCount,
  coupling: 'auto',
  manualStrands: [],
  vmaxAuto: true,
  vmaxBasis: 'plafond',
  vmaxKoelen: VALVE_DEFAULTS.vmaxKoelen,
  vmaxVerwarmen: VALVE_DEFAULTS.vmaxVerwarmen,
  dtManager: false,
  dtMinKoelen: VALVE_DEFAULTS.dtMinKoelen,
  dtMinVerwarmen: VALVE_DEFAULTS.dtMinVerwarmen,
  distPipe: VALVE_DEFAULTS.distPipe,
  distanceFirst: VALVE_DEFAULTS.distanceFirst,
  spacing: VALVE_DEFAULTS.spacing,
  layout: VALVE_DEFAULTS.layout,
  dpAvailable: null,
  loadShare: 100,
});

export const defaultConfig = (): KlimaatplafondConfig => ({
  ...DEFAULTS,
  startTemp: null,
  keepCurrent: false,
  valves: [defaultValve(VALVE_DEFAULTS.panelCount)],
  advanced: defaultAdvanced(),
});

// ---------------------------------------------------------------- validatie

const clamp = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi);
const num = (x: unknown, fallback: number): number =>
  typeof x === 'number' && Number.isFinite(x) ? x : fallback;
const snap = (x: number, step: number, lo: number): number => lo + Math.round((x - lo) / step) * step;

function clampRange(x: unknown, r: { min: number; max: number; step?: number }, fallback: number): number {
  let v = clamp(num(x, fallback), r.min, r.max);
  if (r.step) v = clamp(Math.round(snap(v, r.step, r.min) * 1e6) / 1e6, r.min, r.max);
  return v;
}

function oneOf<T>(x: unknown, options: readonly T[], fallback: T): T {
  return options.includes(x as T) ? (x as T) : fallback;
}

function normalizeValve(raw: Partial<ValveConfig> | undefined, def: ValveConfig): ValveConfig {
  const r = raw ?? {};
  const type = oneOf<ValveType>(r.type, ['A', 'B'], def.type);
  const dn = oneOf<Dn>(r.dn, [15, 20], def.dn);
  const picvIds: PicvId[] = ['DN15-LF', 'DN15', 'DN15-HF', 'DN20', 'DN20-HF'];
  let picv: PicvId | null = oneOf<PicvId | null>(r.picv ?? null, [...picvIds, null], null);
  if (picv && !picv.startsWith(`DN${dn}`)) picv = null;
  const manual = (Array.isArray(r.manualStrands) ? r.manualStrands : def.manualStrands)
    .slice(0, LIMITS.maxStrands)
    .map((s) => ({
      panels: Math.round(clampRange(s?.panels, { min: 1, max: LIMITS.maxPanelsPerStrand }, 1)),
      extraLength: clampRange(s?.extraLength, LIMITS.extraLength, 0),
    }));
  return {
    type,
    dn,
    picv,
    panelCount: Math.round(clampRange(r.panelCount, LIMITS.panelCount, def.panelCount)),
    coupling: oneOf(r.coupling, ['auto', 'manual'] as const, 'auto'),
    manualStrands: manual,
    vmaxAuto: typeof r.vmaxAuto === 'boolean' ? r.vmaxAuto : def.vmaxAuto,
    vmaxBasis: oneOf<VmaxBasis>(r.vmaxBasis, ['plafond', 'last'], def.vmaxBasis),
    vmaxKoelen: clampRange(r.vmaxKoelen, LIMITS.vmax, def.vmaxKoelen),
    vmaxVerwarmen: clampRange(r.vmaxVerwarmen, LIMITS.vmax, def.vmaxVerwarmen),
    dtManager: type === 'B' && r.dtManager === true,
    dtMinKoelen: clampRange(r.dtMinKoelen, LIMITS.dtMinCool, def.dtMinKoelen),
    dtMinVerwarmen: clampRange(r.dtMinVerwarmen, LIMITS.dtMinHeat, def.dtMinVerwarmen),
    distPipe: oneOf<DistPipeId>(r.distPipe, ['16x2', '20x2', '26x3'], def.distPipe),
    distanceFirst: clampRange(r.distanceFirst, LIMITS.distanceFirst, def.distanceFirst),
    spacing: clampRange(r.spacing, LIMITS.spacing, def.spacing),
    layout: oneOf<Layout>(r.layout, ['direct', 'tichelmann'], 'direct'),
    dpAvailable: r.dpAvailable == null ? null : clampRange(r.dpAvailable, LIMITS.dpAvailable, 30),
    loadShare: clamp(num(r.loadShare, def.loadShare), 0, 100),
  };
}

function normalizeAdvanced(raw: Partial<AdvancedConfig> | undefined): AdvancedConfig {
  const d = defaultAdvanced();
  const r = raw ?? {};
  const pos = (x: unknown, fb: number, lo = 0, hi = Infinity): number => clamp(num(x, fb), lo, hi);
  return {
    charKoelen: {
      K: pos(r.charKoelen?.K, d.charKoelen.K, 1, 50),
      n: pos(r.charKoelen?.n, d.charKoelen.n, 0.8, 1.5),
    },
    charVerwarmen: {
      K: pos(r.charVerwarmen?.K, d.charVerwarmen.K, 1, 50),
      n: pos(r.charVerwarmen?.n, d.charVerwarmen.n, 0.8, 1.5),
    },
    fs: {
      75: pos(r.fs?.[75], d.fs[75], 0.5, 1.5),
      100: pos(r.fs?.[100], d.fs[100], 0.5, 1.5),
      150: pos(r.fs?.[150], d.fs[150], 0.5, 1.5),
    },
    rCond: pos(r.rCond, d.rCond, 0, 0.1),
    reRef: pos(r.reRef, d.reRef, 2500, 20000),
    zetaBend: pos(r.zetaBend, d.zetaBend, 0, 5),
    hoseLength: pos(r.hoseLength, d.hoseLength, 0.05, 3),
    zetaHose: pos(r.zetaHose, d.zetaHose, 0, 5),
    zetaT: pos(r.zetaT, d.zetaT, 0, 5),
    epsCopper: pos(r.epsCopper, d.epsCopper, 0, 1),
    epsMulti: pos(r.epsMulti, d.epsMulti, 0, 1),
    cPanel: pos(r.cPanel, d.cPanel, 0.5, 50),
    tOutDesign: pos(r.tOutDesign, d.tOutDesign, -30, 10),
    hK: pos(r.hK, d.hK, 0, 10),
    hZone: pos(r.hZone, d.hZone, 0, 5000),
    netFactor: pos(r.netFactor, d.netFactor, 0.3, 1.5),
    tauFactor: pos(r.tauFactor, d.tauFactor, 0.1, 2),
    loadSplit: oneOf(r.loadSplit, ['panels', 'manual'] as const, 'panels'),
    valveB: {
      runtime90: pos(r.valveB?.runtime90, d.valveB.runtime90, 10, 600),
      nGl: pos(r.valveB?.nGl, d.valveB.nGl, 1, 6),
    },
    valveA: {
      switchTime: pos(r.valveA?.switchTime, d.valveA.switchTime, 5, 300),
      picvStroke: pos(r.valveA?.picvStroke, d.valveA.picvStroke, 10, 600),
    },
    limits: Object.fromEntries(
      (Object.keys(d.limits) as (keyof CheckLimits)[]).map((k) => [
        k,
        pos(r.limits?.[k], d.limits[k], 0, 1e6),
      ]),
    ) as unknown as CheckLimits,
  };
}

/** Valideer en klem een (mogelijk onvolledige of externe) configuratie. */
export function normalizeConfig(raw: unknown): KlimaatplafondConfig {
  const d = defaultConfig();
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<KlimaatplafondConfig>;
  const valveCount = oneOf<1 | 2 | 3>(r.valveCount, [1, 2, 3], 1);
  const setHeat = clampRange(r.setHeat, LIMITS.setHeat, d.setHeat);
  let setCool = clampRange(r.setCool, LIMITS.setCool, d.setCool);
  if (setCool < setHeat + 1) setCool = Math.min(LIMITS.setCool.max, setHeat + 1);
  const rawValves = Array.isArray(r.valves) ? r.valves : [];
  const valves: ValveConfig[] = [];
  for (let i = 0; i < valveCount; i++)
    valves.push(normalizeValve(rawValves[i], defaultValve(d.valves[0].panelCount)));
  return {
    floorArea: clampRange(r.floorArea, LIMITS.floorArea, d.floorArea),
    heatLoss: clampRange(r.heatLoss, LIMITS.heatLoss, d.heatLoss),
    coolLoad: clampRange(r.coolLoad, LIMITS.coolLoad, d.coolLoad),
    mass: oneOf<Thermal>(r.mass, ['licht', 'middel', 'zwaar'], d.mass),
    rh: clampRange(r.rh, LIMITS.rh, d.rh),
    startTemp: r.startTemp == null ? null : clampRange(r.startTemp, LIMITS.startTemp, 20),
    keepCurrent: r.keepCurrent === true,
    tSupplyCool: clampRange(r.tSupplyCool, LIMITS.tSupplyCool, d.tSupplyCool),
    tSupplyHeat: clampRange(r.tSupplyHeat, LIMITS.tSupplyHeat, d.tSupplyHeat),
    dtCool: clampRange(r.dtCool, LIMITS.dtCool, d.dtCool),
    dtHeat: clampRange(r.dtHeat, LIMITS.dtHeat, d.dtHeat),
    setHeat,
    setCool,
    panelSize: oneOf<PanelSize>(r.panelSize, ['600x1200', '600x600'], d.panelSize),
    pitch: oneOf<Pitch>(r.pitch, [75, 100, 150], d.pitch),
    tube: oneOf<CopperTubeId>(r.tube, ['8x0.5', '10x0.5', '12x0.6'], d.tube),
    valveCount,
    dpAvailable: clampRange(r.dpAvailable, LIMITS.dpAvailable, d.dpAvailable),
    dpMax: clampRange(r.dpMax, LIMITS.dpMax, d.dpMax),
    valves,
    dewProtection: typeof r.dewProtection === 'boolean' ? r.dewProtection : d.dewProtection,
    Kp: clampRange(r.Kp, LIMITS.Kp, d.Kp),
    Ti: clampRange(r.Ti, LIMITS.Ti, d.Ti),
    flowChar: oneOf<FlowChar>(r.flowChar, ['gelijkprocentig', 'lineair'], d.flowChar),
    speed: oneOf<1 | 10 | 60 | 300>(r.speed, [1, 10, 60, 300], d.speed),
    advanced: normalizeAdvanced(r.advanced),
  };
}

/** Verdeel `total` panelen zo gelijk mogelijk over `count` kleppen; de rest gaat naar de eerste kleppen. */
export function distributePanels(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const rest = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rest ? 1 : 0));
}

/** Pas het aantal kleppen aan; panelen worden gelijk verdeeld vanuit het huidige totaal. */
export function withValveCount(cfg: KlimaatplafondConfig, count: 1 | 2 | 3): KlimaatplafondConfig {
  const total = cfg.valves.reduce((a, v) => a + v.panelCount, 0);
  const split = distributePanels(Math.min(total, count * LIMITS.panelCount.max), count);
  const valves: ValveConfig[] = [];
  for (let i = 0; i < count; i++) {
    const base = cfg.valves[i] ?? { ...cfg.valves[0], manualStrands: [], coupling: 'auto' as const };
    // PICV-advies wordt opnieuw bepaald omdat de debieten per klep veranderen
    valves.push({
      ...base,
      panelCount: Math.max(1, split[i]),
      coupling: 'auto',
      manualStrands: [],
      picv: null,
    });
  }
  return { ...cfg, valveCount: count, valves };
}
