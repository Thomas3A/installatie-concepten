// Ideale warmtevraag (pass 1) en koudste week (spec §9.4, §4.4, §5.6) tegen peakshaving_ref.py.
import { describe, expect, it } from 'vitest';
import { officeBuilding, residentialBuilding } from '../../src/concepts/peakshaving/data/defaults';
import { buildSchedule, envelopeAlpha, HOURS_PER_YEAR } from '../../src/concepts/peakshaving/model/building';
import {
  COLD_WEEK_HOURS,
  coldestWeekStart,
  type ReferenceYearName,
} from '../../src/concepts/peakshaving/model/climate';
import { computeIdealDemand } from '../../src/concepts/peakshaving/model/idealDemand';
import type { Building, ClimateYear } from '../../src/concepts/peakshaving/model/types';
import { buildingFromPython, expectClosePower, FIXTURE, refYear } from './helpers';

function maxOf(a: ArrayLike<number>): number {
  let m = -Infinity;
  for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i];
  return m;
}
function sumOf(a: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s;
}
function expectFiniteNonNegative(q: Float64Array, label: string): void {
  expect(q.length).toBe(HOURS_PER_YEAR);
  for (let t = 0; t < q.length; t++) {
    if (!Number.isFinite(q[t]) || q[t] < 0) throw new Error(`${label}: Q_ideal[${t}] = ${q[t]}`);
  }
}

describe('ideale vraag T5 (spec §9.4)', () => {
  const climate = refYear('T5');

  it('woning 8 kW: max Q_ideal = 7,524 kW, Σ Q_ideal = 13 580 kWh, koude week start 314', () => {
    const q = computeIdealDemand(residentialBuilding(8), climate);
    expectFiniteNonNegative(q, 'woning');
    expectClosePower(maxOf(q), 7.524, 'woning · max Q_ideal');
    expectClosePower(sumOf(q), 13580, 'woning · Σ Q_ideal');
    expect(coldestWeekStart(q, climate.T)).toBe(314);
  });

  it('kantoor 100 kW: max Q_ideal = 133,921 kW, Σ Q_ideal = 210 504 kWh, koude week start 314', () => {
    const q = computeIdealDemand(officeBuilding(100), climate);
    expectFiniteNonNegative(q, 'kantoor');
    expectClosePower(maxOf(q), 133.921, 'kantoor · max Q_ideal');
    expectClosePower(sumOf(q), 210504, 'kantoor · Σ Q_ideal');
    expect(coldestWeekStart(q, climate.T)).toBe(314);
  });

  it('defaults zonder argument zijn woning 8 kW en kantoor 100 kW', () => {
    expect(sumOf(computeIdealDemand(residentialBuilding(), climate))).toBe(
      sumOf(computeIdealDemand(residentialBuilding(8), climate)),
    );
    expect(sumOf(computeIdealDemand(officeBuilding(), climate))).toBe(
      sumOf(computeIdealDemand(officeBuilding(100), climate)),
    );
  });

  it('een meegegeven schema geeft exact dezelfde reeks als het intern opgebouwde schema', () => {
    for (const b of [residentialBuilding(), officeBuilding()]) {
      const a = computeIdealDemand(b, climate);
      const s = computeIdealDemand(b, climate, buildSchedule(b, climate.startWeekday));
      expect(Array.from(s)).toEqual(Array.from(a));
    }
  });

  it('woning: piek begrensd op ontwerplast + opwarmtoeslag (boostFraction · designLoadKw)', () => {
    const b = residentialBuilding();
    const q = computeIdealDemand(b, climate);
    expect(maxOf(q)).toBeLessThanOrEqual(b.designLoadKw * (1 + b.boostFraction) + 1e-9);
  });
});

describe('koudste week energiejaar (spec §4.4)', () => {
  it('woning 8 kW in het energiejaar: koude week start op uurindex 289', () => {
    const climate = refYear('energie');
    const q = computeIdealDemand(residentialBuilding(), climate);
    expect(coldestWeekStart(q, climate.T)).toBe(289);
  });
});

describe('alle referentiecases: max en som van Q_ideal en koudste week (fixture)', () => {
  for (const c of FIXTURE.cases) {
    it(c.naam, () => {
      const b = buildingFromPython(c.gebouw);
      const climate = refYear(c.jaar as ReferenceYearName);
      const q = computeIdealDemand(b, climate);
      expectFiniteNonNegative(q, c.naam);
      expectClosePower(maxOf(q), c.kpi.Q_ideaal_max, `${c.naam} · Q_ideaal_max`);
      expectClosePower(sumOf(q), c.kpi.E_th_vraag, `${c.naam} · E_th_vraag`);
      expect(coldestWeekStart(q, climate.T), `${c.naam} · koudste_week_start`).toBe(c.kpi.koudste_week_start);
    });
  }
});

