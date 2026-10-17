// Meldingen (spec §6.4): pure detectie op de simulatieresultaten; teksten in ../texts.ts.
import { fmt } from '../../../core/format';
import { MESSAGE_TEXTS, SIZING_FALLBACK_NOTE, type MessageCode } from '../texts';
import type { SimulationResult } from './types';

/** Ernst: 'error' = rood, 'warning' = oranje, 'info' = blauw. */
export type Severity = 'error' | 'warning' | 'info';

export interface Message {
  code: MessageCode;
  severity: Severity;
  title: string;
  /** korte regel met de actuele waarden */
  summary: string;
  /** uitleg onder "Waarom?" */
  why: string[];
  solutions: string[];
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
export const MAX_MESSAGES = 4;

/** Alle feiten die de meldingen nodig hebben (berekend in analysis.ts). */
export interface MessageFacts {
  /** klimaatjaar binnen een zin, bijv. "ontwerpjaar T5" */
  climateInSentence: string;
  sizingMode: 'auto' | 'manual';
  /** P_th,min zonder buffer, met de ingestelde buffer en met dubbele buffer [kW] */
  sizingWithoutBuffer: number;
  sizingWithBuffer: number;
  sizingDoubleBuffer: number | null;
  bufferVolumeM3: number;
  bufferMaxM3: number;
  bufferDeltaT: number;
  bufferKwhPerM3: number;
  emitterLabel: string;
  maxSupplyC: number;
  /** aandeel van de bepalende uren van de dimensionering dat in de koude week valt (null = n.v.t.) */
  sizingHoursInColdWeek: number | null;
  coldSpell: { days: number; meanC: number };
  /** simulatie in modus 'exceedance' (met reeksen): de onbegrensde pieken */
  exceedanceRun: SimulationResult;
  /** KPI's in modus 'limited' */
  limitedComfortLossHours: number;
  limitedMinIndoorC: number;
  allowedComfortLossH: number;
  pLimitKw: number;
  batteryCapacityKwh: number;
  batteryPowerKw: number;
  backupHeaterKw: number;
  /** uur van max Q_ideal is een opstookuur (kantoor) */
  idealPeakInPreheat: boolean;
  boostKw: number;
}

function argmax(a: ArrayLike<number>): number {
  let best = -Infinity;
  let idx = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] > best) {
      best = a[i];
      idx = i;
    }
  }
  return idx;
}

/** Aantal uren met een lege batterij terwijl de WP-groep boven de limiet zit. */
export function batteryRunsEmpty(run: SimulationResult, pLimitKw: number, capacityKwh: number): number {
  const s = run.series;
  if (!s || capacityKwh <= 0 || !Number.isFinite(pLimitKw)) return 0;
  let n = 0;
  for (let t = 0; t < s.pGrid.length; t++) if (s.pGrid[t] > pLimitKw + 1e-6 && s.socBattery[t] < 1e-6) n++;
  return n;
}

/** Aantal uren waarin het batterijvermogen de beperking is: P_el − P_limiet > P_bat terwijl er nog lading over is. */
export function batteryPowerLimits(
  run: SimulationResult,
  pLimitKw: number,
  capacityKwh: number,
  powerKw: number,
): number {
  const s = run.series;
  if (!s || capacityKwh <= 0 || !Number.isFinite(pLimitKw)) return 0;
  let n = 0;
  for (let t = 0; t < s.pElectric.length; t++)
    if (s.pElectric[t] - pLimitKw > powerKw + 1e-6 && s.socBattery[t] > 1e-6) n++;
  return n;
}

/** Het uur van max P_el is een boilerlaaduur. */
export function dhwCausesPeak(run: SimulationResult): boolean {
  const s = run.series;
  if (!s) return false;
  return s.qDhw[argmax(s.pElectric)] > 1e-9;
}

/** De piek aan de meter valt in een bijstookuur. */
export function backupCausesPeak(run: SimulationResult): boolean {
  const s = run.series;
  if (!s) return false;
  return s.qBackup[argmax(s.pGrid)] > 1e-9;
}

/**
 * Buffer helpt niet verder: een verdubbeling levert < 2 % minder WP-vermogen op én veel minder dan de eerste V
 * (dat sluit kleine buffers uit, waar het effect nog lineair is), of een grote buffer heeft vrijwel geen effect.
 */
