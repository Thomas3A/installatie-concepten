// Meerdere woningen op één warmtepomp (buiten de spec, zie docs/AANNAMES.md): invoer normaliseren, keuze wisselen,
// aantal woningen schalen, gelijkwaardigheid in het rekenmodel (dat rekent met totalen) en de deelbare link.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DWELLINGS,
  DEFAULT_MULTI_LOAD_PER_DWELLING_KW,
  MULTI_DEFAULT_CONNECTION,
  MULTI_DEFAULT_SHARE,
  defaultInput,
  multiDwellingInput,
} from '../../src/concepts/peakshaving/data/defaults';
import { analyze, type Analysis } from '../../src/concepts/peakshaving/model/analysis';
import {
  LIMITS,
  buildingKind,
  normalizeInput,
  switchKind,
  withDwellings,
} from '../../src/concepts/peakshaving/model/input';
import type { PeakshavingInput } from '../../src/concepts/peakshaving/model/types';
import { findScenario } from '../../src/concepts/peakshaving/scenarios';
import { decodeInput, encodeInput, scenarioIdOf } from '../../src/concepts/peakshaving/share';
import { refYear } from './helpers';

const multi = (): PeakshavingInput => normalizeInput(multiDwellingInput());
const residential = (b: Record<string, unknown>) =>
  normalizeInput({ building: { use: 'residential', ...b } });
const toLink = (payload: unknown): string =>
  btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('standaardinvoer meerdere woningen', () => {
  it('10 woningen × 5 kW, tapwater 6 kWh/dag en boilervat 120 l × 10, eigen aansluiting 3×35 A met 80 %', () => {
    const i = multi();
    expect(i).toEqual(multiDwellingInput());
    expect(i.building.use).toBe('residential');
    expect(i.building.dwellings).toBe(DEFAULT_DWELLINGS);
    expect(i.building.designLoadKw).toBe(DEFAULT_DWELLINGS * DEFAULT_MULTI_LOAD_PER_DWELLING_KW);
    expect(i.building.dhw).toMatchObject({ enabled: true, dailyKwh: 60, tankLitre: 1200 });
    expect(i.grid.connection).toBe('3x35');
    expect(i.grid.connection).toBe(MULTI_DEFAULT_CONNECTION);
    expect(i.grid.heatPumpShare).toBe(MULTI_DEFAULT_SHARE);
    expect(i.climateYear).toBe('T5');
    // alleen aantal, piekvermogen, tapwater en aansluiting wijken af van één woning
    const one = defaultInput('residential');
    expect({ ...i.building, dwellings: 1, designLoadKw: 8, dhw: one.building.dhw }).toEqual(one.building);
    expect(i.buffer).toEqual(one.buffer);
    expect(i.battery).toEqual(one.battery);
  });
});

describe('normalizeInput: aantal woningen', () => {
  it('is een geheel getal, begrensd op 1–500; ontbrekend of ongeldig → 1', () => {
    expect(LIMITS.dwellings).toEqual([1, 500]);
    expect(residential({ dwellings: 12.6 }).building.dwellings).toBe(13);
    expect(residential({ dwellings: 0 }).building.dwellings).toBe(1);
    expect(residential({ dwellings: -4 }).building.dwellings).toBe(1);
    expect(residential({ dwellings: 1e6 }).building.dwellings).toBe(500);
    expect(residential({}).building.dwellings).toBe(1);
    expect(residential({ dwellings: Number.NaN }).building.dwellings).toBe(1);
    expect(residential({ dwellings: '10' }).building.dwellings).toBe(1);
    expect(normalizeInput(undefined).building.dwellings).toBe(1);
  });
  it('kantoor is altijd één gebouw', () => {
    const o = normalizeInput({ building: { use: 'office', dwellings: 10 } });
    expect(o.building.dwellings).toBe(1);
    expect(buildingKind(o.building)).toBe('office');
  });
  it('de grenzen van tapwaterbehoefte en boilervat schalen met het aantal woningen', () => {
    const many = residential({ dwellings: 10, dhw: { dailyKwh: 400, tankLitre: 15000 } });
    expect(many.building.dhw.dailyKwh).toBe(400);
    expect(many.building.dhw.tankLitre).toBe(15000);
    const tooMuch = residential({ dwellings: 10, dhw: { dailyKwh: 600, tankLitre: 30000 } });
    expect(tooMuch.building.dhw.dailyKwh).toBe(LIMITS.dhwDailyKwh[1] * 10);
    expect(tooMuch.building.dhw.tankLitre).toBe(LIMITS.tankLitre[1] * 10);
    // één woning (en kantoor): de gewone grenzen
    const one = residential({ dhw: { dailyKwh: 400, tankLitre: 15000 } });
    expect(one.building.dhw.dailyKwh).toBe(LIMITS.dhwDailyKwh[1]);
    expect(one.building.dhw.tankLitre).toBe(LIMITS.tankLitre[1]);
    const office = normalizeInput({ building: { use: 'office', dwellings: 10, dhw: { dailyKwh: 400 } } });
    expect(office.building.dhw.dailyKwh).toBe(LIMITS.dhwDailyKwh[1]);
  });
  it('ontbrekende tapwaterwaarden: de standaard per woning × aantal', () => {
    const i = residential({ dwellings: 4 });
    expect(i.building.dhw.dailyKwh).toBe(40);
    expect(i.building.dhw.tankLitre).toBe(800);
  });
});

