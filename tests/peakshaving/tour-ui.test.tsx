// @vitest-environment jsdom
// Rondleiding (UX-plan §8, WP-H): vanzelf starten alleen bij een eerste bezoek (niets bewaard, geen deellink,
// tourAutoStart aan, eerste doorrekening klaar, geen telefoon of tablet) en niet als je al met de pagina bezig bent;
// Volgende, Vorige, Overslaan, Esc en Klaar; "gezien" bewaard; opnieuw starten met de knop, ook vanuit stap 1; een
// ontbrekend of verdwijnend anker wordt overgeslagen; stap 1 klapt een ingeklapte Basis open zonder dat te bewaren en
// klapt hem na afloop weer in; zelf ingeklapt ("Bekijk het resultaat") gaat de rondleiding door naar het resultaat; de
// invoer verandert nooit; de focus naar de kop van de popover en na afloop met het toetsenbord naar de knop, met de muis
// niet (een spatie scrolt dan); de popover in de tabvolgorde direct na zijn anker; vast aan het anker bij scrollen en
// een groeiend anker; na een andere venstergrootte het anker weer in beeld. Daarnaast de plaatsing van de popover (pure
// functies) op de gemeten maten van 1280×800 tot 1920×1080.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultInput } from '../../src/concepts/peakshaving/data/defaults';
import { encodeInput } from '../../src/concepts/peakshaving/share';
import { configureEngine, useStore } from '../../src/concepts/peakshaving/store';
import { TOUR_STEPS } from '../../src/concepts/peakshaving/texts';
import PeakshavingPage from '../../src/concepts/peakshaving/ui/PeakshavingPage';
import { RESULT_HEADING_ID } from '../../src/concepts/peakshaving/ui/result/VerdictCard';
import { TOUR_BUTTON_ID } from '../../src/concepts/peakshaving/ui/shell/PageHeader';
import { SMALL_SCREEN_QUERY } from '../../src/concepts/peakshaving/ui/shell/SmallScreenNotice';
import {
  MINI_BAR_BODY_CLASS,
  MINI_BAR_HEIGHT_PX,
} from '../../src/concepts/peakshaving/ui/result/MiniVerdictBar';
import { STORAGE_KEYS } from '../../src/concepts/peakshaving/ui/storage';
import { TOUR_ENABLED } from '../../src/concepts/peakshaving/ui/tour/anchors';
import {
  chooseSide,
  fitsAcross,
  popoverInView,
  positionFor,
  scrollTargetFor,
  TOUR_ARROW_INSET,
  TOUR_GAP,
  TOUR_MARGIN,
  type Box,
  type Size,
  type Viewport,
} from '../../src/concepts/peakshaving/ui/tour/placement';
import { TOUR_AUTO_START_MS, TOUR_RESIZE_SETTLE_MS } from '../../src/concepts/peakshaving/ui/tour/Tour';

// uPlot tekent op canvas; jsdom heeft geen canvas, dus een lege stand-in
vi.mock('uplot', () => {
  class FakePlot {
    over = document.createElement('div');
    ctx = { canvas: document.createElement('canvas') };
    cursor = { idx: null };
    series = [];
    constructor(_opts: unknown, _data: unknown, el: HTMLElement) {
      el.appendChild(this.over);
    }
    setData(): void {}
    setSize(): void {}
    setScale(): void {}
    setSeries(): void {}
    redraw(): void {}
    destroy(): void {}
    posToVal(): number {
      return 0;
    }
    valToPos(): number {
      return 0;
    }
    static paths = { stepped: () => undefined, bars: () => undefined, linear: () => undefined };
  }
  return { default: FakePlot };
});

const scrollToSpy = vi.fn();

beforeAll(() => {
  class RO {
    observe(): void {}
    disconnect(): void {}
    unobserve(): void {}
  }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
  // jsdom kent scrollIntoView niet en scrollTo alleen als melding "not implemented"
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = scrollToSpy as unknown as typeof window.scrollTo;
});

beforeEach(() => {
  // eerste bezoek: niets bewaard, de Basis open, geen rondleiding
  localStorage.clear();
  scrollToSpy.mockClear();
  configureEngine({ mainThread: true });
  act(() => {
    useStore.getState().applyScenario('woning-basis');
    useStore.setState({
      basisOpen: true,
      openedFromLink: false,
      reveal: null,
      ownInput: null,
      undo: null,
      notice: null,
      tab: 'concept',
      tourStep: null,
      tourOpenedBasis: false,
      tourBasisClosed: false,
      tourAutoStart: false,
    });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.body.classList.remove(MINI_BAR_BODY_CLASS);
  delete (window as { matchMedia?: unknown }).matchMedia;
  delete (document.documentElement as { scrollHeight?: unknown }).scrollHeight;
  // jsdom scrolt niet: scrollY is altijd 0
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
});

const st = () => useStore.getState();

function renderPage(path = '/peakshaving') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PeakshavingPage />
    </MemoryRouter>,
  );
}

const waitForResult = (): Promise<unknown> =>
  waitFor(() => expect(st().analysis).not.toBeNull(), { timeout: 20000 });

/** Lang genoeg wachten om zeker te zijn dat de rondleiding níet vanzelf start. */
const waitPastAutoStart = (): Promise<void> =>
  act(() => new Promise<void>((r) => setTimeout(r, TOUR_AUTO_START_MS + 250)));

/** Eén beeldje verder: de popover volgt scrollen en maten per frame. */
const nextFrame = (): Promise<void> => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

const dialog = (): HTMLElement => screen.getByRole('dialog');
const queryDialog = (): HTMLElement | null => screen.queryByRole('dialog');
const tourButton = (): HTMLElement => screen.getByRole('button', { name: 'Rondleiding' });
const inDialog = (name: string): HTMLElement => within(dialog()).getByRole('button', { name });
const heading = (): HTMLElement => within(dialog()).getByRole('heading', { level: 2 });
const title = (): string => heading().textContent ?? '';
const bufferField = (): HTMLElement =>
  within(document.querySelector<HTMLElement>('[data-tour="buffer"]')!).getByRole('textbox', {
    name: 'Buffervolume',
  });
const basisPanelField = (): HTMLElement => screen.getByLabelText('Piekvermogen verwarming');

function pressEscape(target: Element): void {
  act(() => {
    fireEvent.keyDown(target, { key: 'Escape' });
  });
}

/** Klik zonder aanwijzer: zo komt een klik van Enter of spatie op een knop binnen (detail 0). */
function click(el: HTMLElement): void {
  act(() => {
    fireEvent.click(el);
  });
}

/** Klik met de muis zoals in Chromium: pointerdown, de knop krijgt de focus, dan een klik met detail 1. */
function clickMouse(el: HTMLElement): void {
  act(() => {
    fireEvent.pointerDown(el);
    el.focus();
    fireEvent.click(el, { detail: 1 });
  });
}

/** Spatie zoals de browser: op een knop een klik (detail 0), elders scrolt de pagina (hier: niets). */
function pressSpace(): void {
  const el = document.activeElement ?? document.body;
  act(() => {
    const go = fireEvent.keyDown(el, { key: ' ', code: 'Space' });
    fireEvent.keyUp(el, { key: ' ', code: 'Space' });
    if (go && el instanceof HTMLButtonElement) fireEvent.click(el);
  });
}

