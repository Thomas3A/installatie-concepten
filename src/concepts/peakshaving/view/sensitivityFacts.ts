// Feiten uit het gevoeligheidsraster (UX-plan §4.5, §5.1): rastermodel, overgangen "toereikend vanaf", het knikpunt
// van P_th,min(V) en de eerstvolgende kleinere aansluiting. Puur TypeScript (geen React of DOM); de grafiek op het
// tabblad Gevoeligheid, de mini-grafiek en de knoppen van het oordeel gebruiken dezelfde functies.
import { fmt } from '../../../core/format';
import { CONNECTIONS, LARGE_CONNECTION_ID, type ConnectionDef, type ConnectionId } from '../data/connections';
import { sensitivityKey } from '../model/analysis';
import { limitFromConnection } from '../model/grid';
import type { Ranges } from '../model/ranges';
import {
  SENSITIVITY_BATTERY_FRACTIONS,
  SENSITIVITY_VOLUME_FRACTIONS,
  type SensitivityRow,
} from '../model/sizing';
import type { GridConnection, PeakshavingInput } from '../model/types';

export interface SensitivityState {
  key: string;
  rows: (SensitivityRow | null)[];
  total: number;
  /** klaar: alle rijen berekend, of afgebroken met een fout (dan staat `error` gevuld en is het raster onvolledig) */
  done: boolean;
  /** foutmelding van de rekenmotor; zo'n raster komt niet in de cache en wordt bij een volgend verzoek opnieuw berekend */
  error?: string;
}

// ---------------------------------------------------------------- notatie

/** Getal met zo weinig decimalen als nodig (hoogstens `maxDigits`): 0; 0,2; 0,25; 7,5. */
export function compact(v: number, maxDigits = 2): string {
  for (let d = 0; d < maxDigits; d++) {
    const k = 10 ** d;
    if (Math.abs(Math.round(v * k) - v * k) < 1e-6) return fmt(v, d);
  }
  return fmt(v, maxDigits);
}

/** Batterijen van een overgang in één korte tekst: "zonder batterij", "batterij 15 / 30 kWh". */
export function batteriesText(indexes: number[], caps: number[]): string {
  const none = indexes.some((j) => !(caps[j] > 0));
  const sizes = indexes.filter((j) => caps[j] > 0).map((j) => compact(caps[j]));
  const parts: string[] = [];
  if (none) parts.push('zonder batterij');
  if (sizes.length > 0) parts.push(`batterij ${sizes.join(' / ')} kWh`);
  return parts.join(' en ');
}

// ---------------------------------------------------------------- rastermodel

export interface GridModel {
  /** aantal buffervolumes (13) */
  n: number;
  /** aantal berekende rijen */
  computed: number;
  /** buffervolumes [m³]; nog niet berekende rijen uit de vaste fracties van V_max */
  x: number[];
  /** batterijcapaciteiten [kWh], oplopend */
  caps: number[];
  rows: (SensitivityRow | null)[];
}

export function gridModel(
  sens: SensitivityState,
  ranges: Pick<Ranges, 'bufferMaxM3' | 'batteryMaxKwh'>,
): GridModel {
  const n = sens.total > 0 ? sens.total : SENSITIVITY_VOLUME_FRACTIONS.length;
  const rows = Array.from({ length: n }, (_, i) => sens.rows[i] ?? null);
  const x = rows.map(
    (r, i) => r?.volumeM3 ?? (SENSITIVITY_VOLUME_FRACTIONS[i] ?? i / Math.max(1, n - 1)) * ranges.bufferMaxM3,
  );
  const first = rows.find((r): r is SensitivityRow => r !== null);
  const caps = first
    ? first.cells.map((c) => c.capacityKwh)
    : SENSITIVITY_BATTERY_FRACTIONS.map((f) => f * ranges.batteryMaxKwh);
  return { n, computed: rows.filter((r) => r !== null).length, x, caps, rows };
}

/** Overgang: vanaf dit buffervolume is deze aansluiting toereikend voor deze batterij(en). */
export interface Transition {
  conn: ConnectionDef;
  limitKw: number;
  volumeM3: number;
  /** batterij-indexen (oplopend) */
  batteries: number[];
  text: string;
}

/** Past de kleinste aansluiting van cel j binnen aansluiting c? (grootverbruik telt niet als passend) */
export function fitsConnection(row: SensitivityRow, j: number, c: ConnectionDef): boolean {
  const s = row.cells[j]?.smallest;
  return !!s && s.id !== LARGE_CONNECTION_ID && Number.isFinite(s.powerKw) && s.powerKw <= c.powerKw + 1e-9;
}

