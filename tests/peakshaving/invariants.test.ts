// Invarianten (spec §9.7): eindige reeksen en KPI's, energiebalansen van gebouw, buffer en batterij,
// harde limiet in modus 'limited', monotonie, prestaties en vroegtijdig stoppen (abortAbove).
import { describe, expect, it } from 'vitest';
import { batteryEfficiency } from '../../src/concepts/peakshaving/model/battery';
import {
  buildingCapacity,
  buildingUA,
  buildSchedule,
  HOURS_PER_YEAR,
} from '../../src/concepts/peakshaving/model/building';
import {
  prepareYear,
  simulate,
  type PreparedYear,
  type SimulateOptions,
} from '../../src/concepts/peakshaving/model/simulate';
import {
  SIZING_HIGH,
  SIZING_ITERATIONS,
  SIZING_LOW,
  sizeHeatPump,
} from '../../src/concepts/peakshaving/model/sizing';
import type {
  ClimateYear,
  OperatingMode,
  SimulationKpis,
  SimulationResult,
  SimulationSeries,
  SimulationSetup,
} from '../../src/concepts/peakshaving/model/types';
import { caseSetup, FIXTURE, realYear } from './helpers';

interface Scenario {
  name: string;
  setup: SimulationSetup;
  climate: ClimateYear;
  mode: OperatingMode;
}

/** Referentiecase uit de fixture op naamprefix (bijv. 'W4'), als verse kopie. */
function fixtureCase(prefix: string): Omit<Scenario, 'name'> {
  const c = FIXTURE.cases.find((x) => x.naam.startsWith(`${prefix} `));
  if (!c) throw new Error(`referentiecase ${prefix} ontbreekt in de fixture`);
  return caseSetup(c);
}

function withSetup(prefix: string, patch: (s: SimulationSetup) => SimulationSetup): Omit<Scenario, 'name'> {
  const base = fixtureCase(prefix);
  return { ...base, setup: patch(base.setup) };
}

// Alle referentiecases plus extra configuraties die de fixture niet dekt
const SCENARIOS: Scenario[] = [
  ...FIXTURE.cases.map((c) => ({ name: c.naam, ...caseSetup(c) })),
  {
    name: 'woning, WP 6 kW + bijstook 2 kW, buffer 1 m³ + batterij 10 kWh (exceedance)',
    ...withSetup('W4', (s) => ({ ...s, heatPump: { ...s.heatPump, backupHeaterKw: 2 } })),
    mode: 'exceedance',
  },
  {
    name: 'woning, WP 6 kW + bijstook 2 kW, buffer 1 m³ + batterij 10 kWh (limited)',
    ...withSetup('W4', (s) => ({ ...s, heatPump: { ...s.heatPump, backupHeaterKw: 2 } })),
    mode: 'limited',
  },
  {
    name: 'kantoor, WP 100 kW, batterij 100 kWh met vast vermogen 30 kW (exceedance)',
    ...withSetup('K1', (s) => ({ ...s, battery: { capacityKwh: 100, powerKw: 30 } })),
    mode: 'exceedance',
  },
  {
    name: 'kantoor, WP 100 kW, batterij 100 kWh met vast vermogen 30 kW (limited)',
    ...withSetup('K1', (s) => ({ ...s, battery: { capacityKwh: 100, powerKw: 30 } })),
    mode: 'limited',
  },
  {
    name: "kantoor, WP 100 kW, buffer 10 m³ met strategie 'always'",
    ...withSetup('K2', (s) => ({ ...s, buffer: { ...s.buffer, strategy: 'always' } })),
  },
  {
    name: 'woning, WP 8 kW, buffer 1 m³ + batterij 10 kWh, werkelijk jaar 1997',
    ...fixtureCase('W3'),
    climate: realYear(1997),
  },
  {
    name: 'kantoor, WP 70 kW, buffer 10 m³ + batterij 50 kWh, werkelijk jaar 1997 (limited)',
    ...fixtureCase('K4'),
    climate: realYear(1997),
  },
  {
    name: 'woning, WP 8 kW, buffer 1 m³, zonder elektrische limiet (limited, zoals de dimensionering)',
    ...withSetup('W2', (s) => ({ ...s, pLimitKw: Infinity })),
    mode: 'limited',
  },
  {
    name: 'woning, WP 8 kW, buffer 1 m³ + batterij 10 kWh, zonder tapwater en zonder gevelfilter',
    ...withSetup('W3', (s) => ({
      ...s,
      building: { ...s.building, envelopeLagH: 0, dhw: { ...s.building.dhw, enabled: false } },
    })),
  },
];

