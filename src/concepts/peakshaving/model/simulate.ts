// Pass 2: uursimulatie met dispatch van warmtepomp, boiler, buffer, bijstook en batterij (spec §5.6).
// Eén-op-één port van simuleer() uit tools/peakshaving_ref/peakshaving_ref.py; bij twijfel is de Python leidend.
import { TANK_RECHARGE_BELOW } from '../data/dhwProfile';
import { batteryEfficiency, batteryPower, batteryUsableEnergy } from './battery';
import { BUFFER_AMBIENT_C, BUFFER_HORIZON_H, bufferDeltaT, bufferEnergy, bufferUA } from './buffer';
import {
  buildingCapacity,
  buildingUA,
  buildSchedule,
  COMFORT_MARGIN_K,
  envelopeAlpha,
  HOURS_PER_YEAR,
  tankEnergy,
  WARMUP_HOURS,
  type Schedule,
} from './building';
import {
  bufferChargeTemperature,
  capacityFactor,
  cop,
  designReturnTemperature,
  supplyTemperature,
} from './heatPump';
import { computeIdealDemand } from './idealDemand';
import type {
  Building,
  ClimateYear,
  HeatPump,
  OperatingMode,
  SimulationKpis,
  SimulationResult,
  SimulationSeries,
  SimulationSetup,
  StateSnapshot,
} from './types';

/**
 * Alles wat per uur vastligt voor één gebouw, één set WP-curven en één klimaatjaar
 * (onafhankelijk van WP-vermogen, buffer, batterij en limiet). Hergebruik dit bij herhaalde simulaties.
 */
export interface PreparedYear {
  climate: ClimateYear;
  building: Building;
  schedule: Schedule;
  /** Q_ideal uit pass 1 [kW] */
  qIdeal: Float64Array;
  capacityFactor: Float64Array;
  supplyC: Float64Array;
  copSpace: Float64Array;
  copDhw: Float64Array;
  copBuffer: Float64Array;
  /** sleutel van de WP-curveparameters waarvoor deze voorbereiding geldt */
  curveKey: string;
}

function curveKeyOf(b: Building, hp: HeatPump): string {
  return [hp.emitterPreset, hp.maxSupplyC, hp.carnotEfficiency, b.designOutdoorC, b.dhw.tankTempC].join('|');
}

export function prepareYear(
  b: Building,
  hp: HeatPump,
  climate: ClimateYear,
  qIdeal?: Float64Array,
): PreparedYear {
  const n = HOURS_PER_YEAR;
  const schedule = buildSchedule(b, climate.startWeekday);
  const p: PreparedYear = {
    climate,
    building: b,
    schedule,
    qIdeal: qIdeal ?? computeIdealDemand(b, climate, schedule),
    capacityFactor: new Float64Array(n),
    supplyC: new Float64Array(n),
    copSpace: new Float64Array(n),
    copDhw: new Float64Array(n),
    copBuffer: new Float64Array(n),
    curveKey: curveKeyOf(b, hp),
  };
  const tBuf = bufferChargeTemperature(hp);
  for (let t = 0; t < n; t++) {
    const Te = climate.T[t];
    const Tsup = supplyTemperature(hp, b.designOutdoorC, Te);
    p.capacityFactor[t] = capacityFactor(Te);
    p.supplyC[t] = Tsup;
    p.copSpace[t] = cop(hp.carnotEfficiency, Te, Tsup);
    p.copDhw[t] = cop(hp.carnotEfficiency, Te, b.dhw.tankTempC);
    p.copBuffer[t] = cop(hp.carnotEfficiency, Te, tBuf);
  }
  return p;
}

export interface SimulateOptions {
  mode: OperatingMode;
  /** vooraf berekende Q_ideal (anders uit `prepared` of opnieuw berekend) */
  qIdeal?: Float64Array;
  prepared?: PreparedYear;
  /** uurreeksen opslaan (standaard ja) */
  record?: boolean;
  /**
   * Vroegtijdig stoppen zodra een teller de drempel overschrijdt (voor bisecties; de KPI's zijn dan onvolledig
   * en `aborted` is true). Verandert niets aan de uitkomst van de toets "teller ≤ drempel".
   */
  abortAbove?: { comfortLossHours?: number; dhwShortfallHours?: number; exceedanceHours?: number };
}