/**
 * Per batterijlijn en per standaardaansluiting het eerste buffervolume V > 0 vanaf waar die aansluiting toereikend is
 * (en bij de volgende berekende punten blijft); alleen echte overgangen, dus niet als de aansluiting bij V = 0 al
 * volstaat. Overgangen op hetzelfde punt worden samengevoegd.
 */
export function transitionsOf(m: GridModel, share: number): Transition[] {
  const r0 = m.rows[0];
  if (!r0) return [];
  const later: number[] = [];
  m.rows.forEach((r, i) => {
    if (i > 0 && r) later.push(i);
  });
  const found = new Map<string, Omit<Transition, 'text'>>();
  for (let j = 0; j < m.caps.length; j++) {
    for (const c of CONNECTIONS) {
      if (fitsConnection(r0, j, c)) continue;
      const fits = (i: number): boolean => fitsConnection(m.rows[i] as SensitivityRow, j, c);
      // begin van de aaneengesloten reeks passende punten aan het eind; anders het eerste passende punt
      let first = -1;
      for (let k = later.length - 1; k >= 0 && fits(later[k]); k--) first = later[k];
      if (first < 0) first = later.find(fits) ?? -1;
      if (first < 0) continue;
      const limitKw = limitFromConnection(c.powerKw, share);
      if (!Number.isFinite(limitKw)) continue;
      const key = `${c.id}@${first}`;
      const t = found.get(key);
      if (t) t.batteries.push(j);
      else
        found.set(key, {
          conn: c,
          limitKw,
          volumeM3: (m.rows[first] as SensitivityRow).volumeM3,
          batteries: [j],
        });
    }
  }
  return [...found.values()].map((t) => ({
    ...t,
    text: `${t.conn.label} vanaf ${fmt(t.volumeM3, 2)} m³ (${batteriesText(t.batteries, m.caps)})`,
  }));
}

// ---------------------------------------------------------------- toestand van het raster

/** 'ready' = klaar en hoort bij de invoer; 'pending' = rekent nog of is nog niet gevraagd; 'failed' = rekenfout. */
export type GridStatus = 'ready' | 'pending' | 'failed';

export function gridStatus(sens: SensitivityState | null, input: PeakshavingInput): GridStatus {
  if (!sens || sens.key !== sensitivityKey(input)) return 'pending';
  if (sens.error !== undefined) return 'failed';
  return sens.done ? 'ready' : 'pending';
}

/**
 * Het raster hoort bij deze invoer (zelfde sleutel), is klaar en zonder fout: alleen dan kloppen knoppen en stippen
 * die op het raster steunen. Buffer, batterij en WP-vermogen tellen in de sleutel niet mee.
 */
export function gridMatches(
  sens: SensitivityState | null,
  input: PeakshavingInput,
): sens is SensitivityState {
  return gridStatus(sens, input) === 'ready';
}

/** Volledig berekende rijen (alleen bij een raster dat klaar is). */
function completeRows(rows: readonly (SensitivityRow | null)[]): SensitivityRow[] | null {
  return rows.length > 0 && rows.every((r) => r !== null) ? (rows as SensitivityRow[]) : null;
}

/**
 * Kleinste rasterpunt V > 0 waarop de warmtepomp zonder batterij (P_th,min(V), automatisch) hoogstens `allowedH` uur
 * boven de limiet komt. Alleen exacte rasterpunten: het verband is niet monotoon (B10). null als er geen is.
 */
export function firstFitVolume(
  rows: readonly (SensitivityRow | null)[],
  allowedH: number,
): { index: number; volumeM3: number } | null {
  const all = completeRows(rows);
  if (!all) return null;
  for (let i = 1; i < all.length; i++) {
    const h = all[i].cells[0]?.exceedanceHours;
    if (h !== undefined && Number.isFinite(h) && h <= allowedH)
      return { index: i, volumeM3: all[i].volumeM3 };
  }
  return null;
}

/** Een punt hoort bij het plateau als P_th,min hoogstens 2 % boven het minimum ligt. */
export const PLATEAU_TOLERANCE = 0.02;

/**
 * Knikpunt van P_th,min(V): het eerste buffervolume met P_th,min ≤ 1,02 × het minimum over de berekende punten.
 * Daarna helpt meer buffer niet meer ("uren, geen dagen"). null zonder berekende punten, en ook als het knikpunt het
 * laatste berekende punt is: dan daalt de lijn tot het einde van het bereik en is "meer helpt niet" niet aangetoond.
 */
