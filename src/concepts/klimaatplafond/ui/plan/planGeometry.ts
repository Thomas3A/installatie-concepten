// Plattegrond-geometrie in meters (x naar rechts, y naar beneden). Zones liggen naast elkaar met 1,0 m tussenruimte.
import type { Design } from '../../model/design';
import { meanderPath, type PanelGeometry } from '../../model/panel';

export interface Pt {
  x: number;
  y: number;
}

export const ZONE_GAP = 1.0;
export const PANEL_GAP = 0.1;
export const STRAND_Y0 = 0.4;
export const RETURN_Y = -0.15;
export const TICH_Y = -0.3;
export const HOSE_SAMPLES = 10;

export interface PlanPanel {
  x: number;
  y: number;
}

export interface PlanStrand {
  valve: number;
  index: number;
  cx: number;
  panels: PlanPanel[];
  /** hoogte van de kolom (m) */
  height: number;
  /** x van de aftakking op de aanvoerleiding en de stijgleiding naar de retour */
  supplyX: number;
  riserX: number;
  /** deeltjespad voor de hele streng (aanvoer-afgang, panelen, koppelslangen, stijgleiding) */
  path: Pt[];
  /** cumulatieve booglengte per padpunt */
  cum: number[];
  /** booglengte-intervallen [u0,u1] van de meander van elk paneel */
  tubeSpans: [number, number][];
  length: number;
}

export interface PlanZone {
  valve: number;
  x0: number;
  width: number;
  strands: PlanStrand[];
  /** laatste x van de aanvoer- en retourleiding */
  endX: number;
  bottom: number;
}

export interface PlanLayout {
  zones: PlanZone[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  geom: PanelGeometry;
  /** meanderpad in paneelcoördinaten */
  meander: Pt[];
  /** per segment: pad (platte lijst x,y,x,y...) in paneelcoördinaten */
  segPolys: Float32Array[];
}

function cumulative(path: Pt[]): number[] {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y));
  return cum;
}

/** Splits het meanderpad in nSeg gelijke stukken (op booglengte). */
export function splitPath(path: Pt[], n: number): Float32Array[] {
  const cum = cumulative(path);
  const total = cum[cum.length - 1];
  const out: Float32Array[] = [];
  const at = (u: number): { p: Pt; i: number } => {
    let i = 1;
    while (i < path.length - 1 && cum[i] < u) i++;
    const f = (u - cum[i - 1]) / Math.max(cum[i] - cum[i - 1], 1e-12);
    return { p: { x: path[i - 1].x + f * (path[i].x - path[i - 1].x), y: path[i - 1].y + f * (path[i].y - path[i - 1].y) }, i };
  };
  for (let j = 0; j < n; j++) {
    const u0 = (j / n) * total;
    const u1 = ((j + 1) / n) * total;
    const a = at(u0);
    const b = at(u1);
    const pts: number[] = [a.p.x, a.p.y];
    for (let i = a.i; i < b.i; i++) pts.push(path[i].x, path[i].y);
    pts.push(b.p.x, b.p.y);
    out.push(new Float32Array(pts));
  }
  return out;
}

