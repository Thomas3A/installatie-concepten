// Modeltests buiten de Python-referentie: invoer normaliseren (spec §3), aansluiting en WP-limiet (§5.5),
// meldingen (§6.4), KPI-kaarten en advies (§6.1, §6.2) en de volledige doorrekening analyze() (§4.4, §6.3, §7, §9.6).
import { beforeAll, describe, expect, it } from 'vitest';
import { CONNECTIONS, type ConnectionId } from '../../src/concepts/peakshaving/data/connections';
import { defaultInput } from '../../src/concepts/peakshaving/data/defaults';
import { analyze, type Analysis } from '../../src/concepts/peakshaving/model/analysis';
import { HOURS_PER_YEAR } from '../../src/concepts/peakshaving/model/building';
import { isValidClimateYearId } from '../../src/concepts/peakshaving/model/climate';
import {
  connectionLabel,
  connectionPowerKw,
  gridLimitKw,
  limitFromConnection,
  neighbourConnections,
} from '../../src/concepts/peakshaving/model/grid';
import {
  normalizeInput,
  rangesOf,
  switchUse,
  withDesignLoad,
} from '../../src/concepts/peakshaving/model/input';
import {
  buildAdvice,
  buildKpiCards,
  exceedanceStatus,
  meterPeakStatus,
} from '../../src/concepts/peakshaving/model/kpis';
import {
  allMessages,
  backupCausesPeak,
  batteryPowerLimits,
  batteryRunsEmpty,
  buildMessages,
  dhwCausesPeak,
  MAX_MESSAGES,
  type Message,
  type MessageFacts,
} from '../../src/concepts/peakshaving/model/messages';
import { simulate } from '../../src/concepts/peakshaving/model/simulate';
import type { PeakshavingInput, SimulationResult } from '../../src/concepts/peakshaving/model/types';
import { MESSAGE_TEXTS, type MessageCode } from '../../src/concepts/peakshaving/texts';
import { bufferPlateau as isBufferPlateau } from '../../src/concepts/peakshaving/model/messages';
import { expectCloseHours, expectClosePower, refYear } from './helpers';

// ---------------------------------------------------------------------------------------------------------------
// Hulpfuncties
// ---------------------------------------------------------------------------------------------------------------

/** nl-NL-notatie met vaste decimalen en een echt minteken (U+2212), onafhankelijk van src/core/format.ts. */
function nl(x: number, digits: number): string {
  return new Intl.NumberFormat('nl-NL', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
    .format(x)
    .replace(/^-/, '−');
}

/** Vervang elk getal in een (geneste) structuur. */
function mapNumbers(v: unknown, f: (x: number) => unknown): unknown {
  if (typeof v === 'number') return f(v);
  if (Array.isArray(v)) return v.map((x) => mapNumbers(x, f));
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mapNumbers(x, f)]));
  }
  return v;
}

/** Standaardinvoer met aanpassingen. */
function inputWith(use: 'residential' | 'office', change: (i: PeakshavingInput) => void): PeakshavingInput {
  const i = defaultInput(use);
  change(i);
  return i;
}

// Bereiken uit spec §3.1–§3.4 (hier opnieuw uitgeschreven, niet uit input.ts overgenomen)
const SPEC_RANGES = {
  designLoadKw: [1, 2000],
  designOutdoorC: [-15, -5],
  designIndoorC: [18, 24],
  setpointUseC: [16, 24],
  setpointSetbackC: [10, 24],
  balanceTempC: [8, 18],
  timeConstantH: [8, 120],
  envelopeLagH: [0, 12],
  boostFraction: [0, 1],
  preheatH: [0, 8],
  dailyKwh: [0, 50],
  tankLitre: [0, 2000],
  tankTempC: [45, 65],
  contractedKw: [10, 5000],
  heatPumpShare: [0.1, 1],
  allowedHours: [0, 200],
  carnotEfficiency: [0.35, 0.55],
  backupHeaterKw: [0, 50],
} as const satisfies Record<string, readonly [number, number]>;

const MAX_SUPPLY = [55, 60, 65, 70, 75];
const CONNECTION_IDS: ConnectionId[] = [...CONNECTIONS.map((c) => c.id), 'grootverbruik'];

function expectInRange(x: number, [lo, hi]: readonly [number, number], label: string): void {
  expect(Number.isFinite(x), `${label} = ${x} is niet eindig`).toBe(true);
  expect(x, `${label} ≥ ${lo}`).toBeGreaterThanOrEqual(lo - 1e-9);
  expect(x, `${label} ≤ ${hi}`).toBeLessThanOrEqual(hi + 1e-9);
}

/** Controleer dat een genormaliseerde invoer binnen alle bereiken van spec §3 valt. */
function expectValidInput(i: PeakshavingInput): void {
  const b = i.building;
  const S = SPEC_RANGES;
  expect(isValidClimateYearId(i.climateYear)).toBe(true);
  expect(['residential', 'office']).toContain(b.use);
  expectInRange(b.designLoadKw, S.designLoadKw, 'designLoadKw');
  expectInRange(b.designOutdoorC, S.designOutdoorC, 'designOutdoorC');
  expectInRange(b.designIndoorC, S.designIndoorC, 'designIndoorC');
  expectInRange(b.setpointUseC, S.setpointUseC, 'setpointUseC');
  expectInRange(b.setpointSetbackC, S.setpointSetbackC, 'setpointSetbackC');
  expectInRange(b.balanceTempC, S.balanceTempC, 'balanceTempC');
  expectInRange(b.timeConstantH, S.timeConstantH, 'timeConstantH');
  expectInRange(b.envelopeLagH, S.envelopeLagH, 'envelopeLagH');
  expectInRange(b.boostFraction, S.boostFraction, 'boostFraction');
  expectInRange(b.useStartH, [0, 24], 'useStartH');
  expectInRange(b.useEndH, [0, 24], 'useEndH');
  expect(b.useEndH).toBeGreaterThan(b.useStartH);
  expectInRange(b.preheatH, S.preheatH, 'preheatH');
  expect(typeof b.dhw.enabled).toBe('boolean');
  // tapwater: bereik per woning × aantal woningen (kantoor: één)
  expect(Number.isInteger(b.dwellings)).toBe(true);
  expectInRange(b.dwellings, b.use === 'office' ? [1, 1] : [1, 500], 'dwellings');
  expectInRange(b.dhw.dailyKwh, [S.dailyKwh[0], S.dailyKwh[1] * b.dwellings], 'dhw.dailyKwh');
  expectInRange(b.dhw.tankLitre, [S.tankLitre[0], S.tankLitre[1] * b.dwellings], 'dhw.tankLitre');
  expectInRange(b.dhw.tankTempC, S.tankTempC, 'dhw.tankTempC');
  expect(b.dhw.tankTempC).toBeLessThanOrEqual(i.heatPump.maxSupplyC);

  const g = i.grid;
  expect(CONNECTION_IDS).toContain(g.connection);
  expectInRange(g.contractedKw, S.contractedKw, 'contractedKw');
  expectInRange(g.heatPumpShare, S.heatPumpShare, 'heatPumpShare');
  expectInRange(g.allowedExceedanceH, S.allowedHours, 'allowedExceedanceH');
  expectInRange(g.allowedComfortLossH, S.allowedHours, 'allowedComfortLossH');
  expect(['exceedance', 'limited']).toContain(g.mode);

  const hp = i.heatPump;
  expect(['LT', 'MT', 'HT']).toContain(hp.emitterPreset);
  expect(MAX_SUPPLY).toContain(hp.maxSupplyC);
  expectInRange(hp.carnotEfficiency, S.carnotEfficiency, 'carnotEfficiency');
  expectInRange(hp.backupHeaterKw, S.backupHeaterKw, 'backupHeaterKw');
  expect(['auto', 'manual']).toContain(hp.sizingMode);
  expectInRange(hp.nominalKw, [0.1 * b.designLoadKw, 3 * b.designLoadKw], 'nominalKw');

  const r = rangesOf(i);
  expectInRange(i.buffer.volumeM3, [0, r.bufferMaxM3], 'buffer.volumeM3');
  expect(['predictive', 'always']).toContain(i.buffer.strategy);
  expectInRange(i.battery.capacityKwh, [0, r.batteryMaxKwh], 'battery.capacityKwh');
  if (i.battery.powerKw !== null) {
    expectInRange(
      i.battery.powerKw,
      [0.2 * i.battery.capacityKwh, 2 * i.battery.capacityKwh],
      'battery.powerKw',
    );
  }
}

