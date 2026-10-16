// Tabblad Gevoeligheid (spec §7.3) — de kerngrafiek: piek aan de meter per batterijgrootte en het benodigde
// WP-vermogen als functie van het buffervolume, met de budgetten van de standaardaansluitingen als referentielijnen.
// Het raster komt rij voor rij uit de Web Worker; de grafiek tekent wat er al is.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type uPlot from 'uplot';
import { fmt } from '../../../../core/format';
import { cssColor, UPlotChart, type ChartSeries, type LegendExtra } from '../../../../ui/charts/UPlotChart';
import ui from '../../../../ui/ui.module.css';
import { CONNECTIONS, LARGE_CONNECTION_ID, type ConnectionDef } from '../../data/connections';
import { connectionLabel, connectionPowerKw, limitFromConnection } from '../../model/grid';
import { connectionText } from '../../model/kpis';
import { bufferHoursOfPeak, type Ranges } from '../../model/ranges';
import {
  SENSITIVITY_BATTERY_FRACTIONS,
  SENSITIVITY_VOLUME_FRACTIONS,
  type SensitivityRow,
} from '../../model/sizing';
import type { PeakshavingInput } from '../../model/types';
import { useStore, type SensitivityState } from '../../store';
import { pixelRatio } from './coldWeekDraw';
import css from './SensitivityChart.module.css';

// vaste middentint die in het lichte én donkere thema leesbaar is (zelfde oranje als de buffer in de andere tabbladen)
const HEAT_PUMP_COLOR = '#e8892b';
const CURRENT_DASH = [7, 4];
const OTHER_DASH = [3, 3];

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

/** Getal met zo weinig decimalen als nodig (hoogstens `maxDigits`): 0; 0,2; 0,25; 7,5. */
function compact(v: number, maxDigits = 2): string {
  for (let d = 0; d < maxDigits; d++) {
    const k = 10 ** d;
    if (Math.abs(Math.round(v * k) - v * k) < 1e-6) return fmt(v, d);
  }
  return fmt(v, maxDigits);
}

const batteryName = (kwh: number): string => (kwh > 0 ? `batterij ${compact(kwh)} kWh` : 'zonder batterij');

/** Batterijen van een overgang in één korte tekst: "zonder batterij", "batterij 15 / 30 kWh". */
function batteriesText(indexes: number[], caps: number[]): string {
  const none = indexes.some((j) => !(caps[j] > 0));
  const sizes = indexes.filter((j) => caps[j] > 0).map((j) => compact(caps[j]));
  const parts: string[] = [];
  if (none) parts.push('zonder batterij');
  if (sizes.length > 0) parts.push(`batterij ${sizes.join(' / ')} kWh`);
  return parts.join(' en ');
}

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

interface GridModel {
  /** aantal buffervolumes (13) */
  n: number;
  /** aantal berekende rijen */
  computed: number;
  /** buffervolumes [m³]; nog niet berekende rijen uit de vaste fracties van V_max */
  x: number[];
  /** batterijcapaciteiten [kWh], oplopend */
  caps: number[];
  rows: (SensitivityRow | null)[];
}

function gridModel(sens: SensitivityState, ranges: Ranges): GridModel {
  const n = sens.total > 0 ? sens.total : SENSITIVITY_VOLUME_FRACTIONS.length;
  const rows = Array.from({ length: n }, (_, i) => sens.rows[i] ?? null);
  const x = rows.map(
    (r, i) => r?.volumeM3 ?? (SENSITIVITY_VOLUME_FRACTIONS[i] ?? i / Math.max(1, n - 1)) * ranges.bufferMaxM3,
  );
  const first = rows.find((r): r is SensitivityRow => r !== null);
  const caps = first
    ? first.cells.map((c) => c.capacityKwh)
    : SENSITIVITY_BATTERY_FRACTIONS.map((f) => f * ranges.batteryMaxKwh);
  return { n, computed: rows.filter((r) => r !== null).length, x, caps, rows };
}

/** Overgang: vanaf dit buffervolume is deze aansluiting toereikend voor deze batterij(en). */
interface Transition {
  conn: ConnectionDef;
  limitKw: number;
  volumeM3: number;
  /** batterij-indexen (oplopend) */
  batteries: number[];
  text: string;
}

