import { describe, expect, it } from 'vitest';
import {
  defaultConfig,
  normalizeConfig,
  type KlimaatplafondConfig,
} from '../src/concepts/klimaatplafond/model/config';
import { computeDesign, resolveAdvice } from '../src/concepts/klimaatplafond/model/design';
import { designMessages, runtimeMessages } from '../src/concepts/klimaatplafond/model/checks';
import { advance, initialState, setRunMode } from '../src/concepts/klimaatplafond/model/simulation';

// Deterministische pseudo-random generator
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function randomConfig(r: () => number): KlimaatplafondConfig {
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
  const base = defaultConfig();
  const n = pick([1, 2, 3] as const);
  const raw = {
    ...base,
    floorArea: 10 + r() * 490,
    heatLoss: r() * 20000,
    coolLoad: r() * 20000,
    mass: pick(['licht', 'middel', 'zwaar'] as const),
    rh: 30 + r() * 40,
    tSupplyCool: 14 + r() * 4,
    tSupplyHeat: 28 + r() * 17,
    dtCool: 1.5 + r() * 3.5,
    dtHeat: 2 + r() * 8,
    setHeat: 19 + r() * 3,
    setCool: 23 + r() * 3,
    panelSize: pick(['600x1200', '600x600'] as const),
    pitch: pick([75, 100, 150] as const),
    tube: pick(['8x0.5', '10x0.5', '12x0.6'] as const),
    valveCount: n,
    dpAvailable: 10 + r() * 50,
    dpMax: 10 + r() * 30,
    flowChar: pick(['gelijkprocentig', 'lineair'] as const),
    valves: Array.from({ length: n }, () => ({
      ...base.valves[0],
      type: pick(['A', 'B'] as const),
      dn: pick([15, 20] as const),
      panelCount: 1 + Math.floor(r() * 64),
      distPipe: pick(['16x2', '20x2', '26x3'] as const),
      distanceFirst: 0.5 + r() * 9.5,
      spacing: 0.6 + r() * 2.4,
      layout: pick(['direct', 'tichelmann'] as const),
      dtManager: r() < 0.3,
      coupling: r() < 0.3 ? ('manual' as const) : ('auto' as const),
      manualStrands: Array.from({ length: 1 + Math.floor(r() * 16) }, () => ({
        panels: 1 + Math.floor(r() * 16),
        extraLength: r() * 10,
      })),
      kvsKoelen: null,
      kvsVerwarmen: null,
      picv: null,
    })),
  };
  return normalizeConfig(raw);
}

describe('robuustheid: willekeurige configuraties', () => {
  const r = rng(20240607);
  for (let i = 0; i < 40; i++) {
    const cfg = randomConfig(r);
    it(`configuratie ${i + 1}: ontwerp, meldingen en simulatie zonder fouten of NaN`, () => {
      const resolved = resolveAdvice(cfg);
      const d = computeDesign(resolved);
      for (const v of d.valves) {
        for (const m of ['koelen', 'verwarmen'] as const) {
          const md = v.modes[m];
          expect(Number.isFinite(md.vmax) && md.vmax > 0).toBe(true);
          expect(Number.isFinite(md.dpCircuit)).toBe(true);
          expect(Number.isFinite(md.power)).toBe(true);
          expect(Math.abs(md.net.q.reduce((a, b) => a + b, 0) - md.vmax) / md.vmax).toBeLessThan(1e-6);
        }
      }
      expect(() => designMessages(d)).not.toThrow();
      let s = setRunMode(initialState(d, 'stop'), d, i % 2 ? 'koelen' : 'verwarmen');
      s = advance(s, d, 400).state;
      s = setRunMode(s, d, i % 2 ? 'verwarmen' : 'koelen');
      s = advance(s, d, 400).state;
      expect(s.tAir.every(Number.isFinite)).toBe(true);
      expect(s.zones.every((z) => Number.isFinite(z.q) && Number.isFinite(z.power))).toBe(true);
      expect(() => runtimeMessages(s, d)).not.toThrow();
    });
  }
});