// ---------------------------------------------------------------------------------------------------------------
// model/input.ts
// ---------------------------------------------------------------------------------------------------------------

describe('normalizeInput (spec §3)', () => {
  const GARBAGE: [string, unknown][] = [
    ['null', null],
    ['undefined', undefined],
    ['leeg object', {}],
    ['lege lijst', []],
    ['tekst', 'peakshaving'],
    ['getal', 42],
    ['NaN', NaN],
    ['boolean', true],
    ['functie', () => 1],
    [
      'foute deelobjecten',
      {
        building: null,
        grid: 'x',
        heatPump: [],
        buffer: 5,
        battery: { capacityKwh: 'veel', powerKw: 'snel' },
      },
    ],
    [
      'tekst en NaN in velden',
      {
        climateYear: 1997,
        building: { use: 'fabriek', designLoadKw: 'groot', setpointUseC: NaN, dhw: 'aan' },
        grid: { connection: '2x99', heatPumpShare: null, mode: 'hard' },
        heatPump: { emitterPreset: 'XT', maxSupplyC: '60', nominalKw: {}, sizingMode: 'ja' },
        buffer: { volumeM3: [1], strategy: 'soms' },
      },
    ],
    [
      'oneindig en negatief nul',
      {
        building: { designLoadKw: Infinity, designOutdoorC: -Infinity, boostFraction: -0 },
        grid: { contractedKw: Infinity, allowedExceedanceH: -Infinity },
        battery: { capacityKwh: Infinity, powerKw: -Infinity },
      },
    ],
  ];

  for (const [label, raw] of GARBAGE) {
    it(`gooit geen fout en geeft een geldige invoer bij ${label}`, () => {
      let n: PeakshavingInput | undefined;
      expect(() => {
        n = normalizeInput(raw);
      }).not.toThrow();
      expectValidInput(n!);
    });
  }

  it('volledig onbruikbare invoer wordt de standaardwoning', () => {
    for (const raw of [null, undefined, {}, 'x', 7, NaN, []]) {
      expect(normalizeInput(raw)).toEqual(defaultInput('residential'));
    }
  });

  it('de standaardinvoer van woning en kantoor blijft ongewijzigd', () => {
    expect(normalizeInput(defaultInput('residential'))).toEqual(defaultInput('residential'));
    expect(normalizeInput(defaultInput('office'))).toEqual(defaultInput('office'));
  });

  it('een gedeeltelijke kantoorinvoer krijgt de kantoordefaults', () => {
    const n = normalizeInput({ building: { use: 'office' } });
    expect(n).toEqual(defaultInput('office'));
  });

  it('niet-numerieke getallen vallen terug op de default van de gebouwfunctie', () => {
    const n = normalizeInput({
      building: { use: 'office', designLoadKw: 'veel', setpointUseC: NaN, balanceTempC: null },
      grid: { heatPumpShare: 'half' },
      heatPump: { carnotEfficiency: undefined },
    });
    const d = defaultInput('office');
    expect(n.building.designLoadKw).toBe(d.building.designLoadKw);
    expect(n.building.setpointUseC).toBe(d.building.setpointUseC);
    expect(n.building.balanceTempC).toBe(d.building.balanceTempC);
    expect(n.grid.heatPumpShare).toBe(d.grid.heatPumpShare);
    expect(n.heatPump.carnotEfficiency).toBe(d.heatPump.carnotEfficiency);
  });

  it('zeer grote getallen worden begrensd op de bovengrens van elk bereik', () => {
    const raw = mapNumbers(
      { ...defaultInput('residential'), battery: { capacityKwh: 0, powerKw: 0 } },
      () => 1e300,
    );
    const n = normalizeInput(raw);
    expectValidInput(n);
    const r = rangesOf(n);
    expect(n.building).toMatchObject({
      designLoadKw: 2000,
      designOutdoorC: -5,
      designIndoorC: 24,
      setpointUseC: 24,
      setpointSetbackC: 24,
      balanceTempC: 18,
      timeConstantH: 120,
      envelopeLagH: 12,
      boostFraction: 1,
      useEndH: 24,
      preheatH: 8,
    });
    expect(n.heatPump).toMatchObject({
      maxSupplyC: 75,
      carnotEfficiency: 0.55,
      backupHeaterKw: 50,
      nominalKw: 6000,
    });
    expect(n.building.dwellings).toBe(500);
    expect(n.building.dhw).toMatchObject({ dailyKwh: 50 * 500, tankLitre: 2000 * 500, tankTempC: 65 });
    expect(n.grid).toMatchObject({
      contractedKw: 5000,
      heatPumpShare: 1,
      allowedExceedanceH: 200,
      allowedComfortLossH: 200,
    });
    expect(n.buffer.volumeM3).toBe(r.bufferMaxM3);
    expect(n.battery.capacityKwh).toBe(r.batteryMaxKwh);
    expect(n.battery.powerKw).toBe(2 * r.batteryMaxKwh);
  });

  it('zeer kleine (negatieve) getallen worden begrensd op de ondergrens van elk bereik', () => {
    const raw = mapNumbers(
      { ...defaultInput('residential'), battery: { capacityKwh: 0, powerKw: 0 } },
      () => -1e300,
    );
    const n = normalizeInput(raw);
    expectValidInput(n);
    expect(n.building).toMatchObject({
      designLoadKw: 1,
      designOutdoorC: -15,
      designIndoorC: 18,
      setpointUseC: 16,
      setpointSetbackC: 10,
      balanceTempC: 8,
      timeConstantH: 8,
      envelopeLagH: 0,
      boostFraction: 0,
      useStartH: 0,
      preheatH: 0,
    });
    expect(n.building.dhw).toMatchObject({ dailyKwh: 0, tankLitre: 0, tankTempC: 45 });
    expect(n.grid).toMatchObject({
      contractedKw: 10,
      heatPumpShare: 0.1,
      allowedExceedanceH: 0,
      allowedComfortLossH: 0,
    });
    expect(n.heatPump).toMatchObject({ maxSupplyC: 55, carnotEfficiency: 0.35, backupHeaterKw: 0 });
    expect(n.heatPump.nominalKw).toBeCloseTo(0.1, 12);
    expect(n.buffer.volumeM3).toBe(0);
    expect(n.battery.capacityKwh).toBe(0);
  });

  it('getallen binnen het bereik blijven ongewijzigd', () => {
    const n = normalizeInput(
      inputWith('residential', (i) => {
        i.building.designLoadKw = 12.5;
        i.building.balanceTempC = 14;
        i.grid.heatPumpShare = 0.65;
        i.heatPump.carnotEfficiency = 0.4;
        i.heatPump.backupHeaterKw = 3;
        i.buffer.volumeM3 = 0.75;
        i.battery.capacityKwh = 7.5;
      }),
    );
    expect(n.building.designLoadKw).toBe(12.5);
    expect(n.building.balanceTempC).toBe(14);
    expect(n.grid.heatPumpShare).toBe(0.65);
    expect(n.heatPump.carnotEfficiency).toBe(0.4);
    expect(n.heatPump.backupHeaterKw).toBe(3);
    expect(n.buffer.volumeM3).toBe(0.75);
    expect(n.battery.capacityKwh).toBe(7.5);
  });

  it('onbekende aansluiting valt terug op de default van de gebouwfunctie', () => {
    expect(normalizeInput({ grid: { connection: '2x99' } }).grid.connection).toBe('1x35');
    expect(
      normalizeInput({ building: { use: 'office' }, grid: { connection: '3x99' } }).grid.connection,
    ).toBe('3x80');
    expect(normalizeInput({ grid: { connection: 42 } }).grid.connection).toBe('1x35');
  });

  it('alle standaardaansluitingen en grootverbruik worden geaccepteerd', () => {
    for (const id of CONNECTION_IDS) {
      expect(normalizeInput({ grid: { connection: id } }).grid.connection).toBe(id);
    }
  });

  it('maximale aanvoertemperatuur springt naar 55 / 60 / 65 / 70 / 75 °C', () => {
    const cases: [unknown, number][] = [
      [55, 55],
      [57, 55],
      [58, 60],
      [61.9, 60],
      [64, 65],
      [68, 70],
      [72.6, 75],
      [75, 75],
      [100, 75],
      [1e9, 75],
      [0, 55],
      [-40, 55],
      ['70', 60],
      [NaN, 60],
      [null, 60],
    ];
    for (const [raw, expected] of cases) {
      expect(normalizeInput({ heatPump: { maxSupplyC: raw } }).heatPump.maxSupplyC, `maxSupplyC ${raw}`).toBe(
        expected,
      );
    }
  });

  it('maximale aanvoertemperatuur: extreem grote waarden springen naar 75 °C', () => {
    for (const raw of [1e18, 1e300, Number.MAX_VALUE]) {
      expect(normalizeInput({ heatPump: { maxSupplyC: raw } }).heatPump.maxSupplyC, `maxSupplyC ${raw}`).toBe(
        75,
      );
    }
  });

  it('boilertemperatuur wordt begrensd op de maximale aanvoertemperatuur', () => {
    const at = (maxSupplyC: number, tankTempC: number): number =>
      normalizeInput({ heatPump: { maxSupplyC }, building: { dhw: { tankTempC } } }).building.dhw.tankTempC;
    expect(at(55, 65)).toBe(55);
    expect(at(55, 60)).toBe(55);
    expect(at(55, 50)).toBe(50);
    expect(at(60, 65)).toBe(60);
    expect(at(75, 65)).toBe(65);
    expect(at(75, 40)).toBe(45);
  });

  it('batterijvermogen wordt begrensd op 0,2–2 C', () => {
    const at = (capacityKwh: number, powerKw: unknown): number | null =>
      normalizeInput({ battery: { capacityKwh, powerKw } }).battery.powerKw;
    expect(at(10, 100)).toBe(20);
    expect(at(10, 0.5)).toBe(2);
    expect(at(10, -3)).toBe(2);
    expect(at(10, 5)).toBe(5);
    expect(at(10, 20)).toBe(20);
    expect(at(10, 2)).toBe(2);
    // automatisch (0,5 C) blijft automatisch
    expect(at(10, null)).toBeNull();
    expect(at(10, 'snel')).toBeNull();
  });

  it('buffer en batterij worden begrensd op V_max en E_max van het piekvermogen', () => {
    const n = normalizeInput({ buffer: { volumeM3: 1000 }, battery: { capacityKwh: 1e6 } });
    // woning 8 kW, MT/60: V_max = roundUpNice(12·8/24,07) = 4 m³, E_max = roundUpNice(8·8/2,5) = 30 kWh
    expect(n.buffer.volumeM3).toBe(4);
    expect(n.battery.capacityKwh).toBe(30);
    const neg = normalizeInput({ buffer: { volumeM3: -1 }, battery: { capacityKwh: -5 } });
    expect(neg.buffer.volumeM3).toBe(0);
    expect(neg.battery.capacityKwh).toBe(0);
  });

  it('handmatig WP-vermogen wordt begrensd op 0,1–3 × piekvermogen', () => {
    const at = (nominalKw: number): number =>
      normalizeInput({ heatPump: { sizingMode: 'manual', nominalKw } }).heatPump.nominalKw;
    expect(at(100)).toBe(24);
    expect(at(0)).toBeCloseTo(0.8, 12);
    expect(at(6)).toBe(6);
  });

  it('klimaatjaar: referentiejaren en werkelijke jaren 1951–2025 blijven, de rest wordt T1 (standaard)', () => {
    expect(normalizeInput({ climateYear: 'T5' }).climateYear).toBe('T5');
    expect(normalizeInput({ climateYear: 'energie' }).climateYear).toBe('energie');
    expect(normalizeInput({ climateYear: 'winter1979' }).climateYear).toBe('winter1979');
    expect(normalizeInput({ climateYear: 'winter1963' }).climateYear).toBe('winter1963');
    expect(normalizeInput({ climateYear: 'knmi-1997' }).climateYear).toBe('knmi-1997');
    expect(normalizeInput({ climateYear: 'knmi-1951' }).climateYear).toBe('knmi-1951');
    expect(normalizeInput({ climateYear: 'knmi-1950' }).climateYear).toBe('T1');
    expect(normalizeInput({ climateYear: 'knmi-2026' }).climateYear).toBe('T1');
    expect(normalizeInput({ climateYear: 1997 }).climateYear).toBe('T1');
  });

  it('gebruikstijden: eind ligt altijd na begin', () => {
    const n = normalizeInput({ building: { use: 'office', useStartH: 18, useEndH: 7 } });
    expect(n.building.useStartH).toBe(18);
    expect(n.building.useEndH).toBeGreaterThan(18);
    expect(n.building.useEndH).toBeLessThanOrEqual(24);
  });
});