describe('buildingKind en switchKind', () => {
  it('één woning, meerdere woningen of kantoor', () => {
    expect(buildingKind({ use: 'residential', dwellings: 1 })).toBe('single');
    expect(buildingKind({ use: 'residential', dwellings: 2 })).toBe('multi');
    expect(buildingKind({ use: 'office', dwellings: 1 })).toBe('office');
    expect(buildingKind({ use: 'office', dwellings: 5 })).toBe('office');
    expect(buildingKind(multi().building)).toBe('multi');
  });
  it('wisselen laadt de standaard van de keuze; het klimaatjaar blijft', () => {
    const start = { ...defaultInput('residential'), climateYear: 'T1' };
    const m = switchKind(start, 'multi');
    expect(m).toEqual({ ...multi(), climateYear: 'T1' });
    expect(buildingKind(m.building)).toBe('multi');
    const back = switchKind({ ...m, climateYear: 'knmi-1997' }, 'single');
    expect(back).toEqual({ ...defaultInput('residential'), climateYear: 'knmi-1997' });
    const o = switchKind(m, 'office');
    expect(o).toEqual({ ...defaultInput('office'), climateYear: 'T1' });
    expect(o.building.dwellings).toBe(1);
  });
  it('dezelfde keuze geeft hetzelfde object terug (eigen aantal woningen blijft)', () => {
    const custom = withDwellings(multi(), 25);
    expect(switchKind(custom, 'multi')).toBe(custom);
    const single = defaultInput('residential');
    expect(switchKind(single, 'single')).toBe(single);
    const office = defaultInput('office');
    expect(switchKind(office, 'office')).toBe(office);
  });
});

describe('withDwellings: het gebouw groeit met dezelfde woningen mee', () => {
  /** 10 woningen met 2 m³ buffer, 20 kWh batterij van 8 kW en een handmatige warmtepomp van 60 kW */
  function equipped(): PeakshavingInput {
    const i = multiDwellingInput();
    i.buffer.volumeM3 = 2;
    i.battery = { capacityKwh: 20, powerKw: 8 };
    i.heatPump = { ...i.heatPump, sizingMode: 'manual', nominalKw: 60 };
    return normalizeInput(i);
  }

  it('alles schaalt met n/oud, zodat de waarden per woning gelijk blijven; de aansluiting blijft', () => {
    const before = equipped();
    const after = withDwellings(before, 20);
    expect(after.building.dwellings).toBe(20);
    expect(after.building.designLoadKw).toBeCloseTo(100, 9);
    expect(after.building.dhw.dailyKwh).toBeCloseTo(120, 9);
    expect(after.building.dhw.tankLitre).toBeCloseTo(2400, 9);
    expect(after.buffer.volumeM3).toBeCloseTo(4, 9);
    expect(after.battery.capacityKwh).toBeCloseTo(40, 9);
    expect(after.battery.powerKw).toBeCloseTo(16, 9);
    expect(after.heatPump.sizingMode).toBe('manual');
    expect(after.heatPump.nominalKw).toBeCloseTo(120, 9);
    const per = (i: PeakshavingInput) => {
      const n = i.building.dwellings;
      return [
        i.building.designLoadKw / n,
        i.building.dhw.dailyKwh / n,
        i.building.dhw.tankLitre / n,
        i.buffer.volumeM3 / n,
        i.battery.capacityKwh / n,
        (i.battery.powerKw ?? 0) / n,
        i.heatPump.nominalKw / n,
      ];
    };
    per(after).forEach((v, k) => expect(v).toBeCloseTo(per(before)[k], 9));
    expect(after.grid).toEqual(before.grid);
    expect(after.climateYear).toBe(before.climateYear);
    expect(normalizeInput(after)).toEqual(after);
  });
  it('van één woning naar drie en terug', () => {
    const three = withDwellings(defaultInput('residential'), 3);
    expect(buildingKind(three.building)).toBe('multi');
    expect(three.building.designLoadKw).toBeCloseTo(24, 9);
    expect(three.building.dhw.dailyKwh).toBeCloseTo(30, 9);
    expect(three.building.dhw.tankLitre).toBeCloseTo(600, 9);
    expect(three.grid.connection).toBe('1x35');
    const one = withDwellings(three, 1);
    expect(buildingKind(one.building)).toBe('single');
    expect(one.building.designLoadKw).toBeCloseTo(8, 9);
    expect(one.building.dhw.dailyKwh).toBeCloseTo(10, 9);
    expect(one.building.dhw.tankLitre).toBeCloseTo(200, 9);
  });
  it('het aantal wordt afgerond en begrensd', () => {
    expect(withDwellings(multi(), 12.4).building.dwellings).toBe(12);
    expect(withDwellings(multi(), 0).building.dwellings).toBe(1);
    expect(withDwellings(multi(), 1e6).building.dwellings).toBe(500);
  });
  it('het piekvermogen stopt bij 2000 kW, het tapwater schaalt door', () => {
    const big = withDwellings(multi(), 500);
    expect(big.building.dwellings).toBe(500);
    expect(big.building.designLoadKw).toBe(LIMITS.designLoadKw[1]);
    expect(big.building.dhw.dailyKwh).toBeCloseTo(3000, 9);
    expect(big.building.dhw.tankLitre).toBeCloseTo(60000, 9);
    expect(normalizeInput(big)).toEqual(big);
  });
  it('kantoor, hetzelfde aantal en een ongeldig aantal: niets wijzigt (hetzelfde object)', () => {
    const office = defaultInput('office');
    expect(withDwellings(office, 10)).toBe(office);
    const m = multi();
    expect(withDwellings(m, 10)).toBe(m);
    expect(withDwellings(m, 10.3)).toBe(m);
    expect(withDwellings(m, Number.NaN)).toBe(m);
    expect(withDwellings(m, Number.POSITIVE_INFINITY)).toBe(m);
  });
});

