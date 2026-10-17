// @vitest-environment jsdom
// Opbouw van de pagina (UX-plan §2.1, §2.5, §6, §10 WP-F, §11): de regio's Invoer, Resultaat en Detailweergave; de
// DOM-volgorde (= tabvolgorde = printvolgorde); eerste bezoek met de Basis open en "Bekijk het resultaat"; een deellink
// opent ingeklapt; elk invoerveld van de oude pagina is bereikbaar (acceptatie §11.2); de printvolgorde.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultInput, defaultInputOfKind } from '../../src/concepts/peakshaving/data/defaults';
import type { BuildingKind } from '../../src/concepts/peakshaving/model/types';
import { encodeInput } from '../../src/concepts/peakshaving/share';
import { configureEngine, useStore } from '../../src/concepts/peakshaving/store';
import PeakshavingPage from '../../src/concepts/peakshaving/ui/PeakshavingPage';
import { STORAGE_KEYS } from '../../src/concepts/peakshaving/ui/storage';

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

const scrollSpy = vi.fn();

beforeAll(() => {
  class RO {
    observe(): void {}
    disconnect(): void {}
    unobserve(): void {}
  }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
  // jsdom kent scrollIntoView niet
  Element.prototype.scrollIntoView = scrollSpy;
});

beforeEach(() => {
  // eerste bezoek: niets bewaard, de Basis open
  localStorage.clear();
  scrollSpy.mockClear();
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
    });
  });
});

afterEach(() => cleanup());

const st = () => useStore.getState();

function renderPage(path = '/peakshaving') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PeakshavingPage />
    </MemoryRouter>,
  );
}

const waitForResult = (): Promise<unknown> =>
  waitFor(() => expect(screen.getByText('Past niet op 1×35 A')).toBeTruthy(), { timeout: 20000 });

/** Komt `a` vóór `b` in de DOM? */
const before = (a: Element, b: Element): boolean =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

/** Elementen staan in deze volgorde in de DOM. */
function expectDomOrder(els: Element[], what: string): void {
  for (let i = 1; i < els.length; i++)
    expect(before(els[i - 1], els[i]), `${what}: ${i - 1} vóór ${i}`).toBe(true);
}

const heading = (name: string): HTMLElement => screen.getByRole('heading', { level: 2, name });
const panel = (): HTMLElement => screen.getByRole('region', { name: 'Invoer' });
const resultHeading = (): HTMLElement => document.getElementById('ps-resultaat')!;