/** Past de kleinste aansluiting van cel j binnen aansluiting c? (grootverbruik telt niet als passend) */
function fitsConnection(row: SensitivityRow, j: number, c: ConnectionDef): boolean {
  const s = row.cells[j]?.smallest;
  return !!s && s.id !== LARGE_CONNECTION_ID && Number.isFinite(s.powerKw) && s.powerKw <= c.powerKw + 1e-9;
}

/**
 * Per batterijlijn en per standaardaansluiting het eerste buffervolume V > 0 vanaf waar die aansluiting toereikend is
 * (en bij de volgende berekende punten blijft); alleen echte overgangen, dus niet als de aansluiting bij V = 0 al
 * volstaat. Overgangen op hetzelfde punt worden samengevoegd.
 */
function transitionsOf(m: GridModel, share: number): Transition[] {
  const r0 = m.rows[0];
  if (!r0) return [];
  const later: number[] = [];
  m.rows.forEach((r, i) => {
    if (i > 0 && r) later.push(i);
  });
  const found = new Map<string, Omit<Transition, 'text'>>();
  for (let j = 0; j < m.caps.length; j++) {
    for (const c of CONNECTIONS) {
      if (fitsConnection(r0, j, c)) continue;
      const fits = (i: number): boolean => fitsConnection(m.rows[i] as SensitivityRow, j, c);
      // begin van de aaneengesloten reeks passende punten aan het eind; anders het eerste passende punt
      let first = -1;
      for (let k = later.length - 1; k >= 0 && fits(later[k]); k--) first = later[k];
      if (first < 0) first = later.find(fits) ?? -1;
      if (first < 0) continue;
      const limitKw = limitFromConnection(c.powerKw, share);
      if (!Number.isFinite(limitKw)) continue;
      const key = `${c.id}@${first}`;
      const t = found.get(key);
      if (t) t.batteries.push(j);
      else
        found.set(key, {
          conn: c,
          limitKw,
          volumeM3: (m.rows[first] as SensitivityRow).volumeM3,
          batteries: [j],
        });
    }
  }
  return [...found.values()].map((t) => ({
    ...t,
    text: `${t.conn.label} vanaf ${fmt(t.volumeM3, 2)} m³ (${batteriesText(t.batteries, m.caps)})`,
  }));
}

interface RefLine {
  limitKw: number;
  text: string;
  current: boolean;
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
  const transitions = transitionsOf(m, share);