const results = new Map<string, SimulationResult>();

/** Eén volledige simulatie met reeksen per scenario (gecachet over de tests heen). */
function run(sc: Scenario): SimulationResult {
  let r = results.get(sc.name);
  if (!r) {
    const prepared = prepareYear(sc.setup.building, sc.setup.heatPump, sc.climate);
    r = simulate(sc.setup, sc.climate, { mode: sc.mode, prepared });
    results.set(sc.name, r);
  }
  return r;
}

function seriesOf(r: SimulationResult): SimulationSeries {
  if (!r.series) throw new Error('simulatie zonder reeksen');
  return r.series;
}

function sum(a: ArrayLike<number>, f: (v: number, t: number) => number = (v) => v): number {
  let s = 0;
  for (let t = 0; t < a.length; t++) s += f(a[t], t);
  return s;
}

/** Balans lhs = rhs binnen 1e-6 relatief t.o.v. de totale energiedoorzet (minstens 1 kWh). */
function expectBalance(lhs: number, rhs: number, throughput: number, label: string): void {
  const tol = 1e-6 * Math.max(Math.abs(throughput), 1);
  expect(Math.abs(lhs - rhs), `${label}: ${lhs} ≠ ${rhs} (tolerantie ${tol})`).toBeLessThanOrEqual(tol);
}

const SERIES_KEYS: (keyof SimulationSeries)[] = [
  'outdoorC',
  'outdoorFilteredC',
  'indoorC',
  'setpointC',
  'qRequested',
  'qSpaceHeating',
  'qDhw',
  'qBufferCharge',
  'qBufferDischarge',
  'qBackup',
  'shortfall',
  'bufferLoss',
  'socBuffer',
  'socBattery',
  'socTank',
  'pElectric',
  'pBattery',
  'pGrid',
  'copSpace',
  'capacityKw',
  'dhwDemand',
  'dhwShortfall',
];

