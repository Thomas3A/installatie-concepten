// Kleine UI-voorkeuren in localStorage (Basis open of dicht, rondleiding gezien). Alles in try/catch: zonder
// localStorage (privévenster, geblokkeerd, Node in de tests) werkt de pagina gewoon met de standaard.

/** Sleutels met een versienummer: een andere betekenis krijgt een nieuwe sleutel. */
export const STORAGE_KEYS = {
  /** 'open' of 'dicht' */
  basis: 'ps-basis-v1',
  /** 'gezien' na Overslaan of Klaar */
  tour: 'ps-rondleiding-v1',
} as const;

function storage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** Waarde van een sleutel; null als die ontbreekt of localStorage niet beschikbaar is. */
export function readKey(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Waarde bewaren (null = verwijderen); fouten (vol, geblokkeerd) worden genegeerd. */
export function writeKey(key: string, value: string | null): void {
  try {
    const s = storage();
    if (!s) return;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    // niet beschikbaar: de voorkeur geldt dan alleen voor dit bezoek
  }
}
