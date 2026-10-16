// Invoer normaliseren (begrenzen, niet weigeren), gebouwfunctie wisselen en het piekvermogen schalen (spec §3).
import { CONNECTIONS, LARGE_CONNECTION_ID, type ConnectionId } from '../data/connections';
import { defaultInput, defaultInputOfKind } from '../data/defaults';
import { EMITTER_PRESETS, MAX_SUPPLY_OPTIONS, type EmitterPreset } from '../data/heatPumpCurves';
import { clamp } from '../../../core/interp';
import { BATTERY_C_RATE_MAX, BATTERY_C_RATE_MIN } from './battery';
import { DEFAULT_CLIMATE_YEAR, isValidClimateYearId } from './climate';
import { deriveRanges, type Ranges } from './ranges';
import type { Building, BuildingKind, BuildingUse, PeakshavingInput } from './types';

/** Geldige bereiken van de invoer (spec §3.1–§3.4). */
export const LIMITS = {
  /** aantal woningen op één warmtepomp (buiten de spec) */
  dwellings: [1, 500],
  designLoadKw: [1, 2000],
  designOutdoorC: [-15, -5],
  designIndoorC: [18, 24],
  setpointUseC: [16, 24],
  setpointSetbackC: [10, 24],
  balanceTempC: [8, 18],
  timeConstantH: [8, 120],
  envelopeLagH: [0, 12],
  boostFraction: [0, 1],
  useStartH: [0, 23],
  useEndH: [1, 24],
  preheatH: [0, 8],
  /** per woning (bij meerdere woningen geldt het bereik × aantal woningen) */
  dhwDailyKwh: [0, 50],
  tankLitre: [0, 2000],
  tankTempC: [45, 65],
  contractedKw: [10, 5000],
  heatPumpShare: [0.1, 1],
  allowedHours: [0, 200],
  carnotEfficiency: [0.35, 0.55],
  backupHeaterKw: [0, 50],
} as const satisfies Record<string, readonly [number, number]>;

type Obj = Record<string, unknown>;

function num(v: unknown, fallback: number, [lo, hi]: readonly [number, number]): number {
  const x = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return clamp(x, lo, hi);
}
function int(v: unknown, fallback: number, range: readonly [number, number]): number {
  return Math.round(num(v, fallback, range));
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function pick<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}
function obj(v: unknown): Obj {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
}

const CONNECTION_IDS: readonly ConnectionId[] = [...CONNECTIONS.map((c) => c.id), LARGE_CONNECTION_ID];
const PRESETS = Object.keys(EMITTER_PRESETS) as EmitterPreset[];

/** Dichtstbijzijnde toegestane maximale aanvoertemperatuur. */
function snapMaxSupply(v: unknown, fallback: number): number {
  // eerst begrenzen: bij extreem grote getallen vallen de afstanden anders samen
  const lo = MAX_SUPPLY_OPTIONS[0];
  const hi = MAX_SUPPLY_OPTIONS[MAX_SUPPLY_OPTIONS.length - 1];
  const x = clamp(typeof v === 'number' && Number.isFinite(v) ? v : fallback, lo, hi);
  let best: number = MAX_SUPPLY_OPTIONS[0];
  for (const o of MAX_SUPPLY_OPTIONS) if (Math.abs(o - x) < Math.abs(best - x)) best = o;
  return best;
}

/**
 * Maak van willekeurige (deels ontbrekende of foute) invoer een geldige invoer: onbekende velden vallen terug op de
 * standaard van de gebouwfunctie, getallen worden begrensd op hun bereik.
 */
