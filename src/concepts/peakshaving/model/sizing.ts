// Dimensionering en afgeleide adviezen (spec §5.9): WP-vermogen, kleinste aansluiting, benodigde batterij, gevoeligheid.
import {
  CONNECTIONS,
  LARGE_CONNECTION_ID,
  LARGE_CONNECTION_LABEL,
  type ConnectionId,
} from '../data/connections';
import { limitFromConnection } from './grid';
import { prepareYear, simulate, type PreparedYear } from './simulate';
import type { Battery, Building, ClimateYear, HeatPump, SimulationSetup, ThermalBuffer } from './types';

export const SIZING_LOW = 0.1;
export const SIZING_HIGH = 3;
export const SIZING_ITERATIONS = 14;
export const BATTERY_SEARCH_FACTOR = 4;
export const BATTERY_ITERATIONS = 12;

function prep(b: Building, hp: HeatPump, climate: ClimateYear, prepared?: PreparedYear): PreparedYear {
  return prepared ?? prepareYear(b, hp, climate);
}

/**
 * Kleinste P_th,nom (A7/W35) waarbij zonder elektrische begrenzing en zonder batterij, in modus 'limited',
 * het comfort gehaald wordt (uren comfortverlies ≤ toegestaan) en er geen tapwatertekort is.
 * Bisectie op [0,1; 3]·designLoadKw, 14 iteraties, resultaat = bovengrens; NaN als 3× niet volstaat.
 */