/** Ligt het element in een dichte <details> (behalve de summary)? Dan is het niet te zien en geen tabstop. */
function inClosedDetails(el: Element): boolean {
  for (let d = el.parentElement?.closest('details'); d; d = d.parentElement?.closest('details'))
    if (!d.open && !d.querySelector(':scope > summary')?.contains(el)) return true;
  return false;
}

/** De tabstops zoals de browser ze kent (jsdom kent geen tabvolgorde): DOM-volgorde, tabIndex ≥ 0, zichtbaar. */
function browserTabStops(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [tabindex]'),
  ).filter(
    (el) =>
      el.tabIndex >= 0 &&
      !el.matches(':disabled') &&
      el.closest('[hidden]') === null &&
      !inClosedDetails(el) &&
      !(el instanceof HTMLInputElement && el.type === 'hidden'),
  );
}

/** Tab (of Shift+Tab) zoals de browser: eerst de toets naar de pagina; houdt die hem niet tegen, de volgende tabstop. */
function pressTab(shift = false): void {
  const from = document.activeElement ?? document.body;
  act(() => {
    if (!fireEvent.keyDown(from, { key: 'Tab', shiftKey: shift })) return;
    const stops = browserTabStops();
    const next = shift
      ? stops.filter((el) => from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING).at(-1)
      : stops.find((el) => from.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    next?.focus();
  });
}

/** Maat van de popover zoals in Chromium gemeten (jsdom maakt niets op). */
function sizePopover(width = 340, height = 160): void {
  const d = dialog();
  Object.defineProperty(d, 'offsetWidth', { configurable: true, value: width });
  Object.defineProperty(d, 'offsetHeight', { configurable: true, value: height });
}

/** Plaats van de popover zoals de rondleiding hem zette, met zijn maat. */
function popBox(): Box {
  const d = dialog();
  return {
    top: parseFloat(d.style.top),
    left: parseFloat(d.style.left),
    width: d.offsetWidth,
    height: d.offsetHeight,
  };
}

/** Plaats van het pijltje in het venster, langs de rand naar het anker (rechts of links: y; onder of boven: x). */
function arrowAt(): number {
  const d = dialog();
  const arrow = parseFloat(d.style.getPropertyValue('--tour-arrow'));
  const p = popBox();
  return d.dataset.side === 'right' || d.dataset.side === 'left' ? p.top + arrow : p.left + arrow;
}

/** Eén beeldje na scrollen (of een anker dat van maat verandert): de popover beweegt mee. */
async function moved(): Promise<void> {
  act(() => {
    fireEvent.scroll(window);
  });
  await nextFrame();
}

/** matchMedia met alleen deze queries op "waar"; de rest (ook verminderde beweging) "onwaar". */
function mockMedia(matching: string[]): void {
  window.matchMedia = ((query: string) => ({
    matches: matching.includes(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/** Anker op de gegeven plek in het venster van 1024×768 (jsdom), in een document van 3000 px. */
function placeAnchor(anchor: string, top: number, height: number, left = 16, width = 600): Box {
  Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 3000 });
  const el = document.querySelector<HTMLElement>(`[data-tour="${anchor}"]`)!;
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    top,
    left,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  });
  return { top, left, width, height };
}

describe('Rondleiding: aan en de knop in de kop', () => {
  it('TOUR_ENABLED staat aan; de knop Rondleiding staat in de kop met een vast id', () => {
    expect(TOUR_ENABLED).toBe(true);
    renderPage();
    const header = screen.getByRole('heading', { level: 1 }).closest('header')!;
    expect(within(header).getByRole('button', { name: 'Rondleiding' }).id).toBe(TOUR_BUTTON_ID);
    expect(queryDialog()).toBeNull();
  });
});

describe('Rondleiding: vanzelf starten', () => {
  it('eerste bezoek: start na de eerste doorrekening, één keer per bezoek', async () => {
    useStore.setState({ tourAutoStart: true });
    renderPage();
    await waitForResult();
    await waitFor(() => expect(queryDialog()).not.toBeNull(), { timeout: 5000 });
    expect(st().tourStep).toBe(0);
    expect(title()).toBe(TOUR_STEPS[0].title);
    // de vraag is gesteld: niet nog eens in dit bezoek
    expect(st().tourAutoStart).toBe(false);
    // niets bewaard zolang de rondleiding loopt
    expect(localStorage.getItem(STORAGE_KEYS.tour)).toBeNull();
  }, 30000);

  it('niet in de testmodus (tourAutoStart uit)', async () => {
    expect(st().tourAutoStart).toBe(false);
    renderPage();
    await waitForResult();
    await waitPastAutoStart();
    expect(queryDialog()).toBeNull();
    expect(st().tourStep).toBeNull();
  }, 30000);

  it('niet als ps-rondleiding-v1 al bewaard is', async () => {
    localStorage.setItem(STORAGE_KEYS.tour, 'gezien');
    useStore.setState({ tourAutoStart: true });
    renderPage();
    await waitForResult();
    await waitPastAutoStart();
    expect(queryDialog()).toBeNull();
    expect(st().tourAutoStart).toBe(false);
  }, 30000);

  it('niet via een deellink (?c=)', async () => {
    useStore.setState({ tourAutoStart: true });
    const input = defaultInput('residential');
    input.buffer.volumeM3 = 0.5;
    renderPage(`/peakshaving?c=${encodeInput(input)}`);
    await waitFor(() => expect(st().input.buffer.volumeM3).toBe(0.5));
    expect(st().openedFromLink).toBe(true);
    await waitForResult();
    await waitPastAutoStart();
    expect(queryDialog()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.tour)).toBeNull();
  }, 30000);

  it('niet op een telefoon of tablet (zelfde mediaquery als de melding bovenaan)', async () => {
    const shellCss = readFileSync(
      resolve(process.cwd(), 'src/concepts/peakshaving/ui/shell/Shell.module.css'),
      'utf8',
    );
    expect(shellCss).toContain(`@media ${SMALL_SCREEN_QUERY} {`);
    mockMedia([SMALL_SCREEN_QUERY]);
    useStore.setState({ tourAutoStart: true });
    renderPage();
    await waitForResult();
    await waitPastAutoStart();
    expect(queryDialog()).toBeNull();
    // de knop werkt wel
    click(tourButton());
    expect(queryDialog()).not.toBeNull();
  }, 30000);

  it('niet zolang de eerste doorrekening er niet is', async () => {
    useStore.setState({ tourAutoStart: true, analysis: null, busy: true });
    configureEngine({
      mainThread: true,
      // rekent nooit af: de eerste doorrekening blijft uit
      createEngine: () =>
        ({ handle: () => new Promise(() => {}), climate: () => new Promise(() => {}) }) as never,
    });
    renderPage();
    await waitPastAutoStart();
    expect(queryDialog()).toBeNull();
    expect(st().tourAutoStart).toBe(true);
    configureEngine({ mainThread: true });
  });

  it('niet als de focus in een veld staat als het zover is: je typt verder, de pagina scrolt niet', async () => {
    useStore.setState({ tourAutoStart: true });
    renderPage();
    await waitForResult();
    // de wachttijd loopt nog: je klikt (zonder pointer-gebeurtenis, alleen de focus) in het eerste veld
    const field = basisPanelField();
    expect(field.tagName).toBe('INPUT');
    field.focus();
    scrollToSpy.mockClear();
    await waitPastAutoStart();
    expect(queryDialog()).toBeNull();
    expect(document.activeElement).toBe(field);
    expect(scrollToSpy).not.toHaveBeenCalled();
    // de vraag is gesteld; niets bewaard, dus een volgend bezoek probeert het weer
    expect(st().tourAutoStart).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.tour)).toBeNull();
    // de knop werkt wel
    click(tourButton());
    expect(queryDialog()).not.toBeNull();
  }, 30000);

  it.each([
    ['een toets', (el: Element) => fireEvent.keyDown(el, { key: '1' })],
    ['een klik', (el: Element) => fireEvent.pointerDown(el)],
    ['het scrollwiel', (el: Element) => fireEvent.wheel(el)],
    ['een gewijzigd veld', (el: Element) => fireEvent.input(el)],
  ])(
    'niet als je sinds het laden al bezig was (%s), ook als de focus niet meer in een veld staat',
    async (_, use) => {
      useStore.setState({ tourAutoStart: true });
      renderPage();
      // vóór of tijdens de eerste doorrekening, daarna de focus weer weg (bijv. buiten een veld geklikt)
      act(() => {
        use(basisPanelField());
      });
      await waitForResult();
      expect(document.activeElement).toBe(document.body);
      await waitPastAutoStart();
      expect(queryDialog()).toBeNull();
      expect(st().tourAutoStart).toBe(false);
      expect(localStorage.getItem(STORAGE_KEYS.tour)).toBeNull();
    },
    30000,
  );
});

