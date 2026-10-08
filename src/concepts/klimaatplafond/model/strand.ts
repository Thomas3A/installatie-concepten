// Thermiek en drukval van één streng (panelen in serie), §5.3–§5.5.
import { churchill, reynolds, velocity } from '../../../core/hydraulics/friction';
import { NU_LAMINAR, nusselt, nusseltGnielinski } from '../../../core/hydraulics/heatTransfer';
import { cp as cpW, lambda as lambdaW, mu as muW, prandtl, rho as rhoW } from '../../../core/water';
import { rChar, innerAreaRatio, surfaceTemp } from './ceiling';
import type { ModeConditions, PlafondContext } from './context';

// ---------------------------------------------------------------- stofwaardentabel (snelheid)
// Lineair geïnterpoleerde tabel met stap 0,05 K; de afwijking t.o.v. de formules is < 1e-6 relatief.
const T0 = -5;
const DT = 0.05;
const NT = Math.round(110 / DT) + 1;
interface PropTable {
  cp: Float64Array;
  mu: Float64Array;
  lam: Float64Array;
  nuG10k: Float64Array;
  nuRef: Float64Array;
  reRef: number;
}
const tables = new Map<number, PropTable>();
function propTable(reRef: number): PropTable {
  let t = tables.get(reRef);
  if (t) return t;
  t = {
    cp: new Float64Array(NT),
    mu: new Float64Array(NT),
    lam: new Float64Array(NT),
    nuG10k: new Float64Array(NT),
    nuRef: new Float64Array(NT),
    reRef,
  };
  for (let i = 0; i < NT; i++) {
    const T = T0 + i * DT;
    t.cp[i] = cpW(T);
    t.mu[i] = muW(T);
    t.lam[i] = lambdaW(T);
    const Pr = prandtl(T);
    t.nuG10k[i] = nusseltGnielinski(10000, Pr);
    t.nuRef[i] = nusselt(reRef, Pr);
  }
  tables.set(reRef, t);
  return t;
}
const lerp = (a: Float64Array, i: number, f: number): number => a[i] + (a[i + 1] - a[i]) * f;

export { qChar, rChar, rInt } from './ceiling';

export interface StrandThermal {
  /** debiet in m³/s */
  q: number;
  tIn: number;
  /** Retourtemperatuur (°C); NaN bij q = 0 */
  tRet: number;
  /** Vermogen als grootte in W (≥ 0) */
  power: number;
  /** Gemiddelde strengtemperatuur (°C) */
  tMean: number;
  re: number;
  v: number;
  tOppMin: number;
  tOppMean: number;
  /** Watertemperatuur op de segmentgrenzen (lengte nSeg+1), alleen met detail */
  tWater?: Float32Array;
  /** Oppervlaktetemperatuur per segment, alleen met detail */
  tOpp?: Float32Array;
}

/** Stationaire thermiek van een streng met `panels` panelen in serie, predictor-corrector per segment. */
export function strandThermal(
  ctx: PlafondContext,
  cond: ModeConditions,
  panels: number,
  q: number,
  tIn: number = cond.tIn,
  tRoom: number = cond.tRoom,
  detail = false,
): StrandThermal {
  const g = ctx.geom;
  const nTot = panels * g.nSeg;
  const aSeg = g.area / g.nSeg;
  const ai = innerAreaRatio(ctx);
  if (q <= 1e-12) {
    return {
      q: 0,
      tIn,
      tRet: NaN,
      power: 0,
      tMean: tIn,
      re: 0,
      v: 0,
      tOppMin: tIn,
      tOppMean: tIn,
      tWater: detail ? new Float32Array(nTot + 1).fill(tIn) : undefined,
      tOpp: detail ? new Float32Array(nTot).fill(tIn) : undefined,
    };
  }
  const mdot = q * rhoW(tIn);
  const tWater = detail ? new Float32Array(nTot + 1) : undefined;
  const tOpp = detail ? new Float32Array(nTot) : undefined;
  if (tWater) tWater[0] = tIn;
  let T = tIn;
  let power = 0;
  let sumT = 0;
  let sumOpp = 0;
  let minOpp = Infinity;
  const fs = ctx.fs;

  const tb = propTable(ctx.reRef);
  const resist = (Tw: number): { rTot: number; rI: number } => {
    const x = Math.min(Math.max((Tw - T0) / DT, 0), NT - 1.000001);
    const i = Math.floor(x);
    const f = x - i;
    const mu = lerp(tb.mu, i, f);
    const lam = lerp(tb.lam, i, f);
    const Re = (4 * mdot) / (Math.PI * ctx.di * mu);
    let nu: number;
    if (Re <= 2300) nu = NU_LAMINAR;
    else if (Re >= 10000) nu = nusseltGnielinski(Re, (mu * lerp(tb.cp, i, f)) / lam);
    else {
      const g = (Re - 2300) / 7700;
      nu = (1 - g) * NU_LAMINAR + g * lerp(tb.nuG10k, i, f);
    }
    const hiA = (lam * ai) / ctx.di;
    const rI = 1 / (nu * hiA);
    const rRef = 1 / (lerp(tb.nuRef, i, f) * hiA);
    const dT = Math.abs(tRoom - Tw);
    const rExt = rChar(dT, cond, fs) - rRef;
    return { rTot: rExt + rI, rI };
  };

  const cpAt = (Tw: number): number => {
    const x = Math.min(Math.max((Tw - T0) / DT, 0), NT - 1.000001);
    const i = Math.floor(x);
    return lerp(tb.cp, i, x - i);
  };

  for (let j = 0; j < nTot; j++) {
    const c1 = cpAt(T);
    const r1 = resist(T);
    const tStar = tRoom - (tRoom - T) * Math.exp(-aSeg / (r1.rTot * mdot * c1));
    const tMid = 0.5 * (T + tStar);
    const r2 = resist(tMid);
    const c2 = cpAt(tMid);
    const tOut = tRoom - (tRoom - T) * Math.exp(-aSeg / (r2.rTot * mdot * c2));
    power += mdot * cpAt(0.5 * (T + tOut)) * (tOut - T);
    // Oppervlaktetemperatuur aan de segmentingang (koudste/warmste punt van het segment)
    const to = surfaceTemp(T, tRoom, r1.rI, ctx.rCond, r1.rTot);
    if (to < minOpp) minOpp = to;
    sumOpp += to;
    sumT += 0.5 * (T + tOut);
    if (tOpp) tOpp[j] = to;
    T = tOut;
    if (tWater) tWater[j + 1] = T;
  }
  const tMean = sumT / nTot;
  const Re = (4 * mdot) / (Math.PI * ctx.di * muW(tMean));
  return {
    q,
    tIn,
    tRet: T,
    power: Math.abs(power),
    tMean,
    re: Re,
    v: velocity(q, ctx.di) * (rhoW(tIn) / rhoW(tMean)),
    tOppMin: minOpp,
    tOppMean: sumOpp / nTot,
    tWater,
    tOpp,
  };
}

