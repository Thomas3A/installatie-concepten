// Gevoeligheid (spec §9.6): P_th,min(V), netpiek, overschrijding en kleinste aansluiting als functie van buffer
// en batterij, tegen tools/peakshaving_ref/referentiewaarden.json (gelijk aan run_cases.py opgebouwd).
import { describe, expect, it } from 'vitest';
import {
  defaultInput,
  officeBuilding,
  residentialBuilding,
} from '../../src/concepts/peakshaving/data/defaults';
import { sensitivityAxes, sensitivityGrid } from '../../src/concepts/peakshaving/model/analysis';
import { limitFromConnection } from '../../src/concepts/peakshaving/model/grid';
import { rangesOf } from '../../src/concepts/peakshaving/model/input';
import { prepareYear, simulate, type PreparedYear } from '../../src/concepts/peakshaving/model/simulate';
import {
  sensitivityRow,
  sizeHeatPump,
  smallestConnection,
  type SensitivityRow,
} from '../../src/concepts/peakshaving/model/sizing';
import type {
  Battery,
  Building,
  ClimateYear,
  HeatPump,
  SimulationKpis,
  ThermalBuffer,
} from '../../src/concepts/peakshaving/model/types';
import { expectCloseHours, expectClosePower, FIXTURE, refYear } from './helpers';

// ---- opzet zoals in run_cases.py ----
// Warmtepomp(P): MT, T_wp_max 60, eta_carnot 0,45, geen bijstook; Buffer(V): strategie 'voorspellend'
function heatPump(nominalKw: number): HeatPump {
  return {
    emitterPreset: 'MT',
    maxSupplyC: 60,
    carnotEfficiency: 0.45,
    backupHeaterKw: 0,
    sizingMode: 'manual',
    nominalKw,
  };
}
const bufferOf = (volumeM3: number): ThermalBuffer => ({ volumeM3, strategy: 'predictive' });
// Batterij(E): P_kW = None → 0,5 C
const batteryOf = (capacityKwh: number): Battery => ({ capacityKwh, powerKw: null });

/** Relatieve afwijking ≤ 1 % (tolerantie voor P_th,min, spec §9). */
function expectWithin1Pct(actual: number, expected: number, label: string): void {
  expect(Number.isFinite(actual), `${label}: ${actual} is niet eindig`).toBe(true);
  expect(
    Math.abs(actual - expected) / expected,
    `${label}: ${actual} ≠ ${expected} (±1 %)`,
  ).toBeLessThanOrEqual(0.01);
}

// ---- woning 8 kW, T5, 1×35 A, aandeel 40 % ----
const RES_SHARE = 0.4;
const RES_CONNECTION_KW = 0.23 * 35; // Elektra(P_aansluiting=0.230*35, aandeel_wp=0.40)
const RES_VOLUMES = [0, 0.25, 0.5, 1.0, 1.5, 2.0, 3.0];
const RES_BATTERIES = [0, 5, 10];

interface ResidentialCell {
  pGridMaxKw: number;
  exceedanceHours: number;
  smallestLabel: string;
}
interface ResidentialRow {
  pThMin: number;
  cells: Map<number, ResidentialCell>;
}

let resCtx: { b: Building; climate: ClimateYear; prepared: PreparedYear; pLimitKw: number } | null = null;
function residentialContext(): NonNullable<typeof resCtx> {
  if (!resCtx) {
    const b = residentialBuilding(8);
    const climate = refYear('T5');
    resCtx = {
      b,
      climate,
      prepared: prepareYear(b, heatPump(8), climate),
      pLimitKw: limitFromConnection(RES_CONNECTION_KW, RES_SHARE),
    };
  }
  return resCtx;
}

