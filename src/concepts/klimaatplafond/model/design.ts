// Ontwerp: ontwerpdebieten, automatisch koppelen (de puzzel), netwerk bij Vmax en klepadvies (§5.8, §5.9).
import { reynolds, velocity } from '../../../core/hydraulics/friction';
import type { NetworkResult } from '../../../core/hydraulics/network';
import { rho } from '../../../core/water';
import { distPipe } from '../data/pipes';
import { LIMITS } from '../data/limits';
import { TYPE_A, TYPE_B, picvSpec } from '../data/valves';
import { MASS_KJ, type KlimaatplafondConfig, type Mode, type ValveConfig } from './config';
import { buildContext, type ModeConditions, type PlafondContext } from './context';
import { designFlow, strandDp, strandThermal, type StrandThermal } from './strand';
import {
  buildCircuit,
  solveZoneCoupled,
  type CircuitFn,
  type StrandSpec,
  type ZoneNetworkSpec,
} from './zoneHydraulics';
import {
  adviceTypeA,
  adviceTypeB,
  dpNeeded,
  solveFlow,
  type AdviceA,
  type AdviceB,
  m3sToM3h,
} from './valves';

export const MODES: Mode[] = ['koelen', 'verwarmen'];

export interface DesignPoint {
  panels: number;
  extraLength: number;
  /** ontwerpdebiet m³/s */
  q: number;
  re: number;
  v: number;
  /** drukval Pa */
  dp: number;
  /** vermogen W */
  power: number;
  tRet: number;
  tMean: number;
  feasible: boolean;
}

export interface CandidateMode {
  points: DesignPoint[];
  valid: boolean;
  penalty: number;
  zonePower: number;
  vmax: number;
  /** de langste streng (kolomwaarden in de matrix) */
  head: DesignPoint;
}

export interface Candidate {
  s: number;
  p: number;
  distribution: number[];
  tooMany: boolean;
  modes: Record<Mode, CandidateMode>;
  /** geldig in beide modi */
  valid: boolean;
  /** geldig als het aantal strengen niet zou beperken */
  validIgnoringCount: boolean;
  penalty: number;
  /** zelfde verdeling als kolom met kleinere s */
  sameAs?: number;
}

export interface ModeDesign {
  mode: Mode;
  cond: ModeConditions;
  strands: StrandSpec[];
  points: DesignPoint[];
  /** Vmax in m³/s */
  vmax: number;
  vmaxAutoValue: number;
  net: NetworkResult;
  thermal: StrandThermal[];
  tMean: number[];
  circuit: CircuitFn;
  /** Δp na de klep bij Vmax (Pa) */
  dpCircuit: number;
  /** Zonevermogen bij ontwerpcondities (W), grootte */
  power: number;
  tRetMix: number;
  dtMix: number;
  /** Verdeling t.o.v. ontwerpdebiet, genormaliseerd op Vmax (afwijking per streng) */
  deviation: number[];
  tOppMin: number;
  tOppMean: number;
  feasible: boolean;
}

export interface ValveAdvice {
  b: AdviceB;
  a: AdviceA;
}

export interface ValveDesign {
  index: number;
  cfg: ValveConfig;
  /** Aandeel van de ruimte/last (0..1) */
  share: number;
  areaZone: number;
  loadHeat: number;
  loadCool: number;
  /** beschikbaar Δp in Pa */
  dpAvail: number;
  strands: StrandSpec[];
  spec: ZoneNetworkSpec;
  candidates: Candidate[];
  chosen: number | null;
  modes: Record<Mode, ModeDesign>;
  advice: ValveAdvice;
  /** Kvs/PICV zoals toegepast (config of advies) */
  kvs: Record<Mode, number>;
  picv: ReturnType<typeof picvSpec>;
  /** benodigd Δp (kPa) per modus */
  needed: Record<Mode, number>;
  /** maximaal haalbaar debiet (m³/s) bij volledig open klep */
  qMaxFeasible: Record<Mode, number>;
  /** Kv_nodig/Kvs (type B) */
  kvRatio: Record<Mode, number>;
  tooManyStrandsNeeded: boolean;
}

export interface Design {
  cfg: KlimaatplafondConfig;
  ctx: PlafondContext;
  valves: ValveDesign[];
  /** Totale paneelbezetting/vloer per zone staat in valves */
  cFloor: number;
}

// ------------------------------------------------------------------ ontwerppunten

