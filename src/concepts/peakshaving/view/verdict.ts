// Het oordeel van het Resultaat (UX-plan §4): status, kop en detailzin, meterbalk, drie tegels, gevolgregels en de
// knoppen. Puur: alles uit de doorrekening (en voor sommige knoppen het gevoeligheidsraster), steeds onafhankelijk
// van de bedrijfsmodus: overschrijding uit exceedanceKpis(a), comfort uit limitedKpis(a). Eén uitzondering (plan §4.1
// en §4.3): hoeveel de batterij afschaaft (het bedrag in de detailzin en de arcering in de meterbalk) is alleen bekend
// zonder begrenzer, want de doorrekening zonder batterij volgt de gekozen modus. Kop, status en tegels blijven gelijk.
import { fmt } from '../../../core/format';
import { LARGE_CONNECTION_ID } from '../data/connections';
import type { Analysis } from '../model/analysis';
import { connectionText, currentConnectionText, exceedanceKpis, limitedKpis } from '../model/kpis';
import { MESSAGE_TEXTS, VERDICT_TEXTS } from '../texts';
import { helpFixes, smallerFixes, type Fix } from './fixes';
import { kwDigitsFor } from './format';
import { connectionIndex, type SensitivityState } from './sensitivityFacts';

export type VerdictStatus = 'sizingFailed' | 'nearlyFit' | 'notFit' | 'withinAllowed' | 'fitAmple' | 'fit';
export type VerdictTone = 'ok' | 'warn' | 'err';

/** "Past net niet": de piek ligt hoogstens 3 % boven de limiet (B15). */
export const NEARLY_FIT_FRACTION = 0.03;
/** "Past ruim": meer dan 25 % marge onder de limiet en geen batterij die afschaaft (B15). */
export const AMPLE_MARGIN_FRACTION = 0.25;
/** Een batterij schaaft af als de piek zonder batterij meer dan 5 W hoger ligt. */
export const SHAVE_EPS_KW = 0.005;
/** Klimaatjaar van de stresstestregel in het oordeel (spec §4.3: controleren met de strenge winter 1978/79). */
export const STRESS_LINE_YEAR = 'winter1979';

/** Deel van de meterbalk: van `fromKw` tot `toKw`, en als fractie (0…1) van de schaal. */
export interface MeterSpan {
  fromKw: number;
  toKw: number;
  start: number;
  end: number;
}

/** Meterbalk (§4.3): piek aan de meter tegen de WP-limiet, op een schaal 0…maxKw. */
export interface MeterModel {
  maxKw: number;
  peakKw: number;
  budgetKw: number;
  /** neutraal vlak van 0 tot min(piek, limiet) */
  base: MeterSpan;
  /** boven de limiet (--err) */
  over: MeterSpan | null;
  /** gearceerd: wat de batterij afschaaft (alleen in modus overschrijding) */
  shaved: MeterSpan | null;
  /** streep op de limiet (fractie) */
  budgetPos: number;
  /** schaduwstreep: piek zonder maatregelen (alleen met buffer of batterij) */
  shadowKw: number | null;
  shadowPos: number | null;
  peakLabel: string;
  budgetLabel: string;
  withoutLabel: string | null;
  ariaLabel: string;
}

export interface Tile {
  id: 'heatPump' | 'exceedance' | 'smallest';
  title: string;
  value: string;
  unit: string;
  line: string;
  /** tegels zijn neutraal; alleen een te klein handmatig WP-vermogen is 'warn' */
  tone: 'neutral' | 'warn';
  /** "zonder maatregelen …" (alleen met buffer of batterij) */
  reference: string | null;
  /** link "eigen vermogen kiezen" (alleen bij automatisch WP-vermogen) */
  refineLink: boolean;
}

/** "Waarom?" in de oordeelkaart (alleen bij niet te dimensioneren): de toelichting en de passende oplossingen. */
export interface VerdictWhy {
  paragraphs: string[];
  solutions: string[];
}

