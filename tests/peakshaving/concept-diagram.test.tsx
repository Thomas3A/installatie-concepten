// @vitest-environment jsdom
// Rooktest van het tabblad Schema: plaatshouder zonder resultaat, schema met toegankelijke samenvatting, het schema
// volgt het uur van de scrubber, een korte intro, en de deeltjes staan stil buiten beeld en bij minder beweging.
import { act, cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import refJson from '../../src/concepts/peakshaving/data/referentiejaren.json';
import { analyze, type Analysis } from '../../src/concepts/peakshaving/model/analysis';
import { decodeReferenceYear, type ReferenceYearsJson } from '../../src/concepts/peakshaving/model/climate';
import { findScenario } from '../../src/concepts/peakshaving/scenarios';
import { useStore } from '../../src/concepts/peakshaving/store';
import { ConceptDiagram } from '../../src/concepts/peakshaving/ui/concept/ConceptDiagram';

const climate = decodeReferenceYear(refJson as unknown as ReferenceYearsJson, 'T5');
const analyses = new Map<string, Analysis>();
function analysisOf(id: string): Analysis {
  let a = analyses.get(id);
  if (!a) {
    a = analyze(findScenario(id)!.build(), climate);
    analyses.set(id, a);
  }
  return a;
}

afterEach(() => {
  cleanup();
  act(() => useStore.setState({ analysis: null, scrubHour: null }));
});

describe('ConceptDiagram', () => {
  it('toont een plaatshouder zolang er geen resultaat is', () => {
    act(() => useStore.setState({ analysis: null, scrubHour: null }));
    render(createElement(ConceptDiagram));
    expect(screen.getByText(/Het conceptschema verschijnt/)).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('heeft een intro van één zin (UX-plan §7 #17)', () => {
    render(createElement(ConceptDiagram));
    expect(
      screen.getByText(
        'Wat de installatie doet in het gekozen uur, standaard het piekuur van de koude week.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/deeltjes bewegen sneller/)).toBeNull();
  });

  it.each(['woning-basis', 'kantoor-buffer-batterij'])('rendert %s en volgt het gekozen uur', (id) => {
    const a = analysisOf(id);
    act(() => useStore.setState({ analysis: a, scrubHour: null }));
    render(createElement(ConceptDiagram));
    const label0 = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(label0).toMatch(/^Conceptschema op .+ aan de meter .+ kW/);
    expect(document.querySelector('.sr-only')?.textContent).toMatch(/Meterkast: aansluiting/);
    // het scrubber-bereik staat onder het schema
    expect(screen.getByLabelText('Uur in de koude week')).toBeTruthy();
    act(() => useStore.getState().setScrubHour(a.coldWeek.from + 3));
    expect(screen.getByRole('img').getAttribute('aria-label')).not.toBe(label0);
  });
});

describe('animatie van de deeltjes', () => {
  let raf: ReturnType<typeof vi.fn>;
  let caf: ReturnType<typeof vi.fn>;
  const original = { raf: window.requestAnimationFrame, caf: window.cancelAnimationFrame };

  beforeEach(() => {
    // het frame zelf draait niet: alleen tellen wanneer de lus start en stopt
    raf = vi.fn(() => 42);
    caf = vi.fn();
    window.requestAnimationFrame = raf as unknown as typeof window.requestAnimationFrame;
    window.cancelAnimationFrame = caf as unknown as typeof window.cancelAnimationFrame;
  });

  afterEach(() => {
    window.requestAnimationFrame = original.raf;
    window.cancelAnimationFrame = original.caf;
    delete (window as { matchMedia?: unknown }).matchMedia;
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  });

  const figure = (): HTMLElement => screen.getByRole('img').closest('figure')!;

  it('loopt in beeld, pauzeert buiten beeld en loopt daarna verder', () => {
    let notify: IntersectionObserverCallback | null = null;
    class FakeObserver {
      constructor(cb: IntersectionObserverCallback) {
        notify = cb;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }
    (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeObserver;
    act(() => useStore.setState({ analysis: analysisOf('woning-buffer-batterij'), scrubHour: null }));
    render(createElement(ConceptDiagram));
    // vóór de eerste waarneming geldt het schema als zichtbaar: niets staat eerst stil en springt dan aan
    expect(figure().dataset.animation).toBe('running');
    expect(raf).toHaveBeenCalledTimes(1);
    expect(notify).not.toBeNull();

    const see = (isIntersecting: boolean): void =>
      act(() => notify!([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver));
    see(false);
    expect(figure().dataset.animation).toBe('paused');
    expect(caf).toHaveBeenCalledWith(42);
    expect(raf).toHaveBeenCalledTimes(1);

    see(true);
    expect(figure().dataset.animation).toBe('running');
    expect(raf).toHaveBeenCalledTimes(2);
  });

  it('start niet bij prefers-reduced-motion', () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce'),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    act(() => useStore.setState({ analysis: analysisOf('woning-buffer-batterij'), scrubHour: null }));
    render(createElement(ConceptDiagram));
    expect(figure().dataset.animation).toBe('paused');
    expect(raf).not.toHaveBeenCalled();
  });
});
