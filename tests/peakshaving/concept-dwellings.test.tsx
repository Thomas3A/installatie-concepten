// @vitest-environment jsdom
// Tabblad Concept bij meerdere woningen op één warmtepomp: woongebouw in plaats van de woning, titel met het
// aantal woningen, en een gevel die niet met de infokaart, de afgifte of de leidingen botst.
import { act, cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import refJson from '../../src/concepts/peakshaving/data/referentiejaren.json';
import { defaultInput, multiDwellingInput } from '../../src/concepts/peakshaving/data/defaults';
import { analyze } from '../../src/concepts/peakshaving/model/analysis';
import { decodeReferenceYear, type ReferenceYearsJson } from '../../src/concepts/peakshaving/model/climate';
import { withDwellings } from '../../src/concepts/peakshaving/model/input';
import type { PeakshavingInput } from '../../src/concepts/peakshaving/model/types';
import { useStore } from '../../src/concepts/peakshaving/store';
import { ConceptDiagram } from '../../src/concepts/peakshaving/ui/concept/ConceptDiagram';
import {
  APARTMENT,
  APARTMENT_PLINTH_Y,
  apartmentFacade,
  approxTextWidth,
  BUILDING,
  rectsOverlap,
  type Rect,
} from '../../src/concepts/peakshaving/ui/concept/conceptGeometry';
import { buildingTitle } from '../../src/concepts/peakshaving/ui/concept/ConceptParts';

const climate = decodeReferenceYear(refJson as unknown as ReferenceYearsJson, 'T5');

function renderFor(input: PeakshavingInput) {
  const a = analyze(input, climate);
  act(() => useStore.setState({ analysis: a, scrubHour: null }));
  return render(createElement(ConceptDiagram));
}

/** Begin van het maaiveld (de lijn op BUILDING.ground die tot de rand van het schema loopt). */
function groundStart(container: HTMLElement): number {
  const line = [...container.querySelectorAll('line')].find(
    (l) =>
      Number(l.getAttribute('y1')) === BUILDING.ground && Number(l.getAttribute('y2')) === BUILDING.ground,
  );
  return Number(line?.getAttribute('x1'));
}

afterEach(() => {
  cleanup();
  act(() => useStore.setState({ analysis: null, scrubHour: null }));
});

describe('ConceptDiagram bij meerdere woningen', () => {
  it('tekent een woongebouw met het aantal woningen in de infokaart', () => {
    const { container } = renderFor(multiDwellingInput());
    expect(screen.getByTestId('concept-apartment')).toBeTruthy();
    expect(screen.queryByTestId('concept-house')).toBeNull();
    expect(screen.queryByTestId('concept-office')).toBeNull();
    expect(screen.getByText('10 woningen')).toBeTruthy();
    expect(screen.getByText('op één warmtepomp')).toBeTruthy();
    expect(screen.queryByText('Woning')).toBeNull();
    // het woongebouw heeft geen dakoverstek: het maaiveld begint bij de gevel, zoals bij het kantoor
    expect(groundStart(container)).toBe(BUILDING.x - 14);
    // de samenvatting voor schermlezers noemt het woongebouw en de vraag per woning
    const sr = document.querySelector('.sr-only')?.textContent ?? '';
    expect(sr).toMatch(/Woongebouw met 10 woningen op één warmtepomp: binnen/);
    expect(sr).toMatch(/kW per woning\)/);
  });

  it('volgt het aantal woningen', () => {
    renderFor(withDwellings(multiDwellingInput(), 120));
    expect(screen.getByTestId('concept-apartment')).toBeTruthy();
    expect(screen.getByText('120 woningen')).toBeTruthy();
  });

  it('één woning en kantoor blijven ongewijzigd', () => {
    const single = renderFor(defaultInput('residential'));
    expect(screen.getByTestId('concept-house')).toBeTruthy();
    expect(screen.queryByTestId('concept-apartment')).toBeNull();
    expect(screen.getByText('Woning')).toBeTruthy();
    expect(screen.queryByText('op één warmtepomp')).toBeNull();
    expect(groundStart(single.container)).toBe(BUILDING.roof[0].x - 14);
    expect(document.querySelector('.sr-only')?.textContent).toMatch(/Gebouw: binnen/);
    cleanup();

    const office = renderFor(defaultInput('office'));
    expect(screen.getByTestId('concept-office')).toBeTruthy();
    expect(screen.queryByTestId('concept-apartment')).toBeNull();
    expect(screen.getByText('Kantoor')).toBeTruthy();
    expect(groundStart(office.container)).toBe(BUILDING.x - 14);
  });
});

