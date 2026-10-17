// Knoppen bij het oordeel (UX-plan §4.5) en de knoppen "Zet" en "Probeer" bij de hendels (§5.2). Elke knop is een
// pure wijziging van de invoer; de UI past die toe met applyFix(undoLabel, apply), dus met één stap ongedaan maken.
// Een knop belooft alleen wat het model of een exact rasterpunt garandeert (B9–B11).
import { LARGE_CONNECTION_ID, type ConnectionDef } from '../data/connections';
import type { Analysis } from '../model/analysis';
import { tankEnergy } from '../model/building';
import type { ConnectionAdvice } from '../model/sizing';
import { connectionText, exceedanceKpis } from '../model/kpis';
import type { Ranges } from '../model/ranges';
import type { PeakshavingInput } from '../model/types';
import { UI_LABELS, VERDICT_TEXTS, WHATIF_TEXTS } from '../texts';
import { batteryOnStep, ceilToStep, cleanVolume } from './format';
import {
  firstFitVolume,
  gridStatus,
  smallerOption,
  smallestFitFor,
  type SensitivityState,
} from './sensitivityFacts';
import type { WhatIfFieldKey } from './types';

export { ceilToStep } from './format';

export type FixId =
  | 'buffer'
  | 'battery'
  | 'connection'
  | 'share'
  | 'smaller'
  | 'withoutMeasures'
  | 'trySmaller'
  | 'dotCurrent'
  | 'dotSmaller';

export interface Fix {
  id: FixId;
  /** knoptekst, bijv. "0,20 m³ buffer" */
  label: string;
  /**
   * toegankelijke naam als de knoptekst alleen in zijn zin klopt: "Zet" achter "Kleinste batterij voor 0 uur:
   * 1,0 kWh" heet "Zet op 1,0 kWh" (begint met de knoptekst, dus spraakbediening vindt hem ook)
   */
  name?: string;
  /** tekst van de melding "{undoLabel} · Ongedaan maken" (eerste argument van applyFix) */
  undoLabel: string;
  /** grijze plaatshouder met vaste breedte zolang het raster rekent; `apply` verandert dan niets */
  pending: boolean;
  /**
   * hendel die na de knop de focus krijgt (via revealSetting). Alleen hendels van Wat als? (WhatIfFieldKey, het type
   * dwingt dat af): die klappen de Basis niet open en bewaren dus ook geen keuze voor de Basis. De aansluiting gaat
   * daarom naar 'connectionStepper', niet naar 'connection' (het veld Aansluitwaarde in de Basis), en het aandeel ook:
   * de stappertekst noemt het nieuwe budget met het aandeel ("budget 3,54 kW (44 %)").
   */
  target: WhatIfFieldKey;
  apply: (i: PeakshavingInput) => PeakshavingInput;
}

const same = (i: PeakshavingInput): PeakshavingInput => i;

function pendingFix(id: FixId, target: WhatIfFieldKey): Fix {
  return { id, label: VERDICT_TEXTS.fix.pending, undoLabel: '', pending: true, target, apply: same };
}

const withBuffer =
  (volumeM3: number) =>
  (i: PeakshavingInput): PeakshavingInput => ({ ...i, buffer: { ...i.buffer, volumeM3 } });

/**
 * Batterij op `capacityKwh`, met automatisch vermogen (0,5 C): de benodigde batterij en het raster rekenen met
 * 0,5 C, dus alleen dan klopt de belofte.
 */
const withBattery =
  (capacityKwh: number) =>
  (i: PeakshavingInput): PeakshavingInput => ({ ...i, battery: { capacityKwh, powerKw: null } });

const withConnection =
  (c: Pick<ConnectionAdvice, 'id' | 'powerKw'>) =>
  (i: PeakshavingInput): PeakshavingInput => ({
    ...i,
    grid: {
      ...i.grid,
      connection: c.id,
      ...(c.id === LARGE_CONNECTION_ID ? { contractedKw: c.powerKw } : {}),
    },
  });

/**
 * Buffer op een rasterpunt; "(zonder batterij)" als er nu een batterij is (het raster telt dan zonder). Het volume
 * blijft het exacte rasterpunt, ook als dat naast de schuifstap ligt (0,125 m³ bij V_max = 2,5 m³ en stap 0,05): alleen
 * dat punt is berekend (B10). De tekst toont dan het exacte getal ("0,125 m³"), zie fmtVolume in texts.ts.
 */
