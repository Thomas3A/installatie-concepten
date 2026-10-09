import { describe, expect, it } from 'vitest';
import { solveNetwork } from '../src/core/hydraulics/network';
import { pipeDp, reynolds, velocity } from '../src/core/hydraulics/friction';
import {
  defaultConfig,
  normalizeConfig,
  type KlimaatplafondConfig,
} from '../src/concepts/klimaatplafond/model/config';
import { buildContext } from '../src/concepts/klimaatplafond/model/context';
import { panelGeometry } from '../src/concepts/klimaatplafond/model/panel';
import { designFlow, qChar, strandDp, strandThermal } from '../src/concepts/klimaatplafond/model/strand';
import { computeDesign, resolveAdvice } from '../src/concepts/klimaatplafond/model/design';
import { solveZoneCoupled } from '../src/concepts/klimaatplafond/model/zoneHydraulics';
import { designMessages } from '../src/concepts/klimaatplafond/model/checks';
import { SCENARIOS, buildScenario } from '../src/concepts/klimaatplafond/scenarios';
import {
  initialState,
  roomsOf,
  setRunMode,
  step,
  type SimState,
} from '../src/concepts/klimaatplafond/model/simulation';
import {
  flowFractionAtTheta,
  flowFractionToOpening,
  openingToFlowFraction,
  thetaToState,
} from '../src/concepts/klimaatplafond/model/valves';

const near = (a: number, b: number, tol: number, msg?: string) =>
  expect(Math.abs(a / b - 1), msg ?? `${a} vs ${b}`).toBeLessThanOrEqual(tol);
const lh = (q: number) => q * 3.6e6;

describe('paneelgeometrie', () => {
  it('controlewaarden 600×1200', () => {
    const exp: [75 | 100 | 150, number, number][] = [
      [75, 7, 8.432],
      [100, 5, 6.078],
      [150, 3, 3.671],
    ];
    for (const [pitch, nBenen, lbuis] of exp) {
      const g = panelGeometry('600x1200', pitch);
      expect(g.nBenen).toBe(nBenen);
      expect(g.Lbuis).toBeCloseTo(lbuis, 3);
    }
  });
  it('600×600 steek 100', () => {
    const g = panelGeometry('600x600', 100);
    expect(g.nBenen).toBe(5);
    expect(g.Lbuis).toBeCloseTo(3.078, 3);
  });
});

describe('karakteristiek', () => {
  it('q(8 K) koelen en q(15 K) verwarmen, steek 100', () => {
    const cfg = defaultConfig();
    cfg.pitch = 100;
    const ctx = buildContext(cfg);
    expect(qChar(8, ctx.conditions.koelen, ctx.fs)).toBeCloseTo(85.2, 0);
    expect(Math.abs(qChar(8, ctx.conditions.koelen, ctx.fs) - 85.2)).toBeLessThan(0.2);
    expect(Math.abs(qChar(15, ctx.conditions.verwarmen, ctx.fs) - 120.0)).toBeLessThan(0.2);
  });
});

describe('klep', () => {
  it('0,25 m³/h door Kv 1,0 = 6,25 kPa', () => {
    expect(100 * (0.25 / 1.0) ** 2).toBeCloseTo(6.25, 10);
  });
  it('Type B: dode zone en gelijkprocentige karakteristiek (zonder Kvs)', () => {
    expect(thetaToState(45).seq).toBe('dicht');
    expect(flowFractionAtTheta(45)).toBe(0);
    expect(flowFractionAtTheta(30)).toBe(0); // dichtgrens koelen
    expect(flowFractionAtTheta(0)).toBeCloseTo(1, 10); // koelen volledig open
    expect(flowFractionAtTheta(90)).toBeCloseTo(1, 10); // verwarmen volledig open
    for (const x of [0.02, 0.05, 0.1, 0.3, 0.7, 1]) {
      expect(openingToFlowFraction(flowFractionToOpening(x))).toBeCloseTo(x, 8);
    }
  });
  it('Type B heeft geen Kvs-instelling meer in de configuratie', () => {
    const v = defaultConfig().valves[0] as unknown as Record<string, unknown>;
    expect('kvsKoelen' in v).toBe(false);
    expect('kvsVerwarmen' in v).toBe(false);
  });
});

