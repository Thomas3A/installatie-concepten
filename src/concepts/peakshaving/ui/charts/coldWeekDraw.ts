// Tekenhulpen voor de koude-weekpanelen: arcering van uren en weekenden, overschrijding, markeringen.
// Alles tekent via uPlot-haken (draw/drawClear) op het canvas; u.bbox en valToPos(…, true) zijn in canvaspixels.
import type uPlot from 'uplot';

/** Kleur met doorzichtigheid; accepteert #rgb en #rrggbb, laat andere notaties ongemoeid. */
export function withAlpha(color: string, alpha: number): string {
  const c = color.trim();
  const m3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(c);
  const m6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c);
  let rgb: number[] | null = null;
  if (m6) rgb = [m6[1], m6[2], m6[3]].map((h) => parseInt(h, 16));
  else if (m3) rgb = [m3[1], m3[2], m3[3]].map((h) => parseInt(h + h, 16));
  if (!rgb) return c;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

/** Verhouding canvaspixels / CSS-pixels. */
export function pixelRatio(): number {
  return typeof window !== 'undefined' && window.devicePixelRatio ? window.devicePixelRatio : 1;
}

/** Zichtbare uurindices [i0, i1] (met één uur marge) binnen [0, n − 1]. */
export function visibleHours(u: uPlot, n: number): [number, number] {
  const min = u.scales.x.min ?? 0;
  const max = u.scales.x.max ?? n - 1;
  return [Math.max(0, Math.floor(min) - 1), Math.min(n - 1, Math.ceil(max) + 1)];
}

function clipToPlot(u: uPlot): void {
  const { left, top, width, height } = u.bbox;
  u.ctx.beginPath();
  u.ctx.rect(left, top, width, height);
  u.ctx.clip();
}

/** Vul uur-intervallen [t, t + 1) waarvoor `mask(t)` waar is, als verticale banden over de hele plothoogte. */
export function shadeHours(u: uPlot, n: number, mask: (t: number) => boolean, color: string): void {
  const [i0, i1] = visibleHours(u, n);
  const { top, height } = u.bbox;
  const ctx = u.ctx;
  ctx.save();
  clipToPlot(u);
  ctx.fillStyle = color;
  let t = i0;
  while (t <= i1) {
    if (!mask(t)) {
      t++;
      continue;
    }
    let e = t;
    while (e + 1 <= i1 && mask(e + 1)) e++;
    const x0 = u.valToPos(t, 'x', true);
    const x1 = u.valToPos(e + 1, 'x', true);
    ctx.fillRect(x0, top, x1 - x0, height);
    t = e + 1;
  }
  ctx.restore();
}

/** Weekdag (ISO, 1 = maandag) van dag `d` van het jaar. */
export function weekdayOfDay(d: number, startWeekday: number): number {
  return ((startWeekday - 1 + d) % 7) + 1;
}

/** Arceer zaterdag en zondag. */
export function shadeWeekends(u: uPlot, n: number, startWeekday: number, color: string): void {
  shadeHours(u, n, (t) => weekdayOfDay(Math.floor(t / 24), startWeekday) >= 6, color);
}

/**
 * Vlak tussen een lijn (`values`, lineair tussen de uurpunten) en een horizontale grens waar de lijn erboven ligt,
 * met de snijpunten geïnterpoleerd.
 */
