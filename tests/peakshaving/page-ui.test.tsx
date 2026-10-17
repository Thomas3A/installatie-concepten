// @vitest-environment jsdom
// Pagina peakshaving: landmarks, deellink uit de adresbalk, invoervelden (leeg, minteken, eenheid),
// klimaatstatistiek, robuustheidstabel, uitleg (formules, inhoudsopgave) en scrollgebieden. De opbouw van de werkbank
// (volgorde, Basis open/dicht, print) staat in workbench-ui.test.tsx.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultInput } from '../../src/concepts/peakshaving/data/defaults';
import { encodeInput } from '../../src/concepts/peakshaving/share';
import { useStore } from '../../src/concepts/peakshaving/store';
import { EXPLAIN } from '../../src/concepts/peakshaving/texts';
import PeakshavingPage from '../../src/concepts/peakshaving/ui/PeakshavingPage';
import { ScrollRegion } from '../../src/ui/ScrollRegion';

// uPlot tekent op canvas; jsdom heeft geen canvas, dus een lege stand-in
vi.mock('uplot', () => {
  class FakePlot {
    over = document.createElement('div');
    ctx = { canvas: document.createElement('canvas') };
    cursor = { idx: null };
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

beforeAll(() => {
  class RO {
    observe(): void {}
    disconnect(): void {}
    unobserve(): void {}
  }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
  // jsdom kent scrollIntoView niet
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
});

beforeEach(() => {
  // eerste bezoek: de Basis open (een deellink in een vorige test klapt hem dicht, zonder te bewaren)
  localStorage.clear();
  act(() => {
    useStore.getState().loadInput(defaultInput('residential'), null);
    useStore.getState().setBasisOpen(true, false);
    useStore.getState().setTab('koude-week');
  });
});

afterEach(() => cleanup());

/** Toont het huidige pad + zoekdeel van de router, om de adresbalk te controleren. */
function LocationProbe() {
  const loc = useLocation();
  return <output data-testid="locatie">{loc.pathname + loc.search}</output>;
}

function renderPage(path = '/peakshaving') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PeakshavingPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

const waitForResults = (): Promise<unknown> =>
  waitFor(() => expect(screen.getByLabelText('Kerngetallen')).toBeTruthy(), { timeout: 20000 });

/** Typ een waarde in een getalveld en verlaat het veld. */
function typeAndBlur(field: HTMLInputElement, text: string): void {
  act(() => {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: text } });
    fireEvent.blur(field);
  });
}