describe('Rondleiding: stappen en knoppen', () => {
  it('popover: niet modaal, kop en tekst gekoppeld, teller "n van 5"; ring en popover niet op papier', async () => {
    renderPage();
    await waitForResult();
    click(tourButton());
    const d = dialog();
    expect(d.getAttribute('aria-modal')).toBe('false');
    const h = within(d).getByRole('heading', { level: 2, name: 'Basis' });
    expect(d.getAttribute('aria-labelledby')).toBe(h.id);
    const described = d.getAttribute('aria-describedby')!.split(' ');
    const texts = described.map((id) => document.getElementById(id)?.textContent);
    expect(texts).toEqual(['1 van 5', TOUR_STEPS[0].text]);
    expect(d.classList.contains('noPrint')).toBe(true);
    const spot = screen.getByTestId('tour-spot');
    expect(spot.getAttribute('aria-hidden')).toBe('true');
    expect(spot.classList.contains('noPrint')).toBe(true);
    // geen getallen in de teksten (§8): ze kloppen bij elke invoer; de titels zonder het stapnummer van de pagina,
    // want naast de teller "n van 5" zou dat een tweede, ander nummer zijn ("2 · Resultaat" bij "3 van 5")
    for (const s of TOUR_STEPS) {
      expect(s.text).not.toMatch(/\d/);
      expect(s.title).not.toMatch(/\d/);
    }
    expect(TOUR_STEPS.map((s) => s.title)).toEqual([
      'Basis',
      'WP-limiet',
      'Resultaat',
      'Wat als?',
      'Batterij en aansluiting',
    ]);
    // stap 1: geen Vorige, wel Overslaan en Volgende
    const names = within(d)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names).toEqual(['Overslaan', 'Volgende']);
  }, 30000);

  it('Volgende en Vorige lopen door de vijf stappen; de laatste heeft Klaar en geen Overslaan', async () => {
    renderPage();
    await waitForResult();
    click(tourButton());
    const seen: string[] = [];
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      seen.push(`${title()} · ${within(dialog()).getByText(/van 5$/).textContent}`);
      // het anker van de stap bestaat op de pagina
      expect(document.querySelector(`[data-tour="${TOUR_STEPS[i].anchor}"]`)).not.toBeNull();
      if (i < TOUR_STEPS.length - 1) click(inDialog('Volgende'));
    }
    expect(seen).toEqual(TOUR_STEPS.map((s, i) => `${s.title} · ${i + 1} van 5`));
    const names = within(dialog())
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names).toEqual(['Vorige', 'Klaar']);
    click(inDialog('Vorige'));
    expect(title()).toBe(TOUR_STEPS[3].title);
    expect(st().tourStep).toBe(3);
    click(inDialog('Vorige'));
    click(inDialog('Vorige'));
    click(inDialog('Vorige'));
    expect(title()).toBe(TOUR_STEPS[0].title);
    expect(within(dialog()).queryByRole('button', { name: 'Vorige' })).toBeNull();
    // nog niets bewaard
    expect(localStorage.getItem(STORAGE_KEYS.tour)).toBeNull();
  }, 30000);

  it('Klaar (met het toetsenbord) sluit, bewaart "gezien" en zet de focus terug op de knop Rondleiding', async () => {
    renderPage();
    await waitForResult();
    click(tourButton());
    for (let i = 1; i < TOUR_STEPS.length; i++) click(inDialog('Volgende'));
    click(inDialog('Klaar'));
    expect(queryDialog()).toBeNull();
    expect(screen.queryByTestId('tour-spot')).toBeNull();
    expect(st().tourStep).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.tour)).toBe('gezien');
    expect(document.activeElement).toBe(tourButton());
  }, 30000);

  it('Overslaan sluit en bewaart "gezien"; de knop start de rondleiding opnieuw bij stap 1', async () => {
    renderPage();
    await waitForResult();
    click(tourButton());
    click(inDialog('Volgende'));
    click(inDialog('Overslaan'));
    expect(queryDialog()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.tour)).toBe('gezien');
    expect(document.activeElement).toBe(tourButton());
    // opnieuw, ook nu "gezien" bewaard is
    click(tourButton());
    expect(title()).toBe(TOUR_STEPS[0].title);
    expect(st().tourStep).toBe(0);
  }, 30000);

  it('Esc staat gelijk aan Overslaan, ook met de focus op de pagina; die focus blijft dan staan', async () => {
    renderPage();
    await waitForResult();
    click(tourButton());
    click(inDialog('Volgende'));
    click(inDialog('Volgende'));
    click(inDialog('Volgende'));
    // stap 4: de bufferschuif blijft te bedienen; je werkt in het veld en drukt Esc
    const field = bufferField();
    field.focus();
    const focusSpy = vi.spyOn(tourButton(), 'focus');
    scrollToSpy.mockClear();
    pressEscape(field);
    expect(queryDialog()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.tour)).toBe('gezien');
    // de focus blijft op het veld en de pagina scrolt niet (geen sprong naar de knop bovenaan)
    expect(document.activeElement).toBe(field);
    expect(focusSpy).not.toHaveBeenCalled();
    expect(scrollToSpy).not.toHaveBeenCalled();
  }, 30000);

  it('Esc vanuit de popover na het toetsenbord: de focus naar de knop Rondleiding, in beeld; na een muisklik of zonder focus niet', async () => {
    renderPage();
    await waitForResult();
    const focusSpy = vi.spyOn(tourButton(), 'focus');
    // met het toetsenbord (Enter op Volgende): de focus op de kop van de popover; Esc zet de knop in beeld
    click(tourButton());
    act(() => {
      fireEvent.keyDown(inDialog('Volgende'), { key: 'Enter' });
    });
    click(inDialog('Volgende'));
    expect(document.activeElement).toBe(heading());
    pressEscape(heading());
    expect(queryDialog()).toBeNull();
    expect(document.activeElement).toBe(tourButton());
    expect(focusSpy).toHaveBeenLastCalledWith({ preventScroll: false });

    // met de muis op Volgende geklikt, dan Esc: geen focus op de knop (die staat buiten beeld, zonder zichtbare focus);
    // de focus valt op de pagina, zodat een spatie scrolt
    click(tourButton());
    focusSpy.mockClear();
    clickMouse(inDialog('Volgende'));
    expect(document.activeElement).toBe(heading());
    pressEscape(heading());
    expect(queryDialog()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.tour)).toBe('gezien');
    expect(document.activeElement).toBe(document.body);
    expect(focusSpy).not.toHaveBeenCalled();
    pressSpace();
    expect(queryDialog()).toBeNull();

    // nergens (body), bijv. na een klik in de tekst van de pagina: blijft nergens, de pagina scrolt niet
    click(tourButton());
    click(inDialog('Volgende'));
    act(() => heading().blur());
    expect(document.activeElement).toBe(document.body);
    scrollToSpy.mockClear();
    pressEscape(document.body);
    expect(queryDialog()).toBeNull();
    expect(document.activeElement).toBe(document.body);
    expect(focusSpy).not.toHaveBeenCalled();
    expect(scrollToSpy).not.toHaveBeenCalled();
  }, 30000);

  it('met de muis afgesloten (Overslaan of Klaar): de focus valt op de pagina en een spatie start de rondleiding niet opnieuw', async () => {
    renderPage();
    await waitForResult();
    const focusSpy = vi.spyOn(tourButton(), 'focus');
    // vanzelf gestart (hier met de knop) en meteen met de muis overgeslagen
    click(tourButton());
    clickMouse(inDialog('Overslaan'));
    expect(queryDialog()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.tour)).toBe('gezien');
    expect(document.activeElement).toBe(document.body);
    expect(focusSpy).not.toHaveBeenCalled();
    // de spatie (om te scrollen) drukt geen knop in
    pressSpace();
    expect(queryDialog()).toBeNull();
    expect(st().tourStep).toBeNull();

    // de hele rondleiding met de muis en Klaar: idem, en de pagina springt niet naar de knop bovenaan
    clickMouse(tourButton());
    for (let i = 1; i < TOUR_STEPS.length; i++) clickMouse(inDialog('Volgende'));
    focusSpy.mockClear();
    scrollToSpy.mockClear();
    clickMouse(inDialog('Klaar'));
    expect(queryDialog()).toBeNull();
    expect(document.activeElement).toBe(document.body);
    expect(focusSpy).not.toHaveBeenCalled();
    expect(scrollToSpy).not.toHaveBeenCalled();
    pressSpace();
    expect(st().tourStep).toBeNull();

    // ter vergelijking het toetsenbord (Enter op Overslaan, klik met detail 0): de focus op de knop Rondleiding, in
    // beeld en dus zichtbaar; daar start een spatie de rondleiding bewust opnieuw
    click(tourButton());
    click(inDialog('Overslaan'));
    expect(document.activeElement).toBe(tourButton());
    expect(focusSpy).toHaveBeenLastCalledWith({ preventScroll: false });
    pressSpace();
    expect(st().tourStep).toBe(0);
  }, 30000);

  it('de knop Rondleiding in stap 1 toont stap 1 opnieuw: weer scrollen en de focus op de kop', async () => {
    renderPage();
    await waitForResult();
    placeAnchor('basis', 900, 300);
    click(tourButton());
    const first = heading();
    expect(document.activeElement).toBe(first);
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    // weggescrold en met de focus elders: de knop nog eens
    scrollToSpy.mockClear();
    tourButton().focus();
    click(tourButton());
    expect(st().tourStep).toBe(0);
    expect(heading()).not.toBe(first);
    expect(document.activeElement).toBe(heading());
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
  }, 30000);
});