export interface Verdict {
  status: VerdictStatus;
  tone: VerdictTone;
  icon: '✓' | '!' | '✕';
  headline: string;
  detail: string;
  /** toelichting onder "Waarom?"; alleen bij niet te dimensioneren (die melding staat niet in Opvallend) */
  why: VerdictWhy | null;
  /** tekst van de visueel verborgen statusregel */
  liveText: string;
  /** tekst van de vaste balk onderaan */
  mini: string;
  meter: MeterModel;
  tiles: [Tile, Tile, Tile];
  limiterLine: { text: string; tone: 'neutral' | 'warn' };
  stressLine: string | null;
  fixesLabel: 'Wat helpt' | 'Kleinere aansluiting volstaat ook' | null;
  fixes: Fix[];
}

const TONE: Record<VerdictStatus, VerdictTone> = {
  sizingFailed: 'err',
  nearlyFit: 'err',
  notFit: 'err',
  withinAllowed: 'warn',
  fitAmple: 'ok',
  fit: 'ok',
};
const ICON: Record<VerdictTone, Verdict['icon']> = { ok: '✓', warn: '!', err: '✕' };

/**
 * Afschaving door de batterij [kW], of null als er niets wordt afgeschaafd. In modus "met begrenzer" volgt
 * `a.noBattery` de modus en is het bedrag onbekend: dan NaN als de batterij nodig is voor 0 uur boven de limiet.
 */
function shavedKw(a: Analysis): number | null {
  const ex = exceedanceKpis(a);
  if (a.input.battery.capacityKwh <= 0) return null;
  if (a.main.mode === 'exceedance') {
    const d = a.noBattery.pGridMaxKw - ex.pGridMaxKw;
    return d > SHAVE_EPS_KW ? d : null;
  }
  return (a.requiredBattery?.capacityKwh ?? 0) > 0 ? NaN : null;
}

/** Automatisch WP-vermogen dat niet te dimensioneren is: de doorrekening gebruikt dan 3 × het piekvermogen. */
export function sizingFailed(a: Analysis): boolean {
  return a.input.heatPump.sizingMode === 'auto' && !Number.isFinite(a.sizing.withBuffer);
}

export function verdictStatus(a: Analysis): VerdictStatus {
  const ex = exceedanceKpis(a);
  const budget = a.pLimitKw;
  const hours = ex.exceedanceHours;
  const allowed = a.input.grid.allowedExceedanceH;
  if (sizingFailed(a)) return 'sizingFailed';
  if (hours > allowed) return ex.pGridMaxKw - budget <= NEARLY_FIT_FRACTION * budget ? 'nearlyFit' : 'notFit';
  if (hours > 0) return 'withinAllowed';
  const margin = budget - ex.pGridMaxKw;
  return margin > AMPLE_MARGIN_FRACTION * budget && shavedKw(a) === null ? 'fitAmple' : 'fit';
}

function span(fromKw: number, toKw: number, maxKw: number): MeterSpan {
  return { fromKw, toKw, start: fromKw / maxKw, end: toKw / maxKw };
}

/**
 * Verwijzingen "zonder maatregelen …" (tegels en schaduwstreep): alleen met buffer of batterij, en alleen bij
 * automatisch WP-vermogen. De doorrekening zonder maatregelen dimensioneert de warmtepomp altijd automatisch; bij een
 * handmatig vermogen zou de verwijzing een andere warmtepomp noemen dan de knop "↺ Zonder maatregelen" (die het
 * handmatige vermogen houdt) en zou "(+1,4)" suggereren dat de maatregelen de warmtepomp groter maken.
 */
function showReferences(a: Analysis): boolean {
  const measures = a.input.buffer.volumeM3 > 0 || a.input.battery.capacityKwh > 0;
  return measures && a.input.heatPump.sizingMode === 'auto';
}

