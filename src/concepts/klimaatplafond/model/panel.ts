// Meandergeometrie van één paneel (§5.2).
import { EDGE_SIDE, PANEL_SIZES, SEG_LENGTH, STUB_LENGTH, type PanelSize, type Pitch } from '../data/ceiling';

export interface PanelGeometry {
  /** Paneellengte (m), richting van de meanderbenen */
  L: number;
  /** Paneelbreedte (m) */
  B: number;
  /** Buissteek (m) */
  s: number;
  nBenen: number;
  lBeen: number;
  nBochten: number;
  /** Buislengte per paneel inclusief aansluitstukjes (m) */
  Lbuis: number;
  /** Actief oppervlak (m²) */
  area: number;
  /** Aantal thermische segmenten per paneel */
  nSeg: number;
}

export function panelGeometry(size: PanelSize, pitch: Pitch): PanelGeometry {
  const { L, B } = PANEL_SIZES[size];
  const s = pitch / 1000;
  let nBenen = Math.floor((B - 2 * EDGE_SIDE) / s + 1e-9) + 1;
  if (nBenen % 2 === 0) nBenen -= 1;
  const lBeen = L - 2 * (s / 2 + 0.025);
  const nBochten = nBenen - 1;
  const Lbuis = nBenen * lBeen + (nBochten * Math.PI * s) / 2 + STUB_LENGTH;
  return { L, B, s, nBenen, lBeen, nBochten, Lbuis, area: L * B, nSeg: Math.ceil(Lbuis / SEG_LENGTH) };
}

/**
 * Pad van de buis in paneelcoördinaten (m), oorsprong linksboven, x over de breedte B, y over de lengte L.
 * Instroom linksboven, uitstroom rechtsonder (oneven aantal benen). Inclusief de aansluitstukjes.
 */
export function meanderPath(g: PanelGeometry, samplesPerBend = 8): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const x0 = (g.B - (g.nBenen - 1) * g.s) / 2; // gecentreerd in de breedte
  const yTop = g.s / 2 + 0.025;
  const yBot = yTop + g.lBeen;
  const stub = STUB_LENGTH / 2;
  pts.push({ x: x0, y: yTop - stub });
  for (let i = 0; i < g.nBenen; i++) {
    const x = x0 + i * g.s;
    const down = i % 2 === 0;
    pts.push({ x, y: down ? yTop : yBot });
    pts.push({ x, y: down ? yBot : yTop });
    if (i < g.nBenen - 1) {
      // halfronde bocht naar het volgende been
      const cx = x + g.s / 2;
      const cy = down ? yBot : yTop;
      for (let k = 1; k < samplesPerBend; k++) {
        const a = (Math.PI * k) / samplesPerBend;
        pts.push({ x: cx - (g.s / 2) * Math.cos(a), y: cy + (down ? 1 : -1) * (g.s / 2) * Math.sin(a) });
      }
    }
  }
  const last = pts[pts.length - 1];
  pts.push({ x: last.x, y: last.y + stub });
  return pts;
}
