// Effectregels onder de hendels van Wat als? (UX-plan §5.2) en de aansluitingsstapper. Puur: uit de doorrekening,
// dus ze bewegen pas mee als de analyse klaar is; de schuiven zelf volgen direct de invoer, net als het opslagdeel van
// de bufferregel (dat hangt alleen van de invoer af).
import { fmt } from '../../../core/format';
import { CONNECTIONS, LARGE_CONNECTION_ID, LARGE_CONNECTION_LABEL } from '../data/connections';
import type { Analysis } from '../model/analysis';
import { batteryPower, batteryUsableEnergy } from '../model/battery';
import { connectionPowerKw, limitFromConnection } from '../model/grid';
import { currentConnectionText, exceedanceKpis } from '../model/kpis';
import { bufferHoursOfPeak, type Ranges } from '../model/ranges';
import type { GridConnection, PeakshavingInput } from '../model/types';
import { WHATIF_TEXTS } from '../texts';
import { batteryFix, tryConnectionFix, type Fix } from './fixes';
import { ceilToStep, kwDigitsFor } from './format';
import {
  connectionIndex,
  gridMatches,
  plateauStart,
  smallerOption,
  type SensitivityState,
} from './sensitivityFacts';
import { sizingFailed } from './verdict';

export interface BufferEffect {
  /** "Geen buffer · 24,1 kWh per m³" of "12,0 kWh opslag ≈ 1,5 uur piekvermogen": alleen uit de invoer */
  storage: string;
  /**
   * "warmtepomp 10,6 → 9,4 kW" uit de doorrekening; null zonder buffer, en ook zolang de getoonde doorrekening nog
   * zonder buffer is (tijdens het schuiven vanaf 0)
   */
  sizing: string | null;
  /** de hele regel: "12,0 kWh opslag ≈ 1,5 uur piekvermogen · warmtepomp 10,6 → 9,4 kW" */
  text: string;
  /** extra regel vanaf het knikpunt (alleen met een passend raster) */
  plateau: string | null;
}

/** Opslagdeel van de bufferregel: alleen uit de invoer, dus het beweegt direct met de schuif mee. */
export function bufferStorage(volumeM3: number, kwhPerM3: number, designLoadKw: number): string {
  if (!(volumeM3 > 0)) return WHATIF_TEXTS.bufferNone(kwhPerM3);
  return WHATIF_TEXTS.bufferStorage(volumeM3 * kwhPerM3, bufferHoursOfPeak(volumeM3, kwhPerM3, designLoadKw));
}

/**
 * Effectregel onder de bufferschuif. `live` is de invoer van dit moment (standaard die van de doorrekening): het
 * opslagdeel en de regel vanaf het knikpunt volgen die direct, het warmtepompdeel komt uit de doorrekening `a`.
 */
export function bufferEffect(
  a: Analysis,
  sens: SensitivityState | null = null,
  live: { input: PeakshavingInput; ranges: Pick<Ranges, 'kwhPerM3'> } = a,
): BufferEffect {
  const V = live.input.buffer.volumeM3;
  const storage = bufferStorage(V, live.ranges.kwhPerM3, live.input.building.designLoadKw);
  const manual = a.input.heatPump.sizingMode === 'manual';
  const sizing =
    V > 0 && a.input.buffer.volumeM3 > 0
      ? WHATIF_TEXTS.bufferSizing(a.sizing.withoutBuffer, a.sizing.withBuffer, manual)
      : null;
  let plateau: string | null = null;
  if (V > 0 && gridMatches(sens, live.input)) {
    const knee = plateauStart(sens.rows);
    if (knee && V >= knee.volumeM3 - 1e-9) plateau = WHATIF_TEXTS.bufferPlateau;
  }
  return { storage, sizing, text: sizing ? `${storage} · ${sizing}` : storage, plateau };
}

export interface BatteryState {
  text: string;
  /** knop achter de regel: "Zet" (naam "Zet op 1,0 kWh") of "Probeer 1×25 A" (met ongedaan maken) */
  fix: Fix | null;
}

/**
 * "Zet": de waarde staat al in de regel ervoor; de toegankelijke naam noemt hem wel. Een handmatig batterijvermogen
 * gaat daarbij naar automatisch (0,5 C); de melding zegt dat.
 */
function setFix(kwh: number, resetsPower: boolean): Fix {
  return { ...batteryFix(kwh, WHATIF_TEXTS.set, resetsPower), name: WHATIF_TEXTS.setTo(kwh) };
}

/**
 * Knop "◀ Probeer {kleiner}" bij een batterij die (nog) niets doet. Is de kleinste passende aansluiting kleiner dan
 * de huidige, dan niet één stap kleiner (daar doet de batterij vaak nog steeds niets, en het oordeel zegt al
 * "Probeer {kleinste}"), maar:
 * - zonder batterij: één stap onder de kleinste passende, want die past zonder batterij; daaronder is er een nodig;
 * - met batterij: de kleinste passende zelf (die is met deze batterij berekend), zoals de knop bij het oordeel.
 * Anders één stap kleiner dan de huidige. null aan de onderkant van de lijst.
 */
function trySmallerTarget(a: Analysis): Fix | null {
  const s = a.smallest;
  const grid = a.input.grid;
  if (s.powerKw < a.connectionKw - 1e-9) {
    if (a.input.battery.capacityKwh > 0) return tryConnectionFix(s);
    const below = smallerOption({ connection: s.id, contractedKw: grid.contractedKw });
    return below ? tryConnectionFix(below) : null;
  }
  const below = smallerOption(grid);
  return below && below.powerKw < a.connectionKw - 1e-9 ? tryConnectionFix(below) : null;
}

