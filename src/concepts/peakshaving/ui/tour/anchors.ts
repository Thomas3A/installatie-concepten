// Haken voor de rondleiding (UX-plan §8): de data-tour-attributen op de pagina. De rondleiding zelf staat in Tour.tsx.

/** Knop "Rondleiding" en automatisch starten aan of uit. */
export const TOUR_ENABLED = true;

/** Waarden van het attribuut data-tour. */
export const TOUR_ANCHORS = {
  /** open Basis-paneel én de ingeklapte strook */
  basis: 'basis',
  /** wrapper van het veld "Aandeel voor warmtepomp" */
  budget: 'budget',
  /** oordeelkaart */
  verdict: 'verdict',
  /** paneel Wat als? */
  whatif: 'whatif',
  /** bufferhendel met mini-grafiek */
  buffer: 'buffer',
  /** batterijhendel en aansluitingsstapper samen */
  batteryConnection: 'battery-connection',
  /** Verdieping */
  depth: 'depth',
  /** keuzelijst Voorbeelden */
  examples: 'examples',
} as const;

export type TourAnchor = (typeof TOUR_ANCHORS)[keyof typeof TOUR_ANCHORS];

/** Props voor een anker: `<section {...tourAnchor('verdict')}>`. */
export function tourAnchor(anchor: TourAnchor): { 'data-tour': TourAnchor } {
  return { 'data-tour': anchor };
}

/** CSS-selector van een anker. */
export function tourSelector(anchor: TourAnchor): string {
  return `[data-tour="${anchor}"]`;
}
