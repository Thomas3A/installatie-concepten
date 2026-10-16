// Typen van het peakshaving-model. Eenheden intern: kW, kWh, °C/K en uren (spec §0.1).
import type { ConnectionId } from '../data/connections';
import type { EmitterPreset } from '../data/heatPumpCurves';

export type { ConnectionId } from '../data/connections';
export type { EmitterPreset } from '../data/heatPumpCurves';

export type BuildingUse = 'residential' | 'office';

/** Keuze in de UI: één woning, meerdere woningen op één warmtepomp, of kantoor. */
export type BuildingKind = 'single' | 'multi' | 'office';

export interface DhwConfig {
  enabled: boolean;
  /** nuttige tapwaterbehoefte [kWh/dag] bij 10 °C koud water */
  dailyKwh: number;
  /** boilervat [l] */
  tankLitre: number;
  /** boilertemperatuur [°C] */
  tankTempC: number;
}

export interface Building {
  use: BuildingUse;
  /**
   * aantal woningen op dezelfde warmtepomp (woning; kantoor altijd 1). Alleen voor invoer en weergave: het model rekent
   * met de totalen van het gebouw (designLoadKw, dhw.dailyKwh en dhw.tankLitre gelden voor alle woningen samen).
   */
  dwellings: number;
  /** ontwerpwarmteverlies bij designOutdoorC en designIndoorC, excl. opwarmtoeslag [kW] */
  designLoadKw: number;
  designOutdoorC: number;
  designIndoorC: number;
  setpointUseC: number;
  setpointSetbackC: number;
  /** stookgrens tijdens gebruik [°C]: winsten = UA·(setpointUse − balanceTemp) */
  balanceTempC: number;
  /** tijdconstante τ van de binnenknoop [h] */
  timeConstantH: number;
  /** traagheid gevel: 1e-orde filter op T_e [h]; 0 = uit */
  envelopeLagH: number;
  /** max. opwarmvermogen boven het stationaire verlies, als fractie van designLoadKw */
  boostFraction: number;
  /** kantoor: gebruik [start, eind) op ma–vr [h] */
  useStartH: number;
  useEndH: number;
  /** kantoor: opstookuren vóór gebruiksaanvang [h] */
  preheatH: number;
  dhw: DhwConfig;
}

export type SizingMode = 'auto' | 'manual';

export interface HeatPump {
  emitterPreset: EmitterPreset;
  /** maximale aanvoertemperatuur van de warmtepomp [°C] */
  maxSupplyC: number;
  carnotEfficiency: number;
  /** elektrisch bijstookelement [kW], COP 1; 0 = geen */
  backupHeaterKw: number;
  sizingMode: SizingMode;
  /** thermisch vermogen bij A7/W35 [kW] (bij 'auto' overschreven door de dimensionering) */
  nominalKw: number;
}

export type BufferStrategy = 'predictive' | 'always';

export interface ThermalBuffer {
  volumeM3: number;
  strategy: BufferStrategy;
}

export interface Battery {
  /** bruto capaciteit [kWh] */
  capacityKwh: number;
  /** laad/ontlaadvermogen [kW]; null = automatisch 0,5 C */
  powerKw: number | null;
}

/** 'exceedance' = overschrijding tonen (zacht); 'limited' = aansluiting begrenst (hard). */
export type OperatingMode = 'exceedance' | 'limited';

export interface GridConnection {
  connection: ConnectionId;
  /** gecontracteerd vermogen bij grootverbruik [kW] */
  contractedKw: number;
  /** deel van de aansluiting voor warmtepomp + batterij */
  heatPumpShare: number;
  allowedExceedanceH: number;
  allowedComfortLossH: number;
  mode: OperatingMode;
}

/** 'energie' | 'T5' | 'T1' of een werkelijk jaar 'knmi-1997'. */
export type ClimateYearId = string;

export interface ClimateYear {
  id: ClimateYearId;
  /** weergavenaam */
  name: string;
  /** 8760 uurwaarden buitentemperatuur [°C] */
  T: Float64Array;
  /** weekdag van 1 januari (ISO, 1 = maandag) */
  startWeekday: number;
}

