// Geometrie van de mini-grafiek boven de bufferschuif (UX-plan §5.1): P_th,min(V) uit het gevoeligheidsraster op
// dezelfde x-schaal als de schuif, het plateau vanaf het knikpunt, de huidige V en hoogstens twee stippen
// "toereikend vanaf". Puur: de component tekent alleen (SVG).
import type { Ranges } from '../model/ranges';
import type { SensitivityRow } from '../model/sizing';
import type { GridConnection, PeakshavingInput } from '../model/types';
import { VERDICT_TEXTS, WHATIF_TEXTS } from '../texts';
import { batteryOnStep, cleanVolume } from './format';
import type { Fix } from './fixes';
import { gridModel, plateauStart, smallerOption, transitionsOf } from './sensitivityFacts';

/** Ruimte boven (labels) en onder de lijn [px]. */
export const MINI_CHART_PAD = { top: 18, bottom: 6 } as const;
/** Halve breedte van de schuifknop [px]: dezelfde inzet als de markeringen onder de schuif (controls.tsx). */
export const SLIDER_INSET = 8;
/**
 * Raakvlak van een stip [px] (zie .dot in WhatIf.module.css). Liggen twee stippen dichter bij elkaar, dan dekt de
 * ene de andere af; stip (b) schuift dan een raakvlak op (zie miniChartGeometry).
 */
export const DOT_HIT_PX = 24;

/** x van een buffervolume, gelijk aan de markeringen van de schuif: 8 + (W − 16) · V / V_max. */
export function sliderX(v: number, max: number, width: number): number {
  const f = max > 0 ? Math.min(Math.max(v / max, 0), 1) : 0;
  return SLIDER_INSET + (width - 2 * SLIDER_INSET) * f;
}

/** Omgekeerd: buffervolume bij een x-positie (begrensd op 0…V_max). */
export function volumeAtX(x: number, max: number, width: number): number {
  const w = width - 2 * SLIDER_INSET;
  if (!(w > 0) || !(max > 0)) return 0;
  return Math.min(Math.max(((x - SLIDER_INSET) / w) * max, 0), max);
}

/** Dichtstbijzijnde berekende rasterpunt (klik in de grafiek); null zonder berekende punten. */
export function nearestRowVolume(rows: readonly (SensitivityRow | null)[], v: number): number | null {
  let best: number | null = null;
  for (const r of rows) {
    if (r && (best === null || Math.abs(r.volumeM3 - v) < Math.abs(best - v))) best = r.volumeM3;
  }
  return best === null ? null : cleanVolume(best);
}

export interface MiniChartContext {
  /** huidige buffer: de verticale lijn volgt direct de invoer, niet de analyse */
  volumeM3: number;
  grid: Pick<GridConnection, 'connection' | 'contractedKw' | 'heatPumpShare'>;
  /** stippen tonen: alleen als het raster klaar is en bij de invoer hoort, bij automatisch WP-vermogen */
  dots: boolean;
}

export interface MiniDot {
  /** (a) huidige aansluiting zonder batterij; (b) eerstvolgende kleinere aansluiting met de kleinste batterij */
  id: 'current' | 'smaller';
  x: number;
  /** midden van de knop; bij samenvallende stippen ligt (b) een raakvlak naast de lijn */
  y: number;
  /** punt op de lijn als de stip is verschoven (verbindingslijn), anders null */
  anchorY: number | null;
  volumeM3: number;
  /** "1×35 A" of "1×25 A + 7,5 kWh" */
  label: string;
  /** naam van de knop: "1×35 A past vanaf 0,20 m³: zet buffer" */
  ariaLabel: string;
  fix: Fix;
}

export interface MiniChartPoint {
  x: number;
  y: number;
  volumeM3: number;
  kw: number;
}

