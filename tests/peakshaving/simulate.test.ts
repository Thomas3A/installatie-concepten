// Integratie: referentiecases van spec §9.5 tegen tools/peakshaving_ref/referentiewaarden.json.
import { describe, expect, it } from 'vitest';
import { coldestWeekStart } from '../../src/concepts/peakshaving/model/climate';
import { prepareYear, simulate } from '../../src/concepts/peakshaving/model/simulate';
import { sizeHeatPump } from '../../src/concepts/peakshaving/model/sizing';
import { caseSetup, expectCloseHours, expectClosePower, expectCloseTemp, FIXTURE } from './helpers';

// KPI-sleutels Python → TypeScript, met het soort tolerantie
const POWER_KEYS: [string, string][] = [
  ['Q_ideaal_max', 'qIdealMaxKw'],
  ['P_el_wp_max', 'pElectricMaxKw'],
  ['P_net_max', 'pGridMaxKw'],
  ['max_overschrijding', 'maxExceedanceKw'],
  ['Q_wp_max', 'qHeatPumpMaxKw'],
  ['E_el_wp', 'eElectricKwh'],
  ['E_el_bijstook', 'eBackupKwh'],
  ['E_th_cv', 'eSpaceHeatKwh'],
  ['E_th_tap', 'eDhwHeatKwh'],
  ['E_th_buf_in', 'eBufferInKwh'],
  ['E_th_buf_uit', 'eBufferOutKwh'],
  ['E_buf_verlies', 'eBufferLossKwh'],
  ['E_bat_in', 'eBatteryInKwh'],
  ['E_bat_uit', 'eBatteryOutKwh'],
  ['E_net', 'eGridKwh'],
  ['kWh_overschrijding', 'exceedanceKwh'],
  ['kWh_tekort', 'shortfallKwh'],
  ['kWh_tap_tekort', 'dhwShortfallKwh'],
  ['E_th_vraag', 'eSpaceDemandKwh'],
  ['E_buf_kWh', 'bufferEnergyKwh'],
  ['P_limiet', 'pLimitKw'],
];
const HOUR_KEYS: [string, string][] = [
  ['uren_overschrijding', 'exceedanceHours'],
  ['uren_comfort', 'comfortLossHours'],
  ['uren_tap_tekort', 'dhwShortfallHours'],
];

describe('referentiecases (spec §9.5)', () => {
  it('18 cases: W1–W11 en K1–K7, in vijf klimaatjaren', () => {
    const ids = FIXTURE.cases.map((c) => c.naam.split(' ')[0]);
    expect(ids).toEqual([
      ...Array.from({ length: 11 }, (_, i) => `W${i + 1}`),
      ...Array.from({ length: 7 }, (_, i) => `K${i + 1}`),
    ]);
    expect([...new Set(FIXTURE.cases.map((c) => c.jaar))].sort()).toEqual(
      ['T1', 'T5', 'energie', 'winter1963', 'winter1979'].sort(),
    );
  });

  it('de stresstestcases gebruiken de koude week van hun eigen jaar (winter1979: over de jaargrens)', () => {
    const start = (id: string): number =>
      FIXTURE.cases.find((c) => c.naam.startsWith(`${id} `))!.kpi.koudste_week_start;
    expect(['W9', 'W10', 'K6'].map(start)).toEqual([8736, 8736, 8736]);
    expect(start('W11')).toBe(368);
    expect(start('K7')).toBe(368);
  });

  for (const c of FIXTURE.cases) {
    it(c.naam, () => {
      const { setup, climate, mode } = caseSetup(c);
      const prepared = prepareYear(setup.building, setup.heatPump, climate);
      const r = simulate(setup, climate, { mode, prepared });
      const k = r.kpis as unknown as Record<string, number>;
      for (const [py, ts] of POWER_KEYS) expectClosePower(k[ts], c.kpi[py], `${c.naam} · ${ts}`);
      for (const [py, ts] of HOUR_KEYS) expectCloseHours(k[ts], c.kpi[py], `${c.naam} · ${ts}`);
      expectCloseTemp(r.kpis.minIndoorC, c.kpi.min_T_i, `${c.naam} · minIndoorC`);
      expect(r.kpis.scop).toBeCloseTo(c.kpi.SCOP, 1);
      expectClosePower(r.kpis.scop, c.kpi.SCOP, `${c.naam} · scop`);
      expect(r.kpis.bufferDeltaT).toBe(c.kpi.dT_buf);
      expectClosePower(r.kpis.bufferCycles, c.kpi.cycli_buffer, `${c.naam} · bufferCycles`);
      expectClosePower(r.kpis.batteryCycles, c.kpi.cycli_batterij, `${c.naam} · batteryCycles`);
      expect(coldestWeekStart(prepared.qIdeal, climate.T)).toBe(c.kpi.koudste_week_start);
      if (c.kpi.P_th_min !== undefined) {
        const p = sizeHeatPump(setup.building, setup.heatPump, setup.buffer, climate, 0, prepared);
        expect(
          Math.abs(p - c.kpi.P_th_min) / c.kpi.P_th_min,
          `${c.naam} · P_th,min ${p}`,
        ).toBeLessThanOrEqual(0.01);
      }
    });
  }
});