class DesignCache {
  private flow = new Map<string, { q: number; feasible: boolean }>();
  private th = new Map<string, StrandThermal>();
  constructor(private ctx: PlafondContext) {}
  point(cond: ModeConditions, panels: number, extra: number): DesignPoint {
    const key = `${cond.mode}:${panels}`;
    let f = this.flow.get(key);
    if (!f) {
      f = designFlow(this.ctx, cond, panels);
      this.flow.set(key, f);
    }
    let t = this.th.get(key);
    if (!t) {
      t = strandThermal(this.ctx, cond, panels, f.q);
      this.th.set(key, t);
    }
    const dp = strandDp(this.ctx, panels, extra, f.q, t.tMean);
    return {
      panels,
      extraLength: extra,
      q: f.q,
      re: reynolds(f.q, this.ctx.di, t.tMean),
      v: velocity(f.q, this.ctx.di),
      dp,
      power: t.power,
      tRet: t.tRet,
      tMean: t.tMean,
      feasible: f.feasible,
    };
  }
}

/** Verdeel N panelen over p strengen zo gelijk mogelijk; langste strengen eerst. */
export function distribute(N: number, p: number): number[] {
  const base = Math.floor(N / p);
  const rest = N % p;
  return Array.from({ length: p }, (_, i) => base + (i < rest ? 1 : 0));
}

function penaltyOf(
  pt: DesignPoint,
  dpMax: number,
  lim: { vMin: number; vMax: number; reLaminar: number },
): number {
  return (
    Math.max(0, pt.dp / dpMax - 1) +
    Math.max(0, (lim.reLaminar - pt.re) / lim.reLaminar) +
    Math.max(0, (lim.vMin - pt.v) / lim.vMin) +
    Math.max(0, (pt.v - lim.vMax) / lim.vMax) +
    (pt.feasible ? 0 : 10)
  );
}

function pointValid(
  pt: DesignPoint,
  dpMax: number,
  lim: { vMin: number; vMax: number; reLaminar: number },
): boolean {
  return pt.dp <= dpMax && pt.re >= lim.reLaminar && pt.v >= lim.vMin && pt.v <= lim.vMax && pt.feasible;
}

export function buildCandidates(
  cfg: KlimaatplafondConfig,
  ctx: PlafondContext,
  N: number,
  cache: DesignCache,
): Candidate[] {
  const out: Candidate[] = [];
  const dpMax = cfg.dpMax * 1000;
  const lim = cfg.advanced.limits;
  const seen = new Map<string, number>();
  for (let s = 1; s <= Math.min(N, LIMITS.maxPanelsPerStrand); s++) {
    const p = Math.ceil(N / s);
    const distribution = distribute(N, p);
    const tooMany = p > LIMITS.maxStrands;
    const modes = {} as Record<Mode, CandidateMode>;
    for (const m of MODES) {
      const cond = ctx.conditions[m];
      const points = distribution.map((n) => cache.point(cond, n, 0));
      const valid = points.every((pt) => pointValid(pt, dpMax, lim));
      const penalty = Math.max(...points.map((pt) => penaltyOf(pt, dpMax, lim)));
      modes[m] = {
        points,
        valid,
        penalty,
        zonePower: points.reduce((a, pt) => a + pt.power, 0),
        vmax: points.reduce((a, pt) => a + pt.q, 0),
        head: points[0],
      };
    }
    const key = distribution.join('-');
    const cand: Candidate = {
      s,
      p,
      distribution,
      tooMany,
      modes,
      validIgnoringCount: modes.koelen.valid && modes.verwarmen.valid,
      valid: !tooMany && modes.koelen.valid && modes.verwarmen.valid,
      penalty: Math.max(modes.koelen.penalty, modes.verwarmen.penalty),
      sameAs: seen.get(key),
    };
    if (!seen.has(key)) seen.set(key, s);
    out.push(cand);
  }
  return out;
}

/** Kies de geldige kandidaat met de minste strengen; anders de laagste strafscore. */
export function chooseCandidate(cands: Candidate[]): number | null {
  const usable = cands.map((c, i) => ({ c, i })).filter(({ c }) => !c.tooMany);
  if (usable.length === 0) return null;
  const valid = usable.filter(({ c }) => c.valid);
  const pool = valid.length ? valid : usable;
  let best = pool[0];
  for (const x of pool) {
    if (valid.length) {
      if (x.c.p < best.c.p) best = x;
    } else if (
      x.c.penalty < best.c.penalty - 1e-12 ||
      (Math.abs(x.c.penalty - best.c.penalty) <= 1e-12 && x.c.p < best.c.p)
    ) {
      best = x;
    }
  }
  return best.i;
}

