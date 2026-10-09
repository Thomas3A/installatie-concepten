// Dynamische simulatie (§5.12): regelaar → klepdynamiek → debiet → netwerk → thermiek → paneeltraagheid → ruimte.
// De stapfunctie is puur: step(state, design, dt) levert een nieuwe toestand en wijzigt de invoer niet.
import { piStep, type PiState } from '../../../core/control/pi';
import { cp as cpW, rho as rhoW } from '../../../core/water';
import { TYPE_A } from '../data/valves';
import type { Mode } from './config';
import { dewProtection, dtManagerStep, flowFraction, type DewState } from './controller';
import type { Design, ValveDesign } from './design';
import { loadPower, operativeTemp, zoneRoom, type ZoneRoom } from './room';
import { rChar, strandThermal, strandVolume, type StrandThermal } from './strand';
import { solveZone } from './zoneHydraulics';
import {
  picvKvOpen,
  flowFractionAtTheta,
  flowFractionToOpening,
  solveFlow,
  thetaTarget,
  thetaToState,
  m3sToM3h,
} from './valves';

export type RunMode = Mode | 'stop';
export const DT_SIM = 2; // s
export const LOG_INTERVAL = 30; // s
export const LOG_MAX = (24 * 3600) / LOG_INTERVAL;

export interface ZoneSim {
  pi: PiState;
  vraag: number;
  /** debietsetpoint na begrenzingen (m³/s) */
  qSet: number;
  qLimit: number;
  limitMode: RunMode;
  dew: DewState;
  tDew: number;
  satTime: number;
  stableTime: number;
  dtLimiting: boolean;
  // Type B
  theta: number;
  thetaTarget: number;
  // Type A
  sixWay: Mode;
  switchTarget: Mode;
  switchLeft: number;
  picvQ: number;
  // hydrauliek
  hydMode: Mode | 'dicht';
  lastHyd: Mode;
  q: number;
  /** drukverschil over de regelende klep (B: de klep; A: de PICV), Pa */
  dpValve: number;
  dpCircuit: number;
  frac: number[];
  qStrand: number[];
  qSolved: number;
  qThermal: number;
  tAirThermal: number;
  solvedMode: Mode | 'dicht';
  solvedAt: number;
  thermal: StrandThermal[];
  tMean: number[];
  /** stationair vermogen per streng, W, teken: + = warmte aan de ruimte */
  pSs: number[];
  pStrand: number[];
  tRetStrand: number[];
  /** 1 = water op stationaire temperatuur, daalt naar 0 bij stilstaand water */
  warm: number;
  oppDev: number;
  tOppMin: number;
  // metingen
  power: number;
  tRetMix: number;
  dtMeas: number;
  energyCool: number;
  energyHeat: number;
}

export interface SimState {
  t: number;
  mode: RunMode;
  lastMode: Mode;
  tAir: number[];
  tOp: number[];
  zones: ZoneSim[];
  // energiebalans (J) per zone
  eCeiling: number[];
  eLoad: number[];
  eCoupling: number[];
}

export interface LogEntry {
  t: number;
  tAir: number[];
  tOp: number[];
  tSet: number;
  /** per zone */
  tSupply: number[];
  tReturn: number[];
  pCeiling: number[];
  pLoad: number[];
  vraag: number[];
  q: number[];
  vmax: number[];
  /** Type B: θ (°); Type A: PICV-slag (%) */
  valvePos: number[];
  strandQ: number[][];
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi);

function modeOrDefault(m: RunMode, last: Mode): Mode {
  return m === 'stop' ? last : m;
}

function newZone(vd: ValveDesign, design: Design, tAir: number, lastMode: Mode): ZoneSim {
  const n = vd.strands.length;
  const md = vd.modes[lastMode];
  return {
    pi: { I: 0 },
    vraag: 0,
    qSet: 0,
    qLimit: md.vmax,
    limitMode: 'stop',
    dew: { active: false },
    tDew: 0,
    satTime: 0,
    stableTime: 0,
    dtLimiting: false,
    theta: 45,
    thetaTarget: 45,
    sixWay: lastMode,
    switchTarget: lastMode,
    switchLeft: 0,
    picvQ: 0,
    hydMode: 'dicht',
    lastHyd: lastMode,
    q: 0,
    dpValve: vd.dpAvail,
    dpCircuit: 0,
    frac: md.net.q.map((q) => q / Math.max(md.vmax, 1e-12)),
    qStrand: new Array(n).fill(0),
    qSolved: 0,
    qThermal: 0,
    tAirThermal: tAir,
    solvedMode: 'dicht',
    solvedAt: -1e9,
    thermal: [],
    tMean: md.tMean.slice(),
    pSs: new Array(n).fill(0),
    pStrand: new Array(n).fill(0),
    tRetStrand: new Array(n).fill(NaN),
    warm: 0,
    oppDev: 0,
    tOppMin: tAir,
    power: 0,
    tRetMix: NaN,
    dtMeas: NaN,
    energyCool: 0,
    energyHeat: 0,
  };
  void design;
}