/** Effectregel onder de batterijschuif; `ranges` levert de schuifstap en het schuifbereik. */
export function batteryState(a: Analysis, ranges: Ranges = a.ranges): BatteryState {
  const t = WHATIF_TEXTS;
  const battery = a.input.battery;
  const E = battery.capacityKwh;
  // niet te dimensioneren: de doorrekening gebruikt de terugvalwaarde (3 × het piekvermogen), die het oordeel en de
  // tegel bewust niet tonen; een batterij voor 0 uur, de meterpiek of een kleinere aansluiting zou daarop rekenen
  if (sizingFailed(a)) {
    const facts =
      E > 0 ? `${t.batteryEffectLimited(batteryUsableEnergy(battery), batteryPower(battery))} · ` : '';
    return { text: facts + t.batterySizingFailed, fix: null };
  }
  const ex = exceedanceKpis(a);
  const hours = ex.exceedanceHours;
  const rb = a.requiredBattery;
  const d = kwDigitsFor(a.pLimitKw);
  const needed =
    rb && rb.feasible && rb.capacityKwh > 0 ? ceilToStep(rb.capacityKwh, ranges.batteryStepKwh) : null;
  const settable = needed !== null && needed <= ranges.batteryMaxKwh + 1e-9;
  const manualPower = battery.powerKw !== null;
  // een batterij helpt pas bij een kleinere aansluiting: die als knop aanbieden
  const trySmaller = trySmallerTarget(a);
  const withSmaller = (text: string): BatteryState => ({
    text: trySmaller ? `${text} ${t.batteryHelpsSmaller}` : text,
    fix: trySmaller,
  });

  if (!(E > 0)) {
    if (hours > 0) {
      if (needed === null) return { text: rb && !rb.feasible ? t.batteryInfeasible : '', fix: null };
      return { text: t.batteryNeeded(needed), fix: settable ? setFix(needed, manualPower) : null };
    }
    return withSmaller(t.batteryNotNeeded(currentConnectionText(a)));
  }
  // de batterij is niet nodig: zonder batterij al geen uur boven de limiet
  if (rb && rb.feasible && rb.capacityKwh === 0)
    return withSmaller(t.batteryIdle(ex.pGridMaxKw, a.pLimitKw, d));

  const usable = batteryUsableEnergy(battery);
  const power = batteryPower(battery);
  // met begrenzer volgt `noBattery` de modus: dan geen pijl "zonder → met"
  let text =
    a.main.mode === 'exceedance'
      ? t.batteryEffect(usable, power, a.noBattery.pGridMaxKw, ex.pGridMaxKw, d)
      : t.batteryEffectLimited(usable, power);
  let fix: Fix | null = null;
  if (needed !== null && rb && E + 1e-9 < rb.capacityKwh) {
    text += t.batteryMore(needed);
    if (settable) fix = setFix(needed, manualPower);
  } else if (needed !== null && settable && E > needed + ranges.batteryStepKwh + 1e-9) {
    // ruim meer dan nodig (meer dan één schuifstap): de kleinste batterij voor 0 uur noemen, met "Zet"
    text += t.batteryEnough(needed);
    fix = setFix(needed, manualPower);
  }
  return { text, fix };
}

type GridChoice = Pick<GridConnection, 'connection' | 'contractedKw'>;

export interface ConnectionSteps {
  /** "1×35 A · 8,05 kW · limiet 3,22 kW (40 %)" */
  text: string;
  /** naam van de huidige keuze: "1×35 A" of "Grootverbruik" */
  label: string;
  /** wijziging voor ◀ (null aan de rand: 1×25 A) */
  smaller: GridChoice | null;
  /** wijziging voor ▶ (null aan de rand: grootverbruik) */
  larger: GridChoice | null;
}

/** Gecontracteerd vermogen bij ▶ vanaf 3×80 A: minstens het vermogen van 3×80 A, op 5 kW naar boven afgerond. */
export function largeContractedKw(current: number): number {
  const top = CONNECTIONS[CONNECTIONS.length - 1].powerKw;
  return Math.max(current, Math.ceil(top / 5) * 5);
}

/** Aansluitingsstapper: volgorde van CONNECTIONS, daarna grootverbruik (§5). */
export function connectionSteps(
  grid: Pick<GridConnection, 'connection' | 'contractedKw' | 'heatPumpShare'>,
): ConnectionSteps {
  const i = connectionIndex(grid.connection);
  const large = grid.connection === LARGE_CONNECTION_ID;
  const last = CONNECTIONS.length - 1;
  const powerKw = connectionPowerKw(grid);
  const budgetKw = limitFromConnection(powerKw, grid.heatPumpShare);
  const label = large ? LARGE_CONNECTION_LABEL : (CONNECTIONS[i]?.label ?? grid.connection);
  const kw = fmt(powerKw, large ? 0 : kwDigitsFor(powerKw));
  const budget = fmt(budgetKw, kwDigitsFor(budgetKw));
  // vanaf grootverbruik (index = aantal standaardaansluitingen) naar 3×80 A
  const smaller: GridChoice | null =
    i > 0 ? { connection: CONNECTIONS[i - 1].id, contractedKw: grid.contractedKw } : null;
  const larger: GridChoice | null = large
    ? null
    : i < last
      ? { connection: CONNECTIONS[i + 1].id, contractedKw: grid.contractedKw }
      : { connection: LARGE_CONNECTION_ID, contractedKw: largeContractedKw(grid.contractedKw) };
  return {
    text: WHATIF_TEXTS.stepper(label, kw, budget, 100 * grid.heatPumpShare),
    label,
    smaller,
    larger,
  };
}
