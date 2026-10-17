// Rondleiding (UX-plan §8, WP-H): vijf stappen langs de ankers op de pagina (data-tour), teksten uit TOUR_STEPS. Een
// niet-modale popover naast het anker met titel, tekst, teller "n van 5" en de knoppen Vorige, Volgende (Klaar in de
// laatste stap) en Overslaan; een ring om het anker en een lichte dimming van de rest. Ring en dimming vangen geen
// klikken af: de pagina blijft bruikbaar, zodat je in stap 4 met de bufferschuif kunt schuiven.
// - Plaats (placement.ts): de popover zit vast aan zijn kant van het anker en bedekt het nooit. Scrol je, of groeit het
//   anker, dan gaat hij mee (ook uit beeld); langs de kant schuift hij binnen het venster en boven de balk onderaan,
//   zolang het anker reikt. De kant wordt opnieuw gekozen als het anker van maat verandert of de venstergrootte.
// - Scrollen: bij het openen van een stap het anker naar het midden (direct bij verminderde beweging); komt de popover
//   eronder, dan anker en popover samen. Staat het anker na een andere venstergrootte niet meer goed in beeld, dan
//   scrolt het terug.
// - Tabvolgorde (focusOrder.ts): de popover komt direct na zijn anker, niet aan het einde van de pagina.
// - Ontbreekt een anker, dan wordt die stap overgeslagen. Verdwijnt het tijdens een stap, dan gaat de rondleiding door
//   naar de volgende stap. Stap 1 en 2 klappen een ingeklapte Basis open: alleen UI-toestand, niet bewaard; na afloop
//   klapt hij weer in, tenzij je hem zelf open of dicht zette of er nog in werkt. Klap je de Basis in stap 1 of 2 zelf
//   in ("Bekijk het resultaat"), dan gaat de rondleiding door naar het resultaat en slaat hij het aandeel (in het
//   ingeklapte paneel) in deze ronde over, ook met Vorige. De rondleiding verandert nooit invoer.
// - Esc staat gelijk aan Overslaan; Overslaan en Klaar bewaren "gezien" (ps-rondleiding-v1). De focus gaat bij elke stap
//   naar de kop van de popover, behalve als de rondleiding vanzelf doorgaat (anker verdwenen) terwijl de focus op de
//   pagina staat. Na afloop met het toetsenbord vanuit de popover naar de knop Rondleiding (in beeld); na een muisklik
//   valt hij op de pagina (body), zodat een spatie scrolt in plaats van de rondleiding opnieuw te starten. Staat hij op
//   de pagina (bijv. op de bufferschuif), dan blijft hij daar en scrolt er niets.
// - Vanzelf starten alleen bij een eerste bezoek: niets bewaard, geen deellink, tourAutoStart aan (uit in de tests), de
//   eerste doorrekening klaar, geen telefoon of tablet, en je bent nog niet met de pagina bezig. De knop Rondleiding
//   start hem altijd opnieuw, ook als stap 1 al openstaat.
import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import u from '../../../../ui/ui.module.css';
import { tourSeen, useStore } from '../../store';
import { TOUR_STEPS, TOUR_TEXTS } from '../../texts';
import { prefersReducedMotion } from '../hooks';
import { MINI_BAR_BODY_CLASS, MINI_BAR_HEIGHT_PX } from '../result/MiniVerdictBar';
import { TOUR_BUTTON_ID } from '../shell/PageHeader';
import { SMALL_SCREEN_QUERY } from '../shell/SmallScreenNotice';
import { TOUR_ANCHORS, TOUR_ENABLED, tourSelector, type TourAnchor } from './anchors';
import { tourTabTarget } from './focusOrder';
import {
  chooseSide,
  fitsAcross,
  popoverInView,
  positionFor,
  scrollTargetFor,
  TOUR_MARGIN,
  TOUR_RING_PAD,
  type Box,
  type Size,
  type TourPosition,
  type TourSide,
  type Viewport,
} from './placement';
import css from './Tour.module.css';