describe('strengontwerp (steek 100, Cu 8×0,5, koelen 16/24 °C, ΔT 3 K)', () => {
  const cfg = defaultConfig();
  cfg.pitch = 100;
  const ctx = buildContext(cfg);
  const cond = ctx.conditions.koelen;
  // s: Q (l/h), P (W), Re, v (m/s), dp (kPa)
  const ref: [number, number, number, number, number, number][] = [
    [1, 12.1, 42, 572, 0.09, 0.5],
    [2, 24.2, 84, 1144, 0.17, 1.8],
    [3, 36.2, 126, 1716, 0.26, 4.1],
    [4, 49.0, 171, 2320, 0.35, 8.5],
    [5, 68.2, 237, 3229, 0.49, 27.4],
    [6, 83.3, 290, 3945, 0.6, 46.5],
  ];
  for (const [s, Q, P, Re, v, dp] of ref) {
    it(`s = ${s}`, () => {
      const { q } = designFlow(ctx, cond, s);
      const th = strandThermal(ctx, cond, s, q);
      near(lh(q), Q, 0.03, 'debiet');
      near(th.power, P, 0.03, 'vermogen');
      near(reynolds(q, ctx.di, th.tMean), Re, 0.03, 'Re');
      expect(Math.abs(velocity(q, ctx.di) - v)).toBeLessThan(0.011);
      const d = strandDp(ctx, s, 0, q, th.tMean) / 1000;
      const tol = s === 5 ? 0.1 : 0.06;
      expect(Math.abs(d - dp)).toBeLessThanOrEqual(Math.max(tol * dp, 0.12));
    });
  }
  it('laminaire straf: 1 paneel bij 20 en 200 l/h', () => {
    near(strandThermal(ctx, cond, 1, 20 / 3.6e6).power, 46.0, 0.03);
    near(strandThermal(ctx, cond, 1, 200 / 3.6e6).power, 61.7, 0.03);
  });
});

describe('standaardconfiguratie', () => {
  const cfg = resolveAdvice(defaultConfig());
  const d = computeDesign(cfg);
  const vd = d.valves[0];
  const ctx = d.ctx;

  it('automatische koppeling 7 × 4', () => {
    expect(vd.strands.map((s) => s.panels)).toEqual([4, 4, 4, 4, 4, 4, 4]);
  });

  const cand: [string, number, number, number, number][] = [
    ['koelen', 3, 39.3, 1861, 6.0],
    ['koelen', 4, 55.8, 2641, 17.7],
    ['koelen', 5, 72.3, 3423, 40.6],
    ['verwarmen', 3, 32.0, 2128, 3.6],
    ['verwarmen', 4, 45.2, 3007, 12.9],
    ['verwarmen', 5, 57.4, 3818, 24.8],
  ];
  for (const [mode, s, Q, Re, dp] of cand) {
    it(`kandidaat ${mode} s=${s}`, () => {
      const c = vd.candidates[s - 1].modes[mode as 'koelen' | 'verwarmen'].head;
      near(lh(c.q), Q, 0.05);
      near(c.re, Re, 0.05);
      near(c.dp / 1000, dp, 0.05);
    });
  }

  it('koelen: Vmax, vermogen, Δp_circuit, verdeling', () => {
    const m = vd.modes.koelen;
    near(lh(m.vmax), 390, 0.03);
    near(m.power, 1359, 0.03);
    near(m.dpCircuit / 1000, 14.9, 0.08);
    const q = m.net.q;
    expect(Math.abs(Math.max(...q) / Math.min(...q) - 1.034)).toBeLessThan(0.01);
    expect(Math.abs(m.tOppMin - 17.5)).toBeLessThan(0.2);
  });
  it('verwarmen: Vmax, vermogen, Δp_circuit', () => {
    const m = vd.modes.verwarmen;
    near(lh(m.vmax), 317, 0.03);
    near(m.power, 1828, 0.03);
    near(m.dpCircuit / 1000, 10.7, 0.08);
  });
  it('Type B: benodigd Δp is alleen de circuitdrukval (geen Kvs-weerstand)', () => {
    near(vd.needed.koelen, vd.modes.koelen.dpCircuit / 1000, 1e-9);
    near(vd.needed.verwarmen, vd.modes.verwarmen.dpCircuit / 1000, 1e-9);
  });
  it('Type A: PICV-advies DN15 (650 l/h)', () => {
    const a = defaultConfig();
    a.valves[0] = { ...a.valves[0], type: 'A', dn: 15 };
    expect(resolveAdvice(a).valves[0].picv).toBe('DN15');
  });
  it('Type A DN15 bij 30 kPa: benodigd ≈ 33,6 kPa → W02', () => {
    const a = defaultConfig();
    a.valves[0] = { ...a.valves[0], type: 'A', dn: 15 };
    const da = computeDesign(resolveAdvice(a));
    near(Math.max(da.valves[0].needed.koelen, da.valves[0].needed.verwarmen), 33.6, 0.05);
    expect(designMessages(da).map((m) => m.code)).toContain('W02');
  });
  it('geen meldingen W01–W16 bij Type B', () => {
    const codes = designMessages(d)
      .filter((m) => m.severity !== 'info')
      .map((m) => m.code);
    expect(codes).toEqual([]);
  });
  it('context klopt', () => {
    expect(ctx.geom.nBenen).toBe(7);
  });
});

