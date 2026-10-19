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
import { REFERENCE_YEARS, type ReferenceYearName } from '../../src/concepts/peakshaving/model/climate';
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
    expect(JSON.parse(json)).toEqual({ v: 2, building: { use: 'residential' } });
    expect(shareUrl(defaultInput('residential'), { href: 'https://x.nl/installatie-concepten/#/oud' })).toBe(
      `https://x.nl/installatie-concepten/#/peakshaving?c=${encodeInput(defaultInput('residential'))}`,
    );
  });
  it('versie 1 (standaardklimaatjaar T5): een link zonder klimaatjaar blijft T5; versie 2 zonder klimaatjaar is T1', () => {
    const link = (o: object): string => btoa(JSON.stringify(o)).replace(/=+$/, '');
    expect(decodeInput(link({ v: 1, building: { use: 'residential' } }))?.climateYear).toBe('T5');
    expect(decodeInput(link({ building: { use: 'office' } }))?.climateYear).toBe('T5');
    expect(
      decodeInput(link({ v: 1, climateYear: 'knmi-1997', building: { use: 'office' } }))?.climateYear,
    ).toBe('knmi-1997');
    expect(decodeInput(link({ v: 2, building: { use: 'residential' } }))?.climateYear).toBe('T1');
    expect(decodeInput(encodeInput(defaultInput('residential')))?.climateYear).toBe('T1');
    const t5 = { ...defaultInput('residential'), climateYear: 'T5' };
    expect(decodeInput(encodeInput(t5))).toEqual(t5);
  });
  it('beschadigde of te nieuwe links geven null; onzinwaarden worden begrensd', () => {
    expect(decodeInput('%%%')).toBeNull();
    expect(decodeInput(btoa(JSON.stringify({ v: 99 })))).toBeNull();
    const code = btoa(JSON.stringify({ v: 1, building: { designLoadKw: 1e9 } })).replace(/=+$/, '');
    expect(decodeInput(code)?.building.designLoadKw).toBe(2000);
  });
});