describe('Rondleiding: focus', () => {
  it('bij elke stap op de kop van de popover; met het toetsenbord na afloop terug naar de knop', async () => {
    renderPage();
    await waitForResult();
    tourButton().focus();
    click(tourButton());
    for (let i = 0; i < TOUR_STEPS.length; i++) {
      const heading = within(dialog()).getByRole('heading', { level: 2 });
      expect(document.activeElement).toBe(heading);
      expect(heading.getAttribute('tabindex')).toBe('-1');
      click(inDialog(i < TOUR_STEPS.length - 1 ? 'Volgende' : 'Klaar'));
    }
    expect(document.activeElement).toBe(tourButton());
  }, 30000);
});

describe('Rondleiding: ankers en invoer', () => {
  it('een ontbrekend anker: die stap wordt overgeslagen, vooruit en terug', async () => {
    renderPage();
    await waitForResult();
    document.querySelector('[data-tour="budget"]')!.removeAttribute('data-tour');
    click(tourButton());
    click(inDialog('Volgende'));
    expect(title()).toBe(TOUR_STEPS[2].title);
    expect(within(dialog()).getByText('3 van 5')).toBeTruthy();
    click(inDialog('Vorige'));
    expect(title()).toBe(TOUR_STEPS[0].title);
  }, 30000);

  it('ontbreekt het laatste anker, dan is de stap ervoor de laatste (Klaar)', async () => {
    renderPage();
    await waitForResult();
    document.querySelector('[data-tour="battery-connection"]')!.removeAttribute('data-tour');
    click(tourButton());
    click(inDialog('Volgende'));
    click(inDialog('Volgende'));
    click(inDialog('Volgende'));
    expect(title()).toBe(TOUR_STEPS[3].title);
    expect(within(dialog()).queryByRole('button', { name: 'Volgende' })).toBeNull();
    click(inDialog('Klaar'));
    expect(localStorage.getItem(STORAGE_KEYS.tour)).toBe('gezien');
  }, 30000);

  it('ontbreekt het eerste anker, dan begint de rondleiding bij de volgende stap', async () => {
    renderPage();
    await waitForResult();
    // zonder anker "basis" telt het aandeel als gewoon (zichtbaar) anker
    document.querySelector('[data-tour="basis"]')!.removeAttribute('data-tour');
    click(tourButton());
    expect(title()).toBe(TOUR_STEPS[1].title);
    expect(st().tourStep).toBe(1);
  }, 30000);

  it('stap 1 klapt een ingeklapte Basis open (alleen UI-toestand, niet bewaard) en na afloop weer in', async () => {
    act(() => st().setBasisOpen(false));
    expect(localStorage.getItem(STORAGE_KEYS.basis)).toBe('dicht');
    renderPage();
    await waitForResult();
    const panelField = basisPanelField();
    expect(panelField.closest('[hidden]')).not.toBeNull();
    click(tourButton());
    expect(st().basisOpen).toBe(true);
    expect(panelField.closest('[hidden]')).toBeNull();
    expect(screen.queryByRole('toolbar', { name: 'Basis' })).toBeNull();
    // de keuze van de gebruiker blijft bewaard
    expect(localStorage.getItem(STORAGE_KEYS.basis)).toBe('dicht');
    // stap 2 (het aandeel staat in de Basis) en verder: open tot het einde
    for (let i = 1; i < TOUR_STEPS.length; i++) {
      click(inDialog('Volgende'));
      expect(st().basisOpen).toBe(true);
    }
    // stap 5 op 274 px gescrold; klapt de Basis in, dan schuift het anker 238 px omhoog
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 274 });
    const anchor = document.querySelector<HTMLElement>('[data-tour="battery-connection"]')!;
    vi.spyOn(anchor, 'getBoundingClientRect').mockImplementation(() => {
      const top = st().basisOpen ? 238 : 0;
      return {
        top,
        left: 0,
        width: 300,
        height: 198,
        right: 300,
        bottom: top + 198,
        x: 0,
        y: top,
        toJSON: () => ({}),
      };
    });
    scrollToSpy.mockClear();
    click(inDialog('Klaar'));
    // weer zoals vóór de rondleiding: pagina en bewaarde keuze zijn het eens
    expect(st().basisOpen).toBe(false);
    // en het onderdeel van de laatste stap blijft op zijn plek: de pagina scrolt evenveel mee
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 274 - 238, behavior: 'instant' });
    expect(panelField.closest('[hidden]')).not.toBeNull();
    expect(screen.getByRole('toolbar', { name: 'Basis' })).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEYS.basis)).toBe('dicht');
  }, 30000);

  it('de Basis blijft open na de rondleiding als je hem zelf openzette of er nog in werkt', async () => {
    act(() => st().setBasisOpen(false));
    renderPage();
    await waitForResult();
    // zelf opengezet tijdens de rondleiding (bijv. via een knop die een veld van de Basis toont): blijft open
    click(tourButton());
    act(() => st().revealSetting('share'));
    click(inDialog('Overslaan'));
    expect(st().basisOpen).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.basis)).toBe('open');

    // weer dicht; de rondleiding klapt hem open en je typt in een veld van de Basis als je Esc drukt
    act(() => st().setBasisOpen(false));
    click(tourButton());
    const field = basisPanelField();
    field.focus();
    pressEscape(field);
    expect(queryDialog()).toBeNull();
    expect(st().basisOpen).toBe(true);
    expect(field.closest('[hidden]')).toBeNull();
    expect(document.activeElement).toBe(field);
  }, 30000);

  it.each([
    ['stap 2 (het aandeel)', 1],
    ['stap 1 (de Basis zelf)', 0],
  ])(
    '"Bekijk het resultaat" in %s: door naar het resultaat; het aandeel wordt in deze ronde overgeslagen en de Basis blijft dicht',
    async (_, from) => {
      renderPage();
      await waitForResult();
      click(tourButton());
      if (from === 1) click(inDialog('Volgende'));
      expect(title()).toBe(TOUR_STEPS[from].title);
      // de Basis klapt in (bewaard) en de focus gaat naar H2 "Resultaat"; de rondleiding gaat mee naar het resultaat
      // (in beide stappen hetzelfde), zonder popover onder de strook over het oordeel
      click(screen.getByRole('button', { name: /Bekijk het resultaat/ }));
      expect(st().basisOpen).toBe(false);
      expect(localStorage.getItem(STORAGE_KEYS.basis)).toBe('dicht');
      expect(st().tourStep).toBe(2);
      expect(title()).toBe(TOUR_STEPS[2].title);
      const resultHeading = document.getElementById(RESULT_HEADING_ID)!;
      expect(document.activeElement).toBe(resultHeading);
      // Vorige: het aandeel (in het ingeklapte paneel) wordt overgeslagen en de Basis niet opnieuw opengeklapt; stap 1
      // wijst naar de strook
      click(inDialog('Vorige'));
      expect(st().tourStep).toBe(0);
      expect(within(dialog()).getByText('1 van 5')).toBeTruthy();
      expect(st().basisOpen).toBe(false);
      expect(screen.getByRole('toolbar', { name: 'Basis' })).toBeTruthy();
      // en vooruit ook
      click(inDialog('Volgende'));
      expect(st().tourStep).toBe(2);
      expect(st().basisOpen).toBe(false);
      // zet je hem zelf weer open (Wijzig in de strook), dan is het aandeel er weer
      click(inDialog('Vorige'));
      click(
        within(document.querySelector<HTMLElement>('[data-tour="basis"]')!).getByRole('button', {
          name: 'Wijzig',
        }),
      );
      expect(st().basisOpen).toBe(true);
      click(inDialog('Volgende'));
      expect(st().tourStep).toBe(1);
      expect(title()).toBe(TOUR_STEPS[1].title);
      click(inDialog('Overslaan'));
      // open gezet door jou: blijft open en bewaard
      expect(st().basisOpen).toBe(true);
      expect(localStorage.getItem(STORAGE_KEYS.basis)).toBe('open');
    },
    30000,
  );

  it('een volgende ronde klapt een door jou ingeklapte Basis weer open (alleen voor de rondleiding)', async () => {
    renderPage();
    await waitForResult();
    click(tourButton());
    click(screen.getByRole('button', { name: /Bekijk het resultaat/ }));
    expect(st().tourStep).toBe(2);
    click(inDialog('Overslaan'));
    expect(st().basisOpen).toBe(false);
    // opnieuw gestart: stap 1 en 2 zoals altijd, de Basis open zolang de rondleiding loopt
    click(tourButton());
    expect(st().basisOpen).toBe(true);
    click(inDialog('Volgende'));
    expect(title()).toBe(TOUR_STEPS[1].title);
    click(inDialog('Overslaan'));
    expect(st().basisOpen).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.basis)).toBe('dicht');
  }, 30000);

  it('verdwijnen alle ankers tijdens een stap, dan stopt de rondleiding zonder "gezien"', async () => {
    renderPage();
    await waitForResult();
    click(tourButton());
    click(inDialog('Volgende'));
    click(inDialog('Volgende'));
    // het oordeel verdwijnt (verborgen) en er is geen ander anker meer
    document.querySelector('[data-tour="verdict"]')!.setAttribute('hidden', '');
    for (const el of document.querySelectorAll('[data-tour]:not([data-tour="verdict"])'))
      el.removeAttribute('data-tour');
    act(() => {
      fireEvent.scroll(window);
    });
    await nextFrame();
    expect(queryDialog()).toBeNull();
    expect(st().tourStep).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.tour)).toBeNull();
  }, 30000);

  it('de invoer is na de hele rondleiding ongewijzigd (ook voorbeeld, ongedaan maken en melding)', async () => {
    renderPage();
    await waitForResult();
    const before = st().input;
    const scenarioId = st().scenarioId;
    click(tourButton());
    for (let i = 1; i < TOUR_STEPS.length; i++) {
      click(inDialog('Volgende'));
      expect(st().input).toBe(before);
    }
    click(inDialog('Vorige'));
    click(inDialog('Volgende'));
    click(inDialog('Klaar'));
    expect(st().input).toBe(before);
    expect(st().scenarioId).toBe(scenarioId);
    expect(st().undo).toBeNull();
    expect(st().notice).toBeNull();
    // ook de deellink is dezelfde
    expect(st().toShareHash()).toBe(encodeInput(before));
  }, 30000);

  it('de pagina verlaten tijdens de rondleiding stopt hem zonder "gezien" te bewaren', async () => {
    const { unmount } = renderPage();
    await waitForResult();
    click(tourButton());
    click(inDialog('Volgende'));
    unmount();
    expect(st().tourStep).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.tour)).toBeNull();
  }, 30000);
});