export function bufferPlateau(
  f: Pick<
    MessageFacts,
    'bufferVolumeM3' | 'bufferMaxM3' | 'sizingWithoutBuffer' | 'sizingWithBuffer' | 'sizingDoubleBuffer'
  >,
): boolean {
  const p0 = f.sizingWithoutBuffer;
  const p1 = f.sizingWithBuffer;
  const p2 = f.sizingDoubleBuffer;
  if (f.bufferVolumeM3 <= 0 || !Number.isFinite(p1)) return false;
  if (p2 !== null && Number.isFinite(p2) && Number.isFinite(p0)) {
    const gainSecond = p1 - p2;
    const gainFirst = p0 - p1;
    if (gainSecond / p1 < 0.02 && gainSecond < 0.25 * gainFirst) return true;
  }
  return f.bufferVolumeM3 >= 0.5 * f.bufferMaxM3 && Number.isFinite(p0) && (p0 - p1) / p0 < 0.02;
}

function make(code: MessageCode, severity: Severity, values: Record<string, string>): Message {
  const tx = MESSAGE_TEXTS[code];
  const fill = (s: string): string => s.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? `{${k}}`);
  return {
    code,
    severity,
    title: tx.title,
    summary: fill(tx.summary),
    why: tx.why.map(fill).filter((w) => w.length > 0),
    solutions: tx.solutions.map(fill),
  };
}

/** Alle van toepassing zijnde meldingen, gesorteerd op ernst (zonder begrenzing tot vier). */
export function allMessages(f: MessageFacts): Message[] {
  const out: Message[] = [];
  const run = f.exceedanceRun;

  if (!Number.isFinite(f.sizingWithBuffer)) {
    out.push(make('sizingFailed', 'error', { fallbackNote: SIZING_FALLBACK_NOTE[f.sizingMode] }));
  }

  if (f.backupHeaterKw > 0 && backupCausesPeak(run)) {
    out.push(
      make('backupPeak', 'error', { backup: fmt(f.backupHeaterKw, 1), peak: fmt(run.kpis.pGridMaxKw, 2) }),
    );
  }

  if (f.limitedComfortLossHours > f.allowedComfortLossH) {
    const severe = f.limitedComfortLossHours > f.allowedComfortLossH + 24;
    out.push(
      make('comfortLoss', severe ? 'error' : 'warning', {
        hours: fmt(f.limitedComfortLossHours, 0),
        allowed: fmt(f.allowedComfortLossH, 0),
        minTi: fmt(f.limitedMinIndoorC, 1),
      }),
    );
  }

  const empty = batteryRunsEmpty(run, f.pLimitKw, f.batteryCapacityKwh);
  if (empty > 0) {
    out.push(
      make('batteryEmpty', 'warning', { hours: fmt(empty, 0), capacity: fmt(f.batteryCapacityKwh, 1) }),
    );
  }

  const powerLimited = batteryPowerLimits(run, f.pLimitKw, f.batteryCapacityKwh, f.batteryPowerKw);
  if (powerLimited > 0) {
    out.push(
      make('batteryPower', 'warning', { hours: fmt(powerLimited, 0), power: fmt(f.batteryPowerKw, 1) }),
    );
  }

  if (f.bufferDeltaT < 15) {
    out.push(
      make('smallBufferDeltaT', 'warning', {
        dT: fmt(f.bufferDeltaT, 0),
        preset: f.emitterLabel,
        maxSupply: fmt(f.maxSupplyC, 0),
        kwh: fmt(f.bufferKwhPerM3, 1),
      }),
    );
  }

  if (bufferPlateau(f)) {
    out.push(
      make('bufferPlateau', 'info', {
        year: f.climateInSentence,
        days: fmt(f.coldSpell.days, 0),
        meanT: fmt(f.coldSpell.meanC, 1),
        volume: fmt(f.bufferVolumeM3, 2),
        pth: fmt(f.sizingWithBuffer, 1),
      }),
    );
  }

  if (f.sizingHoursInColdWeek !== null && f.sizingHoursInColdWeek >= 0.5) {
    out.push(
      make('coldSpell', 'info', {
        year: f.climateInSentence,
        share: fmt(100 * f.sizingHoursInColdWeek, 0),
        days: fmt(f.coldSpell.days, 0),
        meanT: fmt(f.coldSpell.meanC, 1),
      }),
    );
  }

  if (dhwCausesPeak(run)) {
    out.push(make('dhwPeak', 'info', { peak: fmt(run.kpis.pElectricMaxKw, 2) }));
  }

  if (f.idealPeakInPreheat && f.boostKw > 0) {
    out.push(make('preheatPeak', 'info', { boost: fmt(f.boostKw, 1) }));
  }

  return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Maximaal vier meldingen, gesorteerd op ernst (rood, oranje, blauw). */
export function buildMessages(f: MessageFacts): Message[] {
  return allMessages(f).slice(0, MAX_MESSAGES);
}
