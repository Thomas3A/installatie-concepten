// Warmteoverdracht van het plafond (§5.3): karakteristiek, binnenzijdige weerstand en oppervlaktetemperatuur.
import { nusselt } from '../../../core/hydraulics/heatTransfer';
import { lambda as lambdaW, prandtl } from '../../../core/water';
import type { ModeConditions, PlafondContext } from './context';

const MIN_DT = 0.1;

/** Weerstand van de karakteristiek per m² actief oppervlak: R = ΔT/q(ΔT) = ΔT^(1−n)/(f_s·K). */
export function rChar(dT: number, c: ModeConditions, fs: number): number {
  return Math.max(dT, MIN_DT) ** (1 - c.n) / (fs * c.K);
}

/** Karakteristiek q(ΔT) in W/m² actief oppervlak. */
export function qChar(dT: number, c: ModeConditions, fs: number): number {
  return fs * c.K * Math.max(dT, 0) ** c.n;
}

/** Binnenoppervlak per m² paneel: A_i' = π·Di·L_buis/A_paneel. */
export function innerAreaRatio(ctx: PlafondContext): number {
  return (Math.PI * ctx.di * ctx.geom.Lbuis) / ctx.geom.area;
}

/** Binnenzijdige weerstand per m² paneel: 1/(h_i·A_i'). */
export function rInt(Re: number, T: number, ctx: PlafondContext): number {
  const hi = (nusselt(Re, prandtl(T)) * lambdaW(T)) / ctx.di;
  return 1 / (hi * innerAreaRatio(ctx));
}

/** Oppervlaktetemperatuur: T_opp = T_w + (T_ruimte − T_w)·(R_int + R_cond)/R_tot. */
export function surfaceTemp(
  tWater: number,
  tRoom: number,
  rIntVal: number,
  rCond: number,
  rTot: number,
): number {
  return tWater + (tRoom - tWater) * ((rIntVal + rCond) / rTot);
}