const resCache = new Map<number, ResidentialRow>();
/** Eén rij van de woningsweep, rechtstreeks met sizeHeatPump/simulate/smallestConnection (zoals run_cases.py). */
function residentialRow(V: number): ResidentialRow {
  const cached = resCache.get(V);
  if (cached) return cached;
  const { b, climate, prepared, pLimitKw } = residentialContext();
  const pThMin = sizeHeatPump(b, heatPump(8), bufferOf(V), climate, 0, prepared);
  const cells = new Map<number, ResidentialCell>();
  for (const E of RES_BATTERIES) {
    const setup = { building: b, heatPump: heatPump(pThMin), buffer: bufferOf(V), battery: batteryOf(E) };
    const k = simulate({ ...setup, pLimitKw }, climate, { mode: 'exceedance', prepared, record: false }).kpis;
    const smallest = smallestConnection(setup, RES_SHARE, climate, 0, prepared);
    cells.set(E, {
      pGridMaxKw: k.pGridMaxKw,
      exceedanceHours: k.exceedanceHours,
      smallestLabel: smallest.label,
    });
  }
  const row = { pThMin, cells };
  resCache.set(V, row);
  return row;
}

interface PyResCell {
  P_net_max: number;
  uren_overschrijding: number;
  kleinste_aansluiting: string;
}
function pyResidential(V: number): { P_th_min: number; cell: (E: number) => PyResCell } {
  const r = FIXTURE.sweep_woning_T5.find((x) => x.V_m3 === V);
  if (!r) throw new Error(`geen referentierij voor V = ${V}`);
  return { P_th_min: r.P_th_min, cell: (E: number) => r[`bat${E}`] as PyResCell };
}

describe('gevoeligheid woning 8 kW, T5, 1×35 A / 40 % (spec §9.6, referentiewaarden)', () => {
  it('de referentie bevat precies de zeven buffervolumes van run_cases.py', () => {
    expect(FIXTURE.sweep_woning_T5.map((r) => r.V_m3)).toEqual(RES_VOLUMES);
  });

  for (const V of RES_VOLUMES) {
    it(`V = ${V} m³: P_th,min, netpiek, overschrijding en kleinste aansluiting per batterij`, () => {
      const ref = pyResidential(V);
      const row = residentialRow(V);
      expectWithin1Pct(row.pThMin, ref.P_th_min, `V ${V} · P_th,min`);
      for (const E of RES_BATTERIES) {
        const py = ref.cell(E);
        const ts = row.cells.get(E)!;
        const label = `V ${V} · bat ${E} kWh`;
        expectClosePower(ts.pGridMaxKw, py.P_net_max, `${label} · P_net,max`);
        expectCloseHours(ts.exceedanceHours, py.uren_overschrijding, `${label} · uren overschrijding`);
        expect(ts.smallestLabel, `${label} · kleinste aansluiting`).toBe(py.kleinste_aansluiting);
      }
    });
  }
});

describe('tabel spec §9.6 woning (afgeronde waarden)', () => {
  // [V, P_th,min, P_net,max (bat 0), uren overschrijding (bat 0), kleinste aansluiting bat 0 / 5 / 10 kWh]
  const TABLE: [number, number, number, number, [string, string, string]][] = [
    [0, 10.56, 3.48, 101, ['1×40 A', '1×35 A', '1×35 A']],
    [0.25, 10.01, 3.23, 1, ['1×40 A', '1×35 A', '1×25 A']],
    [0.5, 9.42, 3.18, 0, ['1×35 A', '1×35 A', '1×25 A']],
    [1.0, 8.72, 2.95, 0, ['1×35 A', '1×25 A', '1×25 A']],
    [2.0, 8.74, 2.96, 0, ['1×35 A', '1×25 A', '1×25 A']],
    [3.0, 8.73, 2.96, 0, ['1×35 A', '1×25 A', '1×25 A']],
  ];
  for (const [V, pTh, pNet, hours, labels] of TABLE) {
    it(`V = ${V} m³ volgens de spectabel`, () => {
      const row = residentialRow(V);
      expectWithin1Pct(row.pThMin, pTh, `V ${V} · P_th,min`);
      const bat0 = row.cells.get(0)!;
      expectClosePower(bat0.pGridMaxKw, pNet, `V ${V} · P_net,max`);
      expectCloseHours(bat0.exceedanceHours, hours, `V ${V} · uren overschrijding`);
      expect(RES_BATTERIES.map((E) => row.cells.get(E)!.smallestLabel)).toEqual(labels);
    });
  }

  it('P_th,min daalt met het buffervolume tot een plateau (binnen +1 % ruis)', () => {
    let minSoFar = Infinity;
    for (const V of RES_VOLUMES) {
      const p = residentialRow(V).pThMin;
      expect(p, `V ${V}: ${p} > ${minSoFar} · 1,01`).toBeLessThanOrEqual(minSoFar * 1.01);
      minSoFar = Math.min(minSoFar, p);
    }
  });
});