export interface MiniChartGeometry {
  width: number;
  height: number;
  /** SVG-pad van P_th,min(V); een ontbrekend of niet te bepalen punt onderbreekt de lijn */
  path: string;
  points: MiniChartPoint[];
  /** y-bereik [kW] */
  minKw: number;
  maxKw: number;
  /** P_th,min zonder buffer (label links), null als nog niet berekend */
  firstKw: number | null;
  /** plateau vanaf het knikpunt (grijs gearceerd van x tot de rechterrand) */
  plateau: { x: number; kneeM3: number; minKw: number; label: string } | null;
  /**
   * Zonder plateau, als de lijn tot het einde van de schuif blijft dalen: "{min} kW bij {V_max} m³ (einde bereik)".
   * Alleen als het laatste berekende punt op V_max ligt (niet bij een raster dat nog rekent).
   */
  endLabel: string | null;
  /** verticale lijn op de huidige V */
  currentX: number;
  dots: MiniDot[];
  /** naam van de grafiek (role="img") */
  ariaLabel: string;
}

const r1 = (v: number): string => (Math.round(v * 10) / 10).toString();

function dotFix(
  id: 'current' | 'smaller',
  label: string,
  volumeM3: number,
  capacityKwh: number,
  conn: { id: GridConnection['connection']; label: string },
): Fix {
  const v = cleanVolume(volumeM3);
  const withBuffer = (i: PeakshavingInput): PeakshavingInput => ({
    ...i,
    buffer: { ...i.buffer, volumeM3: v },
  });
  if (id === 'current')
    return {
      id: 'dotCurrent',
      label,
      undoLabel: VERDICT_TEXTS.undo.buffer(v),
      pending: false,
      target: 'buffer',
      apply: withBuffer,
    };
  return {
    id: 'dotSmaller',
    label,
    undoLabel: VERDICT_TEXTS.undo.smaller(conn.label, v, capacityKwh),
    pending: false,
    target: 'buffer',
    // de rasterbatterij rekent met automatisch vermogen (0,5 C)
    apply: (i) => ({
      ...withBuffer(i),
      battery: { capacityKwh, powerKw: null },
      grid: { ...i.grid, connection: conn.id },
    }),
  };
}

/**
 * Twee stippen op (bijna) dezelfde plek, bijvoorbeeld beide "vanaf 0,20 m³": de knoppen zouden elkaar afdekken en een
 * klik zou altijd de bovenste raken. Stip (a) blijft op de lijn; stip (b) schuift een raakvlak omlaag (of omhoog als
 * daar geen ruimte is) en houdt het punt op de lijn als anker voor een verbindingslijn.
 */
function separateDots(dots: MiniDot[], bottom: number): void {
  if (dots.length < 2) return;
  const [a, b] = dots;
  if (Math.abs(b.x - a.x) >= DOT_HIT_PX || Math.abs(b.y - a.y) >= DOT_HIT_PX) return;
  const below = a.y + DOT_HIT_PX;
  b.anchorY = b.y;
  b.y = below <= bottom ? below : a.y - DOT_HIT_PX;
}

/**
 * Geometrie bij een breedte en hoogte in px. `rows` mag onvolledig zijn (een raster dat nog rekent, of het vorige
 * raster gedimd): de lijn toont wat er is; stippen alleen met `current.dots`.
 */
