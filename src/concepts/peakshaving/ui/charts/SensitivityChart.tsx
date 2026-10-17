// Tabblad Gevoeligheid (spec §7.3) — de kerngrafiek: piek aan de meter per batterijgrootte en het benodigde
// WP-vermogen als functie van het buffervolume, met de budgetten van de standaardaansluitingen als referentielijnen.
// Het raster komt rij voor rij uit de Web Worker; de grafiek tekent wat er al is. Tijdens een herberekening blijft het
// vorige volledige raster (gedimd) staan tot de eerste nieuwe rij er is, zodat de pagina niet verspringt.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type uPlot from 'uplot';
import { fmt } from '../../../../core/format';
import { cssColor, UPlotChart, type ChartSeries, type LegendExtra } from '../../../../ui/charts/UPlotChart';
import ui from '../../../../ui/ui.module.css';
import { CONNECTIONS, LARGE_CONNECTION_ID } from '../../data/connections';
import { connectionLabel, connectionPowerKw, limitFromConnection } from '../../model/grid';
import { connectionText } from '../../model/kpis';
import { bufferHoursOfPeak, type Ranges } from '../../model/ranges';
import { SENSITIVITY_VOLUME_FRACTIONS } from '../../model/sizing';
import type { PeakshavingInput } from '../../model/types';
import { useStore, type SensitivityState } from '../../store';
import {
  compact,
  gridModel,
  transitionsOf,
  type GridModel,
  type Transition,
} from '../../view/sensitivityFacts';
import { usePointerCoarse } from '../hooks';
import { pixelRatio } from './coldWeekDraw';
import css from './SensitivityChart.module.css';

/** Teksten van dit tabblad (UX-plan §7 #14, #15); de klikhint en "De gevoeligheid wordt berekend" zijn testankers. */
const TEXT = {
  lead: 'Waar de lijnen vlak worden, helpt meer buffer niet meer; een stip markeert vanaf welk buffervolume een aansluiting volstaat.',
  howToRead: 'Hoe lees ik dit?',
  pending: 'De gevoeligheid wordt berekend…',
  clickHint: {
    mouse: 'Klik in de grafiek om het buffervolume te kiezen.',
    touch: 'Tik in de grafiek om het buffervolume te kiezen.',
  },
  readout: {
    mouse: 'Beweeg over de grafiek voor de overschrijding en de kleinste aansluiting per batterijgrootte.',
    touch: 'Tik in de grafiek voor de overschrijding en de kleinste aansluiting per batterijgrootte.',
  },
} as const;

// vaste middentint die in het lichte én donkere thema leesbaar is (zelfde oranje als de buffer in de andere tabbladen)
const HEAT_PUMP_COLOR = '#e8892b';
const CURRENT_DASH = [7, 4];
const OTHER_DASH = [3, 3];
const CHART_HEIGHT = 360;
const PRINT_CHART_HEIGHT = 300;
/** onder deze grafiekbreedte smalle y-assen zonder gedraaide astitels [px] */
const COMPACT_BELOW_PX = 560;
/**
 * Een budgetlijn hoger dan deze factor × de hoogste meterpiek rekt de as niet op (bijv. grootverbruik): de krommen
 * blijven leesbaar en de lijn verschijnt als label "↑ …" aan de bovenrand.
 */
const OFF_SCALE_FACTOR = 2;

// ---------------------------------------------------------------- thema

function subscribeScheme(cb: () => void): () => void {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  mq?.addEventListener?.('change', cb);
  return () => mq?.removeEventListener?.('change', cb);
}

/** Herteken met de themakleuren als het kleurschema van het systeem wisselt. */
function useDarkScheme(): boolean {
  return useSyncExternalStore(
    subscribeScheme,
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
    () => false,
  );
}

interface Palette {
  text: string;
  text2: string;
  surface: string;
  accent: string;
  err: string;
  ok: string;
}

function palette(): Palette {
  return {
    text: cssColor('--text', '#1c2229'),
    text2: cssColor('--text-2', '#55606c'),
    surface: cssColor('--surface', '#ffffff'),
    accent: cssColor('--accent', '#0f766e'),
    err: cssColor('--err', '#b42318'),
    ok: cssColor('--ok', '#1a7f4b'),
  };
}