describe('tabel spec §9.5 (afgeronde waarden)', () => {
  // [case-prefix, Q_vraag,max, P_el,max, P_net,max, uren overschr., max overschr., uren comfort, min T_i, E_el, SCOP, E_buf,uit, E_buf,verlies, P_th,min]
  // null = "—" in de spectabel; die waarden staan wel in de fixture en worden in 'referentiecases' getoetst
  const TABLE: [
    string,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number | null,
    number | null,
    number | null,
  ][] = [
    ['W1', 7.52, 2.75, 2.75, 0, 0, 78, 17.51, 4966, 3.46, 0, 0, 10.56],
    ['W2', 7.52, 2.75, 2.75, 0, 0, 15, 18.32, 5116, 3.37, 500.8, 227.4, 8.72],
    ['W3', 7.52, 2.75, 2.75, 0, 0, 15, 18.32, 5116, 3.37, 500.8, 227.4, null],
    ['W4', 7.52, 2.12, 2.12, 0, 0, 520, 13.66, 5001, 3.38, 685.8, 207.8, null],
    ['W5', 7.52, 2.75, 2.75, 0, 0, 6, 19.14, 5225, 3.3, 513.6, 561.5, null],
    ['W6', 7.52, 2.75, 2.75, 0, 0, 15, 18.25, 5152, 3.34, 500.0, 331.9, 8.74],
    ['W7', 8.15, 2.74, 2.74, 0, 0, 253, 13.88, 5274, 3.39, 0, 0, 12.93],
    ['W8', 6.23, 2.73, 2.73, 0, 0, 2, 19.47, 4188, 3.79, 0, 0, 8.14],
    ['W9', 8.28, 2.75, 2.75, 0, 0, 228, 13.25, 5319, 3.4, 0, 0, 12.18],
    ['W10', 8.28, 2.75, 2.75, 0, 0, 189, 13.38, 5477, 3.31, null, null, 10.57],
    ['W11', 8.17, 2.75, 2.75, 0, 0, 595, 14.38, 6082, 3.26, 0, 0, 12.92],
    ['K1', 133.92, 28.8, 28.8, 132, 1.09, 121, 14.79, 56388, 3.71, 0, 0, 172.4],
    ['K2', 133.92, 28.48, 28.48, 2, 0.77, 8, 17.48, 57967, 3.63, 5898, 1280, 125.81],
    ['K3', 133.92, 25.64, 25.64, 0, 0, 271, 10.3, 55800, 3.65, 10912, 1378, null],
    ['K4', 133.92, 25.64, 25.64, 0, 0, 271, 10.3, 55800, 3.65, 10912, 1378, null],
    ['K5', 144.74, 28.8, 28.8, 183, 1.09, 155, 12.28, 60137, 3.61, 0, 0, 205.75],
    ['K6', 145.13, 28.8, 28.8, 190, 1.09, 140, 11.1, 60812, 3.61, 0, 0, 209.39],
    ['K7', 138.6, 28.8, 28.8, 42, 1.09, 88, 13.43, 73239, 3.33, null, null, 117.37],
  ];
  for (const row of TABLE) {
    const [id, qMax, pEl, pNet, hEx, maxEx, hCom, minTi, eEl, scop, bufOut, bufLoss, pth] = row;
    it(`${id} volgens de spectabel`, () => {
      const c = FIXTURE.cases.find((x) => x.naam.startsWith(`${id} `))!;
      const { setup, climate, mode } = caseSetup(c);
      const prepared = prepareYear(setup.building, setup.heatPump, climate);
      const k = simulate(setup, climate, { mode, prepared, record: false }).kpis;
      expectClosePower(k.qIdealMaxKw, qMax, 'Q_vraag,max');
      expectClosePower(k.pElectricMaxKw, pEl, 'P_el,max');
      expectClosePower(k.pGridMaxKw, pNet, 'P_net,max');
      expectCloseHours(k.exceedanceHours, hEx, 'uren overschrijding');
      expectClosePower(k.maxExceedanceKw, maxEx, 'max overschrijding');
      expectCloseHours(k.comfortLossHours, hCom, 'uren comfort');
      expectCloseTemp(k.minIndoorC, minTi, 'min T_i');
      expectClosePower(k.eElectricKwh, eEl, 'E_el');
      expectClosePower(k.scop, scop, 'SCOP');
      if (bufOut !== null) expectClosePower(k.eBufferOutKwh, bufOut, 'E_buf,uit');
      if (bufLoss !== null) expectClosePower(k.eBufferLossKwh, bufLoss, 'E_buf,verlies');
      if (pth !== null) {
        const p = sizeHeatPump(setup.building, setup.heatPump, setup.buffer, climate, 0, prepared);
        expect(Math.abs(p - pth) / pth).toBeLessThanOrEqual(0.01);
      }
    });
  }
});
