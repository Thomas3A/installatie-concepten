// @vitest-environment jsdom
// Samenvoegcontrole na de reviewfixes: knop "Opnieuw proberen" bij een rekenfout, scrollgebied vanaf 1 px overloop
// en één main-landmark (zonder losse complementary) op de pagina van het klimaatplafond.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultInput } from '../../src/concepts/peakshaving/data/defaults';
import { useStore } from '../../src/concepts/peakshaving/store';
import PeakshavingPage from '../../src/concepts/peakshaving/ui/PeakshavingPage';
import KlimaatplafondPage from '../../src/concepts/klimaatplafond/ui/KlimaatplafondPage';
import { ScrollRegion } from '../../src/ui/ScrollRegion';

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

beforeAll(() => {
  class RO {
    observe(): void {}
    disconnect(): void {}
    unobserve(): void {}
  }
  (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
  Element.prototype.scrollIntoView = function scrollIntoView(): void {};
});

const initialRetry = useStore.getState().retry;

beforeEach(() => {
  act(() => {
    useStore.getState().loadInput(defaultInput('residential'), null);
    useStore.getState().setTab('koude-week');
  });
});

afterEach(() => {
  cleanup();
  useStore.setState({ retry: initialRetry, error: null });
});

describe('peakshaving: rekenfout', () => {
  it('toont naast de rekenfout een knop "Opnieuw proberen" die opnieuw rekent', async () => {
    render(
      <MemoryRouter initialEntries={['/peakshaving']}>
        <PeakshavingPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByLabelText('Kerngetallen')).toBeTruthy(), { timeout: 20000 });
    expect(screen.queryByRole('button', { name: 'Opnieuw proberen' })).toBeNull();

    const retry = vi.fn();
    act(() =>
      useStore.setState({
        busy: false,
        error: 'werkelijke klimaatjaren niet geladen (proef)',
        retry,
      }),
    );
    expect(screen.getByText(/Rekenfout: werkelijke klimaatjaren niet geladen/)).toBeTruthy();
    act(() => screen.getByRole('button', { name: 'Opnieuw proberen' }).click());
    expect(retry).toHaveBeenCalledTimes(1);

    // tijdens het rekenen geen knop (er wordt al gerekend)
    act(() => useStore.setState({ busy: true }));
    expect(screen.queryByRole('button', { name: 'Opnieuw proberen' })).toBeNull();
  });
});

describe('scrollgebied', () => {
  it('wordt al bij 1 px overloop benoemd en focusbaar (zoals axe het telt)', () => {
    const sw = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
    const cw = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 329 });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 328 });
    try {
      render(
        <ScrollRegion label="Formule bij proef">
          <span>x</span>
        </ScrollRegion>,
      );
      const region = screen.getByRole('region', { name: 'Formule bij proef' });
      expect(region.getAttribute('tabindex')).toBe('0');
    } finally {
      if (sw) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', sw);
      if (cw) Object.defineProperty(HTMLElement.prototype, 'clientWidth', cw);
    }
  });
});

describe('klimaatplafond: landmarks', () => {
  it('staat in één main; de scenariokaart is een benoemde sectie, geen losse complementary', () => {
    // jsdom heeft geen canvas: het plattegrondschema tekent dan niets
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    render(
      <MemoryRouter initialEntries={['/klimaatplafond']}>
        <KlimaatplafondPage />
      </MemoryRouter>,
    );
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0].querySelector('h1')?.textContent).toBe('Klimaatplafond met 6-weg-klep');
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.getByRole('region', { name: 'Scenario' })).toBeTruthy();
    cleanup();
    getContext.mockRestore();
  });
});