describe('invarianten per simulatie (spec §9.7)', () => {
  for (const sc of SCENARIOS) {
    describe(sc.name, () => {
      it('volledige run zonder vroegtijdig stoppen, met alle reeksen van 8760 uur', () => {
        const r = run(sc);
        expect(r.aborted).toBe(false);
        expect(r.mode).toBe(sc.mode);
        const s = seriesOf(r);
        for (const key of SERIES_KEYS) expect(s[key].length, key).toBe(HOURS_PER_YEAR);
      });

      it("geen NaN of Infinity in reeksen, KPI's en begin-/eindtoestand", () => {
        const r = run(sc);
        const s = seriesOf(r);
        for (const [key, arr] of Object.entries(s) as [string, Float64Array][]) {
          const bad = arr.findIndex((v) => !Number.isFinite(v));
          expect(bad, `reeks ${key}: niet-eindige waarde ${arr[bad]} op uur ${bad}`).toBe(-1);
        }
        for (const [key, v] of Object.entries(r.kpis) as [keyof SimulationKpis, number][]) {
          if (key === 'pLimitKw' && !Number.isFinite(sc.setup.pLimitKw)) {
            // zonder elektrische limiet is het WP-budget per definitie oneindig
            expect(v, key).toBe(Infinity);
          } else {
            expect(Number.isFinite(v), `KPI ${key} = ${v}`).toBe(true);
          }
        }
        for (const snap of [r.start, r.end]) {
          for (const [key, v] of Object.entries(snap))
            expect(Number.isFinite(v), `toestand ${key} = ${v}`).toBe(true);
        }
      });

      it('energiebalans gebouw: Σ(Q_del + G − UA·(T_i − T_ef)) = C·(T_i,eind − T_i,begin)', () => {
        const r = run(sc);
        const s = seriesOf(r);
        const b = sc.setup.building;
        const UA = buildingUA(b);
        const C = buildingCapacity(b);
        const gains = buildSchedule(b, sc.climate.startWeekday).gains;
        let lhs = 0;
        let throughput = 0;
        for (let t = 0; t < HOURS_PER_YEAR; t++) {
          // binnentemperatuur vóór de update van uur t
          const tiBefore = t === 0 ? r.start.indoorC : s.indoorC[t - 1];
          const qDel = s.qSpaceHeating[t] + s.qBufferDischarge[t] + s.qBackup[t];
          const loss = UA * (tiBefore - s.outdoorFilteredC[t]);
          lhs += qDel + gains[t] - loss;
          throughput += Math.abs(qDel) + Math.abs(gains[t]) + Math.abs(loss);
        }
        expect(s.indoorC[HOURS_PER_YEAR - 1]).toBe(r.end.indoorC);
        expectBalance(lhs, C * (r.end.indoorC - r.start.indoorC), throughput, 'gebouw');
      });

      it('energiebalans buffer: Σ Q_buf,in − Σ Q_buf,uit − Σ verlies = SoC_eind − SoC_begin', () => {
        const r = run(sc);
        const s = seriesOf(r);
        const qIn = sum(s.qBufferCharge);
        const qOut = sum(s.qBufferDischarge);
        const loss = sum(s.bufferLoss);
        expect(s.socBuffer[HOURS_PER_YEAR - 1]).toBe(r.end.socBuffer);
        expectBalance(qIn - qOut - loss, r.end.socBuffer - r.start.socBuffer, qIn + qOut + loss, 'buffer');
      });

      it('energiebalans batterij: Σ P_bat,in·η − Σ P_bat,uit/η = SoC_eind − SoC_begin', () => {
        const r = run(sc);
        const s = seriesOf(r);
        const eta = batteryEfficiency();
        const charge = sum(s.pBattery, (v) => -Math.min(v, 0));
        const discharge = sum(s.pBattery, (v) => Math.max(v, 0));
        expect(s.socBattery[HOURS_PER_YEAR - 1]).toBe(r.end.socBattery);
        expectBalance(
          charge * eta - discharge / eta,
          r.end.socBattery - r.start.socBattery,
          charge + discharge,
          'batterij',
        );
      });

      if (sc.mode === 'limited') {
        it('modus limited: in elk uur P_net ≤ P_limiet + 1e-6', () => {
          const r = run(sc);
          const s = seriesOf(r);
          const pLim = sc.setup.pLimitKw;
          const bad = s.pGrid.findIndex((v) => !(v <= pLim + 1e-6));
          expect(bad, `uur ${bad}: P_net ${s.pGrid[bad]} > P_limiet ${pLim}`).toBe(-1);
          expect(r.kpis.exceedanceHours).toBe(0);
          expect(r.kpis.exceedanceKwh).toBe(0);
        });
      }
    });
  }

  it('de extra configuraties raken bijstook en batterij met vast vermogen echt', () => {
    const byName = (prefix: string): SimulationResult => {
      const sc = SCENARIOS.find((x) => x.name.startsWith(prefix));
      if (!sc) throw new Error(prefix);
      return run(sc);
    };
    for (const mode of ['exceedance', 'limited']) {
      const r = byName(`woning, WP 6 kW + bijstook 2 kW, buffer 1 m³ + batterij 10 kWh (${mode})`);
      expect(r.kpis.eBackupKwh, mode).toBeGreaterThan(0);
      expect(Math.max(...seriesOf(r).qBackup), mode).toBeLessThanOrEqual(2 + 1e-9);
      const k = byName(`kantoor, WP 100 kW, batterij 100 kWh met vast vermogen 30 kW (${mode})`);
      expect(k.kpis.eBatteryOutKwh, mode).toBeGreaterThan(0);
      const pBat = seriesOf(k).pBattery;
      expect(Math.max(...pBat.map(Math.abs)), mode).toBeLessThanOrEqual(30 + 1e-9);
    }
  });
});