export function normalizeInput(raw: unknown): PeakshavingInput {
  const r = obj(raw);
  const rb = obj(r.building);
  const use: BuildingUse = pick(rb.use, ['residential', 'office'] as const, 'residential');
  const d = defaultInput(use);
  const rg = obj(r.grid);
  const rh = obj(r.heatPump);
  const rbuf = obj(r.buffer);
  const rbat = obj(r.battery);
  const rdhw = obj(rb.dhw);

  const heatPump = {
    emitterPreset: pick(rh.emitterPreset, PRESETS, d.heatPump.emitterPreset),
    maxSupplyC: snapMaxSupply(rh.maxSupplyC, d.heatPump.maxSupplyC),
    carnotEfficiency: num(rh.carnotEfficiency, d.heatPump.carnotEfficiency, LIMITS.carnotEfficiency),
    backupHeaterKw: num(rh.backupHeaterKw, d.heatPump.backupHeaterKw, LIMITS.backupHeaterKw),
    sizingMode: pick(rh.sizingMode, ['auto', 'manual'] as const, d.heatPump.sizingMode),
    nominalKw: 0,
  };

  const designLoadKw = num(rb.designLoadKw, d.building.designLoadKw, LIMITS.designLoadKw);
  // kantoor is altijd één gebouw; bij woningen schalen de tapwatergrenzen met het aantal
  const dwellings = use === 'office' ? 1 : int(rb.dwellings, d.building.dwellings, LIMITS.dwellings);
  const perDwelling = ([lo, hi]: readonly [number, number]): [number, number] => [lo, hi * dwellings];
  const useStartH = int(rb.useStartH, d.building.useStartH, LIMITS.useStartH);
  const setpointUseC = num(rb.setpointUseC, d.building.setpointUseC, LIMITS.setpointUseC);
  const building = {
    use,
    dwellings,
    designLoadKw,
    designOutdoorC: num(rb.designOutdoorC, d.building.designOutdoorC, LIMITS.designOutdoorC),
    designIndoorC: num(rb.designIndoorC, d.building.designIndoorC, LIMITS.designIndoorC),
    setpointUseC,
    // verlaagd setpoint en stookgrens niet boven het gebruikssetpoint (anders negatieve winsten of "opstoken" omlaag)
    setpointSetbackC: Math.min(
      num(rb.setpointSetbackC, d.building.setpointSetbackC, LIMITS.setpointSetbackC),
      setpointUseC,
    ),
    balanceTempC: Math.min(num(rb.balanceTempC, d.building.balanceTempC, LIMITS.balanceTempC), setpointUseC),
    timeConstantH: num(rb.timeConstantH, d.building.timeConstantH, LIMITS.timeConstantH),
    envelopeLagH: num(rb.envelopeLagH, d.building.envelopeLagH, LIMITS.envelopeLagH),
    boostFraction: num(rb.boostFraction, d.building.boostFraction, LIMITS.boostFraction),
    useStartH,
    // gebruik duurt minimaal één uur
    useEndH: int(rb.useEndH, d.building.useEndH, [useStartH + 1, LIMITS.useEndH[1]]),
    preheatH: int(rb.preheatH, d.building.preheatH, LIMITS.preheatH),
    dhw: {
      enabled: bool(rdhw.enabled, d.building.dhw.enabled),
      dailyKwh: num(rdhw.dailyKwh, d.building.dhw.dailyKwh * dwellings, perDwelling(LIMITS.dhwDailyKwh)),
      tankLitre: num(rdhw.tankLitre, d.building.dhw.tankLitre * dwellings, perDwelling(LIMITS.tankLitre)),
      // boilertemperatuur begrensd op de maximale WP-aanvoer
      tankTempC: Math.min(
        num(rdhw.tankTempC, d.building.dhw.tankTempC, LIMITS.tankTempC),
        heatPump.maxSupplyC,
      ),
    },
  };

  const ranges = deriveRanges(use, designLoadKw, heatPump);
  heatPump.nominalKw = num(rh.nominalKw, designLoadKw, [ranges.heatPumpMinKw, ranges.heatPumpMaxKw]);

  const grid = {
    connection: pick(rg.connection, CONNECTION_IDS, d.grid.connection),
    contractedKw: num(rg.contractedKw, d.grid.contractedKw, LIMITS.contractedKw),
    heatPumpShare: num(rg.heatPumpShare, d.grid.heatPumpShare, LIMITS.heatPumpShare),
    allowedExceedanceH: int(rg.allowedExceedanceH, d.grid.allowedExceedanceH, LIMITS.allowedHours),
    allowedComfortLossH: int(rg.allowedComfortLossH, d.grid.allowedComfortLossH, LIMITS.allowedHours),
    mode: pick(rg.mode, ['exceedance', 'limited'] as const, d.grid.mode),
  };

  const buffer = {
    volumeM3: num(rbuf.volumeM3, 0, [0, ranges.bufferMaxM3]),
    strategy: pick(rbuf.strategy, ['predictive', 'always'] as const, d.buffer.strategy),
  };
  const capacityKwh = num(rbat.capacityKwh, 0, [0, ranges.batteryMaxKwh]);
  const battery = {
    capacityKwh,
    // zonder batterij geen handmatig vermogen: bij een latere capaciteit weer automatisch 0,5 C
    powerKw:
      capacityKwh > 0 && typeof rbat.powerKw === 'number' && Number.isFinite(rbat.powerKw)
        ? clamp(rbat.powerKw, BATTERY_C_RATE_MIN * capacityKwh, BATTERY_C_RATE_MAX * capacityKwh)
        : null,
  };

  return {
    climateYear: isValidClimateYearId(r.climateYear) ? r.climateYear : DEFAULT_CLIMATE_YEAR,
    building,
    grid,
    heatPump,
    buffer,
    battery,
  };
}

