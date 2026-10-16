// Lucht/water-warmtepomp: capaciteit, ontdooien, COP en stooklijn (spec §5.2).
import { interpolate } from '../../../core/interp';
import {
  BUFFER_CHARGE_MARGIN_K,
  CAPACITY_FACTOR_TABLE,
  COP_MAX,
  COP_MIN,
  DEFROST_TABLE,
  EMITTER_PRESETS,
  HEATING_CURVE_END_C,
  MIN_LIFT_K,
} from '../data/heatPumpCurves';
import type { HeatPump } from './types';

/** Capaciteitsfactor t.o.v. A7/W35 bij buitentemperatuur T_e. */
export function capacityFactor(outdoorC: number): number {
  return interpolate(CAPACITY_FACTOR_TABLE, outdoorC);
}

/** Ontdooifactor op de COP. */
export function defrostFactor(outdoorC: number): number {
  return interpolate(DEFROST_TABLE, outdoorC);
}

/** COP = η·T_aanvoer,K / max(T_aanvoer − T_e, 8 K) · f_ontdooi, geklemd op [1,2; 7,0]. */
export function cop(carnotEfficiency: number, outdoorC: number, supplyC: number): number {
  const lift = Math.max(supplyC - outdoorC, MIN_LIFT_K);
  const c = ((carnotEfficiency * (supplyC + 273.15)) / lift) * defrostFactor(outdoorC);
  return Math.min(Math.max(c, COP_MIN), COP_MAX);
}

/** Weersafhankelijke aanvoertemperatuur: lineair tussen de ontwerpbuitentemperatuur en 15 °C. */
export function supplyTemperature(
  hp: Pick<HeatPump, 'emitterPreset'>,
  designOutdoorC: number,
  outdoorC: number,
): number {
  const p = EMITTER_PRESETS[hp.emitterPreset];
  if (outdoorC <= designOutdoorC) return p.supplyDesignC;
  if (outdoorC >= HEATING_CURVE_END_C) return p.supplyMinC;
  return (
    p.supplyDesignC +
    ((p.supplyMinC - p.supplyDesignC) * (outdoorC - designOutdoorC)) / (HEATING_CURVE_END_C - designOutdoorC)
  );
}

/** Laadtemperatuur van de buffer: maximale WP-aanvoer − 2 K. */
export function bufferChargeTemperature(hp: Pick<HeatPump, 'maxSupplyC'>): number {
  return hp.maxSupplyC - BUFFER_CHARGE_MARGIN_K;
}

/** Retourtemperatuur bij ontwerpcondities voor de gekozen stooklijn. */
export function designReturnTemperature(hp: Pick<HeatPump, 'emitterPreset'>): number {
  return EMITTER_PRESETS[hp.emitterPreset].returnDesignC;
}