describe('Vmax afstellen op benodigd vermogen (last) of maximaal plafondvermogen', () => {
  const build = (basis: 'plafond' | 'last', panels = 40, type: 'A' | 'B' = 'B', patch: object = {}) => {
    const c = defaultConfig();
    Object.assign(c, patch);
    c.valves[0] = { ...c.valves[0], panelCount: panels, vmaxBasis: basis, type };
    return computeDesign(resolveAdvice(c));
  };
  it('plafond (standaard): Vmax = Σ ontwerpdebieten', () => {
    const v = build('plafond').valves[0];
    for (const m of ['koelen', 'verwarmen'] as const) {
      expect(v.modes[m].vmax).toBe(v.modes[m].vmaxCeiling);
      expect(v.modes[m].capacity).toBeNull();
    }
  });
  it('last: het zonevermogen haalt de last (binnen 3 %) bij een lager debiet dan het plafondmaximum', () => {
    for (const type of ['A', 'B'] as const) {
      const v = build('last', 40, type).valves[0];
      for (const m of ['koelen', 'verwarmen'] as const) {
        const md = v.modes[m];
        expect(md.vmax, `${type} ${m}`).toBeLessThan(md.vmaxCeiling);
        expect(md.power).toBeGreaterThanOrEqual(md.load - 0.5);
        expect(md.power).toBeLessThan(md.load * 1.03);
        expect(md.capacity as number).toBeGreaterThan(md.load * 1.2);
      }
    }
  });
  it('last: Vmax is minimaal (1 l/h minder haalt de last niet)', () => {
    const d = build('last');
    const v = d.valves[0];
    for (const m of ['koelen', 'verwarmen'] as const) {
      const md = v.modes[m];
      const p = solveZoneCoupled(d.ctx, md.cond, v.spec, md.vmax - 1 / 3.6e6, undefined, 3).thermal.reduce(
        (a, t) => a + t.power,
        0,
      );
      expect(p).toBeLessThan(md.load);
    }
  });
  it('last bij 45 °C aanvoer: haalt de last (zonder vals W11) en Vmax is minimaal', () => {
    for (const panels of [28, 40]) {
      const d = build('last', panels, 'B', { tSupplyHeat: 45 });
      const v = d.valves[0];
      for (const m of ['koelen', 'verwarmen'] as const) {
        const md = v.modes[m];
        expect(md.capacity as number, `${panels} ${m}`).toBeGreaterThan(md.load); // overcapaciteit
        expect(md.power).toBeGreaterThanOrEqual(md.load - 0.5);
        const p = solveZoneCoupled(d.ctx, md.cond, v.spec, md.vmax - 1 / 3.6e6, undefined, 3).thermal.reduce(
          (a, t) => a + t.power,
          0,
        );
        expect(p, `${panels} ${m}: 1 l/h minder haalt de last niet`).toBeLessThan(md.load);
      }
      // bij overcapaciteit is het vermogen nooit de reden voor een W11-melding
      expect(designMessages(d).map((m) => m.code)).not.toContain('W11');
    }
  });
  it('last: Vmax hangt niet af van het ontwerp-ΔT (vaste strengen, geen kunstmatige ondergrens)', () => {
    const vm = (dtHeat: number) => {
      const c = defaultConfig();
      c.dtHeat = dtHeat;
      c.tSupplyHeat = 45;
      c.valves[0] = {
        ...c.valves[0],
        panelCount: 28,
        vmaxBasis: 'last',
        coupling: 'manual',
        manualStrands: Array.from({ length: 7 }, () => ({ panels: 4, extraLength: 0 })),
      };
      return computeDesign(resolveAdvice(c)).valves[0].modes.verwarmen.vmax * 3.6e6;
    };
    expect(Math.abs(vm(2) - vm(5))).toBeLessThanOrEqual(1.01);
    expect(Math.abs(vm(3) - vm(8))).toBeLessThanOrEqual(1.01);
  });
  it('last: Vmax is een geheel aantal l/h', () => {
    const v = build('last').valves[0];
    for (const m of ['koelen', 'verwarmen'] as const) {
      const lh1 = v.modes[m].vmax * 3.6e6;
      expect(Math.abs(lh1 - Math.round(lh1))).toBeLessThan(1e-6);
    }
  });
  it('last: te weinig plafond → Vmax blijft maximaal plafondvermogen en W11 meldt het tekort', () => {
    const d = build('last', 28, 'B', { coolLoad: 20000 });
    const md = d.valves[0].modes.koelen;
    expect(md.vmax).toBe(md.vmaxCeiling);
    expect(designMessages(d).map((m) => m.code)).toContain('W11');
  });
  it('last: zonder overcapaciteit-melding en met Vmax dichter bij het ontwerp bij 28 panelen en lage last', () => {
    const v = build('last', 28, 'B', { coolLoad: 1360, heatLoss: 1828 }).valves[0];
    // last ≈ capaciteit: Vmax ligt dicht bij Σ ontwerpdebieten
    expect(v.modes.koelen.vmax / v.modes.koelen.vmaxCeiling).toBeGreaterThan(0.97);
    expect(v.modes.verwarmen.vmax / v.modes.verwarmen.vmaxCeiling).toBeGreaterThan(0.97);
  });
  it('handmatige Vmax negeert het uitgangspunt', () => {
    const c = defaultConfig();
    c.valves[0] = { ...c.valves[0], panelCount: 40, vmaxBasis: 'last', vmaxAuto: false, vmaxKoelen: 200 };
    const v = computeDesign(resolveAdvice(c)).valves[0];
    expect(v.modes.koelen.vmax).toBeCloseTo(200 / 3.6e6, 12);
    expect(v.modes.koelen.capacity).toBeNull();
  });
  it('meerdere zones: elke zone haalt zijn eigen aandeel van de last', () => {
    const c = defaultConfig();
    c.floorArea = 80;
    c.valveCount = 2;
    c.valves = [
      { ...c.valves[0], panelCount: 44, vmaxBasis: 'last' },
      { ...c.valves[0], panelCount: 36, vmaxBasis: 'last' },
    ];
    const d = computeDesign(resolveAdvice(c));
    for (const v of d.valves) {
      const md = v.modes.koelen;
      expect(md.load).toBeCloseTo(c.coolLoad * v.share, 6);
      expect(md.power).toBeGreaterThanOrEqual(md.load - 0.5);
      expect(md.power).toBeLessThan(md.load * 1.03);
    }
  });
  it('het gekozen uitgangspunt zit in de deelbare configuratie', () => {
    const c = defaultConfig();
    c.valves[0] = { ...c.valves[0], vmaxBasis: 'last' };
    expect(normalizeConfig(JSON.parse(JSON.stringify(c))).valves[0].vmaxBasis).toBe('last');
    expect(normalizeConfig({ valves: [{ vmaxBasis: 'onzin' }] }).valves[0].vmaxBasis).toBe('plafond');
  });
});

