// Klimaatdata (spec §4 en §9.2): referentiejaren, werkelijke jaren, statistiek, koudste week en kalender.
import { describe, expect, it } from 'vitest';
import {
  climateShortName,
  climateStats,
  coldestWeekStart,
  coldWeekWindow,
  COLD_WEEK_HOURS,
  COLD_WEEK_MARGIN_H,
  decodeRealYear,
  decodeReferenceYear,
  DEFAULT_CLIMATE_YEAR,
  formatHour,
  hourInfo,
  isReferenceYear,
  isValidClimateYearId,
  MONTH_SHORT,
  MONTH_START_HOUR,
  REAL_YEAR_FIRST,
  REAL_YEAR_LAST,
  realYearId,
  realYearOf,
  RECOMMENDED_STRESS_YEARS,
  REFERENCE_YEAR_LABELS,
  REFERENCE_YEARS,
  STRESS_TEST_YEARS,
  wrapHour,
  WEEKDAY_SHORT,
  type ClimateStats,
  type ReferenceYearName,
  type ReferenceYearsJson,
} from '../../src/concepts/peakshaving/model/climate';
import { realYear, REAL_JSON, REF_JSON, refYear } from './helpers';

const HOURS = 8760;
const NAMES: ReferenceYearName[] = ['energie', 'T5', 'T1', 'winter1979', 'winter1963'];
/** De drie reconstructies van NEN 5060:2018; de stresstestjaren hebben geen NEN-maandtabel. */
const NEN_NAMES: ReferenceYearName[] = ['energie', 'T5', 'T1'];
const STRESS_NAMES: ReferenceYearName[] = ['winter1979', 'winter1963'];

