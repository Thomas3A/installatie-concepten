// Mini-grafiek boven de bufferschuif (UX-plan §5.1): benodigde warmtepomp P_th,min(V) uit het gevoeligheidsraster,
// op dezelfde x-schaal als de schuif, met het plateau, de huidige V en hoogstens twee klikbare stippen
// "toereikend vanaf". De geometrie komt uit view/miniChart.ts; hier alleen tekenen en bedienen.
import { useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type RefCallback } from 'react';
import { fmt } from '../../../../core/format';
import u from '../../../../ui/ui.module.css';
import { sensitivityKey } from '../../model/analysis';
import type { SensitivityRow } from '../../model/sizing';
import { useStore, type SensitivityState } from '../../store';
import { UI_LABELS, WHATIF_TEXTS } from '../../texts';
import {
  MINI_CHART_PAD,
  SLIDER_INSET,
  miniChartGeometry,
  nearestRowVolume,
  volumeAtX,
  type MiniChartPoint,
  type MiniDot,
} from '../../view/miniChart';
import { gridStatus } from '../../view/sensitivityFacts';
import { showInDepth } from '../depth/depthLinks';
import css from './WhatIf.module.css';
/** Maat zonder meting (jsdom, eerste tekening): de gangbare breedte van de kolom en de hoogte van de grafiek [px]. */
const FALLBACK_BOX = { width: 320, height: 96 };
/** Geschatte breedte van een teken in het stiplabel (0,7 rem, vet) [px]: genoeg om botsingen te voorkomen. */
const LABEL_CHAR_PX = 6.4;
/** Afstand van het label tot het midden van de stip [px] (zie .dotLabel). */
const LABEL_GAP_PX = 9;

/** Breedte en hoogte van een element; zonder meting (0 × 0) de standaardmaat. */
function useBox(): [RefCallback<HTMLDivElement>, { width: number; height: number }] {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [box, setBox] = useState(FALLBACK_BOX);
  useLayoutEffect(() => {
    if (!el) return;
    const measure = (): void => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width > 0 && height > 0)
        setBox((b) => (b.width === width && b.height === height ? b : { width, height }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, box];
}

type LabelSide = 'right' | 'aboveRight' | 'aboveLeft' | 'left' | 'belowRight';
interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Volgorde van voorkeur: naast de stip, erboven, links, eronder. */
const SIDES: readonly LabelSide[] = ['right', 'aboveRight', 'aboveLeft', 'left', 'belowRight'];
/** Hoogte van een label met wat speling [px]. */
const LABEL_H = 16;

/** Geschatte rechthoek van een label bij een plaats (zie de klassen .dotLabel*). */
function labelBox(d: MiniDot, side: LabelSide): Box {
  const w = d.label.length * LABEL_CHAR_PX + 6;
  const above = { y0: d.y - 8 - LABEL_H, y1: d.y - 8 };
  const level = { y0: d.y - LABEL_H / 2, y1: d.y + LABEL_H / 2 };
  switch (side) {
    case 'right':
      return { x0: d.x + LABEL_GAP_PX, x1: d.x + LABEL_GAP_PX + w, ...level };
    case 'left':
      return { x0: d.x - LABEL_GAP_PX - w, x1: d.x - LABEL_GAP_PX, ...level };
    case 'aboveRight':
      return { x0: d.x - 4, x1: d.x - 4 + w, ...above };
    case 'aboveLeft':
      return { x0: d.x + 4 - w, x1: d.x + 4, ...above };
    case 'belowRight':
      return { x0: d.x - 4, x1: d.x - 4 + w, y0: d.y + 8, y1: d.y + 8 + LABEL_H };
  }
}

const overlaps = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Loopt de lijn door de rechthoek? (de punten liggen op oplopende x) */
function lineCrosses(points: readonly MiniChartPoint[], b: Box): boolean {
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1];
    const q = points[i];
    const xa = Math.max(p.x, b.x0);
    const xb = Math.min(q.x, b.x1);
    if (xa > xb) continue;
    const yAt = (x: number): number => (q.x === p.x ? p.y : p.y + ((q.y - p.y) * (x - p.x)) / (q.x - p.x));
    const ya = yAt(xa);
    const yb = yAt(xb);
    if (Math.min(ya, yb) <= b.y1 && Math.max(ya, yb) >= b.y0) return true;
  }
  return false;
}

/**
 * Plaats van de stiplabels: de eerste plaats binnen de grafiek die de lijn en het vorige label niet raakt (naast de
 * stip, erboven, links, eronder); lukt dat nergens, dan de eerste plaats binnen de grafiek.
 */
