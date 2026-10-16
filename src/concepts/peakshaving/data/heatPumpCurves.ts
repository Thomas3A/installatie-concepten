// Karakteristieken van de lucht/water-warmtepomp en stooklijnpresets (spec §5.2).
import type { Table } from '../../../core/interp';

/** Capaciteitsfactor t.o.v. A7/W35 (incl. ontdooien en capaciteitsverlies bij kou), lineair, geklemd. */
export const CAPACITY_FACTOR_TABLE: Table = [
  [-20, 0.55],
  [-15, 0.62],
  [-10, 0.7],
  [-7, 0.76],
  [2, 0.86],
  [7, 1.0],
  [15, 1.1],
  [25, 1.15],
];

/** Ontdooifactor op de COP: dip tussen −7 en 7 °C, daarbuiten 1,0. */
export const DEFROST_TABLE: Table = [
  [-7, 1.0],
  [-5, 0.9],
  [5, 0.9],
  [7, 1.0],
];

/** Minimale temperatuurlift in de Carnot-formule [K] (voorkomt onrealistische COP bij kleine lift). */
export const MIN_LIFT_K = 8;
export const COP_MIN = 1.2;
export const COP_MAX = 7.0;
/** Buitentemperatuur waarboven de stooklijn op de minimale aanvoertemperatuur staat [°C]. */
export const HEATING_CURVE_END_C = 15;
/** Aanlegverschil tussen maximale WP-aanvoer en laadtemperatuur van de buffer [K]. */
export const BUFFER_CHARGE_MARGIN_K = 2;

export type EmitterPreset = 'LT' | 'MT' | 'HT';

export interface EmitterPresetDef {
  id: EmitterPreset;
  /** aanvoertemperatuur bij de ontwerpbuitentemperatuur [°C] */
  supplyDesignC: number;
  /** retourtemperatuur bij ontwerpcondities [°C] */
  returnDesignC: number;
  /** aanvoertemperatuur bij T_e ≥ 15 °C [°C] */
  supplyMinC: number;
  label: string;
  description: string;
}

export const EMITTER_PRESETS: Record<EmitterPreset, EmitterPresetDef> = {
  LT: {
    id: 'LT',
    supplyDesignC: 35,
    returnDesignC: 28,
    supplyMinC: 25,
    label: 'LT 35/28 °C',
    description: 'Vloerverwarming, klimaatplafond',
  },
  MT: {
    id: 'MT',
    supplyDesignC: 45,
    returnDesignC: 35,
    supplyMinC: 30,
    label: 'MT 45/35 °C',
    description: 'LT-radiatoren',
  },
  HT: {
    id: 'HT',
    supplyDesignC: 55,
    returnDesignC: 45,
    supplyMinC: 35,
    label: 'HT 55/45 °C',
    description: 'Bestaande radiatoren',
  },
};

/** Keuzes voor de maximale aanvoertemperatuur van de warmtepomp [°C]. */
export const MAX_SUPPLY_OPTIONS = [55, 60, 65, 70, 75] as const;
