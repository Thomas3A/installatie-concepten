// @vitest-environment jsdom
// Verdieping (UX-plan §6, §10 WP-E): kop "Verdieping" (id ps-verdieping, anker depth, noPrint) met de keuze
// "Grafieken en kerngetallen" (bedrijfsmodus, met toelichting), daaronder de regio "Detailweergave" met de tabbladen
// in de volgorde van TAB_LABELS en Schema als standaard; toetsenbord (pijlen, Home, End, roving tabindex);
// showInDepth (lichte module depthLinks) voor links van buiten.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Engine } from '../../src/concepts/peakshaving/model/engine';
import { configureEngine, useStore } from '../../src/concepts/peakshaving/store';
import { HELP, TAB_LABELS } from '../../src/concepts/peakshaving/texts';
import { DepthSection } from '../../src/concepts/peakshaving/ui/depth/DepthSection';
import {
  DEPTH_SECTION_ID,
  DEPTH_TABS,
  showInDepth,
  tabButtonId,
  tabPanelId,
} from '../../src/concepts/peakshaving/ui/depth/depthLinks';

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
});

const st = () => useStore.getState();
const initial = st();

/** Rekenmotor die niets doet: de tabbladen en de modusknop vragen wel om een berekening, maar hier telt alleen de UI. */
const idleEngine = (): Engine =>
  ({ handle: async () => {}, climate: async () => Promise.reject(new Error('niet nodig')) }) as Engine;

beforeEach(() => {
  localStorage.clear();
  configureEngine({ mainThread: true, createEngine: idleEngine });
  useStore.setState({
    input: initial.input,
    ranges: initial.ranges,
    scenarioId: initial.scenarioId,
    tab: 'concept',
    analysis: null,
    sensitivity: null,
    undo: null,
    notice: null,
  });
});

afterEach(() => {
  cleanup();
  configureEngine();
  delete (window as { matchMedia?: unknown }).matchMedia;
});

const tabNames = (): string[] => screen.getAllByRole('tab').map((t) => t.textContent ?? '');
const tab = (name: string): HTMLElement => screen.getByRole('tab', { name });
const tablist = (): HTMLElement => screen.getByRole('tablist', { name: 'Detailweergave' });

