// Regeling: debietkarakteristiek, dauwpuntbeveiliging en ΔT-manager (§5.11).
import { dewPoint } from '../../../core/psychro';
import type { FlowChar } from './config';

/** Vraag (0..1) → debietfractie van Vmax. */
export function flowFraction(u: number, kind: FlowChar, nGl = 3.2): number {
  if (u <= 0) return 0;
  if (kind === 'lineair') return Math.min(u, 1);
  const u0 = 0.05;
  if (u >= u0) return Math.exp(nGl * (Math.min(u, 1) - 1));
  return (Math.exp(nGl * (u0 - 1)) * u) / u0;
}

export interface DewState {
  active: boolean;
}

/**
 * Dauwpuntbeveiliging met hysterese: actief zodra T_aanvoer < T_dauw + marge, vrij weer boven marge + 0,5 K.
 */
export function dewProtection(
  prev: DewState,
  tSupply: number,
  tAir: number,
  rh: number,
  margin = 1,
  hysteresis = 0.5,
): { state: DewState; tDew: number } {
  const tDew = dewPoint(tAir, rh);
  let active = prev.active;
  if (!active && tSupply < tDew + margin) active = true;
  else if (active && tSupply > tDew + margin + hysteresis) active = false;
  return { state: { active }, tDew };
}

/**
 * ΔT-manager: begrens het debiet zodat het gemeten ΔT niet onder ΔT_min zakt.
 * qLimit en vmax in m³/s. Verandering 0,001·Vmax per seconde.
 */
export function dtManagerStep(
  qLimit: number,
  vmax: number,
  dtMeasured: number,
  dtMin: number,
  dt: number,
): number {
  if (!Number.isFinite(dtMeasured)) return qLimit;
  const rate = 0.001 * vmax * dt;
  if (dtMeasured < dtMin) return Math.max(qLimit - rate, 0.02 * vmax);
  if (dtMeasured > dtMin + 0.3) return Math.min(qLimit + rate, vmax);
  return qLimit;
}