// ---- kantoor 100 kW, T5, 3×80 A, aandeel 50 % ----
const OFF_SHARE = 0.5;
const OFF_CONNECTION_KW = 0.4 * Math.sqrt(3) * 80; // P3x80 in run_cases.py
const OFF_VOLUMES = [0, 5, 10, 20, 40];
const OFF_BATTERIES = [0, 50, 100, 200];

interface OfficeRow {
  pThMin: number;
  kpis: Map<number, SimulationKpis>;
}

let offCtx: { b: Building; climate: ClimateYear; prepared: PreparedYear; pLimitKw: number } | null = null;
function officeContext(): NonNullable<typeof offCtx> {
  if (!offCtx) {
    const b = officeBuilding(100);
    const climate = refYear('T5');
    offCtx = {
      b,
      climate,
      prepared: prepareYear(b, heatPump(100), climate),
      pLimitKw: limitFromConnection(OFF_CONNECTION_KW, OFF_SHARE),
    };
  }
  return offCtx;
}

const offCache = new Map<number, OfficeRow>();
function officeRow(V: number): OfficeRow {
  const cached = offCache.get(V);
  if (cached) return cached;
  const { b, climate, prepared, pLimitKw } = officeContext();
  const pThMin = sizeHeatPump(b, heatPump(100), bufferOf(V), climate, 0, prepared);
  const kpis = new Map<number, SimulationKpis>();
  for (const E of OFF_BATTERIES) {
    const k = simulate(
      { building: b, heatPump: heatPump(pThMin), buffer: bufferOf(V), battery: batteryOf(E), pLimitKw },
      climate,
      { mode: 'exceedance', prepared, record: false },
    ).kpis;
    kpis.set(E, k);
  }
  const row = { pThMin, kpis };
  offCache.set(V, row);
  return row;
}

interface PyOffCell {
  P_net_max: number;
  uren_overschrijding: number;
  max_overschrijding: number;
  SCOP: number;
}
function pyOffice(V: number): { P_th_min: number; cell: (E: number) => PyOffCell } {
  const r = FIXTURE.sweep_kantoor_T5.find((x) => x.V_m3 === V);
  if (!r) throw new Error(`geen referentierij voor V = ${V}`);
  return { P_th_min: r.P_th_min as number, cell: (E: number) => r[`bat${E}`] as PyOffCell };
}

describe('gevoeligheid kantoor 100 kW, T5, 3×80 A / 50 % (spec §9.6, referentiewaarden)', () => {
  it('de referentie bevat precies de vijf buffervolumes van run_cases.py', () => {
    expect(FIXTURE.sweep_kantoor_T5.map((r) => r.V_m3)).toEqual(OFF_VOLUMES);
  });

  for (const V of OFF_VOLUMES) {
    it(`V = ${V} m³: P_th,min, netpiek, overschrijding en SCOP per batterij`, () => {
      const ref = pyOffice(V);
      const row = officeRow(V);
      expectWithin1Pct(row.pThMin, ref.P_th_min, `V ${V} · P_th,min`);
      for (const E of OFF_BATTERIES) {
        const py = ref.cell(E);
        const k = row.kpis.get(E)!;
        const label = `V ${V} · bat ${E} kWh`;
        expectClosePower(k.pGridMaxKw, py.P_net_max, `${label} · P_net,max`);
        expectCloseHours(k.exceedanceHours, py.uren_overschrijding, `${label} · uren overschrijding`);
        expectClosePower(k.maxExceedanceKw, py.max_overschrijding, `${label} · max overschrijding`);
        expectClosePower(k.scop, py.SCOP, `${label} · SCOP`);
      }
    });
  }
});

