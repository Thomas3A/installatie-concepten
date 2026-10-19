// UI-laag zonder DOM: scenario's, deelbare link, registry, klimaatstatistiek, rekenmotor en store-acties.
import { describe, expect, it } from 'vitest';
import { CONCEPTS } from '../../src/concepts';
import {
  REAL_YEAR_START_WEEKDAY,
  REAL_YEAR_STATS,
  REFERENCE_YEAR_DESCRIPTIONS,
  REFERENCE_YEAR_STATS,
} from '../../src/concepts/peakshaving/data/climateStats';
import { defaultInput } from '../../src/concepts/peakshaving/data/defaults';
import { analyze } from '../../src/concepts/peakshaving/model/analysis';
import { REFERENCE_YEARS } from '../../src/concepts/peakshaving/model/climate';
import { createEngine, type EngineResponse } from '../../src/concepts/peakshaving/model/engine';
import { normalizeInput } from '../../src/concepts/peakshaving/model/input';
import { SCENARIOS } from '../../src/concepts/peakshaving/scenarios';
import { decodeInput, encodeInput, shareUrl } from '../../src/concepts/peakshaving/share';
import { defaultScrubHour } from '../../src/concepts/peakshaving/store';
import { COLD_WEEK_HOURS } from '../../src/concepts/peakshaving/model/climate';
import { REAL_JSON, REF_JSON, realYear, refYear } from './helpers';

describe('registry', () => {
  it('peakshaving is actief met route, lazy component en de klimaatzin voor de footer', () => {
    const c = CONCEPTS.find((x) => x.id === 'peakshaving');
    expect(c?.status).toBe('actief');
    expect(c?.route).toBe('/peakshaving');
    expect(c?.titel).toBe('Peakshaving warmtepomp met buffer en batterij');
    expect(c?.component).toBeDefined();
    expect(c?.disclaimer).toContain('geen officiële NEN 5060-data');
  });
});

describe('klimaatstatistiek voor de keuzelijst', () => {
  it('komt overeen met de meta van de JSON-bestanden', () => {
    for (const y of REFERENCE_YEARS) {
      expect(REF_JSON.meta.jaren[y].statistiek).toMatchObject(REFERENCE_YEAR_STATS[y]);
    }
    for (let y = 1951; y <= 2025; y++) {
      expect(REAL_JSON.meta.statistiek[String(y)]).toMatchObject(REAL_YEAR_STATS[y]);
      expect(REAL_JSON.meta.startWeekdag[String(y)]).toBe(REAL_YEAR_START_WEEKDAY[y]);
    }
    expect(Object.keys(REAL_YEAR_STATS)).toHaveLength(75);
    for (const y of REFERENCE_YEARS) {
      expect(REFERENCE_YEAR_DESCRIPTIONS[y]).toBe(REF_JSON.meta.jaren[y].omschrijving);
    }
  });
});

describe('deelbare link', () => {
  it('encode → decode geeft dezelfde invoer, ook voor een kantoor met afwijkingen', () => {
    for (const input of [defaultInput('residential'), defaultInput('office')]) {
      expect(decodeInput(encodeInput(input))).toEqual(input);
    }
    const i = defaultInput('office');
    i.climateYear = 'knmi-2012';
    i.grid.connection = 'grootverbruik';
    i.grid.contractedKw = 150;
    i.heatPump = { ...i.heatPump, sizingMode: 'manual', nominalKw: 140, emitterPreset: 'HT', maxSupplyC: 70 };
    i.battery = { capacityKwh: 80, powerKw: 60 };
    const norm = normalizeInput(i);
    const code = encodeInput(norm);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeInput(code)).toEqual(norm);
  });
  it('de link is compact (alleen afwijkingen) en bevat een versienummer', () => {
    const json = atob(encodeInput(defaultInput('residential')).replace(/-/g, '+').replace(/_/g, '/'));
    expect(JSON.parse(json)).toEqual({ v: 1, building: { use: 'residential' } });
    expect(shareUrl(defaultInput('residential'), { href: 'https://x.nl/installatie-concepten/#/oud' })).toBe(
      `https://x.nl/installatie-concepten/#/peakshaving?c=${encodeInput(defaultInput('residential'))}`,
    );
  });
  it('beschadigde of te nieuwe links geven null; onzinwaarden worden begrensd', () => {
    expect(decodeInput('%%%')).toBeNull();
    expect(decodeInput(btoa(JSON.stringify({ v: 99 })))).toBeNull();
    const code = btoa(JSON.stringify({ v: 1, building: { designLoadKw: 1e9 } })).replace(/=+$/, '');
    expect(decodeInput(code)?.building.designLoadKw).toBe(2000);
  });
});

