// Verdeelleiding + parallelle strengen na de klep (§5.6) en de circuitkarakteristiek.
import { pipeDp } from '../../../core/hydraulics/friction';
import { solveNetwork, type NetworkResult } from '../../../core/hydraulics/network';
import type { Layout } from './config';
import type { ModeConditions, PlafondContext } from './context';
import { strandDp, strandThermal, type StrandThermal } from './strand';

export interface StrandSpec {
  panels: number;
  /** extra aansluitlengte (m) */
  extraLength: number;
}

export interface ZoneNetworkSpec {
  strands: StrandSpec[];
  dist: { di: number; eps: number };
  x1: number;
  hc: number;
  layout: Layout;
}

export function segmentLengths(spec: ZoneNetworkSpec): number[] {
  return spec.strands.map((_, i) => (i === 0 ? spec.x1 : spec.hc));
}

/** Los de stroomverdeling op voor een totaal debiet en gegeven gemiddelde strengtemperaturen. */
export function solveZone(
  ctx: PlafondContext,
  spec: ZoneNetworkSpec,
  qTot: number,
  tMean: number[],
  tPipe: number,
): NetworkResult {
  return solveNetwork({
    strandDp: spec.strands.map(
      (s, i) => (q: number) => ctx.netFactor * strandDp(ctx, s.panels, s.extraLength, q, tMean[i]),
    ),
    segLen: segmentLengths(spec),
    pipeDp: (q, len) => pipeDp({ q, d: spec.dist.di, len, eps: spec.dist.eps, T: tPipe }),
    layout: spec.layout,
    qTot,
  });
}

export interface ZoneState {
  net: NetworkResult;
  thermal: StrandThermal[];
  tMean: number[];
}

/**
 * Gekoppelde hydrauliek en thermiek: twee iteraties om de viscositeit per streng consistent te krijgen.
 * `tMeanGuess` is de startschatting (bijv. uit de vorige tijdstap).
 */
export function solveZoneCoupled(
  ctx: PlafondContext,
  cond: ModeConditions,
  spec: ZoneNetworkSpec,
  qTot: number,
  tMeanGuess?: number[],
  iterations = 2,
  detail = false,
  tIn: number = cond.tIn,
  tRoom: number = cond.tRoom,
): ZoneState {
  const sign = cond.mode === 'koelen' ? 1 : -1;
  let tMean = tMeanGuess ?? spec.strands.map(() => tIn + (sign * cond.dt) / 2);
  const tPipe = tIn + (sign * cond.dt) / 2;
  let net = solveZone(ctx, spec, qTot, tMean, tPipe);
  let thermal = spec.strands.map((s, i) => strandThermal(ctx, cond, s.panels, net.q[i], tIn, tRoom, detail));
  for (let it = 1; it < iterations; it++) {
    tMean = thermal.map((t) => t.tMean);
    net = solveZone(ctx, spec, qTot, tMean, tPipe);
    thermal = spec.strands.map((s, i) => strandThermal(ctx, cond, s.panels, net.q[i], tIn, tRoom, detail));
  }
  return { net, thermal, tMean: thermal.map((t) => t.tMean) };
}

/** Circuitkarakteristiek Δp0(Q) als geïnterpoleerde tabel (log-log), Q in m³/s, Δp in Pa. */
export interface CircuitFn {
  (q: number): number;
  table: { q: number; dp: number }[];
}

const RATIOS = [0.05, 0.15, 0.3, 0.5, 0.7, 0.85, 1.0, 1.2, 1.6, 2.4];

export function buildCircuit(
  ctx: PlafondContext,
  cond: ModeConditions,
  spec: ZoneNetworkSpec,
  vmax: number,
  tMean: number[],
): CircuitFn {
  const sign = cond.mode === 'koelen' ? 1 : -1;
  const tPipe = cond.tIn + (sign * cond.dt) / 2;
  const table = RATIOS.map((r) => {
    const q = vmax * r;
    return { q, dp: solveZone(ctx, spec, q, tMean, tPipe).dp0 };
  });
  return makeCircuitFn(table);
}

export function makeCircuitFn(table: { q: number; dp: number }[]): CircuitFn {
  const lq = table.map((t) => Math.log(t.q));
  const ld = table.map((t) => Math.log(Math.max(t.dp, 1e-6)));
  const n = table.length;
  const slope = (i: number): number => (ld[i + 1] - ld[i]) / (lq[i + 1] - lq[i]);
  const fn = ((q: number): number => {
    if (q <= 0) return 0;
    const x = Math.log(q);
    if (x <= lq[0]) {
      const m = Math.min(Math.max(slope(0), 1), 2);
      return Math.exp(ld[0] + m * (x - lq[0]));
    }
    if (x >= lq[n - 1]) {
      const m = Math.min(Math.max(slope(n - 2), 1), 2);
      return Math.exp(ld[n - 1] + m * (x - lq[n - 1]));
    }
    let i = 0;
    while (i < n - 2 && x > lq[i + 1]) i++;
    return Math.exp(ld[i] + slope(i) * (x - lq[i]));
  }) as CircuitFn;
  fn.table = table;
  return fn;
}