/** Wachttijd tussen de eerste doorrekening en het vanzelf starten [ms]: eerst de pagina laten opbouwen. */
export const TOUR_AUTO_START_MS = 500;
/** Zo lang na de laatste wijziging van de venstergrootte wordt gekeken of het anker nog in beeld staat [ms]. */
export const TOUR_RESIZE_SETTLE_MS = 200;

/**
 * Hieraan is te zien dat je al met de pagina bezig bent: een toets, een klik of aanraking, het scrollwiel of een
 * gewijzigd veld. Dan start de rondleiding niet meer vanzelf (de knop Rondleiding blijft).
 */
const USER_EVENTS = ['keydown', 'pointerdown', 'wheel', 'input'] as const;

/**
 * Stap waar de rondleiding zelf naartoe ging omdat het anker verdween terwijl de focus op de pagina stond (bijv. op
 * H2 "Resultaat" na "Bekijk het resultaat"): die stap laat de focus staan. Gelezen bij het tekenen van die stap en
 * gewist bij het openen ervan.
 */
let keepFocusStep: number | null = null;

function anchorElement(anchor: TourAnchor): HTMLElement | null {
  return document.querySelector<HTMLElement>(tourSelector(anchor));
}

/** Ligt het element in de Basis? Die klapt de rondleiding zo nodig open. */
function inBasis(el: Element): boolean {
  return el.closest(tourSelector(TOUR_ANCHORS.basis)) !== null;
}

/**
 * Is stap `i` te tonen: het anker bestaat en staat niet in een verborgen deel? Een ingeklapte Basis klapt de rondleiding
 * open, behalve als je hem in deze ronde zelf inklapte: dan wordt de stap overgeslagen.
 */
function stepAvailable(i: number): boolean {
  const step = TOUR_STEPS[i];
  const el = step ? anchorElement(step.anchor) : null;
  if (el === null) return false;
  if (el.closest('[hidden]') === null) return true;
  return inBasis(el) && !useStore.getState().tourBasisClosed;
}

/** Eerste te tonen stap vanaf `from` (die zelf meegerekend) in richting `dir`; null als er geen is. */
export function findTourStep(from: number, dir: 1 | -1): number | null {
  for (let i = from; i >= 0 && i < TOUR_STEPS.length; i += dir) if (stepAvailable(i)) return i;
  return null;
}

/** Staat het element op de pagina en wordt het getoond? Zonder opmaak (jsdom) telt alleen het attribuut hidden. */
function shown(el: Element): boolean {
  if (!el.isConnected || el.closest('[hidden]') !== null) return false;
  return typeof el.checkVisibility === 'function' ? el.checkVisibility() : true;
}

/** Een veld waarin je typt of schuift (tekstveld, schuif, keuzelijst)? */
function isField(el: Element | null): boolean {
  return (
    el instanceof HTMLElement && (el.matches('input, select, textarea') || el.isContentEditable === true)
  );
}

/** Staat de focus op een element (niet "nergens", op body)? */
function hasFocusTarget(el: Element | null): el is Element {
  return el !== null && el !== document.body && el !== document.documentElement;
}

/** Een mediaquery; zonder matchMedia: nee. */
function mediaMatches(query: string): boolean {
  try {
    return window.matchMedia?.(query).matches ?? false;
  } catch {
    return false;
  }
}

/** Telefoon of tablet: dezelfde vraag als de melding bovenaan (SmallScreenNotice). */
function smallScreen(): boolean {
  return mediaMatches(SMALL_SCREEN_QUERY);
}