describe("scenario's (spec §10, orde van grootte volgens §9.6)", () => {
  it('tien scenario’s (acht uit de spec, twee met meerdere woningen) met titel en toelichting, geldige invoer', () => {
    expect(SCENARIOS).toHaveLength(10);
    expect(SCENARIOS.map((s) => s.id)).toEqual([
      'woning-basis',
      'woning-buffer',
      'woning-buffer-batterij',
      'nieuwbouw',
      'woningen-basis',
      'woningen-buffer',
      'kantoor-basis',
      'kantoor-buffer',
      'kantoor-buffer-batterij',
      'kantoor-t1',
    ]);
    for (const s of SCENARIOS) {
      expect(s.title.length).toBeGreaterThan(10);
      expect(s.description.length).toBeGreaterThan(10);
      expect(normalizeInput(s.build())).toEqual(s.build());
    }
  });

  const run = (id: string) => {
    const input = SCENARIOS.find((s) => s.id === id)!.build();
    const year = input.climateYear === 'T1' ? refYear('T1') : refYear('T5');
    return analyze(input, year, { robustnessYears: [year] });
  };

  it('1 · woning zonder maatregelen: ≈ 10,6 kW, ≈ 100 uur boven 1×35 A, kleinste 1×40 A', () => {
    const a = run('woning-basis');
    expect(a.nominalKw).toBeCloseTo(10.56, 1);
    expect(a.main.kpis.exceedanceHours).toBeGreaterThan(80);
    expect(a.smallest.label).toBe('1×40 A');
  });
  it('2 · met 0,5 m³ buffer past de woning binnen 1×35 A', () => {
    const a = run('woning-buffer');
    expect(a.nominalKw).toBeCloseTo(9.42, 1);
    expect(a.main.kpis.exceedanceHours).toBe(0);
    expect(a.smallest.label).toBe('1×35 A');
  });
  it('3 · met 1 m³ buffer en 5 kWh batterij kan de woning naar 1×25 A', () => {
    const a = run('woning-buffer-batterij');
    expect(a.nominalKw).toBeCloseTo(8.72, 1);
    expect(a.smallest.label).toBe('1×25 A');
  });
  it('4 · nieuwbouwwoning 4 kW LT met tapwater 12 kWh/dag is te dimensioneren', () => {
    const a = run('nieuwbouw');
    expect(Number.isFinite(a.sizing.withBuffer)).toBe(true);
    expect(a.input.heatPump.emitterPreset).toBe('LT');
    expect(a.input.grid.connection).toBe('1x25');
  });
  it('extra · 10 woningen op één warmtepomp zonder maatregelen: ≈ 66 kW, ruim 100 uur boven 3×35 A, kleinste 3×40 A', () => {
    const a = run('woningen-basis');
    expect(a.input.building.dwellings).toBe(10);
    expect(a.input.building.designLoadKw).toBe(50);
    expect(a.nominalKw).toBeCloseTo(65.8, 0);
    expect(a.pLimitKw).toBeCloseTo(19.4, 1);
    expect(a.main.kpis.pGridMaxKw).toBeCloseTo(21.6, 1);
    expect(a.main.kpis.exceedanceHours).toBeGreaterThan(100);
    expect(a.smallest.label).toBe('3×40 A');
  });
  it('extra · 10 woningen met 1 m³ buffer: meterpiek 19,4 kW, past zonder overschrijding binnen 3×35 A', () => {
    const a = run('woningen-buffer');
    expect(a.nominalKw).toBeCloseTo(63.6, 0);
    expect(a.main.kpis.pGridMaxKw).toBeCloseTo(19.4, 1);
    expect(a.main.kpis.exceedanceHours).toBe(0);
    expect(a.smallest.label).toBe('3×35 A');
    // zonder maatregelen hetzelfde als het vorige scenario
    expect(a.withoutMeasures.smallest.label).toBe('3×40 A');
  });
  it('5 · kantoor zonder maatregelen: ≈ 172 kW en ruim 300 uur boven 3×80 A', () => {
    const a = run('kantoor-basis');
    expect(a.nominalKw).toBeCloseTo(172.4, 0);
    expect(a.main.kpis.exceedanceHours).toBeGreaterThan(300);
  });
  it('6 · kantoor met 20 m³ buffer past binnen 3×80 A bij 50 %', () => {
    const a = run('kantoor-buffer');
    expect(a.nominalKw).toBeCloseTo(96.4, 0);
    expect(a.main.kpis.exceedanceHours).toBe(0);
  });
  it('7 · kantoor met 10 m³ buffer en 100 kWh batterij: 0 uur overschrijding', () => {
    expect(run('kantoor-buffer-batterij').main.kpis.exceedanceHours).toBe(0);
  });
  it('8 · stresstest T1 met 20 m³ buffer: een groter WP-vermogen dan in T5', () => {
    const t1 = run('kantoor-t1');
    expect(t1.climateId).toBe('T1');
    expect(t1.nominalKw).toBeGreaterThan(run('kantoor-buffer').nominalKw);
  });
});