// ------------------------------------------------------------------ zone-ontwerp

function designMode(
  ctx: PlafondContext,
  cache: DesignCache,
  v: ValveConfig,
  strands: StrandSpec[],
  spec: ZoneNetworkSpec,
  mode: Mode,
): ModeDesign {
  const cond = ctx.conditions[mode];
  const points = strands.map((s) => cache.point(cond, s.panels, s.extraLength));
  const sumQ = points.reduce((a, p) => a + p.q, 0);
  const vmaxAutoValue = Math.ceil(sumQ * 3.6e6) / 3.6e6;
  const vmax = v.vmaxAuto ? vmaxAutoValue : (mode === 'koelen' ? v.vmaxKoelen : v.vmaxVerwarmen) / 3.6e6;
  const zs = solveZoneCoupled(ctx, cond, spec, vmax, undefined, 3, true);
  const circuit = buildCircuit(ctx, cond, spec, vmax, zs.tMean);
  const scale = sumQ > 0 ? vmax / sumQ : 1;
  const deviation = zs.net.q.map((q, i) => q / (points[i].q * scale) - 1);
  const power = zs.thermal.reduce((a, t) => a + t.power, 0);
  const rhoIn = rho(cond.tIn);
  // gemengde retourtemperatuur (debietgewogen)
  let num = 0;
  for (const t of zs.thermal) if (Number.isFinite(t.tRet)) num += t.q * t.tRet;
  const tRetMix = vmax > 0 ? num / vmax : NaN;
  void rhoIn;
  const oppMin = Math.min(...zs.thermal.map((t) => t.tOppMin));
  const wTot = strands.reduce((a, s) => a + s.panels, 0);
  const oppMean = zs.thermal.reduce((a, t, i) => a + t.tOppMean * strands[i].panels, 0) / Math.max(wTot, 1);
  return {
    mode,
    cond,
    strands,
    points,
    vmax,
    vmaxAutoValue,
    net: zs.net,
    thermal: zs.thermal,
    tMean: zs.tMean,
    circuit,
    dpCircuit: zs.net.dp0,
    power,
    tRetMix,
    dtMix: Math.abs(tRetMix - cond.tIn),
    deviation,
    tOppMin: oppMin,
    tOppMean: oppMean,
    feasible: points.every((p) => p.feasible),
  };
}

export function zoneShares(cfg: KlimaatplafondConfig): number[] {
  const adv = cfg.advanced;
  if (adv.loadSplit === 'manual') {
    const sum = cfg.valves.reduce((a, v) => a + v.loadShare, 0) || 1;
    return cfg.valves.map((v) => v.loadShare / sum);
  }
  const total = cfg.valves.reduce((a, v) => a + v.panelCount, 0) || 1;
  return cfg.valves.map((v) => v.panelCount / total);
}