describe('switchUse (spec §3.1)', () => {
  it('woning → kantoor geeft de kantoordefaults en houdt het klimaatjaar', () => {
    const res = inputWith('residential', (i) => {
      i.climateYear = 'knmi-1997';
      i.buffer.volumeM3 = 1;
      i.battery.capacityKwh = 10;
    });
    const off = switchUse(res, 'office');
    expect(off.building.use).toBe('office');
    expect(off.building.designLoadKw).toBe(100);
    expect(off.grid.connection).toBe('3x80');
    expect(off.climateYear).toBe('knmi-1997');
    expect(off).toEqual({ ...defaultInput('office'), climateYear: 'knmi-1997' });
  });

  it('kantoor → woning geeft de woningdefaults en houdt het klimaatjaar', () => {
    const off = inputWith('office', (i) => {
      i.climateYear = 'T1';
      i.buffer.volumeM3 = 10;
    });
    const res = switchUse(off, 'residential');
    expect(res.building.use).toBe('residential');
    expect(res.building.designLoadKw).toBe(8);
    expect(res.grid.connection).toBe('1x35');
    expect(res.climateYear).toBe('T1');
    expect(res).toEqual({ ...defaultInput('residential'), climateYear: 'T1' });
  });

  it('dezelfde gebouwfunctie laat de invoer ongemoeid', () => {
    const res = inputWith('residential', (i) => {
      i.buffer.volumeM3 = 1;
    });
    expect(switchUse(res, 'residential')).toBe(res);
  });
});

