// Canvas-tekenwerk voor de plattegrond: gekleurde meanders, oppervlaktetemperatuur en stromingsdeeltjes.
import { dewPoint } from '../../../../core/psychro';
import type { Design } from '../../model/design';
import type { SimState } from '../../model/simulation';
import { PANEL_GAP, pointAt, segmentAt, type PlanLayout, type PlanStrand, RETURN_Y } from './planGeometry';

export interface View {
  /** pixels per meter */
  k: number;
  tx: number;
  ty: number;
}

export type Overlay = 'water' | 'oppervlak' | 'verdeling';

type RGB = [number, number, number];

// Divergerende, kleurenblind-vriendelijke schaal: koud (blauw) → neutraal → warm (oranje/rood)
const TEMP_ANCHORS: [number, RGB][] = [
  [-1, [31, 95, 168]],
  [-0.5, [111, 168, 220]],
  [0, [184, 190, 198]],
  [0.5, [244, 162, 89]],
  [1, [194, 65, 12]],
];
// Verdeling: tekort (bruin) → gelijk (grijs) → te veel (blauwgroen)
const DEV_ANCHORS: [number, RGB][] = [
  [-1, [140, 81, 10]],
  [-0.5, [216, 179, 101]],
  [0, [184, 190, 198]],
  [0.5, [90, 180, 172]],
  [1, [1, 102, 94]],
];

const LUT_N = 127;

function makeLut(anchors: [number, RGB][]): string[] {
  const out: string[] = [];
  for (let i = 0; i < LUT_N; i++) {
    const x = (i / (LUT_N - 1)) * 2 - 1;
    let a = anchors[0];
    let b = anchors[anchors.length - 1];
    for (let j = 0; j < anchors.length - 1; j++) {
      if (x >= anchors[j][0] && x <= anchors[j + 1][0]) {
        a = anchors[j];
        b = anchors[j + 1];
        break;
      }
    }
    const f = (x - a[0]) / Math.max(b[0] - a[0], 1e-9);
    const c = a[1].map((v, k) => Math.round(v + f * (b[1][k] - v)));
    out.push(`rgb(${c[0]},${c[1]},${c[2]})`);
  }
  return out;
}

export const TEMP_LUT = makeLut(TEMP_ANCHORS);
export const DEV_LUT = makeLut(DEV_ANCHORS);

/** Index in de LUT voor watertemperatuur T t.o.v. de neutrale ruimtetemperatuur. */
export function tempIdx(T: number, tRoom: number, tCold: number, tWarm: number): number {
  let x: number;
  if (T <= tRoom) x = -(tRoom - T) / Math.max(tRoom - tCold, 1e-6);
  else x = (T - tRoom) / Math.max(tWarm - tRoom, 1e-6);
  x = Math.min(Math.max(x, -1), 1);
  return Math.round(((x + 1) / 2) * (LUT_N - 1));
}

export function devIdx(dev: number): number {
  const x = Math.min(Math.max(dev / 0.3, -1), 1);
  return Math.round(((x + 1) / 2) * (LUT_N - 1));
}

export function scaleRange(design: Design): { cold: number; warm: number } {
  return { cold: Math.min(design.cfg.tSupplyCool, design.cfg.setHeat - 1), warm: Math.max(design.cfg.tSupplyHeat, design.cfg.setCool + 1) };
}

let hatchCache: CanvasPattern | null = null;
function hatchPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (hatchCache) return hatchCache;
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext('2d');
  if (!g) return null;
  g.strokeStyle = 'rgba(180,35,24,0.9)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(-2, 10);
  g.lineTo(10, -2);
  g.moveTo(-2, 6);
  g.lineTo(6, -2);
  g.moveTo(2, 10);
  g.lineTo(10, 2);
  g.stroke();
  hatchCache = ctx.createPattern(c, 'repeat');
  return hatchCache;
}