describe('werkbank: opbouw (§2.1)', () => {
  it('drie regio’s: Invoer, Resultaat en daarbinnen Detailweergave; de stappen zijn geen eigen regio', async () => {
    renderPage();
    const main = screen.getByRole('main');
    const invoer = screen.getByRole('region', { name: 'Invoer' });
    const resultaat = screen.getByRole('region', { name: 'Resultaat' });
    const detail = screen.getByRole('region', { name: 'Detailweergave' });
    expect(main.contains(invoer) && main.contains(resultaat)).toBe(true);
    expect(resultaat.contains(invoer)).toBe(false);
    expect(resultaat.contains(detail)).toBe(true);
    expect(resultaat.getAttribute('aria-busy')).not.toBeNull();
    // H2 per stap (het stapnummer is aria-hidden): oordeel, Wat als? en Verdieping in de regio Resultaat
    for (const name of ['Resultaat', 'Wat als?', 'Verdieping'])
      expect(resultaat.contains(heading(name))).toBe(true);
    expect(invoer.contains(heading('Basis'))).toBe(true);
    // geen tweede regio "Resultaat" en geen regio per blok
    expect(screen.getAllByRole('region', { name: 'Resultaat' })).toHaveLength(1);
    for (const name of ['Basis', 'Wat als?', 'Verdieping', 'Oordeel'])
      expect(screen.queryByRole('region', { name })).toBeNull();
    // geen zijkolom en geen eigen scrollgebied voor de invoer meer
    expect(document.querySelectorAll('aside')).toHaveLength(0);
    // de oude kop is weg: geen Scenario's, geen klimaatjaar in de kop, geen statusregel buiten de oordeelkaart
    expect(screen.queryByLabelText("Scenario's")).toBeNull();
    const header = main.querySelector('header')!;
    expect(within(header).queryByLabelText('Klimaatjaar')).toBeNull();
    expect(within(header).getByLabelText('Voorbeelden')).toBeTruthy();
    await waitForResult();
    // precies één "Opnieuw proberen"-plek: alleen bij een fout, en dan in de oordeelkaart
    expect(screen.queryByRole('button', { name: 'Opnieuw proberen' })).toBeNull();
  }, 30000);

  it('DOM-volgorde: skip-link, kop, Basis, oordeel, Wat als?, meer, Verdieping, balk en toast', async () => {
    renderPage();
    await waitForResult();
    const main = screen.getByRole('main');
    // de skip-link is het eerste focusbare element van de pagina
    const skip = screen.getByRole('button', { name: 'Naar resultaat' });
    const firstFocusable = main.querySelector<HTMLElement>(
      'button, a[href], input, select, textarea, [tabindex]',
    );
    expect(firstFocusable).toBe(skip);
    const robustness = screen.getByText(/Robuustheid: zelfde configuratie/).closest('details')!;
    const allKpis = screen.getByText(/^Alle kerngetallen \(8\)/).closest('details')!;
    expectDomOrder(
      [
        skip,
        screen.getByRole('heading', { level: 1 }),
        screen.getByLabelText('Voorbeelden'),
        panel(),
        heading('Basis'),
        screen.getByRole('button', { name: /Bekijk het resultaat/ }),
        heading('Resultaat'),
        screen.getByRole('group', { name: 'Antwoord' }),
        heading('Wat als?'),
        screen.getByLabelText('Buffervolume'),
        screen.getByLabelText('Batterijcapaciteit'),
        screen.getByRole('button', { name: 'Grotere aansluiting' }),
        allKpis,
        robustness,
        heading('Verdieping'),
        screen.getByRole('tablist', { name: 'Detailweergave' }),
        screen.getByTestId('undo-toast'),
      ],
      'pagina',
    );
    // de werkbank heeft drie cellen (grid-gebieden verdict, whatif en more in de CSS): oordeel, Wat als?, meer
    const verdictCell = document.getElementById('ps-oordeel')!.parentElement!;
    const cells = Array.from(verdictCell.parentElement!.children);
    expect(cells).toHaveLength(3);
    expect(cells[0]).toBe(verdictCell);
    expect(cells[1].contains(heading('Wat als?'))).toBe(true);
    expect(cells[2].contains(allKpis) && cells[2].contains(robustness)).toBe(true);
    expect(verdictCell.parentElement!.parentElement).toBe(screen.getByRole('region', { name: 'Resultaat' }));
  }, 30000);

  it('de Verdieping toont het Schema als standaardtabblad, met de keuze zonder of met begrenzer erboven', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: 'Schema', selected: true })).toBeTruthy();
    const mode = screen.getByRole('group', { name: 'Grafieken en kerngetallen' });
    expect(before(heading('Verdieping'), mode)).toBe(true);
    expect(before(mode, screen.getByRole('tablist', { name: 'Detailweergave' }))).toBe(true);
  });
});

