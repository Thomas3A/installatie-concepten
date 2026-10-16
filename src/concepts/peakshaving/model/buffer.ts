// Warmtebuffer: nuttige ΔT, nuttige inhoud en stilstandsverlies (spec §5.3).
import { bufferChargeTemperature, designReturnTemperature } from './heatPump';
import type { HeatPump } from './types';

/** Volumieke warmtecapaciteit van water [kWh/(m³·K)]. */
export const WATER_KWH_PER_M3K = 1.163;
/** Benutbaar deel door menging/stratificatie. */
export const BUFFER_STRATIFICATION = 0.9;
/** Verliescoëfficiënt [W/K per m² mantel-equivalent]: UA = k·V^(2/3). */
export const BUFFER_LOSS_W_PER_K = 1.5;
/** Omgevingstemperatuur van het vat [°C]. */
export const BUFFER_AMBIENT_C = 15;
/** Vooruitblik van de voorspellende laadregel [h]. */
export const BUFFER_HORIZON_H = 24;

type HpTemps = Pick<HeatPump, 'emitterPreset' | 'maxSupplyC'>;

/** Nuttige temperatuurslag: laadtemperatuur − ontwerpretour, ≥ 0 [K]. */
export function bufferDeltaT(hp: HpTemps): number {
  return Math.max(bufferChargeTemperature(hp) - designReturnTemperature(hp), 0);
}

/** Nuttige opslag per m³ [kWh/m³]. */
export function bufferKwhPerM3(hp: HpTemps): number {
  return WATER_KWH_PER_M3K * bufferDeltaT(hp) * BUFFER_STRATIFICATION;
}

/** Nuttige inhoud E = V·1,163·ΔT·f_strat [kWh]. */
export function bufferEnergy(volumeM3: number, hp: HpTemps): number {
  return volumeM3 * WATER_KWH_PER_M3K * bufferDeltaT(hp) * BUFFER_STRATIFICATION;
}

/** Stilstandsverlies UA = 1,5 W/K · V^(2/3), in kW/K. */
export function bufferUA(volumeM3: number): number {
  return volumeM3 > 0 ? (BUFFER_LOSS_W_PER_K * Math.pow(volumeM3, 2 / 3)) / 1000 : 0;
}