/** Volledige invoer van het concept (ook de inhoud van de deelbare link). */
export interface PeakshavingInput {
  climateYear: ClimateYearId;
  building: Building;
  grid: GridConnection;
  heatPump: HeatPump;
  buffer: ThermalBuffer;
  battery: Battery;
}

/** Wat simulate() nodig heeft; het WP-vermogen is hier al bepaald. */
export interface SimulationSetup {
  building: Building;
  heatPump: HeatPump;
  buffer: ThermalBuffer;
  battery: Battery;
  /** elektrisch budget voor WP + batterij [kW]; Infinity = geen limiet */
  pLimitKw: number;
}

/** Uurreeksen (8760, alleen de getelde uren). */
export interface SimulationSeries {
  outdoorC: Float64Array;
  outdoorFilteredC: Float64Array;
  indoorC: Float64Array;
  setpointC: Float64Array;
  /** gevraagd vermogen ruimteverwarming (regelaar, incl. opwarmen) */
  qRequested: Float64Array;
  /** WP direct naar ruimteverwarming (incl. extra boven het budget in modus 'exceedance') */
  qSpaceHeating: Float64Array;
  qDhw: Float64Array;
  qBufferCharge: Float64Array;
  qBufferDischarge: Float64Array;
  qBackup: Float64Array;
  shortfall: Float64Array;
  bufferLoss: Float64Array;
  socBuffer: Float64Array;
  socBattery: Float64Array;
  socTank: Float64Array;
  /** elektrisch vermogen WP incl. bijstook */
  pElectric: Float64Array;
  /** batterij aan de netzijde: > 0 ontladen, < 0 laden */
  pBattery: Float64Array;
  /** netvermogen WP-groep (aan de meter) */
  pGrid: Float64Array;
  copSpace: Float64Array;
  capacityKw: Float64Array;
  dhwDemand: Float64Array;
  dhwShortfall: Float64Array;
}

/** Toestand aan het begin of eind van de 8760 getelde uren (voor energiebalansen). */
export interface StateSnapshot {
  indoorC: number;
  socBuffer: number;
  socBattery: number;
  socTank: number;
}

export interface SimulationKpis {
  exceedanceHours: number;
  maxExceedanceKw: number;
  exceedanceKwh: number;
  comfortLossHours: number;
  minIndoorC: number;
  shortfallKwh: number;
  dhwShortfallHours: number;
  dhwShortfallKwh: number;
  pElectricMaxKw: number;
  pGridMaxKw: number;
  qHeatPumpMaxKw: number;
  /** elektriciteit WP excl. bijstook [kWh] */
  eElectricKwh: number;
  /** elektriciteit bijstookelement [kWh] */
  eBackupKwh: number;
  /** warmtelevering aan het gebouw: WP direct + buffer + bijstook [kWh] */
  eSpaceHeatKwh: number;
  /** warmtelevering aan de boiler [kWh] */
  eDhwHeatKwh: number;
  eBufferInKwh: number;
  eBufferOutKwh: number;
  eBufferLossKwh: number;
  /** batterij laden, netzijde [kWh] */
  eBatteryInKwh: number;
  /** batterij ontladen, netzijde [kWh] */
  eBatteryOutKwh: number;
  eGridKwh: number;
  scop: number;
  /** max Q_ideal [kW] */
  qIdealMaxKw: number;
  /** Σ Q_ideal [kWh] (ruimteverwarming) */
  eSpaceDemandKwh: number;
  /** Σ tapvraag [kWh] */
  eDhwDemandKwh: number;
  bufferCycles: number;
  batteryCycles: number;
  bufferEnergyKwh: number;
  bufferDeltaT: number;
  pLimitKw: number;
}

export interface SimulationResult {
  mode: OperatingMode;
  /** true als de simulatie vroegtijdig is gestopt (abortAbove); de KPI's zijn dan onvolledig */
  aborted: boolean;
  kpis: SimulationKpis;
  /** null als de reeksen niet zijn opgeslagen (record = false) */
  series: SimulationSeries | null;
  start: StateSnapshot;
  end: StateSnapshot;
}