/** Lineaire menging van twee #rrggbb-kleuren (t = 0 → a, t = 1 → b); bij een andere notatie blijft a ongewijzigd. */
function mix(a: string, b: string, t: number): string {
  const pa = /^#([0-9a-f]{6})$/i.exec(a.trim());
  const pb = /^#([0-9a-f]{6})$/i.exec(b.trim());
  if (!pa || !pb) return a;
  const ca = parseInt(pa[1], 16);
  const cb = parseInt(pb[1], 16);
  const channel = (c: number, shift: number): number => (c >> shift) & 255;
  return (
    '#' +
    [16, 8, 0]
      .map((sh) => Math.round(channel(ca, sh) * (1 - t) + channel(cb, sh) * t))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Kleur en lijndikte per batterij (oplopend in capaciteit): zonder batterij dun en in tekstkleur bovenop, grotere
 * batterijen als steeds bredere en lichtere groene banden eronder — zo blijven samenvallende lijnen alle vier zichtbaar.
 */
function batteryStyle(j: number, pal: Palette): { color: string; width: number } {
  switch (j) {
    case 0:
      return { color: pal.text, width: 1.8 };
    case 1:
      return { color: pal.ok, width: 3 };
    case 2:
      return { color: mix(pal.ok, pal.surface, 0.35), width: 4.5 };
    default:
      return { color: mix(pal.ok, pal.surface, 0.6), width: 6.5 };
  }
}

// ---------------------------------------------------------------- notatie

const batteryName = (kwh: number): string => (kwh > 0 ? `batterij ${compact(kwh)} kWh` : 'zonder batterij');

/** Mooie bovengrens voor een as (1; 1,2; 1,4; … 9 · 10^k). */
function niceCeil(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const f of [1, 1.2, 1.4, 1.6, 1.8, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9, 10]) {
    if (f * mag >= v - 1e-12) return f * mag;
  }
  return 10 * mag;
}

const kwDigits = (maxKw: number): number => (maxKw < 20 ? 2 : 1);

/** Ronde stap (1, 2, 2,5 of 5 · 10^k) van minstens `raw`. */
function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].find((f) => f * mag >= raw - 1e-12) ?? 10) * mag;
}

/**
 * Asbereik zodat de gegevens [lo, hi] in het deel [f0, f1] van de grafiekhoogte vallen (ondergrens nooit onder 0),
 * afgerond op ronde stappen zodat het bereik niet bij elk nieuw punt verspringt.
 */
function bandRange(lo: number, hi: number, f0: number, f1: number): [number, number] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (hi - lo < 1e-9) {
    const pad = Math.max(Math.abs(hi) * 0.1, 0.1);
    lo -= pad;
    hi += pad;
  }
  const span = (hi - lo) / (f1 - f0);
  let min = lo - f0 * span;
  let max = min + span;
  if (min < 0) {
    min = 0;
    max = hi / f1;
  }
  const step = niceStep((max - min) / 6);
  return [Math.floor(min / step + 1e-9) * step, Math.ceil(max / step - 1e-9) * step];
}

// ---------------------------------------------------------------- gegevens

interface RefLine {
  limitKw: number;
  text: string;
  /** kort label als het lange niet past ("huidig: 3×80 A") */
  short: string;
  current: boolean;
  /** ver boven de krommen: niet op de as, alleen als label aan de bovenrand */
  offScale: boolean;
}

interface ChartData {
  data: uPlot.AlignedData;
  series: ChartSeries[];
  scales: Record<string, uPlot.Scale>;
  lines: RefLine[];
  transitions: Transition[];
  colors: string[];
  netDigits: number;
  extras: LegendExtra[];
}

type GridSettings = Pick<PeakshavingInput['grid'], 'connection' | 'contractedKw' | 'heatPumpShare'>;

