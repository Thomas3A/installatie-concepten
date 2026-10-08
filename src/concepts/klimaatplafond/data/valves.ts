// Klepdata. De waarden zijn centraal aanpasbaar in dit bestand.
// waarden uit leveranciersdocumentatie, geanonimiseerd

export type ValveType = 'A' | 'B';
export type Dn = 15 | 20;

/** Type B: modulerende gekarakteriseerde 6-weg-klep met flow- en ΔT-meting. */
export const TYPE_B = {
  /** Beschikbare Kvs-waarden (m³/h) per DN, per sequentie afzonderlijk te kiezen. */
  kvs: {
    15: [0.25, 0.4, 0.63, 1.0, 1.3, 1.8],
    20: [0.63, 1.0, 1.6, 2.5, 4.0],
  } as Record<Dn, number[]>,
  /** Looptijd voor 90° in seconden. */
  runtime90: 90,
  /** Maximaal Δp over de klep (kPa). */
  maxDpKpa: 110,
  /** Exponent gelijkprocentige karakteristiek. */
  nGl: 3.2,
  /** Rotatiesequenties in graden. */
  sequences: { koelen: [0, 30], dicht: [30, 60], verwarmen: [60, 90] },
  /** Ondergrens van de gelijkprocentige karakteristiek (relatieve opening). */
  hLinear: 0.05,
};

/** Type A: schakelende 6-weg-klep met drukonafhankelijk regelventiel (PICV) in de plafondretour. */
export const TYPE_A = {
  /** Kvs (totaal) van de schakelende 6-weg-klep per DN (m³/h). */
  kvsSixWay: { 15: 2.4, 20: 4.0 } as Record<Dn, number>,
  /** Omschakeltijd 6-weg in seconden. */
  switchTime: 30,
  /** Volledige slag van de PICV in seconden. */
  picvStroke: 60,
  /** Maximaal Δp over de klep (kPa). */
  maxDpKpa: 600,
};

export type PicvId = 'DN15-LF' | 'DN15' | 'DN15-HF' | 'DN20' | 'DN20-HF';

export interface PicvSpec {
  id: PicvId;
  label: string;
  dn: Dn;
  /** Nominaal debiet (l/h) */
  qNom: number;
  /** Minimaal Δp voor drukonafhankelijk regelen (kPa) */
  dpMin: number;
  /** Ondergrens van het instelbereik als fractie van q_nom */
  rangeMin: number;
}

export const PICVS: PicvSpec[] = [
  { id: 'DN15-LF', label: 'DN15 LF (200 l/h)', dn: 15, qNom: 200, dpMin: 16, rangeMin: 0.1 },
  { id: 'DN15', label: 'DN15 (650 l/h)', dn: 15, qNom: 650, dpMin: 16, rangeMin: 0.2 },
  { id: 'DN15-HF', label: 'DN15 HF (1.200 l/h)', dn: 15, qNom: 1200, dpMin: 25, rangeMin: 0.4 },
  { id: 'DN20', label: 'DN20 (1.100 l/h)', dn: 20, qNom: 1100, dpMin: 16, rangeMin: 0.2 },
  { id: 'DN20-HF', label: 'DN20 HF (1.900 l/h)', dn: 20, qNom: 1900, dpMin: 25, rangeMin: 0.4 },
];

export const picvSpec = (id: PicvId | null | undefined): PicvSpec =>
  PICVS.find((p) => p.id === id) ?? PICVS[1];
export const picvsForDn = (dn: Dn): PicvSpec[] => PICVS.filter((p) => p.dn === dn);