export function computeDesign(cfgIn: KlimaatplafondConfig): Design {
  const cfg = cfgIn;
  const ctx = buildContext(cfg);
  const cache = new DesignCache(ctx);
  const shares = zoneShares(cfg);
  const valves: ValveDesign[] = cfg.valves.map((v, index) => {
    const dp = v.dpAvailable ?? cfg.dpAvailable;
    const dist = distPipe(v.distPipe);
    const distSpec = { di: dist.di, eps: cfg.advanced.epsMulti * 1e-3 };
    const candidates = buildCandidates(cfg, ctx, v.panelCount, cache);
    const chosen = chooseCandidate(candidates);
    let strands: StrandSpec[];
    if (v.coupling === 'manual' && v.manualStrands.length > 0) {
      strands = v.manualStrands.map((s) => ({ panels: s.panels, extraLength: s.extraLength }));
    } else {
      const dist2 = chosen !== null ? candidates[chosen].distribution : [v.panelCount];
      strands = dist2.map((n) => ({ panels: n, extraLength: 0 }));
    }
    const spec: ZoneNetworkSpec = {
      strands,
      dist: distSpec,
      x1: v.distanceFirst,
      hc: v.spacing,
      layout: v.layout,
    };
    const modes = {
      koelen: designMode(ctx, cache, v, strands, spec, 'koelen'),
      verwarmen: designMode(ctx, cache, v, strands, spec, 'verwarmen'),
    };
    const vmaxM = { koelen: modes.koelen.vmax, verwarmen: modes.verwarmen.vmax };
    const dpC = { koelen: modes.koelen.dpCircuit, verwarmen: modes.verwarmen.dpCircuit };
    const advice: ValveAdvice = {
      b: adviceTypeB(v.dn, vmaxM, dp * 1000, dpC, cfg.advanced.valveB.nGl),
      a: adviceTypeA(
        v.dn,
        { koelen: vmaxM.koelen * 3.6e6, verwarmen: vmaxM.verwarmen * 3.6e6 },
        dp * 1000,
        dpC,
        vmaxM,
      ),
    };
    const kvList = TYPE_B.kvs[v.dn];
    const kvsPick = (m: Mode, given: number | null): number =>
      given ?? advice.b.kvs[m] ?? kvList[kvList.length - 1];
    const kvs = { koelen: kvsPick('koelen', v.kvsKoelen), verwarmen: kvsPick('verwarmen', v.kvsVerwarmen) };
    const picv = picvSpec(v.picv ?? advice.a.picv);
    const needed = {} as Record<Mode, number>;
    const qMax = {} as Record<Mode, number>;
    const kvRatio = {} as Record<Mode, number>;
    for (const m of MODES) {
      const md = modes[m];
      needed[m] = dpNeeded(v.type, md.vmax, md.dpCircuit, kvs[m], v.dn, picv.id);
      if (v.type === 'B') {
        qMax[m] = solveFlow(dp * 1000, md.circuit, [kvs[m]]);
      } else {
        const kvOpen = md.vmax > 0 ? m3sToM3h(md.vmax) / Math.sqrt(picv.dpMin / 100) : 1e9;
        qMax[m] = solveFlow(dp * 1000, md.circuit, [TYPE_A.kvsSixWay[v.dn], kvOpen]);
      }
      kvRatio[m] = Number.isFinite(advice.b.kvNodig[m]) ? advice.b.kvNodig[m] / kvs[m] : Infinity;
    }
    const share = shares[index];
    const areaZone = cfg.floorArea * share;
    return {
      index,
      cfg: v,
      share,
      areaZone,
      loadHeat: cfg.heatLoss * share,
      loadCool: cfg.coolLoad * share,
      dpAvail: dp * 1000,
      strands,
      spec,
      candidates,
      chosen,
      modes,
      advice,
      kvs,
      picv,
      needed,
      qMaxFeasible: qMax,
      kvRatio,
      tooManyStrandsNeeded: candidates.every((c) => !c.valid) && candidates.some((c) => c.validIgnoringCount),
    };
  });
  return { cfg, ctx, valves, cFloor: MASS_KJ[cfg.mass] * 1000 };
}

/** Pas het klepadvies toe op alle kleppen waar Kvs/PICV nog niet expliciet is ingesteld (null), of op alle kleppen met `force`. */
export function resolveAdvice(cfg: KlimaatplafondConfig, force = false): KlimaatplafondConfig {
  const needs = cfg.valves.some(
    (v) => force || v.kvsKoelen === null || v.kvsVerwarmen === null || v.picv === null,
  );
  if (!needs) return cfg;
  const design = computeDesign(cfg);
  const valves = cfg.valves.map((v, i) => {
    const d = design.valves[i];
    let dn = v.dn;
    let b = d.advice.b;
    // Past de klep niet in DN15, adviseer dan DN20 en bepaal de Kvs binnen DN20.
    if (v.type === 'B' && (force || v.kvsKoelen === null || v.kvsVerwarmen === null) && b.suggestDn20) {
      dn = 20;
      b = adviceTypeB(
        20,
        { koelen: d.modes.koelen.vmax, verwarmen: d.modes.verwarmen.vmax },
        d.dpAvail,
        { koelen: d.modes.koelen.dpCircuit, verwarmen: d.modes.verwarmen.dpCircuit },
        cfg.advanced.valveB.nGl,
      );
    }
    const list = TYPE_B.kvs[dn];
    const fb = list[list.length - 1];
    const keepK = !force && v.kvsKoelen !== null && dn === v.dn;
    const keepV = !force && v.kvsVerwarmen !== null && dn === v.dn;
    const picvAdvice = dn === v.dn ? d.advice.a.picv : null;
    return {
      ...v,
      dn,
      kvsKoelen: keepK ? v.kvsKoelen : (b.kvs.koelen ?? fb),
      kvsVerwarmen: keepV ? v.kvsVerwarmen : (b.kvs.verwarmen ?? fb),
      picv: !force && v.picv !== null && dn === v.dn ? v.picv : (picvAdvice ?? d.picv.id),
    };
  });
  return { ...cfg, valves };
}