describe('Rondleiding: scrollen', () => {
  it('het anker naar het midden, vloeiend; direct bij verminderde beweging', async () => {
    renderPage();
    await waitForResult();
    placeAnchor('verdict', 1200, 400);
    click(tourButton());
    click(inDialog('Volgende'));
    scrollToSpy.mockClear();
    click(inDialog('Volgende'));
    expect(title()).toBe(TOUR_STEPS[2].title);
    // naast het anker (rechts past in 1024 px): het midden van het anker in het midden van het venster zonder de balk
    const expected = scrollTargetFor('right', 1200, 400, { width: 0, height: 0 }, 768, 52, 3000 - 768);
    expect(expected).toBe(Math.round(1400 - (768 - 52) / 2));
    expect(scrollToSpy).toHaveBeenCalledWith({ top: expected, behavior: 'smooth' });

    click(inDialog('Overslaan'));
    mockMedia(['(prefers-reduced-motion: reduce)']);
    click(tourButton());
    click(inDialog('Volgende'));
    scrollToSpy.mockClear();
    click(inDialog('Volgende'));
    expect(scrollToSpy).toHaveBeenCalledWith({ top: expected, behavior: 'auto' });
  }, 30000);

  it('na een andere venstergrootte: het anker terug in beeld als het eruit viel, anders niet scrollen', async () => {
    renderPage();
    await waitForResult();
    // stap 3 met het oordeel in beeld
    placeAnchor('verdict', 200, 300);
    click(tourButton());
    click(inDialog('Volgende'));
    click(inDialog('Volgende'));
    expect(title()).toBe(TOUR_STEPS[2].title);
    const settle = (): Promise<void> =>
      act(() => new Promise<void>((r) => setTimeout(r, TOUR_RESIZE_SETTLE_MS + 100)));
    scrollToSpy.mockClear();
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    await settle();
    expect(scrollToSpy).not.toHaveBeenCalled();
    // kleiner venster: het oordeel staat nu onder de rand (bijv. 1024×700 in stap 5)
    placeAnchor('verdict', 900, 300);
    act(() => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('resize'));
    });
    await settle();
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    const expected = scrollTargetFor('right', 900, 300, { width: 0, height: 0 }, 768, 52, 3000 - 768);
    expect(scrollToSpy).toHaveBeenCalledWith({ top: expected, behavior: 'smooth' });
  }, 30000);
});