describe('peakshaving-pagina: structuur en deellink', () => {
  it('de hele pagina staat in één main; resultaat en invoer zijn benoemde secties', async () => {
    renderPage();
    const mains = document.querySelectorAll('main');
    expect(mains).toHaveLength(1);
    expect(mains[0].querySelector('h1')?.textContent).toMatch(/Peakshaving/);
    expect(mains[0].contains(screen.getByLabelText('Klimaatjaar'))).toBe(true);
    expect(screen.getByRole('region', { name: 'Resultaat' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Invoer' })).toBeTruthy();
    expect(document.querySelectorAll('aside')).toHaveLength(0);
    await waitForResults();
  }, 30000);

  it('na het openen van een deellink verdwijnt ?c= uit de adresbalk (wijzigingen overleven herladen)', async () => {
    const input = defaultInput('office');
    input.buffer.volumeM3 = 7.5;
    renderPage(`/peakshaving?c=${encodeInput(input)}`);
    await waitFor(() => expect(useStore.getState().input.buffer.volumeM3).toBe(7.5));
    await waitFor(() => expect(screen.getByTestId('locatie').textContent).toBe('/peakshaving'));
    expect(useStore.getState().input.building.use).toBe('office');
  }, 30000);
});

describe('peakshaving-pagina: invoervelden', () => {
  it('een leeggemaakt veld zet de oude waarde terug in plaats van het minimum', async () => {
    renderPage();
    await waitForResults();
    const field = screen.getByLabelText('Piekvermogen verwarming') as HTMLInputElement;
    const before = useStore.getState().input;
    typeAndBlur(field, '');
    expect(useStore.getState().input.building.designLoadKw).toBe(before.building.designLoadKw);
    expect(useStore.getState().input.buffer).toEqual(before.buffer);
    expect(field.value).toBe('8,0');
    // ook onzin wordt niet als 0 gelezen
    typeAndBlur(field, 'abc');
    expect(useStore.getState().input.building.designLoadKw).toBe(before.building.designLoadKw);
  }, 30000);

  it('negatieve waarden tonen een echt minteken en zijn zo ook weer in te voeren', async () => {
    renderPage();
    const field = screen.getByLabelText('Ontwerpbuitentemperatuur') as HTMLInputElement;
    expect(field.value).toBe('−10');
    typeAndBlur(field, '−12');
    expect(useStore.getState().input.building.designOutdoorC).toBe(-12);
    expect(field.value).toBe('−12');
    await waitForResults();
  }, 30000);

  it('schuif met waarde en eenheid voor de schermlezer; eenheid gekoppeld aan het getalveld', async () => {
    renderPage();
    const slider = screen.getByLabelText('Buffervolume (schuif)');
    expect(slider.getAttribute('aria-valuetext')).toBe('0,00 m³');
    const field = screen.getByLabelText('Piekvermogen verwarming');
    const unitId = field.getAttribute('aria-describedby');
    expect(unitId).toBeTruthy();
    expect(document.getElementById(unitId!)?.textContent).toBe('kW');
    expect(screen.getByLabelText('Piekvermogen verwarming (schuif)').getAttribute('aria-valuetext')).toBe(
      '8,0 kW',
    );
    await waitForResults();
  }, 30000);

  it('eenheden: uur/jaar en kWh/dag; eigen tijdconstante in nl-NL-notatie', async () => {
    renderPage();
    const describedUnits = Array.from(document.querySelectorAll('input[aria-describedby]')).map(
      (i) => document.getElementById(i.getAttribute('aria-describedby')!)?.textContent,
    );
    expect(describedUnits).toContain('uur/jaar');
    expect(describedUnits).toContain('kWh/dag');
    expect(describedUnits).not.toContain('h/jaar');
    act(() => {
      useStore.getState().update((i) => ({ ...i, building: { ...i.building, timeConstantH: 37.5 } }));
    });
    expect(screen.getByRole('button', { name: 'Eigen 37,5 h' })).toBeTruthy();
    await waitForResults();
    expect(screen.getAllByText('uur/jaar').length).toBeGreaterThanOrEqual(2);
  }, 30000);
});

describe('peakshaving-pagina: klimaatjaar en robuustheid', () => {
  it('de statistiek van het gekozen klimaatjaar staat onder het veld (Meer instellingen › Klimaat) en op de keuzelijst', async () => {
    renderPage();
    const select = screen.getByLabelText('Klimaatjaar') as HTMLSelectElement;
    const statsId = select.getAttribute('aria-describedby')!;
    const stats = document.getElementById(statsId)?.textContent ?? '';
    expect(stats).toContain('Klimaatjaar T5');
    expect(stats).toContain('1.202 uur < 0 °C');
    expect(stats).toContain('T min −14,0 °C');
    expect(select.title).toContain('1.202 uur < 0 °C');
    act(() => {
      fireEvent.change(select, { target: { value: 'knmi-2012' } });
    });
    expect(document.getElementById(statsId)?.textContent).toContain('T min −18,8 °C');
    await waitForResults();
  }, 30000);

  it('robuustheidstabel: zeven korte koppen, uitleg van de uren in de toelichting', async () => {
    renderPage();
    await waitForResults();
    const details = screen.getByText(/Robuustheid: zelfde configuratie/).closest('details')!;
    const heads = Array.from(details.querySelectorAll('thead th')).map((th) =>
      (th.textContent ?? '').replace(/­/g, ''),
    );
    expect(heads).toEqual([
      'Klimaatjaar',
      'Piek warmtevraag [kW]',
      'Piek aan de meter [kW]',
      'Overschrijding [uur/jaar]',
      'Comfortverlies [uur/jaar]',
      'SCOP',
      'Elektriciteit [kWh/jaar]',
    ]);
    expect(details.textContent).toMatch(/zonder begrenzer/);
    expect(details.textContent).toMatch(/als de aansluiting begrenst/);
  }, 30000);
});

describe('peakshaving-pagina: uitleg en afspelen', () => {
  it('elke sectie van de uitleg heeft een formule in blokweergave', () => {
    renderPage();
    act(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'Uitleg' }));
    });
    for (const sec of EXPLAIN) {
      const el = document.getElementById(`uitleg-${sec.id}`)!;
      expect(el.querySelector('.katex-display'), sec.title).not.toBeNull();
    }
  });

  it('de inhoudsopgave verplaatst de focus naar de kop van de gekozen sectie', () => {
    renderPage();
    act(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'Uitleg' }));
    });
    const nav = screen.getByRole('navigation', { name: 'Inhoud uitleg' });
    const btn = Array.from(nav.querySelectorAll('button')).find((b) => b.textContent === 'Batterij')!;
    act(() => {
      fireEvent.click(btn);
    });
    expect(document.activeElement?.id).toBe('uitleg-batterij-kop');
    expect(document.activeElement?.textContent).toBe('5. Batterij');
  });

  it('afspeelknop: de zichtbare naam wisselt, zonder aria-pressed', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('Uur in de koude week')).toBeTruthy(), {
      timeout: 20000,
    });
    const play = screen.getByRole('button', { name: /Speel af/ });
    expect(play.getAttribute('aria-pressed')).toBeNull();
    act(() => {
      fireEvent.click(play);
    });
    const pause = screen.getByRole('button', { name: /Pauze/ });
    expect(pause.getAttribute('aria-pressed')).toBeNull();
    act(() => {
      fireEvent.click(pause);
    });
  }, 30000);
});

describe('ScrollRegion', () => {
  it('alleen als er horizontaal te scrollen valt: benoemd gebied in de tabvolgorde', () => {
    const sw = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(600);
    const cw = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
    const { unmount } = render(
      <ScrollRegion label="Brede tabel">
        <table />
      </ScrollRegion>,
    );
    const region = screen.getByRole('region', { name: 'Brede tabel' });
    expect(region.getAttribute('tabindex')).toBe('0');
    unmount();
    sw.mockReturnValue(300);
    render(
      <ScrollRegion label="Smalle tabel">
        <table />
      </ScrollRegion>,
    );
    expect(screen.queryByRole('region', { name: 'Smalle tabel' })).toBeNull();
    sw.mockRestore();
    cw.mockRestore();
  });
});