function chartData(
  m: GridModel,
  grid: GridSettings,
  designLoadKw: number,
  ranges: Ranges,
  pal: Palette,
): ChartData {
  const share = grid.heatPumpShare;
  const pct = `${fmt(share * 100, 0)} %`;
  const curLimit = limitFromConnection(connectionPowerKw(grid), share);
  const nets: number[] = [];
  const ths: number[] = [];
  for (const r of m.rows) {
    if (!r) continue;
    if (Number.isFinite(r.nominalKw)) ths.push(r.nominalKw);
    for (const c of r.cells) if (Number.isFinite(c.pGridMaxKw)) nets.push(c.pGridMaxKw);
  }
  const transitions = transitionsOf(m, share).sort(
    (a, b) => a.volumeM3 - b.volumeM3 || a.limitKw - b.limitKw,
  );
  const maxNet = nets.length > 0 ? Math.max(...nets) : NaN;
  // een budget ver boven de krommen (bijv. grootverbruik) rekt de as niet op
  const onScale = (kw: number): boolean => !(nets.length > 0) || kw <= OFF_SCALE_FACTOR * maxNet;

  // relevant bereik voor de referentielijnen: tot 1,15 × hoogste meterpiek, minstens het huidige budget (als dat
  // op de as past) en de budgetten met een overgang
  const relevantTop = niceCeil(
    Math.max(
      nets.length > 0 ? 1.15 * maxNet : 0,
      Number.isFinite(curLimit) && onScale(curLimit) ? 1.1 * curLimit : 0,
      ...transitions.map((t) => 1.08 * t.limitKw),
    ),
  );
  const minNet = nets.length > 0 ? Math.min(...nets) : curLimit;

  // referentielijnen: alle standaardaansluitingen tussen de laagste meterpiek en de bovenkant van de as, de eerste
  // daaronder, de huidige en de aansluitingen met een overgang
  const below = [...CONNECTIONS].reverse().find((c) => limitFromConnection(c.powerKw, share) < minNet - 1e-6);
  const lines: RefLine[] = [];
  for (const c of CONNECTIONS) {
    const limitKw = limitFromConnection(c.powerKw, share);
    if (!Number.isFinite(limitKw)) continue;
    const current = c.id === grid.connection;
    const inRange = limitKw >= minNet - 1e-6 && limitKw <= relevantTop;
    if (!(inRange || c === below || current || transitions.some((t) => t.conn.id === c.id))) continue;
    const prefix = current ? 'huidig: ' : '';
    lines.push({
      limitKw,
      current,
      text: `${prefix}${c.label} · ${pct} = ${fmt(limitKw, 1)} kW`,
      short: `${prefix}${c.label}`,
      offScale: !onScale(limitKw),
    });
  }
  if (grid.connection === LARGE_CONNECTION_ID && Number.isFinite(curLimit)) {
    const name = connectionText({
      id: LARGE_CONNECTION_ID,
      label: connectionLabel(grid),
      powerKw: connectionPowerKw(grid),
    });
    lines.push({
      limitKw: curLimit,
      current: true,
      text: `huidig: ${name} · ${pct} = ${fmt(curLimit, 1)} kW`,
      short: `huidig: ${fmt(curLimit, 0)} kW`,
      offScale: !onScale(curLimit),
    });
  }

  // Twee assen in één vlak: de elektrische lijnen (meterpiek en budgetten) in de onderste helft, het thermische
  // vermogen (WP en gebouw) in de bovenste strook, zodat de lijnen van beide assen elkaar niet bedekken.
  const elec = [...nets, ...lines.filter((l) => !l.offScale).map((l) => l.limitKw)];
  const yRange = bandRange(Math.min(...elec), Math.max(...elec), 0.06, 0.58);
  const therm = [designLoadKw, ...ths];
  const thRange = bandRange(Math.min(...therm), Math.max(...therm), 0.66, 0.94);
  const netDigits = kwDigits(nets.length > 0 ? Math.max(...nets) : curLimit);
  const thDigits = kwDigits(Math.max(designLoadKw, ...ths));

  // tekenvolgorde: grootste batterij eerst (breedste band), zonder batterij bovenop
  const order = m.caps.map((_, j) => j).reverse();
  const colors = m.caps.map((_, j) => batteryStyle(j, pal).color);
  const series: ChartSeries[] = [
    ...order.map((j): ChartSeries => {
      const st = batteryStyle(j, pal);
      return {
        label: batteryName(m.caps[j]),
        color: st.color,
        width: st.width,
        points: true,
        digits: netDigits,
      };
    }),
    {
      label: 'Benodigd WP-vermogen (P th,min)',
      color: HEAT_PUMP_COLOR,
      width: 3.5,
      scale: 'th',
      points: true,
      digits: thDigits,
    },
    {
      label: 'Piekvermogen gebouw (ontwerpverlies)',
      color: HEAT_PUMP_COLOR,
      dash: [6, 4],
      width: 1.6,
      scale: 'th',
      digits: thDigits,
    },
  ];
  const finiteOrNull = (v: number | undefined): number | null =>
    v !== undefined && Number.isFinite(v) ? v : null;
  const data: uPlot.AlignedData = [
    m.x,
    ...order.map((j) => m.rows.map((r) => finiteOrNull(r?.cells[j]?.pGridMaxKw))),
    m.rows.map((r) => finiteOrNull(r?.nominalKw)),
    m.x.map(() => designLoadKw),
  ];
  const vMax = m.x[m.n - 1] > 0 ? m.x[m.n - 1] : ranges.bufferMaxM3;
  const scales: Record<string, uPlot.Scale> = {
    x: { time: false, range: [0, vMax] },
    y: { range: yRange },
    th: { range: thRange },
  };

  const extras: LegendExtra[] = [];
  const cur = lines.find((l) => l.current);
  if (cur)
    extras.push({
      label: cur.offScale
        ? 'Budget huidige aansluiting (P limiet), boven de as (↑)'
        : 'Budget huidige aansluiting (P limiet)',
      color: pal.err,
      dash: CURRENT_DASH,
    });
  if (lines.some((l) => !l.current)) {
    extras.push({
      label: `Budget andere standaardaansluitingen (${pct})`,
      color: pal.text2,
      dash: OTHER_DASH,
    });
  }
  // ook zolang het raster nog niet compleet is: de legenda verspringt dan niet als de eerste stip verschijnt
  if (transitions.length > 0 || m.computed < m.n) {
    extras.push({
      label: 'Stip: aansluiting toereikend vanaf dit buffervolume',
      color: pal.text,
      kind: 'dot',
    });
  }
  return { data, series, scales, lines, transitions, colors, netDigits, extras };
}

// ---------------------------------------------------------------- tekenen

