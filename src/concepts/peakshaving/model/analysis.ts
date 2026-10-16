// Volledige doorrekening van één invoer voor de UI (draait in de Web Worker): dimensionering, hoofdsimulatie en
// tegenhanger, adviezen, robuustheid, meldingen en de afgeleide reeksen voor de grafieken.
import { EMITTER_PRESETS } from '../data/heatPumpCurves';
import { batteryPower } from './battery';
import { bufferKwhPerM3 } from './buffer';
import { COMFORT_MARGIN_K, HOURS_PER_YEAR, isPreheatHour, type Schedule } from './building';
import {
  climateInSentence,
  climateShortName,
  COLD_WEEK_HOURS,
  coldestWeekStart,
  coldWeekWindow,
  MONTH_START_HOUR,
} from './climate';
import { connectionLabel, connectionPowerKw, gridLimitKw } from './grid';
import { capacityFactor } from './heatPump';
import { normalizeInput, rangesOf } from './input';
import { buildMessages, type Message } from './messages';
import type { Ranges } from './ranges';
import { prepareYear, simulate, type PreparedYear } from './simulate';
import {
  requiredBattery,
  sensitivityRow,
  SENSITIVITY_BATTERY_FRACTIONS,
  SENSITIVITY_VOLUME_FRACTIONS,
  sizeHeatPump,
  smallestConnection,
  type BatteryAdvice,
  type ConnectionAdvice,
  type SensitivityRow,
} from './sizing';
import type {
  ClimateYear,
  ClimateYearId,
  OperatingMode,
  PeakshavingInput,
  SimulationKpis,
  SimulationSeries,
} from './types';

export interface RobustnessRow {
  climateId: ClimateYearId;
  name: string;
  selected: boolean;
  qIdealMaxKw: number;
  /** piek aan de meter in de gekozen modus [kW] */
  pGridMaxKw: number;
  /** uren overschrijding in modus 'exceedance' (zonder begrenzer) */
  exceedanceHours: number;
  /** uren comfortverlies in modus 'limited' (bij begrenzen) */
  comfortLossHours: number;
  /** SCOP in de gekozen modus */
  scop: number;
  /** elektriciteit WP incl. bijstook in de gekozen modus [kWh/jaar] */
  electricityKwh: number;
}

export interface MonthBalance {
  /** WP direct naar ruimteverwarming [kWh] */
  heatPumpDirect: number;
  bufferDischarge: number;
  backup: number;
  dhw: number;
  /** elektriciteit WP incl. bijstook [kWh] */
  electricity: number;
  /** NaN in een maand zonder elektriciteitsgebruik */
  scop: number;
}

export interface Analysis {
  input: PeakshavingInput;
  climateId: ClimateYearId;
  climateName: string;
  climateShort: string;
  startWeekday: number;
  ranges: Ranges;
  connectionKw: number;
  connectionLabel: string;
  pLimitKw: number;
  /** gebruikt WP-vermogen A7/W35 [kW] (automatisch = P_th,min met de ingestelde buffer) */
  nominalKw: number;
  sizing: { withBuffer: number; withoutBuffer: number; doubleBuffer: number | null };
  /** hoofdsimulatie in de gekozen modus; batterijverlies gecorrigeerd voor het verschil in lading begin/eind */
  main: { mode: OperatingMode; kpis: SimulationKpis; series: SimulationSeries; batteryLossKwh: number };
  /** tegenhanger in de andere modus */
  counterpart: { mode: OperatingMode; kpis: SimulationKpis };
  /** zelfde configuratie zonder batterij (gekozen modus) */
  noBattery: SimulationKpis;
  /** zonder maatregelen: buffer 0, batterij 0, WP = P_th,min(0) (3 × piekvermogen als dat niet te bepalen is) */
  withoutMeasures: { nominalKw: number; kpis: SimulationKpis; smallest: ConnectionAdvice };
  smallest: ConnectionAdvice;
  requiredBattery: BatteryAdvice | null;
  coldWeek: { start: number; from: number; to: number; meanOutdoorC: number };
  coldSpell: { days: number; meanC: number };
  /** per uur: in gebruik (1/0) en opstookuur (1/0), voor de banden in de grafieken */
  hours: { inUse: Uint8Array; preheat: Uint8Array };
  durationCurves: {
    /** gesorteerd aflopend */
    pGrid: Float64Array;
    pElectricNoBattery: Float64Array;
    pElectricWithoutBuffer: Float64Array;
    qIdeal: Float64Array;
  };
  /** WP-vermogen bij −10 °C: het gebruikte vermogen en P_th,min zonder buffer (NaN als niet te bepalen) [kW] */
  capacityAtMinus10: { withBuffer: number; withoutBuffer: number };
  monthly: MonthBalance[];
  robustness: RobustnessRow[];
  messages: Message[];
  /** rekentijd [ms] */
  elapsedMs: number;
}