/** Bereiken bij een invoer. */
export function rangesOf(input: PeakshavingInput): Ranges {
  return deriveRanges(input.building.use, input.building.designLoadKw, input.heatPump);
}

/** Keuze in de UI bij een gebouw: één woning, meerdere woningen of kantoor. */
export function buildingKind(b: Pick<Building, 'use' | 'dwellings'>): BuildingKind {
  return b.use === 'office' ? 'office' : b.dwellings > 1 ? 'multi' : 'single';
}

/** Andere keuze (één woning, meerdere woningen, kantoor): standaardinvoer van die keuze, klimaatjaar blijft. */
export function switchKind(input: PeakshavingInput, kind: BuildingKind): PeakshavingInput {
  if (buildingKind(input.building) === kind) return input;
  return normalizeInput({ ...defaultInputOfKind(kind), climateYear: input.climateYear });
}

/** Andere gebouwfunctie: standaardinvoer van die functie, klimaatjaar blijft. */
export function switchUse(input: PeakshavingInput, use: BuildingUse): PeakshavingInput {
  if (input.building.use === use) return input;
  return normalizeInput({ ...defaultInput(use), climateYear: input.climateYear });
}

/**
 * Ander aantal woningen: het gebouw groeit met dezelfde woningen mee. Piekvermogen (met buffer, batterij en een
 * handmatig WP-vermogen, zie withDesignLoad), tapwaterbehoefte en boilervat schalen proportioneel, zodat de waarden
 * per woning gelijk blijven; de aansluiting blijft.
 */
export function withDwellings(input: PeakshavingInput, requested: number): PeakshavingInput {
  if (input.building.use === 'office' || !Number.isFinite(requested)) return input;
  const dwellings = Math.round(clamp(requested, LIMITS.dwellings[0], LIMITS.dwellings[1]));
  const old = input.building.dwellings;
  if (dwellings === old) return input;
  const scaled = withDesignLoad(input, (input.building.designLoadKw * dwellings) / old);
  const f = dwellings / old;
  const { dhw } = input.building;
  return normalizeInput({
    ...scaled,
    building: {
      ...scaled.building,
      dwellings,
      dhw: { ...dhw, dailyKwh: dhw.dailyKwh * f, tankLitre: dhw.tankLitre * f },
    },
  });
}

/**
 * Nieuw piekvermogen: buffer, batterij en een handmatig WP-vermogen schalen proportioneel mee (de gebruiker houdt
 * dezelfde "uren piekvermogen"); daarna begrenzen op de nieuwe bereiken.
 */
export function withDesignLoad(input: PeakshavingInput, requestedKw: number): PeakshavingInput {
  if (!Number.isFinite(requestedKw)) return input;
  // eerst begrenzen, dan schalen: anders klopt de verhouding niet bij een waarde buiten het bereik
  const designLoadKw = clamp(requestedKw, LIMITS.designLoadKw[0], LIMITS.designLoadKw[1]);
  const old = input.building.designLoadKw;
  const f = old > 0 ? designLoadKw / old : 1;
  return normalizeInput({
    ...input,
    building: { ...input.building, designLoadKw },
    heatPump: { ...input.heatPump, nominalKw: input.heatPump.nominalKw * f },
    buffer: { ...input.buffer, volumeM3: input.buffer.volumeM3 * f },
    battery: {
      ...input.battery,
      capacityKwh: input.battery.capacityKwh * f,
      powerKw: input.battery.powerKw === null ? null : input.battery.powerKw * f,
    },
  });
}