interface Overlay {
  lines: RefLine[];
  transitions: Transition[];
  colors: string[];
  volumeM3: number;
  pal: Palette;
}

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const overlaps = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Tekst met een halfdoorzichtig vlak erachter (baseline op y). */
function boxedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  rect: Rect,
  color: string,
  bg: string,
): void {
  ctx.globalAlpha = 0.88;
  ctx.fillStyle = bg;
  ctx.fillRect(rect.x0, rect.y0, rect.x1 - rect.x0, rect.y1 - rect.y0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Referentielijnen in canvaspixels, van boven naar beneden; alleen wat binnen het grafiekvlak valt. */
function refPositions(u: uPlot, o: Overlay): { l: RefLine; y: number }[] {
  const { top, height } = u.bbox;
  return o.lines
    .filter((l) => !l.offScale)
    .map((l) => ({ l, y: u.valToPos(l.limitKw, 'y', true) }))
    .filter((p) => Number.isFinite(p.y) && p.y >= top - 0.5 && p.y <= top + height + 0.5)
    .sort((a, b) => a.y - b.y);
}

function volumePosition(u: uPlot, o: Overlay): number | null {
  const { left, width } = u.bbox;
  const x = u.valToPos(o.volumeM3, 'x', true);
  return Number.isFinite(x) && x >= left - 0.5 && x <= left + width + 0.5 ? x : null;
}

/** Onder de reeksen: referentielijnen (budgetten van de aansluitingen) en het huidige buffervolume. */
function drawUnder(u: uPlot, o: Overlay): void {
  const ctx = u.ctx;
  const r = pixelRatio();
  const { left, top, width, height } = u.bbox;
  const right = left + width;
  const bottom = top + height;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, width, height);
  ctx.clip();
  for (const p of refPositions(u, o)) {
    ctx.strokeStyle = p.l.current ? o.pal.err : o.pal.text2;
    ctx.lineWidth = (p.l.current ? 2 : 1.2) * r;
    ctx.setLineDash((p.l.current ? CURRENT_DASH : OTHER_DASH).map((d) => d * r));
    ctx.beginPath();
    ctx.moveTo(left, p.y);
    ctx.lineTo(right, p.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  const xv = volumePosition(u, o);
  if (xv !== null) {
    ctx.strokeStyle = o.pal.accent;
    ctx.lineWidth = 2 * r;
    ctx.beginPath();
    ctx.moveTo(xv, top);
    ctx.lineTo(xv, bottom);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Boven de reeksen: labels van de referentielijnen (rechts), het label van het huidige buffervolume en de overgangen
 * als stip met label. Labels die elkaar zouden overlappen schuiven op of worden weggelaten (de stip blijft).
 * u.bbox en valToPos(…, true) zijn in canvaspixels.
 */
function drawOver(u: uPlot, o: Overlay): void {
  const ctx = u.ctx;
  const r = pixelRatio();
  const { left, top, width, height } = u.bbox;
  const right = left + width;
  const bottom = top + height;
  const font = (weight: number): string => `${weight} ${Math.round(11 * r)}px system-ui, sans-serif`;
  const placed: Rect[] = [];
  const refs = refPositions(u, o);
  const xv = volumePosition(u, o);
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, width, height);
  ctx.clip();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // stippen van de overgangen (eerst hun plek reserveren, zodat geen label erover valt)
  const rad = 5 * r;
  const dots = o.transitions
    .map((t) => ({ t, x: u.valToPos(t.volumeM3, 'x', true), y: u.valToPos(t.limitKw, 'y', true) }))
    .filter((d) => d.x >= left - 1 && d.x <= right + 1 && d.y >= top - 1 && d.y <= bottom + 1)
    .sort((a, b) => a.x - b.x || a.y - b.y);
  const dotRects = dots.map((d) => ({
    x0: d.x - rad - 2 * r,
    y0: d.y - rad - 2 * r,
    x1: d.x + rad + 2 * r,
    y1: d.y + rad + 2 * r,
  }));

  const lineH = 14 * r;
  const free = (rect: Rect, avoidDots: boolean): boolean =>
    rect.x0 >= left &&
    rect.x1 <= right &&
    rect.y0 >= top &&
    rect.y1 <= bottom &&
    !placed.some((q) => overlaps(q, rect)) &&
    (!avoidDots || !dotRects.some((q) => overlaps(q, rect)));
  const labelRect = (tx: number, ty: number, w: number): Rect => ({
    x0: tx - 3 * r,
    y0: ty - 11 * r,
    x1: tx + w + 3 * r,
    y1: ty + 3 * r,
  });

  // budgetten ver boven de krommen (niet op de as): als label met pijl aan de bovenrand, rechts
  let offY = top + 12 * r;
  for (const l of o.lines.filter((q) => q.offScale)) {
    ctx.font = font(l.current ? 650 : 400);
    const color = l.current ? o.pal.err : o.pal.text2;
    const full = `↑ ${l.text}`;
    const text = ctx.measureText(full).width + 12 * r <= width ? full : `↑ ${l.short}`;
    const w = ctx.measureText(text).width;
    const tx = Math.max(left + 6 * r, right - 6 * r - w);
    const rect = labelRect(tx, offY, w);
    boxedText(ctx, text, tx, offY, rect, color, o.pal.surface);
    placed.push(rect);
    offY += lineH;
  }

  // labels van de referentielijnen: rechts boven de lijn; anders eronder, dan het korte label, dan links. Ze
  // ontwijken elkaar en de stippen van de overgangen; past niets, dan het korte label over een stip heen.
  for (const p of refs) {
    ctx.font = font(p.l.current ? 650 : 400);
    const color = p.l.current ? o.pal.err : o.pal.text2;
    const candidates: { text: string; tx: number; ty: number; w: number }[] = [];
    for (const side of ['right', 'left'] as const) {
      for (const text of [p.l.text, p.l.short]) {
        const w = ctx.measureText(text).width;
        const tx = side === 'right' ? right - 6 * r - w : left + 6 * r;
        for (const ty of [p.y - 4 * r, p.y + 13 * r]) candidates.push({ text, tx, ty, w });
      }
    }
    const pick =
      candidates.find((k) => free(labelRect(k.tx, k.ty, k.w), true)) ??
      candidates.find((k) => k.text === p.l.short && free(labelRect(k.tx, k.ty, k.w), false));
    if (!pick) continue;
    const rect = labelRect(pick.tx, pick.ty, pick.w);
    boxedText(ctx, pick.text, pick.tx, pick.ty, rect, color, o.pal.surface);
    placed.push(rect);
  }

  // label van het huidige buffervolume, bovenaan naast de lijn
  if (xv !== null) {
    const text = `huidig ${compact(o.volumeM3)} m³`;
    ctx.font = font(600);
    const w = ctx.measureText(text).width;
    const tx = xv + 5 * r + w + 3 * r <= right ? xv + 5 * r : xv - 5 * r - w;
    for (let k = 0, y = top + 12 * r; k < 8; k++, y += lineH) {
      const rect = { x0: tx - 3 * r, y0: y - 11 * r, x1: tx + w + 3 * r, y1: y + 3 * r };
      if (k < 7 && (placed.some((q) => overlaps(q, rect)) || dotRects.some((q) => overlaps(q, rect))))
        continue;
      boxedText(ctx, text, tx, y, rect, o.pal.accent, o.pal.surface);
      placed.push(rect);
      break;
    }
  }

  // stippen in de kleur van (de kleinste van) de bijbehorende batterijlijn(en); niet afgeknipt, zodat een stip op
  // V_max heel blijft
  ctx.restore();
  ctx.save();
  for (const d of dots) {
    ctx.beginPath();
    ctx.arc(d.x, d.y, rad, 0, 2 * Math.PI);
    ctx.fillStyle = o.colors[d.t.batteries[0]] ?? o.pal.text;
    ctx.fill();
    ctx.lineWidth = 2 * r;
    ctx.strokeStyle = o.pal.surface;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(d.x, d.y, rad + 1.6 * r, 0, 2 * Math.PI);
    ctx.lineWidth = 1.2 * r;
    ctx.strokeStyle = o.pal.text;
    ctx.stroke();
  }

  // labels van de stippen: rechtsboven, rechtsonder, linksboven, linksonder, erboven of eronder; anders weglaten
  ctx.font = font(400);
  dots.forEach((d, idx) => {
    const w = ctx.measureText(d.t.text).width;
    const gap = 9 * r;
    const candidates: [number, number][] = [
      [d.x + gap, d.y - 7 * r],
      [d.x + gap, d.y + 16 * r],
      [d.x - gap - w, d.y - 7 * r],
      [d.x - gap - w, d.y + 16 * r],
      [d.x - w / 2, d.y - 13 * r],
      [d.x - w / 2, d.y + 22 * r],
      [d.x - gap - w, d.y + 30 * r],
      [d.x - gap - w, d.y - 21 * r],
    ];
    for (const [tx, ty] of candidates) {
      const rect = { x0: tx - 3 * r, y0: ty - 11 * r, x1: tx + w + 3 * r, y1: ty + 3 * r };
      if (rect.x0 < left || rect.x1 > right || rect.y0 < top || rect.y1 > bottom) continue;
      if (placed.some((q) => overlaps(q, rect))) continue;
      if (dotRects.some((q, k) => k !== idx && overlaps(q, rect))) continue;
      boxedText(ctx, d.t.text, tx, ty, rect, o.pal.text, o.pal.surface);
      placed.push(rect);
      break;
    }
  });
  ctx.restore();
}

// ---------------------------------------------------------------- onderdelen

function Readout({
  m,
  idx,
  kwhPerM3,
  designLoadKw,
  netDigits,
}: {
  m: GridModel;
  idx: number | null;
  kwhPerM3: number;
  designLoadKw: number;
  netDigits: number;
}) {
  const coarse = usePointerCoarse();
  const row = idx !== null ? m.rows[idx] : null;
  if (!row) {
    return <div className={css.readout}>{coarse ? TEXT.readout.touch : TEXT.readout.mouse}</div>;
  }
  const hours = bufferHoursOfPeak(row.volumeM3, kwhPerM3, designLoadKw);
  return (
    <div className={css.readout}>
      <strong>{compact(row.volumeM3)} m³</strong> (≈ {fmt(hours, 1)} h piekvermogen) · benodigd WP-vermogen{' '}
      <strong>{fmt(row.nominalKw, 2)} kW</strong>
      {row.cells.map((c, j) => (
        <span key={j}>
          {' · '}
          {batteryName(c.capacityKwh)}: piek {fmt(c.pGridMaxKw, netDigits)} kW, overschrijding{' '}
          {fmt(c.exceedanceHours, 0)} uur/jaar, kleinste aansluiting{' '}
          <strong>{connectionText(c.smallest)}</strong>
        </span>
      ))}
    </div>
  );
}

function PointsTable({
  m,
  input,
  kwhPerM3,
  stepM3,
  netDigits,
  onPick,
}: {
  m: GridModel;
  input: PeakshavingInput;
  kwhPerM3: number;
  stepM3: number;
  netDigits: number;
  onPick: (v: number) => void;
}) {
  const currentKw = connectionPowerKw(input.grid);
  const currentText = connectionText({
    id: input.grid.connection,
    label: connectionLabel(input.grid),
    powerKw: currentKw,
  });
  const volume = input.buffer.volumeM3;
  const designLoadKw = input.building.designLoadKw;
  return (
    <details className={`${ui.acc} ${css.tableAcc}`}>
      <summary>Tabel met alle punten</summary>
      <div className={ui.tableWrap}>
        <table className={`${ui.table} ${css.table}`}>
          <caption className={css.caption}>
            P<sub>th,min</sub> = benodigd WP-vermogen (A7/W35) bij dat buffervolume; P<sub>net,max</sub> =
            piek aan de meter bij de huidige aansluiting. Kleinste aansluiting: groen = past binnen de huidige
            aansluiting ({currentText}), oranje = er is een grotere aansluiting nodig. Toereikend = hoogstens{' '}
            {fmt(input.grid.allowedExceedanceH, 0)} uur/jaar overschrijding.
          </caption>
          <thead>
            <tr>
              <th rowSpan={2} scope="col">
                Buffer [m³]
              </th>
              <th rowSpan={2} scope="col">
                Opslag [h piek]
              </th>
              <th rowSpan={2} scope="col">
                P<sub>th,min</sub> [kW]
              </th>
              {m.caps.map((cap, j) => (
                <th key={j} colSpan={3} scope="colgroup" className={css.groupHead}>
                  {batteryName(cap)}
                </th>
              ))}
            </tr>
            <tr className={css.subHead}>
              {m.caps.map((_, j) => (
                <Fragment key={j}>
                  <th scope="col">
                    P<sub>net,max</sub> [kW]
                  </th>
                  <th scope="col">Overschr. [uur/jaar]</th>
                  <th scope="col">Kleinste aansluiting</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.rows.map((row, i) => {
              const v = m.x[i];
              const current = Math.abs(v - volume) < stepM3 / 2;
              return (
                <tr
                  key={i}
                  className={current ? css.currentRow : undefined}
                  aria-current={current ? 'true' : undefined}
                >
                  <td>
                    <span className={css.volCell}>
                      {compact(v)}
                      <button
                        type="button"
                        className={css.pick}
                        onClick={() => onPick(v)}
                        aria-label={`Buffervolume instellen op ${compact(v)} m³`}
                        title="Dit buffervolume kiezen"
                      >
                        kies
                      </button>
                    </span>
                  </td>
                  <td>{fmt(bufferHoursOfPeak(v, kwhPerM3, designLoadKw), 1)}</td>
                  <td className={row ? undefined : css.pending}>{row ? fmt(row.nominalKw, 2) : '…'}</td>
                  {m.caps.map((_, j) => {
                    const c = row?.cells[j];
                    if (!c) {
                      return (
                        <Fragment key={j}>
                          <td className={css.pending}>…</td>
                          <td className={css.pending}>…</td>
                          <td className={css.pending}>…</td>
                        </Fragment>
                      );
                    }
                    const fits =
                      Number.isFinite(c.smallest.powerKw) &&
                      Number.isFinite(currentKw) &&
                      c.smallest.powerKw <= currentKw + 1e-9;
                    return (
                      <Fragment key={j}>
                        <td>{fmt(c.pGridMaxKw, netDigits)}</td>
                        <td>{fmt(c.exceedanceHours, 0)}</td>
                        <td className={fits ? ui.cellOk : ui.cellWarn}>{connectionText(c.smallest)}</td>
                      </Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Leeswijzer onder de korte lead, standaard ingeklapt: assen, budgetlijnen en stippen, en de batterijnuance. */
function HowToRead({ bufferMaxM3 }: { bufferMaxM3: number }) {
  return (
    <details className={css.howTo}>
      <summary>{TEXT.howToRead}</summary>
      <ul>
        <li>
          Van links naar rechts neemt het buffervolume toe, tot {`${compact(bufferMaxM3)}\u00a0m³`}; de
          bovenste as geeft hetzelfde volume in uren piekvermogen.
        </li>
        <li>
          Onderin (linker as) de piek aan de meter per batterijgrootte; bovenin (rechter as, oranje) het
          benodigde WP-vermogen.
        </li>
        <li>
          Gestippelde lijnen zijn de budgetten van de standaardaansluitingen. Ligt een lijn eronder, dan is
          die aansluiting toereikend; de stip markeert vanaf welk buffervolume.
        </li>
        <li>
          Met batterij ligt de piek vaak precies op het budget van de huidige aansluiting: de batterij
          gebruikt de ruimte tot dat budget om bij te laden.
        </li>
      </ul>
    </details>
  );
}

/** Instellingen waarvoor een raster is berekend (voor het tonen van een vorig raster tijdens een herberekening). */
interface GridContext {
  grid: GridSettings;
  designLoadKw: number;
  ranges: Ranges;
}

function SensitivityView({
  sens,
  print,
  frozen,
}: {
  sens: SensitivityState;
  print: boolean;
  /** vorig raster met de instellingen van toen: gedimd, zonder bediening */
  frozen?: GridContext;
}) {
  const liveRanges = useStore((st) => st.ranges);
  const input = useStore((st) => st.input);
  const update = useStore((st) => st.update);
  const ranges = frozen?.ranges ?? liveRanges;
  const dark = useDarkScheme();
  // `dark` als afhankelijkheid: bij een ander kleurschema de themakleuren opnieuw lezen
  const pal = useMemo(palette, [dark]);
  const [hover, setHover] = useState<number | null>(null);
  const plotRef = useRef<uPlot | null>(null);

  const m = useMemo(() => gridModel(sens, ranges), [sens, ranges]);
  const { connection, contractedKw, heatPumpShare } = frozen?.grid ?? input.grid;
  const designLoadKw = frozen?.designLoadKw ?? input.building.designLoadKw;
  // het buffervolume telt hier niet mee: alleen de verticale markering hangt ervan af
  const chart = useMemo(
    () => chartData(m, { connection, contractedKw, heatPumpShare }, designLoadKw, ranges, pal),
    [m, connection, contractedKw, heatPumpShare, designLoadKw, ranges, pal],
  );
  const volume = input.buffer.volumeM3;
  const overlay = useMemo<Overlay>(
    () => ({
      lines: chart.lines,
      transitions: chart.transitions,
      colors: chart.colors,
      volumeM3: volume,
      pal,
    }),
    [chart, volume, pal],
  );
  const hooks = useMemo<uPlot.Hooks.Arrays>(
    () => ({ drawClear: [(u: uPlot) => drawUnder(u, overlay)], draw: [(u: uPlot) => drawOver(u, overlay)] }),
    [overlay],
  );

  // de markering van het buffervolume staat niet in de data: bij een ander volume opnieuw tekenen
  useEffect(() => {
    plotRef.current?.redraw(false);
  }, [overlay]);

  const onReady = useCallback((u: uPlot) => {
    plotRef.current = u;
    // klikken kiest het buffervolume: geen sleep-zoom op deze grafiek
    if (u.cursor.drag) {
      u.cursor.drag.x = false;
      u.cursor.drag.y = false;
      u.cursor.drag.setScale = false;
    }
  }, []);

  const pick = useCallback(
    (v: number) => {
      const step = ranges.bufferStepM3 > 0 ? ranges.bufferStepM3 : 0.05;
      const snapped = Math.min(ranges.bufferMaxM3, Math.max(0, Math.round(v / step) * step));
      const volumeM3 = Number(snapped.toFixed(6));
      update((i) => ({ ...i, buffer: { ...i.buffer, volumeM3 } }));
    },
    [ranges, update],
  );

  const kwhPerM3 = ranges.kwhPerM3;
  const topFormat = useCallback(
    (v: number) => compact(Math.round(bufferHoursOfPeak(v, kwhPerM3, designLoadKw) * 10) / 10, 1),
    [kwhPerM3, designLoadKw],
  );
  const topAxis = useMemo(
    () => ({ label: 'Buffer in uren piekvermogen [h]', format: topFormat }),
    [topFormat],
  );
  const extras = useMemo<LegendExtra[]>(
    () => [...chart.extras, { label: `Huidig buffervolume (${compact(volume)} m³)`, color: pal.accent }],
    [chart.extras, volume, pal.accent],
  );
  const xFormat = useCallback((v: number) => compact(v, 3), []);
  const climate = useStore((st) => st.analysis?.climateShort);

  return (
    <>
      <UPlotChart
        data={chart.data}
        series={chart.series}
        xKind="custom"
        xFormat={xFormat}
        xLabel="Buffervolume [m³]"
        topAxis={topAxis}
        axes={[
          { scale: 'y', label: 'Piek aan de meter [kW el]' },
          { scale: 'th', label: 'Benodigd WP-vermogen [kW th]', side: 1, grid: false },
        ]}
        scales={chart.scales}
        hooks={hooks}
        legendExtras={extras}
        height={print ? PRINT_CHART_HEIGHT : CHART_HEIGHT}
        onCursor={setHover}
        onClickX={pick}
        onReady={onReady}
        ariaLabel="Gevoeligheid: piek aan de meter per batterijgrootte (linker as) en benodigd warmtepompvermogen (rechter as) als functie van het buffervolume, met de budgetten van de standaardaansluitingen als horizontale lijnen"
        exportName="gevoeligheid"
        exportTitle={`Gevoeligheid: piek aan de meter en benodigd WP-vermogen per buffervolume${climate ? ` — klimaatjaar ${climate}` : ''}`}
        exportLabel="Gevoeligheid"
        compactBelow={COMPACT_BELOW_PX}
      />
      {(chart.transitions.length > 0 || !print) && (
        // de overgangen ook als tekst (op een smalle grafiek vallen labels bij de stippen weg); altijd één regel,
        // zodat de hoogte niet verspringt als er een overgang bij komt of afvalt
        <p className={css.transitions}>
          <span className={css.transitionsHead}>Toereikend vanaf (stippen):</span>{' '}
          {chart.transitions.length > 0
            ? chart.transitions.map((t) => t.text).join(' · ')
            : 'geen overgang van een standaardaansluiting binnen dit bereik.'}
        </p>
      )}
      {!print && (
        <Readout
          m={m}
          idx={hover}
          kwhPerM3={kwhPerM3}
          designLoadKw={designLoadKw}
          netDigits={chart.netDigits}
        />
      )}
      {!print && (
        <PointsTable
          m={m}
          input={input}
          kwhPerM3={kwhPerM3}
          stepM3={ranges.bufferStepM3}
          netDigits={chart.netDigits}
          onPick={pick}
        />
      )}
    </>
  );
}

/** `print`: printversie zonder klikhint, voortgang, uitleesregel en tabel, en met een kortere toelichting. */
export function SensitivityChart({ print = false }: { print?: boolean }) {
  const sens = useStore((st) => st.sensitivity);
  const ranges = useStore((st) => st.ranges);
  const grid = useStore((st) => st.input.grid);
  const designLoadKw = useStore((st) => st.input.building.designLoadKw);
  const retry = useStore((st) => st.retry);
  const coarse = usePointerCoarse();
  const n = sens && sens.total > 0 ? sens.total : SENSITIVITY_VOLUME_FRACTIONS.length;
  const computed = sens ? sens.rows.filter((r) => r !== null && r !== undefined).length : 0;
  const error = sens?.error ?? null;
  const done = !!sens && sens.done;
  const busy = !!sens && !done;

  // laatste volledige raster met de instellingen van toen: blijft (gedimd) staan tot de eerste nieuwe rij er is
  const last = useRef<{ sens: SensitivityState; ctx: GridContext } | null>(null);
  if (sens && done && !error && computed > 0 && computed === n && last.current?.sens !== sens) {
    last.current = { sens, ctx: { grid: { ...grid }, designLoadKw, ranges } };
  }
  const stale = busy && computed === 0 && error === null && last.current !== null ? last.current : null;
  const view: { sens: SensitivityState; frozen?: GridContext } | null =
    sens && computed > 0 ? { sens } : stale ? { sens: stale.sens, frozen: stale.ctx } : null;
  const height = print ? PRINT_CHART_HEIGHT : CHART_HEIGHT;

  return (
    <div className={`${css.box} ${css.chart}`}>
      <h3>Piek aan de meter en benodigd WP-vermogen per buffervolume</h3>
      {print ? (
        <p className={`${ui.hint} ${css.lead}`}>
          Ligt een lijn onder een gestippelde lijn, dan is die aansluiting toereikend; de stip markeert vanaf
          welk buffervolume (tot {compact(ranges.bufferMaxM3)} m³).
        </p>
      ) : (
        <>
          <p className={`${ui.hint} ${css.lead}`}>{TEXT.lead}</p>
          <HowToRead bufferMaxM3={ranges.bufferMaxM3} />
        </>
      )}
      {!print && (
        // vaste hoogte: de voortgang en de klikhint staan op dezelfde plek, dus niets verspringt
        <div className={css.statusRow}>
          <p className={`${css.clickHint} ${busy ? css.off : ''}`}>
            {coarse ? TEXT.clickHint.touch : TEXT.clickHint.mouse}
          </p>
          <div className={`${css.progress} ${busy ? '' : css.off}`}>
            <progress max={n} value={computed} aria-label="Voortgang gevoeligheidsberekening" />
            <span>
              {stale ? 'Herberekenen: ' : ''}
              {fmt(computed, 0)} van {fmt(n, 0)} buffervolumes berekend…
            </span>
          </div>
        </div>
      )}
      {error !== null && (
        <p className={css.error} role="status">
          {computed > 0
            ? `De gevoeligheid is niet volledig berekend: ${error}. De grafiek toont de ${fmt(computed, 0)} van ${fmt(n, 0)} buffervolumes die wel klaar zijn.`
            : `De gevoeligheid kon niet worden berekend: ${error}.`}
          {!print && (
            <>
              {' '}
              <button type="button" className={ui.btnLink} onClick={retry}>
                Opnieuw proberen
              </button>
            </>
          )}
        </p>
      )}
      {view ? (
        // zelfde plek in de boom voor het vorige en het nieuwe raster: geen nieuwe grafiek, dus geen verspringen
        <div className={view.frozen ? css.stale : undefined} aria-busy={view.frozen ? true : undefined}>
          <SensitivityView sens={view.sens} print={print} frozen={view.frozen} />
        </div>
      ) : error === null ? (
        <p className={css.placeholder} style={{ minHeight: height + 120 }}>
          {TEXT.pending}
        </p>
      ) : null}
    </div>
  );
}
