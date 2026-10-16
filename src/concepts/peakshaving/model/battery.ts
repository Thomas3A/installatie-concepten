// Batterij (spec §5.4): nuttige inhoud, vermogen en rendement per richting.
import type { Battery } from './types';

/** Ontlaaddiepte (nuttig deel van de bruto capaciteit). */
export const BATTERY_DOD = 0.9;
/** Rendement heen en terug. */
export const BATTERY_ROUND_TRIP = 0.9;
/** Standaard C-waarde als het vermogen automatisch is. */
export const BATTERY_DEFAULT_C_RATE = 0.5;
export const BATTERY_C_RATE_MIN = 0.2;
export const BATTERY_C_RATE_MAX = 2;

/** Nuttige inhoud [kWh]. */
export function batteryUsableEnergy(b: Pick<Battery, 'capacityKwh'>): number {
  return b.capacityKwh * BATTERY_DOD;
}

/** Laad/ontlaadvermogen [kW]: ingesteld, of 0,5 C. */
export function batteryPower(b: Battery): number {
  return b.powerKw === null ? b.capacityKwh / 2 : b.powerKw;
}

/** Rendement per richting √0,90. */
export function batteryEfficiency(): number {
  return Math.sqrt(BATTERY_ROUND_TRIP);
}