describe('tabel spec §9.6 kantoor (afgeronde waarden)', () => {
  // [V, P_th,min, P_net,max (bat 0), uren overschrijding bat 0 / 50 / 100 / 200 kWh]
  const TABLE: [number, number, number, [number, number, number, number]][] = [
    [0, 172.4, 46.36, [327, 38, 7, 0]],
    [5, 142.33, 38.82, [46, 8, 4, 0]],
    [10, 125.81, 33.85, [9, 5, 0, 0]],
    [20, 96.38, 27.71, [0, 0, 0, 0]],
    [40, 82.89, 27.71, [0, 0, 0, 0]],
  ];
  for (const [V, pTh, pNet, hours] of TABLE) {
    it(`V = ${V} m³ volgens de spectabel`, () => {
      const row = officeRow(V);
      expectWithin1Pct(row.pThMin, pTh, `V ${V} · P_th,min`);
      expectClosePower(row.kpis.get(0)!.pGridMaxKw, pNet, `V ${V} · P_net,max`);
      OFF_BATTERIES.forEach((E, i) =>
        expectCloseHours(row.kpis.get(E)!.exceedanceHours, hours[i], `V ${V} · bat ${E} kWh · uren`),
      );
    });
  }

  it('uren overschrijding nemen niet toe met de batterijcapaciteit (spec §9.7)', () => {
    for (const V of OFF_VOLUMES) {
      const hours = OFF_BATTERIES.map((E) => officeRow(V).kpis.get(E)!.exceedanceHours);
      for (let i = 1; i < hours.length; i++) {
        expect(hours[i], `V ${V}: ${hours.join(' / ')}`).toBeLessThanOrEqual(hours[i - 1]);
      }
    }
  });
});

describe('sensitivityRow (spec §5.9) — zelfde getallen als de losse berekening', () => {
  const V = 1.0;
  it(`woning, V = ${V} m³, batterijen 0 / 5 / 10 kWh`, () => {
    const { b, climate, prepared, pLimitKw } = residentialContext();
    const row = sensitivityRow(
      { building: b, heatPump: heatPump(8), buffer: bufferOf(0), pLimitKw, share: RES_SHARE },
      climate,
      V,
      RES_BATTERIES,
      0,
      0,
      prepared,
    );
    const direct = residentialRow(V);
    const ref = pyResidential(V);

    expect(row.volumeM3).toBe(V);
    expect(row.cells.map((c) => c.capacityKwh)).toEqual(RES_BATTERIES);
    // identiek aan de losse aanroepen van sizeHeatPump/simulate/smallestConnection
    expect(row.nominalKw).toBe(direct.pThMin);
    // en binnen de toleranties van de Python-referentie
    expectWithin1Pct(row.nominalKw, ref.P_th_min, `V ${V} · P_th,min`);
    row.cells.forEach((cell, i) => {
      const E = RES_BATTERIES[i];
      const d = direct.cells.get(E)!;
      const py = ref.cell(E);
      expect(cell.pGridMaxKw).toBe(d.pGridMaxKw);
      expect(cell.exceedanceHours).toBe(d.exceedanceHours);
      expect(cell.smallest.label).toBe(d.smallestLabel);
      expectClosePower(cell.pGridMaxKw, py.P_net_max, `bat ${E} · P_net,max`);
      expectCloseHours(cell.exceedanceHours, py.uren_overschrijding, `bat ${E} · uren overschrijding`);
      expect(cell.smallest.label, `bat ${E} · kleinste aansluiting`).toBe(py.kleinste_aansluiting);
    });
  });
});

