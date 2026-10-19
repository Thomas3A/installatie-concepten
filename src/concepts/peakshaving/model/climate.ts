// Klimaatjaren: decoderen van de meegeleverde JSON, statistiek en de koudste week (spec §4).
import { HOURS_PER_YEAR } from './building';
import type { ClimateYear, ClimateYearId } from './types';

export type ReferenceYearName = 'energie' | 'T5' | 'T1' | 'winter1979' | 'winter1963';
/** Volgorde van de keuzelijst (spec §4.3): de drie NEN-reconstructies, dan de twee stresstestjaren. */
export const REFERENCE_YEARS: readonly ReferenceYearName[] = [
  'T1',
  'T5',
  'energie',
  'winter1979',
  'winter1963',
];
/** Stresstestjaren: T1 met het werkelijke stookseizoen nov–mrt van een strenge winter (spec §4.1). */
export const STRESS_TEST_YEARS: readonly ReferenceYearName[] = ['winter1979', 'winter1963'];
export const DEFAULT_CLIMATE_YEAR: ReferenceYearName = 'T1';
export const REAL_YEAR_FIRST = 1951;
export const REAL_YEAR_LAST = 2025;
/** Aanbevolen stresstests met echt weer (spec §4.3; gelijk aan meta.aanbevolen_stresstest). */
export const RECOMMENDED_STRESS_YEARS: readonly number[] = [
  1956, 1963, 1979, 1985, 1986, 1987, 1996, 1997, 2010, 2012,
];

export interface ClimateStats {
  Tgem: number;
  Tmin: number;
  uren_onder_0: number;
  uren_onder_min5: number;
  uren_onder_min10: number;
  koudste_24u: number;
  koudste_72u: number;
  koudste_168u: number;
  koudste_week_start_uur: number;
  graaddagen_18: number;
  graaddagen_15_5: number;
}

export interface ReferenceYearsJson {
  meta: {
    bron: string;
    methode: string;
    tijdas: string;
    startWeekdag: number;
    jaren: Record<
      ReferenceYearName,
      {
        omschrijving: string;
        bronjaar_per_maand: number[];
        maandgemiddelde_T: number[];
        /** null bij de stresstestjaren: die zijn geen reconstructie van een NEN-jaar */
        maandgemiddelde_T_NEN5060_2018: number[] | null;
        statistiek: ClimateStats;
      }
    >;
  };
  data: Record<ReferenceYearName, { T: number[]; U: number[]; FH: number[]; Q: number[] }>;
}

export interface RealYearsJson {
  meta: {
    bron: string;
    aanbevolen_stresstest: number[];
    startWeekdag: Record<string, number>;
    statistiek: Record<string, ClimateStats>;
  };
  T: Record<string, number[]>;
}

/** Labels van de keuzelijst (spec §4.3). */
export const REFERENCE_YEAR_LABELS: Record<ReferenceYearName, string> = {
  T1: 'Ontwerpjaar T1 — strenge winter (≈ NEN 5060:2018 ref T1)',
  T5: 'Ontwerpjaar T5 — gemiddelde winter (≈ NEN 5060:2018 ref T5)',
  energie: 'Energiejaar — langjarig gemiddeld (≈ NEN 5060:2018 energie)',
  winter1979: 'Stresstest strenge winter 1978/79 (≈ 1× per 25 jaar)',
  winter1963: 'Stresstest extreme winter 1962/63 (≈ 1× per eeuw)',
};

export const REFERENCE_YEAR_SHORT: Record<ReferenceYearName, string> = {
  T5: 'T5',
  T1: 'T1',
  energie: 'energiejaar',
  winter1979: 'winter 1978/79',
  winter1963: 'winter 1962/63',
};

export function isReferenceYear(id: ClimateYearId): id is ReferenceYearName {
  return (REFERENCE_YEARS as readonly string[]).includes(id);
}

export function isStressTestYear(id: ClimateYearId): boolean {
  return (STRESS_TEST_YEARS as readonly string[]).includes(id);
}

/** Jaartal van een werkelijk jaar ('knmi-1997' → 1997), anders null. */
export function realYearOf(id: ClimateYearId): number | null {
  const m = /^knmi-(\d{4})$/.exec(id);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= REAL_YEAR_FIRST && y <= REAL_YEAR_LAST ? y : null;
}