export function autoStartTemp(design: Design, mode: RunMode): number {
  const cfg = design.cfg;
  return mode === 'verwarmen' ? cfg.setHeat - 3 : cfg.setCool + 3;
}

export function initialState(design: Design, mode: RunMode = 'stop'): SimState {
  const cfg = design.cfg;
  const lastMode: Mode = mode === 'stop' ? 'koelen' : mode;
  const t0 = cfg.startTemp ?? autoStartTemp(design, lastMode);
  const n = design.valves.length;
  return {
    t: 0,
    mode,
    lastMode,
    tAir: new Array(n).fill(t0),
    tOp: new Array(n).fill(t0),
    zones: design.valves.map((vd) => newZone(vd, design, t0, lastMode)),
    eCeiling: new Array(n).fill(0),
    eLoad: new Array(n).fill(0),
    eCoupling: new Array(n).fill(0),
  };
}

/** Wissel van modus. Bij t = 0 met automatische starttemperatuur volgt de starttemperatuur de gekozen modus. */
export function setRunMode(state: SimState, design: Design, mode: RunMode): SimState {
  if (mode === state.mode) return state;
  const cfg = design.cfg;
  const lastMode: Mode = mode === 'stop' ? state.lastMode : mode;
  let tAir = state.tAir;
  let tOp = state.tOp;
  if (state.t === 0 && mode !== 'stop' && !cfg.keepCurrent && cfg.startTemp === null) {
    const t0 = autoStartTemp(design, mode);
    tAir = state.tAir.map(() => t0);
    tOp = state.tOp.map(() => t0);
  }
  const zones = state.zones.map((z) => ({ ...z, pi: { I: 0 }, satTime: 0 }));
  return { ...state, mode, lastMode, tAir, tOp, zones };
}