describe('Verdieping: opbouw', () => {
  it('kop "Verdieping" met id ps-verdieping, anker depth, niet in de print; één regio "Detailweergave"', () => {
    render(<DepthSection />);
    const h2 = screen.getByRole('heading', { level: 2, name: 'Verdieping' });
    expect(h2.id).toBe(DEPTH_SECTION_ID);
    expect(DEPTH_SECTION_ID).toBe('ps-verdieping');
    const root = document.querySelector<HTMLElement>('[data-tour="depth"]')!;
    expect(root).toBeTruthy();
    expect(root.contains(h2)).toBe(true);
    expect(root.classList.contains('noPrint')).toBe(true);
    // binnen "Resultaat" is de Verdieping een blok met een kop, geen tweede regio
    expect(root.tagName).toBe('DIV');
    const regions = screen.getAllByRole('region');
    expect(regions.map((r) => r.getAttribute('aria-label'))).toEqual(['Detailweergave']);
    expect(within(regions[0]).getByRole('tablist')).toBe(tablist());
    // de modusschakelaar staat boven de tabbladen
    const group = screen.getByRole('group', { name: 'Grafieken en kerngetallen' });
    expect(group.compareDocumentPosition(tablist()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText('Bedrijfsmodus')).toBeNull();
  });

  it('tabbladen in de volgorde van TAB_LABELS met Schema als standaard; ids en aria blijven', () => {
    render(<DepthSection />);
    expect(tabNames()).toEqual(['Schema', 'Koude week', 'Jaar', 'Gevoeligheid', 'Uitleg']);
    expect(tabNames()).toEqual(Object.values(TAB_LABELS));
    expect(DEPTH_TABS).toEqual(['concept', 'koude-week', 'jaar', 'gevoeligheid', 'uitleg']);
    for (const t of DEPTH_TABS) {
      expect(tabButtonId(t)).toBe(`ps-tab-${t}`);
      expect(tabPanelId(t)).toBe(`ps-panel-${t}`);
      const btn = document.getElementById(`ps-tab-${t}`)!;
      expect(btn.getAttribute('role')).toBe('tab');
      expect(btn.getAttribute('aria-controls')).toBe(`ps-panel-${t}`);
    }
    expect(tab('Schema').getAttribute('aria-selected')).toBe('true');
    // roving tabindex: alleen het gekozen tabblad is een tabstop
    expect(screen.getAllByRole('tab').map((t) => t.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    const panel = screen.getByRole('tabpanel');
    expect(panel.id).toBe('ps-panel-concept');
    expect(panel.getAttribute('aria-labelledby')).toBe('ps-tab-concept');
    expect(within(panel).getByText(/Het conceptschema verschijnt/)).toBeTruthy();
  });

  it('een klik op een tabblad toont dat paneel', () => {
    render(<DepthSection />);
    act(() => fireEvent.click(tab('Jaar')));
    expect(st().tab).toBe('jaar');
    expect(tab('Jaar').getAttribute('aria-selected')).toBe('true');
    expect(tab('Jaar').tabIndex).toBe(0);
    expect(tab('Schema').tabIndex).toBe(-1);
    const panel = screen.getByRole('tabpanel');
    expect(panel.id).toBe('ps-panel-jaar');
    expect(within(panel).getByText(/De jaargrafieken verschijnen/)).toBeTruthy();

    act(() => fireEvent.click(tab('Koude week')));
    expect(within(screen.getByRole('tabpanel')).getByText(/De koude week wordt berekend/)).toBeTruthy();
  });
});

describe('Verdieping: toetsenbord', () => {
  it('pijlen (rondgaand), Home en End wisselen van tabblad en zetten de focus erop', () => {
    render(<DepthSection />);
    tab('Schema').focus();
    const key = (k: string): boolean => fireEvent.keyDown(document.activeElement!, { key: k });

    act(() => void key('ArrowRight'));
    expect(st().tab).toBe('koude-week');
    expect(document.activeElement).toBe(tab('Koude week'));

    act(() => void key('ArrowLeft'));
    act(() => void key('ArrowLeft'));
    expect(st().tab).toBe('uitleg');
    expect(document.activeElement).toBe(tab('Uitleg'));

    act(() => void key('ArrowRight'));
    expect(st().tab).toBe('concept');

    act(() => void key('End'));
    expect(st().tab).toBe('uitleg');
    act(() => void key('Home'));
    expect(st().tab).toBe('concept');
    expect(document.activeElement).toBe(tab('Schema'));

    // andere toetsen laat de tabrij met rust (bijv. Tab of Enter)
    let notCancelled = true;
    act(() => {
      notCancelled = key('a');
    });
    expect(notCancelled).toBe(true);
    expect(st().tab).toBe('concept');
  });
});

describe('Verdieping: grafieken en kerngetallen (bedrijfsmodus)', () => {
  it('Zonder/Met begrenzer zet grid.mode; nogmaals dezelfde keuze wijzigt de invoer niet', () => {
    render(<DepthSection />);
    const group = screen.getByRole('group', { name: 'Grafieken en kerngetallen' });
    const without = within(group).getByRole('button', { name: 'Zonder begrenzer' });
    const withLimiter = within(group).getByRole('button', { name: 'Met begrenzer' });
    expect(without.getAttribute('aria-pressed')).toBe('true');
    expect(withLimiter.getAttribute('aria-pressed')).toBe('false');

    // de al gekozen optie: het voorbeeld blijft staan, er komt geen invoerwijziging
    const before = st().input;
    act(() => fireEvent.click(without));
    expect(st().input).toBe(before);
    expect(st().scenarioId).toBe(initial.scenarioId);

    act(() => fireEvent.click(withLimiter));
    expect(st().input.grid.mode).toBe('limited');
    expect(withLimiter.getAttribute('aria-pressed')).toBe('true');
    expect(without.getAttribute('aria-pressed')).toBe('false');
    // een weergavekeuze (die wel in de deellink gaat): het voorbeeld blijft staan, er komt geen eigen invoer
    expect(st().scenarioId).toBe(initial.scenarioId);
    expect(st().ownInput).toBeNull();
    act(() => fireEvent.click(without));
    expect(st().input.grid.mode).toBe('exceedance');
    expect(st().input).toEqual(before);
    expect(st().scenarioId).toBe(initial.scenarioId);
  });

  it('de (i) toont HELP.mode', () => {
    render(<DepthSection />);
    act(() =>
      fireEvent.click(screen.getByRole('button', { name: 'Toelichting: Grafieken en kerngetallen' })),
    );
    expect(screen.getByRole('note').textContent).toBe(HELP.mode);
  });
});

describe('showInDepth (links van buiten, zoals "toon in grafieken")', () => {
  it('kiest het tabblad, scrolt naar Verdieping en zet de focus op het tabblad', () => {
    render(<DepthSection />);
    const h2 = screen.getByRole('heading', { level: 2, name: 'Verdieping' });
    const scrolled = vi.fn();
    h2.scrollIntoView = scrolled;
    act(() => showInDepth('koude-week'));
    expect(st().tab).toBe('koude-week');
    expect(scrolled).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(document.activeElement).toBe(tab('Koude week'));
  });

  it('scrolt direct bij prefers-reduced-motion', () => {
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
    render(<DepthSection />);
    const h2 = screen.getByRole('heading', { level: 2, name: 'Verdieping' });
    const scrolled = vi.fn();
    h2.scrollIntoView = scrolled;
    act(() => showInDepth('jaar'));
    expect(scrolled).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' });
    expect(document.activeElement).toBe(tab('Jaar'));
  });
});
