// Plaats van de popover van de rondleiding (UX-plan §8, WP-H): pure rekenfuncties zonder DOM, los te testen. Alle maten
// in CSS-pixels; een `Box` is een rechthoek ten opzichte van het venster (zoals getBoundingClientRect).
//
// Volgorde van de kanten: rechts naast het anker, anders eronder, anders links, anders erboven. Rechts en links hangen
// niet af van de scrollpositie; onder en boven passen als anker en popover samen in het venster passen (de pagina scrolt
// daar dan naartoe). Past niets, dan komt de popover eronder.
//
// De popover zit vast aan zijn kant van het anker en bedekt het anker dus nooit: loodrecht op die kant volgt hij het
// anker, ook als dat (deels) uit beeld scrolt of groter wordt dan het venster. Langs de kant schuift hij binnen het
// venster, maar niet verder dan het anker reikt: het pijltje wijst altijd naar het anker, en scrolt het anker uit beeld,
// dan gaat de popover mee.

export type TourSide = 'right' | 'bottom' | 'left' | 'top';

export interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
  /** strook onderaan die vrij blijft (de balk met het oordeel) */
  bottomInset: number;
}

/** Ligging van het anker in het document, voor onder en boven: kan de pagina daar wel naartoe scrollen? */
export interface DocInfo {
  /** bovenkant van het anker in documentcoördinaten (top + scrollY) */
  anchorTop: number;
  /** hoogte van het document (scrollHeight) */
  height: number;
}

export interface TourPosition {
  top: number;
  left: number;
  /**
   * plaats van het pijltje langs de rand die naar het anker wijst: vanaf de bovenkant (rechts of links van het anker)
   * of vanaf de linkerkant (onder of boven het anker) van de popover
   */
  arrow: number;
}

/** Ruimte tussen de rand van het anker en de popover [px] (de ring ligt daartussen). */
export const TOUR_GAP = 16;
/** Minimale afstand tot de rand van het venster [px]. */
export const TOUR_MARGIN = 12;
/** De ring om het anker ligt zoveel buiten het anker [px]. */
export const TOUR_RING_PAD = 6;
/** Het pijltje blijft minstens zo ver van een hoek van de popover [px]. */
export const TOUR_ARROW_INSET = 18;
/** Bij een hoog anker wijst het pijltje naar dit punt onder de bovenkant (de kop van het blok) [px]. */
const HEAD_OFFSET = 28;

export const SIDE_ORDER: readonly TourSide[] = ['right', 'bottom', 'left', 'top'];

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), Math.max(lo, hi));
}

/** Bruikbare hoogte van het venster: zonder de strook onderaan en de marges. */
function usableHeight(vp: Viewport): number {
  return vp.height - vp.bottomInset - 2 * TOUR_MARGIN;
}

/**
 * Past de popover dwars op deze kant in het venster: rechts of links naast het anker (binnen de breedte), onder of
 * boven niet breder dan het venster? Hangt niet af van de scrollpositie.
 */
export function fitsAcross(side: TourSide, anchor: Box, pop: Size, vp: Viewport): boolean {
  switch (side) {
    case 'right':
      return vp.width - (anchor.left + anchor.width) - TOUR_GAP - TOUR_MARGIN >= pop.width;
    case 'left':
      return anchor.left - TOUR_GAP - TOUR_MARGIN >= pop.width;
    case 'bottom':
    case 'top':
      return pop.width <= vp.width - 2 * TOUR_MARGIN;
  }
}

/** Past de popover aan deze kant, zonder het anker te bedekken? */
export function sideFits(side: TourSide, anchor: Box, pop: Size, vp: Viewport, doc?: DocInfo): boolean {
  if (!fitsAcross(side, anchor, pop, vp)) return false;
  const room = usableHeight(vp);
  if (side === 'right' || side === 'left') return pop.height <= room;
  if (anchor.height + TOUR_GAP + pop.height > room) return false;
  if (!doc) return true;
  // de pagina moet ver genoeg kunnen scrollen: onder het anker nog document, boven het anker nog ruimte
  return side === 'bottom'
    ? doc.anchorTop + anchor.height + TOUR_GAP + pop.height <= doc.height - TOUR_MARGIN
    : doc.anchorTop - TOUR_GAP - pop.height >= TOUR_MARGIN;
}

/** Kant voor de popover: de eerste die past in SIDE_ORDER; past niets, dan eronder. */
export function chooseSide(anchor: Box, pop: Size, vp: Viewport, doc?: DocInfo): TourSide {
  return SIDE_ORDER.find((s) => sideFits(s, anchor, pop, vp, doc)) ?? 'bottom';
}

/** Zo ver blijft het pijltje van de rand van het anker; bij een klein anker het midden. */
function anchorInset(length: number): number {
  return Math.min(TOUR_ARROW_INSET, length / 2);
}

