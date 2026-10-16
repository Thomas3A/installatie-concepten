// Gedeelde uPlot-wrapper voor alle concepten: eigen legenda (klikbaar, vaste breedtes), nl-NL-assen,
// gesynchroniseerde cursor, extra tekenhaken, een smalle weergave voor telefoons en export als PNG (met titel en legenda).
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import uPlot from 'uplot';
import { fmt, fmtClock } from '../../core/format';
import s from './Chart.module.css';

export interface ChartSeries {
  label: string;
  color: string;
  /** streepjespatroon in px (zoals uPlot); leeg = volle lijn */
  dash?: number[];
  width?: number;
  scale?: string;
  show?: boolean;
  /** vul onder de lijn */
  fill?: string;
  points?: boolean;
  /** trapjeslijn (uurwaarden) */
  step?: boolean;
  /** staven: breedte als fractie van de x-stap en uitlijning (−1 links, 0 midden, 1 rechts van de x-waarde) */
  bars?: { size: number; align?: -1 | 0 | 1 };
  /** aantal decimalen van de cursorwaarde in de legenda */
  digits?: number;
  /** niet in de legenda tonen (hulpreeks, bijv. voor arcering) */
  hidden?: boolean;
  /** waarde in de legenda uit een andere reeks (bijv. de niet-gestapelde waarde bij een gestapelde reeks) */
  legendValue?: (idx: number) => number | null;
}

/** Extra legenda-item voor iets dat niet als reeks is getekend (verticale lijn, gearceerd venster). */
export interface LegendExtra {
  label: string;
  color: string;
  dash?: number[];
  kind?: 'line' | 'band' | 'dot';
}

export interface ChartAxis {
  scale: string;
  label?: string;
  side?: 1 | 3;
  grid?: boolean;
  /** formatter voor tick-labels */
  format?: (v: number) => string;
}

export interface UPlotChartProps {
  data: uPlot.AlignedData;
  series: ChartSeries[];
  /** x-as: tijd in seconden (hh:mm), een gewone getalas, of een eigen formatter (`xFormat`) */
  xKind?: 'time' | 'number' | 'custom';
  xLabel?: string;
  /** tick-labels én cursortekst bij xKind 'custom' */
  xFormat?: (v: number) => string;
  /** eigen tickposities voor de x-as */
  xSplits?: (min: number, max: number) => number[];
  /** tick-labels bij xKind 'custom' als die anders moeten dan de cursortekst; krijgt de plotbreedte in CSS-px */
  xTickFormat?: (v: number, plotWidthPx: number) => string;
  /** tweede x-as bovenaan (zelfde schaal), bijv. buffervolume in uren piekvermogen */
  topAxis?: { label?: string; format: (x: number) => string };
  axes?: ChartAxis[];
  scales?: Record<string, uPlot.Scale>;
  /** vlakken tussen twee reeksen (gestapelde weergave) */
  bands?: uPlot.Band[];
  height?: number;
  syncKey?: string;
  /** extra tekenhaken (bijv. arcering of verticale lijnen): `draw` en `drawClear` volgen altijd de laatste props */
  hooks?: uPlot.Hooks.Arrays;
  legendExtras?: LegendExtra[];
  ariaLabel: string;
  /** cursorindex verandert (hover) */
  onCursor?: (idx: number | null) => void;
  /** klik in het grafiekvlak: x-waarde van de klik */
  onClickX?: (x: number) => void;
  /** toegang tot de uPlot-instantie (bijv. om in te zoomen) */
  onReady?: (u: uPlot) => void;
  /** bestandsnaam (zonder .png) voor de exportknop; leeg = geen knop */
  exportName?: string;
  /** titelregel boven de grafiek in de PNG-export (bijv. paneel, klimaatjaar en periode) */
  exportTitle?: string;
  /** korte naam van de grafiek voor de exportknop: "<naam> opslaan als PNG" (standaard de titel of bestandsnaam) */
  exportLabel?: string;
  /**
   * Smalle weergave onder deze breedte van de grafiek [CSS-px]: smallere y-assen zonder gedraaide astitels; die
   * titels staan dan als regel boven de grafiek. Leeg = altijd de gewone weergave.
   */
  compactBelow?: number;
}