function stepZone(state: SimState, design: Design, i: number, dt: number): ZoneSim {
  const cfg = design.cfg;
  const ctx = design.ctx;
  const vd = design.valves[i];
  const v = vd.cfg;
  const z = state.zones[i];
  const tAir = state.tAir[i];
  const act = state.mode;
  const lim = cfg.advanced.limits;
  const nGl = cfg.advanced.valveB.nGl;

  // ---------- 1. regelaar
  let pi = z.pi;
  let vraag = 0;
  let dew: DewState = z.dew;
  let tDew = z.tDew;
  let qSet = 0;
  let qLimit = z.qLimit;
  let satTime = z.satTime;
  let dtLimiting = false;
  if (act !== 'stop') {
    const md = vd.modes[act];
    if (z.limitMode !== act) qLimit = md.vmax;
    const e = act === 'verwarmen' ? cfg.setHeat - tAir : tAir - cfg.setCool;
    const r = piStep(z.pi, e, { Kp: cfg.Kp, Ti: cfg.Ti }, dt);
    pi = r.state;
    vraag = r.u;
    if (act === 'koelen' && cfg.dewProtection) {
      // Het dauwpunt volgt de ruimtecondities bij het koelsetpoint (de RV is gegeven bij die temperatuur).
      const d = dewProtection(z.dew, cfg.tSupplyCool, cfg.setCool, cfg.rh, lim.dewMargin);
      dew = d.state;
      tDew = d.tDew;
      if (dew.active) vraag = 0;
    } else {
      dew = { active: false };
    }
    qSet = flowFraction(vraag, cfg.flowChar, nGl) * md.vmax;
    if (v.type === 'B' && v.dtManager) {
      if (z.q > 0.1 * md.vmax && z.hydMode === act) {
        qLimit = dtManagerStep(
          qLimit,
          md.vmax,
          z.dtMeas,
          act === 'koelen' ? v.dtMinKoelen : v.dtMinVerwarmen,
          dt,
        );
      }
      if (qLimit < qSet) {
        dtLimiting = true;
        qSet = qLimit;
      }
    }
    satTime = vraag >= 0.999 && e > 0.05 ? z.satTime + dt : 0;
  } else {
    satTime = 0;
  }

  // ---------- 2. klepdynamiek en 3. werkelijk debiet
  let theta = z.theta;
  let thetaTgt = z.thetaTarget;
  let sixWay = z.sixWay;
  let switchTarget = z.switchTarget;
  let switchLeft = z.switchLeft;
  let picvQ = z.picvQ;
  let q = 0;
  let hydMode: Mode | 'dicht' = 'dicht';
  let dpValve = vd.dpAvail;
  if (v.type === 'B') {
    // Software-gestuurde klep met flowmeting: Vmax van de sequentie komt overeen met 100 % opening
    // en de karakteristiek koppelt opening en debietfractie.
    if (act === 'stop') thetaTgt = 45;
    else {
      const frac = vd.modes[act].vmax > 0 ? Math.min(qSet / vd.modes[act].vmax, 1) : 0;
      thetaTgt = thetaTarget(act, flowFractionToOpening(frac, nGl));
    }
    const rate = 90 / cfg.advanced.valveB.runtime90;
    theta += clamp(thetaTgt - theta, -rate * dt, rate * dt);
    const st = thetaToState(theta);
    hydMode = st.seq;
    if (st.seq !== 'dicht') {
      const md = vd.modes[st.seq];
      const qValve = md.vmax * flowFractionAtTheta(theta, nGl);
      // het circuit begrenst het debiet bij het beschikbare Δp
      const qAvail = solveFlow(vd.dpAvail, md.circuit);
      q = Math.min(qValve, qAvail);
      dpValve = vd.dpAvail - md.circuit(q);
    }
  } else {
    const wanted: Mode | null = act === 'stop' ? null : act;
    const mdPos = vd.modes[sixWay];
    const rateQ = mdPos.vmax / cfg.advanced.valveA.picvStroke;
    const picvTarget = wanted !== null && wanted === sixWay && switchLeft <= 0 ? qSet : 0;
    picvQ += clamp(picvTarget - picvQ, -rateQ * dt, rateQ * dt);
    if (switchLeft <= 0 && wanted !== null && wanted !== sixWay && picvQ <= 1e-9) {
      switchLeft = cfg.advanced.valveA.switchTime;
      switchTarget = wanted;
      picvQ = 0;
    }
    if (switchLeft > 0) {
      switchLeft -= dt;
      if (switchLeft <= 0) {
        switchLeft = 0;
        sixWay = switchTarget;
      }
    }
    if (switchLeft <= 0) {
      const md = vd.modes[sixWay];
      const kvSix = TYPE_A.kvsSixWay[v.dn];
      const kvOpen = picvKvOpen(md.vmax, vd.picv.dpMin);
      const qAvail = solveFlow(vd.dpAvail, md.circuit, [kvSix, kvOpen]);
      q = Math.min(picvQ, qAvail);
      hydMode = q > 1e-10 ? sixWay : 'dicht';
      dpValve = vd.dpAvail - md.circuit(q) - 1e5 * (m3sToM3h(q) / kvSix) ** 2;
    }
  }
  if (q < 1e-10) q = 0;

  // ---------- 4. netwerkverdeling en 5. thermiek (met cache)
  const n = vd.strands.length;
  let { frac, qSolved, solvedAt, solvedMode, thermal, tMean, qThermal, tAirThermal } = z;
  let pSs = z.pSs;
  let warm = z.warm;
  let lastHyd = z.lastHyd;
  let qStrand: number[] = new Array(n).fill(0);
  let dpCircuit = 0;
  if (q > 0 && hydMode !== 'dicht') {
    const m = hydMode;
    lastHyd = m;
    const md = vd.modes[m];
    const cond = md.cond;
    const sign = m === 'koelen' ? 1 : -1;
    dpCircuit = md.circuit(q);
    const needSolve = solvedMode !== m || Math.abs(q - qSolved) > 0.02 * qSolved || state.t - solvedAt > 300;
    if (needSolve) {
      const tPipe = cond.tIn + (sign * cond.dt) / 2;
      const net = solveZone(ctx, vd.spec, q, tMean, tPipe);
      frac = net.q.map((x) => x / q);
      qSolved = q;
      solvedAt = state.t;
      dpCircuit = net.dp0;
    }
    qStrand = frac.map((f) => f * q);
    const needThermal =
      needSolve ||
      thermal.length !== n ||
      Math.abs(q - qThermal) > 0.005 * qThermal ||
      Math.abs(tAir - tAirThermal) > 0.05;
    if (needThermal) {
      thermal = vd.strands.map((s, k) =>
        strandThermal(ctx, cond, s.panels, qStrand[k], cond.tIn, tAir, true),
      );
      tMean = thermal.map((t) => t.tMean);
      qThermal = q;
      tAirThermal = tAir;
      const sg = m === 'verwarmen' ? 1 : -1;
      pSs = thermal.map((t) => sg * t.power);
      solvedMode = m;
    }
    warm = 1;
  } else {
    pSs = new Array(n).fill(0);
    warm = warm * Math.exp(-dt / 300);
    solvedMode = 'dicht';
  }

  // ---------- 6. paneeltraagheid
  const condL = vd.modes[lastHyd].cond;
  const rc8 = rChar(8, condL, ctx.fs);
  const tauBase = ctx.tauFactor * ctx.cPanel * rc8;
  const pStrand = new Array<number>(n);
  let tauSum = 0;
  for (let k = 0; k < n; k++) {
    const s = vd.strands[k];
    const vol = strandVolume(ctx, s.panels, s.extraLength);
    const qk = qStrand[k];
    const res = qk > 1e-12 ? Math.min(vol / qk, 300) : 300;
    const tau = tauBase + res;
    tauSum += tau;
    pStrand[k] = pSs[k] + (z.pStrand[k] - pSs[k]) * Math.exp(-dt / tau);
  }
  const tauMean = tauSum / Math.max(n, 1);
  let pTot = 0;
  for (const p of pStrand) pTot += p;

  // T_retour per streng uit vermogen
  const tRetStrand = new Array<number>(n).fill(NaN);
  let num = 0;
  let den = 0;
  if (q > 0 && hydMode !== 'dicht') {
    const cond = vd.modes[hydMode].cond;
    const dir = hydMode === 'koelen' ? 1 : -1;
    const dMax = Math.abs(cond.tRoom - cond.tIn);
    for (let k = 0; k < n; k++) {
      const mdot = qStrand[k] * rhoW(cond.tIn);
      if (mdot <= 1e-12) continue;
      // alleen vermogen in de richting van de actieve modus bepaalt de retourtemperatuur
      const mag = hydSign(hydMode) * pStrand[k] > 0 ? Math.abs(pStrand[k]) : 0;
      const d = Math.min(mag / (mdot * cpW(cond.tIn)), dMax);
      tRetStrand[k] = cond.tIn + dir * d;
      num += qStrand[k] * tRetStrand[k];
      den += qStrand[k];
    }
  }
  const tRetMix = den > 0 ? num / den : NaN;
  const tInMeas = hydMode !== 'dicht' ? vd.modes[hydMode].cond.tIn : NaN;
  const dtMeas = Number.isFinite(tRetMix) ? Math.abs(tRetMix - tInMeas) : NaN;

  // Oppervlaktetemperatuur (gem.) en minimum
  let target = 0;
  let tOppMin = tAir;
  if (q > 0 && hydMode !== 'dicht' && thermal.length === n) {
    let w = 0;
    let acc = 0;
    let mn = Infinity;
    for (let k = 0; k < n; k++) {
      const pn = vd.strands[k].panels;
      acc += thermal[k].tOppMean * pn;
      w += pn;
      mn = Math.min(mn, thermal[k].tOppMin);
    }
    target = acc / w - tAir;
    tOppMin = mn;
  }
  const oppDev = z.oppDev + (target - z.oppDev) * (1 - Math.exp(-dt / tauMean));

  // stabiel bedrijf (voor W06 in bedrijf)
  const stableTime =
    act !== 'stop' && hydMode === act && q > 0.05 * vd.modes[act].vmax ? z.stableTime + dt : 0;

  // energie (J), gemeten aan de waterzijde
  const energyCool = z.energyCool + Math.max(-pTot, 0) * dt;
  const energyHeat = z.energyHeat + Math.max(pTot, 0) * dt;

  return {
    pi,
    vraag,
    qSet,
    qLimit,
    limitMode: act,
    dew,
    tDew,
    satTime,
    stableTime,
    dtLimiting,
    theta,
    thetaTarget: thetaTgt,
    sixWay,
    switchTarget,
    switchLeft,
    picvQ,
    hydMode,
    lastHyd,
    q,
    dpValve,
    dpCircuit,
    frac,
    qStrand,
    qSolved,
    qThermal,
    tAirThermal,
    solvedMode,
    solvedAt,
    thermal,
    tMean,
    pSs,
    pStrand,
    tRetStrand,
    warm,
    oppDev,
    tOppMin,
    power: pTot,
    tRetMix,
    dtMeas,
    energyCool,
    energyHeat,
  };
}