function labelSides(
  dots: MiniDot[],
  points: readonly MiniChartPoint[],
  width: number,
  height: number,
): LabelSide[] {
  const placed: Box[] = [];
  return dots.map((d) => {
    const inside = SIDES.filter((side) => {
      const b = labelBox(d, side);
      return b.x0 >= 0 && b.x1 <= width && b.y0 >= 0 && b.y1 <= height + 4;
    });
    const free = inside.find((side) => {
      const b = labelBox(d, side);
      return !lineCrosses(points, b) && !placed.some((x) => overlaps(x, b));
    });
    const side = free ?? inside.find((s) => !placed.some((x) => overlaps(x, labelBox(d, s)))) ?? 'right';
    placed.push(labelBox(d, side));
    return side;
  });
}

const SIDE_CLASS: Record<LabelSide, string> = {
  right: css.dotLabel,
  left: `${css.dotLabel} ${css.dotLabelLeft}`,
  aboveRight: `${css.dotLabel} ${css.dotLabelAbove}`,
  aboveLeft: `${css.dotLabel} ${css.dotLabelAbove} ${css.dotLabelLeft}`,
  belowRight: `${css.dotLabel} ${css.dotLabelBelow}`,
};

/**
 * Een verouderd raster alleen tonen op dezelfde schaal als de schuif (het raster loopt tot V_max): na een ander
 * piekvermogen of een andere gebouwfunctie zou de oude lijn samengedrukt of uitgerekt staan; dan de plaatshouder.
 */
function sameScale(s: SensitivityState, bufferMaxM3: number): boolean {
  const end = s.rows[s.rows.length - 1];
  return !!end && Math.abs(end.volumeM3 - bufferMaxM3) <= 1e-9 * Math.max(1, bufferMaxM3);
}

function complete(s: SensitivityState | null): s is SensitivityState {
  return !!s && s.done && s.error === undefined && s.rows.length > 0 && s.rows.every((r) => r !== null);
}

