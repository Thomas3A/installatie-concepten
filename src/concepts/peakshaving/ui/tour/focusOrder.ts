// Tabvolgorde van de rondleiding (UX-plan §8, WP-H). De popover staat in de DOM aan het einde van <main> (vast over de
// pagina), maar hoort in de tabvolgorde direct na zijn anker: in stap 4 is de bufferschuif dan met Shift+Tab vlakbij,
// en Tab vanaf het anker komt meteen in de popover. Zoals een niet-modale "floating focus manager": de knoppen van de
// popover hebben tabIndex -1 (de browser slaat ze op hun plek in de DOM over, zodat Tab aan het einde van de pagina
// gewoon de pagina verlaat), en Tour.tsx stuurt Tab en Shift+Tab op de grenzen zelf:
// - laatste stop in (of vóór) het anker → Tab → eerste knop van de popover;
// - eerste stop na het anker → Shift+Tab → laatste knop van de popover;
// - in de popover van knop naar knop; voorbij de laatste naar de eerste stop na het anker, vóór de eerste (of vanaf de
//   kop) naar de laatste stop in het anker.
// Alleen DOM-volgorde en zichtbaarheid; zonder opmaak (jsdom) tellen het attribuut hidden, inert en dichte <details>.

const CANDIDATES =
  'a[href], area[href], button, input, select, textarea, summary, iframe, [tabindex], [contenteditable]';

/** Wordt het element getoond (geen hidden of inert erboven, niet in een dichte <details> behalve de summary)? */
function rendered(el: Element): boolean {
  if (!el.isConnected || el.closest('[hidden], [inert]') !== null) return false;
  for (let d = el.parentElement?.closest('details'); d; d = d.parentElement?.closest('details')) {
    if (d.open) continue;
    const summary = d.querySelector(':scope > summary');
    if (!summary?.contains(el)) return false;
  }
  return typeof el.checkVisibility === 'function' ? el.checkVisibility({ visibilityProperty: true }) : true;
}

/** tabIndex zoals de browser hem gebruikt; de summary van een <details> is zonder attribuut een tabstop. */
function tabIndexOf(el: HTMLElement): number {
  if (el.localName === 'summary' && !el.hasAttribute('tabindex')) {
    const d = el.parentElement;
    return d?.localName === 'details' && d.querySelector(':scope > summary') === el ? 0 : -1;
  }
  return el.tabIndex;
}

/** Bereikt Tab dit element: tabIndex ≥ 0, niet uitgeschakeld, getoond? */
export function isTabbable(el: HTMLElement): boolean {
  if (tabIndexOf(el) < 0 || el.matches(':disabled')) return false;
  if (el instanceof HTMLInputElement && el.type === 'hidden') return false;
  return rendered(el);
}

/** Alle tabstops in DOM-volgorde, zonder die in `skip`. */
export function tabbables(root: ParentNode, skip?: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(CANDIDATES)).filter(
    (el) => !skip?.contains(el) && isTabbable(el),
  );
}

/** De knoppen van de popover, in volgorde (ze hebben tabIndex -1, zie boven). */
export function popoverControls(pop: Element): HTMLElement[] {
  return Array.from(pop.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea')).filter(
    (el) => !el.matches(':disabled') && rendered(el),
  );
}

/** Ligt het element vóór de plek van de popover in de tabvolgorde: in het anker of ervoor? */
function beforeSlot(el: Node, anchor: Element): boolean {
  return anchor.contains(el) || (anchor.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
}

function hasFocusTarget(el: Element | null): el is Element {
  return el !== null && el !== document.body && el !== document.documentElement;
}

/**
 * Waar Tab (of met `back` Shift+Tab) de focus heen moet zetten in plaats van de browser; null = de browser doet het
 * zelf (geen grens van de popover in de buurt, of de focus staat nergens).
 */
export function tourTabTarget(
  back: boolean,
  active: Element | null,
  anchor: Element,
  pop: Element,
): HTMLElement | null {
  const controls = popoverControls(pop);
  if (controls.length === 0) return null;
  const page = tabbables(document, pop);
  if (active !== null && pop.contains(active)) {
    const i = controls.indexOf(active as HTMLElement);
    if (back) return i > 0 ? controls[i - 1] : (page.filter((el) => beforeSlot(el, anchor)).at(-1) ?? null);
    // vanaf de kop (geen knop) naar de eerste knop
    return i < 0 ? controls[0] : (controls[i + 1] ?? page.find((el) => !beforeSlot(el, anchor)) ?? null);
  }
  if (!hasFocusTarget(active)) return null;
  if (back) {
    if (beforeSlot(active, anchor)) return null;
    const prev = page
      .filter((el) => active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING)
      .at(-1);
    // de vorige stop ligt vóór de plek (of er is er geen): eerst de popover
    return prev === undefined || beforeSlot(prev, anchor) ? controls[controls.length - 1] : null;
  }
  if (!beforeSlot(active, anchor)) return null;
  const next = page.find((el) => active.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
  return next === undefined || !beforeSlot(next, anchor) ? controls[0] : null;
}