function boxOf(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/** Venster, zonder de balk met het oordeel onderaan als die staat. */
function viewport(): Viewport {
  const root = document.documentElement;
  return {
    width: root.clientWidth || window.innerWidth,
    height: root.clientHeight || window.innerHeight,
    bottomInset: document.body.classList.contains(MINI_BAR_BODY_CLASS) ? MINI_BAR_HEIGHT_PX : 0,
  };
}

/**
 * Eén keer per bezoek kijken of de rondleiding vanzelf mag starten, kort na de eerste doorrekening. Ben je dan al met
 * de pagina bezig (iets gedaan sinds het laden, of de focus in een veld), dan niet: de rondleiding zou de focus
 * wegnemen en de pagina laten scrollen terwijl je typt.
 */
function useAutoStart(): void {
  const ready = useStore((st) => st.analysis !== null);
  const auto = useStore((st) => st.tourAutoStart);
  const used = useRef(false);

  useEffect(() => {
    if (!TOUR_ENABLED || !auto) return;
    const mark = (): void => {
      used.current = true;
    };
    const opts = { capture: true, passive: true };
    for (const type of USER_EVENTS) document.addEventListener(type, mark, opts);
    return () => {
      for (const type of USER_EVENTS) document.removeEventListener(type, mark, opts);
    };
  }, [auto]);

  useEffect(() => {
    if (!TOUR_ENABLED || !auto || !ready) return;
    const t = window.setTimeout(() => {
      const st = useStore.getState();
      if (!st.tourAutoStart || st.tourStep !== null) return;
      // de vraag is gesteld: niet later in dit bezoek alsnog starten (ook niet als het antwoord nee is)
      useStore.setState({ tourAutoStart: false });
      if (used.current || isField(document.activeElement)) return;
      if (st.openedFromLink || tourSeen() || smallScreen() || findTourStep(0, 1) === null) return;
      st.startTour();
    }, TOUR_AUTO_START_MS);
    return () => window.clearTimeout(t);
  }, [auto, ready]);
}

/**
 * Kwam de laatste bediening van de muis of een aanraking (en niet van het toetsenbord)? Dan telt afsluiten met Esc als
 * afsluiten met de muis: de focus gaat niet naar de knop Rondleiding en de pagina springt niet naar boven.
 * (:focus-visible zegt dat niet: na een toets, ook Esc, telt elke focus als zichtbaar.)
 */
function usePointerLast(): { current: boolean } {
  const pointerLast = useRef(false);
  useEffect(() => {
    const onPointer = (): void => {
      pointerLast.current = true;
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') pointerLast.current = false;
    };
    const opts = { capture: true, passive: true };
    document.addEventListener('pointerdown', onPointer, opts);
    document.addEventListener('keydown', onKey, opts);
    return () => {
      document.removeEventListener('pointerdown', onPointer, opts);
      document.removeEventListener('keydown', onKey, opts);
    };
  }, []);
  return pointerLast;
}

export function Tour() {
  useAutoStart();
  const pointerLast = usePointerLast();
  const step = useStore((st) => st.tourStep);
  const run = useStore((st) => st.tourRun);

  // pagina verlaten tijdens de rondleiding: stoppen zonder "gezien" (een volgend bezoek start hem gewoon weer)
  useEffect(
    () => () => {
      if (useStore.getState().tourStep !== null) useStore.getState().endTour({ seen: false });
    },
    [],
  );

  if (!TOUR_ENABLED || step === null) return null;
  // een eigen exemplaar per stap en per start: meten, scrollen en de focus horen bij het openen van de stap, ook als de
  // knop Rondleiding stap 1 opnieuw opent
  return <TourStep key={`${run}-${step}`} index={step} pointerLast={pointerLast} />;
}

interface Nav {
  prev: number | null;
  next: number | null;
}

function TourStep({ index, pointerLast }: { index: number; pointerLast: { readonly current: boolean } }) {
  const step = TOUR_STEPS[index];
  const setTourStep = useStore((st) => st.setTourStep);
  const endTour = useStore((st) => st.endTour);
  const basisClosed = useStore((st) => st.tourBasisClosed);
  const id = useId();
  const popRef = useRef<HTMLDivElement>(null);
  const spotRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const sideRef = useRef<TourSide>('right');
  // maat van het anker waarbij de kant gekozen is: verandert die (groeit of krimpt het anker), dan opnieuw kiezen
  const chosenForRef = useRef<Size | null>(null);
  // laatste plaats en maat van de popover (ook zonder opmaak bekend, anders dan getBoundingClientRect in jsdom)
  const lastRef = useRef<{ pos: TourPosition; size: Size } | null>(null);
  // laatst bekende stand van tourBasisClosed: alleen inklappen tijdens deze stap telt (was hij al dicht toen de stap
  // opende, dan is dat geen reden om door te gaan)
  const basisClosedRef = useRef(basisClosed);
  // vorige en volgende te tonen stap; gezet bij het openen (dan is ook bekend welke ankers er zijn) en opnieuw als je
  // de Basis inklapt of weer opent
  const [nav, setNav] = useState<Nav | null>(null);
  // de stap is geopend (deel 1 klaar): daarna meten, scrollen, de focus en het meebewegen, één keer per stap
  const opened = nav !== null;
  // de focus laten staan (zie keepFocusStep); vast voor dit exemplaar
  const [keepFocus] = useState(() => keepFocusStep === index);

  /** Het getoonde anker van deze stap: het bekende, of opnieuw gezocht als dat weg of verborgen is; anders null. */
  const currentAnchor = (): HTMLElement | null => {
    const known = anchorRef.current;
    if (known && shown(known)) return known;
    const el = step ? anchorElement(step.anchor) : null;
    if (!el || !shown(el)) return null;
    if (el !== known) {
      if (known) observerRef.current?.unobserve(known);
      observerRef.current?.observe(el);
      anchorRef.current = el;
    }
    return el;
  };

  /**
   * Het anker is verdwenen: door naar de volgende te tonen stap, anders terug; is er geen, dan stoppen. Staat de focus
   * op de pagina (of zet de pagina hem zelf, `pageFocus`), dan laat de volgende stap hem daar; in de popover zou hij met
   * die popover verdwijnen.
   */
  const leave = (pageFocus = false): void => {
    const n = findTourStep(index + 1, 1) ?? findTourStep(index - 1, -1);
    if (n === null) {
      endTour({ seen: false });
      return;
    }
    const active = document.activeElement;
    keepFocusStep = pageFocus || (hasFocusTarget(active) && !popRef.current?.contains(active)) ? n : null;
    setTourStep(n);
  };

  /** Vorige en volgende te tonen stap bepalen; hetzelfde object als er niets veranderde (geen nieuwe weergave). */
  const updateNav = (): void => {
    const prev = findTourStep(index - 1, -1);
    const next = findTourStep(index + 1, 1);
    setNav((old) => (old && old.prev === prev && old.next === next ? old : { prev, next }));
  };

  const popSize = (pop: HTMLElement): Size => ({ width: pop.offsetWidth, height: pop.offsetHeight });

  /** Kant kiezen met de ligging in het document: onder of boven alleen als de pagina daar ook naartoe kan scrollen. */
  const choose = (box: Box, size: Size, vp: Viewport): void => {
    const doc = { anchorTop: box.top + window.scrollY, height: document.documentElement.scrollHeight };
    sideRef.current = chooseSide(box, size, vp, doc);
    chosenForRef.current = { width: box.width, height: box.height };
  };

  /**
   * Ring en popover op de plek van het anker zetten (zonder nieuwe weergave: ook bij elk scrollframe). De kant opnieuw
   * kiezen na een andere venstergrootte (`rechoose`), als het anker van maat veranderde of als de kant dwars niet meer
   * past; de popover blijft vast aan het anker en komt er nooit overheen.
   */
  const place = (rechoose = false): void => {
    const pop = popRef.current;
    const spot = spotRef.current;
    // bij het afdrukken zijn de onderdelen van Wat als? weg; de rondleiding staat niet op papier
    if (!pop || !spot || mediaMatches('print')) return;
    const el = currentAnchor();
    if (!el) {
      leave();
      return;
    }
    const box = boxOf(el);
    const vp = viewport();
    const size = popSize(pop);
    const chosen = chosenForRef.current;
    const resized =
      !chosen || Math.abs(chosen.width - box.width) >= 1 || Math.abs(chosen.height - box.height) >= 1;
    if (rechoose || resized || !fitsAcross(sideRef.current, box, size, vp)) choose(box, size, vp);
    const pos = positionFor(sideRef.current, box, size, vp);
    lastRef.current = { pos, size };
    pop.style.top = `${Math.round(pos.top)}px`;
    pop.style.left = `${Math.round(pos.left)}px`;
    pop.style.setProperty('--tour-arrow', `${Math.round(pos.arrow)}px`);
    pop.dataset.side = sideRef.current;
    pop.dataset.placed = '';
    // zonder maat (nog niet opgemaakt): geen ring op een lege plek
    const hidden = box.width === 0 && box.height === 0;
    spot.style.top = `${Math.round(box.top - TOUR_RING_PAD)}px`;
    spot.style.left = `${Math.round(box.left - TOUR_RING_PAD)}px`;
    spot.style.width = `${Math.round(box.width + 2 * TOUR_RING_PAD)}px`;
    spot.style.height = `${Math.round(box.height + 2 * TOUR_RING_PAD)}px`;
    if (hidden) delete spot.dataset.placed;
    else spot.dataset.placed = '';
  };

  /** Kant kiezen, het anker (met de popover) in beeld scrollen en plaatsen. */
  const reveal = (): void => {
    const el = currentAnchor();
    const pop = popRef.current;
    if (!el || !pop) {
      place();
      return;
    }
    const box = boxOf(el);
    const vp = viewport();
    const size = popSize(pop);
    const root = document.documentElement;
    choose(box, size, vp);
    const top = scrollTargetFor(
      sideRef.current,
      box.top + window.scrollY,
      box.height,
      size,
      vp.height,
      // de balk onderaan kan tijdens het scrollen verschijnen: altijd zijn ruimte vrijhouden
      MINI_BAR_HEIGHT_PX,
      root.scrollHeight - vp.height,
    );
    if (Math.abs(top - window.scrollY) >= 1)
      window.scrollTo?.({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    place();
  };

  /** Staan het anker (boven de balk onderaan) en de popover in beeld? */
  const stepInView = (): boolean => {
    const el = anchorRef.current;
    const last = lastRef.current;
    if (!el || !last) return true;
    const box = boxOf(el);
    const vp = viewport();
    const room = vp.height - vp.bottomInset;
    // een anker dat hoger is dan het venster: de bovenkant in beeld is genoeg
    const fits = box.top >= 0 && (box.top + box.height <= room || (box.height > room && box.top < room));
    return fits && popoverInView(last.pos, last.size, vp);
  };

  /**
   * De popover in beeld scrollen als hij (vast aan het anker) erbuiten staat: een vaste popover scrolt de browser bij
   * focus niet zelf in beeld. Met de ruimte voor de balk onderaan, net als reveal().
   */
  const bringIntoView = (): void => {
    const last = lastRef.current;
    if (!last) return;
    const vp = viewport();
    const above = last.pos.top - TOUR_MARGIN;
    const below = last.pos.top + last.size.height - (vp.height - MINI_BAR_HEIGHT_PX - TOUR_MARGIN);
    const delta = above < 0 ? above : below > 0 ? below : 0;
    if (delta === 0) return;
    window.scrollTo?.({ top: window.scrollY + delta, behavior: 'instant' });
    place();
  };

  // stap openen, deel 1: ontbreekt het anker, dan deze stap overslaan; ligt het in een ingeklapte Basis, dan die
  // openklappen (niet bewaard; niet als je hem in deze ronde zelf inklapte). Deel 2 meet pas daarna, als de Basis open
  // in de DOM staat.
  useLayoutEffect(() => {
    if (keepFocusStep === index) keepFocusStep = null;
    if (!stepAvailable(index)) {
      const n = findTourStep(index, 1) ?? findTourStep(index, -1);
      if (n !== null) {
        // de stap die hiervoor in de plaats komt, doet met de focus wat deze zou doen
        keepFocusStep = keepFocus ? n : null;
        setTourStep(n);
      } else endTour({ seen: false });
      return;
    }
    if (inBasis(anchorElement(step.anchor)!)) useStore.getState().openBasisForTour();
    updateNav();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateNav leest alleen de pagina en de store
  }, [index, step, setTourStep, endTour, keepFocus]);

  // deel 2: kant kiezen, scrollen, plaatsen en de focus op de kop
  useLayoutEffect(() => {
    if (!opened) return;
    const el = anchorElement(step.anchor);
    if (!el || !popRef.current) return;
    anchorRef.current = el;
    reveal();
    if (!keepFocus) headingRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen bij het openen van de stap
  }, [opened]);

  // je klapt de Basis zelf in tijdens stap 1 of 2 ("Bekijk het resultaat"): klaar met de Basis, dus door naar de
  // volgende stap buiten het ingeklapte paneel (het resultaat), zoals bij een verdwenen anker; de focus laat de
  // rondleiding aan die knop (H2 "Resultaat"). In een andere stap, of als je hem weer opent: Vorige en Volgende
  // opnieuw bepalen (het aandeel valt weg of komt terug).
  useLayoutEffect(() => {
    const was = basisClosedRef.current;
    basisClosedRef.current = basisClosed;
    if (basisClosed === was || !opened) return;
    const el = anchorRef.current ?? (step ? anchorElement(step.anchor) : null);
    if (basisClosed && el && inBasis(el)) leave(true);
    else updateNav();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen bij inklappen of weer openen
  }, [basisClosed]);

  // meebewegen: scrollen (ook in een scrollgebied), venstergrootte, het anker of de pagina die van maat verandert en de
  // balk onderaan die verschijnt of verdwijnt (klasse op de body). Na een andere venstergrootte het anker zo nodig weer
  // in beeld; een verdwenen anker merkt place() op.
  useEffect(() => {
    if (!opened) return;
    let frame = 0;
    let settle = 0;
    let rechoose = false;
    const schedule = (resize: boolean): void => {
      rechoose ||= resize;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        place(rechoose);
        rechoose = false;
      });
    };
    const onMove = (): void => schedule(false);
    const onResize = (): void => {
      schedule(true);
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        if (!stepInView()) reveal();
      }, TOUR_RESIZE_SETTLE_MS);
    };
    window.addEventListener('scroll', onMove, { passive: true, capture: true });
    window.addEventListener('resize', onResize);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onMove) : null;
    observerRef.current = ro;
    for (const el of [anchorRef.current, popRef.current, document.body]) if (el) ro?.observe(el);
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(onMove) : null;
    mo?.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      window.removeEventListener('scroll', onMove, { capture: true });
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      mo?.disconnect();
      observerRef.current = null;
    };
    // place en reveal lezen alleen refs: opnieuw koppelen hoeft alleen bij het openen van de stap
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  // Tab en Shift+Tab: de popover staat in de tabvolgorde direct na het anker (zie focusOrder.ts)
  useEffect(() => {
    if (!opened) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const pop = popRef.current;
      const anchor = currentAnchor();
      if (!pop || !anchor) return;
      const target = tourTabTarget(e.shiftKey, document.activeElement, anchor, pop);
      if (!target) return;
      e.preventDefault();
      if (!pop.contains(target)) {
        target.focus();
        return;
      }
      target.focus({ preventScroll: true });
      bringIntoView();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- leest alleen refs
  }, [opened]);

  /**
   * Afsluiten (Overslaan, Klaar of Esc): "gezien" bewaren. Met het toetsenbord vanuit de popover gaat de focus naar de
   * knop Rondleiding, in beeld. Met de muis (ook Esc na een muisklik) niet: die knop staat dan meestal buiten beeld,
   * zonder zichtbare focus, en een spatie om te scrollen zou de rondleiding opnieuw starten; de focus valt op de pagina
   * (body). Stond hij al op de pagina, dan blijft hij daar en scrolt er niets. Werk je nog in de Basis (de focus staat
   * erin), dan blijft die open; klapt hij weer in, dan blijft het onderdeel van deze stap op zijn plek.
   */
  const finish = (keyboard: boolean): void => {
    const active = document.activeElement;
    const inPopover = popRef.current?.contains(active) ?? false;
    const onPage = hasFocusTarget(active) && !inPopover;
    const anchor = anchorRef.current;
    const before = anchor?.isConnected && !inBasis(anchor) ? anchor.getBoundingClientRect().top : null;
    if (inPopover && !keyboard && active instanceof HTMLElement) active.blur();
    // direct tekenen: dan is te meten hoeveel een weer ingeklapte Basis de rest omhoog schoof
    flushSync(() => endTour({ keepBasis: onPage && inBasis(active) }));
    if (anchor && before !== null && anchor.isConnected) {
      const shift = anchor.getBoundingClientRect().top - before;
      if (Math.abs(shift) >= 1) window.scrollTo?.({ top: window.scrollY + shift, behavior: 'instant' });
    }
    if (keyboard && inPopover) document.getElementById(TOUR_BUTTON_ID)?.focus({ preventScroll: false });
  };

  // Esc = Overslaan, ook als de focus op de pagina staat (de popover is niet modaal)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      // na een muisklik (bijv. op Volgende) telt Esc als afsluiten met de muis; na Tab of Enter als toetsenbord
      finish(!pointerLast.current);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- finish gebruikt alleen refs en stabiele storeacties
  }, []);

  // klik met het toetsenbord (Enter of spatie) heeft detail 0
  const byKeyboard = (e: MouseEvent): boolean => e.detail === 0;
  const last = nav ? nav.next === null : index === TOUR_STEPS.length - 1;
  const titleId = `${id}-titel`;
  const textId = `${id}-tekst`;
  const counterId = `${id}-teller`;
  // stap buiten het bereik: het eerste effect zoekt een andere of stopt
  if (!step) return null;

  // de knoppen hebben tabIndex -1: Tab bereikt ze direct na het anker, niet op hun plek in de DOM (focusOrder.ts)
  return (
    <>
      <div ref={spotRef} className={`${css.spot} noPrint`} aria-hidden="true" data-testid="tour-spot" />
      <div
        ref={popRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        aria-describedby={`${counterId} ${textId}`}
        className={`${css.popover} noPrint`}
        data-testid="tour"
      >
        <span className={css.arrow} aria-hidden="true" />
        <div className={css.head}>
          <h2 id={titleId} ref={headingRef} tabIndex={-1} className={css.title}>
            {step.title}
          </h2>
          <span id={counterId} className={css.counter}>
            {TOUR_TEXTS.counter(index + 1, TOUR_STEPS.length)}
          </span>
        </div>
        <p id={textId} className={css.text}>
          {step.text}
        </p>
        <div className={css.actions}>
          {!last && (
            <button type="button" tabIndex={-1} className={css.skip} onClick={(e) => finish(byKeyboard(e))}>
              {TOUR_TEXTS.skip}
            </button>
          )}
          {nav?.prev != null && (
            <button
              type="button"
              tabIndex={-1}
              className={`${u.btn} ${css.prev}`}
              onClick={() => setTourStep(nav.prev!)}
            >
              {TOUR_TEXTS.previous}
            </button>
          )}
          {last ? (
            <button
              type="button"
              tabIndex={-1}
              className={`${u.btn} ${u.btnPrimary} ${css.next}`}
              onClick={(e) => finish(byKeyboard(e))}
            >
              {TOUR_TEXTS.done}
            </button>
          ) : (
            <button
              type="button"
              tabIndex={-1}
              className={`${u.btn} ${u.btnPrimary} ${css.next}`}
              onClick={() => nav?.next != null && setTourStep(nav.next)}
            >
              {TOUR_TEXTS.next}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
