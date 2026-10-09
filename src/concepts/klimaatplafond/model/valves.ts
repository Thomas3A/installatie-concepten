// Kleppen: Type A (schakelende 6-weg + PICV) en Type B (modulerende 6-weg met flowmeting).
//
// Type B regelt het debiet softwarematig op het gemeten debiet (drukonafhankelijk via meting). Er is daarom geen Kvs-keuze:
// Vmax per sequentie komt overeen met 100 % opening en de karakteristiek koppelt opening en debietfractie.
import { TYPE_A, TYPE_B, picvsForDn, picvSpec, type Dn, type PicvId } from '../data/valves';
import type { Mode } from './config';

const kPa = (pa: number): number => pa / 1000;
export const m3sToM3h = (q: number): number => q * 3600;

// ------------------------------------------------------------- Type B

/**
 * Debietfractie Q/Vmax bij relatieve opening h in de actieve sequentie (gelijkprocentig):
 * exp(n_gl·(h − 1)) voor h ≥ 0,05 en lineair naar 0 daaronder.
 */
export function openingToFlowFraction(h: number, nGl: number = TYPE_B.nGl): number {
  if (h <= 0) return 0;
  const h0 = TYPE_B.hLinear;
  if (h >= h0) return Math.exp(nGl * (Math.min(h, 1) - 1));
  return (Math.exp(nGl * (h0 - 1)) * h) / h0;
}

/** Inverse van openingToFlowFraction: benodigde opening voor een debietfractie. */
export function flowFractionToOpening(x: number, nGl: number = TYPE_B.nGl): number {
  if (x <= 0) return 0;
  const h0 = TYPE_B.hLinear;
  const x0 = Math.exp(nGl * (h0 - 1));
  if (x >= 1) return 1;
  if (x >= x0) return 1 + Math.log(x) / nGl;
  return (h0 * x) / x0;
}

/** Stand θ (°) → actieve sequentie, relatieve opening h. */
export function thetaToState(theta: number): { seq: Mode | 'dicht'; h: number } {
  if (theta <= 30) return { seq: 'koelen', h: 1 - theta / 30 };
  if (theta >= 60) return { seq: 'verwarmen', h: (theta - 60) / 30 };
  return { seq: 'dicht', h: 0 };
}

export function thetaTarget(mode: Mode | 'stop', h: number): number {
  if (mode === 'stop') return 45;
  return mode === 'koelen' ? 30 * (1 - h) : 60 + 30 * h;
}

/** Debietfractie Q/Vmax van Type B bij stand θ (0 in de dode zone). */
export function flowFractionAtTheta(theta: number, nGl: number = TYPE_B.nGl): number {
  const st = thetaToState(theta);
  return st.seq === 'dicht' ? 0 : openingToFlowFraction(st.h, nGl);
}

// ------------------------------------------------------------- Gemeenschappelijk

/**
 * Los het werkelijke debiet op uit Δp_beschikbaar = Δp_circuit(Q) + Σ 100·(Q/Kv_j)²  (Q in m³/s, resultaat in m³/s).
 * Zonder extra weerstanden (lege lijst) is dit het maximale debiet dat het circuit bij het beschikbare Δp haalt.
 * Een Kv van 0 (dichte klep) geeft debiet 0.
 */
export function solveFlow(dpAvail: number, circuit: (q: number) => number, kvs: number[] = []): number {
  if (dpAvail <= 0 || kvs.some((k) => k <= 0)) return 0;
  const total = (q: number): number => {
    let dp = circuit(q);
    for (const k of kvs) dp += 1e5 * (m3sToM3h(q) / k) ** 2;
    return dp;
  };
  let lo = 0;
  let hi = 1e-4;
  while (total(hi) < dpAvail && hi < 1) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi);
    if (total(mid) < dpAvail) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/** Kv van de PICV volledig open, uit Vmax en Δp_min: Kv = Vmax/√(Δp_min/100). Vmax in m³/s. */
export function picvKvOpen(vmax: number, dpMinKpa: number): number {
  return m3sToM3h(vmax) / Math.sqrt(dpMinKpa / 100);
}

// ------------------------------------------------------------- Advies (Type A: PICV)

export interface AdviceA {
  kind: 'A';
  /** Aanbevolen PICV binnen het gekozen DN; zonder passende PICV de best passende van dat DN */
  picv: PicvId;
  /** Past Vmax binnen q_nom en instelbereik van de aanbevolen PICV? */
  fits: boolean;
  dpNeeded: number; // kPa
  ok: boolean;
}

export function adviceTypeA(
  dn: Dn,
  vmaxLh: Record<Mode, number>,
  dpAvail: number,
  dpCircuit: Record<Mode, number>,
  vmax: Record<Mode, number>,
): AdviceA {
  const big = Math.max(vmaxLh.koelen, vmaxLh.verwarmen);
  const small = Math.min(vmaxLh.koelen, vmaxLh.verwarmen);
  const list = [...picvsForDn(dn)].sort((a, b) => a.qNom - b.qNom);
  const choice = list.find((p) => p.qNom >= big && small >= p.rangeMin * p.qNom);
  // Zonder passende PICV: de kleinste van dit DN die het debiet aankan, anders de grootste (nooit een ander DN)
  const spec = choice ?? list.find((p) => p.qNom >= big) ?? list[list.length - 1];
  const kvSix = TYPE_A.kvsSixWay[dn];
  let worst = 0;
  for (const m of ['koelen', 'verwarmen'] as const) {
    const needed = kPa(dpCircuit[m]) + 100 * (m3sToM3h(vmax[m]) / kvSix) ** 2 + spec.dpMin;
    worst = Math.max(worst, needed);
  }
  return { kind: 'A', picv: spec.id, fits: !!choice, dpNeeded: worst, ok: worst <= kPa(dpAvail) };
}

/**
 * Benodigd Δp (kPa) bij Vmax.
 * Type B: alleen het circuit (de klep regelt het debiet softwarematig; geen Kvs-weerstand).
 * Type A: circuit + 6-weg-klep (vaste weerstand) + minimaal Δp over de PICV.
 */
export function dpNeeded(
  type: 'A' | 'B',
  vmax: number,
  dpCircuit: number,
  dn: Dn,
  picv: PicvId | null,
): number {
  if (type === 'B') return kPa(dpCircuit);
  return kPa(dpCircuit) + 100 * (m3sToM3h(vmax) / TYPE_A.kvsSixWay[dn]) ** 2 + picvSpec(picv).dpMin;
}