describe('Rondleiding: tabvolgorde (de popover direct na zijn anker)', () => {
  it('stap 4: Shift+Tab vanaf de kop bereikt de bufferschuif in een paar stappen, Tab vanaf de buffer komt in de popover', async () => {
    renderPage();
    await waitForResult();
    click(tourButton());
    for (let i = 0; i < 3; i++) click(inDialog('Volgende'));
    expect(title()).toBe(TOUR_STEPS[3].title);
    expect(document.activeElement).toBe(heading());
    // op hun plek in de DOM (aan het einde van <main>) zijn de knoppen geen tabstop
    for (const b of within(dialog()).getAllByRole('button')) expect(b.tabIndex).toBe(-1);
    const buffer = document.querySelector<HTMLElement>('[data-tour="buffer"]')!;
    const slider = buffer.querySelector<HTMLInputElement>('input[type="range"]')!;
    let presses = 0;
    while (document.activeElement !== slider && presses < 10) {
      pressTab(true);
      presses++;
    }
    expect(document.activeElement).toBe(slider);
    expect(presses).toBeLessThanOrEqual(3);
    // de schuif werkt gewoon (de rondleiding verandert zelf niets); Tab vanaf de buffer: de eerste knop van de popover
    presses = 0;
    while (!dialog().contains(document.activeElement) && presses < 10) {
      pressTab();
      presses++;
    }
    expect(presses).toBeLessThanOrEqual(3);
    expect(document.activeElement).toBe(inDialog('Overslaan'));
    pressTab();
    expect(document.activeElement).toBe(inDialog('Vorige'));
    pressTab();
    expect(document.activeElement).toBe(inDialog('Volgende'));
    // voorbij de laatste knop: verder op de pagina, direct na de buffer (batterij), niet bovenaan of onderaan
    pressTab();
    const battery = document.querySelector<HTMLElement>('[data-tour="battery-connection"]')!;
    expect(battery.contains(document.activeElement)).toBe(true);
    // en terug: Shift+Tab komt weer in de popover (laatste knop), daarna de buffer
    pressTab(true);
    expect(document.activeElement).toBe(inDialog('Volgende'));
    pressTab(true);
    pressTab(true);
    expect(document.activeElement).toBe(inDialog('Overslaan'));
    pressTab(true);
    expect(buffer.contains(document.activeElement)).toBe(true);
    // Enter werkt in de popover zoals altijd: Volgende via het toetsenbord
    expect(st().tourStep).toBe(3);
    // het einde van de pagina: Tab vanaf de laatste tabstop gaat niet (nog eens) de popover in
    const lastStop = browserTabStops().at(-1)!;
    act(() => lastStop.focus());
    pressTab();
    expect(dialog().contains(document.activeElement)).toBe(false);
  }, 30000);

  it('Tab naar een popover buiten beeld (onder een hoog anker): de pagina scrolt hem in beeld, boven de balk', async () => {
    renderPage();
    await waitForResult();
    placeAnchor('basis', 124, 321, 16, 992);
    click(tourButton());
    sizePopover();
    await moved();
    // Meer instellingen open: de popover hangt onder de Basis, buiten beeld
    placeAnchor('basis', 124, 874, 16, 992);
    await moved();
    expect(popBox().top).toBe(124 + 874 + TOUR_GAP);
    // de laatste tabstop in de Basis ("Bekijk het resultaat"), dan Tab
    const show = screen.getByRole('button', { name: /Bekijk het resultaat/ });
    act(() => show.focus());
    scrollToSpy.mockClear();
    pressTab();
    expect(document.activeElement).toBe(inDialog('Overslaan'));
    const bottom = 124 + 874 + TOUR_GAP + 160;
    expect(scrollToSpy).toHaveBeenCalledWith({
      top: bottom - (768 - MINI_BAR_HEIGHT_PX - TOUR_MARGIN),
      behavior: 'instant',
    });
    // Shift+Tab terug: "Bekijk het resultaat" (de browser scrolt een gewoon element zelf in beeld)
    pressTab(true);
    expect(document.activeElement).toBe(show);
  }, 30000);
});

