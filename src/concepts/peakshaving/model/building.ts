// Gebouw als 1R1C-knoop met gevelfilter; gebruiksschema, setpoint, winsten en tapwater (spec §5.1, §5.7).
import { COLD_WATER_C, DHW_PROFILE, DHW_PROFILE_SUM, TANK_USABLE_FRACTION } from '../data/dhwProfile';
import type { Building } from './types';

export const HOURS_PER_YEAR = 8760;
/** Inregelperiode vóór de getelde uren [h] (laatste week van hetzelfde jaar, cyclisch). */
export const WARMUP_HOURS = 168;
/** Comfortverlies: binnentemperatuur meer dan deze marge onder het setpoint [K]. */
export const COMFORT_MARGIN_K = 0.5;

/** Warmteverliescoëfficiënt UA = P_ontwerp / (T_i,ontwerp − T_e,ontwerp) [kW/K]. */
export function buildingUA(b: Building): number {
  return b.designLoadKw / (b.designIndoorC - b.designOutdoorC);
}

/** Warmtecapaciteit C = τ·UA [kWh/K]. */
export function buildingCapacity(b: Building): number {
  return b.timeConstantH * buildingUA(b);
}

/** Filtercoëfficiënt van de gevel: α = 1 − exp(−1/τ_gevel); 1 als het filter uit staat. */
export function envelopeAlpha(b: Building): number {
  return b.envelopeLagH > 0 ? 1 - Math.exp(-1 / b.envelopeLagH) : 1;
}

/** Nuttige boilerinhoud [kWh] (10 °C koud water, 85 % benutbaar); 0 zonder tapwater. */
export function tankEnergy(b: Building): number {
  if (!b.dhw.enabled) return 0;
  return (b.dhw.tankLitre / 1000) * 1.163 * (b.dhw.tankTempC - COLD_WATER_C) * TANK_USABLE_FRACTION;
}

/** Weekdag van uur t (ISO, 1 = maandag). */
export function weekdayOf(startWeekday: number, t: number): number {
  return ((startWeekday - 1 + Math.floor(t / 24)) % 7) + 1;
}

/** In gebruik: woning altijd; kantoor op ma–vr tussen useStartH en useEndH. */
export function isInUse(b: Building, startWeekday: number, t: number): boolean {
  if (b.use === 'residential') return true;
  const u = t % 24;
  return weekdayOf(startWeekday, t) <= 5 && b.useStartH <= u && u < b.useEndH;
}

/** Setpoint op uur t: gebruik, opstoken (kantoor, gebruik begint binnen preheatH uur) of verlaagd. */
export function setpointAt(b: Building, startWeekday: number, t: number): number {
  if (isInUse(b, startWeekday, t)) return b.setpointUseC;
  if (b.use === 'office' && b.preheatH > 0) {
    for (let k = 1; k <= b.preheatH; k++) {
      if (isInUse(b, startWeekday, (t + k) % HOURS_PER_YEAR)) return b.setpointUseC;
    }
  }
  return b.setpointSetbackC;
}

/** Opstookuur: buiten gebruik maar wel op het gebruikssetpoint (kantoor). */
export function isPreheatHour(b: Building, startWeekday: number, t: number): boolean {
  return (
    b.use === 'office' &&
    b.preheatH > 0 &&
    !isInUse(b, startWeekday, t) &&
    setpointAt(b, startWeekday, t) === b.setpointUseC &&
    b.setpointUseC !== b.setpointSetbackC
  );
}

/** Interne winsten [kW]: UA·(setpointUse − stookgrens); kantoor alleen tijdens gebruik. */
export function gainsAt(b: Building, startWeekday: number, t: number): number {
  const g = buildingUA(b) * (b.setpointUseC - b.balanceTempC);
  if (b.use === 'residential') return g;
  return isInUse(b, startWeekday, t) ? g : 0;
}

/** Tapvraag in uur t [kWh] volgens het dagprofiel. */
export function dhwDemandAt(b: Building, t: number): number {
  if (!b.dhw.enabled) return 0;
  return (b.dhw.dailyKwh * DHW_PROFILE[t % 24]) / DHW_PROFILE_SUM;
}

/** Vooraf berekend uurschema voor één gebouw en één klimaatjaar. */
export interface Schedule {
  inUse: Uint8Array;
  setpoint: Float64Array;
  gains: Float64Array;
  dhwDemand: Float64Array;
}

export function buildSchedule(b: Building, startWeekday: number): Schedule {
  const n = HOURS_PER_YEAR;
  const s: Schedule = {
    inUse: new Uint8Array(n),
    setpoint: new Float64Array(n),
    gains: new Float64Array(n),
    dhwDemand: new Float64Array(n),
  };
  for (let t = 0; t < n; t++) {
    s.inUse[t] = isInUse(b, startWeekday, t) ? 1 : 0;
    s.setpoint[t] = setpointAt(b, startWeekday, t);
    s.gains[t] = gainsAt(b, startWeekday, t);
    s.dhwDemand[t] = dhwDemandAt(b, t);
  }
  return s;
}