/** Waarde van een CSS-variabele van het thema (voor kleuren in de grafieken). */
export function cssColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const CLOCK_STEPS = [60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 21600, 43200];

function clockSplits(
  _u: uPlot,
  _ax: number,
  min: number,
  max: number,
  _inc: number,
  _space: number,
): number[] {
  const span = Math.max(max - min, 1);
  const wantTicks = Math.max(2, Math.floor(700 / 80));
  const target = span / wantTicks;
  const step = CLOCK_STEPS.find((c) => c >= target) ?? CLOCK_STEPS[CLOCK_STEPS.length - 1];
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
  return out;
}

/** Lijnvoorbeeld in de legenda: toont kleur én streepjespatroon (vol, gestreept, gestippeld, streep-punt). */
function LineSwatch({
  color,
  dash,
  width = 1.6,
  dim,
  fill,
}: {
  color: string;
  dash?: number[];
  width?: number;
  dim?: boolean;
  fill?: string;
}) {
  return (
    <svg
      className={s.swatch}
      width={34}
      height={10}
      viewBox="0 0 34 10"
      aria-hidden="true"
      opacity={dim ? 0.35 : 1}
    >
      {fill && <rect x={1} y={5} width={32} height={5} fill={fill} />}
      <line
        x1={1}
        y1={5}
        x2={33}
        y2={5}
        stroke={color}
        strokeWidth={Math.max(2, width)}
        strokeDasharray={dash && dash.length ? dash.join(' ') : undefined}
      />
    </svg>
  );
}

/** Aantal decimalen dat bij een tickstap past (0 bij stap ≥ 1). */
function tickDigits(incr: number): number {
  if (!Number.isFinite(incr) || incr <= 0 || incr >= 1) return 0;
  return Math.min(4, Math.ceil(-Math.log10(incr) - 1e-9));
}

function valueText(v: number | null | undefined, digits: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  return fmt(v, Math.abs(v) >= 1000 ? 0 : digits);
}

// ---------------------------------------------------------------- tekstmaat

const AXIS_FONT = '11px system-ui';
let measureCtx: CanvasRenderingContext2D | null | undefined;