describe('netwerk', () => {
  it('S4 (4·3·3, steek 75): verdeling ≈ [39,4; 47,5; 47,5] l/h', () => {
    const c = defaultConfig();
    c.valves[0] = {
      ...c.valves[0],
      panelCount: 10,
      coupling: 'manual',
      manualStrands: [
        { panels: 4, extraLength: 0 },
        { panels: 3, extraLength: 0 },
        { panels: 3, extraLength: 0 },
      ],
    };
    const d = computeDesign(resolveAdvice(c));
    const m = d.valves[0].modes.koelen;
    near(lh(m.vmax), 134.4, 0.03);
    const q = m.net.q.map(lh);
    near(q[0], 39.4, 0.05);
    near(q[1], 47.5, 0.05);
    near(q[2], 47.5, 0.05);
  });

  const s5 = (layout: 'direct' | 'tichelmann') => {
    const c = defaultConfig();
    c.dpAvailable = 60;
    c.valves[0] = { ...c.valves[0], panelCount: 40, distPipe: '16x2', distanceFirst: 2, dn: 20, layout };
    return computeDesign(resolveAdvice(c)).valves[0].modes.koelen;
  };
  it('S5 direct retour: +27,6 % / −11,2 %; 32,9 kPa', () => {
    const m = s5('direct');
    expect(Math.abs(Math.max(...m.deviation) - 0.276)).toBeLessThan(0.03);
    expect(Math.abs(Math.min(...m.deviation) + 0.112)).toBeLessThan(0.03);
    near(m.dpCircuit / 1000, 32.9, 0.08);
  });
  it('S5 Tichelmann: +7,4 % / −4,9 %; 58,3 kPa', () => {
    const m = s5('tichelmann');
    expect(Math.abs(Math.max(...m.deviation) - 0.074)).toBeLessThan(0.03);
    expect(Math.abs(Math.min(...m.deviation) + 0.049)).toBeLessThan(0.03);
    near(m.dpCircuit / 1000, 58.3, 0.08);
  });

  // synthetische strengen voor algemene eigenschappen
  const mk = (n: number, layout: 'direct' | 'tichelmann', len = 1.2, x1 = 1.0, k: number[] = []) => {
    const strandDpFns = Array.from(
      { length: n },
      (_, i) => (q: number) => (k[i] ?? 1) * 1e11 * q * Math.abs(q) ** 0.75,
    );
    const pipe = (q: number, l: number) => pipeDp({ q, d: 0.016, len: l, eps: 7e-9, T: 20 });
    return solveNetwork({
      strandDp: strandDpFns,
      segLen: Array.from({ length: n }, (_, i) => (i === 0 ? x1 : len)),
      pipeDp: pipe,
      layout,
      qTot: n * 5e-5,
    });
  };
  it('massabehoud < 1e-9', () => {
    for (const layout of ['direct', 'tichelmann'] as const)
      expect(mk(9, layout, 1.2, 1, [1, 2, 3, 1, 1, 2, 1, 3, 1]).massError).toBeLessThan(1e-9);
  });
  it('gelijke strengen met verdeelleidinglengte 0 → exact gelijke verdeling', () => {
    const r = mk(8, 'direct', 0, 0);
    for (const q of r.q) near(q, r.q[0], 1e-9);
  });
  it('Tichelmann met gelijke strengen is symmetrisch (bijna gelijke verdeling)', () => {
    const r = mk(8, 'tichelmann');
    const q = r.q;
    // eerste en laatste streng zien dezelfde totale leidinglengte
    near(q[0], q[7], 0.02);
  });
  it('drukverschil over alle parallelle paden gelijk binnen 1e-6', () => {
    const r = mk(7, 'direct', 1.2, 1, [1, 1.5, 1, 2, 1, 1, 3]);
    // strandDp(q_i) is gelijk aan het beschikbare verschil over streng i
    const fns = (q: number, k: number) => k * 1e11 * q * Math.abs(q) ** 0.75;
    const ks = [1, 1.5, 1, 2, 1, 1, 3];
    r.q.forEach((q, i) => near(fns(q, ks[i]), r.dpStrand[i], 1e-6));
  });
});