export interface DrawArgs {
  ctx: CanvasRenderingContext2D;
  layout: PlanLayout;
  design: Design;
  sim: SimState;
  overlay: Overlay;
  view: View;
  dpr: number;
  width: number;
  height: number;
  /** eventueel gemarkeerde strengen */
  dim?: boolean;
}

export function drawColors(a: DrawArgs): void {
  const { ctx, layout, design, sim, overlay, view, dpr, width, height } = a;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width * dpr, height * dpr);
  ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.tx, dpr * view.ty);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const g = layout.geom;
  const rng = scaleRange(design);
  const cfg = design.cfg;
  const tDew = dewPoint(cfg.setCool, cfg.rh);
  const lwWorld = Math.min(Math.max(0.02, 1.6 / view.k), 4 / view.k);
  const nSeg = g.nSeg;

  // buckets per kleurindex: [ox, oy, seg, ...]
  const buckets: number[][] = Array.from({ length: LUT_N }, () => []);

  for (const zone of layout.zones) {
    const vd = design.valves[zone.valve];
    const zs = sim.zones[zone.valve];
    const tRoom = sim.tAir[zone.valve];
    const hyd = zs?.hydMode !== 'dicht' ? zs?.hydMode : zs?.lastHyd;
    const mode = hyd ?? sim.lastMode;
    zone.strands.forEach((st, k) => {
      const th = zs?.thermal[k];
      const warm = zs?.warm ?? 0;
      const total = st.panels.length * nSeg;
      const md = vd.modes[mode];
      const qDesign = md.points[k]?.q ?? 1;
      const dev = zs && zs.q > 0 ? zs.qStrand[k] / (qDesign * (zs.q / md.vmax)) - 1 : 0;
      for (let p = 0; p < st.panels.length; p++) {
        const pn = st.panels[p];
        if (overlay === 'oppervlak') {
          // vlakken per been
          const legs = g.nBenen;
          const x0m = layout.meander[0].x;
          for (let leg = 0; leg < legs; leg++) {
            const sA = p * nSeg + Math.floor((leg * nSeg) / legs);
            const sB = p * nSeg + Math.max(Math.floor(((leg + 1) * nSeg) / legs), Math.floor((leg * nSeg) / legs) + 1);
            let T = tRoom;
            if (th?.tOpp && warm > 0.01) {
              let acc = 0;
              let n = 0;
              for (let j = sA; j < Math.min(sB, total); j++) {
                acc += th.tOpp[j];
                n++;
              }
              if (n) T = tRoom + (acc / n - tRoom) * warm;
            }
            const xl = Math.max(x0m + (leg - 0.5) * g.s, 0);
            const xr = Math.min(x0m + (leg + 0.5) * g.s, g.B);
            ctx.fillStyle = TEMP_LUT[tempIdx(T, tRoom, rng.cold, rng.warm)];
            ctx.fillRect(pn.x + xl, pn.y, xr - xl, g.L);
            if (mode === 'koelen' && T < tDew + 1 && warm > 0.3) {
              const pat = hatchPattern(ctx);
              if (pat) {
                ctx.save();
                ctx.fillStyle = pat;
                ctx.fillRect(pn.x + xl, pn.y, xr - xl, g.L);
                ctx.restore();
              }
            }
          }
        }
        for (let j = 0; j < nSeg; j++) {
          let idx: number;
          if (overlay === 'verdeling') idx = devIdx(dev);
          else {
            const gi = p * nSeg + j;
            let T = tRoom;
            if (th?.tWater && warm > 0.01) T = tRoom + (0.5 * (th.tWater[gi] + th.tWater[Math.min(gi + 1, total)]) - tRoom) * warm;
            idx = tempIdx(T, tRoom, rng.cold, rng.warm);
          }
          buckets[idx].push(pn.x, pn.y, j);
        }
      }
    });
  }

  ctx.lineWidth = overlay === 'oppervlak' ? lwWorld * 0.6 : lwWorld;
  for (let c = 0; c < LUT_N; c++) {
    const b = buckets[c];
    if (!b.length) continue;
    ctx.strokeStyle = overlay === 'oppervlak' ? 'rgba(40,50,60,0.55)' : (overlay === 'verdeling' ? DEV_LUT[c] : TEMP_LUT[c]);
    ctx.beginPath();
    for (let i = 0; i < b.length; i += 3) {
      const poly = layout.segPolys[b[i + 2]];
      ctx.moveTo(b[i] + poly[0], b[i + 1] + poly[1]);
      for (let q = 2; q < poly.length; q += 2) ctx.lineTo(b[i] + poly[q], b[i + 1] + poly[q + 1]);
    }
    ctx.stroke();
  }
  if (overlay === 'oppervlak') {
    // water in de buis dun gekleurd erboven
    ctx.lineWidth = lwWorld * 0.35;
    for (let c = 0; c < LUT_N; c++) {
      const b = buckets[c];
      if (!b.length) continue;
      ctx.strokeStyle = TEMP_LUT[c];
      ctx.beginPath();
      for (let i = 0; i < b.length; i += 3) {
        const poly = layout.segPolys[b[i + 2]];
        ctx.moveTo(b[i] + poly[0], b[i + 1] + poly[1]);
        for (let q = 2; q < poly.length; q += 2) ctx.lineTo(b[i] + poly[q], b[i + 1] + poly[q + 1]);
      }
      ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------- stromingsdeeltjes

/** Schermsnelheid = FACTOR × werkelijke watersnelheid (ca. 0,5 m/s ≈ 1 paneellengte per seconde). */
export const FLOW_VISUAL_FACTOR = 2.4;

interface Particle {
  kind: number; // 0 = streng, 1 = aanvoerleiding, 2 = retourleiding
  path: number; // index in paden
  u: number;
  hint: number;
}

interface PathRef {
  zone: number;
  strand: number;
  kind: number;
  /** pad met cumulatieve lengte */
  pts: { x: number; y: number }[];
  cum: number[];
  length: number;
  /** index van het stroomsegment (voor leidingen) */
  seg: number;
  strandRef?: PlanStrand;
}

export class Particles {
  private paths: PathRef[] = [];
  private items: Particle[] = [];

  constructor(layout: PlanLayout, design: Design) {
    const g = layout.geom;
    void g;
    let total = 0;
    for (const z of layout.zones) for (const s of z.strands) total += s.length;
    const spacing = Math.max(0.55, total / 1100);
    let seed = 12345;
    const rnd = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (const zone of layout.zones) {
      const vd = design.valves[zone.valve];
      zone.strands.forEach((st) => {
        const pi = this.paths.push({ zone: zone.valve, strand: st.index, kind: 0, pts: st.path, cum: st.cum, length: st.length, seg: st.index, strandRef: st }) - 1;
        const n = Math.max(2, Math.round(st.length / spacing));
        for (let i = 0; i < n; i++) this.items.push({ kind: 0, path: pi, u: ((i + rnd() * 0.6) / n) * st.length, hint: 1 });
      });
      // verdeelleidingen: per segment een kort pad voor aanvoer (weg van klep) en retour (naar klep)
      let xPrev = zone.x0;
      zone.strands.forEach((st, k) => {
        const supply = [{ x: xPrev, y: 0 }, { x: st.supplyX, y: 0 }];
        const ret = [{ x: st.riserX, y: RETURN_Y }, { x: k === 0 ? zone.x0 : zone.strands[k - 1].riserX, y: RETURN_Y }];
        for (const [kind, pts] of [[1, supply], [2, ret]] as const) {
          const len = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
          const pi = this.paths.push({ zone: zone.valve, strand: k, kind, pts, cum: [0, len], length: len, seg: k }) - 1;
          const n = Math.max(1, Math.round(len / (spacing * 1.2)));
          for (let i = 0; i < n; i++) this.items.push({ kind, path: pi, u: ((i + rnd() * 0.6) / n) * len, hint: 1 });
        }
        xPrev = st.supplyX;
      });
      void vd;
    }
  }

  get count(): number {
    return this.items.length;
  }

  advance(dt: number, sim: SimState, design: Design): void {
    const A = (d: number): number => (Math.PI / 4) * d * d;
    const aTube = A(design.ctx.di);
    for (const it of this.items) {
      const p = this.paths[it.path];
      const zs = sim.zones[p.zone];
      if (!zs || zs.q <= 0) continue;
      let v: number;
      if (p.kind === 0) v = zs.qStrand[p.strand] / aTube;
      else {
        const vd = design.valves[p.zone];
        let F = 0;
        for (let j = p.seg; j < zs.qStrand.length; j++) F += zs.qStrand[j];
        const di = (design.valves[p.zone].spec.dist.di);
        void vd;
        v = F / A(di);
      }
      it.u += v * FLOW_VISUAL_FACTOR * dt;
      if (it.u >= p.length) {
        it.u -= p.length * Math.floor(it.u / p.length);
        it.hint = 1;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, args: { design: Design; sim: SimState; layout: PlanLayout; view: View; dpr: number; width: number; height: number }): void {
    const { design, sim, layout, view, dpr, width, height } = args;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width * dpr, height * dpr);
    ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.tx, dpr * view.ty);
    const rng = scaleRange(design);
    const nSeg = layout.geom.nSeg;
    const r = Math.min(Math.max(0.035, 1.8 / view.k), 4.5 / view.k);
    // zichtbaar venster in wereldcoördinaten
    const vx0 = -view.tx / view.k - 0.5;
    const vy0 = -view.ty / view.k - 0.5;
    const vx1 = (width - view.tx) / view.k + 0.5;
    const vy1 = (height - view.ty) / view.k + 0.5;
    let lastIdx = -1;
    for (const it of this.items) {
      const p = this.paths[it.path];
      const zs = sim.zones[p.zone];
      if (!zs) continue;
      const tRoom = sim.tAir[p.zone];
      let x: number;
      let y: number;
      let T = tRoom;
      const cond = zs.hydMode !== 'dicht' ? design.valves[p.zone].modes[zs.hydMode].cond : design.valves[p.zone].modes[zs.lastHyd].cond;
      if (p.kind === 0 && p.strandRef) {
        const pt = pointAt(p.strandRef, it.u, it.hint);
        it.hint = pt.i;
        x = pt.x;
        y = pt.y;
        const th = zs.thermal[p.strand];
        if (th?.tWater) {
          const seg = segmentAt(p.strandRef, it.u, nSeg);
          const nTot = p.strandRef.panels.length * nSeg;
          if (seg < 0) T = cond.tIn;
          else if (seg >= nTot) T = Number.isFinite(zs.tRetStrand[p.strand]) ? th.tRet : th.tWater[nTot];
          else T = 0.5 * (th.tWater[seg] + th.tWater[seg + 1]);
        }
      } else {
        const f = p.length > 0 ? it.u / p.length : 0;
        x = p.pts[0].x + f * (p.pts[1].x - p.pts[0].x);
        y = p.pts[0].y + f * (p.pts[1].y - p.pts[0].y);
        if (zs.thermal.length) T = it.kind === 1 ? cond.tIn : Number.isFinite(zs.tRetMix) ? zs.tRetMix : cond.tIn;
      }
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      T = tRoom + (T - tRoom) * zs.warm;
      const idx = tempIdx(T, tRoom, rng.cold, rng.warm);
      if (idx !== lastIdx) {
        ctx.fillStyle = TEMP_LUT[idx];
        lastIdx = idx;
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = r * 0.35;
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.stroke();
    }
    void PANEL_GAP;
  }
}