export function shadeAbove(
  u: uPlot,
  values: ArrayLike<number>,
  limit: number,
  scale: string,
  color: string,
): void {
  if (!Number.isFinite(limit)) return;
  const n = values.length;
  const [i0, i1] = visibleHours(u, n);
  const yL = u.valToPos(limit, scale, true);
  const ctx = u.ctx;
  ctx.save();
  clipToPlot(u);
  ctx.fillStyle = color;
  ctx.beginPath();
  let open = false;
  let lastX = 0;
  for (let t = i0; t <= i1; t++) {
    const a = values[t] - limit;
    const x = u.valToPos(t, 'x', true);
    if (a > 0) {
      if (!open) {
        const prev = t > i0 ? values[t - 1] - limit : a;
        const xs = prev <= 0 ? u.valToPos(t - 1 + -prev / (a - prev), 'x', true) : x;
        ctx.moveTo(xs, yL);
        open = true;
      }
      ctx.lineTo(x, u.valToPos(values[t], scale, true));
      lastX = x;
    } else if (open) {
      const prev = values[t - 1] - limit;
      const xc = u.valToPos(t - 1 + prev / (prev - a), 'x', true);
      ctx.lineTo(xc, yL);
      ctx.closePath();
      open = false;
    }
  }
  if (open) {
    ctx.lineTo(lastX, yL);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}

/** Diagonale arcering van het vlak tussen een (negatieve) reeks en de nullijn. */
export function hatchToZero(u: uPlot, values: ArrayLike<number>, scale: string, color: string): void {
  const n = values.length;
  const [i0, i1] = visibleHours(u, n);
  let any = false;
  for (let t = i0; t <= i1 && !any; t++) any = values[t] < -1e-9;
  if (!any) return;
  const ctx = u.ctx;
  const pr = pixelRatio();
  const y0 = u.valToPos(0, scale, true);
  const area = new Path2D();
  area.moveTo(u.valToPos(i0, 'x', true), y0);
  for (let t = i0; t <= i1; t++) area.lineTo(u.valToPos(t, 'x', true), u.valToPos(values[t], scale, true));
  area.lineTo(u.valToPos(i1, 'x', true), y0);
  area.closePath();
  const { left, top, width, height } = u.bbox;
  ctx.save();
  clipToPlot(u);
  ctx.clip(area);
  ctx.strokeStyle = color;
  ctx.lineWidth = pr;
  ctx.setLineDash([]);
  ctx.beginPath();
  const step = 5 * pr;
  for (let x = left - height; x < left + width; x += step) {
    ctx.moveTo(x, top + height);
    ctx.lineTo(x + height, top);
  }
  ctx.stroke();
  ctx.restore();
}

/** Korte blokjes onderin de plot (tussen twee waarden op `scale`) voor uren waarin `mask(t)` waar is. */
export function markHours(
  u: uPlot,
  n: number,
  mask: (t: number) => boolean,
  scale: string,
  yFrom: number,
  yTo: number,
  color: string,
): void {
  markHoursPx(u, n, mask, u.valToPos(yFrom, scale, true), u.valToPos(yTo, scale, true), color);
}

/** Korte blokjes tegen de onderrand van de plot (vaste hoogte in CSS-pixels) voor uren waarin `mask(t)` waar is. */
export function markHoursAtBottom(
  u: uPlot,
  n: number,
  mask: (t: number) => boolean,
  heightCss: number,
  color: string,
): void {
  const pr = pixelRatio();
  const yBottom = u.bbox.top + u.bbox.height;
  const yTop = yBottom - heightCss * pr;
  markHoursPx(u, n, mask, yTop, yBottom, color);
}

function markHoursPx(
  u: uPlot,
  n: number,
  mask: (t: number) => boolean,
  ya: number,
  yb: number,
  color: string,
): void {
  const [i0, i1] = visibleHours(u, n);
  const ctx = u.ctx;
  const pr = pixelRatio();
  ctx.save();
  clipToPlot(u);
  ctx.fillStyle = color;
  let t = i0;
  while (t <= i1) {
    if (!mask(t)) {
      t++;
      continue;
    }
    let e = t;
    while (e + 1 <= i1 && mask(e + 1)) e++;
    const x0 = u.valToPos(t, 'x', true);
    const x1 = u.valToPos(e + 1, 'x', true);
    // minstens 2 px breed, zodat één uur ook bij een breed venster zichtbaar blijft
    const w = Math.max(x1 - x0, 2 * pr);
    ctx.fillRect(x0, Math.min(ya, yb), w, Math.abs(yb - ya));
    t = e + 1;
  }
  ctx.restore();
}

/** Verticale lijn over de hele plothoogte op x-waarde `x`. */
export function verticalLine(u: uPlot, x: number, color: string, widthCss = 2): void {
  const min = u.scales.x.min ?? -Infinity;
  const max = u.scales.x.max ?? Infinity;
  if (x < min || x > max) return;
  const pr = pixelRatio();
  const px = Math.round(u.valToPos(x, 'x', true));
  const { top, height } = u.bbox;
  const ctx = u.ctx;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = widthCss * pr;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(px, top);
  ctx.lineTo(px, top + height);
  ctx.stroke();
  // klein driehoekje bovenaan als handvat-aanduiding
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(px - 5 * pr, top);
  ctx.lineTo(px + 5 * pr, top);
  ctx.lineTo(px, top + 6 * pr);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Tickposities op hele uren: de kleinste stap (uit vaste reeks) waarbij de labels minstens `minPx` uit elkaar staan. */
const TICK_STEPS = [1, 2, 3, 6, 12, 24, 48, 72, 168, 336, 720, 1440];

export function hourSplits(min: number, max: number, plotWidthCss: number, minPx = 58): number[] {
  const span = Math.max(max - min, 1);
  const pxPerHour = Math.max(plotWidthCss, 50) / span;
  const step = TICK_STEPS.find((s) => s * pxPerHour >= minPx) ?? TICK_STEPS[TICK_STEPS.length - 1];
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(v);
  return out;
}