describe('withDesignLoad (spec §3.5, laatste punt)', () => {
  const base = (): PeakshavingInput =>
    inputWith('residential', (i) => {
      i.heatPump.sizingMode = 'manual';
      i.heatPump.nominalKw = 6;
      i.buffer.volumeM3 = 1;
      i.battery.capacityKwh = 10;
      i.battery.powerKw = 5;
    });

  it('buffer, batterij en handmatig WP-vermogen schalen proportioneel mee', () => {
    const n = withDesignLoad(base(), 16);
    expect(n.building.designLoadKw).toBe(16);
    expect(n.buffer.volumeM3).toBeCloseTo(2, 12);
    expect(n.battery.capacityKwh).toBeCloseTo(20, 12);
    expect(n.battery.powerKw).toBeCloseTo(10, 12);
    expect(n.heatPump.nominalKw).toBeCloseTo(12, 12);
    expectValidInput(n);
  });

  it('naar beneden schalen houdt dezelfde "uren piekvermogen"', () => {
    const before = base();
    const n = withDesignLoad(before, 4);
    const kwhPerM3 = rangesOf(before).kwhPerM3;
    const hours = (i: PeakshavingInput): number => (i.buffer.volumeM3 * kwhPerM3) / i.building.designLoadKw;
    expect(hours(n)).toBeCloseTo(hours(before), 12);
    expect(n.battery.capacityKwh / n.building.designLoadKw).toBeCloseTo(10 / 8, 12);
    expect(n.heatPump.nominalKw).toBeCloseTo(3, 12);
  });

  it('nul blijft nul en automatisch batterijvermogen blijft automatisch', () => {
    const n = withDesignLoad(defaultInput('residential'), 20);
    expect(n.buffer.volumeM3).toBe(0);
    expect(n.battery.capacityKwh).toBe(0);
    expect(n.battery.powerKw).toBeNull();
  });

  it('begrenst op de nieuwe bereiken', () => {
    // buffer op V_max (4 m³ bij 8 kW); bij 8,016 kW is V_max nog steeds 4 m³ en 4·1,002 valt erbuiten
    const atMax = inputWith('residential', (i) => {
      i.buffer.volumeM3 = 4;
    });
    const n = withDesignLoad(atMax, 8.016);
    expect(rangesOf(n).bufferMaxM3).toBe(4);
    expect(n.buffer.volumeM3).toBe(4);
    expectValidInput(n);
  });

  it('een piekvermogen buiten het bereik wordt begrensd en de maatregelen schalen met het begrensde vermogen mee', () => {
    // 4000 kW wordt 2000 kW (factor 250 t.o.v. 8 kW); "dezelfde uren piekvermogen" vraagt dan ook factor 250
    const n = withDesignLoad(base(), 4000);
    expectValidInput(n);
    expect(n.building.designLoadKw).toBe(2000);
    expect(n.heatPump.nominalKw).toBeCloseTo(6 * 250, 9);
    expect(n.buffer.volumeM3).toBeCloseTo(1 * 250, 9);
    expect(n.battery.capacityKwh).toBeCloseTo(10 * 250, 9);
    expect(n.battery.powerKw).toBeCloseTo(5 * 250, 9);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// model/grid.ts
// ---------------------------------------------------------------------------------------------------------------

describe('aansluiting en WP-limiet (spec §5.5)', () => {
  const EXPECTED: [ConnectionId, number][] = [
    ['1x25', 5.75],
    ['1x35', 8.05],
    ['1x40', 9.2],
    ['3x25', 17.32],
    ['3x35', 24.25],
    ['3x40', 27.71],
    ['3x50', 34.64],
    ['3x63', 43.65],
    ['3x80', 55.43],
  ];

  it('connectionPowerKw volgens de standaardlijst', () => {
    for (const [id, kw] of EXPECTED) {
      expect(Math.abs(connectionPowerKw({ connection: id, contractedKw: 999 }) - kw), id).toBeLessThan(0.006);
    }
  });

  it('connectionPowerKw bij grootverbruik is het gecontracteerd vermogen', () => {
    expect(connectionPowerKw({ connection: 'grootverbruik', contractedKw: 250 })).toBe(250);
    expect(connectionPowerKw({ connection: 'grootverbruik', contractedKw: 10 })).toBe(10);
  });

  it('gridLimitKw = P_aansluiting · aandeel', () => {
    const g = defaultInput('residential').grid;
    expect(gridLimitKw(g)).toBeCloseTo(0.23 * 35 * 0.4, 9);
    expect(gridLimitKw({ ...g, connection: '3x50', heatPumpShare: 0.25 })).toBeCloseTo(
      0.4 * Math.sqrt(3) * 50 * 0.25,
      9,
    );
    expect(gridLimitKw(defaultInput('office').grid)).toBeCloseTo(0.4 * Math.sqrt(3) * 80 * 0.5, 9);
  });

  it('gridLimitKw bij grootverbruik gebruikt contractedKw', () => {
    const g = { ...defaultInput('office').grid, connection: 'grootverbruik' as const, contractedKw: 200 };
    expect(gridLimitKw({ ...g, heatPumpShare: 0.25 })).toBeCloseTo(50, 9);
    expect(gridLimitKw({ ...g, heatPumpShare: 1 })).toBeCloseTo(200, 9);
    // het gecontracteerd vermogen telt alleen bij grootverbruik
    expect(gridLimitKw({ ...g, connection: '3x80', heatPumpShare: 0.5 })).toBeCloseTo(27.71, 2);
  });

  it('limitFromConnection is Infinity bij aandeel 0 of zonder eindige aansluiting', () => {
    expect(limitFromConnection(8.05, 0)).toBe(Infinity);
    expect(limitFromConnection(8.05, -0.5)).toBe(Infinity);
    expect(limitFromConnection(Infinity, 0.4)).toBe(Infinity);
    expect(limitFromConnection(NaN, 0.4)).toBe(Infinity);
    expect(limitFromConnection(8.05, 0.4)).toBeCloseTo(3.22, 9);
    expect(gridLimitKw({ ...defaultInput('residential').grid, heatPumpShare: 0 })).toBe(Infinity);
  });

  it('connectionLabel geeft het label van de aansluiting', () => {
    expect(connectionLabel({ connection: '1x35', contractedKw: 0 })).toBe('1×35 A');
    expect(connectionLabel({ connection: '3x80', contractedKw: 0 })).toBe('3×80 A');
    expect(connectionLabel({ connection: 'grootverbruik', contractedKw: 100 })).toMatch(/^Grootverbruik/);
  });

  it('neighbourConnections geeft de standaardaansluitingen eronder en erboven', () => {
    const mid = neighbourConnections(0.23 * 35);
    expect(mid.below?.id).toBe('1x25');
    expect(mid.above?.id).toBe('1x40');
    const top = neighbourConnections(0.4 * Math.sqrt(3) * 80);
    expect(top.below?.id).toBe('3x63');
    expect(top.above).toBeUndefined();
    const small = neighbourConnections(3);
    expect(small.below).toBeUndefined();
    expect(small.above?.id).toBe('1x25');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Doorrekeningen (gedeeld door de tests van meldingen, KPI's en analyze)
// ---------------------------------------------------------------------------------------------------------------

const robustnessYears = () => [refYear('energie'), refYear('T5'), refYear('T1')];

const CONFIGS = {
  woning: () => defaultInput('residential'),
  kantoor: () => defaultInput('office'),
  woningBuffer1: () =>
    inputWith('residential', (i) => {
      i.buffer.volumeM3 = 1;
    }),
  woningHT55: () =>
    inputWith('residential', (i) => {
      i.heatPump.emitterPreset = 'HT';
      i.heatPump.maxSupplyC = 55;
    }),
  woningBijstook: () =>
    inputWith('residential', (i) => {
      i.heatPump.sizingMode = 'manual';
      i.heatPump.nominalKw = 0.8;
      i.heatPump.backupHeaterKw = 10;
    }),
} satisfies Record<string, () => PeakshavingInput>;
type ConfigName = keyof typeof CONFIGS;

const analyses = new Map<ConfigName, Analysis>();
function analysisOf(name: ConfigName): Analysis {
  let a = analyses.get(name);
  if (!a) {
    const years = robustnessYears();
    a = analyze(CONFIGS[name](), refYear('T5'), { robustnessYears: years });
    analyses.set(name, a);
  }
  return a;
}

const SEVERITY_RANK = { error: 0, warning: 1, info: 2 } as const;
const PLACEHOLDER = /\{\w+\}/;

function expectSorted(messages: Message[]): void {
  for (let i = 1; i < messages.length; i++) {
    expect(SEVERITY_RANK[messages[i].severity]).toBeGreaterThanOrEqual(
      SEVERITY_RANK[messages[i - 1].severity],
    );
  }
}

function expectFilled(m: Message): void {
  for (const s of [m.title, m.summary, ...m.why, ...m.solutions]) {
    expect(s, `${m.code}: "${s}"`).not.toMatch(PLACEHOLDER);
    expect(s, `${m.code}: "${s}"`).not.toMatch(/NaN|undefined|Infinity/);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// model/messages.ts
// ---------------------------------------------------------------------------------------------------------------

describe('meldingen uit analyze() (spec §6.4)', () => {
  it('woning met 1 m³ buffer in T5: "Buffer helpt niet verder" (blauw)', () => {
    const a = analysisOf('woningBuffer1');
    const m = a.messages.find((x) => x.code === 'bufferPlateau');
    expect(m, a.messages.map((x) => x.code).join(', ')).toBeDefined();
    expect(m!.severity).toBe('info');
    // P_th,min(1 m³) = 8,72 en P_th,min(2 m³) = 8,74 (spec §9.6): verdubbelen levert < 2 % op
    expect(m!.summary).toContain(`${nl(1, 2)} m³`);
    expect(m!.summary).toContain(`${nl(a.sizing.withBuffer, 1)} kW`);
    expect(m!.why[0]).toContain('Een buffer overbrugt uren, geen dagen');
    expect(m!.why[0]).toContain('T5');
  });

  it('kantoor standaard: "Opstookpiek kantoor" (blauw) met de opwarmbijdrage', () => {
    const a = analysisOf('kantoor');
    const m = a.messages.find((x) => x.code === 'preheatPeak');
    expect(m, a.messages.map((x) => x.code).join(', ')).toBeDefined();
    expect(m!.severity).toBe('info');
    // boostFraction · designLoadKw = 0,30 · 100 = 30 kW
    expect(m!.summary).toContain(`${nl(30, 1)} kW`);
  });

  it('HT-afgifte met 55 °C maximale aanvoer: "Kleine ΔT buffer" (oranje)', () => {
    const a = analysisOf('woningHT55');
    const m = a.messages.find((x) => x.code === 'smallBufferDeltaT');
    expect(m, a.messages.map((x) => x.code).join(', ')).toBeDefined();
    expect(m!.severity).toBe('warning');
    // ΔT = (55 − 2) − 45 = 8 K; 1 m³ = 1,163 · 8 · 0,9 = 8,37 kWh
    expect(a.main.kpis.bufferDeltaT).toBe(8);
    expect(m!.summary).toContain('8 K');
    expect(m!.why[0]).toBe(
      `Met HT-afgifte en 55 °C maximale aanvoer slaat 1 m³ maar ${nl(1.163 * 8 * 0.9, 1)} kWh op; overweeg LT-afgifte of een warmtepomp met hogere aanvoertemperatuur.`,
    );
  });

  it('groot bijstookelement bij een kleine handmatige WP: "Bijstook bepaalt de aansluiting" (rood)', () => {
    const a = analysisOf('woningBijstook');
    const m = a.messages.find((x) => x.code === 'backupPeak');
    expect(m, a.messages.map((x) => x.code).join(', ')).toBeDefined();
    expect(m!.severity).toBe('error');
    expect(a.messages[0].severity).toBe('error');
    expect(m!.summary).toContain(`${nl(a.main.kpis.pGridMaxKw, 2)} kW`);
    expect(m!.summary).toContain(`${nl(10, 1)} kW`);
  });

  it('geen "Buffer helpt niet verder" zonder buffer', () => {
    expect(analysisOf('woning').messages.map((x) => x.code)).not.toContain('bufferPlateau');
  });

  for (const name of Object.keys(CONFIGS) as ConfigName[]) {
    it(`${name}: hoogstens 4 meldingen, gesorteerd rood → oranje → blauw, zonder open plaatshouders`, () => {
      const msgs = analysisOf(name).messages;
      expect(msgs.length).toBeLessThanOrEqual(4);
      expectSorted(msgs);
      msgs.forEach(expectFilled);
    });
  }
});

describe('meldingen uit samengestelde feiten (spec §6.4)', () => {
  let base: SimulationResult;
  let run: SimulationResult;
  const P_LIMIT = 3.22;

  beforeAll(() => {
    base = simulate(
      {
        building: defaultInput('residential').building,
        heatPump: { ...defaultInput('residential').heatPump, sizingMode: 'manual', nominalKw: 8 },
        buffer: { volumeM3: 0, strategy: 'predictive' },
        battery: { capacityKwh: 0, powerKw: null },
        pLimitKw: P_LIMIT,
      },
      refYear('T5'),
      { mode: 'exceedance' },
    );
    // reeksen met precies één uur per situatie
    const z = (): Float64Array => new Float64Array(HOURS_PER_YEAR);
    const s = { ...base.series!, pGrid: z(), pElectric: z(), qBackup: z(), qDhw: z(), socBattery: z() };
    // uur 100: piek aan de meter in een bijstookuur, batterij leeg terwijl boven de limiet
    s.pGrid[100] = 5;
    s.qBackup[100] = 2;
    // uur 200: elektrische piek tijdens boilerladen, overschrijding groter dan het batterijvermogen met lading over
    s.pElectric[200] = 6;
    s.qDhw[200] = 1;
    s.socBattery[200] = 1;
    run = { ...base, series: s, kpis: { ...base.kpis, pGridMaxKw: 5, pElectricMaxKw: 6 } };
  });

  function allFacts(): MessageFacts {
    return {
      climateInSentence: 'ontwerpjaar T5',
      sizingMode: 'auto',
      sizingWithBuffer: 8,
      sizingWithoutBuffer: 10,
      sizingDoubleBuffer: 7.95,
      bufferVolumeM3: 1,
      bufferMaxM3: 4,
      bufferDeltaT: 8,
      bufferKwhPerM3: 1.163 * 8 * 0.9,
      emitterLabel: 'HT',
      maxSupplyC: 55,
      sizingHoursInColdWeek: 0.8,
      coldSpell: { days: 5, meanC: -4.2 },
      exceedanceRun: run,
      limitedComfortLossHours: 50,
      limitedMinIndoorC: 15,
      allowedComfortLossH: 0,
      pLimitKw: P_LIMIT,
      batteryCapacityKwh: 10,
      batteryPowerKw: 1,
      backupHeaterKw: 2,
      idealPeakInPreheat: true,
      boostKw: 30,
    };
  }

  it('detectiefuncties op de samengestelde reeksen', () => {
    expect(batteryRunsEmpty(run, P_LIMIT, 10)).toBe(1);
    expect(batteryPowerLimits(run, P_LIMIT, 10, 1)).toBe(1);
    // vermogen ruim genoeg: geen begrenzing
    expect(batteryPowerLimits(run, P_LIMIT, 10, 3)).toBe(0);
    expect(dhwCausesPeak(run)).toBe(true);
    expect(backupCausesPeak(run)).toBe(true);
    // zonder batterij of zonder eindige limiet telt er niets
    expect(batteryRunsEmpty(run, P_LIMIT, 0)).toBe(0);
    expect(batteryRunsEmpty(run, Infinity, 10)).toBe(0);
    expect(batteryPowerLimits(run, Infinity, 10, 1)).toBe(0);
    // zonder reeksen
    const bare = { ...run, series: null };
    expect(batteryRunsEmpty(bare, P_LIMIT, 10)).toBe(0);
    expect(batteryPowerLimits(bare, P_LIMIT, 10, 1)).toBe(0);
    expect(dhwCausesPeak(bare)).toBe(false);
    expect(backupCausesPeak(bare)).toBe(false);
  });

  it('alle situaties tegelijk: negen meldingen, getoond worden de vier ernstigste', () => {
    const all = allMessages(allFacts());
    expect(all.map((m) => m.code).sort()).toEqual(
      [
        'backupPeak',
        'comfortLoss',
        'batteryEmpty',
        'batteryPower',
        'smallBufferDeltaT',
        'bufferPlateau',
        'coldSpell',
        'dhwPeak',
        'preheatPeak',
      ].sort(),
    );
    expectSorted(all);
    const shown = buildMessages(allFacts());
    expect(MAX_MESSAGES).toBe(4);
    expect(shown).toHaveLength(4);
    expect(shown).toEqual(all.slice(0, 4));
    expect(shown.map((m) => m.severity)).toEqual(['error', 'error', 'warning', 'warning']);
    expect(
      shown
        .map((m) => m.code)
        .slice(0, 2)
        .sort(),
    ).toEqual(['backupPeak', 'comfortLoss']);
  });

  it('ernst volgens spec §6.4', () => {
    const sev = Object.fromEntries(allMessages(allFacts()).map((m) => [m.code, m.severity]));
    expect(sev).toMatchObject({
      backupPeak: 'error',
      batteryEmpty: 'warning',
      batteryPower: 'warning',
      smallBufferDeltaT: 'warning',
      bufferPlateau: 'info',
      coldSpell: 'info',
      dhwPeak: 'info',
      preheatPeak: 'info',
    });
    expect(['error', 'warning']).toContain(sev.comfortLoss);
    const failed = allMessages({ ...allFacts(), sizingWithBuffer: NaN });
    expect(failed.find((m) => m.code === 'sizingFailed')?.severity).toBe('error');
  });

  it('elke meldingstekst uit texts.ts is na het invullen vrij van plaatshouders', () => {
    const seen = new Set<MessageCode>();
    for (const facts of [allFacts(), { ...allFacts(), sizingWithBuffer: NaN }]) {
      for (const m of allMessages(facts)) {
        seen.add(m.code);
        expectFilled(m);
        expect(m.title).toBe(MESSAGE_TEXTS[m.code].title);
        expect(m.why).toHaveLength(MESSAGE_TEXTS[m.code].why.length);
        expect(m.solutions).toHaveLength(MESSAGE_TEXTS[m.code].solutions.length);
      }
    }
    expect([...seen].sort()).toEqual((Object.keys(MESSAGE_TEXTS) as MessageCode[]).sort());
  });

  it('ingevulde waarden in nl-NL-notatie', () => {
    const byCode = Object.fromEntries(allMessages(allFacts()).map((m) => [m.code, m]));
    expect(byCode.backupPeak.summary).toBe(
      `De piek aan de meter (${nl(5, 2)} kW) valt in een uur met bijstook (element ${nl(2, 1)} kW, COP 1).`,
    );
    expect(byCode.smallBufferDeltaT.why[0]).toContain(`maar ${nl(8.3736, 1)} kWh op`);
    expect(byCode.bufferPlateau.why[0]).toContain(`duurt 5 dagen met gemiddeld ${nl(-4.2, 1)} °C`);
    expect(byCode.coldSpell.summary).toContain('80 %');
    expect(byCode.comfortLoss.summary).toContain(`laagste binnentemperatuur ${nl(15, 1)} °C`);
  });

  it('zonder buffer, batterij, bijstook en met voldoende comfort: geen meldingen', () => {
    const quiet: MessageFacts = {
      ...allFacts(),
      // zonder boilerladen in het piekuur
      exceedanceRun: { ...base, series: { ...base.series!, qDhw: new Float64Array(HOURS_PER_YEAR) } },
      bufferVolumeM3: 0,
      bufferDeltaT: 23,
      sizingHoursInColdWeek: null,
      limitedComfortLossHours: 0,
      batteryCapacityKwh: 0,
      batteryPowerKw: 0,
      backupHeaterKw: 0,
      idealPeakInPreheat: false,
    };
    expect(allMessages(quiet)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// model/kpis.ts
// ---------------------------------------------------------------------------------------------------------------

describe('kleurcodes KPI-kaarten (spec §6.1)', () => {
  it('piek aan de meter: groen ≤ limiet, oranje ≤ 110 %, rood daarboven', () => {
    expect(meterPeakStatus(3, 3.22)).toBe('ok');
    expect(meterPeakStatus(3.22, 3.22)).toBe('ok');
    expect(meterPeakStatus(3.3, 3.22)).toBe('warn');
    expect(meterPeakStatus(1.1 * 3.22, 3.22)).toBe('warn');
    expect(meterPeakStatus(1.1 * 3.22 + 0.01, 3.22)).toBe('err');
    expect(meterPeakStatus(10, 3.22)).toBe('err');
  });

  it('piek aan de meter zonder limiet is neutraal', () => {
    expect(meterPeakStatus(10, Infinity)).toBe('neutral');
  });

  it('uren overschrijding: groen 0, oranje ≤ toegestaan, rood daarboven', () => {
    expect(exceedanceStatus(0, 0)).toBe('ok');
    expect(exceedanceStatus(0, 10)).toBe('ok');
    expect(exceedanceStatus(5, 10)).toBe('warn');
    expect(exceedanceStatus(10, 10)).toBe('warn');
    expect(exceedanceStatus(11, 10)).toBe('err');
    expect(exceedanceStatus(1, 0)).toBe('err');
  });
});

describe('KPI-kaarten (spec §6.1)', () => {
  const ORDER = [
    'peakDemand',
    'heatPump',
    'meterPeak',
    'exceedance',
    'smallest',
    'comfort',
    'buffer',
    'energy',
  ];
  const TITLES = [
    'Piek warmtevraag',
    'Benodigd WP-vermogen',
    'Piek aan de meter',
    'Uren overschrijding',
    'Kleinste passende aansluiting',
    'Comfort bij begrenzen',
    'Buffer',
    'Energie',
  ];
  // nl-NL-getal: punt als duizendtalscheiding, komma als decimaalteken
  const NL_NUMBER = /^-?\d{1,3}(\.\d{3})*(,\d+)?$/;

  it('acht kaarten in de volgorde van §6.1', () => {
    const cards = buildKpiCards(analysisOf('woning'));
    expect(cards).toHaveLength(8);
    expect(cards.map((c) => c.id)).toEqual(ORDER);
    expect(cards.map((c) => c.title)).toEqual(TITLES);
  });

  it('waarden in nl-NL-notatie (woning standaard)', () => {
    const a = analysisOf('woning');
    const k = a.main.kpis;
    const cards = Object.fromEntries(buildKpiCards(a).map((c) => [c.id, c]));
    expect(cards.peakDemand.value).toBe(nl(k.qIdealMaxKw, 1));
    expect(cards.peakDemand.value).toBe('7,5');
    expect(cards.peakDemand.unit).toBe('kW');
    expect(cards.heatPump.value).toBe(nl(a.sizing.withBuffer, 1));
    expect(cards.heatPump.value).toBe('10,6');
    expect(cards.heatPump.unit).toBe('kW th');
    expect(cards.meterPeak.value).toBe(nl(k.pGridMaxKw, 2));
    expect(cards.meterPeak.value).toBe('3,48');
    expect(cards.exceedance.value).toBe('101');
    expect(cards.smallest.value).toBe('1×40 A');
    expect(cards.comfort.value).toBe(nl(a.counterpart.kpis.comfortLossHours, 0));
    expect(cards.buffer.value).toBe(nl(k.bufferEnergyKwh, 1));
    expect(cards.energy.value).toBe(nl(k.scop, 2));
    expect(cards.energy.unit).toBe('SCOP');
    for (const id of ORDER.filter((x) => x !== 'smallest')) {
      expect(cards[id].value, id).toMatch(NL_NUMBER);
    }
    // jaarelektriciteit met duizendtalpunt
    const el = k.eElectricKwh + k.eBackupKwh;
    expect(el).toBeGreaterThan(1000);
    expect(cards.energy.lines[0].text).toBe(`${nl(el, 0)} kWh elektriciteit/jaar`);
    expect(cards.energy.lines[0].text).toMatch(/^\d{1,3}\.\d{3} kWh elektriciteit\/jaar$/);
    // secundaire regels
    expect(cards.peakDemand.lines[0].text).toBe(`Ontwerpverlies ${nl(8, 1)} kW`);
    expect(cards.meterPeak.lines[0].text).toBe(`WP-limiet ${nl(3.22, 2)} kW`);
    expect(cards.heatPump.lines.some((l) => l.text.includes(`${nl(a.sizing.withBuffer * 0.7, 1)} kW`))).toBe(
      true,
    );
  });

  it('kleuren woning standaard: piek 3,48 kW bij limiet 3,22 kW is oranje, 101 uur is rood', () => {
    const cards = Object.fromEntries(buildKpiCards(analysisOf('woning')).map((c) => [c.id, c]));
    expect(cards.meterPeak.status).toBe('warn');
    expect(cards.exceedance.status).toBe('err');
    expect(cards.peakDemand.status).toBe('neutral');
    // kleur is nooit de enige informatiedrager
    expect(cards.meterPeak.statusText).toBeTruthy();
    expect(cards.exceedance.statusText).toBeTruthy();
  });

  it('kleuren woning met 1 m³ buffer: binnen de limiet en 0 uur is groen; "zonder buffer" doorgestreept', () => {
    const a = analysisOf('woningBuffer1');
    const cards = Object.fromEntries(buildKpiCards(a).map((c) => [c.id, c]));
    expect(cards.meterPeak.status).toBe('ok');
    expect(cards.exceedance.status).toBe('ok');
    expect(cards.exceedance.value).toBe('0');
    expect(cards.smallest.value).toBe('1×35 A');
    const without = cards.heatPump.lines.find((l) => l.text.startsWith('Zonder buffer'));
    expect(without?.text).toBe(`Zonder buffer ${nl(a.sizing.withoutBuffer, 1)} kW`);
    expect(without?.strike).toBe(true);
  });

  it('kantoor standaard: grootverbruik als kleinste passende aansluiting', () => {
    const a = analysisOf('kantoor');
    const cards = Object.fromEntries(buildKpiCards(a).map((c) => [c.id, c]));
    // ceil(P_net,max / aandeel / 5) · 5 = ceil(46,36 / 0,5 / 5) · 5 = 95 kW (spec §5.9)
    expect(cards.smallest.value).toBe('Grootverbruik 95 kW');
    expect(cards.exceedance.value).toBe(nl(a.main.kpis.exceedanceHours, 0));
    expect(cards.exceedance.status).toBe('err');
    expect(cards.meterPeak.status).toBe('err');
  });

  it('handmatig WP-vermogen: kaarttitel en waarde volgen de handmatige invoer', () => {
    const a = analysisOf('woningBijstook');
    const card = buildKpiCards(a).find((c) => c.id === 'heatPump')!;
    expect(card.title).toBe('WP-vermogen (handmatig)');
    expect(card.value).toBe(nl(0.8, 1));
  });
});

describe('advies-banner (spec §6.2)', () => {
  const text = (a: Analysis): string =>
    buildAdvice(a)
      .map((p) => p.text)
      .join('');

  it('met overschrijding: noemt de uren per jaar boven de limiet', () => {
    const a = analysisOf('woning');
    const t = text(a);
    expect(t).toContain(
      `Zonder buffer en batterij heeft de warmtepomp ${nl(a.sizing.withBuffer, 1)} kW (A7/W35) nodig`,
    );
    expect(t).toContain('blijft de WP-groep 101 uur per jaar boven de limiet van 3,22 kW (1×35 A, 40 %).');
    expect(t).not.toContain('het hele jaar binnen de limiet');
    expect(t).toContain('Kleinste passende aansluiting: 1×40 A.');
    expect(t).toContain(
      `Zonder maatregelen: ${nl(a.withoutMeasures.nominalKw, 1)} kW warmtepomp, 101 uur overschrijding, 1×40 A.`,
    );
    const parts = buildAdvice(a);
    expect(parts.find((p) => p.text === '101')?.strong).toBe(true);
  });

  it('bij 0 uur: "blijft de WP-groep het hele jaar binnen de limiet"', () => {
    const a = analysisOf('woningBuffer1');
    const t = text(a);
    expect(t).toContain('blijft de WP-groep het hele jaar binnen de limiet van 3,22 kW (1×35 A, 40 %).');
    expect(t).toContain(`Met ${nl(1, 2)} m³ buffer`);
    expect(t).toContain(`heeft de warmtepomp ${nl(a.sizing.withBuffer, 1)} kW (A7/W35) nodig`);
    expect(t).toContain('Kleinste passende aansluiting: 1×35 A.');
    expect(t).toContain('Zonder maatregelen:');
    expect(t).toContain('101 uur overschrijding, 1×40 A.');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// model/analysis.ts
// ---------------------------------------------------------------------------------------------------------------

function expectAllFinite(obj: object, label: string): void {
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number') expect(Number.isFinite(v), `${label}.${k} = ${v}`).toBe(true);
  }
}

function expectDescending(a: Float64Array, label: string): void {
  expect(a.length, label).toBe(HOURS_PER_YEAR);
  for (let i = 1; i < a.length; i++) {
    if (a[i] > a[i - 1]) throw new Error(`${label}: niet aflopend op index ${i} (${a[i - 1]} → ${a[i]})`);
  }
}

// Q_ideal,max per klimaatjaar uit spec §9.5 (W1/W7/W8 en K1/K5)
const ANALYZE_CASES: { name: ConfigName; qIdealMax: Record<string, number> }[] = [
  { name: 'woning', qIdealMax: { energie: 6.23, T5: 7.52, T1: 8.15 } },
  { name: 'kantoor', qIdealMax: { T5: 133.92, T1: 144.74 } },
];

for (const { name, qIdealMax } of ANALYZE_CASES)
  describe(`analyze() ${name} standaard in T5`, () => {
    let a: Analysis;
    beforeAll(() => {
      a = analysisOf(name);
    });

    it('rekentijd < 1500 ms', () => {
      expect(a.elapsedMs).toBeGreaterThan(0);
      expect(a.elapsedMs).toBeLessThan(1500);
    });

    it('alle resultaten zijn eindig', () => {
      for (const x of [
        a.nominalKw,
        a.sizing.withBuffer,
        a.sizing.withoutBuffer,
        a.pLimitKw,
        a.connectionKw,
      ]) {
        expect(Number.isFinite(x)).toBe(true);
      }
      expectAllFinite(a.main.kpis, 'main');
      expectAllFinite(a.counterpart.kpis, 'counterpart');
      expectAllFinite(a.noBattery, 'noBattery');
      expectAllFinite(a.withoutMeasures.kpis, 'withoutMeasures');
      expectAllFinite(a.capacityAtMinus10, 'capacityAtMinus10');
      for (const r of a.robustness) expectAllFinite(r, `robustness ${r.climateId}`);
      for (const [key, s] of Object.entries(a.main.series)) {
        for (let t = 0; t < s.length; t++) {
          if (!Number.isFinite(s[t])) throw new Error(`series.${key}[${t}] = ${s[t]}`);
        }
      }
    });

    it('automatisch: WP-vermogen = P_th,min met de ingestelde buffer', () => {
      expect(a.input.heatPump.sizingMode).toBe('auto');
      expect(a.nominalKw).toBe(a.sizing.withBuffer);
      // zonder buffer: met en zonder buffer gelijk, geen verdubbeling
      expect(a.sizing.withoutBuffer).toBe(a.sizing.withBuffer);
      expect(a.sizing.doubleBuffer).toBeNull();
      expect(a.withoutMeasures.nominalKw).toBe(a.sizing.withoutBuffer);
      expect(a.capacityAtMinus10.withBuffer).toBeCloseTo(0.7 * a.nominalKw, 9);
    });

    it('hoofdsimulatie in modus overschrijding, tegenhanger begrenst zonder overschrijding', () => {
      expect(a.main.mode).toBe('exceedance');
      expect(a.counterpart.mode).toBe('limited');
      expect(a.counterpart.kpis.exceedanceHours).toBe(0);
    });

    it('robuustheid: drie rijen, het gekozen jaar gemarkeerd', () => {
      expect(a.robustness).toHaveLength(3);
      expect(a.robustness.map((r) => r.climateId)).toEqual(['energie', 'T5', 'T1']);
      expect(a.robustness.map((r) => r.selected)).toEqual([false, true, false]);
      const t5 = a.robustness[1];
      expect(t5.qIdealMaxKw).toBe(a.main.kpis.qIdealMaxKw);
      expect(t5.pGridMaxKw).toBe(a.main.kpis.pGridMaxKw);
      expect(t5.exceedanceHours).toBe(a.main.kpis.exceedanceHours);
      expect(t5.electricityKwh).toBeCloseTo(a.main.kpis.eElectricKwh + a.main.kpis.eBackupKwh, 6);
      // Q_ideal,max hangt alleen van gebouw en klimaat af (spec §9.5)
      for (const r of a.robustness) {
        if (qIdealMax[r.climateId] !== undefined) {
          expectClosePower(r.qIdealMaxKw, qIdealMax[r.climateId], `Q_ideal,max ${r.climateId}`);
        }
      }
    });

    it('jaarbelastingduurkrommen: 8760 waarden, aflopend gesorteerd', () => {
      const d = a.durationCurves;
      expectDescending(d.pGrid, 'pGrid');
      expectDescending(d.pElectricNoBattery, 'pElectricNoBattery');
      expectDescending(d.pElectricWithoutBuffer, 'pElectricWithoutBuffer');
      expectDescending(d.qIdeal, 'qIdeal');
      expect(d.pGrid[0]).toBeCloseTo(a.main.kpis.pGridMaxKw, 9);
      expect(d.qIdeal[0]).toBeCloseTo(a.main.kpis.qIdealMaxKw, 9);
    });

    it('maandbalans: 12 maanden, elektriciteit telt op tot het jaartotaal', () => {
      expect(a.monthly).toHaveLength(12);
      const k = a.main.kpis;
      const sum = (f: (m: Analysis['monthly'][number]) => number): number =>
        a.monthly.reduce((s, m) => s + f(m), 0);
      const el = sum((m) => m.electricity);
      const total = k.eElectricKwh + k.eBackupKwh;
      expect(Math.abs(el - total) / total).toBeLessThanOrEqual(1e-6);
      const space = sum((m) => m.heatPumpDirect + m.bufferDischarge + m.backup);
      expect(Math.abs(space - k.eSpaceHeatKwh) / k.eSpaceHeatKwh).toBeLessThanOrEqual(1e-6);
      expect(Math.abs(sum((m) => m.dhw) - k.eDhwHeatKwh)).toBeLessThanOrEqual(
        1e-6 * Math.max(1, k.eDhwHeatKwh),
      );
    });

    it('koude week begint op uurindex 314 (spec §4.4), venster ± 24 uur', () => {
      expect(a.coldWeek.start).toBe(314);
      expect(a.coldWeek.from).toBe(290);
      expect(a.coldWeek.to).toBe(314 + 168 + 24);
      expect(Number.isFinite(a.coldWeek.meanOutdoorC)).toBe(true);
    });

    it('meldingen: hoogstens 4, gesorteerd', () => {
      expect(a.messages.length).toBeLessThanOrEqual(4);
      expectSorted(a.messages);
    });
  });

describe('analyze() tegen de gevoeligheidstabel (spec §9.6, V = 0)', () => {
  it('woning: P_th,min 10,56 kW, P_net,max 3,48 kW, 101 uur, kleinste aansluiting 1×40 A', () => {
    const a = analysisOf('woning');
    expect(Math.abs(a.sizing.withBuffer - 10.56) / 10.56).toBeLessThanOrEqual(0.01);
    expectClosePower(a.main.kpis.pGridMaxKw, 3.48, 'P_net,max');
    expect(a.main.kpis.exceedanceHours).toBe(101);
    expect(a.smallest.label).toBe('1×40 A');
    expect(a.withoutMeasures.kpis.exceedanceHours).toBe(101);
    expect(a.withoutMeasures.smallest.label).toBe('1×40 A');
  });

  it('woning met 1 m³ buffer: P_th,min 8,72 kW, 0 uur, kleinste aansluiting 1×35 A', () => {
    const a = analysisOf('woningBuffer1');
    expect(Math.abs(a.sizing.withBuffer - 8.72) / 8.72).toBeLessThanOrEqual(0.01);
    expect(Math.abs(a.sizing.doubleBuffer! - 8.74) / 8.74).toBeLessThanOrEqual(0.01);
    expect(Math.abs(a.sizing.withoutBuffer - 10.56) / 10.56).toBeLessThanOrEqual(0.01);
    expectClosePower(a.main.kpis.pGridMaxKw, 2.95, 'P_net,max');
    expect(a.main.kpis.exceedanceHours).toBe(0);
    expect(a.smallest.label).toBe('1×35 A');
    // zonder maatregelen is gelijk aan V = 0
    expect(a.withoutMeasures.kpis.exceedanceHours).toBe(101);
    expect(a.withoutMeasures.smallest.label).toBe('1×40 A');
  });

  it('kantoor: P_th,min 172,40 kW, P_net,max 46,36 kW, 327 uur', () => {
    const a = analysisOf('kantoor');
    expect(Math.abs(a.sizing.withBuffer - 172.4) / 172.4).toBeLessThanOrEqual(0.01);
    expectClosePower(a.main.kpis.pGridMaxKw, 46.36, 'P_net,max');
    expectCloseHours(a.main.kpis.exceedanceHours, 327, 'uren overschrijding');
    expect(a.smallest.id).toBe('grootverbruik');
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Bevindingen uit de review (aanvullend op spec §6)
// ---------------------------------------------------------------------------------------------------------------

describe("review: meldingen, advies en KPI's", () => {
  const plateauBase = { bufferVolumeM3: 1, bufferMaxM3: 4, sizingWithoutBuffer: 10.56 };

  it('"Buffer helpt niet verder" niet bij een kleine buffer waar het effect nog lineair is', () => {
    // kleine buffer: verdubbelen scheelt < 2 %, maar evenveel als de eerste stap → geen plateau
    expect(
      isBufferPlateau({
        ...plateauBase,
        bufferVolumeM3: 0.05,
        sizingWithBuffer: 10.45,
        sizingDoubleBuffer: 10.34,
      }),
    ).toBe(false);
    // na het knikpunt: verdubbelen levert vrijwel niets meer op → plateau
    expect(isBufferPlateau({ ...plateauBase, sizingWithBuffer: 8.717, sizingDoubleBuffer: 8.742 })).toBe(
      true,
    );
    // geen buffer → nooit
    expect(
      isBufferPlateau({
        ...plateauBase,
        bufferVolumeM3: 0,
        sizingWithBuffer: 10.56,
        sizingDoubleBuffer: null,
      }),
    ).toBe(false);
  });

  it('advies in modus "aansluiting begrenst" noemt het comfortverlies in plaats van overschrijding', () => {
    const input = defaultInput('office');
    input.grid.mode = 'limited';
    const a = analyze(input, refYear('T5'), { robustnessYears: [refYear('T5')] });
    const t = buildAdvice(a)
      .map((p) => p.text)
      .join('');
    expect(t).toContain('de begrenzer houdt de WP-groep binnen de limiet');
    expect(t).not.toContain('uur per jaar boven de limiet');
    expect(a.main.kpis.exceedanceHours).toBe(0);
    // de kaart "Uren overschrijding" toont de tegenhanger zonder begrenzer
    const card = buildKpiCards(a).find((c) => c.id === 'exceedance')!;
    expect(card.lines.some((l) => l.text.startsWith('Zonder begrenzer:'))).toBe(true);
    expect(card.lines.some((l) => l.text.includes(`${a.counterpart.kpis.exceedanceHours} uur`))).toBe(true);
  });

  it('handmatig WP-vermogen: het advies noemt het benodigde vermogen en de gekozen waarde', () => {
    const input = defaultInput('residential');
    input.heatPump.sizingMode = 'manual';
    input.heatPump.nominalKw = 12;
    const a = analyze(input, refYear('T5'), { robustnessYears: [refYear('T5')] });
    const t = buildAdvice(a)
      .map((p) => p.text)
      .join('');
    expect(t).toContain(
      `heeft de warmtepomp ${nl(a.sizing.withBuffer, 1)} kW (A7/W35) nodig (gekozen: ${nl(12, 1)} kW)`,
    );
    // zonder maatregelen = WP gedimensioneerd zonder buffer, ook bij handmatig
    expect(a.withoutMeasures.nominalKw).toBeCloseTo(a.sizing.withoutBuffer, 9);
  });

  it('kleinste aansluiting: groen als de huidige volstaat, rood als er een grotere nodig is', () => {
    const ok = Object.fromEntries(buildKpiCards(analysisOf('woningBuffer1')).map((c) => [c.id, c]));
    expect(ok.smallest.status).toBe('ok');
    const big = Object.fromEntries(buildKpiCards(analysisOf('woning')).map((c) => [c.id, c]));
    expect(big.smallest.status).toBe('err');
    // grootverbruik met voldoende gecontracteerd vermogen is ook groen
    const input = defaultInput('office');
    input.grid.connection = 'grootverbruik';
    input.grid.contractedKw = 200;
    const a = analyze(input, refYear('T5'), { robustnessYears: [refYear('T5')] });
    const cards = Object.fromEntries(buildKpiCards(a).map((c) => [c.id, c]));
    expect(a.smallest.id).toBe('grootverbruik');
    expect(cards.smallest.status).toBe(a.smallest.powerKw <= 200 ? 'ok' : 'err');
    expect(cards.smallest.lines[0].text).toContain('Grootverbruik 200 kW');
  });

  it('batterijverlies is gecorrigeerd voor het verschil in lading begin/eind en nooit negatief', () => {
    const input = defaultInput('office');
    input.battery.capacityKwh = 100;
    const a = analyze(input, refYear('T5'), { robustnessYears: [refYear('T5')] });
    const eta = Math.sqrt(0.9);
    const k = a.main.kpis;
    // verlies = Σ in·(1−η) + Σ uit·(1/η − 1)
    expect(a.main.batteryLossKwh).toBeCloseTo(
      k.eBatteryInKwh * (1 - eta) + k.eBatteryOutKwh * (1 / eta - 1),
      6,
    );
    expect(a.main.batteryLossKwh).toBeGreaterThanOrEqual(0);
  });

  it('robuustheidstabel: uren overschrijding zonder begrenzer en comfortverlies bij begrenzen, per jaar', () => {
    const a = analysisOf('kantoor');
    const t5 = a.robustness.find((r) => r.climateId === 'T5')!;
    expect(t5.exceedanceHours).toBe(exceedanceKpisOf(a).exceedanceHours);
    expect(t5.comfortLossHours).toBe(limitedKpisOf(a).comfortLossHours);
  });
});

function exceedanceKpisOf(a: Analysis) {
  return a.main.mode === 'exceedance' ? a.main.kpis : a.counterpart.kpis;
}
function limitedKpisOf(a: Analysis) {
  return a.main.mode === 'limited' ? a.main.kpis : a.counterpart.kpis;
}