function meterModel(a: Analysis, d: number): MeterModel {
  const ex = exceedanceKpis(a);
  const peak = ex.pGridMaxKw;
  const budget = a.pLimitKw;
  const measures = showReferences(a);
  const without = a.withoutMeasures.kpis.pGridMaxKw;
  const noBattery = a.noBattery.pGridMaxKw;
  const shaved = a.main.mode === 'exceedance' && noBattery > peak + SHAVE_EPS_KW;
  // het gearceerde deel valt altijd binnen de schaal
  const maxKw = 1.1 * Math.max(budget, peak, without, shaved ? noBattery : 0) || 1;
  return {
    maxKw,
    peakKw: peak,
    budgetKw: budget,
    base: span(0, Math.min(peak, budget), maxKw),
    over: peak > budget ? span(budget, peak, maxKw) : null,
    shaved: shaved ? span(peak, noBattery, maxKw) : null,
    budgetPos: budget / maxKw,
    shadowKw: measures ? without : null,
    shadowPos: measures ? without / maxKw : null,
    peakLabel: VERDICT_TEXTS.meter.peak(peak, d),
    budgetLabel: VERDICT_TEXTS.meter.budget(budget, d),
    withoutLabel: measures ? VERDICT_TEXTS.meter.without(without, d) : null,
    ariaLabel: VERDICT_TEXTS.meter.aria(peak, budget, d),
  };
}

/** "1 stap groter dan de huidige", "gelijk aan de huidige", bij grootverbruik "groter dan de huidige". */
function smallestLine(a: Analysis): string {
  const t = VERDICT_TEXTS.tiles;
  const s = a.smallest;
  if (!Number.isFinite(s.powerKw)) return '';
  const cur = a.input.grid.connection;
  if (cur !== LARGE_CONNECTION_ID && s.id !== LARGE_CONNECTION_ID) {
    const steps = connectionIndex(s.id) - connectionIndex(cur);
    return steps === 0 ? t.smallestEqual : t.smallestSteps(steps);
  }
  // grootverbruik: geen aantal stappen
  if (s.powerKw > a.connectionKw + 1e-9) return t.smallestLarger;
  if (s.powerKw < a.connectionKw - 1e-9) return t.smallestSmaller;
  return t.smallestEqual;
}

function tiles(a: Analysis): [Tile, Tile, Tile] {
  const t = VERDICT_TEXTS.tiles;
  const ex = exceedanceKpis(a);
  const b = a.input.building;
  const auto = a.input.heatPump.sizingMode === 'auto';
  const measures = showReferences(a);
  const w = a.withoutMeasures;
  const needed = a.sizing.withBuffer;
  const failed = sizingFailed(a);
  const multi = b.use !== 'office' && b.dwellings > 1;
  const heatPump: Tile = {
    id: 'heatPump',
    title: auto ? t.heatPump : t.heatPumpManual,
    value: failed ? '–' : fmt(a.nominalKw, 1),
    // thermisch: naast "Piek aan de meter" en "limiet" (elektrisch) zou "kW" doen denken dat 10,6 kW in 3,22 kW past
    unit: VERDICT_TEXTS.tiles.heatPumpUnit,
    line: failed
      ? t.heatPumpNeeded(NaN)
      : auto
        ? t.heatPumpLine(a.capacityAtMinus10.withBuffer, multi ? a.nominalKw / b.dwellings : null)
        : t.heatPumpNeeded(needed),
    tone: !auto && !(a.nominalKw >= needed - 1e-9) ? 'warn' : 'neutral',
    // niet te dimensioneren: ook geen "zonder maatregelen 300,0 kW" (de terugvalwaarde die de tegel niet toont)
    reference: measures && !failed ? t.heatPumpRef(w.nominalKw, a.nominalKw) : null,
    refineLink: auto,
  };
  const exceedance: Tile = {
    id: 'exceedance',
    title: t.exceedance,
    value: fmt(ex.exceedanceHours, 0),
    unit: t.hoursUnit,
    line: ex.exceedanceHours > 0 ? t.exceedanceLine(ex.exceedanceKwh) : t.exceedanceNone,
    tone: 'neutral',
    reference: measures ? t.exceedanceRef(w.kpis.exceedanceHours) : null,
    refineLink: false,
  };
  const smallest: Tile = {
    id: 'smallest',
    title: t.smallest,
    value: connectionText(a.smallest),
    unit: '',
    line: smallestLine(a),
    tone: 'neutral',
    reference: measures ? t.smallestRef(connectionText(w.smallest)) : null,
    refineLink: false,
  };
  return [heatPump, exceedance, smallest];
}