const hydSign = (m: Mode): number => (m === 'verwarmen' ? 1 : -1);

export function roomsOf(design: Design): ZoneRoom[] {
  const cfg = design.cfg;
  const g = design.ctx.geom;
  return design.valves.map((vd) => zoneRoom(cfg, vd.share, vd.cfg.panelCount, g.area));
}

/** Eén tijdstap van dt seconden. */
export function step(state: SimState, design: Design, dt: number = DT_SIM, rooms?: ZoneRoom[]): SimState {
  const cfg = design.cfg;
  const n = design.valves.length;
  const R = rooms ?? roomsOf(design);
  const zones = new Array<ZoneSim>(n);
  for (let i = 0; i < n; i++) zones[i] = stepZone(state, design, i, dt);
  const tAir = new Array<number>(n);
  const tOp = new Array<number>(n);
  const eCeiling = state.eCeiling.slice();
  const eLoad = state.eLoad.slice();
  const eCoupling = state.eCoupling.slice();
  for (let i = 0; i < n; i++) {
    const T = state.tAir[i];
    const pC = zones[i].power;
    const pL = loadPower(cfg, R[i], state.lastMode, T);
    let pK = 0;
    if (i > 0) pK += cfg.advanced.hZone * (state.tAir[i - 1] - T);
    if (i < n - 1) pK += cfg.advanced.hZone * (state.tAir[i + 1] - T);
    tAir[i] = T + (dt * (pC + pL + pK)) / R[i].C;
    eCeiling[i] += pC * dt;
    eLoad[i] += pL * dt;
    eCoupling[i] += pK * dt;
    tOp[i] = operativeTemp(tAir[i], tAir[i] + zones[i].oppDev, R[i].occupancy);
  }
  return { ...state, t: state.t + dt, tAir, tOp, zones, eCeiling, eLoad, eCoupling };
}