/** Breedte van een tekst in CSS-px (schatting als er geen canvas is, bijv. in tests). */
function textWidth(text: string, font: string): number {
  if (measureCtx === undefined) {
    measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  }
  if (!measureCtx) return text.length * 6.2;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

/** Breedte van een smalle y-as: net genoeg voor de langste ticklabel (plus streepje en marge). */
function compactAxisSize(_u: uPlot, values: string[] | null): number {
  let w = 0;
  for (const v of values ?? []) if (v) w = Math.max(w, textWidth(String(v), AXIS_FONT));
  return Math.ceil(Math.max(20, w + 12));
}

/** Astitels van de gebruikte y-assen als één regel ("links: … · rechts: …"), voor de smalle weergave. */
function axisCaption(axes: ChartAxis[] | undefined, used: Set<string>): string {
  const left: string[] = [];
  const right: string[] = [];
  for (const a of axes ?? []) {
    if (!a.label || !used.has(a.scale)) continue;
    const list = (a.side ?? 3) === 1 ? right : left;
    if (!list.includes(a.label)) list.push(a.label);
  }
  // spiegelas met dezelfde titel: één keer noemen
  const r = right.filter((l) => !left.includes(l));
  if (r.length === 0) return left.join(' · ');
  if (left.length === 0) return `rechts: ${r.join(' · ')}`;
  return `links: ${left.join(' · ')} · rechts: ${r.join(' · ')}`;
}

// ---------------------------------------------------------------- export

/** Legenda-item in de PNG-export. */
export interface ExportLegendItem {
  label: string;
  color: string;
  dash?: number[];
  width?: number;
  fill?: string;
  kind?: 'line' | 'band' | 'dot';
}

export interface ExportOptions {
  /** titelregel boven de grafiek */
  title?: string;
  /** kleinere regel onder de titel (bijv. de astitels in de smalle weergave) */
  subtitle?: string;
  /** legenda onder de grafiek */
  legend?: ExportLegendItem[];
}

/** Tekst in regels van hoogstens `maxW` breed (afbreken op spaties; een te lang woord blijft heel). */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && ctx.measureText(next).width > maxW) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Kleurvoorbeeld van een legenda-item (zelfde vormen als in de legenda op de pagina). */
function drawSwatch(
  ctx: CanvasRenderingContext2D,
  it: ExportLegendItem,
  x: number,
  yMid: number,
  r: number,
): void {
  const w = 28 * r;
  ctx.save();
  if (it.kind === 'band') {
    ctx.fillStyle = it.color;
    ctx.fillRect(x, yMid - 4 * r, w, 8 * r);
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = it.color;
    ctx.lineWidth = r;
    ctx.strokeRect(x, yMid - 4 * r, w, 8 * r);
  } else if (it.kind === 'dot') {
    ctx.fillStyle = it.color;
    ctx.beginPath();
    ctx.arc(x + w / 2, yMid, 4 * r, 0, 2 * Math.PI);
    ctx.fill();
  } else {
    if (it.fill) {
      ctx.fillStyle = it.fill;
      ctx.fillRect(x, yMid, w, 5 * r);
    }
    ctx.strokeStyle = it.color;
    ctx.lineWidth = Math.max(2, it.width ?? 1.6) * r;
    ctx.setLineDash((it.dash ?? []).map((d) => d * r));
    ctx.beginPath();
    ctx.moveTo(x, yMid);
    ctx.lineTo(x + w, yMid);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Grafiek als PNG downloaden: titel, de grafiek zelf en de zichtbare legenda (reeksen en extra items) op één
 * canvas, met achtergrond, zodat de export ook los van de pagina en in het donkere thema leesbaar is.
 */
export function exportPng(u: uPlot, name: string, opts: ExportOptions = {}): void {
  const src = u.ctx.canvas;
  // canvaspixels per CSS-pixel van de grafiek
  const r = u.width > 0 ? src.width / u.width : 1;
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) return;
  const family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  const font = (px: number, weight = 400): string => `${weight} ${Math.round(px * r)}px ${family}`;
  const pad = Math.round(12 * r);
  const maxW = src.width - 2 * pad;

  probe.font = font(14, 600);
  const titleLines = opts.title ? wrapText(probe, opts.title, maxW) : [];
  probe.font = font(11.5);
  const subLines = opts.subtitle ? wrapText(probe, opts.subtitle, maxW) : [];
  const titleH = 20 * r;
  const subH = 16 * r;
  const headH = titleLines.length * titleH + subLines.length * subH;

  // legenda: items achter elkaar, nieuwe rij als de breedte op is; een te lang label breekt af
  const swW = 28 * r;
  const gap = 6 * r;
  const itemGap = 16 * r;
  const rowH = 18 * r;
  probe.font = font(12);
  const placed: { it: ExportLegendItem; lines: string[]; x: number; row: number }[] = [];
  let x = 0;
  let row = 0;
  for (const it of opts.legend ?? []) {
    const lines = wrapText(probe, it.label, maxW - swW - gap);
    const w = swW + gap + Math.max(...lines.map((l) => probe.measureText(l).width));
    if (x > 0 && x + w > maxW) {
      x = 0;
      row++;
    }
    placed.push({ it, lines, x, row });
    if (lines.length > 1) {
      // meerregelig label: krijgt zelf de volle breedte
      row += lines.length;
      x = 0;
    } else x += w + itemGap;
  }
  const rows = placed.length === 0 ? 0 : x === 0 ? row : row + 1;
  const legendH = rows * rowH;

  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = Math.ceil(
    pad + headH + (headH > 0 ? 6 * r : 0) + src.height + (rows > 0 ? 8 * r : 0) + legendH + pad,
  );
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = cssColor('--surface', '#ffffff');
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  let y = pad;
  ctx.fillStyle = cssColor('--text', '#1c2229');
  ctx.font = font(14, 600);
  for (const l of titleLines) {
    ctx.fillText(l, pad, y + titleH / 2);
    y += titleH;
  }
  ctx.fillStyle = cssColor('--text-2', '#55606c');
  ctx.font = font(11.5);
  for (const l of subLines) {
    ctx.fillText(l, pad, y + subH / 2);
    y += subH;
  }
  if (headH > 0) y += 6 * r;
  ctx.drawImage(src, 0, y);
  y += src.height + (rows > 0 ? 8 * r : 0);
  ctx.font = font(12);
  ctx.fillStyle = cssColor('--text', '#1c2229');
  for (const p of placed) {
    const yMid = y + p.row * rowH + rowH / 2;
    drawSwatch(ctx, p.it, pad + p.x, yMid, r);
    ctx.fillStyle = cssColor('--text', '#1c2229');
    p.lines.forEach((l, k) => ctx.fillText(l, pad + p.x + swW + gap, yMid + k * rowH));
  }

  c.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

export function UPlotChart({
  data,
  series,
  xKind = 'time',
  xLabel,
  xFormat,
  xSplits,
  xTickFormat,
  topAxis,
  axes,
  scales,
  bands,
  height = 220,
  syncKey,
  hooks,
  legendExtras,
  ariaLabel,
  onCursor,
  onClickX,
  onReady,
  exportName,
  exportTitle,
  exportLabel,
  compactBelow,
}: UPlotChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const [theme, setTheme] = useState(0);
  const [cursorIdx, setCursorIdx] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  // smalle weergave: null = nog niet gemeten (dan wordt de grafiek pas na het meten opgebouwd)
  const [compact, setCompact] = useState<boolean | null>(compactBelow === undefined ? false : null);
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;
  const cbRef = useRef({ onCursor, onClickX, onReady, xFormat, xSplits, xTickFormat, topAxis });
  cbRef.current = { onCursor, onClickX, onReady, xFormat, xSplits, xTickFormat, topAxis };
  const sig = JSON.stringify([
    series,
    axes,
    xKind,
    xLabel,
    height,
    syncKey,
    theme,
    bands,
    scales,
    topAxis?.label,
    compact,
  ]);

  // breedte meten vóór de eerste weergave, zodat de grafiek meteen in de juiste weergave wordt opgebouwd
  useLayoutEffect(() => {
    if (compactBelow === undefined) return;
    const el = host.current;
    if (el) setCompact(el.clientWidth < compactBelow);
  }, [compactBelow]);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const f = (): void => setTheme((t) => t + 1);
    mq?.addEventListener?.('change', f);
    return () => mq?.removeEventListener?.('change', f);
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el || compact === null) return;
    const text = cssColor('--text-2', '#666');
    const grid = cssColor('--border', '#ddd');
    const axStyle = {
      stroke: text,
      grid: { stroke: grid, width: 1 },
      ticks: compact ? { stroke: grid, width: 1, size: 4 } : { stroke: grid, width: 1 },
      font: AXIS_FONT,
      labelFont: AXIS_FONT,
    };
    const ax: uPlot.Axis[] = [
      {
        ...axStyle,
        label: xLabel,
        values:
          xKind === 'time'
            ? (_u, vals) => vals.map((v) => fmtClock(v))
            : xKind === 'custom'
              ? (u, vals) => {
                  const tick = cbRef.current.xTickFormat;
                  const w = u.bbox.width / (window.devicePixelRatio || 1);
                  return vals.map((v) => (tick ? tick(v, w) : (cbRef.current.xFormat?.(v) ?? fmt(v, 0))));
                }
              : (_u, vals, _ax, _space, incr) => vals.map((v) => fmt(v, tickDigits(incr))),
        splits:
          xKind === 'time'
            ? clockSplits
            : cbRef.current.xSplits
              ? (_u, _ax, min, max) => cbRef.current.xSplits!(min, max)
              : undefined,
        size: compact ? 30 : 38,
        ...(compact ? { labelSize: 20 } : {}),
      },
    ];
    if (topAxis) {
      ax.push({
        ...axStyle,
        scale: 'x',
        side: 0,
        label: topAxis.label,
        grid: { show: false },
        values: (_u, vals) => vals.map((v) => cbRef.current.topAxis?.format(v) ?? ''),
        size: compact ? 26 : 34,
        ...(compact ? { labelSize: 20 } : {}),
      });
    }
    const used = new Set(series.map((sr) => sr.scale ?? 'y'));
    const axDefs = axes ?? [{ scale: 'y' }];
    for (const a of axDefs) {
      if (!used.has(a.scale)) continue;
      ax.push({
        ...axStyle,
        scale: a.scale,
        // smal: geen gedraaide astitel (die staat dan boven de grafiek) en een as zo breed als de getallen
        label: compact ? undefined : a.label,
        side: a.side ?? 3,
        grid: a.grid === false ? { show: false } : { stroke: grid, width: 1 },
        // standaard nl-NL notatie (decimale komma, punt als duizendtalscheiding), decimalen volgens de tickstap
        values: a.format
          ? (_u, vals) => vals.map((v) => a.format!(v))
          : (_u, vals, _ax, _space, incr) => vals.map((v) => fmt(v, tickDigits(incr))),
        size: compact ? compactAxisSize : 52,
      });
    }
    const opts: uPlot.Options = {
      width: Math.max(el.clientWidth, 200),
      height,
      padding: [8, compact ? 10 : 18, 0, 0],
      cursor: syncKey
        ? { sync: { key: syncKey }, drag: { x: true, y: false } }
        : { drag: { x: true, y: false } },
      // eigen legenda (zie onder): vaste breedtes, dus geen layoutverschuiving bij hoveren
      legend: { show: false },
      scales: { x: { time: false }, ...scales },
      axes: ax,
      bands,
      series: [
        {},
        ...series.map(
          (sr): uPlot.Series => ({
            label: sr.label,
            stroke: sr.color,
            width: sr.width ?? 1.6,
            dash: sr.dash,
            scale: sr.scale ?? 'y',
            show: !hiddenRef.current[sr.label] && (sr.show ?? true),
            fill: sr.fill,
            points: { show: sr.points ?? false, size: 6 },
            paths: sr.bars
              ? uPlot.paths.bars?.({ size: [sr.bars.size], align: sr.bars.align ?? 0 })
              : sr.step
                ? uPlot.paths.stepped?.({ align: 1 })
                : undefined,
            spanGaps: false,
          }),
        ),
      ],
      hooks: {
        // `draw`/`drawClear` lezen steeds de laatste hooks, zodat de arcering meebeweegt met nieuwe gegevens
        drawClear: [(u: uPlot) => hooksRef.current?.drawClear?.forEach((fn) => fn?.(u))],
        draw: [(u: uPlot) => hooksRef.current?.draw?.forEach((fn) => fn?.(u))],
        setCursor: [
          (u: uPlot) => {
            const idx = u.cursor.idx ?? null;
            setCursorIdx(idx);
            cbRef.current.onCursor?.(idx);
          },
        ],
        ready: [
          (u: uPlot) => {
            cbRef.current.onReady?.(u);
            u.over.addEventListener('click', (e: MouseEvent) => {
              const cb = cbRef.current.onClickX;
              if (!cb) return;
              const rect = u.over.getBoundingClientRect();
              cb(u.posToVal(e.clientX - rect.left, 'x'));
            });
          },
        ],
      },
    };
    const u = new uPlot(opts, data, el);
    plot.current = u;
    const ro = new ResizeObserver(() => {
      // over de grens van de smalle weergave: opnieuw opbouwen (via `compact` in de signatuur)
      const narrow = compactBelow !== undefined && el.clientWidth < compactBelow;
      if (compactBelow !== undefined && el.clientWidth > 0 && narrow !== compact) {
        setCompact(narrow);
        return;
      }
      u.setSize({ width: Math.max(el.clientWidth, 200), height });
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      u.destroy();
      plot.current = null;
    };
    // data wordt apart bijgewerkt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  useEffect(() => {
    plot.current?.setData(data);
  }, [data]);

  const toggle = (i: number, label: string): void => {
    const nowHidden = !hidden[label];
    setHidden((h) => ({ ...h, [label]: nowHidden }));
    plot.current?.setSeries(i + 1, { show: !nowHidden });
  };

  const xs = data[0] as ArrayLike<number> | undefined;
  const xVal = cursorIdx !== null && xs ? xs[cursorIdx] : null;
  const xText =
    xVal === null || xVal === undefined
      ? ' ' // plaats blijft gereserveerd, geen verspringen
      : xKind === 'time'
        ? `t = ${fmtClock(xVal)}`
        : xKind === 'custom' && xFormat
          ? xFormat(xVal)
          : `x = ${fmt(xVal, Math.abs(xVal) >= 100 ? 0 : 1)}`;

  // smalle weergave: de astitels als regel boven de grafiek
  const caption = compact ? axisCaption(axes, new Set(series.map((sr) => sr.scale ?? 'y'))) : '';

  const doExport = (): void => {
    if (!plot.current || !exportName) return;
    const legend: ExportLegendItem[] = [
      // alleen de reeksen die nu zichtbaar zijn (niet weggeklikt in de legenda)
      ...series
        .filter((sr, i) => !sr.hidden && plot.current?.series?.[i + 1]?.show !== false)
        .map((sr) => ({ label: sr.label, color: sr.color, dash: sr.dash, width: sr.width, fill: sr.fill })),
      ...(legendExtras ?? []).map((x) => ({ label: x.label, color: x.color, dash: x.dash, kind: x.kind })),
    ];
    exportPng(plot.current, exportName, { title: exportTitle, subtitle: caption || undefined, legend });
  };
  const exportButtonName = exportLabel ?? exportTitle ?? exportName?.replace(/[-_]+/g, ' ');

  return (
    <div className={s.wrap}>
      {caption && (
        <div className={s.axisCaption} aria-hidden="true">
          {caption}
        </div>
      )}
      {/* hoogte vasthouden tot uPlot er is: geen verspringen bij het (opnieuw) opbouwen */}
      <div
        ref={host}
        className={s.host}
        role="img"
        aria-label={ariaLabel}
        style={{ '--chart-h': `${height}px` } as CSSProperties}
      />
      <div className={s.legend} role="group" aria-label="Legenda">
        <span className={xKind === 'custom' ? s.legendXWide : s.legendX} aria-hidden="true">
          {xText}
        </span>
        {series.map((sr, i) => {
          if (sr.hidden) return null;
          const on = !hidden[sr.label];
          const v =
            cursorIdx === null
              ? null
              : sr.legendValue
                ? sr.legendValue(cursorIdx)
                : (data[i + 1] as ArrayLike<number | null> | undefined)?.[cursorIdx];
          return (
            <button
              key={sr.label}
              type="button"
              className={s.item}
              aria-pressed={on}
              title={`${sr.label}: klik om te tonen of te verbergen`}
              onClick={() => toggle(i, sr.label)}
            >
              <LineSwatch color={sr.color} dash={sr.dash} width={sr.width} dim={!on} fill={sr.fill} />
              <span className={s.label}>{sr.label}</span>
              <span className={s.val}>{on && cursorIdx !== null ? valueText(v, sr.digits ?? 1) : ''}</span>
            </button>
          );
        })}
        {legendExtras?.map((x) => (
          <span key={x.label} className={s.extra}>
            {x.kind === 'band' ? (
              <svg className={s.swatch} width={34} height={10} viewBox="0 0 34 10" aria-hidden="true">
                <rect
                  x={1}
                  y={1}
                  width={32}
                  height={8}
                  rx={2}
                  fill={x.color}
                  stroke={x.color}
                  strokeOpacity={0.6}
                />
              </svg>
            ) : x.kind === 'dot' ? (
              <svg className={s.swatch} width={34} height={10} viewBox="0 0 34 10" aria-hidden="true">
                <circle cx={17} cy={5} r={4} fill={x.color} />
              </svg>
            ) : (
              <LineSwatch color={x.color} dash={x.dash} width={1.6} />
            )}
            <span>{x.label}</span>
          </span>
        ))}
        {exportName && (
          <button
            type="button"
            className={`${s.item} ${s.export} noPrint`}
            aria-label={`${exportButtonName} opslaan als PNG`}
            title="Grafiek opslaan als PNG, met titel en legenda"
            onClick={doExport}
          >
            PNG
          </button>
        )}
      </div>
    </div>
  );
}