export function plateauStart(
  rows: readonly (SensitivityRow | null)[],
): { index: number; volumeM3: number; minKw: number } | null {
  let minKw = Infinity;
  let lastFinite = -1;
  rows.forEach((r, i) => {
    if (r && Number.isFinite(r.nominalKw)) {
      minKw = Math.min(minKw, r.nominalKw);
      lastFinite = i;
    }
  });
  if (!Number.isFinite(minKw)) return null;
  for (let i = 0; i < lastFinite; i++) {
    const r = rows[i];
    if (r && Number.isFinite(r.nominalKw) && r.nominalKw <= (1 + PLATEAU_TOLERANCE) * minKw + 1e-9)
      return { index: i, volumeM3: r.volumeM3, minKw };
  }
  return null;
}

type GridChoice = Pick<GridConnection, 'connection' | 'contractedKw'>;

/** Plaats in de stapper: index in CONNECTIONS, grootverbruik er direct na. */
export function connectionIndex(connection: ConnectionId): number {
  if (connection === LARGE_CONNECTION_ID) return CONNECTIONS.length;
  return CONNECTIONS.findIndex((c) => c.id === connection);
}

/**
 * Eén stap kleinere standaardaansluiting (volgorde van CONNECTIONS; vanaf grootverbruik 3×80 A), of null bij de
 * kleinste aansluiting.
 */
export function smallerOption(grid: GridChoice): ConnectionDef | null {
  const i = connectionIndex(grid.connection);
  return i > 0 ? CONNECTIONS[i - 1] : null;
}

/**
 * Stip (b) van de mini-grafiek: de overgang van aansluiting `c` met de kleinste batterij, bij gelijke batterij het
 * kleinste buffervolume. De knop "Kleinere aansluiting volstaat ook" gebruikt hetzelfde punt (smallerRoute).
 */
export function smallerTransition(ts: readonly Transition[], c: ConnectionDef): Transition | null {
  return (
    ts
      .filter((t) => t.conn.id === c.id)
      .sort((x, y) => x.batteries[0] - y.batteries[0] || x.volumeM3 - y.volumeM3)[0] ?? null
  );
}

/** Route naar een kleinere aansluiting uit het raster (zie smallerRoute). */
export type SmallerRoute =
  /** alleen buffer: aansluiting en buffervolume zetten, de batterij blijft */
  | { kind: 'buffer'; volumeM3: number }
  /** alleen de aansluiting: buffer en batterij blijven; het volgende scherm noemt de exacte kleinste batterij */
  | { kind: 'battery' }
  /** buffer en rasterbatterij van één rasterpunt (hetzelfde punt als stip (b)) */
  | { kind: 'bufferBattery'; volumeM3: number; capacityKwh: number };

/**
 * Route naar aansluiting `c` bij het huidige buffervolume `volumeM3`, zodat de knop dezelfde route noemt als de rest
 * van het scherm en de batterij niet groter maakt dan nodig (het raster kent maar vier batterijen):
 * 1. alleen buffer (rij zonder batterij): het grootste passende rasterpunt tot en met de huidige buffer, anders het
 *    punt van stip (b) als die zonder batterij is. Nooit meer buffer dan nodig als een kleinere al past.
 * 2. met batterij, als die bij een rasterpunt tot en met de huidige buffer past: alleen de aansluiting. Buffer en
 *    batterij blijven staan; het oordeel noemt daarna de exacte kleinste batterij ("Wat helpt", "Kleinste batterij
 *    voor 0 uur") in plaats van de grovere rasterbatterij.
 * 3. anders het punt van stip (b): meer buffer met de kleinste rasterbatterij (geverifieerd: 0 uur).
 * null als `c` nergens in het raster past.
 */
export function smallerRoute(
  m: GridModel,
  c: ConnectionDef,
  share: number,
  volumeM3: number,
): SmallerRoute | null {
  const all = completeRows(m.rows);
  if (!all) return null;
  const upTo = all.filter((r) => r.volumeM3 <= volumeM3 + 1e-9);
  const bufferOnly = upTo.filter((r) => fitsConnection(r, 0, c)).pop();
  if (bufferOnly) return { kind: 'buffer', volumeM3: bufferOnly.volumeM3 };
  const t = smallerTransition(transitionsOf(m, share), c);
  if (t && t.batteries[0] === 0) return { kind: 'buffer', volumeM3: t.volumeM3 };
  if (upTo.some((r) => r.cells.some((_, j) => j > 0 && fitsConnection(r, j, c)))) return { kind: 'battery' };
  const capacityKwh = t ? m.caps[t.batteries[0]] : undefined;
  return t && capacityKwh !== undefined ? { kind: 'bufferBattery', volumeM3: t.volumeM3, capacityKwh } : null;
}