function allocSeries(): SimulationSeries {
  const n = HOURS_PER_YEAR;
  const f = (): Float64Array => new Float64Array(n);
  return {
    outdoorC: f(),
    outdoorFilteredC: f(),
    indoorC: f(),
    setpointC: f(),
    qRequested: f(),
    qSpaceHeating: f(),
    qDhw: f(),
    qBufferCharge: f(),
    qBufferDischarge: f(),
    qBackup: f(),
    shortfall: f(),
    bufferLoss: f(),
    socBuffer: f(),
    socBattery: f(),
    socTank: f(),
    pElectric: f(),
    pBattery: f(),
    pGrid: f(),
    copSpace: f(),
    capacityKw: f(),
    dhwDemand: f(),
    dhwShortfall: f(),
  };
}

export function simulate(
  setup: SimulationSetup,
  climate: ClimateYear,
  options: SimulateOptions,
): SimulationResult {
  const { building: b, heatPump: hp, buffer: buf, battery: bat } = setup;
  const hard = options.mode === 'limited';
  const prep =
    options.prepared &&
    options.prepared.climate === climate &&
    options.prepared.building === b &&
    options.prepared.curveKey === curveKeyOf(b, hp)
      ? options.prepared
      : prepareYear(b, hp, climate, options.qIdeal);
  const qIdeal = options.qIdeal ?? prep.qIdeal;
  const sch = prep.schedule;
  const record = options.record ?? true;
  const N = HOURS_PER_YEAR;
  const T = climate.T;

  const UA = buildingUA(b);
  const C = buildingCapacity(b);
  const alpha = envelopeAlpha(b);
  const boostMax = b.boostFraction * b.designLoadKw;
  const eBuf = bufferEnergy(buf.volumeM3, hp);
  const uaBuf = bufferUA(buf.volumeM3);
  const dtBuf = bufferDeltaT(hp);
  const tRetDesign = designReturnTemperature(hp);
  const eBat = batteryUsableEnergy(bat);
  const pBatMax = batteryPower(bat);
  const eta = batteryEfficiency();
  const eTank = tankEnergy(b);
  const pLim = setup.pLimitKw;
  const limited = Number.isFinite(pLim);
  const nominal = hp.nominalKw;
  const backupKw = hp.backupHeaterKw;
  const predictive = buf.strategy === 'predictive';
  const abortComfort = options.abortAbove?.comfortLossHours ?? Infinity;
  const abortDhw = options.abortAbove?.dhwShortfallHours ?? Infinity;
  const abortExceedance = options.abortAbove?.exceedanceHours ?? Infinity;
  let aborted = false;

  // WP-capaciteit per uur en de grens voor voorspellend laden: wat de WP alléén (thermisch én binnen P_limiet) kan
  const cap = new Float64Array(N);
  const solo = new Float64Array(N);
  for (let t = 0; t < N; t++) {
    cap[t] = nominal * prep.capacityFactor[t];
    solo[t] = limited ? Math.min(cap[t], pLim * prep.copSpace[t]) : cap[t];
  }

  // begintoestand (vol), 1 week inregelen
  let Tef = T[N - WARMUP_HOURS];
  let Ti = b.setpointUseC;
  let socBuf = eBuf;
  let socBat = eBat;
  let socTank = eTank;
  let dhwMode = false;

  const R = record ? allocSeries() : null;
  const start: StateSnapshot = { indoorC: Ti, socBuffer: socBuf, socBattery: socBat, socTank };

  let exceedanceHours = 0;
  let maxExceedanceKw = 0;
  let exceedanceKwh = 0;
  let comfortLossHours = 0;
  let minIndoorC = 99;
  let shortfallKwh = 0;
  let dhwShortfallHours = 0;
  let dhwShortfallKwh = 0;
  let pElectricMaxKw = 0;
  let pGridMaxKw = 0;
  let qHeatPumpMaxKw = 0;
  let eElectricKwh = 0;
  let eBackupKwh = 0;
  let eSpaceHeatKwh = 0;
  let eDhwHeatKwh = 0;
  let eBufferInKwh = 0;
  let eBufferOutKwh = 0;
  let eBufferLossKwh = 0;
  let eBatteryInKwh = 0;
  let eBatteryOutKwh = 0;
  let eGridKwh = 0;
  let eDhwDemandKwh = 0;

  for (let h = -WARMUP_HOURS; h < N; h++) {
    const t = h < 0 ? h + N : h;
    if (h === 0) {
      start.indoorC = Ti;
      start.socBuffer = socBuf;
      start.socBattery = socBat;
      start.socTank = socTank;
    }
    const Te = T[t];
    Tef += alpha * (Te - Tef);
    const Tset = sch.setpoint[t];
    const g = sch.gains[t];

    // --- vraag ruimteverwarming (regelaar) ---
    const qSteady = UA * (Ti - Tef) - g;
    const qReq = Math.max(0, qSteady + Math.min(C * (Tset - Ti), boostMax));

    // --- tapwater: boiler ---
    const tap = sch.dhwDemand[t];
    let tapShortfall = 0;
    if (tap > 0) {
      if (socTank >= tap) socTank -= tap;
      else {
        tapShortfall = tap - socTank;
        socTank = 0;
      }
    }
    if (eTank > 0) {
      if (!dhwMode && socTank < TANK_RECHARGE_BELOW * eTank) dhwMode = true;
      if (dhwMode && socTank >= eTank - 1e-9) dhwMode = false;
    }

    // --- WP-capaciteit en COP's ---
    const capT = cap[t];
    const copCv = prep.copSpace[t];
    const copTap = prep.copDhw[t];
    const copBuf = prep.copBuffer[t];

    // elektrisch budget van de begrenzer = limiet + wat de batterij dit uur kan ontladen (netzijde)
    const batDisMax = Math.min(pBatMax, socBat * eta);
    const budget = pLim + batDisMax; // Infinity zonder limiet
    let pEl = 0;

    // 1) tapwater (prioriteit): WP in boilerbedrijf, begrensd door capaciteit en budget
    let qTap = 0;
    if (dhwMode && eTank > 0) {
      qTap = Math.min(capT, eTank - socTank, Math.max(0, (budget - pEl) * copTap));
      socTank += qTap;
      pEl += qTap / copTap;
      if (socTank >= eTank - 1e-9) dhwMode = false;
    }
    let capRest = capT - qTap;

    // 2) ruimteverwarming direct door de WP, binnen het budget van de begrenzer
    let qCv = Math.min(qReq, capRest, Math.max(0, (budget - pEl) * copCv));
    pEl += qCv / copCv;
    capRest -= qCv;
    let shortfall = qReq - qCv;

    // 3) tekort uit de buffer
    const qBufOut = Math.min(shortfall, socBuf);
    socBuf -= qBufOut;
    shortfall -= qBufOut;

    // 3b) 'exceedance': buffer leeg → WP levert tóch boven de limiet (telt als overschrijding)
    if (!hard && shortfall > 0 && capRest > 0) {
      const qExtra = Math.min(shortfall, capRest);
      qCv += qExtra;
      pEl += qExtra / copCv;
      capRest -= qExtra;
      shortfall -= qExtra;
    }

    // 4) bijstook (COP 1): 'limited' binnen het budget, 'exceedance' onbegrensd
    let qBackup = 0;
    if (backupKw > 0 && shortfall > 0) {
      qBackup = Math.min(shortfall, backupKw, hard ? Math.max(0, budget - pEl) : backupKw);
      pEl += qBackup;
      shortfall -= qBackup;
    }

    // 5) buffer laden met de restcapaciteit, alleen binnen P_limiet (niet met batterijstroom)
    let qBufIn = 0;
    if (eBuf > 0 && capRest > 0 && socBuf < eBuf) {
      let charge = true;
      if (predictive) {
        // (a) binnen de horizon een uur waarin de WP alléén tekortschiet, of
        // (b) reserve om de ruimteverwarming te overbruggen tijdens boilerbedrijf: max_k Q_ideal/cap · E_boiler/2
        charge = false;
        let reserve = 0;
        for (let k = 1; k <= BUFFER_HORIZON_H; k++) {
          const tk = (t + k) % N;
          if (qIdeal[tk] > solo[tk]) {
            charge = true;
            break;
          }
          if (eTank > 0 && cap[tk] > 0) reserve = Math.max(reserve, ((qIdeal[tk] / cap[tk]) * eTank) / 2);
        }
        if (!charge && socBuf < Math.min(reserve, eBuf) - 1e-9) charge = true;
      }
      if (charge) {
        const roomEl = limited ? Math.max(0, pLim - pEl) : Infinity;
        qBufIn = Math.min(capRest, eBuf - socBuf, roomEl * copBuf);
        socBuf += qBufIn;
        pEl += qBufIn / copBuf;
      }
    }

    // bufferverlies
    let loss = 0;
    if (buf.volumeM3 > 0) {
      const tMean = tRetDesign + (eBuf > 0 ? socBuf / eBuf : 0) * dtBuf;
      loss = Math.min(socBuf, uaBuf * Math.max(tMean - BUFFER_AMBIENT_C, 0));
      socBuf -= loss;
    }

    // 6) batterij: afschaven boven de limiet, gretig laden eronder
    let pBat = 0;
    if (limited) {
      if (pEl > pLim + 1e-9) {
        pBat = Math.min(pEl - pLim, batDisMax);
        socBat -= pBat / eta;
      } else if (pEl < pLim && socBat < eBat - 1e-9) {
        const pCharge = Math.min(pLim - pEl, pBatMax, (eBat - socBat) / eta);
        pBat = -pCharge;
        socBat += pCharge * eta;
      }
    }
    const pNet = pEl - pBat;

    // gebouw: energiebalans
    const qDelivered = qCv + qBufOut + qBackup;
    Ti += (qDelivered - UA * (Ti - Tef) + g) / C;

    if (h < 0) continue;

    // --- KPI's ---
    if (limited && pNet > pLim + 1e-6) {
      exceedanceHours++;
      maxExceedanceKw = Math.max(maxExceedanceKw, pNet - pLim);
      exceedanceKwh += pNet - pLim;
    }
    if (sch.inUse[t] === 1 && Ti < Tset - COMFORT_MARGIN_K) comfortLossHours++;
    minIndoorC = Math.min(minIndoorC, Ti);
    shortfallKwh += shortfall;
    if (tapShortfall > 1e-9) {
      dhwShortfallHours++;
      dhwShortfallKwh += tapShortfall;
    }
    pElectricMaxKw = Math.max(pElectricMaxKw, pEl);
    pGridMaxKw = Math.max(pGridMaxKw, pNet);
    qHeatPumpMaxKw = Math.max(qHeatPumpMaxKw, qCv + qTap + qBufIn);
    eElectricKwh += pEl - qBackup;
    eBackupKwh += qBackup;
    eSpaceHeatKwh += qCv + qBufOut + qBackup;
    eDhwHeatKwh += qTap;
    eBufferInKwh += qBufIn;
    eBufferOutKwh += qBufOut;
    eBufferLossKwh += loss;
    if (pBat > 0) eBatteryOutKwh += pBat;
    else eBatteryInKwh += -pBat;
    eGridKwh += pNet;
    eDhwDemandKwh += tap;

    if (R) {
      R.outdoorC[t] = Te;
      R.outdoorFilteredC[t] = Tef;
      R.indoorC[t] = Ti;
      R.setpointC[t] = Tset;
      R.qRequested[t] = qReq;
      R.qSpaceHeating[t] = qCv;
      R.qDhw[t] = qTap;
      R.qBufferCharge[t] = qBufIn;
      R.qBufferDischarge[t] = qBufOut;
      R.qBackup[t] = qBackup;
      R.shortfall[t] = shortfall;
      R.bufferLoss[t] = loss;
      R.socBuffer[t] = socBuf;
      R.socBattery[t] = socBat;
      R.socTank[t] = socTank;
      R.pElectric[t] = pEl;
      R.pBattery[t] = pBat;
      R.pGrid[t] = pNet;
      R.copSpace[t] = copCv;
      R.capacityKw[t] = capT;
      R.dhwDemand[t] = tap;
      R.dhwShortfall[t] = tapShortfall;
    }
    if (
      comfortLossHours > abortComfort ||
      dhwShortfallHours > abortDhw ||
      exceedanceHours > abortExceedance
    ) {
      aborted = true;
      break;
    }
  }

  let qIdealMaxKw = -Infinity;
  let eSpaceDemandKwh = 0;
  for (let t = 0; t < N; t++) {
    if (qIdeal[t] > qIdealMaxKw) qIdealMaxKw = qIdeal[t];
    eSpaceDemandKwh += qIdeal[t];
  }
  const eElTotal = eElectricKwh + eBackupKwh;
  const kpis: SimulationKpis = {
    exceedanceHours,
    maxExceedanceKw,
    exceedanceKwh,
    comfortLossHours,
    minIndoorC,
    shortfallKwh,
    dhwShortfallHours,
    dhwShortfallKwh,
    pElectricMaxKw,
    pGridMaxKw,
    qHeatPumpMaxKw,
    eElectricKwh,
    eBackupKwh,
    eSpaceHeatKwh,
    eDhwHeatKwh,
    eBufferInKwh,
    eBufferOutKwh,
    eBufferLossKwh,
    eBatteryInKwh,
    eBatteryOutKwh,
    eGridKwh,
    scop: eElTotal > 0 ? (eSpaceHeatKwh + eDhwHeatKwh) / eElTotal : 0,
    qIdealMaxKw,
    eSpaceDemandKwh,
    eDhwDemandKwh,
    bufferCycles: eBuf > 0 ? eBufferOutKwh / eBuf : 0,
    batteryCycles: eBat > 0 ? eBatteryOutKwh / eBat : 0,
    bufferEnergyKwh: eBuf,
    bufferDeltaT: dtBuf,
    pLimitKw: pLim,
  };
  return {
    mode: options.mode,
    aborted,
    kpis,
    series: R,
    start,
    end: { indoorC: Ti, socBuffer: socBuf, socBattery: socBat, socTank },
  };
}