describe('Rondleiding: popover vast aan het anker', () => {
  it('een anker dat groeit tot voorbij het venster (Meer instellingen in stap 1): de popover blijft eronder en bedekt de Basis niet', async () => {
    renderPage();
    await waitForResult();
    placeAnchor('basis', 124, 321, 16, 992);
    click(tourButton());
    sizePopover();
    await moved();
    expect(dialog().dataset.side).toBe('bottom');
    expect(popBox().top).toBe(124 + 321 + TOUR_GAP);
    scrollToSpy.mockClear();
    // Meer instellingen open: de Basis wordt 874 px hoog, tot onder de rand (768); de balk met het oordeel verschijnt
    act(() => document.body.classList.add(MINI_BAR_BODY_CLASS));
    const grown = placeAnchor('basis', 124, 874, 16, 992);
    await moved();
    // geen kant past meer: eronder, vast aan de onderkant van de Basis (nu buiten beeld), nooit over de velden
    expect(dialog().dataset.side).toBe('bottom');
    expect(popBox().top).toBe(124 + 874 + TOUR_GAP);
    expect(overlap(popBox(), grown)).toBe(0);
    // geen sprong: de pagina blijft waar je kijkt
    expect(scrollToSpy).not.toHaveBeenCalled();
    // verder gescrold: de popover komt met de onderkant van de Basis in beeld, boven de balk
    const scrolled = placeAnchor('basis', -350, 874, 16, 992);
    await moved();
    expect(popBox().top).toBe(-350 + 874 + TOUR_GAP);
    expect(overlap(popBox(), scrolled)).toBe(0);
    expect(popBox().top + popBox().height).toBeLessThanOrEqual(768 - MINI_BAR_HEIGHT_PX);
    // krimpt het anker weer (Meer instellingen dicht), dan opnieuw de kant kiezen en eronder
    const shrunk = placeAnchor('basis', 124, 321, 16, 992);
    await moved();
    expect(popBox().top).toBe(124 + 321 + TOUR_GAP);
    expect(overlap(popBox(), shrunk)).toBe(0);
  }, 30000);

  it('een anker vlak bij de onderrand (stap 4, omhoog gescrold): de popover gaat mee en bedekt de bufferschuif niet; ver weg gaat hij mee uit beeld', async () => {
    renderPage();
    await waitForResult();
    // te breed voor rechts: de popover komt eronder, zoals op 1280×800 en 1440×900
    placeAnchor('buffer', 150, 423, 16, 900);
    click(tourButton());
    for (let i = 0; i < 3; i++) click(inDialog('Volgende'));
    sizePopover();
    await moved();
    expect(dialog().dataset.side).toBe('bottom');
    expect(popBox().top).toBe(150 + 423 + TOUR_GAP);
    // 300 px omhoog gescrold: de buffer staat op 450–873, de schuif onderaan bij de rand van het venster (768)
    const low = placeAnchor('buffer', 450, 423, 16, 900);
    await moved();
    expect(popBox().top).toBe(450 + 423 + TOUR_GAP);
    expect(overlap(popBox(), low)).toBe(0);
    // ver naar beneden gescrold (scrollwiel +1400): de popover gaat mee uit beeld, niet vast aan de bovenrand
    placeAnchor('buffer', 150 - 1400, 423, 16, 900);
    await moved();
    expect(popBox().top + popBox().height).toBeLessThan(0);
  }, 30000);

  it('rechts naast een hoog anker (stap 3): schuift langs het anker binnen het venster en boven de balk, en gaat met het anker uit beeld', async () => {
    renderPage();
    await waitForResult();
    placeAnchor('verdict', 200, 393);
    click(tourButton());
    click(inDialog('Volgende'));
    click(inDialog('Volgende'));
    sizePopover();
    await moved();
    expect(dialog().dataset.side).toBe('right');
    expect(popBox()).toMatchObject({ top: 200, left: 616 + TOUR_GAP });
    const arrowOnAnchor = (box: Box): void => {
      expect(arrowAt()).toBeGreaterThanOrEqual(box.top + TOUR_ARROW_INSET);
      expect(arrowAt()).toBeLessThanOrEqual(box.top + box.height - TOUR_ARROW_INSET);
    };
    // de bovenkant van het oordeel uit beeld: de popover blijft in beeld naast het anker
    let box = placeAnchor('verdict', -150, 393);
    await moved();
    expect(popBox().top).toBe(TOUR_MARGIN);
    arrowOnAnchor(box);
    // vlak bij de onderrand, en de balk met het oordeel verschijnt: de popover schuift boven de balk (opnieuw geplaatst
    // door de klasse op de body, zonder te scrollen)
    box = placeAnchor('verdict', 600, 393);
    await moved();
    expect(popBox().top + popBox().height).toBe(768 - TOUR_MARGIN);
    await act(async () => {
      document.body.classList.add(MINI_BAR_BODY_CLASS);
    });
    await nextFrame();
    expect(popBox().top + popBox().height).toBe(768 - MINI_BAR_HEIGHT_PX - TOUR_MARGIN);
    expect(overlap(popBox(), box)).toBe(0);
    arrowOnAnchor(box);
    // ver weg gescrold (Tab naar Verdieping): het oordeel ver boven het venster; de popover gaat mee uit beeld
    placeAnchor('verdict', -1400, 393);
    await moved();
    expect(popBox().top + popBox().height).toBeLessThan(0);
  }, 30000);
});

// ---- plaatsing (pure functies): gemeten ankers op de pagina, met de Basis open
const POP: Size = { width: 340, height: 160 };

/** Ankers in documentcoördinaten (left, top, width, height), gemeten met Chromium. */
const MEASURED: Record<string, { vp: [number, number]; docH: number; anchors: Record<string, Box> }> = {
  '1280x800': {
    vp: [1280, 800],
    docH: 2122,
    anchors: {
      basis: { left: 16, top: 124, width: 1248, height: 321 },
      budget: { left: 389, top: 261, width: 275, height: 118 },
      verdict: { left: 16, top: 457, width: 645, height: 393 },
      buffer: { left: 692, top: 512, width: 557, height: 262 },
      'battery-connection': { left: 692, top: 789, width: 557, height: 198 },
    },
  },
  '1440x900': {
    vp: [1440, 900],
    docH: 2103,
    anchors: {
      basis: { left: 16, top: 124, width: 1408, height: 321 },
      budget: { left: 416, top: 261, width: 319, height: 118 },
      verdict: { left: 16, top: 457, width: 729, height: 393 },
      // na het schuiven groeit de hendel (effectregel en melding eronder)
      buffer: { left: 776, top: 512, width: 320, height: 423 },
      'battery-connection': { left: 1118, top: 512, width: 291, height: 198 },
    },
  },
  '1920x1080': {
    vp: [1920, 1080],
    docH: 2103,
    anchors: {
      basis: { left: 76, top: 124, width: 1768, height: 321 },
      budget: { left: 576, top: 261, width: 406, height: 118 },
      verdict: { left: 76, top: 457, width: 918, height: 393 },
      buffer: { left: 1025, top: 512, width: 410, height: 262 },
      'battery-connection': { left: 1456, top: 512, width: 373, height: 198 },
    },
  },
};

const overlap = (a: Box, b: Box): number =>
  Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left)) *
  Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));