export function buildLayout(design: Design): PlanLayout {
  const g = design.ctx.geom;
  const meander = meanderPath(g);
  const segPolys = splitPath(meander, g.nSeg);
  const entry = meander[0];
  const exit = meander[meander.length - 1];
  const zones: PlanZone[] = [];
  let x0 = 0;
  let maxY = 1;
  for (const vd of design.valves) {
    const strands: PlanStrand[] = [];
    let endX = x0;
    let bottom = STRAND_Y0;
    vd.strands.forEach((st, k) => {
      const cx = x0 + vd.cfg.distanceFirst + k * vd.cfg.spacing;
      const panels: PlanPanel[] = [];
      for (let p = 0; p < st.panels; p++) panels.push({ x: cx - g.B / 2, y: STRAND_Y0 + p * (g.L + PANEL_GAP) });
      const height = st.panels * g.L + (st.panels - 1) * PANEL_GAP;
      const path: Pt[] = [];
      const tubeSpans: [number, number][] = [];
      const supplyX = panels[0].x + entry.x;
      path.push({ x: supplyX, y: 0 });
      panels.forEach((pn, p) => {
        const startIdx = path.length;
        for (const m of meander) path.push({ x: pn.x + m.x, y: pn.y + m.y });
        const cumNow = cumulative(path);
        tubeSpans.push([cumNow[startIdx], cumNow[path.length - 1]]);
        if (p < panels.length - 1) {
          // koppelslang: boog van uitgang (rechtsonder) naar ingang volgend paneel (linksboven)
          const a = { x: pn.x + exit.x, y: pn.y + exit.y };
          const nx = panels[p + 1];
          const b = { x: nx.x + entry.x, y: nx.y + entry.y };
          const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 0.12 };
          for (let h = 1; h <= HOSE_SAMPLES; h++) {
            const t = h / HOSE_SAMPLES;
            path.push({
              x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
              y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
            });
          }
        }
      });
      const last = panels[panels.length - 1];
      const ex = { x: last.x + exit.x, y: last.y + exit.y };
      const riserX = cx + g.B / 2 + 0.05;
      path.push({ x: riserX, y: ex.y }, { x: riserX, y: RETURN_Y });
      const cum = cumulative(path);
      strands.push({ valve: vd.index, index: k, cx, panels, height, supplyX, riserX, path, cum, tubeSpans, length: cum[cum.length - 1] });
      endX = Math.max(endX, riserX);
      bottom = Math.max(bottom, STRAND_Y0 + height);
    });
    const width = Math.max(endX - x0 + 0.3, 1);
    zones.push({ valve: vd.index, x0, width, strands, endX, bottom });
    maxY = Math.max(maxY, bottom);
    x0 += width + ZONE_GAP;
  }
  const maxX = zones.length ? zones[zones.length - 1].x0 + zones[zones.length - 1].width : 1;
  const anyTich = design.valves.some((v) => v.cfg.layout === 'tichelmann');
  return {
    zones,
    bounds: { minX: -1.0, minY: (anyTich ? TICH_Y : RETURN_Y) - 0.5, maxX: maxX + 0.2, maxY: maxY + 0.4 },
    geom: g,
    meander,
    segPolys,
  };
}

/** Punt op een pad bij booglengte u. */
export function pointAt(s: PlanStrand, u: number, hint = 1): { x: number; y: number; i: number } {
  const { cum, path } = s;
  let i = hint;
  if (i < 1 || i >= path.length || cum[i - 1] > u) i = 1;
  while (i < path.length - 1 && cum[i] < u) i++;
  const span = Math.max(cum[i] - cum[i - 1], 1e-12);
  const f = Math.min(Math.max((u - cum[i - 1]) / span, 0), 1);
  return { x: path[i - 1].x + f * (path[i].x - path[i - 1].x), y: path[i - 1].y + f * (path[i].y - path[i - 1].y), i };
}

/**
 * Segmentindex in de thermische berekening bij booglengte u:
 * −1 voor de aanvoerzijde (vóór het eerste paneel), nTot voor de retourzijde, anders het segment.
 * Koppelslangen krijgen de uitlaattemperatuur van het voorgaande paneel.
 */
export function segmentAt(s: PlanStrand, u: number, nSeg: number): number {
  const spans = s.tubeSpans;
  if (u < spans[0][0]) return -1;
  for (let p = 0; p < spans.length; p++) {
    const [a, b] = spans[p];
    if (u <= b) {
      const f = Math.min(Math.max((u - a) / (b - a), 0), 0.999999);
      return p * nSeg + Math.floor(f * nSeg);
    }
    if (p < spans.length - 1 && u < spans[p + 1][0]) return (p + 1) * nSeg - 1;
  }
  return spans.length * nSeg;
}
