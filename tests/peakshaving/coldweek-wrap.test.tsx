// @vitest-environment jsdom
// Koude week over de jaargrens (spec §4.4): de week van winter1979 begint op 31 december en loopt door tot 6 januari.
// Analyse, standaarduur, conceptschema, scrubber en de koude-weekgrafieken rekenen in doorlopende uren en lezen de
// waarden op wrapHour(t); de as van de grafieken plakt de januari-uren na 31 december.
import { act, cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaultInput } from '../../src/concepts/peakshaving/data/defaults';
import { analyze, coldSpellOf, type Analysis } from '../../src/concepts/peakshaving/model/analysis';
import { COLD_WEEK_HOURS, formatHour, wrapHour } from '../../src/concepts/peakshaving/model/climate';
import type { PeakshavingInput } from '../../src/concepts/peakshaving/model/types';
import { defaultScrubHour, useStore } from '../../src/concepts/peakshaving/store';
import { axisOf, ColdWeekCharts } from '../../src/concepts/peakshaving/ui/charts/ColdWeekCharts';
import { Scrubber } from '../../src/concepts/peakshaving/ui/charts/Scrubber';
import { ConceptDiagram } from '../../src/concepts/peakshaving/ui/concept/ConceptDiagram';
import { hourState, windowRefs } from '../../src/concepts/peakshaving/ui/concept/conceptGeometry';
import { refYear } from './helpers';

const HOURS = 8760;