// ---------------------------------------------------------------- dynamiek

function simulate(
  cfg: KlimaatplafondConfig,
  mode: 'verwarmen' | 'koelen',
  hours: number,
  cb?: (s: SimState) => void,
): SimState {
  const d = computeDesign(resolveAdvice(cfg));
  const rooms = roomsOf(d);
  let s = setRunMode(initialState(d, 'stop'), d, mode);
  for (let k = 0; k < (hours * 3600) / 2; k++) {
    s = step(s, d, 2, rooms);
    cb?.(s);
  }
  return s;
}

describe('dynamiek (gelijkprocentig, Kp 0,6, Ti 900 s)', () => {
  it('verwarmen vanaf 18 °C', () => {
    let reach = Infinity;
    let max = 0;
    let late = 0;
    simulate(defaultConfig(), 'verwarmen', 6, (s) => {
      const T = s.tAir[0];
      if (T >= 20.7 && reach === Infinity) reach = s.t / 3600;
      max = Math.max(max, T);
      if (s.t >= 5 * 3600) late = Math.max(late, Math.abs(T - 21));
    });
    expect(reach).toBeLessThan(1.5);
    expect(max - 21).toBeLessThanOrEqual(0.4);
    expect(late).toBeLessThanOrEqual(0.15);
  });
  it('koelen vanaf 27 °C', () => {
    let reach = Infinity;
    let min = 99;
    let late = 0;
    simulate(defaultConfig(), 'koelen', 6, (s) => {
      const T = s.tAir[0];
      if (T <= 24.3 && reach === Infinity) reach = s.t / 3600;
      min = Math.min(min, T);
      if (s.t >= 5 * 3600) late = Math.max(late, Math.abs(T - 24));
    });
    expect(reach).toBeLessThan(2.5);
    expect(24 - min).toBeLessThanOrEqual(0.3);
    expect(late).toBeLessThanOrEqual(0.15);
  });
  it('lineaire karakteristiek schiet meer door dan gelijkprocentig', () => {
    const run = (fc: 'lineair' | 'gelijkprocentig') => {
      const c = defaultConfig();
      c.flowChar = fc;
      let max = 0;
      simulate(c, 'verwarmen', 4, (s) => (max = Math.max(max, s.tAir[0])));
      return max;
    };
    expect(run('lineair')).toBeGreaterThan(run('gelijkprocentig'));
  });
  it('energiebalans over 6 uur (2 zones met koppeling) binnen 1 %', () => {
    const c = defaultConfig();
    c.floorArea = 80;
    c.valveCount = 2;
    c.valves = [
      { ...c.valves[0], panelCount: 28 },
      { ...c.valves[0], panelCount: 20 },
    ];
    const d = computeDesign(resolveAdvice(c));
    const rooms = roomsOf(d);
    let s = setRunMode(initialState(d, 'stop'), d, 'verwarmen');
    // zone 2 start 2 K warmer dan zone 1 voor koppeling
    s = { ...s, tAir: [s.tAir[0], s.tAir[1] + 2] };
    const t0 = s.tAir.slice();
    for (let k = 0; k < (6 * 3600) / 2; k++) s = step(s, d, 2, rooms);
    let sumNet = 0;
    let sumC = 0;
    for (let i = 0; i < 2; i++) {
      const net = s.eCeiling[i] + s.eLoad[i] + s.eCoupling[i];
      const stored = rooms[i].C * (s.tAir[i] - t0[i]);
      near(net, stored, 0.01);
      sumNet += net;
      sumC += stored;
    }
    near(sumNet, sumC, 0.01);
    expect(Math.abs(s.eCoupling[0] + s.eCoupling[1])).toBeLessThan(1e-3 * Math.abs(s.eCeiling[0]));
  });
  it('last > vermogen: klep blijft op 100 % en ruimte stabiliseert op P_plafond = −P_last', () => {
    const c = defaultConfig();
    c.coolLoad = 4000;
    const s = simulate(c, 'koelen', 12);
    const z = s.zones[0];
    expect(z.vraag).toBeCloseTo(1, 6);
    const pl = s.eLoad; // gebruik energie-afgeleide: laatste stap
    void pl;
    const d = computeDesign(resolveAdvice(c));
    const s2 = step(s, d, 2, roomsOf(d));
    const net = s2.zones[0].power + (s2.eLoad[0] - s.eLoad[0]) / 2;
    expect(Math.abs(net)).toBeLessThan(0.03 * Math.abs(s2.zones[0].power));
  });
  it('Type B: debiet is 0 terwijl θ tussen 30° en 60° ligt', () => {
    const cfg = defaultConfig();
    const d = computeDesign(resolveAdvice(cfg));
    const rooms = roomsOf(d);
    let s = setRunMode(initialState(d, 'stop'), d, 'koelen');
    for (let k = 0; k < 900; k++) s = step(s, d, 2, rooms); // 30 min koelen
    expect(s.zones[0].q).toBeGreaterThan(0);
    s = setRunMode(s, d, 'verwarmen');
    let seen = false;
    for (let k = 0; k < 150; k++) {
      s = step(s, d, 2, rooms);
      const z = s.zones[0];
      if (z.theta > 30.5 && z.theta < 59.5) {
        seen = true;
        expect(z.q).toBe(0);
      }
    }
    expect(seen).toBe(true);
  });
  it('Type A: debiet is 0 tijdens de omschakeltijd', () => {
    const cfg = defaultConfig();
    cfg.valves[0] = { ...cfg.valves[0], type: 'A' };
    const d = computeDesign(resolveAdvice(cfg));
    const rooms = roomsOf(d);
    let s = setRunMode(initialState(d, 'stop'), d, 'koelen');
    for (let k = 0; k < 900; k++) s = step(s, d, 2, rooms);
    expect(s.zones[0].q).toBeGreaterThan(0);
    s = setRunMode(s, d, 'verwarmen');
    let switching = 0;
    for (let k = 0; k < 400; k++) {
      s = step(s, d, 2, rooms);
      if (s.zones[0].switchLeft > 0) {
        switching++;
        expect(s.zones[0].q).toBe(0);
      }
    }
    expect(switching).toBeGreaterThan(5);
    expect(s.zones[0].sixWay).toBe('verwarmen');
  });
  it('gemeten ΔT bij verwarmen en koelen ligt rond het ontwerp-ΔT (vol debiet)', () => {
    for (const [mode, dt] of [
      ['koelen', 3],
      ['verwarmen', 5],
    ] as const) {
      const s = simulate(defaultConfig(), mode, 0.5);
      const z = s.zones[0];
      expect(z.q).toBeGreaterThan(0);
      // de ruimte is nog niet op setpoint, dus het ΔT ligt iets boven het ontwerp
      expect(z.dtMeas).toBeGreaterThan(dt - 0.5);
      expect(z.dtMeas).toBeLessThan(dt + 1.5);
      expect(z.tRetMix).toBeCloseTo(mode === 'koelen' ? 16 + z.dtMeas : 35 - z.dtMeas, 6);
    }
  });
  it('step is puur: invoer wordt niet gewijzigd', () => {
    const d = computeDesign(resolveAdvice(defaultConfig()));
    const s0 = setRunMode(initialState(d, 'stop'), d, 'koelen');
    const snap = JSON.stringify({ ...s0, zones: s0.zones.map((z) => ({ ...z, thermal: [] })) });
    step(s0, d, 2);
    expect(JSON.stringify({ ...s0, zones: s0.zones.map((z) => ({ ...z, thermal: [] })) })).toBe(snap);
  });
});

describe('scenario-meldingen', () => {
  const expectations: Record<string, string[][]> = Object.fromEntries(SCENARIOS.map((s) => [s.id, s.expect]));
  for (const sc of SCENARIOS) {
    it(`${sc.id}`, () => {
      const cfg = buildScenario(sc.id)!;
      const msgs = designMessages(computeDesign(cfg));
      const codes = msgs.map((m) => m.code);
      for (const any of expectations[sc.id])
        expect(
          any.some((c) => codes.includes(c)),
          `${sc.id}: verwacht ${any.join('|')} in ${codes.join(',')}`,
        ).toBe(true);
      if (sc.id === 'S1') expect(msgs.filter((m) => m.severity !== 'info')).toEqual([]);
    });
  }
});