describe('gevoeligheidsraster bij de standaardinvoer woning (spec §5.9)', () => {
  const input = defaultInput('residential');
  const climate = refYear('T5');
  let grid: SensitivityRow[] | null = null;
  const progress: [number, number][] = [];
  const gridOnce = (): SensitivityRow[] => {
    grid ??= sensitivityGrid(input, climate, (_row, index, total) => progress.push([index, total]));
    return grid;
  };

  it('assen: 13 buffervolumes van 0 tot V_max en 4 batterijen van 0 tot E_max', () => {
    const { volumes, batteries } = sensitivityAxes(input);
    const r = rangesOf(input);
    expect(volumes).toHaveLength(13);
    expect(batteries).toHaveLength(4);
    expect(volumes[0]).toBe(0);
    expect(volumes[12]).toBeCloseTo(r.bufferMaxM3, 12);
    expect(batteries[0]).toBe(0);
    expect(batteries[3]).toBeCloseTo(r.batteryMaxKwh, 12);
    // woning 8 kW, MT, 60 °C: V_max = roundUpNice(12·8/24,074) = 4 m³, E_max = roundUpNice(8·8/2,5) = 30 kWh
    expect(r.bufferMaxM3).toBe(4);
    expect(r.batteryMaxKwh).toBe(30);
    for (let i = 1; i < volumes.length; i++) expect(volumes[i]).toBeGreaterThan(volumes[i - 1]);
  });

  it('levert 13 rijen × 4 batterijen met eindige waarden, rij voor rij gemeld', () => {
    const rows = gridOnce();
    const { volumes, batteries } = sensitivityAxes(input);
    expect(rows).toHaveLength(13);
    expect(progress).toEqual(volumes.map((_v, i) => [i, 13]));
    rows.forEach((row, i) => {
      expect(row.volumeM3).toBeCloseTo(volumes[i], 12);
      expect(Number.isFinite(row.nominalKw), `rij ${i}: P_th,min ${row.nominalKw}`).toBe(true);
      expect(row.nominalKw).toBeGreaterThan(0);
      expect(row.cells).toHaveLength(4);
      row.cells.forEach((cell, j) => {
        expect(cell.capacityKwh).toBeCloseTo(batteries[j], 12);
        expect(Number.isFinite(cell.pGridMaxKw), `rij ${i}, bat ${j}: P_net,max`).toBe(true);
        expect(Number.isFinite(cell.exceedanceHours), `rij ${i}, bat ${j}: uren`).toBe(true);
        expect(cell.smallest.label.length).toBeGreaterThan(0);
      });
    });
  });

  it('P_th,min is niet-stijgend in V binnen +1 % ruis (spec §9.7)', () => {
    const rows = gridOnce();
    let minSoFar = Infinity;
    for (const row of rows) {
      expect(row.nominalKw, `V ${row.volumeM3}: ${row.nominalKw} > ${minSoFar} · 1,01`).toBeLessThanOrEqual(
        minSoFar * 1.01,
      );
      minSoFar = Math.min(minSoFar, row.nominalKw);
    }
  });

  it('eerste rij (V = 0) komt overeen met de referentie bij V = 0', () => {
    const rows = gridOnce();
    const ref = pyResidential(0);
    expectWithin1Pct(rows[0].nominalKw, ref.P_th_min, 'V 0 · P_th,min');
    const bat0 = rows[0].cells[0];
    expectClosePower(bat0.pGridMaxKw, ref.cell(0).P_net_max, 'V 0 · bat 0 · P_net,max');
    expectCloseHours(
      bat0.exceedanceHours,
      ref.cell(0).uren_overschrijding,
      'V 0 · bat 0 · uren overschrijding',
    );
    expect(bat0.smallest.label).toBe(ref.cell(0).kleinste_aansluiting);
  });

  it('uren overschrijding nemen per rij niet toe met de batterijcapaciteit (spec §9.7)', () => {
    for (const row of gridOnce()) {
      for (let j = 1; j < row.cells.length; j++) {
        expect(row.cells[j].exceedanceHours, `V ${row.volumeM3}`).toBeLessThanOrEqual(
          row.cells[j - 1].exceedanceHours,
        );
      }
    }
  });
});