export function sizeHeatPump(
  b: Building,
  hp: HeatPump,
  buffer: ThermalBuffer,
  climate: ClimateYear,
  allowedComfortLossH = 0,
  prepared?: PreparedYear,
): number {
  const p = prep(b, hp, climate, prepared);
  const battery: Battery = { capacityKwh: 0, powerKw: null };
  const ok = (nominalKw: number): boolean => {
    const r = simulate(
      { building: b, heatPump: { ...hp, nominalKw }, buffer, battery, pLimitKw: Infinity },
      climate,
      {
        mode: 'limited',
        prepared: p,
        record: false,
        abortAbove: { comfortLossHours: allowedComfortLossH, dhwShortfallHours: 0 },
      },
    ).kpis;
    return r.comfortLossHours <= allowedComfortLossH && r.dhwShortfallHours === 0;
  };
  let lo = SIZING_LOW * b.designLoadKw;
  let hi = SIZING_HIGH * b.designLoadKw;
  if (!ok(hi)) return NaN;
  for (let i = 0; i < SIZING_ITERATIONS; i++) {
    const mid = 0.5 * (lo + hi);
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

export interface ConnectionAdvice {
  id: ConnectionId;
  label: string;
  /** aansluitvermogen [kW]; bij grootverbruik het benodigde gecontracteerde vermogen */
  powerKw: number;
  /** uren overschrijding bij deze aansluiting */
  exceedanceHours: number;
}

/**
 * Kleinste standaardaansluiting (zelfde aandeel) met uren overschrijding ≤ toegestaan in modus 'exceedance';
 * anders grootverbruik met ceil(P_net,max / aandeel / 5)·5 kW (P_net,max bij de grootste standaardaansluiting).
 */
export function smallestConnection(
  setup: Omit<SimulationSetup, 'pLimitKw'>,
  share: number,
  climate: ClimateYear,
  allowedExceedanceH = 0,
  prepared?: PreparedYear,
): ConnectionAdvice {
  const p = prep(setup.building, setup.heatPump, climate, prepared);
  let lastPeak = NaN;
  for (const c of CONNECTIONS) {
    const last = c === CONNECTIONS[CONNECTIONS.length - 1];
    const r = simulate({ ...setup, pLimitKw: limitFromConnection(c.powerKw, share) }, climate, {
      mode: 'exceedance',
      prepared: p,
      record: false,
      // de grootste aansluiting volledig doorrekenen: P_net,max is nodig voor het grootverbruikadvies
      abortAbove: last ? undefined : { exceedanceHours: allowedExceedanceH },
    }).kpis;
    if (r.exceedanceHours <= allowedExceedanceH)
      return { id: c.id, label: c.label, powerKw: c.powerKw, exceedanceHours: r.exceedanceHours };
    lastPeak = r.pGridMaxKw;
  }
  const required = share > 0 ? Math.ceil(lastPeak / share / 5) * 5 : NaN;
  return { id: LARGE_CONNECTION_ID, label: LARGE_CONNECTION_LABEL, powerKw: required, exceedanceHours: NaN };
}

export interface BatteryAdvice {
  feasible: boolean;
  /** benodigde bruto capaciteit [kWh] (bij 0,5 C); NaN als niet haalbaar */
  capacityKwh: number;
}

/**
 * Benodigde batterij voor 0 uur overschrijding bij de huidige aansluiting, WP en buffer:
 * bisectie op [0, E_max·4] (vermogen 0,5 C), 12 iteraties.
 */
export function requiredBattery(
  setup: Omit<SimulationSetup, 'battery'>,
  climate: ClimateYear,
  eMaxKwh: number,
  prepared?: PreparedYear,
): BatteryAdvice {
  const p = prep(setup.building, setup.heatPump, climate, prepared);
  const hours = (capacityKwh: number): number =>
    simulate({ ...setup, battery: { capacityKwh, powerKw: null } }, climate, {
      mode: 'exceedance',
      prepared: p,
      record: false,
      abortAbove: { exceedanceHours: 0 },
    }).kpis.exceedanceHours;
  if (hours(0) === 0) return { feasible: true, capacityKwh: 0 };
  let lo = 0;
  let hi = BATTERY_SEARCH_FACTOR * eMaxKwh;
  if (hours(hi) > 0) return { feasible: false, capacityKwh: NaN };
  for (let i = 0; i < BATTERY_ITERATIONS; i++) {
    const mid = 0.5 * (lo + hi);
    if (hours(mid) === 0) hi = mid;
    else lo = mid;
  }
  return { feasible: true, capacityKwh: hi };
}

/** Buffervolumes van het gevoeligheidsraster als fractie van V_max (spec §5.9). */
export const SENSITIVITY_VOLUME_FRACTIONS = [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
/** Batterijen van het gevoeligheidsraster als fractie van E_max. */
export const SENSITIVITY_BATTERY_FRACTIONS = [0, 0.25, 0.5, 1.0];

export interface SensitivityCell {
  capacityKwh: number;
  pGridMaxKw: number;
  exceedanceHours: number;
  smallest: ConnectionAdvice;
}

export interface SensitivityRow {
  volumeM3: number;
  /** P_th,min(V) [kW] */
  nominalKw: number;
  cells: SensitivityCell[];
}

/** Eén rij van het gevoeligheidsraster: eerst P_th,min(V), dan per batterij netpiek, overschrijding en kleinste aansluiting. */
export function sensitivityRow(
  base: { building: Building; heatPump: HeatPump; buffer: ThermalBuffer; pLimitKw: number; share: number },
  climate: ClimateYear,
  volumeM3: number,
  batteriesKwh: readonly number[],
  allowedComfortLossH: number,
  allowedExceedanceH: number,
  prepared?: PreparedYear,
): SensitivityRow {
  const p = prep(base.building, base.heatPump, climate, prepared);
  const buffer: ThermalBuffer = { ...base.buffer, volumeM3 };
  const nominalKw = sizeHeatPump(base.building, base.heatPump, buffer, climate, allowedComfortLossH, p);
  const cells: SensitivityCell[] = batteriesKwh.map((capacityKwh) => {
    if (!Number.isFinite(nominalKw)) {
      return {
        capacityKwh,
        pGridMaxKw: NaN,
        exceedanceHours: NaN,
        // WP niet te dimensioneren: ook geen aansluitadvies
        smallest: { id: LARGE_CONNECTION_ID, label: 'niet te bepalen', powerKw: NaN, exceedanceHours: NaN },
      };
    }
    const setup = {
      building: base.building,
      heatPump: { ...base.heatPump, nominalKw },
      buffer,
      battery: { capacityKwh, powerKw: null },
    };
    const r = simulate({ ...setup, pLimitKw: base.pLimitKw }, climate, {
      mode: 'exceedance',
      prepared: p,
      record: false,
    }).kpis;
    return {
      capacityKwh,
      pGridMaxKw: r.pGridMaxKw,
      exceedanceHours: r.exceedanceHours,
      smallest: smallestConnection(setup, base.share, climate, allowedExceedanceH, p),
    };
  });
  return { volumeM3, nominalKw, cells };
}