/** Drukval van een streng in Pa (§5.5). Alle stofwaarden bij de gemiddelde strengtemperatuur. */
export function strandDp(
  ctx: PlafondContext,
  panels: number,
  extraLength: number,
  q: number,
  tMean: number,
): number {
  if (q <= 1e-15) return 0;
  const g = ctx.geom;
  const d = ctx.di;
  const Re = reynolds(q, d, tMean);
  const f = churchill(Re, ctx.epsTube / d);
  const v = velocity(q, d);
  const dyn = 0.5 * rhoW(tMean) * v * v;
  const tube = f * ((panels * g.Lbuis) / d) * dyn;
  const bends = panels * g.nBochten * ctx.zetaBend * dyn;
  const hoses = (panels + 1) * (f * (ctx.hoseLength / d) + 2 * ctx.zetaHose) * dyn;
  const tees = 2 * ctx.zetaT * dyn;
  const extra = f * (extraLength / d) * dyn;
  return tube + bends + hoses + tees + extra;
}

/** Waterinhoud van een streng (m³): panelen, koppelslangen en extra lengte. */
export function strandVolume(ctx: PlafondContext, panels: number, extraLength: number): number {
  const a = (Math.PI / 4) * ctx.di * ctx.di;
  return a * (panels * ctx.geom.Lbuis + (panels + 1) * ctx.hoseLength + extraLength);
}

/**
 * Ontwerpdebiet (m³/s) waarbij |T_ret − T_in| = ΔT_ontwerp op [0,5; 3000] l/h.
 * ΔT daalt monotoon met het debiet; we zoeken het nulpunt in log-ruimte (Illinois-variant van regula falsi,
 * dezelfde wortel als bisectie maar in ~10 in plaats van 60 evaluaties).
 */
export function designFlow(
  ctx: PlafondContext,
  cond: ModeConditions,
  panels: number,
): { q: number; feasible: boolean } {
  const maxDt = Math.abs(cond.tRoom - cond.tIn);
  const feasible = cond.dt < maxDt - 0.5;
  const g = (lq: number): number =>
    Math.abs(strandThermal(ctx, cond, panels, Math.exp(lq)).tRet - cond.tIn) - cond.dt;
  let a = Math.log(0.5 / 3.6e6);
  let b = Math.log(3000 / 3.6e6);
  let ga = g(a);
  let gb = g(b);
  if (ga <= 0) return { q: Math.exp(a), feasible };
  if (gb >= 0) return { q: Math.exp(b), feasible };
  let side = 0;
  let x = a;
  for (let i = 0; i < 80; i++) {
    x = (a * gb - b * ga) / (gb - ga);
    const gx = g(x);
    if (Math.abs(gx) < 1e-10 || Math.abs(b - a) < 1e-12) break;
    if (gx * gb > 0) {
      b = x;
      gb = gx;
      if (side === -1) ga /= 2;
      side = -1;
    } else {
      a = x;
      ga = gx;
      if (side === 1) gb /= 2;
      side = 1;
    }
  }
  return { q: Math.exp(x), feasible };
}

export { rhoW };