describe('buildingTitle', () => {
  it('kantoor, één woning of het aantal woningen', () => {
    expect(buildingTitle('office', 1)).toBe('Kantoor');
    expect(buildingTitle('single', 1)).toBe('Woning');
    expect(buildingTitle('multi', 10)).toBe('10 woningen');
    expect(buildingTitle('multi', 500)).toBe('500 woningen');
  });

  it('past in de infokaart, ook bij het maximale aantal woningen', () => {
    const card = BUILDING.card;
    for (const t of [buildingTitle('multi', 500), 'op één warmtepomp'])
      expect(approxTextWidth(t, 15)).toBeLessThan(card.w - 2 * 14);
  });
});

describe('apartmentFacade', () => {
  const f = apartmentFacade();
  const upper = [...f.windows, ...f.doors, ...f.balconies, ...f.slabs, ...f.stairs];
  const all: Rect[] = [...upper, ...f.plinthWindows, f.entrance, f.canopy];

  it('toont de woonlagen boven de infokaart, met twee woningen per laag', () => {
    expect(f.floors.length).toBeGreaterThanOrEqual(2);
    expect(f.floors[0]).toBe(0);
    for (const list of [f.windows, f.doors, f.balconies, f.slabs])
      expect(list).toHaveLength(APARTMENT.bayX.length * f.floors.length);
    expect(f.stairs).toHaveLength(f.floors.length);
  });

  it('valt binnen de gevel en botst niet met de infokaart', () => {
    const b = BUILDING;
    for (const r of all) {
      expect(r.x).toBeGreaterThanOrEqual(b.x);
      expect(r.x + r.w).toBeLessThanOrEqual(b.x + b.w);
      expect(r.y).toBeGreaterThanOrEqual(b.officeTop);
      expect(r.y + r.h).toBeLessThanOrEqual(b.ground);
      expect(rectsOverlap(r, b.card, 2)).toBe(false);
    }
    // woonlagen boven de plint, ramen en entree in de plint
    for (const r of upper) expect(r.y + r.h).toBeLessThanOrEqual(APARTMENT_PLINTH_Y);
    for (const r of [...f.plinthWindows, f.entrance, f.canopy])
      expect(r.y).toBeGreaterThanOrEqual(APARTMENT_PLINTH_Y);
  });

  it('laat de afgifte, de bijstook en de leidingen vrij', () => {
    // radiator (emitterX ± 18), bijstook en de leidingen naar de afgifte liggen links van emitterX + 18;
    // aanvoer en retour komen door de linkergevel binnen
    for (const r of all) expect(r.x).toBeGreaterThan(BUILDING.emitterX + 18 + 4);
  });

  it('ramen, deuren, trappenhuis en balkons overlappen elkaar niet (behalve balkon voor de deur)', () => {
    const solo = [...f.windows, ...f.stairs, ...f.plinthWindows, f.entrance];
    for (let i = 0; i < solo.length; i++)
      for (let j = i + 1; j < solo.length; j++) expect(rectsOverlap(solo[i], solo[j])).toBe(false);
    for (const w of [...f.windows, ...f.stairs])
      for (const r of [...f.doors, ...f.balconies, ...f.slabs]) expect(rectsOverlap(w, r)).toBe(false);
    // elk balkon staat voor een balkondeur
    for (const bal of f.balconies) expect(f.doors.some((d) => rectsOverlap(d, bal))).toBe(true);
  });

  it('de entree staat onder het trappenhuis', () => {
    const mid = (r: Rect) => r.x + r.w / 2;
    for (const s of f.stairs) expect(mid(f.entrance)).toBeCloseTo(mid(s), 6);
    expect(mid(f.canopy)).toBeCloseTo(mid(f.entrance), 6);
    expect(f.entrance.y + f.entrance.h).toBe(BUILDING.ground);
  });
});
