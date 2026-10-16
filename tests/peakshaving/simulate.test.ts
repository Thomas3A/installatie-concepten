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
    number,
    number,
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
    ['K1', 133.92, 28.8, 28.8, 132, 1.09, 121, 14.79, 56388, 3.71, 0, 0, 172.4],
    ['K2', 133.92, 28.48, 28.48, 2, 0.77, 8, 17.48, 57967, 3.63, 5898, 1280, 125.81],
    ['K3', 133.92, 25.64, 25.64, 0, 0, 271, 10.3, 55800, 3.65, 10912, 1378, null],
    ['K4', 133.92, 25.64, 25.64, 0, 0, 271, 10.3, 55800, 3.65, 10912, 1378, null],
    ['K5', 144.74, 28.8, 28.8, 183, 1.09, 155, 12.28, 60137, 3.61, 0, 0, 205.75],
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
      expectClosePower(k.eBufferOutKwh, bufOut, 'E_buf,uit');
      expectClosePower(k.eBufferLossKwh, bufLoss, 'E_buf,verlies');
      if (pth !== null) {
        const p = sizeHeatPump(setup.building, setup.heatPump, setup.buffer, climate, 0, prepared);
        expect(Math.abs(p - pth) / pth).toBeLessThanOrEqual(0.01);
      }
    });
  }
});