describe('werkbank: Basis open of dicht (§2.5, §11.1)', () => {
  it('eerste bezoek: Basis open met de voorbeeldregel; "Bekijk het resultaat" klapt in, bewaart en focust H2 "Resultaat"', async () => {
    renderPage();
    expect(localStorage.getItem(STORAGE_KEYS.basis)).toBeNull();
    expect(screen.getByText(/Ingevuld met voorbeeld „Woning jaren '70 · zonder maatregelen”/)).toBeTruthy();
    expect(screen.getByLabelText('Piekvermogen verwarming')).toBeTruthy();
    expect(screen.queryByRole('toolbar', { name: 'Basis' })).toBeNull();
    await waitForResult();

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Bekijk het resultaat/ }));
    });
    expect(st().basisOpen).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.basis)).toBe('dicht');
    // ingeklapt: de strook met chips; het open paneel blijft in de DOM maar is verborgen
    const strip = screen.getByRole('toolbar', { name: 'Basis' });
    expect(
      within(strip).getByRole('button', { name: 'Piekvermogen verwarming: 8,0 kW, wijzigen' }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Bekijk het resultaat/ })).toBeNull();
    expect(screen.getByLabelText('Piekvermogen verwarming').closest('[hidden]')).not.toBeNull();
    // de hele oordeelkaart in beeld (alleen scrollen als dat nodig is: block 'nearest') en de focus op H2 "Resultaat"
    expect(document.activeElement).toBe(resultHeading());
    const card = document.getElementById('ps-oordeel')!;
    expect(scrollSpy.mock.contexts).toContain(card);
    expect(scrollSpy.mock.calls[scrollSpy.mock.contexts.indexOf(card)][0]).toMatchObject({
      block: 'nearest',
    });

    // Wijzig klapt weer open, bewaard als 'open'
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Wijzig' }));
    });
    expect(st().basisOpen).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.basis)).toBe('open');
    expect(screen.queryByRole('toolbar', { name: 'Basis' })).toBeNull();
  }, 30000);

  it('na herladen met "dicht" bewaard staat de Basis dicht (verse store)', async () => {
    localStorage.setItem(STORAGE_KEYS.basis, 'dicht');
    vi.resetModules();
    const fresh = await import('../../src/concepts/peakshaving/store');
    expect(fresh.useStore.getState().basisOpen).toBe(false);
    localStorage.setItem(STORAGE_KEYS.basis, 'open');
    vi.resetModules();
    const reopened = await import('../../src/concepts/peakshaving/store');
    expect(reopened.useStore.getState().basisOpen).toBe(true);
  });

  it('een deellink opent ingeklapt, zonder dat te bewaren', async () => {
    const input = defaultInput('office');
    input.buffer.volumeM3 = 7.5;
    renderPage(`/peakshaving?c=${encodeInput(input)}`);
    await waitFor(() => expect(st().input.buffer.volumeM3).toBe(7.5));
    expect(st().basisOpen).toBe(false);
    expect(st().openedFromLink).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.basis)).toBeNull();
    const strip = screen.getByRole('toolbar', { name: 'Basis' });
    expect(within(strip).getByRole('button', { name: /^Gebouwfunctie: Kantoor/ })).toBeTruthy();
    expect(screen.getByLabelText('Piekvermogen verwarming').closest('[hidden]')).not.toBeNull();
  }, 30000);
});