describe('gevelfilter uit (envelopeLagH = 0)', () => {
  it('alpha = 1 bij envelopeLagH = 0 en 1 − exp(−1/τ) anders', () => {
    expect(envelopeAlpha({ ...residentialBuilding(), envelopeLagH: 0 })).toBe(1);
    expect(envelopeAlpha(residentialBuilding())).toBeCloseTo(1 - Math.exp(-1 / 2), 12);
  });

  it('Q_ideal blijft eindig en ≥ 0 (woning en kantoor, T5/T1/energie)', () => {
    for (const name of ['T5', 'T1', 'energie'] as const) {
      const climate = refYear(name);
      for (const b of [residentialBuilding(), officeBuilding()]) {
        const q = computeIdealDemand({ ...b, envelopeLagH: 0 }, climate);
        expectFiniteNonNegative(q, `${b.use} ${name} τ_gevel 0`);
      }
    }
  });

  it('zonder filter volgt de vraag de buitentemperatuur direct (gelijk aan peakshaving_ref.py)', () => {
    // Waarden berekend met ideale_vraag/koudste_week uit tools/peakshaving_ref/peakshaving_ref.py, tau_gevel_h = 0.
    const climate = refYear('T5');
    const cases: [Building, number, number, number][] = [
      [{ ...residentialBuilding(), envelopeLagH: 0 }, 7.733, 13591.212, 312],
      [{ ...officeBuilding(), envelopeLagH: 0 }, 136.452, 211484.997, 312],
    ];
    for (const [b, qMax, qSum, start] of cases) {
      const q = computeIdealDemand(b, climate);
      expectClosePower(maxOf(q), qMax, `${b.use} τ_gevel 0 · max`);
      expectClosePower(sumOf(q), qSum, `${b.use} τ_gevel 0 · som`);
      expect(coldestWeekStart(q, climate.T)).toBe(start);
    }
  });
});

describe('coldestWeekStart (port van koudste_week)', () => {
  function flatYear(Tvalue: number): ClimateYear {
    return { id: 'test', name: 'test', T: new Float64Array(HOURS_PER_YEAR).fill(Tvalue), startWeekday: 1 };
  }

  it('kiest het venster met de hoogste vraagsom', () => {
    const q = new Float64Array(HOURS_PER_YEAR).fill(1);
    for (let t = 5000; t < 5000 + COLD_WEEK_HOURS; t++) q[t] = 3;
    expect(coldestWeekStart(q, flatYear(5).T)).toBe(5000);
  });

  it('bij gelijke som wint de laagste gemiddelde buitentemperatuur', () => {
    const q = new Float64Array(HOURS_PER_YEAR).fill(1);
    const T = flatYear(10).T;
    for (let t = 1000; t < 1000 + COLD_WEEK_HOURS; t++) T[t] = -5;
    expect(coldestWeekStart(q, T)).toBe(1000);
  });

  it('bij volledig gelijke vensters blijft het eerste venster (uur 0) staan', () => {
    const q = new Float64Array(HOURS_PER_YEAR).fill(2);
    expect(coldestWeekStart(q, flatYear(0).T)).toBe(0);
  });

  it('cyclisch, net als in de Python (range(8760)): startuur 8592 en later zijn kandidaat (spec §4.4)', () => {
    const q = new Float64Array(HOURS_PER_YEAR);
    for (let t = HOURS_PER_YEAR - COLD_WEEK_HOURS; t < HOURS_PER_YEAR; t++) q[t] = 1;
    // het venster vanaf 8592 bevat alle vraag
    expect(coldestWeekStart(q, flatYear(0).T)).toBe(HOURS_PER_YEAR - COLD_WEEK_HOURS);
    // vraag van 30 december tot en met 5 januari (168 uur): het venster loopt over de jaargrens
    q.fill(0);
    for (let t = HOURS_PER_YEAR - 48; t < HOURS_PER_YEAR; t++) q[t] = 1;
    for (let t = 0; t < 120; t++) q[t] = 1;
    expect(coldestWeekStart(q, flatYear(0).T)).toBe(HOURS_PER_YEAR - 48);
  });

  it('winter1979 met de woning- en kantoordefaults: de koude week begint op 31 december 00:00 (uur 8736)', () => {
    const climate = refYear('winter1979');
    for (const b of [residentialBuilding(), officeBuilding()]) {
      const q = computeIdealDemand(b, climate, buildSchedule(b, climate.startWeekday));
      expect(coldestWeekStart(q, climate.T), b.use).toBe(8736);
    }
  });
});