describe('monotonie (spec §9.7)', () => {
  it('P_th,min(V) is niet-stijgend in het buffervolume (woning, T5, binnen +1 % ruis)', () => {
    const { setup, climate } = fixtureCase('W1');
    const prepared = prepareYear(setup.building, setup.heatPump, climate);
    const volumes = [0, 0.25, 0.5, 1, 2, 3];
    const p = volumes.map((volumeM3) =>
      sizeHeatPump(
        setup.building,
        setup.heatPump,
        { volumeM3, strategy: 'predictive' },
        climate,
        0,
        prepared,
      ),
    );
    for (const v of p) expect(Number.isFinite(v)).toBe(true);
    for (let i = 1; i < p.length; i++) {
      expect(p[i], `V ${volumes[i]} m³: ${p[i]} kW na ${p[i - 1]} kW`).toBeLessThanOrEqual(p[i - 1] * 1.01);
    }
    // de buffer moet wel effect hebben: 3 m³ duidelijk kleiner dan zonder buffer
    expect(p[p.length - 1]).toBeLessThan(p[0]);
  });

  /** Uren overschrijding per batterijcapaciteit (vermogen 0,5 C), optioneel met WP = P_th,min zonder buffer. */
  function exceedanceByBattery(prefix: string, batteries: number[], sizedHeatPump: boolean): number[] {
    const base = fixtureCase(prefix);
    const prepared = prepareYear(base.setup.building, base.setup.heatPump, base.climate);
    const nominalKw = sizedHeatPump
      ? sizeHeatPump(base.setup.building, base.setup.heatPump, base.setup.buffer, base.climate, 0, prepared)
      : base.setup.heatPump.nominalKw;
    return batteries.map(
      (capacityKwh) =>
        simulate(
          {
            ...base.setup,
            heatPump: { ...base.setup.heatPump, nominalKw },
            battery: { capacityKwh, powerKw: null },
          },
          base.climate,
          { mode: base.mode, prepared, record: false },
        ).kpis.exceedanceHours,
    );
  }

  const BATTERY_SWEEPS: [string, string, number[], boolean][] = [
    ['kantoor K1 (WP 100 kW)', 'K1', [0, 25, 50, 100, 200], false],
    ['kantoor K1 met WP = P_th,min zonder buffer (spec §9.6)', 'K1', [0, 25, 50, 100, 200], true],
    ['woning W1 met WP = P_th,min zonder buffer (spec §9.6)', 'W1', [0, 1, 2, 5, 10], true],
  ];
  for (const [label, prefix, batteries, sized] of BATTERY_SWEEPS) {
    it(`uren overschrijding zijn niet-stijgend in de batterijcapaciteit (${label}, strikt)`, () => {
      const hours = exceedanceByBattery(prefix, batteries, sized);
      expect(hours[0], 'zonder batterij moet er overschrijding zijn').toBeGreaterThan(0);
      for (let i = 1; i < hours.length; i++) {
        expect(hours[i], `batterij ${batteries[i]} kWh: ${hours.join(' / ')}`).toBeLessThanOrEqual(
          hours[i - 1],
        );
      }
    });
  }
});

