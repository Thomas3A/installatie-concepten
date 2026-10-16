// Hulpfuncties voor de peakshaving-tests: klimaatjaren laden en Python-referentiecases vertalen.
import refJson from '../../src/concepts/peakshaving/data/referentiejaren.json';
import realJson from '../../src/concepts/peakshaving/data/knmi-debilt-1991-2025.json';
import {
  decodeRealYear,
  decodeReferenceYear,
  type RealYearsJson,
  type ReferenceYearName,
  type ReferenceYearsJson,
} from '../../src/concepts/peakshaving/model/climate';
import type {
  Building,
  ClimateYear,
  OperatingMode,
  SimulationSetup,
} from '../../src/concepts/peakshaving/model/types';
import fixture from './fixtures/referentiewaarden.json';

export const REF_JSON = refJson as unknown as ReferenceYearsJson;
export const REAL_JSON = realJson as unknown as RealYearsJson;

const cache = new Map<string, ClimateYear>();

export function refYear(name: ReferenceYearName): ClimateYear {
  let y = cache.get(name);
  if (!y) {
    y = decodeReferenceYear(REF_JSON, name);
    cache.set(name, y);
  }
  return y;
}

export function realYear(year: number): ClimateYear {
  return decodeRealYear(REAL_JSON, year);
}

/** Toleranties van spec §9: vermogens/energieën ±2 % of ±0,02 kW (grootste), uren ±2, temperaturen ±0,05 K. */
export function expectClosePower(actual: number, expected: number, label = ''): void {
  const tol = Math.max(0.02 * Math.abs(expected), 0.02);
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${label}: ${actual} wijkt meer dan ${tol} af van ${expected}`);
  }
}
export function expectCloseHours(actual: number, expected: number, label = ''): void {
  if (!(Math.abs(actual - expected) <= 2)) throw new Error(`${label}: ${actual} h ≠ ${expected} h (±2)`);
}
export function expectCloseTemp(actual: number, expected: number, label = ''): void {
  if (!(Math.abs(actual - expected) <= 0.05))
    throw new Error(`${label}: ${actual} °C ≠ ${expected} °C (±0,05 K)`);
}

// ---- Python-referentiecases (asdict van de dataclasses) ----
interface PyGebouw {
  functie: string;
  P_ontwerp: number;
  T_e_ontwerp: number;
  T_i_ontwerp: number;
  T_set_gebruik: number;
  T_set_nacht: number;
  stookgrens: number;
  tau_gebouw_h: number;
  tau_gevel_h: number;
  f_boost: number;
  opstook_h: number;
  gebruik_start: number;
  gebruik_eind: number;
  tapwater_aan: boolean;
  E_tap_dag: number;
  V_boiler_l: number;
  T_tap: number;
}
interface PyCase {
  naam: string;
  jaar: string;
  hard: boolean;
  gebouw: PyGebouw;
  wp: { P_th_nom: number; eta_carnot: number; stooklijn: string; T_wp_max: number; P_bijstook: number };
  buffer: { V_m3: number; strategie: string };
  batterij: { E_kWh: number; P_kW: number | null };
  elektra: { P_aansluiting: number; aandeel_wp: number };
  kpi: Record<string, number>;
}

export interface FixtureSweepWoning {
  V_m3: number;
  P_th_min: number;
  [bat: string]: number | { P_net_max: number; uren_overschrijding: number; kleinste_aansluiting: string };
}

export const FIXTURE = fixture as unknown as {
  cases: PyCase[];
  sweep_woning_T5: FixtureSweepWoning[];
  sweep_kantoor_T5: Record<string, unknown>[];
};

export function buildingFromPython(g: PyGebouw): Building {
  return {
    use: g.functie === 'kantoor' ? 'office' : 'residential',
    designLoadKw: g.P_ontwerp,
    designOutdoorC: g.T_e_ontwerp,
    designIndoorC: g.T_i_ontwerp,
    setpointUseC: g.T_set_gebruik,
    setpointSetbackC: g.T_set_nacht,
    balanceTempC: g.stookgrens,
    timeConstantH: g.tau_gebouw_h,
    envelopeLagH: g.tau_gevel_h,
    boostFraction: g.f_boost,
    useStartH: g.gebruik_start,
    useEndH: g.gebruik_eind,
    preheatH: g.opstook_h,
    dhw: { enabled: g.tapwater_aan, dailyKwh: g.E_tap_dag, tankLitre: g.V_boiler_l, tankTempC: g.T_tap },
  };
}

export function caseSetup(c: PyCase): { setup: SimulationSetup; climate: ClimateYear; mode: OperatingMode } {
  const share = c.elektra.aandeel_wp;
  const pConn = c.elektra.P_aansluiting;
  return {
    setup: {
      building: buildingFromPython(c.gebouw),
      heatPump: {
        emitterPreset: c.wp.stooklijn as 'LT' | 'MT' | 'HT',
        maxSupplyC: c.wp.T_wp_max,
        carnotEfficiency: c.wp.eta_carnot,
        backupHeaterKw: c.wp.P_bijstook,
        sizingMode: 'manual',
        nominalKw: c.wp.P_th_nom,
      },
      buffer: {
        volumeM3: c.buffer.V_m3,
        strategy: c.buffer.strategie === 'altijd' ? 'always' : 'predictive',
      },
      battery: { capacityKwh: c.batterij.E_kWh, powerKw: c.batterij.P_kW },
      pLimitKw: share > 0 && Number.isFinite(pConn) ? pConn * share : Infinity,
    },
    climate: refYear(c.jaar as ReferenceYearName),
    mode: c.hard ? 'limited' : 'exceedance',
  };
}
