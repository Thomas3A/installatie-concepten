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

/** Het typografische minteken (U+2212), zoals in de vaste teksten ("bij −10 °C"). */
export const MINUS = '−';

/**
 * Formatteer een getal met vaste decimalen; niet-eindige waarden worden "–".
 * Negatieve getallen krijgen een echt minteken (−) in plaats van het koppelteken; een waarde die op nul
 * afrondt ("-0,0") verliest haar teken.
 */
export function fmt(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '–';
  const s = nf(digits).format(x);
  if (s.charAt(0) !== '-') return s;
  return /^-[0.,]+$/.test(s) ? s.slice(1) : MINUS + s.slice(1);
}

/**
 * Lees een getal zoals de gebruiker het typt of zoals fmt() het toont. Komma of punt als decimaalteken,
 * punt als duizendtalscheiding ("1.234" en "1.234,5"), − (U+2212), – of - als minteken.
 * Lege of ongeldige tekst geeft null (dan blijft de oude waarde staan).
 */
export function parseNum(txt: string): number | null {
  let t = txt.replace(/\s/g, '').replace(/[−–]/g, '-');
  if (t === '') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^[-+]?[1-9]\d{0,2}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
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
