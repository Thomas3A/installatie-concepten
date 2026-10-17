// @vitest-environment jsdom
// Schil van de pagina (UX-plan §2.1, §6, §10 WP-F): kop met titel, vraagregel, Voorbeelden (optgroups, korte titels,
// eigen invoer bewaard en terugzetten), Rondleiding alleen als die aanstaat, Deel link en Print / PDF; de melding
// onderaan (toast) met Ongedaan maken / Terug naar je invoer, 8 s en sluiten; de skip-link "Naar resultaat" als knop;
// de korte melding voor telefoon en tablet (alleen via CSS).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultInput } from '../../src/concepts/peakshaving/data/defaults';
import type { Engine } from '../../src/concepts/peakshaving/model/engine';
import { normalizeInput } from '../../src/concepts/peakshaving/model/input';
import type { PeakshavingInput } from '../../src/concepts/peakshaving/model/types';
import { SCENARIOS, findScenario } from '../../src/concepts/peakshaving/scenarios';
import { decodeInput, sameInput } from '../../src/concepts/peakshaving/share';
import { configureEngine, useStore } from '../../src/concepts/peakshaving/store';
import {
  EXAMPLES_TEXTS,
  PAGE_QUESTION,
  PAGE_TITLE,
  SMALL_SCREEN_NOTICE,
} from '../../src/concepts/peakshaving/texts';
import { ExamplesSelect } from '../../src/concepts/peakshaving/ui/shell/ExamplesSelect';
import { COPIED_MS, PageHeader, TOUR_BUTTON_ID } from '../../src/concepts/peakshaving/ui/shell/PageHeader';
import { SkipLink } from '../../src/concepts/peakshaving/ui/shell/SkipLink';
import { SmallScreenNotice } from '../../src/concepts/peakshaving/ui/shell/SmallScreenNotice';
import { TOAST_MS, UndoToast } from '../../src/concepts/peakshaving/ui/shell/UndoToast';

// de knop Rondleiding hangt af van TOUR_ENABLED; hier per test aan of uit te zetten
const tour = vi.hoisted(() => ({ enabled: false }));
vi.mock('../../src/concepts/peakshaving/ui/tour/anchors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/concepts/peakshaving/ui/tour/anchors')>();
  return {
    ...actual,
    get TOUR_ENABLED() {
      return tour.enabled;
    },
  };
});

const cssText = readFileSync(
  resolve(process.cwd(), 'src/concepts/peakshaving/ui/shell/Shell.module.css'),
  'utf8',
);

const st = () => useStore.getState();
const initial = st();

/** Rekenmotor die niets doet: hier telt alleen de UI. */
const idleEngine = (): Engine =>
  ({ handle: async () => {}, climate: async () => Promise.reject(new Error('niet nodig')) }) as Engine;

/** Eigen invoer: de woning met een ander piekvermogen en een andere aansluiting (geen voorbeeld). */
function ownInput(): PeakshavingInput {
  const i = defaultInput('residential');
  i.building.designLoadKw = 9.5;
  i.grid.connection = '3x25';
  i.buffer.volumeM3 = 0.35;
  return normalizeInput(i);
}

const scenarioInput = (id: string): PeakshavingInput => normalizeInput(findScenario(id)!.build());