function sortedDesc(a: Float64Array): Float64Array {
  return Float64Array.from(a).sort().reverse();
}

function mean(a: ArrayLike<number>, from: number, to: number): number {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i];
  return to > from ? s / (to - from) : NaN;
}

/**
 * Koudste periode voor de uitleg "uren, geen dagen": de langste reeks opeenvolgende dagen met een daggemiddelde
 * onder 0 °C die de koude week raakt; is die korter dan 2 dagen, dan de koude week zelf.
 */
export function coldSpellOf(T: ArrayLike<number>, coldWeekStart: number): { days: number; meanC: number } {
  const nDays = Math.floor(T.length / 24);
  const daily = new Float64Array(nDays);
  for (let d = 0; d < nDays; d++) daily[d] = mean(T, d * 24, d * 24 + 24);
  const d0 = Math.floor(coldWeekStart / 24);
  const d1 = Math.min(nDays - 1, Math.floor((coldWeekStart + COLD_WEEK_HOURS - 1) / 24));
  let best = { from: -1, to: -1 };
  let d = 0;
  while (d < nDays) {
    if (daily[d] < 0) {
      let e = d;
      while (e + 1 < nDays && daily[e + 1] < 0) e++;
      const overlaps = e >= d0 && d <= d1;
      if (overlaps && e - d > best.to - best.from) best = { from: d, to: e };
      d = e + 1;
    } else d++;
  }
  if (best.from < 0 || best.to - best.from + 1 < 2) {
    return { days: COLD_WEEK_HOURS / 24, meanC: mean(T, coldWeekStart, coldWeekStart + COLD_WEEK_HOURS) };
  }
  return { days: best.to - best.from + 1, meanC: mean(daily, best.from, best.to + 1) };
}

/** Maandbalans uit de uurreeksen. */
export function monthlyBalance(s: SimulationSeries): MonthBalance[] {
  const out: MonthBalance[] = [];
  for (let m = 0; m < 12; m++) {
    let direct = 0;
    let buf = 0;
    let backup = 0;
    let dhw = 0;
    let el = 0;
    for (let t = MONTH_START_HOUR[m]; t < MONTH_START_HOUR[m + 1]; t++) {
      direct += s.qSpaceHeating[t];
      buf += s.qBufferDischarge[t];
      backup += s.qBackup[t];
      dhw += s.qDhw[t];
      el += s.pElectric[t];
    }
    out.push({
      heatPumpDirect: direct,
      bufferDischarge: buf,
      backup,
      dhw,
      electricity: el,
      scop: el > 0 ? (direct + buf + backup + dhw) / el : NaN,
    });
  }
  return out;
}