describe('vroegtijdig stoppen (abortAbove)', () => {
  type Counter = 'comfortLossHours' | 'dhwShortfallHours' | 'exceedanceHours';

  /** Vergelijkt per drempel een afgebroken run met de volledige run: zelfde beslissing "teller ≤ drempel". */
  function checkAbort(sc: Omit<Scenario, 'name'>, counter: Counter): void {
    const prepared: PreparedYear = prepareYear(sc.setup.building, sc.setup.heatPump, sc.climate);
    const opts: SimulateOptions = { mode: sc.mode, prepared, record: false };
    const full = simulate(sc.setup, sc.climate, opts);
    expect(full.aborted).toBe(false);
    const n = full.kpis[counter];
    expect(n, `${counter} in de volledige run`).toBeGreaterThan(1);
    for (const threshold of [0, 1, Math.floor(n / 2), n - 1, n, n + 1, 10 * n]) {
      const r = simulate(sc.setup, sc.climate, { ...opts, abortAbove: { [counter]: threshold } });
      const label = `${counter}, drempel ${threshold} (volledig ${n})`;
      expect(r.aborted, label).toBe(n > threshold);
      expect(r.kpis[counter] <= threshold, label).toBe(n <= threshold);
      // niet afgebroken: identiek aan de volledige run
      if (!r.aborted) expect(r.kpis, label).toEqual(full.kpis);
    }
  }

  it('comfortverlies: woning, WP 8 kW, zonder elektrische limiet (limited)', () => {
    const sc = withSetup('W1', (s) => ({ ...s, pLimitKw: Infinity }));
    checkAbort({ ...sc, mode: 'limited' }, 'comfortLossHours');
  });

  it('uren overschrijding: kantoor K1 (exceedance)', () => {
    checkAbort(fixtureCase('K1'), 'exceedanceHours');
  });

  it('tapwatertekort: woning met een te kleine WP van 0,3 kW (limited)', () => {
    const sc = withSetup('W1', (s) => ({
      ...s,
      heatPump: { ...s.heatPump, nominalKw: 0.3 },
      pLimitKw: Infinity,
    }));
    checkAbort({ ...sc, mode: 'limited' }, 'dhwShortfallHours');
  });

  it('sizeHeatPump (met abortAbove) geeft hetzelfde resultaat als een bisectie met volledige runs', () => {
    const { setup, climate } = fixtureCase('W2');
    const prepared = prepareYear(setup.building, setup.heatPump, climate);
    const ok = (nominalKw: number): boolean => {
      const k = simulate(
        {
          ...setup,
          heatPump: { ...setup.heatPump, nominalKw },
          battery: { capacityKwh: 0, powerKw: null },
          pLimitKw: Infinity,
        },
        climate,
        { mode: 'limited', prepared, record: false },
      ).kpis;
      return k.comfortLossHours <= 0 && k.dhwShortfallHours === 0;
    };
    let lo = SIZING_LOW * setup.building.designLoadKw;
    let hi = SIZING_HIGH * setup.building.designLoadKw;
    expect(ok(hi)).toBe(true);
    for (let i = 0; i < SIZING_ITERATIONS; i++) {
      const mid = 0.5 * (lo + hi);
      if (ok(mid)) hi = mid;
      else lo = mid;
    }
    expect(sizeHeatPump(setup.building, setup.heatPump, setup.buffer, climate, 0, prepared)).toBe(hi);
  });
});

describe('prestaties (spec §9.7)', () => {
  function median(xs: number[]): number {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]);
  }

  function timeMedian(fn: () => void, warmup: number, runs: number): number {
    for (let i = 0; i < warmup; i++) fn();
    const times: number[] = [];
    for (let i = 0; i < runs; i++) {
      const t0 = performance.now();
      fn();
      times.push(performance.now() - t0);
    }
    return median(times);
  }

  for (const prefix of ['W3', 'K3']) {
    it(`één simulatie van 8760 uur met reeksen < 20 ms (mediaan, ${prefix})`, () => {
      const { setup, climate, mode } = fixtureCase(prefix);
      const prepared = prepareYear(setup.building, setup.heatPump, climate);
      const ms = timeMedian(() => simulate(setup, climate, { mode, prepared }), 5, 21);
      expect(ms, `${ms.toFixed(2)} ms`).toBeLessThan(20);
    });
  }

  for (const prefix of ['W2', 'K2']) {
    it(`sizeHeatPump < 300 ms (mediaan, ${prefix})`, () => {
      const { setup, climate } = fixtureCase(prefix);
      const prepared = prepareYear(setup.building, setup.heatPump, climate);
      const ms = timeMedian(
        () => sizeHeatPump(setup.building, setup.heatPump, setup.buffer, climate, 0, prepared),
        1,
        5,
      );
      expect(ms, `${ms.toFixed(1)} ms`).toBeLessThan(300);
    });
  }
});
