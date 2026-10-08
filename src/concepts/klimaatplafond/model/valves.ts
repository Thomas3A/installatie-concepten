// Kleppen: Type A (schakelende 6-weg + PICV) en Type B (modulerende gekarakteriseerde 6-weg).
import { TYPE_A, TYPE_B, picvsForDn, picvSpec, type Dn, type PicvId } from '../data/valves';
import type { Mode } from './config';

const kPa = (pa: number): number => pa / 1000;
export const m3sToM3h = (q: number): number => q * 3600;

// ------------------------------------------------------------- Type B

/** Relatieve Kv (Kv/Kvs) bij relatieve opening h in de actieve sequentie. */
export function kvRel(h: number, nGl: number = TYPE_B.nGl): number {
  if (h <= 0) return 0;
  const h0 = TYPE_B.hLinear;
  if (h >= h0) return Math.exp(nGl * (Math.min(h, 1) - 1));
  return (Math.exp(nGl * (h0 - 1)) * h) / h0;
}

/** Inverse van kvRel. */
export function hFromKvRel(x: number, nGl: number = TYPE_B.nGl): number {
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

/** Kv (m³/h) van Type B bij stand θ. */
export function kvTypeB(theta: number, kvsKoelen: number, kvsVerwarmen: number, nGl: number = TYPE_B.nGl): number {
  const st = thetaToState(theta);
  if (st.seq === 'dicht') return 0;
  return (st.seq === 'koelen' ? kvsKoelen : kvsVerwarmen) * kvRel(st.h, nGl);
}

/**
 * Elektronische flowregeling: bepaal de doelopening h voor een gewenst debiet.
 * Kv_nodig = Q_set / √(Δp_klep(Q_set)/100) met Δp_klep = Δp_beschikbaar − Δp_circuit(Q_set).
 */
export function typeBTargetOpening(
  qSet: number,
  dpAvail: number,
  circuit: (q: number) => number,
  kvs: number,
  nGl: number = TYPE_B.nGl,
): { h: number; kvNodig: number } {
  if (qSet <= 0) return { h: 0, kvNodig: 0 };
  const dpKlep = kPa(dpAvail - circuit(qSet));
  if (dpKlep <= 1e-6) return { h: 1, kvNodig: Infinity };
  const kvNodig = m3sToM3h(qSet) / Math.sqrt(dpKlep / 100);
  return { h: hFromKvRel(kvNodig / kvs, nGl), kvNodig };
}

// ------------------------------------------------------------- Gemeenschappelijk

/**
 * Los het werkelijke debiet op uit Δp_beschikbaar = Δp_circuit(Q) + Σ 100·(Q/Kv_j)²  (Q in m³/s, resultaat in m³/s).
 * Een Kv van 0 (dichte klep) geeft debiet 0.
 */
export function solveFlow(dpAvail: number, circuit: (q: number) => number, kvs: number[]): number {
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

// ------------------------------------------------------------- Advies (§5.9)

export interface AdviceB {
  kind: 'B';
  dn: Dn;
  /** Aanbevolen Kvs per modus; null als Δp te laag is */
  kvs: Record<Mode, number | null>;
  kvNodig: Record<Mode, number>;
  /** Opening bij Vmax (0..1) */
  opening: Record<Mode, number | null>;
  suggestDn20: boolean;
  dpTooLow: boolean;
}

export interface AdviceA {
  kind: 'A';
  picv: PicvId | null;
  dpNeeded: number; // kPa
  ok: boolean;
}

export function adviceTypeB(
  dn: Dn,
  vmax: Record<Mode, number>,
  dpAvail: number,
  dpCircuit: Record<Mode, number>,
  nGl: number = TYPE_B.nGl,
): AdviceB {
  const kvs = {} as Record<Mode, number | null>;
  const kvNodig = {} as Record<Mode, number>;
  const opening = {} as Record<Mode, number | null>;
  let suggestDn20 = false;
  let dpTooLow = false;
  for (const m of ['koelen', 'verwarmen'] as const) {
    const dpKlep = kPa(dpAvail - dpCircuit[m]);
    if (dpKlep <= 0) {
      kvs[m] = null;
      kvNodig[m] = Infinity;
      opening[m] = null;
      dpTooLow = true;
      continue;
    }
    kvNodig[m] = m3sToM3h(vmax[m]) / Math.sqrt(dpKlep / 100);
    const pick = (list: number[]): number | undefined => list.find((k) => kvNodig[m] <= 0.9 * k);
    let k = pick(TYPE_B.kvs[dn]);
    if (k === undefined && dn === 15) {
      k = pick(TYPE_B.kvs[20]);
      if (k !== undefined) suggestDn20 = true;
    }
    if (k === undefined) {
      kvs[m] = null;
      opening[m] = null;
      dpTooLow = true;
    } else {
      kvs[m] = k;
      opening[m] = hFromKvRel(kvNodig[m] / k, nGl);
    }
  }
  return { kind: 'B', dn, kvs, kvNodig, opening, suggestDn20, dpTooLow };
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
  const spec = choice ?? list[list.length - 1];
  const kvSix = TYPE_A.kvsSixWay[dn];
  let worst = 0;
  for (const m of ['koelen', 'verwarmen'] as const) {
    const needed = kPa(dpCircuit[m]) + 100 * (m3sToM3h(vmax[m]) / kvSix) ** 2 + spec.dpMin;
    worst = Math.max(worst, needed);
  }
  return { kind: 'A', picv: choice ? choice.id : null, dpNeeded: worst, ok: worst <= kPa(dpAvail) };
}

/** Benodigd Δp (kPa) per modus voor het kleptype, bij Vmax. */
export function dpNeeded(
  type: 'A' | 'B',
  vmax: number,
  dpCircuit: number,
  kvsB: number,
  dn: Dn,
  picv: PicvId | null,
): number {
  if (type === 'B') return kPa(dpCircuit) + 100 * (m3sToM3h(vmax) / kvsB) ** 2;
  return kPa(dpCircuit) + 100 * (m3sToM3h(vmax) / TYPE_A.kvsSixWay[dn]) ** 2 + picvSpec(picv).dpMin;
}