export function bufferFix(volumeM3: number, withoutBattery: boolean): Fix {
  const v = cleanVolume(volumeM3);
  return {
    id: 'buffer',
    label: VERDICT_TEXTS.fix.buffer(v, withoutBattery),
    undoLabel: VERDICT_TEXTS.undo.buffer(v),
    pending: false,
    target: 'buffer',
    apply: withBuffer(v),
  };
}

/** Batterij op `capacityKwh` (een stapwaarde van de schuif); `label` = knoptekst. */
export function batteryFix(capacityKwh: number, label = VERDICT_TEXTS.fix.battery(capacityKwh)): Fix {
  return {
    id: 'battery',
    label,
    undoLabel: VERDICT_TEXTS.undo.battery(capacityKwh),
    pending: false,
    target: 'battery',
    apply: withBattery(capacityKwh),
  };
}

/** Aansluiting uit een advies (bij grootverbruik met het gecontracteerde vermogen); `label` = knoptekst. */
export function connectionFix(c: ConnectionAdvice, label = connectionText(c)): Fix {
  return {
    id: 'connection',
    label,
    undoLabel: VERDICT_TEXTS.undo.connection(connectionText(c)),
    pending: false,
    target: 'connectionStepper',
    apply: withConnection(c),
  };
}

/** Eén stap kleinere standaardaansluiting proberen (knop "◀ Probeer 1×25 A" bij de batterij). */
export function tryConnectionFix(c: ConnectionDef): Fix {
  return {
    ...connectionFix({ id: c.id, label: c.label, powerKw: c.powerKw, exceedanceHours: NaN }),
    id: 'trySmaller',
    label: WHATIF_TEXTS.trySmaller(c.label),
  };
}

/**
 * Aandeel voor de warmtepomp in hele procenten. De focus gaat naar de stapper in Wat als? (die toont het budget met
 * het aandeel), niet naar het veld in de Basis: dat zou de ingeklapte Basis openklappen boven het oordeel.
 */
export function shareFix(pct: number): Fix {
  return {
    id: 'share',
    label: VERDICT_TEXTS.fix.share(pct),
    undoLabel: VERDICT_TEXTS.undo.share(pct),
    pending: false,
    target: 'connectionStepper',
    apply: (i) => ({ ...i, grid: { ...i.grid, heatPumpShare: pct / 100 } }),
  };
}

/**
 * Kleinere aansluiting met buffer en batterij uit één rasterpunt. Het buffervolume blijft exact het rasterpunt (het
 * verband is niet monotoon, B10); de rasterbatterij gaat naar boven op de schuifstap (batteryOnStep), zodat knoptekst,
 * melding en schuif dezelfde waarde tonen.
 */
export function smallerWithFix(
  c: ConnectionDef,
  volumeM3: number,
  gridCapacityKwh: number,
  ranges: Pick<Ranges, 'batteryStepKwh' | 'batteryMaxKwh'>,
): Fix {
  const v = cleanVolume(volumeM3);
  const capacityKwh = batteryOnStep(gridCapacityKwh, ranges);
  return {
    id: 'smaller',
    label: VERDICT_TEXTS.fix.trySmallerWith(c.label, v, capacityKwh),
    undoLabel: VERDICT_TEXTS.undo.smaller(c.label, v, capacityKwh),
    pending: false,
    target: 'connectionStepper',
    apply: (i) =>
      withConnection({ id: c.id, powerKw: c.powerKw })(withBattery(capacityKwh)(withBuffer(v)(i))),
  };
}

/** "↺ Zonder maatregelen": buffer en batterij op 0. */
export function withoutMeasuresFix(): Fix {
  return {
    id: 'withoutMeasures',
    label: UI_LABELS.withoutMeasures,
    undoLabel: VERDICT_TEXTS.undo.withoutMeasures,
    pending: false,
    target: 'buffer',
    apply: (i) => withBattery(0)(withBuffer(0)(i)),
  };
}

/** Kleinste batterij voor 0 uur, naar boven afgerond op de schuifstap (B9); null als die er niet is. */
export function batteryForZero(a: Analysis): number | null {
  const rb = a.requiredBattery;
  if (!rb || !rb.feasible || !(rb.capacityKwh > 0)) return null;
  return ceilToStep(rb.capacityKwh, a.ranges.batteryStepKwh);
}

/** Aandeel waarbij de huidige meterpiek precies binnen het budget valt (B11), in hele procenten. */
export function shareForPeak(a: Analysis): number {
  return Math.ceil((100 * exceedanceKpis(a).pGridMaxKw) / a.connectionKw - 1e-9);
}