export function BufferMiniChart() {
  const input = useStore((st) => st.input);
  const sens = useStore((st) => st.sensitivity);
  const ranges = useStore((st) => st.ranges);
  const update = useStore((st) => st.update);
  const applyFix = useStore((st) => st.applyFix);
  const revealSetting = useStore((st) => st.revealSetting);
  const [plotRef, box] = useBox();
  const hatchId = `${useId().replace(/:/g, '')}-hatch`;

  const status = gridStatus(sens, input);
  // laatste volledige raster: blijft gedimd staan tot het raster voor de nieuwe invoer klaar is (§5.1)
  const last = useRef<SensitivityState | null>(null);
  if (complete(sens) && last.current !== sens) last.current = sens;
  const manual = input.heatPump.sizingMode === 'manual';

  // wat er te tekenen valt: het passende raster, het vorige volledige raster (gedimd) of een deel van het nieuwe
  let rows: (SensitivityRow | null)[] | null = null;
  let stale = false;
  if (status === 'ready' && sens) rows = sens.rows;
  else if (status === 'pending') {
    if (last.current && sameScale(last.current, ranges.bufferMaxM3)) {
      rows = last.current.rows;
      stale = true;
    } else if (sens && sens.key === sensitivityKey(input) && sens.rows.some((r) => r)) rows = sens.rows;
  }
  // stippen pas als het raster klaar is en bij de invoer hoort, en alleen bij automatisch WP-vermogen
  const dots = status === 'ready' && !manual;
  const volumeM3 = input.buffer.volumeM3;
  const grid = input.grid;
  const batteryPowerManual = input.battery.powerKw !== null;
  const g = useMemo(
    () =>
      rows
        ? miniChartGeometry(rows, ranges, { volumeM3, grid, dots, batteryPowerManual }, box.width, box.height)
        : null,
    [rows, ranges, volumeM3, grid, dots, batteryPowerManual, box.width, box.height],
  );
  const sides = g ? labelSides(g.dots, g.points, box.width, box.height) : [];
  // klikken kiest het dichtstbijzijnde rasterpunt; niet in een verouderd raster (andere punten dan de nieuwe)
  const clickable = !!g && !stale && rows !== null;

  const onChartClick = (e: MouseEvent<SVGSVGElement>): void => {
    if (!clickable || !rows) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : box.width;
    const v = nearestRowVolume(rows, volumeAtX(e.clientX - rect.left, ranges.bufferMaxM3, width));
    if (v !== null) update((i) => ({ ...i, buffer: { ...i.buffer, volumeM3: v } }));
  };

  const onDot = (d: MiniDot): void => {
    applyFix(d.fix.undoLabel, d.fix.apply);
    revealSetting(d.fix.target);
  };

  // geen enkel punt te tekenen (bij geen buffervolume te dimensioneren): de plaatshouder, met de reden zodra het
  // raster voor deze invoer klaar is
  const empty = g !== null && g.points.length === 0;
  const plateau = g?.plateau ?? null;
  const endLabel = g?.endLabel ?? null;
  const top = MINI_CHART_PAD.top;
  const bottom = box.height - MINI_CHART_PAD.bottom;
  const first = g?.points[0];

  return (
    <div className={css.mini}>
      <div className={css.miniTitle} aria-hidden="true">
        {WHATIF_TEXTS.miniTitle}
      </div>
      <div
        ref={plotRef}
        className={`${css.plot} ${stale ? css.staleChart : ''}`}
        aria-busy={stale || (g !== null && status === 'pending') ? true : undefined}
        data-testid="buffer-mini-chart"
      >
        {status === 'failed' ? (
          <p className={css.placeholder}>{WHATIF_TEXTS.miniError}</p>
        ) : empty ? (
          <p className={css.placeholder}>
            {status === 'ready' ? WHATIF_TEXTS.miniUnsizable : WHATIF_TEXTS.miniPending}
          </p>
        ) : g ? (
          <>
            <svg
              className={`${css.svg} ${clickable ? css.clickable : ''}`}
              width={box.width}
              height={box.height}
              viewBox={`0 0 ${box.width} ${box.height}`}
              role="img"
              aria-label={g.ariaLabel}
              onClick={onChartClick}
            >
              <defs>
                <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse">
                  <rect width="6" height="6" className={css.plateauFill} />
                  <path d="M-1 1 l2 -2 M0 6 l6 -6 M5 7 l2 -2" className={css.hatch} />
                </pattern>
              </defs>
              {plateau && (
                <rect
                  x={plateau.x}
                  y={top - 6}
                  width={Math.max(0, box.width - SLIDER_INSET - plateau.x)}
                  height={bottom - top + 8}
                  fill={`url(#${hatchId})`}
                />
              )}
              <path d={g.path} className={css.line} />
              {/* verschoven stip (samenvallende stippen): verbindingslijn naar het punt op de lijn */}
              {g.dots.map(
                (d) =>
                  d.anchorY !== null && (
                    <line
                      key={d.id}
                      x1={d.x}
                      x2={d.x}
                      y1={d.anchorY}
                      y2={d.y}
                      className={css.dotLink}
                      data-testid="dot-link"
                    />
                  ),
              )}
              <line x1={g.currentX} x2={g.currentX} y1={2} y2={box.height} className={css.current} />
              {/* na de verticale lijn en met een rand in de kaartkleur: bij een kleine buffer loopt de lijn erachter */}
              {first && g.firstKw !== null && (
                <text x={first.x + 4} y={top - 6} className={css.axisLabel}>
                  {/* P_th,min zonder buffer: het vertrekpunt V = 0 */}
                  {fmt(g.firstKw, 1)}
                </text>
              )}
            </svg>
            {g.dots.map((d, i) => (
              <button
                key={d.id}
                type="button"
                className={css.dot}
                style={{ left: d.x, top: d.y }}
                aria-label={d.ariaLabel}
                // een stip ziet eruit als een markering in de grafiek: de tooltip zegt wat een klik doet
                title={d.ariaLabel}
                onClick={() => onDot(d)}
              >
                <span className={SIDE_CLASS[sides[i] ?? 'right']} aria-hidden="true">
                  {d.label}
                </span>
              </button>
            ))}
          </>
        ) : (
          <p className={css.placeholder}>{WHATIF_TEXTS.miniPending}</p>
        )}
      </div>
      <div className={css.miniFoot}>
        {plateau && status !== 'failed' && (
          <span className={`${css.plateauNote} ${stale ? css.staleChart : ''}`}>
            <span className={css.swatch} aria-hidden="true" />
            {plateau.label}
          </span>
        )}
        {endLabel && status !== 'failed' && (
          <span className={`${css.plateauNote} ${stale ? css.staleChart : ''}`}>{endLabel}</span>
        )}
        <button
          type="button"
          className={`${u.btnLink} ${css.fullLink}`}
          onClick={() => showInDepth('gevoeligheid')}
        >
          {UI_LABELS.fullSensitivity}
          <span aria-hidden="true"> →</span>
        </button>
        {manual && g && !empty && <span className={css.manualNote}>{WHATIF_TEXTS.miniManual}</span>}
      </div>
    </div>
  );
}