/**
 * Niet te dimensioneren: wat er misgaat en welke oplossingen passen, de meest waarschijnlijke eerst. De doorrekening
 * gebruikt dan de terugvalwaarde (3 × het piekvermogen); de modus "zonder begrenzer" heeft geen elektrische grens,
 * net als de dimensionering, dus de uren comfortverlies en tapwatertekort daarvan wijzen de oorzaak aan.
 * - de boiler-oplossing alleen als er tapwater is (een kantoor heeft standaard geen tapwater);
 * - opwarmfactor en verlaagd setpoint alleen als er een nachtverlaging is (setpoint buiten gebruik lager);
 * - comfortverlies toestaan helpt alleen bij een comfortprobleem, maar blijft als laatste redmiddel in de lijst.
 */
export function sizingFailedAdvice(a: Analysis): { cause: string; solutions: string[] } {
  const [boiler, allowComfortLoss, setback] = MESSAGE_TEXTS.sizingFailed.solutions;
  const b = a.input.building;
  const ex = exceedanceKpis(a);
  const dhwFails = b.dhw.enabled && ex.dhwShortfallHours > 0;
  const comfortFails = ex.comfortLossHours > a.input.grid.allowedComfortLossH;
  const hasSetback = b.setpointSetbackC < b.setpointUseC;
  const c = VERDICT_TEXTS.sizingFailedCause;
  const cause = dhwFails && comfortFails ? c.both : dhwFails ? c.dhw : comfortFails ? c.comfort : c.unknown;
  const ordered: string[] = [];
  if (dhwFails) ordered.push(boiler);
  if (comfortFails && hasSetback) ordered.push(setback);
  if (comfortFails) ordered.push(allowComfortLoss);
  // de overige oplossingen die bij deze invoer kunnen, achteraan
  if (b.dhw.enabled) ordered.push(boiler);
  if (hasSetback) ordered.push(setback);
  ordered.push(allowComfortLoss);
  return { cause, solutions: [...new Set(ordered)] };
}

/** "Waarom?" bij niet te dimensioneren: de toelichting van de melding (met de terugvalwaarde) en de oplossingen. */
function whyOf(a: Analysis, status: VerdictStatus): VerdictWhy | null {
  if (status !== 'sizingFailed') return null;
  const message = a.messages.find((m) => m.code === 'sizingFailed');
  return {
    paragraphs: message ? message.why : [MESSAGE_TEXTS.sizingFailed.why[0]],
    solutions: sizingFailedAdvice(a).solutions,
  };
}

function detailOf(a: Analysis, status: VerdictStatus, d: number): string {
  const v = VERDICT_TEXTS;
  const ex = exceedanceKpis(a);
  const budget = a.pLimitKw;
  const peak = ex.pGridMaxKw;
  const hours = ex.exceedanceHours;
  switch (status) {
    case 'sizingFailed': {
      const { cause, solutions } = sizingFailedAdvice(a);
      return v.sizingFailedDetail(cause, solutions[0] ?? null);
    }
    case 'nearlyFit':
    case 'notFit':
      return v.over(hours, budget, peak - budget, (100 * (peak - budget)) / budget, d);
    case 'withinAllowed':
      return v.within(hours, budget, peak - budget, d);
    default: {
      const shaved = shavedKw(a);
      if (shaved !== null)
        return Number.isFinite(shaved) ? v.shaved(peak, shaved, d) : v.shavedLimited(peak, d);
      // piek (afgerond) op de limiet, bijv. met een buffer die precies tot de limiet laadt: geen "0,00 kW (0 %)"
      if (Math.round((budget - peak) * 10 ** d) === 0) return v.atBudget(peak, d);
      return v.margin(peak, budget - peak, (100 * (budget - peak)) / budget, budget, d);
    }
  }
}

