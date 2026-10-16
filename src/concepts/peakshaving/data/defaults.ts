// Standaardwaarden woning en kantoor (spec §3; gelijk aan woning_defaults(8) en kantoor_defaults(100) in de referentie).
// Meerdere woningen (buiten de spec, zie docs/AANNAMES.md): woningstandaard met de totalen van n woningen.
import type {
  Battery,
  Building,
  BuildingKind,
  BuildingUse,
  GridConnection,
  HeatPump,
  PeakshavingInput,
  ThermalBuffer,
} from '../model/types';

export const DEFAULT_DESIGN_LOAD_KW: Record<BuildingUse, number> = { residential: 8, office: 100 };

export function residentialBuilding(designLoadKw = DEFAULT_DESIGN_LOAD_KW.residential): Building {
  return {
    use: 'residential',
    dwellings: 1,
    designLoadKw,
    designOutdoorC: -10,
    designIndoorC: 20,
    setpointUseC: 20,
    setpointSetbackC: 20,
    balanceTempC: 15,
    timeConstantH: 40,
    envelopeLagH: 2,
    boostFraction: 0.3,
    useStartH: 7,
    useEndH: 18,
    preheatH: 0,
    dhw: { enabled: true, dailyKwh: 10, tankLitre: 200, tankTempC: 55 },
  };
}

export function officeBuilding(designLoadKw = DEFAULT_DESIGN_LOAD_KW.office): Building {
  return {
    use: 'office',
    dwellings: 1,
    designLoadKw,
    designOutdoorC: -10,
    designIndoorC: 21,
    setpointUseC: 21,
    setpointSetbackC: 19,
    balanceTempC: 12,
    timeConstantH: 20,
    envelopeLagH: 2,
    boostFraction: 0.3,
    useStartH: 7,
    useEndH: 18,
    preheatH: 4,
    dhw: { enabled: false, dailyKwh: 0, tankLitre: 0, tankTempC: 55 },
  };
}

export function defaultBuilding(use: BuildingUse, designLoadKw?: number): Building {
  return use === 'office' ? officeBuilding(designLoadKw) : residentialBuilding(designLoadKw);
}

export function defaultGrid(use: BuildingUse): GridConnection {
  return use === 'office'
    ? {
        connection: '3x80',
        contractedKw: 100,
        heatPumpShare: 0.5,
        allowedExceedanceH: 0,
        allowedComfortLossH: 0,
        mode: 'exceedance',
      }
    : {
        connection: '1x35',
        contractedKw: 100,
        heatPumpShare: 0.4,
        allowedExceedanceH: 0,
        allowedComfortLossH: 0,
        mode: 'exceedance',
      };
}

export function defaultHeatPump(use: BuildingUse): HeatPump {
  return {
    emitterPreset: 'MT',
    maxSupplyC: 60,
    carnotEfficiency: 0.45,
    backupHeaterKw: 0,
    sizingMode: 'auto',
    nominalKw: DEFAULT_DESIGN_LOAD_KW[use],
  };
}

export function defaultBuffer(): ThermalBuffer {
  return { volumeM3: 0, strategy: 'predictive' };
}

export function defaultBattery(): Battery {
  return { capacityKwh: 0, powerKw: null };
}

/** Meerdere woningen: standaardaantal en piekvermogen per woning [kW] (appartement na isolatie). */
export const DEFAULT_DWELLINGS = 10;
export const DEFAULT_MULTI_LOAD_PER_DWELLING_KW = 5;

/** Eigen aansluiting van de collectieve warmtepomp (zie docs/AANNAMES.md). */
export const MULTI_DEFAULT_CONNECTION = '3x40' as const;
/** Deel van die aansluiting voor WP + batterij; de rest is voor pompen, ventilatie en algemene ruimten. */
export const MULTI_DEFAULT_SHARE = 0.8;

/** Woningen op één warmtepomp: tapwater (dagbehoefte en boilervat) per woning × aantal, eigen aansluiting. */
export function multiDwellingInput(dwellings = DEFAULT_DWELLINGS): PeakshavingInput {
  const one = residentialBuilding();
  return {
    climateYear: 'T5',
    building: {
      ...one,
      dwellings,
      designLoadKw: DEFAULT_MULTI_LOAD_PER_DWELLING_KW * dwellings,
      dhw: { ...one.dhw, dailyKwh: one.dhw.dailyKwh * dwellings, tankLitre: one.dhw.tankLitre * dwellings },
    },
    grid: {
      connection: MULTI_DEFAULT_CONNECTION,
      contractedKw: 100,
      heatPumpShare: MULTI_DEFAULT_SHARE,
      allowedExceedanceH: 0,
      allowedComfortLossH: 0,
      mode: 'exceedance',
    },
    heatPump: {
      ...defaultHeatPump('residential'),
      nominalKw: DEFAULT_MULTI_LOAD_PER_DWELLING_KW * dwellings,
    },
    buffer: defaultBuffer(),
    battery: defaultBattery(),
  };
}

/** Standaardinvoer per keuze in de UI. */
export function defaultInputOfKind(kind: BuildingKind): PeakshavingInput {
  return kind === 'multi' ? multiDwellingInput() : defaultInput(kind === 'office' ? 'office' : 'residential');
}

/** Volledige standaardinvoer voor een gebouwfunctie (klimaatjaar T5). */
export function defaultInput(use: BuildingUse = 'residential'): PeakshavingInput {
  return {
    climateYear: 'T5',
    building: defaultBuilding(use),
    grid: defaultGrid(use),
    heatPump: defaultHeatPump(use),
    buffer: defaultBuffer(),
    battery: defaultBattery(),
  };
}