export function realYearId(year: number): ClimateYearId {
  return `knmi-${year}`;
}

export function isValidClimateYearId(id: unknown): id is ClimateYearId {
  return typeof id === 'string' && (isReferenceYear(id) || realYearOf(id) !== null);
}

/** Korte naam voor tabellen: "T5", "energiejaar", "winter 1978/79", "1997". */
export function climateShortName(id: ClimateYearId): string {
  if (isReferenceYear(id)) return REFERENCE_YEAR_SHORT[id];
  return String(realYearOf(id) ?? id);
}

/** Naam binnen een zin: "ontwerpjaar T5", "het energiejaar", "de winter 1978/79", "1997". */
export function climateInSentence(id: ClimateYearId): string {
  if (id === 'energie') return 'het energiejaar';
  if (isStressTestYear(id)) return `de ${REFERENCE_YEAR_SHORT[id as ReferenceYearName]}`;
  if (isReferenceYear(id)) return `ontwerpjaar ${id}`;
  return String(realYearOf(id) ?? id);
}

function decodeTenths(values: readonly number[]): Float64Array {
  if (values.length !== HOURS_PER_YEAR)
    throw new Error(`verwacht ${HOURS_PER_YEAR} uurwaarden, kreeg ${values.length}`);
  const T = new Float64Array(HOURS_PER_YEAR);
  for (let i = 0; i < HOURS_PER_YEAR; i++) T[i] = values[i] / 10;
  return T;
}

/** Referentiejaar uit referentiejaren.json (T in 0,1 °C → °C). */
export function decodeReferenceYear(json: ReferenceYearsJson, name: ReferenceYearName): ClimateYear {
  return {
    id: name,
    name: REFERENCE_YEAR_LABELS[name],
    T: decodeTenths(json.data[name].T),
    startWeekday: json.meta.startWeekdag,
  };
}

/** Werkelijk jaar uit knmi-debilt-1951-2025.json. */
export function decodeRealYear(json: RealYearsJson, year: number): ClimateYear {
  const key = String(year);
  const T = json.T[key];
  if (!T) throw new Error(`jaar ${year} ontbreekt`);
  return {
    id: realYearId(year),
    name: `Werkelijk jaar KNMI De Bilt ${year}`,
    T: decodeTenths(T),
    startWeekday: json.meta.startWeekdag[key],
  };
}

/**
 * Laagste lopend gemiddelde over `hours` uur en het startuur. Cyclisch, zoals het jaar gesimuleerd wordt: een venster
 * mag over de jaargrens december → januari lopen (startuur > n − hours).
 */
function coldestRunningMean(T: ArrayLike<number>, hours: number): { mean: number; start: number } {
  const n = T.length;
  let s = 0;
  for (let i = 0; i < hours; i++) s += T[i];
  let best = s;
  let start = 0;
  for (let i = 1; i < n; i++) {
    s += T[(i + hours - 1) % n] - T[i - 1];
    if (s < best - 1e-9) {
      best = s;
      start = i;
    }
  }
  return { mean: best / hours, start };
}

/** Statistiek van een klimaatjaar (zelfde definities als scripts/klimaat/build_reference_years.py). */
export function climateStats(T: ArrayLike<number>): ClimateStats {
  const n = T.length;
  let sum = 0;
  let min = Infinity;
  let below0 = 0;
  let below5 = 0;
  let below10 = 0;
  for (let i = 0; i < n; i++) {
    const v = T[i];
    sum += v;
    if (v < min) min = v;
    if (v < 0) below0++;
    if (v < -5) below5++;
    if (v < -10) below10++;
  }
  let gd18 = 0;
  let gd155 = 0;
  for (let d = 0; d < Math.floor(n / 24); d++) {
    let ds = 0;
    for (let h = 0; h < 24; h++) ds += T[d * 24 + h];
    const dm = ds / 24;
    gd18 += Math.max(18 - dm, 0);
    gd155 += Math.max(15.5 - dm, 0);
  }
  const w = coldestRunningMean(T, 168);
  return {
    Tgem: sum / n,
    Tmin: min,
    uren_onder_0: below0,
    uren_onder_min5: below5,
    uren_onder_min10: below10,
    koudste_24u: coldestRunningMean(T, 24).mean,
    koudste_72u: coldestRunningMean(T, 72).mean,
    koudste_168u: w.mean,
    koudste_week_start_uur: w.start,
    graaddagen_18: gd18,
    graaddagen_15_5: gd155,
  };
}

