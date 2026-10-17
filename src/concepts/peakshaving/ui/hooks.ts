// Gedeelde React-hooks van de werkbank: zichtbaarheid in beeld, invoermethode en verminderde beweging.
import { useEffect, useState, useSyncExternalStore, type RefCallback } from 'react';

/** Mediaquery als externe bron; zonder matchMedia (jsdom) altijd `fallback`. */
function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = typeof window !== 'undefined' ? window.matchMedia?.(query) : undefined;
      mq?.addEventListener?.('change', cb);
      return () => mq?.removeEventListener?.('change', cb);
    },
    () => (typeof window !== 'undefined' ? (window.matchMedia?.(query).matches ?? fallback) : fallback),
    () => fallback,
  );
}

/** Aanraakscherm (grove aanwijzer): hints per invoermethode en grotere aanraakvlakken. */
export function usePointerCoarse(): boolean {
  return useMediaQuery('(pointer: coarse)');
}

/** De gebruiker vraagt om minder beweging: direct scrollen, geen animatie. */
export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/** Zelfde vraag buiten React (bijv. bij scrollIntoView in een klikafhandeling). */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
}

export interface InViewOptions {
  rootMargin?: string;
  threshold?: number;
}

/**
 * Staat het element (deels) in beeld? Geeft een callback-ref en het antwoord: `const [ref, inView] = useInView()` met
 * `<div ref={ref}>`. Het element mag later verschijnen of wisselen (bijv. de oordeelkaart die het skelet vervangt):
 * de ref zet het element in de toestand en de waarnemer volgt mee. Zonder element of zonder IntersectionObserver
 * (jsdom, oude browsers) altijd true, zodat er niets verdwijnt of pauzeert; ook true tot de eerste waarneming, zodat er
 * niets knippert bij het eerste tekenen.
 */
export function useInView<T extends Element = Element>(
  options: InViewOptions = {},
): [ref: RefCallback<T>, inView: boolean] {
  const [el, setEl] = useState<T | null>(null);
  // laatste waarneming, met het element erbij: een waarneming van een vorig element telt niet
  const [seen, setSeen] = useState<{ el: T; inView: boolean } | null>(null);
  const { rootMargin, threshold } = options;
  useEffect(() => {
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        if (e) setSeen({ el, inView: e.isIntersecting });
      },
      { rootMargin, threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [el, rootMargin, threshold]);
  return [setEl, el !== null && seen !== null && seen.el === el ? seen.inView : true];
}
