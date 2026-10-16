// Bereiken van buffer, batterij en WP afgeleid van het piekvermogen (spec §3.5).
import { bufferKwhPerM3 } from './buffer';
import type { BuildingUse, HeatPump } from './types';

/** Uren piekvermogen voor de bovengrens van de bufferschuif. */
export const BUFFER_MAX_HOURS = 12;
/** Uren (geschatte elektrische) piek voor de bovengrens van de batterijschuif. */
export const BATTERY_MAX_HOURS = 8;
/** Geschatte COP voor de elektrische piek bij de batterijschuif. */
export const BATTERY_RANGE_COP = 2.5;
/** Markeringen op de schuiven [uren piekvermogen]. */
export const RANGE_MARKER_HOURS = [2, 4, 8] as const;

const NICE_MANTISSAS = [1, 1.5, 2, 2.5, 3, 4, 5, 10];

/** Naar boven afronden op de 1-2-5-reeks met tussenstappen 1,5 / 2,5 / 3 / 4. */
export function roundUpNice(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  const exp = Math.floor(Math.log10(x));
  const base = Math.pow(10, exp);
  const m = x / base;
  const mant = NICE_MANTISSAS.find((v) => v >= m - 1e-9) ?? 10;
  return Number((mant * base).toPrecision(12));
}

export interface Ranges {
  /** nuttige opslag per m³ buffer [kWh/m³] */
  kwhPerM3: number;
  bufferMaxM3: number;
  bufferStepM3: number;
  batteryMaxKwh: number;
  batteryStepKwh: number;
  heatPumpMinKw: number;
  heatPumpMaxKw: number;
  /** markeringen bij 2, 4 en 8 uur piekvermogen */
  bufferMarkersM3: { hours: number; value: number }[];
  batteryMarkersKwh: { hours: number; value: number }[];
}

export function deriveRanges(
  use: BuildingUse,
  designLoadKw: number,
  hp: Pick<HeatPump, 'emitterPreset' | 'maxSupplyC'>,
): Ranges {
  const office = use === 'office';
  const kwhPerM3 = bufferKwhPerM3(hp);
  const bufferMin = office ? 10 : 1;
  const batteryMin = office ? 100 : 10;
  const bufferMaxM3 =
    kwhPerM3 > 0 ? Math.max(roundUpNice((BUFFER_MAX_HOURS * designLoadKw) / kwhPerM3), bufferMin) : bufferMin;
  const batteryMaxKwh = Math.max(
    roundUpNice((BATTERY_MAX_HOURS * designLoadKw) / BATTERY_RANGE_COP),
    batteryMin,
  );
  return {
    kwhPerM3,
    bufferMaxM3,
    bufferStepM3: office ? 0.5 : 0.05,
    batteryMaxKwh,
    batteryStepKwh: office ? 5 : 0.5,
    heatPumpMinKw: 0.1 * designLoadKw,
    heatPumpMaxKw: 3 * designLoadKw,
    bufferMarkersM3: RANGE_MARKER_HOURS.map((hours) => ({
      hours,
      value: kwhPerM3 > 0 ? (hours * designLoadKw) / kwhPerM3 : 0,
    })),
    batteryMarkersKwh: RANGE_MARKER_HOURS.map((hours) => ({
      hours,
      value: (hours * designLoadKw) / BATTERY_RANGE_COP,
    })),
  };
}

/** "≈ x uur piekvermogen" van een buffervolume. */
export function bufferHoursOfPeak(volumeM3: number, kwhPerM3: number, designLoadKw: number): number {
  return designLoadKw > 0 ? (volumeM3 * kwhPerM3) / designLoadKw : 0;
}