/** Lengte van de koude week [h] en de marge eromheen in de grafieken [h] (spec §4.4). */
export const COLD_WEEK_HOURS = 168;
export const COLD_WEEK_MARGIN_H = 24;

/** Uurindex binnen het jaar [0, 8760) van een doorlopend uur (negatief = december, ≥ 8760 = januari). */
export function wrapHour(t: number): number {
  return ((t % HOURS_PER_YEAR) + HOURS_PER_YEAR) % HOURS_PER_YEAR;
}

/**
 * Startuur van de 168-uursperiode met de hoogste som van Q_ideal;
 * bij gelijke som de laagste gemiddelde buitentemperatuur (port van koudste_week).
 * Cyclisch (spec §4.4), zoals het jaar gesimuleerd wordt: het venster mag over de jaargrens lopen. Het startuur kan
 * dus groter zijn dan 8760 − 168; uur k van de week is dan (start + k) mod 8760.
 */
export function coldestWeekStart(qIdeal: ArrayLike<number>, T: ArrayLike<number>): number {
  const W = COLD_WEEK_HOURS;
  const n = HOURS_PER_YEAR;
  let s = 0;
  let sT = 0;
  for (let i = 0; i < W; i++) {
    s += qIdeal[i];
    sT += T[i];
  }
  let best = -1;
  let bestI = 0;
  let bestT = Infinity;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      s += qIdeal[(i + W - 1) % n] - qIdeal[i - 1];
      sT += T[(i + W - 1) % n] - T[i - 1];
    }
    if (s > best + 1e-9 || (Math.abs(s - best) <= 1e-9 && sT < bestT)) {
      best = s;
      bestI = i;
      bestT = sT;
    }
  }
  return bestI;
}

/**
 * Venster van de grafieken: koude week ± 24 uur (216 uur) in doorlopende uren. Het jaar is cyclisch: `from` is
 * negatief als de marge in december begint, `to` groter dan 8760 als het venster doorloopt in januari. De waarde van
 * uur t staat in de jaarreeksen op `wrapHour(t)`.
 */
export function coldWeekWindow(start: number): { from: number; to: number } {
  return { from: start - COLD_WEEK_MARGIN_H, to: start + COLD_WEEK_HOURS + COLD_WEEK_MARGIN_H };
}

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTH_SHORT = [
  'jan',
  'feb',
  'mrt',
  'apr',
  'mei',
  'jun',
  'jul',
  'aug',
  'sep',
  'okt',
  'nov',
  'dec',
];
export const WEEKDAY_SHORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

/** Eerste uurindex van elke maand (13 grenzen, laatste = 8760). */
export const MONTH_START_HOUR: readonly number[] = MONTH_DAYS.reduce<number[]>(
  (acc, d) => {
    acc.push(acc[acc.length - 1] + d * 24);
    return acc;
  },
  [0],
);

/** Kalendergegevens van uur t (365 dagen, MET); een doorlopend uur buiten het jaar valt terug in het jaar. */
export function hourInfo(
  hour: number,
  startWeekday: number,
): { month: number; day: number; hour: number; weekday: number } {
  const t = wrapHour(hour);
  const dayOfYear = Math.floor(t / 24);
  let month = 0;
  while (month < 11 && t >= MONTH_START_HOUR[month + 1]) month++;
  const day = dayOfYear - MONTH_START_HOUR[month] / 24 + 1;
  return { month, day, hour: t % 24, weekday: ((startWeekday - 1 + dayOfYear) % 7) + 1 };
}

/** "do 16 jan 14:00" */
export function formatHour(t: number, startWeekday: number): string {
  const h = hourInfo(t, startWeekday);
  return `${WEEKDAY_SHORT[h.weekday - 1]} ${h.day} ${MONTH_SHORT[h.month]} ${String(h.hour).padStart(2, '0')}:00`;
}