describe('rekenmotor (Web Worker-protocol)', () => {
  it('analyze: antwoord met hetzelfde id, robuustheid in vijf referentiejaren (spec §6.3)', async () => {
    const engine = createEngine();
    const got: EngineResponse[] = [];
    await engine.handle({ type: 'analyze', id: 7, input: defaultInput('residential') }, (m) => got.push(m));
    expect(got).toHaveLength(1);
    const m = got[0];
    expect(m.type).toBe('analysis');
    if (m.type !== 'analysis') return;
    expect(m.id).toBe(7);
    expect(m.analysis.robustness.map((r) => r.climateId)).toEqual([
      'energie',
      'T5',
      'T1',
      'winter1979',
      'winter1963',
    ]);
    expect(m.analysis.robustness.filter((r) => r.selected).map((r) => r.climateId)).toEqual([
      m.analysis.climateId,
    ]);
    // de stresstestjaren zijn strenger: meer uren boven de limiet dan het energiejaar
    const by = Object.fromEntries(m.analysis.robustness.map((r) => [r.climateId, r]));
    expect(by.winter1979.exceedanceHours).toBeGreaterThan(by.energie.exceedanceHours);
    expect(by.winter1963.electricityKwh).toBeGreaterThan(by.T1.electricityKwh);
  });
  it('een werkelijk jaar wordt lazy geladen en als zesde rij aan de robuustheid toegevoegd', async () => {
    const engine = createEngine(async () => REAL_JSON);
    const input = { ...defaultInput('residential'), climateYear: 'knmi-1997' };
    const got: EngineResponse[] = [];
    await engine.handle({ type: 'analyze', id: 1, input }, (m) => got.push(m));
    const m = got[0];
    if (m.type !== 'analysis') throw new Error(m.type);
    expect(m.analysis.climateId).toBe('knmi-1997');
    expect(m.analysis.startWeekday).toBe(realYear(1997).startWeekday);
    expect(m.analysis.robustness.map((r) => r.climateId)).toEqual([
      'energie',
      'T5',
      'T1',
      'winter1979',
      'winter1963',
      'knmi-1997',
    ]);
  });
  it('gevoeligheid: 13 rijen progressief, een nieuwer verzoek breekt het oude af', async () => {
    const engine = createEngine();
    const rows: number[] = [];
    const done: number[] = [];
    const emit = (m: EngineResponse): void => {
      if (m.type === 'sensitivity-row') rows.push(m.id);
      if (m.type === 'sensitivity-done') done.push(m.id);
    };
    const first = engine.handle(
      { type: 'sensitivity', id: 1, key: 'a', input: defaultInput('residential') },
      emit,
    );
    const second = engine.handle(
      { type: 'sensitivity', id: 2, key: 'b', input: defaultInput('residential') },
      emit,
    );
    await Promise.all([first, second]);
    expect(done).toEqual([2]);
    expect(rows.filter((id) => id === 2)).toHaveLength(13);
    expect(rows.filter((id) => id === 1).length).toBeLessThan(13);
  }, 60000);
});

describe('standaarduur van scrubber en conceptschema (spec §8)', () => {
  it('ligt in de koude week zelf en is het uur van max P_net (bij gelijkstand de hoogste P_el)', () => {
    for (const id of ['woning-basis', 'kantoor-buffer-batterij']) {
      const input = SCENARIOS.find((s) => s.id === id)!.build();
      const a = analyze(input, refYear('T5'), { robustnessYears: [refYear('T5')] });
      const h = defaultScrubHour(a);
      const { start } = a.coldWeek;
      expect(h).toBeGreaterThanOrEqual(start);
      expect(h).toBeLessThan(start + COLD_WEEK_HOURS);
      const g = a.main.series.pGrid;
      for (let t = start; t < start + COLD_WEEK_HOURS; t++) {
        expect(g[t]).toBeLessThanOrEqual(g[h] + 1e-9);
        if (Math.abs(g[t] - g[h]) <= 1e-9)
          expect(a.main.series.pElectric[t]).toBeLessThanOrEqual(a.main.series.pElectric[h]);
      }
    }
  });
});