describe('werkbank: elk invoerveld van de oude pagina is bereikbaar (§11.2)', () => {
  // Alle veldlabels van de oude blokken Gebouw, Aansluiting, Warmtepomp & afgifte en Maatregelen en de klimaatkeuze uit
  // de kop. Twee labels zijn bewust hernoemd (UX-plan §6, §7 #26): "Scenario's" heet nu "Voorbeelden" en "Bedrijfsmodus"
  // heet "Grafieken en kerngetallen" (in Verdieping).
  const common = [
    'Voorbeelden',
    'Klimaatjaar',
    'Gebouwfunctie',
    'Gebouwmassa',
    'Gebouwmassa (tijdconstante)',
    'Ontwerpbuitentemperatuur',
    'Ontwerpbinnentemperatuur',
    'Setpoint tijdens gebruik',
    'Setpoint buiten gebruik',
    'Stookgrens tijdens gebruik',
    'Traagheid gevel',
    'Opwarmfactor',
    'Warm tapwater',
    'Boilertemperatuur',
    'Aansluitwaarde',
    'Gecontracteerd vermogen',
    'Aandeel voor warmtepomp',
    'Toegestane overschrijdingsuren',
    'Toegestane comfortverliesuren',
    'Stooklijn (afgifte)',
    'Max. aanvoertemperatuur warmtepomp',
    'WP-vermogen',
    'WP-vermogen (A7/W35)',
    'Bijstookelement',
    'Carnot-rendement',
    'Buffervolume',
    'Laadstrategie buffer',
    'Batterijcapaciteit',
    'Batterijvermogen automatisch (0,5 C)',
    'Batterijvermogen (C-waarde)',
    'Grafieken en kerngetallen',
  ];
  const perKind: Record<BuildingKind, string[]> = {
    single: ['Piekvermogen verwarming', 'Tapwaterbehoefte', 'Boilervat'],
    multi: [
      'Aantal woningen',
      'Piekvermogen verwarming (totaal)',
      'Tapwaterbehoefte per woning',
      'Boilervat (collectief)',
    ],
    office: [
      'Piekvermogen verwarming',
      'Gebruik vanaf',
      'Gebruik tot',
      'Opstooktijd',
      'Nachtverlaging',
      'Tapwaterbehoefte',
      'Boilervat',
    ],
  };

  for (const kind of ['single', 'multi', 'office'] as const) {
    for (const open of [true, false]) {
      it(`${kind}, Basis ${open ? 'open' : 'dicht'}, met grootverbruik`, () => {
        // de velden die alleen onder een voorwaarde verschijnen: tapwater aan, grootverbruik, handmatig WP-vermogen
        // en een eigen batterijvermogen
        const input = defaultInputOfKind(kind);
        input.building.dhw.enabled = true;
        input.grid.connection = 'grootverbruik';
        input.heatPump.sizingMode = 'manual';
        input.battery.capacityKwh = 10;
        input.battery.powerKw = 5;
        act(() => {
          st().loadInput(input, null);
          st().setBasisOpen(open, false);
        });
        renderPage();
        for (const label of [...common, ...perKind[kind]])
          expect(() => screen.getByLabelText(label), `${kind}: ${label}`).not.toThrow();
        // nergens "per woning" bij een kantoor
        if (kind === 'office') expect(panel().textContent).not.toMatch(/per woning/);
      }, 30000);
    }
  }
});

describe('werkbank: printen (§6, §11.7)', () => {
  it('printvolgorde: samenvatting, oordeel, advies, Alle kerngetallen en Robuustheid open; de rest niet op papier', async () => {
    renderPage();
    await waitForResult();
    const main = screen.getByRole('main');
    const summary = main.querySelector('section[aria-hidden="true"]')!;
    expect(summary.textContent).toMatch(/^Installatieconcepten — Peakshaving/);
    const card = document.getElementById('ps-oordeel')!;
    const advice = screen.getByLabelText('Advies');
    const allKpis = screen.getByText(/^Alle kerngetallen \(8\)/).closest('details')!;
    const robustness = screen.getByText(/Robuustheid: zelfde configuratie/).closest('details')!;
    expectDomOrder([summary, card, advice, allKpis, robustness], 'print');
    expect(allKpis.contains(screen.getByLabelText('Kerngetallen'))).toBe(true);

    /** Staat het element (of een voorouder) buiten de print? */
    const noPrint = (el: Element): boolean => el.closest('.noPrint') !== null;
    for (const el of [card, advice, allKpis, robustness]) expect(noPrint(el)).toBe(false);
    for (const el of [
      main.querySelector('header')!,
      panel(),
      heading('Wat als?'),
      heading('Verdieping'),
      screen.getByTestId('undo-toast'),
      screen.getByRole('button', { name: 'Naar resultaat' }),
    ])
      expect(noPrint(el)).toBe(true);
    // in de oordeelkaart blijven kop, meterbalk en tegels; de knoppen gaan niet mee
    expect(noPrint(within(card).getByRole('group', { name: 'Antwoord' }))).toBe(false);
    for (const b of within(card).queryAllByRole('button')) expect(noPrint(b), b.textContent ?? '').toBe(true);

    // beforeprint klapt beide <details> open, afterprint weer dicht
    expect(allKpis.open || robustness.open).toBe(false);
    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    expect(allKpis.open && robustness.open).toBe(true);
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(allKpis.open || robustness.open).toBe(false);
  }, 30000);
});