  // relevant bereik voor de referentielijnen: tot 1,15 × hoogste meterpiek, minstens het huidige budget en de
  // budgetten met een overgang
  const relevantTop = niceCeil(
    Math.max(
      nets.length > 0 ? 1.15 * Math.max(...nets) : 0,
      Number.isFinite(curLimit) ? 1.1 * curLimit : 0,
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
    lines.push({
      limitKw,
      current,
      text: `${current ? 'huidig: ' : ''}${c.label} · ${pct} = ${fmt(limitKw, 1)} kW`,
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
    });
  }

  // Twee assen in één vlak: de elektrische lijnen (meterpiek en budgetten) in de onderste helft, het thermische
  // vermogen (WP en gebouw) in de bovenste strook, zodat de lijnen van beide assen elkaar niet bedekken.
  const elec = [...nets, ...lines.map((l) => l.limitKw)];
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
      label: 'Benodigd WP-vermogen (P_th,min)',
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
    extras.push({ label: 'Budget huidige aansluiting (P_limiet)', color: pal.err, dash: CURRENT_DASH });
  if (lines.some((l) => !l.current)) {
    extras.push({
      label: `Budget andere standaardaansluitingen (${pct})`,
      color: pal.text2,
      dash: OTHER_DASH,
    });
  }
  if (transitions.length > 0) {
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

  // labels van de referentielijnen: rechts boven de lijn, schuiven omlaag als ze elkaar raken
  const lineH = 14 * r;
  const xr = right - 6 * r;
  let prev = -Infinity;
  for (const p of refs) {
    ctx.font = font(p.l.current ? 650 : 400);
    const w = ctx.measureText(p.l.text).width;
    const y = Math.max(p.y - 4 * r, top + 12 * r, prev + lineH);
    prev = y;
    const rect = { x0: xr - w - 3 * r, y0: y - 11 * r, x1: xr + 3 * r, y1: y + 3 * r };
    boxedText(ctx, p.l.text, xr - w, y, rect, p.l.current ? o.pal.err : o.pal.text2, o.pal.surface);
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
  const row = idx !== null ? m.rows[idx] : null;
  if (!row) {
    return (
      <div className={css.readout}>
        Beweeg over de grafiek voor de uren overschrijding en de kleinste passende aansluiting per
        batterijgrootte bij dat buffervolume.
      </div>
    );
  }
  const hours = bufferHoursOfPeak(row.volumeM3, kwhPerM3, designLoadKw);
  return (
    <div className={css.readout}>
      <strong>{compact(row.volumeM3)} m³</strong> (≈ {fmt(hours, 1)} h piekvermogen) · benodigd WP-vermogen{' '}
      <strong>{fmt(row.nominalKw, 2)} kW</strong>
      {row.cells.map((c, j) => (
        <span key={j}>
          {' · '}
          {batteryName(c.capacityKwh)}: piek {fmt(c.pGridMaxKw, netDigits)} kW, {fmt(c.exceedanceHours, 0)} h
          overschrijding, kleinste aansluiting <strong>{connectionText(c.smallest)}</strong>
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
            {fmt(input.grid.allowedExceedanceH, 0)} h overschrijding per jaar.
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
                  <th scope="col">Overschr. [h]</th>
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

function SensitivityView({ sens }: { sens: SensitivityState }) {
  const ranges = useStore((st) => st.ranges);
  const input = useStore((st) => st.input);
  const update = useStore((st) => st.update);
  const dark = useDarkScheme();
  // `dark` als afhankelijkheid: bij een ander kleurschema de themakleuren opnieuw lezen
  const pal = useMemo(palette, [dark]);
  const [hover, setHover] = useState<number | null>(null);
  const plotRef = useRef<uPlot | null>(null);

  const m = useMemo(() => gridModel(sens, ranges), [sens, ranges]);
  const { connection, contractedKw, heatPumpShare } = input.grid;
  const designLoadKw = input.building.designLoadKw;
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
        height={360}
        onCursor={setHover}
        onClickX={pick}
        onReady={onReady}
        ariaLabel="Gevoeligheid: piek aan de meter per batterijgrootte (linker as) en benodigd warmtepompvermogen (rechter as) als functie van het buffervolume, met de budgetten van de standaardaansluitingen als horizontale lijnen"
        exportName="gevoeligheid"
      />
      <Readout
        m={m}
        idx={hover}
        kwhPerM3={kwhPerM3}
        designLoadKw={designLoadKw}
        netDigits={chart.netDigits}
      />
      <PointsTable
        m={m}
        input={input}
        kwhPerM3={kwhPerM3}
        stepM3={ranges.bufferStepM3}
        netDigits={chart.netDigits}
        onPick={pick}
      />
    </>
  );
}

export function SensitivityChart() {
  const sens = useStore((st) => st.sensitivity);
  const ranges = useStore((st) => st.ranges);
  const n = sens && sens.total > 0 ? sens.total : SENSITIVITY_VOLUME_FRACTIONS.length;
  const computed = sens ? sens.rows.filter((r) => r !== null && r !== undefined).length : 0;
  const done = !!sens && sens.done;

  return (
    <div className={`${css.box} ${css.chart}`}>
      <h3>Piek aan de meter en benodigd WP-vermogen per buffervolume</h3>
      <p className={`${ui.hint} ${css.lead}`}>
        Van links naar rechts neemt het buffervolume toe (tot {compact(ranges.bufferMaxM3)} m³): waar de
        lijnen vlak worden (plateau) helpt meer buffer niet meer, en ligt een lijn onder een gestippelde lijn,
        dan is die aansluiting toereikend — de stip markeert vanaf welk buffervolume. Met batterij ligt de
        piek vaak precies op het budget van de huidige aansluiting, omdat de batterij de ruimte tot dat budget
        gebruikt om bij te laden.
      </p>
      <p className={css.clickHint}>Klik in de grafiek om het buffervolume te kiezen.</p>
      {!done && (
        <div className={css.progress}>
          <progress max={n} value={computed} aria-label="Voortgang gevoeligheidsberekening" />
          <span>
            {fmt(computed, 0)} van {fmt(n, 0)} buffervolumes berekend…
          </span>
        </div>
      )}
      {sens && computed > 0 ? (
        <SensitivityView sens={sens} />
      ) : (
        <p className={css.placeholder}>
          De gevoeligheid wordt berekend: per buffervolume eerst het benodigde WP-vermogen, daarna per
          batterijgrootte de piek aan de meter en de kleinste passende aansluiting. De grafiek verschijnt
          zodra het eerste punt klaar is.
        </p>
      )}
    </div>
  );
}
