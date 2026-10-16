// Deelbare link: de volledige invoer als afwijking van de standaard van de gebouwfunctie, met versienummer,
// als base64url in de hash (#/peakshaving?c=...). Bij het laden wordt alles gevalideerd en begrensd.
import { fromBase64Url, jsonDiff, jsonMerge, toBase64Url, type Json } from '../../core/shareCodec';
import { defaultInput } from './data/defaults';
import { normalizeInput } from './model/input';
import type { BuildingUse, PeakshavingInput } from './model/types';
import { SCENARIOS } from './scenarios';

/** Versie van het linkformaat; verhoog bij een niet-compatibele wijziging van de invoer. */
export const SHARE_VERSION = 1;
export const SHARE_ROUTE = '/peakshaving';

export function encodeInput(input: PeakshavingInput): string {
  const use = input.building.use;
  const d = jsonDiff(input as unknown as Json, defaultInput(use) as unknown as Json) ?? {};
  // de gebouwfunctie altijd meegeven: die bepaalt de standaard waartegen het verschil is genomen
  const payload = jsonMerge(d, { v: SHARE_VERSION, building: { use } } as unknown as Json);
  return toBase64Url(JSON.stringify(payload));
}

export function decodeInput(code: string): PeakshavingInput | null {
  try {
    const parsed = JSON.parse(fromBase64Url(code)) as Json;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const p = parsed as { [k: string]: Json };
    if (typeof p.v === 'number' && p.v > SHARE_VERSION) return null;
    const b = p.building as { [k: string]: Json } | undefined;
    const use: BuildingUse = b && b.use === 'office' ? 'office' : 'residential';
    const rest: { [k: string]: Json } = { ...p };
    delete rest.v;
    return normalizeInput(jsonMerge(defaultInput(use) as unknown as Json, rest));
  } catch {
    return null;
  }
}

export function shareUrl(input: PeakshavingInput, loc: Pick<Location, 'href'> = window.location): string {
  const base = loc.href.split('#')[0];
  return `${base}#${SHARE_ROUTE}?c=${encodeInput(input)}`;
}

/** Twee invoeren zijn na normalisatie gelijk (volgorde van de sleutels telt niet). */
export function sameInput(a: PeakshavingInput, b: PeakshavingInput): boolean {
  const x = normalizeInput(a) as unknown as Json;
  const y = normalizeInput(b) as unknown as Json;
  return jsonDiff(x, y) === undefined && jsonDiff(y, x) === undefined;
}

/** Id van het scenario met precies deze invoer (een ongewijzigd scenario uit een deelbare link), anders null. */
export function scenarioIdOf(input: PeakshavingInput): string | null {
  return SCENARIOS.find((sc) => sameInput(input, sc.build()))?.id ?? null;
}
