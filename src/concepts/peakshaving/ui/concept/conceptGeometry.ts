// Geometrie en afgeleide uurwaarden van het conceptschema (spec §8). Pure functies zonder React of DOM:
// vaste posities in het viewBox-assenstelsel, de schaal van de meterkastbalk en de vermogens per leiding/kabel.
import type { Analysis } from '../../model/analysis';
import { batteryUsableEnergy } from '../../model/battery';
import { COMFORT_MARGIN_K, gainsAt, tankEnergy } from '../../model/building';
import { wrapHour } from '../../model/climate';
import { bufferChargeTemperature, supplyTemperature } from '../../model/heatPump';

/** Afmetingen van het viewBox [eenheden]; het schema schaalt mee met de containerbreedte. */
export const VIEW_W = 900;
export const VIEW_H = 560;

/**
 * Aanvoertemperaturen voor de kleurschaal van de buitenunit: 25 °C (laagste stooklijn LT) → koud,
 * 55 °C (ontwerpaanvoer HT) → warm. Zo gebruiken de stooklijnen van LT, MT en HT de hele schaal.
 */
export const SUPPLY_COLOR_MIN_C = 25;
export const SUPPLY_COLOR_MAX_C = 55;

/** Deeltjessnelheid bij het referentievermogen [eenheden/s]. */
export const FLOW_SPEED_MAX = 64;
/** Onder dit vermogen staat een stroom stil [kW]. */
export const FLOW_EPS_KW = 0.005;

export interface Pt {
  x: number;
  y: number;
}

// ---------------------------------------------------------------- vaste posities

/** Meterkast: paneel, balk en rijen. */
export const METER = {
  x: 106,
  y: 8,
  w: 786,
  h: 120,
  titleY: 31,
  bracketTextY: 51,
  bracketY: 57,
  barX0: 124,
  barX1: 874,
  barY: 64,
  barH: 26,
  legendY: 115,
  legendSlots: [124, 330, 560] as const,
} as const;

/** Netsymbool (mast) links van de meterkast. */
export const NET = { cx: 36, cableY: 52 } as const;

/** Kabelknooppunt van de WP-groep achter de meter. */
export const JUNCTION: Pt = { x: 124, y: 168 };

/** Batterij (liggend blok) met tekst rechts ervan. */
export const BATTERY = { x: 292, y: 150, w: 140, h: 36, textX: 452 } as const;

/** Buitenunit van de lucht/water-warmtepomp. */
export const HEAT_PUMP = {
  x: 16,
  y: 200,
  w: 220,
  h: 140,
  fanCx: 86,
  fanCy: 270,
  fanR: 54,
  splitX: 148,
  outY: 236,
  inY: 310,
  textY0: 364,
  lineH: 22,
} as const;

/** Verzamelleidingen: aanvoer boven, retour onder; de retour loopt via een stijgleiding de buitenunit in. */
export const SUPPLY_Y = 236;
export const RETURN_Y = 500;
export const RISER_X = 256;

/** Vaten (buffer en boiler) staan tussen aanvoer en retour. */
export const TANK_TOP = 272;
export const TANK_BOTTOM = 464;
export const TANK_LABEL_Y = [524, 544] as const;
export const BUFFER_W = 96;
export const BOILER_W = 56;

/** Gebouw rechts; de leidingen komen door de linkergevel binnen. */
export const BUILDING = {
  x: 616,
  w: 270,
  ground: 548,
  houseTop: 226,
  roof: [
    { x: 604, y: 230 },
    { x: 751, y: 154 },
    { x: 898, y: 230 },
  ] as const,
  officeTop: 150,
  officeFloorH: 66,
  emitterX: 652,
  radiatorTop: 330,
  radiatorBottom: 420,
  heaterY: 262,
  card: { x: 690, y: 254, w: 184, h: 214 },
} as const;

/**
 * Woongebouw (meerdere woningen op één warmtepomp): dezelfde omtrek als het kantoor (BUILDING.officeTop tot het
 * maaiveld), maar als portiekflat: lagere woonlagen met per laag twee woningen (raam, balkondeur en balkon) aan
 * weerszijden van het trappenhuis, op een hogere plint met de entree onder het trappenhuis. De gevel staat
 * rechts van de afgifte, in de breedte van de infokaart.
 */