/**
 * Begin van de popover langs de kant (top of left): eerst binnen het venster [lo, hi] geschoven, dan begrensd tot
 * naast het anker, zodat het pijltje (minstens TOUR_ARROW_INSET van een hoek van de popover en van de rand van het
 * anker) nog naar het anker wijst. Die grens gaat voor: scrolt het anker uit beeld, dan gaat de popover mee, en een
 * zichtbaar pijltje wijst altijd naar een zichtbaar stuk anker.
 */
function slide(
  preferred: number,
  size: number,
  start: number,
  length: number,
  lo: number,
  hi: number,
): number {
  const inView = clamp(preferred, lo, hi - size);
  const reach = anchorInset(length) + TOUR_ARROW_INSET;
  return clamp(inView, start + reach - size, start + length - reach);
}

/** Pijltje zo dicht mogelijk bij `ref`, binnen de popover en binnen het anker; gemeten vanaf `popStart`. */
function arrowAt(ref: number, popStart: number, popSize: number, start: number, length: number): number {
  const inset = anchorInset(length);
  const lo = Math.max(popStart + TOUR_ARROW_INSET, start + inset);
  const hi = Math.min(popStart + popSize - TOUR_ARROW_INSET, start + length - inset);
  return clamp(ref, lo, hi) - popStart;
}

/**
 * Plaats van de popover aan een kant van het anker, vast aan die kant (zie de kop van dit bestand). Rechts of links:
 * een hoog anker (hoger dan de popover) bij de bovenkant, een laag anker gecentreerd; boven of onder: horizontaal
 * gecentreerd op het anker. Langs de kant binnen het venster en boven de strook onderaan, zolang het anker reikt.
 */
export function positionFor(side: TourSide, anchor: Box, pop: Size, vp: Viewport): TourPosition {
  if (side === 'right' || side === 'left') {
    const tall = anchor.height > pop.height;
    const refY = tall ? anchor.top + HEAD_OFFSET : anchor.top + anchor.height / 2;
    const bottom = vp.height - vp.bottomInset - TOUR_MARGIN;
    const top = slide(
      tall ? anchor.top : refY - pop.height / 2,
      pop.height,
      anchor.top,
      anchor.height,
      TOUR_MARGIN,
      bottom,
    );
    const left =
      side === 'right' ? anchor.left + anchor.width + TOUR_GAP : anchor.left - TOUR_GAP - pop.width;
    return { top, left, arrow: arrowAt(refY, top, pop.height, anchor.top, anchor.height) };
  }
  const refX = anchor.left + anchor.width / 2;
  const left = slide(
    refX - pop.width / 2,
    pop.width,
    anchor.left,
    anchor.width,
    TOUR_MARGIN,
    vp.width - TOUR_MARGIN,
  );
  const top = side === 'bottom' ? anchor.top + anchor.height + TOUR_GAP : anchor.top - TOUR_GAP - pop.height;
  return { top, left, arrow: arrowAt(refX, left, pop.width, anchor.left, anchor.width) };
}

/** Staat de popover op deze plek helemaal in het venster, boven de strook onderaan? */
export function popoverInView(pos: TourPosition, pop: Size, vp: Viewport): boolean {
  return (
    pos.top >= 0 &&
    pos.left >= 0 &&
    pos.top + pop.height <= vp.height - vp.bottomInset &&
    pos.left + pop.width <= vp.width
  );
}

/**
 * Scrollpositie (scrollY) voor een stap: het anker in het midden van het venster. Komt de popover onder of boven het
 * anker, dan anker en popover samen in het midden, zodat beide in beeld staan. Is dat geheel hoger dan het venster,
 * dan de bovenkant ervan net onder de rand. Begrensd tot [0, maxScroll].
 * `anchorTop` in documentcoördinaten; `bottomReserve` is de strook onderaan die vrij moet blijven.
 */
export function scrollTargetFor(
  side: TourSide,
  anchorTop: number,
  anchorHeight: number,
  pop: Size,
  viewportHeight: number,
  bottomReserve: number,
  maxScroll: number,
): number {
  let top: number;
  let bottom: number;
  if (side === 'bottom') {
    top = anchorTop;
    bottom = anchorTop + anchorHeight + TOUR_GAP + pop.height;
  } else if (side === 'top') {
    top = anchorTop - TOUR_GAP - pop.height;
    bottom = anchorTop + anchorHeight;
  } else {
    // naast het anker: het anker (of de popover, als die hoger is) in het midden
    const mid = anchorTop + anchorHeight / 2;
    const half = Math.max(anchorHeight, pop.height) / 2;
    top = mid - half;
    bottom = mid + half;
  }
  const room = viewportHeight - bottomReserve;
  const target = bottom - top <= room - 2 * TOUR_MARGIN ? (top + bottom) / 2 - room / 2 : top - TOUR_MARGIN;
  return Math.round(clamp(target, 0, maxScroll));
}