/** |actual − expected| ≤ tol, met een leesbare melding. */
function expectWithin(actual: number, expected: number, tol: number, label: string): void {
  expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected} (±${tol})`).toBeLessThanOrEqual(
    tol,
  );
}

/** Maandgemiddelden van een jaarreeks met de maandgrenzen van het model. */
function monthlyMeans(T: ArrayLike<number>): number[] {
  const out: number[] = [];
  for (let m = 0; m < 12; m++) {
    let s = 0;
    for (let i = MONTH_START_HOUR[m]; i < MONTH_START_HOUR[m + 1]; i++) s += T[i];
    out.push(s / (MONTH_START_HOUR[m + 1] - MONTH_START_HOUR[m]));
  }
  return out;
}

/**
 * Som van `hours` ruwe waarden (0,1 °C, gehele getallen) vanaf `start`: exact, zonder afrondingsruis.
 * Cyclisch: na het laatste uur volgt weer uur 0.
 */
function rawSum(raw: readonly number[], start: number, hours: number): number {
  let s = 0;
  for (let i = start; i < start + hours; i++) s += raw[i % raw.length];
  return s;
}

/** Laagste exacte 168-uurssom over alle startposities, cyclisch (zoals de build-scripts: T plus T[:167]). */
function rawMinWeekSum(raw: readonly number[]): number {
  const W = COLD_WEEK_HOURS;
  let best = Infinity;
  for (let i = 0; i < raw.length; i++) best = Math.min(best, rawSum(raw, i, W));
  return best;
}

/**
 * Startuur koudste week: gelijk aan de meta-waarde, of een exacte gelijkstand.
 * De build-scripts gebruiken np.argmin op np.convolve; bij exact gelijke weeksommen bepaalt
 * afrondingsruis welk uur wint, het model neemt het eerste. Beide moeten dan echte minima zijn.
 */
function expectColdWeekStart(raw: readonly number[], actual: number, expected: number, label: string): void {
  if (actual === expected) return;
  expectWithin(actual, expected, 2, `${label} startuur koudste week`);
  const W = COLD_WEEK_HOURS;
  const min = rawMinWeekSum(raw);
  expect(rawSum(raw, actual, W), `${label}: model-start ${actual} is geen minimum`).toBe(min);
  expect(rawSum(raw, expected, W), `${label}: meta-start ${expected} is geen minimum`).toBe(min);
}

/**
 * Statistiek tegen de meta-waarden van de build-scripts: T min exact (0,1 °C), uren ±3 h (afgeronde
 * 0,1 °C-waarden in de JSON), gemiddelden ±0,05 K, graaddagen ±1 (afgerond), startuur koudste week
 * gelijk of exacte gelijkstand.
 */
function expectStatsMatch(s: ClimateStats, m: ClimateStats, raw: readonly number[], label: string): void {
  expect(s.Tmin, `${label} Tmin`).toBeCloseTo(m.Tmin, 6);
  expectWithin(s.Tgem, m.Tgem, 0.01, `${label} Tgem`);
  for (const k of ['uren_onder_0', 'uren_onder_min5', 'uren_onder_min10'] as const) {
    expectWithin(s[k], m[k], 3, `${label} ${k}`);
  }
  for (const k of ['koudste_24u', 'koudste_72u', 'koudste_168u'] as const) {
    expectWithin(s[k], m[k], 0.05, `${label} ${k}`);
  }
  expectWithin(s.graaddagen_18, m.graaddagen_18, 1, `${label} graaddagen_18`);
  expectWithin(s.graaddagen_15_5, m.graaddagen_15_5, 1, `${label} graaddagen_15_5`);
  expectColdWeekStart(raw, s.koudste_week_start_uur, m.koudste_week_start_uur, label);
}

function expectNoNaN(T: ArrayLike<number>, label: string): void {
  let bad = 0;
  for (let i = 0; i < T.length; i++) if (!Number.isFinite(T[i])) bad++;
  expect(bad, `${label}: niet-eindige waarden`).toBe(0);
}

/** ISO-weekdag (1 = maandag) van 1 januari van `year` volgens de echte kalender. */
function isoWeekdayJan1(year: number): number {
  const d = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  return d === 0 ? 7 : d;
}

describe('referentiejaren: decoderen (spec §9.2)', () => {
  it('vijf referentiejaren in data en meta, elk met een omschrijving', () => {
    expect(Object.keys(REF_JSON.data)).toEqual(NAMES);
    expect(Object.keys(REF_JSON.meta.jaren)).toEqual(NAMES);
    for (const name of NAMES) expect(REF_JSON.meta.jaren[name].omschrijving.length, name).toBeGreaterThan(20);
    expect(REF_JSON.meta.jaren.winter1979.omschrijving).toContain('1978/79');
    expect(REF_JSON.meta.jaren.winter1963.omschrijving).toContain('1962/63');
  });

  for (const name of NAMES) {
    it(`${name}: 8760 waarden, geen NaN, start op maandag`, () => {
      expect(REF_JSON.data[name].T).toHaveLength(HOURS);
      const y = refYear(name);
      expect(y.T).toBeInstanceOf(Float64Array);
      expect(y.T).toHaveLength(HOURS);
      expectNoNaN(y.T, name);
      expect(REF_JSON.meta.startWeekdag).toBe(1);
      expect(y.startWeekday).toBe(1);
      expect(y.id).toBe(name);
      expect(y.name).toBe(REFERENCE_YEAR_LABELS[name]);
    });

    it(`${name}: waarden in 0,1 °C worden °C`, () => {
      const raw = REF_JSON.data[name].T;
      const y = refYear(name);
      for (const i of [0, 1, 314, 4000, 8759]) expect(y.T[i]).toBeCloseTo(raw[i] / 10, 12);
      // plausibel bereik voor De Bilt
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < HOURS; i++) {
        min = Math.min(min, y.T[i]);
        max = Math.max(max, y.T[i]);
      }
      expect(min).toBeGreaterThan(-25);
      expect(max).toBeLessThan(40);
    });
  }

  it('volgorde van de keuzelijst en default (spec §4.3)', () => {
    expect(REFERENCE_YEARS).toEqual(['T1', 'T5', 'energie', 'winter1979', 'winter1963']);
    expect(DEFAULT_CLIMATE_YEAR).toBe('T5');
    expect(REFERENCE_YEAR_LABELS).toEqual({
      T1: 'Ontwerpjaar T1 — strenge winter (≈ NEN 5060:2018 ref T1)',
      T5: 'Ontwerpjaar T5 — gemiddelde winter (≈ NEN 5060:2018 ref T5)',
      energie: 'Energiejaar — langjarig gemiddeld (≈ NEN 5060:2018 energie)',
      winter1979: 'Stresstest strenge winter 1978/79 (≈ 1× per 25 jaar)',
      winter1963: 'Stresstest extreme winter 1962/63 (≈ 1× per eeuw)',
    });
    expect(STRESS_TEST_YEARS).toEqual(['winter1979', 'winter1963']);
  });

  it('weigert een reeks die geen 8760 waarden heeft', () => {
    const broken = {
      meta: REF_JSON.meta,
      data: { ...REF_JSON.data, T5: { ...REF_JSON.data.T5, T: REF_JSON.data.T5.T.slice(0, 8759) } },
    } as ReferenceYearsJson;
    expect(() => decodeReferenceYear(broken, 'T5')).toThrow(/8760/);
  });
});

describe('referentiejaren: maandgemiddelden (spec §4.1, §9.2)', () => {
  for (const name of NEN_NAMES) {
    it(`${name}: maandgemiddelde T wijkt < 0,06 K af van NEN 5060:2018`, () => {
      const mm = monthlyMeans(refYear(name).T);
      const nen = REF_JSON.meta.jaren[name].maandgemiddelde_T_NEN5060_2018;
      if (nen === null) throw new Error(`${name}: geen NEN-tabel`);
      expect(nen).toHaveLength(12);
      for (let m = 0; m < 12; m++) {
        expect(Math.abs(mm[m] - nen[m]), `${name} ${MONTH_SHORT[m]}: ${mm[m]} vs ${nen[m]}`).toBeLessThan(
          0.06,
        );
      }
    });
  }

  for (const name of NAMES) {
    it(`${name}: maandgemiddelden komen overeen met meta.maandgemiddelde_T (±0,01 K)`, () => {
      const mm = monthlyMeans(refYear(name).T);
      const own = REF_JSON.meta.jaren[name].maandgemiddelde_T;
      for (let m = 0; m < 12; m++) expectWithin(mm[m], own[m], 0.01, `${name} ${MONTH_SHORT[m]}`);
    });
  }

  for (const name of STRESS_NAMES) {
    it(`${name}: geen NEN-tabel; april t/m oktober uit dezelfde bronmaanden als T1`, () => {
      const meta = REF_JSON.meta.jaren[name];
      expect(meta.maandgemiddelde_T_NEN5060_2018).toBeNull();
      expect(meta.bronjaar_per_maand.slice(3, 10)).toEqual(
        REF_JSON.meta.jaren.T1.bronjaar_per_maand.slice(3, 10),
      );
      // midden in die maanden (buiten de overgangen van 16 uur) is het weer uur voor uur dat van T1
      const own = REF_JSON.data[name].T;
      const t1 = REF_JSON.data.T1.T;
      for (let t = MONTH_START_HOUR[3] + 24; t < MONTH_START_HOUR[10] - 24; t++) {
        if (own[t] !== t1[t]) throw new Error(`${name} uur ${t}: ${own[t]} ≠ ${t1[t]}`);
      }
    });
  }

  it('stookseizoen van de stresstestjaren: november–maart uit de strenge winter', () => {
    expect(REF_JSON.meta.jaren.winter1979.bronjaar_per_maand).toEqual([
      1979, 1979, 1979, 2007, 1998, 2006, 2006, 2003, 2011, 2011, 1978, 1978,
    ]);
    expect(REF_JSON.meta.jaren.winter1963.bronjaar_per_maand).toEqual([
      1963, 1963, 1963, 2007, 1998, 2006, 2006, 2003, 2011, 2011, 1962, 1962,
    ]);
  });
});

describe('referentiejaren: statistiek (spec §4.2, §9.2)', () => {
  // tabel spec §4.2 (afgerond): T gem., T min, uren < 0 / < −5 / < −10, koudste 24/72/168 h, graaddagen 18 °C
  type Row = [number, number, number, number, number, number, number, number, number];
  const TABLE: Record<ReferenceYearName, Row> = {
    energie: [10.72, -8.8, 458, 42, 0, -5.0, -4.0, -2.5, 2778],
    T5: [10.49, -14.0, 1202, 199, 21, -9.2, -6.6, -4.2, 2916],
    T1: [10.36, -15.8, 1395, 361, 57, -12.7, -10.2, -7.6, 3043],
    // koudste 24 h: de spectabel geeft −12,5, dubbel afgerond van meta −12,45 (exact −12,446)
    winter1979: [10.22, -16.7, 1357, 366, 98, -12.45, -11.4, -10.2, 3096],
    winter1963: [9.43, -17.6, 1778, 727, 145, -12.0, -10.3, -8.7, 3382],
  };

  for (const name of NAMES) {
    it(`${name}: klopt met de tabel van §4.2`, () => {
      const s = climateStats(refYear(name).T);
      const [tgem, tmin, h0, h5, h10, c24, c72, c168, gd18] = TABLE[name];
      expectWithin(s.Tgem, tgem, 0.01, `${name} Tgem`);
      expect(s.Tmin, `${name} Tmin`).toBeCloseTo(tmin, 6);
      // uren: ±3 h, de JSON bevat op 0,1 °C afgeronde waarden
      expectWithin(s.uren_onder_0, h0, 3, `${name} uren < 0 °C`);
      expectWithin(s.uren_onder_min5, h5, 3, `${name} uren < −5 °C`);
      expectWithin(s.uren_onder_min10, h10, 3, `${name} uren < −10 °C`);
      // tabel op 0,1 K afgerond: ±0,05 K
      expectWithin(s.koudste_24u, c24, 0.05, `${name} koudste 24 h`);
      expectWithin(s.koudste_72u, c72, 0.05, `${name} koudste 72 h`);
      expectWithin(s.koudste_168u, c168, 0.05, `${name} koudste week`);
      expectWithin(s.graaddagen_18, gd18, 1, `${name} graaddagen 18 °C`);
    });

    it(`${name}: klopt met meta.jaren.${name}.statistiek`, () => {
      const s = climateStats(refYear(name).T);
      expectStatsMatch(s, REF_JSON.meta.jaren[name].statistiek, REF_JSON.data[name].T, name);
    });
  }

  it('T5 en T1: startuur koudste week exact gelijk aan de meta (312 en 2)', () => {
    expect(climateStats(refYear('T5').T).koudste_week_start_uur).toBe(312);
    expect(climateStats(refYear('T1').T).koudste_week_start_uur).toBe(2);
  });

  it('energie: uur 288 en 289 zijn een exacte gelijkstand van de koudste week', () => {
    const raw = REF_JSON.data.energie.T;
    expect(rawSum(raw, 288, 168)).toBe(rawSum(raw, 289, 168));
    expect(rawSum(raw, 289, 168)).toBe(rawMinWeekSum(raw));
    // het model neemt bij gelijkstand het eerste uur
    expect(climateStats(refYear('energie').T).koudste_week_start_uur).toBe(288);
  });

  it('winter1979: koudste week −10,2 °C vanaf uur 8736, over de jaargrens (31 december – 6 januari)', () => {
    const s = climateStats(refYear('winter1979').T);
    expect(s.koudste_week_start_uur).toBe(8736);
    expect(REF_JSON.meta.jaren.winter1979.statistiek.koudste_week_start_uur).toBe(8736);
    expectWithin(s.koudste_168u, -10.2, 0.05, 'winter1979 koudste week');
  });

  it('winter1963: koudste week −8,7 °C vanaf uur 366', () => {
    const s = climateStats(refYear('winter1963').T);
    expect(s.koudste_week_start_uur).toBe(366);
    expectWithin(s.koudste_168u, -8.7, 0.05, 'winter1963 koudste week');
  });

  it('T5 is strenger dan het energiejaar en T1 strenger dan T5', () => {
    const [e, t5, t1] = NEN_NAMES.map((n) => climateStats(refYear(n).T));
    expect(t5.Tmin).toBeLessThan(e.Tmin);
    expect(t1.Tmin).toBeLessThan(t5.Tmin);
    expect(t5.koudste_168u).toBeLessThan(e.koudste_168u);
    expect(t1.koudste_168u).toBeLessThan(t5.koudste_168u);
    expect(t1.graaddagen_18).toBeGreaterThan(t5.graaddagen_18);
    expect(t5.graaddagen_18).toBeGreaterThan(e.graaddagen_18);
  });

  it('de stresstestjaren hebben een strengere winter dan T1 (spec §4.1)', () => {
    const t1 = climateStats(refYear('T1').T);
    const w79 = climateStats(refYear('winter1979').T);
    const w63 = climateStats(refYear('winter1963').T);
    expect(w79.koudste_168u).toBeLessThan(t1.koudste_168u);
    expect(w63.koudste_168u).toBeLessThan(t1.koudste_168u);
    expect(w79.uren_onder_min10).toBeGreaterThan(t1.uren_onder_min10);
    expect(w63.uren_onder_min5).toBeGreaterThan(w79.uren_onder_min5);
    expect(w63.graaddagen_18).toBeGreaterThan(w79.graaddagen_18);
    expect(w79.graaddagen_18).toBeGreaterThan(t1.graaddagen_18);
  });
});

describe('climateStats op synthetische data', () => {
  it('constante temperatuur', () => {
    const s = climateStats(new Float64Array(HOURS).fill(-2));
    expect(s.Tgem).toBeCloseTo(-2, 12);
    expect(s.Tmin).toBe(-2);
    expect(s.uren_onder_0).toBe(HOURS);
    expect(s.uren_onder_min5).toBe(0);
    expect(s.koudste_24u).toBeCloseTo(-2, 9);
    expect(s.koudste_168u).toBeCloseTo(-2, 9);
    expect(s.koudste_week_start_uur).toBe(0);
    expect(s.graaddagen_18).toBeCloseTo(365 * 20, 6);
    expect(s.graaddagen_15_5).toBeCloseTo(365 * 17.5, 6);
  });

  it('grenzen zijn strikt (−5 telt niet als < −5)', () => {
    const T = new Float64Array(HOURS).fill(10);
    T[100] = 0;
    T[101] = -5;
    T[102] = -10;
    T[103] = -10.1;
    const s = climateStats(T);
    expect(s.uren_onder_0).toBe(3);
    expect(s.uren_onder_min5).toBe(2);
    expect(s.uren_onder_min10).toBe(1);
    expect(s.Tmin).toBe(-10.1);
  });

  it('koudste week vindt een koud blok', () => {
    const T = new Float64Array(HOURS).fill(8);
    for (let i = 5000; i < 5168; i++) T[i] = -6;
    const s = climateStats(T);
    expect(s.koudste_week_start_uur).toBe(5000);
    expect(s.koudste_168u).toBeCloseTo(-6, 9);
    expect(s.koudste_24u).toBeCloseTo(-6, 9);
  });

  it('koudste periodes zijn cyclisch: een blok over de jaargrens telt als één week', () => {
    // laatste 48 uur van december en eerste 120 uur van januari
    const T = new Float64Array(HOURS).fill(8);
    for (let i = HOURS - 48; i < HOURS; i++) T[i] = -6;
    for (let i = 0; i < 120; i++) T[i] = -6;
    const s = climateStats(T);
    expect(s.koudste_week_start_uur).toBe(HOURS - 48);
    expect(s.koudste_168u).toBeCloseTo(-6, 9);
    expect(s.koudste_72u).toBeCloseTo(-6, 9);
  });
});

describe('werkelijke jaren 1951–2025 (spec §4.2, §9.2)', () => {
  const years = Object.keys(REAL_JSON.T).map(Number);

  it('75 jaren, 1951 t/m 2025, elk 8760 waarden', () => {
    expect(years).toHaveLength(75);
    expect(Math.min(...years)).toBe(REAL_YEAR_FIRST);
    expect(Math.max(...years)).toBe(REAL_YEAR_LAST);
    expect(REAL_YEAR_FIRST).toBe(1951);
    expect(REAL_YEAR_LAST).toBe(2025);
    for (let y = 1951; y <= 2025; y++) expect(REAL_JSON.T[String(y)], `jaar ${y}`).toHaveLength(HOURS);
    expect(Object.keys(REAL_JSON.meta.startWeekdag)).toHaveLength(75);
    expect(Object.keys(REAL_JSON.meta.statistiek)).toHaveLength(75);
  });

  it('startWeekdag[2012] = 7, [1997] = 3, [1963] = 2 en [1979] = 1', () => {
    expect(REAL_JSON.meta.startWeekdag['2012']).toBe(7);
    expect(REAL_JSON.meta.startWeekdag['1997']).toBe(3);
    expect(REAL_JSON.meta.startWeekdag['1963']).toBe(2);
    expect(REAL_JSON.meta.startWeekdag['1979']).toBe(1);
  });

  it('startWeekdag is de echte ISO-weekdag van 1 januari', () => {
    for (let y = 1951; y <= 2025; y++) {
      expect(REAL_JSON.meta.startWeekdag[String(y)], `jaar ${y}`).toBe(isoWeekdayJan1(y));
    }
  });

  it('decodeRealYear levert een volledig klimaatjaar', () => {
    const y = realYear(2012);
    expect(y.id).toBe('knmi-2012');
    expect(y.name).toContain('2012');
    expect(y.startWeekday).toBe(7);
    expect(y.T).toBeInstanceOf(Float64Array);
    expect(y.T).toHaveLength(HOURS);
    expectNoNaN(y.T, '2012');
    expect(y.T[0]).toBeCloseTo(REAL_JSON.T['2012'][0] / 10, 12);
    expect(realYear(1997).startWeekday).toBe(3);
  });

  it('alle jaren decoderen zonder NaN', () => {
    for (const y of years) expectNoNaN(realYear(y).T, String(y));
  });

  it('decodeRealYear weigert een ontbrekend jaar', () => {
    expect(() => decodeRealYear(REAL_JSON, 1950)).toThrow(/1950/);
    expect(() => decodeRealYear(REAL_JSON, 2026)).toThrow(/2026/);
  });

  it('T min klopt met meta.statistiek (o.a. 2012: −18,8 °C, 1963: −17,6 °C)', () => {
    const EXPECTED: [number, number][] = [
      [1963, -17.6],
      [2012, -18.8],
      [1997, -15.8],
      [1996, -14.0],
      [2010, -11.0],
      [2021, -10.4],
    ];
    for (const [y, tmin] of EXPECTED) {
      const s = climateStats(realYear(y).T);
      expect(s.Tmin, `jaar ${y}`).toBeCloseTo(tmin, 6);
      expect(s.Tmin, `jaar ${y}`).toBeCloseTo(REAL_JSON.meta.statistiek[String(y)].Tmin, 6);
    }
  });

  it('volledige statistiek van elk jaar klopt met meta.statistiek', () => {
    for (const y of years) {
      const key = String(y);
      const s = climateStats(realYear(y).T);
      expectStatsMatch(s, REAL_JSON.meta.statistiek[key], REAL_JSON.T[key], key);
    }
  });

  it('1992, 2001 en 2016: afwijkend startuur koudste week is een exacte gelijkstand', () => {
    // np.argmin op np.convolve koos het latere uur; het model neemt het eerste
    for (const [y, model, meta] of [
      [1992, 461, 463],
      [2001, 288, 289],
      [2016, 356, 357],
    ]) {
      const raw = REAL_JSON.T[String(y)];
      expect(climateStats(realYear(y).T).koudste_week_start_uur, `${y}`).toBe(model);
      expect(REAL_JSON.meta.statistiek[String(y)].koudste_week_start_uur, `${y}`).toBe(meta);
      expect(rawSum(raw, model, COLD_WEEK_HOURS), `${y}`).toBe(rawSum(raw, meta, COLD_WEEK_HOURS));
    }
  });

  it('aanbevolen stressjaren: gelijk aan meta.aanbevolen_stresstest en in de reeks (spec §4.3)', () => {
    expect([...RECOMMENDED_STRESS_YEARS]).toEqual([
      1956, 1963, 1979, 1985, 1986, 1987, 1996, 1997, 2010, 2012,
    ]);
    expect([...RECOMMENDED_STRESS_YEARS]).toEqual(REAL_JSON.meta.aanbevolen_stresstest);
    expect(REAL_JSON.meta.aanbevolen_stresstest).toContain(1963);
    expect(REAL_JSON.meta.aanbevolen_stresstest).toContain(1979);
    for (const y of RECOMMENDED_STRESS_YEARS) expect(REAL_JSON.T[String(y)], `jaar ${y}`).toBeDefined();
  });
});

describe('coldestWeekStart (spec §4.4)', () => {
  it('vindt één duidelijk piekblok', () => {
    const q = new Float64Array(HOURS).fill(0.5);
    for (let i = 4000; i < 4168; i++) q[i] = 3;
    const T = new Float64Array(HOURS).fill(5);
    expect(coldestWeekStart(q, T)).toBe(4000);
  });

  it('vindt een smalle piek op het eerste venster dat hem bevat bij gelijke T', () => {
    const q = new Float64Array(HOURS);
    q[6000] = 10;
    const T = new Float64Array(HOURS).fill(5);
    // alle vensters 5833..6000 hebben dezelfde som en dezelfde T: het eerste wint
    expect(coldestWeekStart(q, T)).toBe(6000 - 167);
  });

  it('bij gelijke warmtevraag wint de laagste gemiddelde buitentemperatuur', () => {
    const q = new Float64Array(HOURS);
    for (let i = 1000; i < 1168; i++) q[i] = 2;
    for (let i = 3000; i < 3168; i++) q[i] = 2;
    const T = new Float64Array(HOURS).fill(5);
    // gelijke som en gelijke T: het eerste blok
    expect(coldestWeekStart(q, T)).toBe(1000);
    // tweede blok kouder: het tweede blok
    for (let i = 3000; i < 3168; i++) T[i] = -5;
    expect(coldestWeekStart(q, T)).toBe(3000);
    // eerste blok kouder: weer het eerste
    T.fill(5);
    for (let i = 1000; i < 1168; i++) T[i] = -5;
    expect(coldestWeekStart(q, T)).toBe(1000);
  });

  it('een hogere vraagsom wint van een koudere week', () => {
    const q = new Float64Array(HOURS);
    for (let i = 1000; i < 1168; i++) q[i] = 2;
    for (let i = 3000; i < 3168; i++) q[i] = 2.01;
    const T = new Float64Array(HOURS).fill(5);
    for (let i = 1000; i < 1168; i++) T[i] = -15;
    expect(coldestWeekStart(q, T)).toBe(3000);
  });

  it('cyclisch (spec §4.4): de laatste week van het jaar en een week over de jaargrens zijn kandidaat', () => {
    const q = new Float64Array(HOURS);
    for (let i = HOURS - 168; i < HOURS; i++) q[i] = 1;
    const T = new Float64Array(HOURS).fill(5);
    expect(coldestWeekStart(q, T)).toBe(HOURS - 168);
    // vraag van 31 december 00:00 tot en met 6 januari: start 8736, vensterindex (start + k) mod 8760
    q.fill(0);
    for (let i = 8736; i < HOURS; i++) q[i] = 1;
    for (let i = 0; i < 144; i++) q[i] = 1;
    expect(coldestWeekStart(q, T)).toBe(8736);
  });

  it('cyclisch: bij gelijke vraag wint de koudere week, ook als die over de jaargrens loopt', () => {
    const q = new Float64Array(HOURS);
    for (let i = 1000; i < 1168; i++) q[i] = 2;
    for (let i = HOURS - 100; i < HOURS; i++) q[i] = 2;
    for (let i = 0; i < 68; i++) q[i] = 2;
    const T = new Float64Array(HOURS).fill(5);
    expect(coldestWeekStart(q, T)).toBe(1000);
    for (let i = HOURS - 100; i < HOURS; i++) T[i] = -5;
    expect(coldestWeekStart(q, T)).toBe(HOURS - 100);
  });

  it('geen vraag: uur 0', () => {
    expect(coldestWeekStart(new Float64Array(HOURS), new Float64Array(HOURS))).toBe(0);
  });
});

describe('coldWeekWindow (spec §4.4)', () => {
  it('koude week ± 24 uur', () => {
    expect(COLD_WEEK_HOURS).toBe(168);
    expect(COLD_WEEK_MARGIN_H).toBe(24);
    expect(coldWeekWindow(314)).toEqual({ from: 290, to: 506 });
    expect(coldWeekWindow(314).to - coldWeekWindow(314).from).toBe(216);
  });

  it('cyclisch: altijd 216 uur, in doorlopende uren over de jaargrens', () => {
    // marge in december: negatieve uren
    expect(coldWeekWindow(0)).toEqual({ from: -24, to: 192 });
    expect(coldWeekWindow(4)).toEqual({ from: -20, to: 196 });
    expect(coldWeekWindow(8500)).toEqual({ from: 8476, to: 8692 });
    // venster loopt door in januari: uren ≥ 8760
    expect(coldWeekWindow(8591)).toEqual({ from: 8567, to: 8783 });
    expect(coldWeekWindow(8736)).toEqual({ from: 8712, to: 8928 });
    expect(wrapHour(8928 - 1)).toBe(167);
    expect(wrapHour(-24)).toBe(HOURS - 24);
    expect(wrapHour(HOURS)).toBe(0);
  });
});

describe('kalender: hourInfo en formatHour', () => {
  it('maandgrenzen (365 dagen)', () => {
    expect(MONTH_START_HOUR).toHaveLength(13);
    expect(MONTH_START_HOUR[0]).toBe(0);
    expect(MONTH_START_HOUR[1]).toBe(744);
    expect(MONTH_START_HOUR[2]).toBe(1416);
    expect(MONTH_START_HOUR[12]).toBe(HOURS);
    expect(MONTH_SHORT.join(' ')).toBe('jan feb mrt apr mei jun jul aug sep okt nov dec');
    expect(WEEKDAY_SHORT.join(' ')).toBe('ma di wo do vr za zo');
  });

  it('uur 0 is maandag 1 januari 00:00 (startWeekday 1)', () => {
    expect(hourInfo(0, 1)).toEqual({ month: 0, day: 1, hour: 0, weekday: 1 });
    expect(formatHour(0, 1)).toBe('ma 1 jan 00:00');
  });

  it('uur 314 (koude week T5) is zondag 14 januari 02:00', () => {
    // 1 januari is een maandag, dus 14 januari is een zondag (Python: weekdag = ((1 − 1 + 13) mod 7) + 1 = 7)
    expect(hourInfo(314, refYear('T5').startWeekday)).toEqual({ month: 0, day: 14, hour: 2, weekday: 7 });
    expect(formatHour(314, refYear('T5').startWeekday)).toBe('zo 14 jan 02:00');
  });

  it('uur 130 is zaterdag 6 januari 10:00 (spec §9.3)', () => {
    expect(formatHour(130, 1)).toBe('za 6 jan 10:00');
  });

  it('doorlopende uren buiten het jaar vallen terug in het jaar (x-as "31 dec … 7 jan")', () => {
    // winter1979: koude week 31 december 00:00 – 6 januari 23:00, het jaar begint op maandag
    expect(formatHour(8736, 1)).toBe('ma 31 dec 00:00');
    expect(formatHour(8736 + 167, 1)).toBe('za 6 jan 23:00');
    expect(formatHour(8736 + 168 + 24 - 1, 1)).toBe('zo 7 jan 23:00');
    expect(hourInfo(HOURS + 5, 1)).toEqual(hourInfo(5, 1));
    expect(formatHour(-20, 1)).toBe('ma 31 dec 04:00');
  });

  it('maandovergangen en het laatste uur', () => {
    expect(formatHour(743, 1)).toBe('wo 31 jan 23:00');
    expect(formatHour(744, 1)).toBe('do 1 feb 00:00');
    expect(formatHour(1415, 1)).toBe('wo 28 feb 23:00');
    expect(formatHour(1416, 1)).toBe('do 1 mrt 00:00');
    // 365 dagen, begint en eindigt op maandag
    expect(hourInfo(8759, 1)).toEqual({ month: 11, day: 31, hour: 23, weekday: 1 });
    expect(formatHour(8759, 1)).toBe('ma 31 dec 23:00');
  });

  it('weekdag volgt startWeekday (1997 begint op woensdag)', () => {
    expect(formatHour(0, 3)).toBe('wo 1 jan 00:00');
    expect(formatHour(15 * 24 + 14, realYear(1997).startWeekday)).toBe('do 16 jan 14:00');
    expect(formatHour(0, 7)).toBe('zo 1 jan 00:00');
    expect(formatHour(24, 7)).toBe('ma 2 jan 00:00');
  });

  it('elk uur van een niet-schrikkeljaar valt op de echte datum en weekdag', () => {
    for (const year of [2013, 2025]) {
      const sw = REAL_JSON.meta.startWeekdag[String(year)];
      for (let t = 0; t < HOURS; t += 7) {
        const d = new Date(Date.UTC(year, 0, 1) + t * 3_600_000);
        const iso = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
        const h = hourInfo(t, sw);
        expect(h, `${year} uur ${t}`).toEqual({
          month: d.getUTCMonth(),
          day: d.getUTCDate(),
          hour: d.getUTCHours(),
          weekday: iso,
        });
      }
    }
  });
});

describe('klimaatjaar-id’s', () => {
  it('realYearOf', () => {
    expect(realYearOf('knmi-1997')).toBe(1997);
    expect(realYearOf('knmi-1951')).toBe(1951);
    expect(realYearOf('knmi-1963')).toBe(1963);
    expect(realYearOf('knmi-2025')).toBe(2025);
    expect(realYearOf('knmi-1950')).toBeNull();
    expect(realYearOf('knmi-2026')).toBeNull();
    expect(realYearOf('T5')).toBeNull();
    expect(realYearOf('energie')).toBeNull();
    expect(realYearOf('knmi-97')).toBeNull();
    expect(realYearOf('knmi-1997x')).toBeNull();
    expect(realYearOf('1997')).toBeNull();
  });

  it('realYearId is het omgekeerde van realYearOf', () => {
    expect(realYearId(2012)).toBe('knmi-2012');
    for (let y = 1951; y <= 2025; y++) expect(realYearOf(realYearId(y))).toBe(y);
  });

  it('isReferenceYear', () => {
    expect(isReferenceYear('T5')).toBe(true);
    expect(isReferenceYear('T1')).toBe(true);
    expect(isReferenceYear('energie')).toBe(true);
    expect(isReferenceYear('winter1979')).toBe(true);
    expect(isReferenceYear('winter1963')).toBe(true);
    expect(isReferenceYear('T2')).toBe(false);
    expect(isReferenceYear('winter1985')).toBe(false);
    expect(isReferenceYear('knmi-2012')).toBe(false);
  });

  it('isValidClimateYearId', () => {
    for (const id of [
      'T5',
      'T1',
      'energie',
      'winter1979',
      'winter1963',
      'knmi-1951',
      'knmi-2012',
      'knmi-2025',
    ]) {
      expect(isValidClimateYearId(id), id).toBe(true);
    }
    // T2 bestaat niet meer in NEN 5060:2018 (spec §4.1)
    for (const id of [
      'T2',
      't5',
      'Energie',
      'Winter1979',
      'knmi-1950',
      'knmi-2026',
      'knmi-',
      '2012',
      '',
      'knmi-2012 ',
    ]) {
      expect(isValidClimateYearId(id), JSON.stringify(id)).toBe(false);
    }
    for (const v of [2012, null, undefined, {}, ['T5']]) expect(isValidClimateYearId(v)).toBe(false);
  });

  it('climateShortName', () => {
    expect(climateShortName('T5')).toBe('T5');
    expect(climateShortName('T1')).toBe('T1');
    expect(climateShortName('energie')).toBe('energiejaar');
    expect(climateShortName('winter1979')).toBe('winter 1978/79');
    expect(climateShortName('winter1963')).toBe('winter 1962/63');
    expect(climateShortName('knmi-1997')).toBe('1997');
    expect(climateShortName(realYearId(2012))).toBe('2012');
  });
});