beforeEach(() => {
  localStorage.clear();
  tour.enabled = false;
  configureEngine({ mainThread: true, createEngine: idleEngine });
  const input = scenarioInput('woning-basis');
  useStore.setState({
    input,
    ranges: initial.ranges,
    scenarioId: 'woning-basis',
    analysis: null,
    sensitivity: null,
    copied: false,
    printing: false,
    ownInput: null,
    undo: null,
    notice: null,
    tourStep: null,
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  configureEngine();
  useStore.setState({ requestPrint: initial.requestPrint, startTour: initial.startTour });
  delete (navigator as { clipboard?: unknown }).clipboard;
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const examples = (): HTMLSelectElement =>
  screen.getByRole<HTMLSelectElement>('combobox', { name: 'Voorbeelden' });
const optionTexts = (): string[] => Array.from(examples().options).map((o) => o.textContent ?? '');

describe('Kop', () => {
  it('titel, vraagregel en de knoppen; de hele kop staat niet op papier', () => {
    render(<PageHeader />);
    const h1 = screen.getByRole('heading', { level: 1, name: PAGE_TITLE });
    expect(screen.getByText(PAGE_QUESTION)).toBeTruthy();
    const header = h1.closest('header')!;
    expect(header.classList.contains('noPrint')).toBe(true);
    expect(within(header).getByRole('combobox', { name: 'Voorbeelden' })).toBeTruthy();
    expect(within(header).getByRole('button', { name: 'Deel link' })).toBeTruthy();
    expect(within(header).getByRole('button', { name: 'Print / PDF' })).toBeTruthy();
    // geen oude keuzelijsten meer in de kop
    expect(screen.queryByRole('combobox', { name: /Scenario/ })).toBeNull();
    expect(screen.queryByRole('combobox', { name: /Klimaatjaar/ })).toBeNull();
  });

  it('Rondleiding alleen als TOUR_ENABLED aanstaat; de knop start de rondleiding', () => {
    const { unmount } = render(<PageHeader />);
    expect(screen.queryByRole('button', { name: 'Rondleiding' })).toBeNull();
    unmount();
    tour.enabled = true;
    render(<PageHeader />);
    const btn = screen.getByRole('button', { name: 'Rondleiding' });
    expect(btn.id).toBe(TOUR_BUTTON_ID);
    // volgorde in de kop: Voorbeelden, Rondleiding, Deel link, Print / PDF
    const names = screen.getAllByRole('button').map((b) => b.textContent);
    expect(names).toEqual(['Rondleiding', 'Deel link', 'Print / PDF']);
    act(() => btn.click());
    expect(st().tourStep).toBe(0);
  });

  it('Deel link: kopieert de link met de huidige invoer en meldt dat op de knop (aria-live)', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<PageHeader />);
    const btn = screen.getByRole('button', { name: 'Deel link' });
    expect(btn.getAttribute('aria-live')).toBe('polite');
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    const url = writeText.mock.calls[0][0] as string;
    const code = new URLSearchParams(url.split('?')[1]).get('c')!;
    expect(sameInput(decodeInput(code)!, st().input)).toBe(true);
    expect(btn.textContent).toBe('✓ Link gekopieerd');
    expect(st().copied).toBe(true);
    act(() => vi.advanceTimersByTime(COPIED_MS));
    expect(btn.textContent).toBe('Deel link');
    expect(st().copied).toBe(false);
  });

  it('Deel link zonder klembord: de link in een venster, en "Link getoond"', async () => {
    const prompt = vi.spyOn(window, 'prompt').mockImplementation(() => null);
    render(<PageHeader />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Deel link' }));
    });
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(prompt.mock.calls[0][0]).toBe('Kopieer deze link:');
    expect(prompt.mock.calls[0][1]).toMatch(/#\/peakshaving\?c=/);
    expect(screen.getByRole('button', { name: 'Link getoond' })).toBeTruthy();
  });

  it('Print / PDF vraagt de printversie; tijdens het voorbereiden uitgeschakeld met een andere tekst', () => {
    const requestPrint = vi.fn();
    useStore.setState({ requestPrint });
    render(<PageHeader />);
    const btn = screen.getByRole('button', { name: 'Print / PDF' });
    expect(btn.getAttribute('aria-live')).toBe('polite');
    act(() => btn.click());
    expect(requestPrint).toHaveBeenCalledTimes(1);
    act(() => useStore.setState({ printing: true }));
    expect(btn.textContent).toBe('Printversie voorbereiden…');
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Voorbeelden', () => {
  it('optgroups Woning, Meerdere woningen en Kantoor met de korte titels; de toelichting als title', () => {
    render(<ExamplesSelect />);
    const groups = Array.from(examples().querySelectorAll('optgroup'));
    expect(groups.map((g) => g.label)).toEqual(['Woning', 'Meerdere woningen', 'Kantoor']);
    for (const g of groups) {
      const kind = (Object.keys(EXAMPLES_TEXTS.groups) as (keyof typeof EXAMPLES_TEXTS.groups)[]).find(
        (k) => EXAMPLES_TEXTS.groups[k] === g.label,
      );
      const expected = SCENARIOS.filter((sc) => sc.group === kind);
      const opts = Array.from(g.querySelectorAll('option'));
      expect(opts.map((o) => o.value)).toEqual(expected.map((sc) => sc.id));
      expect(opts.map((o) => o.textContent)).toEqual(expected.map((sc) => sc.shortTitle));
      expect(opts.map((o) => o.title)).toEqual(expected.map((sc) => sc.description));
    }
    // alle voorbeelden staan erin, zonder nummering
    expect([...optionTexts()].sort()).toEqual(SCENARIOS.map((sc) => sc.shortTitle).sort());
    expect(examples().value).toBe('woning-basis');
    expect(examples().title).toBe(findScenario('woning-basis')!.description);
    // anker voor de rondleiding op het label met de lijst
    const anchor = document.querySelector('[data-tour="examples"]')!;
    expect(anchor.contains(examples())).toBe(true);
  });

  it('"Eigen invoer" alleen als de invoer geen voorbeeld is', () => {
    render(<ExamplesSelect />);
    expect(optionTexts()).not.toContain('Eigen invoer');
    act(() => st().update((i) => ({ ...i, grid: { ...i.grid, heatPumpShare: 0.5 } })));
    expect(st().scenarioId).toBeNull();
    expect(optionTexts()[0]).toBe('Eigen invoer');
    expect(examples().selectedOptions[0].textContent).toBe('Eigen invoer');
    expect(optionTexts()).not.toContain('↩ Je eigen invoer (bewaard)');
  });

  it('een voorbeeld over eigen invoer heen: melding met "Terug naar je invoer"; beide routes zetten exact terug', () => {
    const own = ownInput();
    act(() => st().loadInput(own, null));
    render(
      <>
        <ExamplesSelect />
        <UndoToast />
      </>,
    );
    act(() => {
      fireEvent.change(examples(), { target: { value: 'woning-buffer' } });
    });
    expect(st().scenarioId).toBe('woning-buffer');
    expect(examples().value).toBe('woning-buffer');
    expect(screen.getByText("Voorbeeld „Woning jaren '70 · 0,5 m³ buffer” geladen")).toBeTruthy();
    // de bewaarde invoer staat ook in de lijst
    expect(optionTexts()[0]).toBe('↩ Je eigen invoer (bewaard)');
    expect(optionTexts()).not.toContain('Eigen invoer');

    // route 1: de melding
    act(() => screen.getByRole('button', { name: 'Terug naar je invoer' }).click());
    expect(st().input).toEqual(own);
    expect(st().scenarioId).toBeNull();
    expect(st().ownInput).toBeNull();
    expect(st().notice).toBeNull();
    expect(examples().value).toBe('');
    expect(optionTexts()[0]).toBe('Eigen invoer');
    expect(optionTexts()).not.toContain('↩ Je eigen invoer (bewaard)');

    // route 2: de keuzelijst (de melding is dan al weg)
    act(() => {
      fireEvent.change(examples(), { target: { value: 'kantoor-basis' } });
    });
    act(() => st().dismissNotice());
    expect(st().ownInput).toEqual(own);
    act(() => {
      fireEvent.change(examples(), { target: { value: '↩' } });
    });
    // een onbekende waarde doet niets
    expect(st().scenarioId).toBe('kantoor-basis');
    const restore = Array.from(examples().options).find(
      (o) => o.textContent === '↩ Je eigen invoer (bewaard)',
    )!;
    act(() => {
      fireEvent.change(examples(), { target: { value: restore.value } });
    });
    expect(st().input).toEqual(own);
    expect(st().scenarioId).toBeNull();
    expect(st().ownInput).toBeNull();
  });

  it('"Eigen invoer" opnieuw kiezen doet niets', () => {
    act(() => st().loadInput(ownInput(), null));
    render(<ExamplesSelect />);
    const before = st().input;
    act(() => {
      fireEvent.change(examples(), { target: { value: '' } });
    });
    expect(st().input).toBe(before);
    expect(st().notice).toBeNull();
  });
});

describe('Melding onderaan (toast)', () => {
  const region = (): HTMLElement => screen.getByTestId('undo-toast');

  it('een vaste statusregio, leeg zonder melding, niet op papier', () => {
    render(<UndoToast />);
    expect(region().getAttribute('role')).toBe('status');
    expect(region().classList.contains('noPrint')).toBe(true);
    expect(region().textContent).toBe('');
    expect(screen.queryByRole('button')).toBeNull();
    // linksonder, boven de balk met het oordeel (de balk zet --ps-bottom-bar), en boven die balk (z-index 30)
    expect(cssText).toMatch(
      /\.toastRegion\s*\{[^}]*position:\s*fixed;[^}]*bottom:\s*calc\(var\(--ps-bottom-bar,\s*0px\)\s*\+\s*16px\);[^}]*z-index:\s*31;/,
    );
  });

  it('na een knop: "{label} · Ongedaan maken" zet invoer en voorbeeld exact terug', () => {
    st().applyScenario('woning-basis');
    const before = st().input;
    act(() => st().applyFix('Buffer op 0,20 m³', (i) => ({ ...i, buffer: { ...i.buffer, volumeM3: 0.2 } })));
    render(<UndoToast />);
    const live = region();
    expect(within(live).getByText('Buffer op 0,20 m³')).toBeTruthy();
    expect(within(live).queryByRole('button', { name: 'Terug naar je invoer' })).toBeNull();
    act(() => within(live).getByRole('button', { name: 'Ongedaan maken' }).click());
    expect(st().input).toBe(before);
    expect(st().scenarioId).toBe('woning-basis');
    expect(st().notice).toBeNull();
    expect(st().undo).toBeNull();
    // dezelfde regio blijft staan, nu leeg
    expect(region()).toBe(live);
    expect(live.textContent).toBe('');
  });

  it('na een andere gebouwfunctie over eigen invoer: "Ongedaan maken" zet de eigen invoer terug', () => {
    const own = ownInput();
    act(() => st().loadInput(own, null));
    act(() => st().setKind('office'));
    render(<UndoToast />);
    expect(screen.getByText('Standaardwaarden voor kantoor geladen')).toBeTruthy();
    act(() => screen.getByRole('button', { name: 'Ongedaan maken' }).click());
    expect(st().input).toEqual(own);
    expect(st().ownInput).toBeNull();
  });

  it('sluiten (× of Esc) laat het ongedaan maken vervallen; de bewaarde eigen invoer blijft', () => {
    const own = ownInput();
    act(() => st().loadInput(own, null));
    act(() => st().setKind('office'));
    render(<UndoToast />);
    act(() => screen.getByRole('button', { name: 'Melding sluiten' }).click());
    expect(st().notice).toBeNull();
    expect(st().undo).toBeNull();
    expect(st().ownInput).toEqual(own);
    expect(region().textContent).toBe('');

    act(() =>
      st().applyFix('Batterij op 1,0 kWh', (i) => ({ ...i, battery: { ...i.battery, capacityKwh: 1 } })),
    );
    const close = screen.getByRole('button', { name: 'Melding sluiten' });
    act(() => close.focus());
    act(() => {
      fireEvent.keyDown(close, { key: 'Escape' });
    });
    expect(st().notice).toBeNull();
    expect(st().undo).toBeNull();
  });

  it('verdwijnt na 8 s; niet zolang de muis erop staat; een nieuwe melding begint opnieuw', () => {
    vi.useFakeTimers();
    st().applyScenario('woning-basis');
    act(() => st().applyFix('Buffer op 0,20 m³', (i) => ({ ...i, buffer: { ...i.buffer, volumeM3: 0.2 } })));
    render(<UndoToast />);
    act(() => vi.advanceTimersByTime(TOAST_MS - 1));
    expect(st().notice).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(st().notice).toBeNull();
    expect(st().undo).toBeNull();

    // muis erop: de tijd loopt niet; eraf: weer 8 s
    act(() => st().applyFix('Buffer op 0,50 m³', (i) => ({ ...i, buffer: { ...i.buffer, volumeM3: 0.5 } })));
    const card = screen.getByText('Buffer op 0,50 m³').parentElement!;
    fireEvent.mouseEnter(card);
    act(() => vi.advanceTimersByTime(3 * TOAST_MS));
    expect(st().notice?.text).toBe('Buffer op 0,50 m³');
    fireEvent.mouseLeave(card);
    act(() => vi.advanceTimersByTime(TOAST_MS - 1));
    expect(st().notice).not.toBeNull();

    // een nieuwe melding (ook met dezelfde tekst) krijgt weer de volle tijd
    act(() => st().applyFix('Buffer op 0,50 m³', (i) => ({ ...i, buffer: { ...i.buffer, volumeM3: 0.6 } })));
    act(() => vi.advanceTimersByTime(TOAST_MS - 1));
    expect(st().notice).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(st().notice).toBeNull();
  });

  it('zolang de focus erin zit, loopt de tijd niet; na de actie gaat de focus terug naar waar hij vandaan kwam', () => {
    vi.useFakeTimers();
    st().applyScenario('woning-basis');
    render(
      <>
        <button type="button">Bufferschuif</button>
        <UndoToast />
      </>,
    );
    const lever = screen.getByRole('button', { name: 'Bufferschuif' });
    act(() => lever.focus());
    act(() => st().applyFix('Buffer op 0,20 m³', (i) => ({ ...i, buffer: { ...i.buffer, volumeM3: 0.2 } })));
    const undo = screen.getByRole('button', { name: 'Ongedaan maken' });
    act(() => undo.focus());
    act(() => vi.advanceTimersByTime(2 * TOAST_MS));
    expect(st().notice).not.toBeNull();
    act(() => undo.click());
    expect(st().notice).toBeNull();
    expect(document.activeElement).toBe(lever);
  });

  it('zonder herkomst gaat de focus na sluiten naar H2 "Resultaat"', () => {
    st().applyScenario('woning-basis');
    act(() => st().applyFix('Buffer op 0,20 m³', (i) => ({ ...i, buffer: { ...i.buffer, volumeM3: 0.2 } })));
    render(
      <>
        <h2 id="ps-resultaat" tabIndex={-1}>
          Resultaat
        </h2>
        <UndoToast />
      </>,
    );
    const close = screen.getByRole('button', { name: 'Melding sluiten' });
    act(() => close.focus());
    act(() => close.click());
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Resultaat' }));
  });
});

describe('Skip-link', () => {
  it('een knop (geen href) "Naar resultaat" die naar H2 "Resultaat" scrolt en daar de focus zet', () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    render(
      <>
        <SkipLink />
        <h2 id="ps-resultaat" tabIndex={-1}>
          Resultaat
        </h2>
      </>,
    );
    const btn = screen.getByRole('button', { name: 'Naar resultaat' });
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button');
    expect(btn.hasAttribute('href')).toBe(false);
    expect(btn.classList.contains('noPrint')).toBe(true);
    act(() => btn.click());
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Resultaat' }));
    expect(scroll).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    // bij verminderde beweging direct
    window.matchMedia = ((q: string) => ({
      matches: q.includes('reduce'),
      media: q,
    })) as typeof window.matchMedia;
    act(() => btn.click());
    expect(scroll).toHaveBeenLastCalledWith({ block: 'start', behavior: 'auto' });
    // alleen zichtbaar bij focus
    expect(cssText).toMatch(/\.skip:not\(:focus\)\s*\{[^}]*clip-path:\s*inset\(50%\);/);
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  });

  it('zonder resultaat op de pagina gebeurt er niets', () => {
    render(<SkipLink />);
    const btn = screen.getByRole('button', { name: 'Naar resultaat' });
    act(() => btn.focus());
    act(() => btn.click());
    expect(document.activeElement).toBe(btn);
  });
});

describe('Melding op telefoon en tablet', () => {
  it('een korte notitie, alleen via CSS zichtbaar op een smal scherm of een aanraakscherm tot 1024 px', () => {
    render(<SmallScreenNotice />);
    const note = screen.getByRole('note');
    expect(note.textContent).toBe(SMALL_SCREEN_NOTICE);
    expect(SMALL_SCREEN_NOTICE).toBe(
      'Deze tool is gemaakt voor een pc of laptop. Op een telefoon of tablet past niet alles goed; je kunt gewoon verder scrollen, maar voor het beste overzicht open je hem op de pc.',
    );
    expect(note.classList.contains('noPrint')).toBe(true);
    // geen sluitknop en geen script
    expect(within(note).queryByRole('button')).toBeNull();
    expect(cssText).toMatch(/\.smallScreen\s*\{\s*display:\s*none;\s*\}/);
    expect(cssText).toContain('@media (max-width: 760px), (pointer: coarse) and (max-width: 1024px) {');
  });
});