describe('Rondleiding: plaatsing van de popover', () => {
  for (const [name, m] of Object.entries(MEASURED)) {
    it(`${name}: popover naast het anker, binnen het venster en nooit over het anker`, () => {
      const [width, height] = m.vp;
      for (const [anchor, doc] of Object.entries(m.anchors)) {
        // balk onderaan zichtbaar: het ergste geval
        const vp: Viewport = { width, height, bottomInset: 52 };
        const atTop: Box = { ...doc, top: doc.top };
        const side = chooseSide(atTop, POP, vp, { anchorTop: doc.top, height: m.docH });
        const scroll = scrollTargetFor(side, doc.top, doc.height, POP, height, 52, m.docH - height);
        const box: Box = { ...doc, top: doc.top - scroll };
        const pos = positionFor(side, box, POP, vp);
        const pop: Box = { left: pos.left, top: pos.top, ...POP };
        const label = `${name} ${anchor} (${side})`;
        expect(overlap(pop, box), label).toBe(0);
        expect(pop.left, label).toBeGreaterThanOrEqual(TOUR_MARGIN);
        expect(pop.top, label).toBeGreaterThanOrEqual(TOUR_MARGIN);
        expect(pop.left + pop.width, label).toBeLessThanOrEqual(width - TOUR_MARGIN);
        expect(pop.top + pop.height, label).toBeLessThanOrEqual(height - 52 - TOUR_MARGIN);
        // het anker zelf staat in beeld (boven de balk)
        expect(box.top, label).toBeGreaterThanOrEqual(0);
        expect(box.top + box.height, label).toBeLessThanOrEqual(height - 52);
      }
    });
  }

  it('kanten: Basis eronder, aandeel en oordeel rechts; buffer rechts als dat past, anders eronder', () => {
    const at = (m: string, a: string): { side: string } => {
      const { vp, docH, anchors } = MEASURED[m];
      const doc = anchors[a];
      return {
        side: chooseSide(
          doc,
          POP,
          { width: vp[0], height: vp[1], bottomInset: 0 },
          { anchorTop: doc.top, height: docH },
        ),
      };
    };
    expect(at('1440x900', 'basis').side).toBe('bottom');
    expect(at('1440x900', 'budget').side).toBe('right');
    expect(at('1440x900', 'verdict').side).toBe('right');
    expect(at('1440x900', 'buffer').side).toBe('bottom');
    expect(at('1920x1080', 'buffer').side).toBe('right');
    expect(at('1280x800', 'battery-connection').side).toBe('bottom');
  });

  it('pijltje wijst naar het anker en blijft binnen de popover; alles past niet: eronder, vast aan het anker', () => {
    const vp: Viewport = { width: 1280, height: 800, bottomInset: 0 };
    const small: Box = { left: 400, top: 300, width: 200, height: 60 };
    const right = positionFor('right', small, POP, vp);
    expect(right.left).toBe(600 + TOUR_GAP);
    // laag anker: gecentreerd, het pijltje in het midden van de popover
    expect(right.top + right.arrow).toBe(330);
    const below = positionFor('bottom', small, POP, vp);
    expect(below.top).toBe(360 + TOUR_GAP);
    expect(below.left + below.arrow).toBe(500);
    // een anker groter dan het venster: geen kant past; eronder, vast aan het anker (hier buiten beeld), nooit eroverheen
    const huge: Box = { left: 0, top: -100, width: 1280, height: 1200 };
    expect(chooseSide(huge, POP, vp)).toBe('bottom');
    const p = positionFor('bottom', huge, POP, vp);
    expect(p.top).toBe(1100 + TOUR_GAP);
    expect(overlap({ ...POP, top: p.top, left: p.left }, huge)).toBe(0);
    expect(popoverInView(p, POP, vp)).toBe(false);
    expect(p.left).toBeGreaterThanOrEqual(TOUR_MARGIN);
    // boven het document kan de pagina niet scrollen: niet erboven als het anker bovenaan staat
    const top: Box = { left: 0, top: 20, width: 1280, height: 700 };
    expect(chooseSide(top, POP, { ...vp, height: 2000 }, { anchorTop: 20, height: 3000 })).toBe('bottom');
  });

  it('dwars passen: rechts naast de buffer niet op 1440×900, wel op 1920×1080; onder of boven als de popover past', () => {
    const at = (m: string): { vp: Viewport; buffer: Box } => ({
      vp: { width: MEASURED[m].vp[0], height: MEASURED[m].vp[1], bottomInset: 0 },
      buffer: MEASURED[m].anchors.buffer,
    });
    expect(fitsAcross('right', at('1440x900').buffer, POP, at('1440x900').vp)).toBe(false);
    expect(fitsAcross('left', at('1440x900').buffer, POP, at('1440x900').vp)).toBe(true);
    expect(fitsAcross('right', at('1920x1080').buffer, POP, at('1920x1080').vp)).toBe(true);
    expect(fitsAcross('bottom', at('1440x900').buffer, POP, at('1440x900').vp)).toBe(true);
    expect(fitsAcross('top', at('1440x900').buffer, { width: 1500, height: 160 }, at('1440x900').vp)).toBe(
      false,
    );
  });

  it('vast aan het anker bij elke scrollpositie: nooit over het anker, pijltje op het anker, mee uit beeld', () => {
    for (const [name, m] of Object.entries(MEASURED)) {
      const [width, height] = m.vp;
      for (const bottomInset of [0, MINI_BAR_HEIGHT_PX]) {
        const vp: Viewport = { width, height, bottomInset };
        for (const [anchor, doc] of Object.entries(m.anchors)) {
          const side = chooseSide(doc, POP, vp, { anchorTop: doc.top, height: m.docH });
          const vertical = side === 'right' || side === 'left';
          for (let y = -1600; y <= 1600; y += 25) {
            const box: Box = { ...doc, top: y };
            const pos = positionFor(side, box, POP, vp);
            const pop: Box = { left: pos.left, top: pos.top, ...POP };
            const label = `${name} ${anchor} (${side}) top ${y} balk ${bottomInset}`;
            expect(overlap(pop, box), label).toBe(0);
            // het pijltje: binnen de popover, en het wijst naar het anker
            const len = vertical ? POP.height : POP.width;
            expect(pos.arrow, label).toBeGreaterThanOrEqual(TOUR_ARROW_INSET);
            expect(pos.arrow, label).toBeLessThanOrEqual(len - TOUR_ARROW_INSET);
            const point = vertical ? pos.top + pos.arrow : pos.left + pos.arrow;
            const start = vertical ? box.top : box.left;
            const end = start + (vertical ? box.height : box.width);
            expect(point, label).toBeGreaterThanOrEqual(start);
            expect(point, label).toBeLessThanOrEqual(end);
            // ver uit beeld: de popover ook (hij blijft niet aan een rand hangen)
            const far =
              box.top + box.height < -(POP.height + TOUR_GAP) || box.top > height + POP.height + TOUR_GAP;
            if (far) expect(pos.top + POP.height <= 0 || pos.top >= height, label).toBe(true);
            // naast het anker en het anker ruim in beeld: de popover helemaal in beeld, boven de balk
            const reach = 2 * TOUR_ARROW_INSET;
            const room = height - bottomInset - TOUR_MARGIN;
            if (vertical && box.top + box.height - reach >= TOUR_MARGIN && box.top + reach <= room) {
              expect(pos.top, label).toBeGreaterThanOrEqual(TOUR_MARGIN);
              expect(pos.top + POP.height, label).toBeLessThanOrEqual(room);
            }
          }
        }
      }
    }
  });

  it('popoverInView: helemaal in het venster en boven de strook onderaan', () => {
    const vp: Viewport = { width: 1440, height: 900, bottomInset: 52 };
    expect(popoverInView({ top: 12, left: 12, arrow: 24 }, POP, vp)).toBe(true);
    expect(popoverInView({ top: 900 - 52 - 160, left: 12, arrow: 24 }, POP, vp)).toBe(true);
    expect(popoverInView({ top: 900 - 52 - 159, left: 12, arrow: 24 }, POP, vp)).toBe(false);
    expect(popoverInView({ top: -1, left: 12, arrow: 24 }, POP, vp)).toBe(false);
    expect(popoverInView({ top: 12, left: 1440 - 339, arrow: 24 }, POP, vp)).toBe(false);
  });
});