describe("scenario's (spec §10; in T5 de orde van grootte van §9.6)", () => {
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
      'kantoor-winter1979',
    ]);
    for (const s of SCENARIOS) {
      expect(s.title.length).toBeGreaterThan(10);
      expect(s.description.length).toBeGreaterThan(10);
      expect(normalizeInput(s.build())).toEqual(s.build());
    }
  });

  /** Doorrekening van een scenario in zijn eigen klimaatjaar, of in `year`. */
  const run = (id: string, year?: ReferenceYearName) => {
    const input = SCENARIOS.find((s) => s.id === id)!.build();
    if (year) input.climateYear = year;
    const climate = refYear(input.climateYear as ReferenceYearName);
    return analyze(input, climate, { robustnessYears: [climate] });
  };

  it('de voorbeelden rekenen in het standaardklimaatjaar T1, de stresstest in winter1979', () => {
    expect(SCENARIOS.map((s) => s.build().climateYear)).toEqual([...Array(9).fill('T1'), 'winter1979']);
  });

  // de beschrijvingen van de voorbeelden (T1)
  it('1 · woning zonder maatregelen: ≈ 12,9 kW, ≈ 150 uur boven 1×35 A, kleinste 3×25 A', () => {
    const a = run('woning-basis');
    expect(a.nominalKw).toBeCloseTo(12.93, 1);
    expect(a.main.kpis.exceedanceHours).toBeGreaterThan(140);
    expect(a.main.kpis.exceedanceHours).toBeLessThan(160);
    expect(a.smallest.label).toBe('3×25 A');
  });
  it('2 · met 0,5 m³ buffer: 11,4 kW, nog 2 uur boven de WP-limiet', () => {
    const a = run('woning-buffer');
    expect(a.nominalKw).toBeCloseTo(11.35, 1);
    expect(a.withoutMeasures.nominalKw).toBeCloseTo(12.93, 1);
    expect(a.main.kpis.exceedanceHours).toBe(2);
  });
  it('3 · met 1 m³ buffer: binnen 1×35 A, ook zonder batterij; op 1×25 A ≈ 45 uur boven de limiet', () => {
    const a = run('woning-buffer-batterij');
    expect(a.main.kpis.exceedanceHours).toBe(0);
    expect(a.noBattery.exceedanceHours).toBe(0);
    expect(a.smallest.label).toBe('1×35 A');
    const input = SCENARIOS.find((s) => s.id === 'woning-buffer-batterij')!.build();
    input.grid.connection = '1x25';
    const on25 = analyze(input, refYear('T1'), { robustnessYears: [refYear('T1')] });
    expect(on25.main.kpis.exceedanceHours).toBeGreaterThan(40);
    expect(on25.main.kpis.exceedanceHours).toBeLessThan(50);
  });
  it('4 · nieuwbouwwoning 4 kW LT met tapwater 12 kWh/dag: het tapwater bepaalt de elektrische piek', () => {
    const a = run('nieuwbouw');
    expect(Number.isFinite(a.sizing.withBuffer)).toBe(true);
    expect(a.input.heatPump.emitterPreset).toBe('LT');
    expect(a.input.grid.connection).toBe('1x25');
    expect(a.messages.map((m) => m.code)).toContain('dhwPeak');
  });
  it('extra · 10 woningen zonder maatregelen: ≈ 80 kW, ≈ 160 uur boven 19,4 kW, kleinste 3×50 A', () => {
    const a = run('woningen-basis');
    expect(a.input.building.dwellings).toBe(10);
    expect(a.input.building.designLoadKw).toBe(50);
    expect(a.nominalKw).toBeCloseTo(80.4, 0);
    expect(a.pLimitKw).toBeCloseTo(19.4, 1);
    expect(a.main.kpis.pGridMaxKw).toBeCloseTo(25.7, 1);
    expect(a.main.kpis.exceedanceHours).toBeGreaterThan(150);
    expect(a.main.kpis.exceedanceHours).toBeLessThan(170);
    expect(a.smallest.label).toBe('3×50 A');
  });
  it('extra · 10 woningen met 1 m³ buffer: 75 kW, meterpiek 25,7 → 21,8 kW, 15 uur, 3×40 A past', () => {
    const a = run('woningen-buffer');
    expect(a.nominalKw).toBeCloseTo(75.5, 0);
    expect(a.withoutMeasures.kpis.pGridMaxKw).toBeCloseTo(25.7, 1);
    expect(a.main.kpis.pGridMaxKw).toBeCloseTo(21.8, 1);
    expect(a.main.kpis.exceedanceHours).toBe(15);
    expect(a.smallest.label).toBe('3×40 A');
    // zonder maatregelen hetzelfde als het vorige scenario
    expect(a.withoutMeasures.smallest.label).toBe('3×50 A');
  });
  it('5 · kantoor zonder maatregelen: ≈ 206 kW en honderden uren boven 3×80 A', () => {
    const a = run('kantoor-basis');
    expect(a.nominalKw).toBeCloseTo(205.75, 0);
    expect(a.main.kpis.exceedanceHours).toBeGreaterThan(300);
  });
  it('6 · kantoor met 20 m³ buffer: 127 in plaats van 206 kW, nog 41 uur boven 3×80 A bij 50 %', () => {
    const a = run('kantoor-buffer');
    expect(a.nominalKw).toBeCloseTo(126.7, 0);
    expect(a.withoutMeasures.nominalKw).toBeCloseTo(205.75, 0);
    expect(a.input.grid.heatPumpShare).toBe(0.5);
    expect(a.main.kpis.exceedanceHours).toBe(41);
  });
  it('7 · kantoor met 10 m³ buffer en 100 kWh batterij: van 80 naar 32 uur, ≈ 440 kWh voor 0 uur', () => {
    const a = run('kantoor-buffer-batterij');
    expect(a.noBattery.exceedanceHours).toBe(80);
    expect(a.main.kpis.exceedanceHours).toBe(32);
    expect(a.requiredBattery?.feasible).toBe(true);
    expect(a.requiredBattery?.capacityKwh).toBeGreaterThan(420);
    expect(a.requiredBattery?.capacityKwh).toBeLessThan(460);
  });
  it('8 · stresstest strenge winter 1978/79 met 20 m³ buffer: ≈ 115 uur boven 3×80 A, tegen 41 in T1', () => {
    const w = run('kantoor-winter1979');
    const base = run('kantoor-buffer');
    expect(w.climateId).toBe('winter1979');
    expect(w.input.buffer.volumeM3).toBe(20);
    expect(SCENARIOS.find((s) => s.id === 'kantoor-winter1979')!.title).toBe(
      'Kantoor 100 kW — stresstest strenge winter 1978/79 met 20 m³ buffer',
    );
    // zelfde kantoor, zelfde buffer: alleen het klimaatjaar verschilt
    expect({ ...w.input, climateYear: base.input.climateYear }).toEqual(base.input);
    expect(w.main.kpis.exceedanceHours).toBeGreaterThan(105);
    expect(w.main.kpis.exceedanceHours).toBeLessThan(125);
    expect(w.main.kpis.exceedanceHours).toBeGreaterThan(base.main.kpis.exceedanceHours);
  });

  // dezelfde configuraties in T5: de orde van grootte van de gevoeligheidstabel (spec §9.6)
  it('in T5 · woning: 10,6 kW en ≈ 100 uur zonder maatregelen; 0,5 m³ past op 1×35 A; 1 m³ + 5 kWh op 1×25 A', () => {
    const basis = run('woning-basis', 'T5');
    expect(basis.nominalKw).toBeCloseTo(10.56, 1);
    expect(basis.main.kpis.exceedanceHours).toBeGreaterThan(80);
    expect(basis.smallest.label).toBe('1×40 A');
    const buffer = run('woning-buffer', 'T5');
    expect(buffer.nominalKw).toBeCloseTo(9.42, 1);
    expect(buffer.main.kpis.exceedanceHours).toBe(0);
    expect(buffer.smallest.label).toBe('1×35 A');
    const both = run('woning-buffer-batterij', 'T5');
    expect(both.nominalKw).toBeCloseTo(8.72, 1);
    expect(both.smallest.label).toBe('1×25 A');
  });
  it('in T5 · 10 woningen: ≈ 66 kW zonder maatregelen; met 1 m³ meterpiek 19,4 kW binnen 3×35 A', () => {
    const basis = run('woningen-basis', 'T5');
    expect(basis.nominalKw).toBeCloseTo(65.8, 0);
    expect(basis.main.kpis.pGridMaxKw).toBeCloseTo(21.6, 1);
    expect(basis.smallest.label).toBe('3×40 A');
    const buffer = run('woningen-buffer', 'T5');
    expect(buffer.nominalKw).toBeCloseTo(63.6, 0);
    expect(buffer.main.kpis.pGridMaxKw).toBeCloseTo(19.4, 1);
    expect(buffer.main.kpis.exceedanceHours).toBe(0);
    expect(buffer.smallest.label).toBe('3×35 A');
  });
  it('in T5 · kantoor: ≈ 172 kW zonder maatregelen; 20 m³ past op 3×80 A bij 50 %; 10 m³ + 100 kWh: 0 uur', () => {
    const basis = run('kantoor-basis', 'T5');
    expect(basis.nominalKw).toBeCloseTo(172.4, 0);
    expect(basis.main.kpis.exceedanceHours).toBeGreaterThan(300);
    const buffer = run('kantoor-buffer', 'T5');
    expect(buffer.nominalKw).toBeCloseTo(96.4, 0);
    expect(buffer.main.kpis.exceedanceHours).toBe(0);
    expect(run('kantoor-buffer-batterij', 'T5').main.kpis.exceedanceHours).toBe(0);
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