/** De batterij is niet nodig: zonder batterij al geen uur boven de limiet (de batterijregel zegt "Doet nu niets"). */
function batteryIdle(a: Analysis): boolean {
  const rb = a.requiredBattery;
  return a.input.battery.capacityKwh > 0 && !!rb && rb.feasible && rb.capacityKwh === 0;
}

function headlineOf(a: Analysis, status: VerdictStatus): string {
  const h = VERDICT_TEXTS.headline;
  const conn = currentConnectionText(a);
  // "met … en 5,5 kWh batterij" alleen als de batterij meetelt: een batterij die niets doet, krijgt geen eer
  const measures = VERDICT_TEXTS.measures(
    a.input.buffer.volumeM3,
    batteryIdle(a) ? 0 : a.input.battery.capacityKwh,
  );
  switch (status) {
    case 'sizingFailed':
      return h.sizingFailed;
    case 'nearlyFit':
      return h.nearlyFit(conn);
    case 'notFit':
      return h.notFit(conn);
    case 'withinAllowed':
      return h.withinAllowed(conn, a.input.grid.allowedExceedanceH);
    case 'fitAmple':
      return h.fitAmple(conn, measures);
    case 'fit':
      return h.fit(conn, measures);
  }
}

/** Het volledige oordeel; `sens` is het gevoeligheidsraster (alleen gebruikt als het bij `a.input` hoort). */
export function buildVerdict(a: Analysis, sens: SensitivityState | null): Verdict {
  const status = verdictStatus(a);
  const tone = TONE[status];
  const d = kwDigitsFor(a.pLimitKw);
  const ex = exceedanceKpis(a);
  const lim = limitedKpis(a);
  const headline = headlineOf(a, status);
  const allowed = a.input.grid.allowedExceedanceH;

  let fixes: Fix[] = [];
  let fixesLabel: Verdict['fixesLabel'] = null;
  if (status === 'notFit' || status === 'nearlyFit' || status === 'withinAllowed') {
    fixes = helpFixes(a, sens, status === 'withinAllowed' ? 0 : allowed);
    if (fixes.length > 0) fixesLabel = VERDICT_TEXTS.fixesLabel.help;
  } else if (status === 'fit' || status === 'fitAmple') {
    fixes = smallerFixes(a, sens);
    if (fixes.length > 0) fixesLabel = VERDICT_TEXTS.fixesLabel.smaller;
  }

  // stresstest: de strenge winter 1978/79 uit de robuustheidstabel (spec §4.3, §6.3)
  const stress = a.robustness.find((r) => r.climateId === STRESS_LINE_YEAR);
  const stressLine =
    a.climateId === STRESS_LINE_YEAR
      ? VERDICT_TEXTS.stressSelf(a.input.heatPump.sizingMode === 'auto')
      : stress
        ? VERDICT_TEXTS.stress(stress.exceedanceHours, stress.comfortLossHours)
        : null;

  return {
    status,
    tone,
    icon: ICON[tone],
    headline,
    detail: detailOf(a, status, d),
    why: whyOf(a, status),
    liveText: VERDICT_TEXTS.live(headline, ex.exceedanceHours),
    // niet te dimensioneren: geen WP-vermogen (de tegel toont dan ook "–", niet de terugvalwaarde)
    mini: VERDICT_TEXTS.mini(status, ex.exceedanceHours, status === 'sizingFailed' ? null : a.nominalKw),
    meter: meterModel(a, d),
    tiles: tiles(a),
    limiterLine: {
      text: VERDICT_TEXTS.limiter(lim.comfortLossHours, lim.minIndoorC, lim.dhwShortfallHours),
      tone: lim.comfortLossHours > a.input.grid.allowedComfortLossH ? 'warn' : 'neutral',
    },
    stressLine,
    fixesLabel,
    fixes,
  };
}