describe('rekenmodel: rekent met de totalen, het aantal woningen telt niet mee', () => {
  /** de uitkomsten die niet van de invoer zelf afhangen (de invoer bevat het aantal woningen) */
  function outcome(a: Analysis) {
    return {
      nominalKw: a.nominalKw,
      sizing: a.sizing,
      pLimitKw: a.pLimitKw,
      main: a.main,
      counterpart: a.counterpart,
      noBattery: a.noBattery,
      withoutMeasures: a.withoutMeasures,
      smallest: a.smallest,
      requiredBattery: a.requiredBattery,
      coldWeek: a.coldWeek,
      capacityAtMinus10: a.capacityAtMinus10,
      monthly: a.monthly,
      robustness: a.robustness,
      messages: a.messages,
    };
  }
  const run = (i: PeakshavingInput) => analyze(i, refYear('T5'), { robustnessYears: [refYear('T5')] });

  // 5 woningen: de totalen (50 kWh/dag, 1000 l) passen ook binnen de grenzen van één woning; bij 10 woningen
  // (100 kWh/dag) niet, die vergelijken we met aantal 2
  it.each([
    [5, 1],
    [DEFAULT_DWELLINGS, 2],
  ])('%i woningen: dezelfde uitkomst als bij aantal %i met dezelfde totalen', (n, other) => {
    const many = normalizeInput(multiDwellingInput(n));
    const same = normalizeInput({ ...many, building: { ...many.building, dwellings: other } });
    expect(same.building.dwellings).toBe(other);
    expect({ ...same.building, dwellings: n }).toEqual(many.building);
    expect(outcome(run(same))).toEqual(outcome(run(many)));
  });
});

describe('deelbare link met meerdere woningen', () => {
  it('encode → decode geeft dezelfde invoer; de link bevat het aantal woningen', () => {
    for (const i of [multi(), withDwellings(multi(), 37), findScenario('woningen-buffer')!.build()]) {
      expect(decodeInput(encodeInput(i))).toEqual(i);
    }
    const json = JSON.parse(
      atob(encodeInput(multi()).replace(/-/g, '+').replace(/_/g, '/')),
    ) as PeakshavingInput & { v: number };
    expect(json.v).toBe(1);
    expect(json.building.dwellings).toBe(10);
  });
  it('een ongewijzigd scenario met meerdere woningen wordt herkend, een gewijzigd aantal niet', () => {
    for (const id of ['woningen-basis', 'woningen-buffer']) {
      const input = findScenario(id)!.build();
      expect(buildingKind(input.building)).toBe('multi');
      expect(scenarioIdOf(decodeInput(encodeInput(input))!)).toBe(id);
    }
    expect(scenarioIdOf(withDwellings(findScenario('woningen-basis')!.build(), 12))).toBeNull();
  });
  it('een oude link zonder aantal woningen geeft één woning', () => {
    const old = decodeInput(
      toLink({ v: 1, building: { use: 'residential', designLoadKw: 12, dhw: { dailyKwh: 30 } } }),
    );
    expect(old?.building.dwellings).toBe(1);
    expect(old?.building.designLoadKw).toBe(12);
    expect(old?.building.dhw.dailyKwh).toBe(30);
    expect(buildingKind(old!.building)).toBe('single');
    const office = decodeInput(toLink({ v: 1, building: { use: 'office', dwellings: 8 } }));
    expect(office?.building.dwellings).toBe(1);
  });
});