export const APARTMENT = {
  /** hoogte van een woonlaag */
  floorH: 50,
  /** woonlagen boven de plint */
  floors: 6,
  /** linkerkant van de woning links en rechts van het trappenhuis, en de breedte van een woning */
  bayX: [692, 802] as const,
  bayW: 80,
  /** raam van het trappenhuis */
  stairX: 779,
  stairW: 16,
} as const;

/** Bovenkant van de plint (onder de woonlagen). */
export const APARTMENT_PLINTH_Y = BUILDING.officeTop + APARTMENT.floors * APARTMENT.floorH;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Gevel van het woongebouw: alleen de delen die naast de infokaart zichtbaar zijn. */
export interface ApartmentFacade {
  /** woonlagen (0 = bovenste) die boven de infokaart vallen */
  floors: number[];
  windows: Rect[];
  doors: Rect[];
  /** balkonhekken voor de balkondeuren */
  balconies: Rect[];
  /** balkonplaten onder de hekken */
  slabs: Rect[];
  /** ramen van het trappenhuis */
  stairs: Rect[];
  /** ramen in de plint */
  plinthWindows: Rect[];
  entrance: Rect;
  canopy: Rect;
}

/** Rechthoeken overlappen (met marge). */
export function rectsOverlap(a: Rect, b: Rect, margin = 0): boolean {
  return (
    a.x < b.x + b.w + margin &&
    a.x + a.w > b.x - margin &&
    a.y < b.y + b.h + margin &&
    a.y + a.h > b.y - margin
  );
}

/** Gevelindeling van het woongebouw; woonlagen die (deels) achter de infokaart vallen, worden weggelaten. */
export function apartmentFacade(): ApartmentFacade {
  const ap = APARTMENT;
  const card: Rect = BUILDING.card;
  const [left, right] = ap.bayX;
  const entranceX = ap.stairX + ap.stairW / 2 - 15;
  const out: ApartmentFacade = {
    floors: [],
    windows: [],
    doors: [],
    balconies: [],
    slabs: [],
    stairs: [],
    plinthWindows: [
      { x: left + 16, y: 500, w: 44, h: 26 },
      { x: right + 20, y: 500, w: 44, h: 26 },
    ],
    entrance: { x: entranceX, y: 500, w: 30, h: BUILDING.ground - 500 },
    canopy: { x: entranceX - 10, y: 492, w: 50, h: 5 },
  };
  for (let k = 0; k < ap.floors; k++) {
    const y0 = BUILDING.officeTop + k * ap.floorH;
    // hele woonlaag samen: woningen, balkons en trappenhuis
    const band: Rect = { x: left, y: y0 + 5, w: right + ap.bayW - left, h: 44 };
    if (rectsOverlap(band, card, 4)) continue;
    out.floors.push(k);
    // gespiegeld: de balkons aan de buitenkant, de ramen naast het trappenhuis
    out.balconies.push(
      { x: left + 2, y: y0 + 31, w: 32, h: 15 },
      { x: right + 46, y: y0 + 31, w: 32, h: 15 },
    );
    out.slabs.push({ x: left, y: y0 + 46, w: 36, h: 3 }, { x: right + 44, y: y0 + 46, w: 36, h: 3 });
    out.doors.push({ x: left + 10, y: y0 + 7, w: 16, h: 39 }, { x: right + 54, y: y0 + 7, w: 16, h: 39 });
    out.windows.push({ x: left + 44, y: y0 + 9, w: 30, h: 22 }, { x: right + 6, y: y0 + 9, w: 30, h: 22 });
    out.stairs.push({ x: ap.stairX, y: y0 + 5, w: ap.stairW, h: 38 });
  }
  return out;
}

/** Legenda van de leidingen linksonder. */
export const PIPE_LEGEND = { x: 16, y0: 480, lineH: 22 } as const;

export interface ConceptLayout {
  hasDhw: boolean;
  hasBuffer: boolean;
  hasBattery: boolean;
  /** middellijn van de boiler (NaN zonder tapwater) */
  boilerX: number;
  /** middellijn van het buffervat */
  bufferX: number;
}