/** Meerdere stappen; stopt vroegtijdig als het tijdbudget (ms) op is. Retourneert het aantal uitgevoerde stappen. */
export function advance(
  state: SimState,
  design: Design,
  steps: number,
  budgetMs = Infinity,
  onStep?: (s: SimState) => void,
): { state: SimState; done: number } {
  const rooms = roomsOf(design);
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  let s = state;
  let done = 0;
  for (; done < steps; done++) {
    s = step(s, design, DT_SIM, rooms);
    onStep?.(s);
    if (budgetMs !== Infinity && (done & 3) === 3 && performance.now() - t0 > budgetMs) {
      done++;
      break;
    }
  }
  return { state: s, done };
}

export function logEntry(state: SimState, design: Design): LogEntry {
  const cfg = design.cfg;
  const R = roomsOf(design);
  const act = modeOrDefault(state.mode, state.lastMode);
  return {
    t: state.t,
    tAir: state.tAir.slice(),
    tOp: state.tOp.slice(),
    tSet: act === 'verwarmen' ? cfg.setHeat : cfg.setCool,
    tSupply: state.zones.map((z, i) =>
      z.hydMode !== 'dicht' ? design.valves[i].modes[z.hydMode].cond.tIn : NaN,
    ),
    tReturn: state.zones.map((z) => z.tRetMix),
    pCeiling: state.zones.map((z) => z.power),
    pLoad: state.zones.map((_, i) => loadPower(cfg, R[i], state.lastMode, state.tAir[i])),
    vraag: state.zones.map((z) => z.vraag),
    q: state.zones.map((z) => z.q),
    vmax: state.zones.map((_, i) => design.valves[i].modes[act].vmax),
    valvePos: state.zones.map((z, i) =>
      design.valves[i].cfg.type === 'B'
        ? z.theta
        : (100 * z.picvQ) / Math.max(design.valves[i].modes[z.sixWay].vmax, 1e-12),
    ),
    strandQ: state.zones.map((z) => z.qStrand.slice()),
  };
}