// uPlot tekent op canvas; de stand-in onthoudt de gegevens van elke grafiek
const plotted = vi.hoisted(() => [] as unknown[][]);
vi.mock('uplot', () => {
  class FakePlot {
    over = document.createElement('div');
    ctx = { canvas: document.createElement('canvas') };
    cursor = { idx: null };
    series = [];
    constructor(_opts: unknown, data: unknown[], el: HTMLElement) {
      plotted.push(data);
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

afterEach(() => {
  cleanup();
  plotted.length = 0;
  act(() => useStore.setState({ analysis: null, scrubHour: null }));
});

function woning(climateYear: string): PeakshavingInput {
  return { ...defaultInput('residential'), climateYear };
}

let w79: Analysis;
beforeAll(() => {
  w79 = analyze(woning('winter1979'), refYear('winter1979'));
});

describe('analyse: koude week over de jaargrens', () => {
  it('winter1979, woning-defaults: start 8736, venster 8712 … 8928 (216 uur)', () => {
    expect(w79.coldWeek.start).toBe(8736);
    expect(w79.coldWeek.from).toBe(8712);
    expect(w79.coldWeek.to).toBe(8928);
    // gemiddelde buitentemperatuur over de week, cyclisch gelezen
    const T = refYear('winter1979').T;
    let s = 0;
    for (let t = 8736; t < 8736 + COLD_WEEK_HOURS; t++) s += T[wrapHour(t)];
    expect(w79.coldWeek.meanOutdoorC).toBeCloseTo(s / COLD_WEEK_HOURS, 9);
    expect(w79.coldWeek.meanOutdoorC).toBeCloseTo(-10.2, 1);
  });

  it('de koudegolf rond de week loopt over de jaargrens en is eindig', () => {
    const spell = coldSpellOf(refYear('winter1979').T, 8736);
    expect(Number.isFinite(spell.meanC)).toBe(true);
    expect(spell.meanC).toBeLessThan(0);
    // de vorstperiode van eind december tot in januari 1979 is langer dan de week zelf
    expect(spell.days).toBeGreaterThan(7);
    expect(w79.coldSpell).toEqual(spell);
  });

  it('een koudegolf die niet over de jaargrens loopt blijft gelijk', () => {
    // T5 (week 14 januari): hetzelfde als de niet-cyclische zoektocht
    const T = new Float64Array(HOURS).fill(5);
    for (let t = 24 * 10; t < 24 * 20; t++) T[t] = -3;
    expect(coldSpellOf(T, 24 * 12)).toEqual({ days: 10, meanC: -3 });
    // een vorstperiode van 29 december t/m 3 januari telt als één reeks van 6 dagen
    T.fill(5);
    for (let t = HOURS - 3 * 24; t < HOURS; t++) T[t] = -4;
    for (let t = 0; t < 3 * 24; t++) T[t] = -4;
    expect(coldSpellOf(T, HOURS - 48)).toEqual({ days: 6, meanC: -4 });
  });

  it('standaarduur: het piekuur van de week als doorlopend uur, waarde op wrapHour', () => {
    const h = defaultScrubHour(w79);
    expect(h).toBeGreaterThanOrEqual(8736);
    expect(h).toBeLessThan(8736 + COLD_WEEK_HOURS);
    const { pGrid } = w79.main.series;
    let max = -Infinity;
    for (let t = 8736; t < 8736 + COLD_WEEK_HOURS; t++) max = Math.max(max, pGrid[wrapHour(t)]);
    expect(pGrid[wrapHour(h)]).toBe(max);
  });

  it('conceptschema: uurtoestand en vensterreferenties lezen cyclisch', () => {
    const jan = hourState(w79, 8760 + 40);
    expect({ ...jan, t: 0 }).toEqual({ ...hourState(w79, 40), t: 0 });
    expect(jan.t).toBe(8800);
    const refs = windowRefs(w79);
    for (const v of Object.values(refs)) expect(Number.isFinite(v)).toBe(true);
    // de piek aan de meter in het venster telt mee, ook in januari
    let peak = 0;
    for (let t = 8712; t < 8928; t++) peak = Math.max(peak, w79.main.series.pGrid[wrapHour(t)]);
    expect(refs.maxStackKw).toBeGreaterThanOrEqual(peak);
  });
});

describe('as van de koude-weekgrafieken', () => {
  it('zonder jaargrens het jaar zelf; anders verlengd met december ervoor of januari erna', () => {
    expect(axisOf({ coldWeek: { start: 314, from: 290, to: 506, meanOutdoorC: 0 } })).toEqual({
      x0: 0,
      n: HOURS,
    });
    expect(axisOf(w79)).toEqual({ x0: 0, n: 8928 });
    // T1 (week vanaf uur 4): de marge begint op 31 december 04:00
    expect(axisOf({ coldWeek: { start: 4, from: -20, to: 196, meanOutdoorC: 0 } })).toEqual({
      x0: -20,
      n: 8780,
    });
  });

  it('winter1979: de grafiek toont 31 dec – 6 jan met de januari-uren na 31 december geplakt', () => {
    act(() => useStore.setState({ analysis: w79, scrubHour: null }));
    render(createElement(ColdWeekCharts));
    expect(document.body.textContent).toContain('ma 31 dec 00:00 – za 6 jan 23:00');
    expect(plotted.length).toBeGreaterThanOrEqual(3);
    const heat = plotted[0] as Float64Array[];
    expect(heat[0]).toHaveLength(8928);
    // reeks 7 = T buiten: index 8760 + k is uur k van januari
    const T = w79.main.series.outdoorC;
    for (const k of [0, 23, 167]) expect(heat[7][HOURS + k]).toBe(T[k]);
    expect(heat[7][8736]).toBe(T[8736]);
  });

  it('T1 (week vanaf uur 4): december vóór 1 januari geplakt', () => {
    const a = analyze(woning('T1'), refYear('T1'));
    expect(a.coldWeek).toMatchObject({ start: 4, from: -20, to: 196 });
    act(() => useStore.setState({ analysis: a, scrubHour: null }));
    render(createElement(ColdWeekCharts));
    const heat = plotted[0] as Float64Array[];
    expect(heat[0]).toHaveLength(8780);
    // index 0 is 31 december 04:00 (uur 8740), index 20 is 1 januari 00:00
    expect(heat[7][0]).toBe(a.main.series.outdoorC[8740]);
    expect(heat[7][20]).toBe(a.main.series.outdoorC[0]);
  });
});

describe('scrubber en conceptschema over de jaargrens', () => {
  it('de scrubber loopt van 30 december tot 7 januari en toont de waarden van januari', () => {
    act(() => useStore.setState({ analysis: w79, scrubHour: 8800 }));
    render(createElement(Scrubber));
    const range = screen.getByLabelText('Uur in de koude week') as HTMLInputElement;
    expect(range.min).toBe('8712');
    expect(range.max).toBe('8927');
    expect(range.value).toBe('8800');
    expect(range.getAttribute('aria-valuetext')).toBe(formatHour(40, 1));
    expect(range.getAttribute('aria-valuetext')).toBe('di 2 jan 16:00');
  });

  it('het conceptschema volgt een uur in januari na de jaargrens', () => {
    act(() => useStore.setState({ analysis: w79, scrubHour: 8800 }));
    render(createElement(ConceptDiagram));
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/^Conceptschema op di 2 jan 16:00/);
  });
});