/** Posities die alleen van de configuratie afhangen (boiler en buffer schuiven op als er geen boiler is). */
export function conceptLayout(hasDhw: boolean, hasBuffer: boolean, hasBattery: boolean): ConceptLayout {
  return {
    hasDhw,
    hasBuffer,
    hasBattery,
    boilerX: hasDhw ? 340 : NaN,
    bufferX: hasDhw ? 490 : 430,
  };
}

// ---------------------------------------------------------------- polylijnen

/** SVG-pad door een reeks punten. */
export function polyPath(pts: readonly Pt[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${round1(p.x)} ${round1(p.y)}`).join(' ');
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Lengte van een polylijn. */
export function polyLength(pts: readonly Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return s;
}

/** Punt en richting [graden] op een fractie van de lengte van een polylijn. */
export function pointAlong(pts: readonly Pt[], frac: number): { x: number; y: number; angle: number } {
  const total = polyLength(pts);
  let target = Math.min(Math.max(frac, 0), 1) * total;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (target <= len || i === pts.length - 1) {
      const f = len > 0 ? Math.min(target / len, 1) : 0;
      return {
        x: a.x + (b.x - a.x) * f,
        y: a.y + (b.y - a.y) * f,
        angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI,
      };
    }
    target -= len;
  }
  const p = pts[0] ?? { x: 0, y: 0 };
  return { x: p.x, y: p.y, angle: 0 };
}

// ---------------------------------------------------------------- stromen

export type FlowKind = 'supply' | 'return' | 'cable';
export type FlowId =
  | 'grid'
  | 'meter'
  | 'heatPump'
  | 'battery'
  | 'supplyMain'
  | 'supplyMid'
  | 'supplyBuilding'
  | 'boilerIn'
  | 'boilerOut'
  | 'bufferTop'
  | 'bufferBottom'
  | 'returnBuilding'
  | 'returnMid'
  | 'returnMain';

export interface FlowPath {
  id: FlowId;
  kind: FlowKind;
  /** punten in de positieve stroomrichting */
  pts: Pt[];
  d: string;
}

function flow(id: FlowId, kind: FlowKind, pts: Pt[]): FlowPath {
  return { id, kind, pts, d: polyPath(pts) };
}

/**
 * Leidingen en kabels van het schema, elk in de positieve richting getekend:
 * kabels van het net naar de verbruikers (batterij: laden), leidingen in de stroomrichting van het water,
 * bufferaansluitingen naar beneden (laden).
 */
export function flowPaths(l: ConceptLayout): FlowPath[] {
  const hp = HEAT_PUMP;
  const b = BUILDING;
  const out: FlowPath[] = [
    flow('grid', 'cable', [
      { x: NET.cx + 20, y: NET.cableY },
      { x: METER.x, y: NET.cableY },
    ]),
    flow('meter', 'cable', [
      { x: JUNCTION.x, y: METER.y + METER.h },
      { x: JUNCTION.x, y: JUNCTION.y },
    ]),
    flow('heatPump', 'cable', [
      { x: JUNCTION.x, y: JUNCTION.y },
      { x: JUNCTION.x, y: hp.y },
    ]),
  ];
  if (l.hasBattery) {
    out.push(
      flow('battery', 'cable', [
        { x: JUNCTION.x, y: JUNCTION.y },
        { x: BATTERY.x, y: JUNCTION.y },
      ]),
    );
  }
  const firstTee = l.hasDhw ? l.boilerX : l.bufferX;
  // aanvoer: buitenunit → (boiler) → buffer → gebouw → afgifte
  out.push(
    flow('supplyMain', 'supply', [
      { x: hp.x + hp.w, y: SUPPLY_Y },
      { x: firstTee, y: SUPPLY_Y },
    ]),
  );
  if (l.hasDhw) {
    out.push(
      flow('supplyMid', 'supply', [
        { x: l.boilerX, y: SUPPLY_Y },
        { x: l.bufferX, y: SUPPLY_Y },
      ]),
    );
  }
  out.push(
    flow('supplyBuilding', 'supply', [
      { x: l.bufferX, y: SUPPLY_Y },
      { x: b.emitterX, y: SUPPLY_Y },
      { x: b.emitterX, y: b.radiatorTop },
    ]),
  );
  if (l.hasDhw) {
    out.push(
      flow('boilerIn', 'supply', [
        { x: l.boilerX, y: SUPPLY_Y },
        { x: l.boilerX, y: TANK_TOP },
      ]),
      flow('boilerOut', 'return', [
        { x: l.boilerX, y: TANK_BOTTOM },
        { x: l.boilerX, y: RETURN_Y },
      ]),
    );
  }
  if (l.hasBuffer) {
    out.push(
      flow('bufferTop', 'supply', [
        { x: l.bufferX, y: SUPPLY_Y },
        { x: l.bufferX, y: TANK_TOP - 8 },
      ]),
      flow('bufferBottom', 'return', [
        { x: l.bufferX, y: TANK_BOTTOM + 8 },
        { x: l.bufferX, y: RETURN_Y },
      ]),
    );
  }
  // retour: afgifte → gebouw → buffer → (boiler) → stijgleiding → buitenunit
  out.push(
    flow('returnBuilding', 'return', [
      { x: b.emitterX, y: b.radiatorBottom },
      { x: b.emitterX, y: RETURN_Y },
      { x: l.bufferX, y: RETURN_Y },
    ]),
  );
  if (l.hasDhw) {
    out.push(
      flow('returnMid', 'return', [
        { x: l.bufferX, y: RETURN_Y },
        { x: l.boilerX, y: RETURN_Y },
      ]),
    );
  }
  out.push(
    flow('returnMain', 'return', [
      { x: firstTee, y: RETURN_Y },
      { x: RISER_X, y: RETURN_Y },
      { x: RISER_X, y: hp.inY },
      { x: hp.x + hp.w, y: hp.inY },
    ]),
  );
  return out;
}

/** Vermogen per stroom in het uur [kW]; het teken geeft de richting t.o.v. de getekende richting. */
export function flowPowers(h: HourState): Record<FlowId, number> {
  const toBoiler = h.qSpace + h.qDhw + h.qBufferIn;
  const toBuffer = h.qSpace + h.qBufferIn;
  const toBuilding = h.qSpace + h.qBufferOut + h.qBackup;
  const buffer = h.qBufferIn - h.qBufferOut;
  return {
    grid: h.pGrid,
    meter: h.pGrid,
    heatPump: h.pElectric,
    battery: -h.pBattery,
    supplyMain: h.hasDhw ? toBoiler : toBuffer,
    supplyMid: toBuffer,
    supplyBuilding: toBuilding,
    boilerIn: h.qDhw,
    boilerOut: h.qDhw,
    bufferTop: buffer,
    bufferBottom: buffer,
    returnBuilding: toBuilding,
    returnMid: toBuffer,
    returnMain: h.hasDhw ? toBoiler : toBuffer,
  };
}

/** Snelheid van de deeltjes [eenheden/s], evenredig met het vermogen; het teken is de richting. */
export function flowSpeed(powerKw: number, refKw: number): number {
  if (!(Math.abs(powerKw) > FLOW_EPS_KW) || !(refKw > 0)) return 0;
  return (FLOW_SPEED_MAX * powerKw) / refKw;
}

/** Omlooptijd van de ventilator [s] in vijf stappen (minder sprongen tijdens afspelen); null = stil. */
export function fanPeriod(qKw: number, refKw: number): number | null {
  if (!(qKw > FLOW_EPS_KW) || !(refKw > 0)) return null;
  const periods = [3.2, 2.2, 1.5, 1.05, 0.75];
  const level = Math.min(periods.length, Math.max(1, Math.ceil((qKw / refKw) * periods.length)));
  return periods[level - 1];
}

// ---------------------------------------------------------------- kleuren

/** Halve dikte van de spronglaag in een gelaagd vat, als fractie van de vathoogte. */
export const THERMOCLINE_HALF = 0.05;

/**
 * Gelaagd vat (buffer, boiler): het warme deel staat boven en reikt van de bovenkant tot de fractie `soc`
 * van de hoogte; daaronder ligt water op retourtemperatuur. Geeft de gradiëntposities [0–1, van boven]
 * waar de spronglaag begint en eindigt.
 */
export function thermocline(soc: number): [number, number] {
  const f = Number.isFinite(soc) ? Math.min(Math.max(soc, 0), 1) : 0;
  if (f <= 0.005) return [0, 0];
  if (f >= 0.995) return [1, 1];
  return [Math.max(0, f - THERMOCLINE_HALF), Math.min(1, f + THERMOCLINE_HALF)];
}

/** Fractie op de kleurschaal van de aanvoertemperatuur (0 = koud, 1 = warm). */
export function supplyColorFraction(supplyC: number): number {
  if (!Number.isFinite(supplyC)) return 0;
  const f = (supplyC - SUPPLY_COLOR_MIN_C) / (SUPPLY_COLOR_MAX_C - SUPPLY_COLOR_MIN_C);
  return Math.min(Math.max(f, 0), 1);
}

/** CSS-kleur tussen --cold en --warm (werkt in licht en donker thema). */
export function warmColdMix(frac: number): string {
  const pct = Math.round(Math.min(Math.max(frac, 0), 1) * 100);
  return `color-mix(in oklch, var(--warm) ${pct}%, var(--cold))`;
}

// ---------------------------------------------------------------- meterkastbalk

export interface MeterScale {
  /** x-positie op de balk van een vermogen [kW], gemeten vanaf het begin van de balk */
  x: (kw: number) => number;
  /** x-positie van een vermogen van de WP-groep [kW]: gestapeld ná het overige gebruik */
  wp: (kw: number) => number;
  /** overig gebruik (1 − aandeel)·P_aansluiting [kW]; 0 zonder WP-limiet */
  otherKw: number;
  /** x van het einde van de aansluiting (bij een WP-limiet ook de limietlijn) */
  connX: number;
  /** true als het deel 'overig gebruik' is ingekort (breukteken) */
  compressed: boolean;
  /** x van het breukteken (NaN zonder inkorting) */
  breakX: number;
}

/** Ruimte rechts van de aansluiting als de WP-groep in het venster eroverheen gaat (overschrijding). */
const OVERFLOW_MARGIN = 1.03;

/**
 * Schaal van de meterkastbalk. De balk is het aansluitvermogen; de segmenten worden gestapeld: eerst het overige
 * gebruik (grijs), daarna de WP-groep (P_net, plus batterijladen of het deel dat de batterij levert). De WP-limiet
 * eindigt dus precies op het einde van de aansluiting (limietlijn); wat de WP-groep daarboven vraagt, steekt als
 * overschrijding buiten de balk uit. Is het overige gebruik veel groter dan de WP-groep, dan wordt dat deel
 * ingekort en met een breukteken getekend; de WP-groep blijft lineair.
 */
export function meterScale(
  connectionKw: number,
  limitKw: number,
  maxStackKw: number,
  x0: number,
  x1: number,
): MeterScale {
  const W = x1 - x0;
  const stack = Number.isFinite(maxStackKw) ? Math.max(maxStackKw, 0) : 0;
  const connOk = Number.isFinite(connectionKw) && connectionKw > 0;
  const hasLimit = connOk && Number.isFinite(limitKw) && limitKw > 0;
  const budget = hasLimit ? Math.min(limitKw, connectionKw) : connOk ? connectionKw : 0;
  const other = hasLimit ? connectionKw - budget : 0;
  const conn = connOk ? connectionKw : Math.max(stack, 0.1);
  // bereik van de WP-groep op de balk: de limiet, of meer als de WP-groep in het venster erboven komt
  const protrudes = other + stack > conn + 1e-9;
  const span = Math.max(budget, stack, 0.1) * (protrudes ? OVERFLOW_MARGIN : 1);
  if (other <= 2 * span) {
    const top = Math.max(conn, other + span);
    const k = W / top;
    const x = (kw: number): number => x0 + Math.min(Math.max(kw, 0), top) * k;
    return { x, wp: (p) => x(other + p), otherKw: other, connX: x(conn), compressed: false, breakX: NaN };
  }
  // ingekort: het overige gebruik krijgt een kwart van de balk, de WP-groep lineair de rest
  const split = x0 + 0.25 * W;
  const k2 = (x1 - split) / span;
  const x = (kw: number): number => {
    const p = Math.max(kw, 0);
    return p <= other ? x0 + (p / other) * (split - x0) : Math.min(x1, split + (p - other) * k2);
  };
  return {
    x,
    wp: (p) => x(other + p),
    otherKw: other,
    connX: x(conn),
    compressed: true,
    breakX: x0 + 0.55 * (split - x0),
  };
}

/** Geschatte breedte van een tekst in viewBox-eenheden (voor het plaatsen van labels zonder overlap). */
export function approxTextWidth(text: string, fontPx = 14): number {
  return text.length * fontPx * 0.56;
}

// ---------------------------------------------------------------- uurtoestand

export interface WindowRefs {
  /** grootste lengte van de WP-stapel op de balk in het venster [kW] */
  maxStackKw: number;
  /** referentie voor de deeltjessnelheid op leidingen [kW] */
  thermalRefKw: number;
  /** referentie voor de deeltjessnelheid op kabels [kW] */
  electricRefKw: number;
}

/** Referentiewaarden over het venster van de scrubber (koude week ± 24 h), vast zolang de analyse gelijk is. */
export function windowRefs(a: Analysis): WindowRefs {
  const s = a.main.series;
  let stack = 0;
  let th = 0;
  let el = 0;
  for (let h = a.coldWeek.from; h < a.coldWeek.to; h++) {
    // het venster mag over de jaargrens lopen
    const t = wrapHour(h);
    stack = Math.max(stack, s.pElectric[t], s.pGrid[t]);
    th = Math.max(
      th,
      s.qSpaceHeating[t] + s.qDhw[t] + s.qBufferCharge[t],
      s.qSpaceHeating[t] + s.qBufferDischarge[t] + s.qBackup[t],
    );
    el = Math.max(el, s.pGrid[t], s.pElectric[t], Math.abs(s.pBattery[t]));
  }
  return { maxStackKw: stack, thermalRefKw: Math.max(th, 0.1), electricRefKw: Math.max(el, 0.1) };
}

export interface HourState {
  t: number;
  outdoorC: number;
  /** aanvoertemperatuur volgens de stooklijn [°C] */
  supplyC: number;
  /** laadtemperatuur van de boiler (boilerbedrijf) [°C] */
  dhwTempC: number;
  /** Q_wp: thermisch vermogen van de WP (ruimte + boiler + buffer laden) [kW] */
  qHeatPump: number;
  /** P_el van de WP zonder bijstook [kW] */
  pHeatPump: number;
  /** true als de compressor dit uur draait */
  running: boolean;
  /** COP van de WP in dit uur (Q_wp / P_el,WP); NaN als de WP stilstaat */
  cop: number;
  qSpace: number;
  qDhw: number;
  qBufferIn: number;
  qBufferOut: number;
  qBackup: number;
  /** P_el incl. bijstook [kW] */
  pElectric: number;
  /** batterij aan de netzijde: > 0 ontladen, < 0 laden [kW] */
  pBattery: number;
  pGrid: number;
  pLimitKw: number;
  /** overschrijding boven P_limiet [kW] (0 zonder limiet) */
  exceedKw: number;
  hasBuffer: boolean;
  bufferKwh: number;
  bufferFrac: number;
  bufferMaxC: number;
  hasDhw: boolean;
  tankKwh: number;
  tankFrac: number;
  hasBattery: boolean;
  batteryKwh: number;
  batteryUsableKwh: number;
  batteryFrac: number;
  indoorC: number;
  setpointC: number;
  qRequested: number;
  gainsKw: number;
  inUse: boolean;
  preheat: boolean;
  comfortLoss: boolean;
}

function frac(v: number, max: number): number {
  return max > 0 ? Math.min(Math.max(v / max, 0), 1) : 0;
}

/** Alle waarden die het schema voor uur t toont; t is een doorlopend uur (de waarden staan op `wrapHour(t)`). */
export function hourState(a: Analysis, hour: number): HourState {
  const t = wrapHour(hour);
  const s = a.main.series;
  const input = a.input;
  const b = input.building;
  const qHeatPump = s.qSpaceHeating[t] + s.qDhw[t] + s.qBufferCharge[t];
  const pHeatPump = Math.max(0, s.pElectric[t] - s.qBackup[t]);
  const eBuf = a.main.kpis.bufferEnergyKwh;
  const eTank = tankEnergy(b);
  const eBat = batteryUsableEnergy(input.battery);
  const inUse = a.hours.inUse[t] === 1;
  const indoorC = s.indoorC[t];
  const setpointC = s.setpointC[t];
  const running = pHeatPump > 1e-6 && qHeatPump > 1e-6;
  return {
    t: hour,
    outdoorC: s.outdoorC[t],
    supplyC: supplyTemperature(input.heatPump, b.designOutdoorC, s.outdoorC[t]),
    dhwTempC: b.dhw.tankTempC,
    qHeatPump,
    pHeatPump,
    running,
    cop: running ? qHeatPump / pHeatPump : NaN,
    qSpace: s.qSpaceHeating[t],
    qDhw: s.qDhw[t],
    qBufferIn: s.qBufferCharge[t],
    qBufferOut: s.qBufferDischarge[t],
    qBackup: s.qBackup[t],
    pElectric: s.pElectric[t],
    pBattery: s.pBattery[t],
    pGrid: s.pGrid[t],
    pLimitKw: a.pLimitKw,
    exceedKw: Number.isFinite(a.pLimitKw) ? Math.max(0, s.pGrid[t] - a.pLimitKw) : 0,
    hasBuffer: input.buffer.volumeM3 > 0 && eBuf > 0,
    bufferKwh: s.socBuffer[t],
    bufferFrac: frac(s.socBuffer[t], eBuf),
    bufferMaxC: bufferChargeTemperature(input.heatPump),
    hasDhw: b.dhw.enabled && eTank > 0,
    tankKwh: s.socTank[t],
    tankFrac: frac(s.socTank[t], eTank),
    hasBattery: input.battery.capacityKwh > 0 && eBat > 0,
    batteryKwh: s.socBattery[t],
    batteryUsableKwh: eBat,
    batteryFrac: frac(s.socBattery[t], eBat),
    indoorC,
    setpointC,
    qRequested: s.qRequested[t],
    gainsKw: gainsAt(b, a.startWeekday, t),
    inUse,
    preheat: a.hours.preheat[t] === 1,
    comfortLoss: inUse && indoorC < setpointC - COMFORT_MARGIN_K,
  };
}

/**
 * Segmenten van de WP-groep op de meterkastbalk voor één uur [kW, van–tot], gemeten vanaf het begin van de
 * WP-groep (dus ná het overige gebruik, zie `MeterScale.wp`). Samen met het overige gebruik geldt:
 * overig + P_el − P_bat,uit + P_bat,in = overig + P_net.
 */
export interface MeterSegments {
  /** WP uit het net (blauw) */
  grid: [number, number];
  /** batterij laden via de meter (oranje), of null */
  charge: [number, number] | null;
  /** batterij ontladen: deel van de WP dat de batterij levert (groen, niet via de meter), of null */
  discharge: [number, number] | null;
  /** overschrijding boven P_limiet (rood), of null */
  overflow: [number, number] | null;
}

export function meterSegments(
  h: Pick<HourState, 'pElectric' | 'pBattery' | 'pGrid' | 'pLimitKw'>,
): MeterSegments {
  const pEl = Math.max(0, h.pElectric);
  const pGrid = Math.max(0, h.pGrid);
  const charging = h.pBattery < -FLOW_EPS_KW;
  const discharging = h.pBattery > FLOW_EPS_KW;
  const blueEnd = charging ? pEl : pGrid;
  return {
    grid: [0, Math.min(blueEnd, pEl)],
    charge: charging ? [pEl, pGrid] : null,
    discharge: discharging ? [pGrid, pEl] : null,
    overflow: Number.isFinite(h.pLimitKw) && pGrid > h.pLimitKw + FLOW_EPS_KW ? [h.pLimitKw, pGrid] : null,
  };
}