/**
 * Heeft het WP-budget het laden van de boiler ergens afgeremd (zonder batterij)? Tapwater gaat vóór de
 * ruimteverwarming en laadt per uur min(capaciteit, ruimte in de boiler, budget × COP). De boiler is dus opslag:
 * remt het budget het laden af, dan laadt de boiler bij een groter budget sneller en kan de piek aan de meter
 * stijgen (nieuwbouw: 2,905 kW bij 40 %, 2,966 kW bij 51 %, met budget 2,933 kW). Remt het budget nergens af, dan
 * is de doorrekening gelijk aan die zonder budget en verandert een groter budget niets aan de piek.
 * Het laden van de boiler hangt niet af van de modus (tapwater komt eerst), dus de uurreeks van de hoofdsimulatie
 * volstaat. De inregelweek vóór het rekenjaar staat niet in de uurreeksen; de test over alle voorbeelden bewaakt dat.
 */
export function boilerLimitedByBudget(a: Analysis): boolean {
  const eTank = tankEnergy(a.input.building);
  if (!(eTank > 0)) return false;
  if (!(a.pLimitKw > 0)) return true;
  const s = a.main.series;
  for (let t = 0; t < s.qDhw.length; t++) {
    const q = s.qDhw[t];
    if (!(q > 0)) continue;
    // ruimte in de boiler vóór het laden in dit uur (socTank is de inhoud ná het laden)
    const room = eTank - (s.socTank[t] - q);
    if (q < Math.min(s.capacityKw[t], room) - 1e-9) return true;
  }
  return false;
}

/**
 * "Wat helpt" (maximaal 4, in deze volgorde): buffer uit het raster, batterij, grotere aansluiting, groter aandeel.
 * `targetH` = toegestane uren voor de buffer (bij "binnen toegestaan" 0: de buffer moet dan echt helpen).
 */
export function helpFixes(a: Analysis, sens: SensitivityState | null, targetH: number): Fix[] {
  const input = a.input;
  const V = input.buffer.volumeM3;
  const E = input.battery.capacityKwh;
  const fixes: Fix[] = [];

  // buffer: kleinste exacte rasterpunt V > 0 waarop de warmtepomp zonder batterij past (B10)
  if (input.heatPump.sizingMode === 'auto') {
    const status = gridStatus(sens, input);
    if (status === 'pending') fixes.push(pendingFix('buffer', 'buffer'));
    else if (status === 'ready' && sens) {
      const f = firstFitVolume(sens.rows, targetH);
      if (f && Math.abs(f.volumeM3 - V) > 1e-9) fixes.push(bufferFix(f.volumeM3, E > 0));
    }
  }

  // batterij: benodigde capaciteit naar boven afgerond op de schuifstap (B9), binnen het schuifbereik
  const e = batteryForZero(a);
  if (e !== null && e > E + 1e-9 && e <= a.ranges.batteryMaxKwh + 1e-9) fixes.push(batteryFix(e));

  // aansluiting: de kleinste passende, als die groter is dan de huidige
  if (a.smallest.powerKw > a.connectionKw + 1e-9) fixes.push(connectionFix(a.smallest));

  // aandeel: alleen zonder opslag is de drempel exact (B11); de boiler telt als opslag zodra het budget hem afremt
  if (V === 0 && E === 0 && !boilerLimitedByBudget(a)) {
    const p = shareForPeak(a);
    if (p <= 100 && p > 100 * input.grid.heatPumpShare + 1e-9) fixes.push(shareFix(p));
  }
  return fixes.slice(0, 4);
}

/**
 * "Kleinere aansluiting volstaat ook" (maximaal 1): exact uit het model als de kleinste passende aansluiting kleiner
 * is; anders uit het raster de eerstvolgende kleinere standaardaansluiting met buffer en batterij van één rasterpunt.
 */
export function smallerFixes(a: Analysis, sens: SensitivityState | null): Fix[] {
  const input = a.input;
  if (a.smallest.powerKw < a.connectionKw - 1e-9)
    return [connectionFix(a.smallest, VERDICT_TEXTS.fix.trySmaller(connectionText(a.smallest)))];
  if (input.heatPump.sizingMode !== 'auto' || input.battery.powerKw !== null) return [];
  const c = smallerOption(input.grid);
  if (!c || !(c.powerKw < a.connectionKw - 1e-9)) return [];
  const status = gridStatus(sens, input);
  if (status === 'pending') return [pendingFix('smaller', 'connectionStepper')];
  if (status !== 'ready' || !sens) return [];
  const fit = smallestFitFor(sens.rows, c, input.buffer.volumeM3);
  return fit ? [smallerWithFix(c, fit.volumeM3, fit.capacityKwh, a.ranges)] : [];
}