/** Aandeel van de bepalende uren (comfortverlies of tapwatertekort) dat binnen [from, to) valt. */
function shareInWindow(s: SimulationSeries, inUse: Uint8Array, from: number, to: number): number | null {
  let all = 0;
  let inside = 0;
  for (let t = 0; t < HOURS_PER_YEAR; t++) {
    const fail =
      (inUse[t] === 1 && s.indoorC[t] < s.setpointC[t] - COMFORT_MARGIN_K) || s.dhwShortfall[t] > 1e-9;
    if (!fail) continue;
    all++;
    if (t >= from && t < to) inside++;
  }
  return all > 0 ? inside / all : null;
}

/** Opstookuren (kantoor): buiten gebruik maar op het gebruikssetpoint. */
function preheatHours(sch: Schedule, setpointUseC: number, setpointSetbackC: number): Uint8Array {
  const out = new Uint8Array(HOURS_PER_YEAR);
  if (setpointUseC === setpointSetbackC) return out;
  for (let t = 0; t < HOURS_PER_YEAR; t++)
    out[t] = sch.inUse[t] === 0 && sch.setpoint[t] === setpointUseC ? 1 : 0;
  return out;
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

export interface AnalyzeOptions {
  /** de drie referentiejaren (en eventueel het gekozen werkelijke jaar) voor de robuustheidstabel */
  robustnessYears?: ClimateYear[];
}

/** Doorrekening van één invoer in het gekozen klimaatjaar. */
export function analyze(raw: PeakshavingInput, climate: ClimateYear, options: AnalyzeOptions = {}): Analysis {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const input = normalizeInput(raw);
  const { building: b, heatPump: hp, buffer, battery, grid } = input;
  const ranges = rangesOf(input);
  const pLimitKw = gridLimitKw(grid);
  const prepared = prepareYear(b, hp, climate);
  const allowedComfort = grid.allowedComfortLossH;

  // --- dimensionering ---
  const sizingWith = sizeHeatPump(b, hp, buffer, climate, allowedComfort, prepared);
  const sizingWithout =
    buffer.volumeM3 > 0
      ? sizeHeatPump(b, hp, { ...buffer, volumeM3: 0 }, climate, allowedComfort, prepared)
      : sizingWith;
  const sizingDouble =
    buffer.volumeM3 > 0
      ? sizeHeatPump(b, hp, { ...buffer, volumeM3: 2 * buffer.volumeM3 }, climate, allowedComfort, prepared)
      : null;
  const fallbackKw = 3 * b.designLoadKw;
  const auto = hp.sizingMode === 'auto';
  const nominalKw = auto ? (Number.isFinite(sizingWith) ? sizingWith : fallbackKw) : hp.nominalKw;
  const hpUsed = { ...hp, nominalKw };
  const setup = { building: b, heatPump: hpUsed, buffer, battery, pLimitKw };

  // --- hoofdsimulatie en tegenhanger ---
  const mode = grid.mode;
  const other: OperatingMode = mode === 'exceedance' ? 'limited' : 'exceedance';
  const main = simulate(setup, climate, { mode, prepared });
  const counter = simulate(setup, climate, { mode: other, prepared });
  const exceedanceRun = mode === 'exceedance' ? main : counter;
  const limitedRun = mode === 'limited' ? main : counter;
  const noBattery = simulate({ ...setup, battery: { capacityKwh: 0, powerKw: null } }, climate, {
    mode,
    prepared,
  });

  // --- zonder maatregelen: referentie met een WP gedimensioneerd zonder buffer ---
  const nominal0 = Number.isFinite(sizingWithout) ? sizingWithout : fallbackKw;
  const bare = {
    building: b,
    heatPump: { ...hp, nominalKw: nominal0 },
    buffer: { ...buffer, volumeM3: 0 },
    battery: { capacityKwh: 0, powerKw: null },
  };
  const bareRun = simulate({ ...bare, pLimitKw }, climate, { mode: 'exceedance', prepared });
  const smallestWithout = smallestConnection(
    bare,
    grid.heatPumpShare,
    climate,
    grid.allowedExceedanceH,
    prepared,
  );

  // --- adviezen ---
  const smallest = smallestConnection(
    { building: b, heatPump: hpUsed, buffer, battery },
    grid.heatPumpShare,
    climate,
    grid.allowedExceedanceH,
    prepared,
  );
  const reqBattery = Number.isFinite(pLimitKw)
    ? requiredBattery(
        { building: b, heatPump: hpUsed, buffer, pLimitKw },
        climate,
        ranges.batteryMaxKwh,
        prepared,
      )
    : null;

  // --- koude week en koudegolf ---
  const start = coldestWeekStart(prepared.qIdeal, climate.T);
  const win = coldWeekWindow(start);
  const coldSpell = coldSpellOf(climate.T, start);
  let sizingHoursInColdWeek: number | null = null;
  if (Number.isFinite(sizingWith)) {
    const probe = simulate(
      {
        building: b,
        heatPump: { ...hp, nominalKw: 0.99 * sizingWith },
        buffer,
        battery: { capacityKwh: 0, powerKw: null },
        pLimitKw: Infinity,
      },
      climate,
      { mode: 'limited', prepared },
    );
    sizingHoursInColdWeek = shareInWindow(
      probe.series!,
      prepared.schedule.inUse,
      start,
      start + COLD_WEEK_HOURS,
    );
  }

  // --- robuustheid: zelfde configuratie (WP vast) in de andere jaren, in beide modi ---
  const years = options.robustnessYears ?? [climate];
  const robustness: RobustnessRow[] = years.map((y) => {
    const own = y === climate;
    const p: PreparedYear = own ? prepared : prepareYear(b, hpUsed, y);
    const run = (m: OperatingMode): SimulationKpis =>
      simulate(setup, y, { mode: m, prepared: p, record: false }).kpis;
    const kMain = own ? main.kpis : run(mode);
    const kOther = own ? counter.kpis : run(other);
    const kEx = mode === 'exceedance' ? kMain : kOther;
    const kLim = mode === 'limited' ? kMain : kOther;
    return {
      climateId: y.id,
      name: y.name,
      selected: own,
      qIdealMaxKw: kMain.qIdealMaxKw,
      pGridMaxKw: kMain.pGridMaxKw,
      exceedanceHours: kEx.exceedanceHours,
      comfortLossHours: kLim.comfortLossHours,
      scop: kMain.scop,
      electricityKwh: kMain.eElectricKwh + kMain.eBackupKwh,
    };
  });

  // --- meldingen ---
  const messages = buildMessages({
    climateInSentence: climateInSentence(climate.id),
    sizingMode: hp.sizingMode,
    sizingWithBuffer: sizingWith,
    sizingWithoutBuffer: sizingWithout,
    sizingDoubleBuffer: sizingDouble,
    bufferVolumeM3: buffer.volumeM3,
    bufferMaxM3: ranges.bufferMaxM3,
    bufferDeltaT: main.kpis.bufferDeltaT,
    bufferKwhPerM3: bufferKwhPerM3(hp),
    emitterLabel: EMITTER_PRESETS[hp.emitterPreset].id,
    maxSupplyC: hp.maxSupplyC,
    sizingHoursInColdWeek,
    coldSpell,
    exceedanceRun,
    limitedComfortLossHours: limitedRun.kpis.comfortLossHours,
    limitedMinIndoorC: limitedRun.kpis.minIndoorC,
    allowedComfortLossH: allowedComfort,
    pLimitKw,
    batteryCapacityKwh: battery.capacityKwh,
    batteryPowerKw: batteryPower(battery),
    backupHeaterKw: hp.backupHeaterKw,
    idealPeakInPreheat: isPreheatHour(b, climate.startWeekday, argmax(prepared.qIdeal)),
    boostKw: b.boostFraction * b.designLoadKw,
  });

  const cf10 = capacityFactor(-10);
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return {
    input,
    climateId: climate.id,
    climateName: climate.name,
    climateShort: climateShortName(climate.id),
    startWeekday: climate.startWeekday,
    ranges,
    connectionKw: connectionPowerKw(grid),
    connectionLabel: connectionLabel(grid),
    pLimitKw,
    nominalKw,
    sizing: { withBuffer: sizingWith, withoutBuffer: sizingWithout, doubleBuffer: sizingDouble },
    main: {
      mode,
      kpis: main.kpis,
      series: main.series!,
      batteryLossKwh: Math.max(
        0,
        main.kpis.eBatteryInKwh - main.kpis.eBatteryOutKwh - (main.end.socBattery - main.start.socBattery),
      ),
    },
    counterpart: { mode: other, kpis: counter.kpis },
    noBattery: noBattery.kpis,
    withoutMeasures: { nominalKw: nominal0, kpis: bareRun.kpis, smallest: smallestWithout },
    smallest,
    requiredBattery: reqBattery,
    coldWeek: {
      start,
      from: win.from,
      to: win.to,
      meanOutdoorC: mean(climate.T, start, start + COLD_WEEK_HOURS),
    },
    coldSpell,
    hours: {
      inUse: Uint8Array.from(prepared.schedule.inUse),
      preheat: preheatHours(prepared.schedule, b.setpointUseC, b.setpointSetbackC),
    },
    durationCurves: {
      pGrid: sortedDesc(main.series!.pGrid),
      pElectricNoBattery: sortedDesc(noBattery.series!.pElectric),
      pElectricWithoutBuffer: sortedDesc(bareRun.series!.pElectric),
      qIdeal: sortedDesc(prepared.qIdeal),
    },
    capacityAtMinus10: {
      withBuffer: nominalKw * cf10,
      withoutBuffer: sizingWithout * cf10,
    },
    monthly: monthlyBalance(main.series!),
    robustness,
    messages,
    elapsedMs: t1 - t0,
  };
}

/** Buffervolumes en batterijen van het gevoeligheidsraster bij een invoer. */
export function sensitivityAxes(input: PeakshavingInput): { volumes: number[]; batteries: number[] } {
  const r = rangesOf(input);
  return {
    volumes: SENSITIVITY_VOLUME_FRACTIONS.map((f) => f * r.bufferMaxM3),
    batteries: SENSITIVITY_BATTERY_FRACTIONS.map((f) => f * r.batteryMaxKwh),
  };
}

/** Gevoeligheidsraster (spec §5.9), rij voor rij; `onRow` maakt progressief tekenen mogelijk. */
export function sensitivityGrid(
  raw: PeakshavingInput,
  climate: ClimateYear,
  onRow?: (row: SensitivityRow, index: number, total: number) => void,
): SensitivityRow[] {
  const input = normalizeInput(raw);
  const { building: b, heatPump: hp, buffer, grid } = input;
  const prepared = prepareYear(b, hp, climate);
  const { volumes, batteries } = sensitivityAxes(input);
  const base = { building: b, heatPump: hp, buffer, pLimitKw: gridLimitKw(grid), share: grid.heatPumpShare };
  const rows: SensitivityRow[] = [];
  volumes.forEach((v, i) => {
    const row = sensitivityRow(
      base,
      climate,
      v,
      batteries,
      grid.allowedComfortLossH,
      grid.allowedExceedanceH,
      prepared,
    );
    rows.push(row);
    onRow?.(row, i, volumes.length);
  });
  return rows;
}

/** Sleutel van de invoer waarvan het gevoeligheidsraster afhangt (buffer, batterij en WP-vermogen niet). */
export function sensitivityKey(input: PeakshavingInput): string {
  const { building, grid, heatPump, buffer, climateYear } = input;
  return JSON.stringify({
    climateYear,
    building,
    grid,
    hp: { ...heatPump, nominalKw: 0, sizingMode: 'auto' },
    strategy: buffer.strategy,
  });
}