export function miniChartGeometry(
  rows: readonly (SensitivityRow | null)[],
  ranges: Pick<Ranges, 'bufferMaxM3' | 'batteryMaxKwh' | 'batteryStepKwh'>,
  current: MiniChartContext,
  width: number,
  height: number,
): MiniChartGeometry {
  const max = ranges.bufferMaxM3;
  const finite = rows.filter((r): r is SensitivityRow => r !== null && Number.isFinite(r.nominalKw));
  const minFinite = finite.length > 0 ? Math.min(...finite.map((r) => r.nominalKw)) : NaN;
  let lo = finite.length > 0 ? minFinite : 0;
  let hi = finite.length > 0 ? Math.max(...finite.map((r) => r.nominalKw)) : 1;
  if (hi - lo < 1e-9) {
    lo -= 0.5;
    hi += 0.5;
  }
  const top = MINI_CHART_PAD.top;
  const bottom = height - MINI_CHART_PAD.bottom;
  const yOf = (kw: number): number => bottom - ((kw - lo) / (hi - lo)) * (bottom - top);

  const points: MiniChartPoint[] = [];
  let path = '';
  let pen = false;
  for (const r of rows) {
    if (!r || !Number.isFinite(r.nominalKw)) {
      pen = false;
      continue;
    }
    const p = {
      x: sliderX(r.volumeM3, max, width),
      y: yOf(r.nominalKw),
      volumeM3: r.volumeM3,
      kw: r.nominalKw,
    };
    points.push(p);
    path += `${pen ? 'L' : 'M'}${r1(p.x)} ${r1(p.y)}`;
    pen = true;
  }

  const first = rows[0];
  const firstKw = first && Number.isFinite(first.nominalKw) ? first.nominalKw : null;
  const knee = plateauStart(rows);
  const plateau = knee
    ? {
        x: sliderX(knee.volumeM3, max, width),
        kneeM3: knee.volumeM3,
        minKw: knee.minKw,
        label:
          knee.index === 0
            ? WHATIF_TEXTS.miniPlateauAtZero(knee.minKw)
            : WHATIF_TEXTS.miniPlateau(knee.minKw, knee.volumeM3),
      }
    : null;

  // geen plateau: daalt de lijn tot het einde van het bereik, dan het laatste (laagste) punt noemen
  const last = finite[finite.length - 1];
  const end =
    !knee &&
    finite.length > 1 &&
    last.volumeM3 >= max - 1e-9 * Math.max(1, max) &&
    last.nominalKw <= minFinite + 1e-9
      ? last
      : null;

  const dots: MiniDot[] = [];
  if (current.dots && rows[0]) {
    const m = gridModel({ key: '', rows: [...rows], total: rows.length, done: true }, ranges);
    const ts = transitionsOf(m, current.grid.heatPumpShare);
    const at = (volumeM3: number): number => {
      const r = rows.find((x) => x && Math.abs(x.volumeM3 - volumeM3) < 1e-9);
      return r ? yOf(r.nominalKw) : bottom;
    };
    // (a) de huidige aansluiting zonder batterij
    const a = ts.find((t) => t.conn.id === current.grid.connection && t.batteries.includes(0));
    if (a) {
      const label = a.conn.label;
      dots.push({
        id: 'current',
        x: sliderX(a.volumeM3, max, width),
        y: at(a.volumeM3),
        anchorY: null,
        volumeM3: a.volumeM3,
        label,
        ariaLabel: WHATIF_TEXTS.dotAria(label, a.volumeM3, false),
        fix: dotFix('current', label, a.volumeM3, 0, a.conn),
      });
    }
    // (b) de eerstvolgende kleinere aansluiting met de kleinste rasterbatterij
    const c = smallerOption(current.grid);
    const b = c
      ? ts
          .filter((t) => t.conn.id === c.id)
          .sort((x, y) => x.batteries[0] - y.batteries[0] || x.volumeM3 - y.volumeM3)[0]
      : undefined;
    if (b) {
      // rasterbatterij naar boven op de schuifstap: label, melding en schuif tonen dezelfde waarde
      const kwh = batteryOnStep(m.caps[b.batteries[0]] ?? 0, ranges);
      const label = WHATIF_TEXTS.dotLabel(b.conn.label, kwh);
      dots.push({
        id: 'smaller',
        x: sliderX(b.volumeM3, max, width),
        y: at(b.volumeM3),
        anchorY: null,
        volumeM3: b.volumeM3,
        label,
        ariaLabel: WHATIF_TEXTS.dotAria(label, b.volumeM3, true),
        fix: dotFix('smaller', label, b.volumeM3, kwh, b.conn),
      });
    }
    separateDots(dots, bottom);
  }

  return {
    width,
    height,
    path,
    points,
    minKw: lo,
    maxKw: hi,
    firstKw,
    plateau,
    endLabel: end ? WHATIF_TEXTS.miniEndOfRange(end.nominalKw, end.volumeM3) : null,
    currentX: sliderX(current.volumeM3, max, width),
    dots,
    ariaLabel:
      firstKw !== null && knee
        ? WHATIF_TEXTS.miniAria(firstKw, knee.minKw, knee.volumeM3)
        : firstKw !== null && end
          ? WHATIF_TEXTS.miniAriaEnd(firstKw, end.nominalKw, end.volumeM3)
          : WHATIF_TEXTS.miniAriaPending,
  };
}
