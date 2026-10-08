// Getalnotatie (nl-NL) en eenheidsconversie. Intern rekenen we in SI.

const cache = new Map<number, Intl.NumberFormat>();

function nf(digits: number): Intl.NumberFormat {
  let f = cache.get(digits);
  if (!f) {
    f = new Intl.NumberFormat('nl-NL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    cache.set(digits, f);
  }
  return f;
}

/** Formatteer een getal met vaste decimalen; niet-eindige waarden worden "–". */
export function fmt(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '–';
  return nf(digits).format(x);
}

export const m3sToLh = (q: number): number => q * 3.6e6;
export const lhToM3s = (q: number): number => q / 3.6e6;
export const m3sToM3h = (q: number): number => q * 3600;
export const paToKpa = (p: number): number => p / 1000;
export const mToMm = (m: number): number => m * 1000;
export const JToKwh = (e: number): number => e / 3.6e6;

export function fmtClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
