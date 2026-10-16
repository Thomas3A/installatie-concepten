// @vitest-environment jsdom
// Meerdere woningen op één warmtepomp: store-acties setKind/setDwellings, invoerblok Gebouw (keuze, aantal woningen,
// waarden per woning, hint bij een grote enkele woning), samenvatting voor de printversie en de KPI-kaart.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultInput } from '../../src/concepts/peakshaving/data/defaults';
import { rangesOf } from '../../src/concepts/peakshaving/model/input';
import { buildingText, designLoadText } from '../../src/concepts/peakshaving/model/kpis';
import { useStore } from '../../src/concepts/peakshaving/store';
import { HELP } from '../../src/concepts/peakshaving/texts';
import PeakshavingPage from '../../src/concepts/peakshaving/ui/PeakshavingPage';

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
  act(() => {
    useStore.getState().loadInput(defaultInput('residential'), null);
    useStore.getState().setTab('koude-week');
  });
});

afterEach(() => cleanup());

const st = () => useStore.getState();
const nl = (x: number, d: number): string =>
  new Intl.NumberFormat('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d }).format(x);

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/peakshaving']}>
      <PeakshavingPage />
    </MemoryRouter>,
  );
}

/** Typ een waarde in een getalveld en verlaat het veld. */
function typeAndBlur(field: HTMLInputElement, text: string): void {
  act(() => {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: text } });
    fireEvent.blur(field);
  });
}

const field = (label: string): HTMLInputElement => screen.getByLabelText(label) as HTMLInputElement;
const kindButton = (name: string): HTMLElement =>
  within(screen.getByRole('group', { name: 'Gebouwfunctie' })).getByRole('button', { name });
const click = (el: HTMLElement): void => {
  act(() => {
    fireEvent.click(el);
  });
};

/** Tekst die een getalveld beschrijft (aria-describedby: eenheid en regel onder het veld). */
function description(input: HTMLInputElement): string {
  const ids = (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}

describe('store: meerdere woningen', () => {
  it('setKind: standaardinvoer van de keuze, klimaatjaar blijft; dezelfde keuze wijzigt niets', () => {
    act(() => st().setClimateYear('T1'));
    act(() => st().setKind('multi'));
    const m = st().input;
    expect(m.climateYear).toBe('T1');
    expect(m.building.use).toBe('residential');
    expect(m.building.dwellings).toBe(10);
    expect(m.building.designLoadKw).toBe(50);
    expect(m.building.dhw.dailyKwh).toBe(100);
    expect(m.building.dhw.tankLitre).toBe(2000);
    expect(m.grid.connection).toBe('3x40');
    expect(m.grid.heatPumpShare).toBe(0.8);
    expect(st().ranges).toEqual(rangesOf(m));
    expect(st().scenarioId).toBeNull();

    act(() => st().setKind('office'));
    expect(st().input.building.use).toBe('office');
    expect(st().input.building.dwellings).toBe(1);
    expect(st().input.building.designLoadKw).toBe(100);

    act(() => st().setKind('single'));
    expect(st().input.building.use).toBe('residential');
    expect(st().input.building.dwellings).toBe(1);
    expect(st().input.building.designLoadKw).toBe(8);
    expect(st().input.climateYear).toBe('T1');

    // nogmaals "Woning" bij een ongewijzigd scenario: invoer en scenario blijven
    act(() => st().applyScenario('woning-basis'));
    const before = st().input;
    act(() => st().setKind('single'));
    expect(st().input).toBe(before);
    expect(st().scenarioId).toBe('woning-basis');
  });

  it('setKind herkent het scenario van de standaardinvoer (klimaatjaar T5)', () => {
    act(() => st().setKind('multi'));
    expect(st().scenarioId).toBe('woningen-basis');
    act(() => st().setKind('office'));
    expect(st().scenarioId).toBe('kantoor-basis');
    act(() => st().setKind('single'));
    expect(st().scenarioId).toBe('woning-basis');
  });

  it('setDwellings: piekvermogen, tapwater, boiler, buffer en batterij schalen mee; de aansluiting blijft', () => {
    act(() => st().setKind('multi'));
    act(() =>
      st().update((i) => ({
        ...i,
        buffer: { ...i.buffer, volumeM3: 1 },
        battery: { ...i.battery, capacityKwh: 20 },
      })),
    );
    const ranges10 = st().ranges;
    act(() => st().setDwellings(20));
    const i = st().input;
    expect(i.building.dwellings).toBe(20);
    expect(i.building.designLoadKw).toBeCloseTo(100, 9);
    expect(i.building.dhw.dailyKwh).toBeCloseTo(200, 9);
    expect(i.building.dhw.tankLitre).toBeCloseTo(4000, 9);
    expect(i.buffer.volumeM3).toBeCloseTo(2, 9);
    expect(i.battery.capacityKwh).toBeCloseTo(40, 9);
    expect(i.grid.connection).toBe('3x40');
    expect(i.grid.heatPumpShare).toBe(0.8);
    expect(st().ranges).toEqual(rangesOf(i));
    expect(st().ranges.bufferMaxM3).toBeGreaterThan(ranges10.bufferMaxM3);
    expect(st().scenarioId).toBeNull();

    // ongeldig of ongewijzigd aantal: niets te doen
    const same = st().input;
    act(() => st().setDwellings(Number.NaN));
    act(() => st().setDwellings(20));
    expect(st().input).toBe(same);
  });

  it('setDwellings bij kantoor wijzigt niets', () => {
    act(() => st().setKind('office'));
    const office = st().input;
    act(() => st().setDwellings(12));
    expect(st().input).toBe(office);
    expect(st().input.building.dwellings).toBe(1);
  });

  it('teksten: gebouw in een paar woorden en ontwerpverlies per woning', () => {
    expect(buildingText({ use: 'residential', dwellings: 1 })).toBe('Woning');
    expect(buildingText({ use: 'residential', dwellings: 12 })).toBe('12 woningen');
    expect(buildingText({ use: 'office', dwellings: 1 })).toBe('Kantoor');
    expect(designLoadText({ use: 'residential', dwellings: 1, designLoadKw: 8 })).toBe(`${nl(8, 1)} kW`);
    expect(designLoadText({ use: 'residential', dwellings: 10, designLoadKw: 50 })).toBe(
      `${nl(50, 1)} kW (${nl(5, 1)} kW/woning)`,
    );
    expect(designLoadText({ use: 'office', dwellings: 1, designLoadKw: 100 })).toBe(`${nl(100, 1)} kW`);
  });
});

describe('invoerblok Gebouw: meerdere woningen', () => {
  it('drie keuzes; Meerdere woningen geeft 10 woningen, 50 kW en de waarden per woning', () => {
    renderPage();
    const group = screen.getByRole('group', { name: 'Gebouwfunctie' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Woning', 'Meerdere woningen', 'Kantoor']);
    expect(kindButton('Woning').getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByLabelText('Aantal woningen')).toBeNull();

    click(kindButton('Meerdere woningen'));
    expect(kindButton('Meerdere woningen').getAttribute('aria-pressed')).toBe('true');
    expect(st().input.building.dwellings).toBe(10);
    expect(st().input.building.designLoadKw).toBe(50);
    expect(field('Aantal woningen').value).toBe('10');
    const load = field('Piekvermogen verwarming (totaal)');
    expect(load.value).toBe('50,0');
    expect(screen.queryByLabelText('Piekvermogen verwarming')).toBeNull();
    expect(screen.getByText(`≈ ${nl(5, 1)} kW per woning`)).toBeTruthy();
    // de regel per woning beschrijft het getalveld (na de eenheid)
    expect(description(load)).toBe(`kW ≈ ${nl(5, 1)} kW per woning`);
    // tapwater per woning, boiler collectief
    expect(field('Tapwaterbehoefte per woning').value).toBe('10,0');
    expect(field('Boilervat (collectief)').value).toBe('2.000');
    expect(screen.getByText('≈ 200 l per woning')).toBeTruthy();
    expect(screen.queryByLabelText('Tapwaterbehoefte')).toBeNull();
    expect(screen.queryByLabelText('Boilervat')).toBeNull();
    // schuif aantal woningen: 2…100, stap 1
    const slider = screen.getByLabelText('Aantal woningen (schuif)') as HTMLInputElement;
    expect([slider.min, slider.max, slider.step]).toEqual(['2', '100', '1']);
  });

  it('20 woningen verdubbelt piekvermogen en tapwatertotalen; per woning blijft gelijk', () => {
    renderPage();
    click(kindButton('Meerdere woningen'));
    typeAndBlur(field('Aantal woningen'), '20');
    const b = st().input.building;
    expect(b.dwellings).toBe(20);
    expect(b.designLoadKw).toBeCloseTo(100, 9);
    expect(b.dhw.dailyKwh).toBeCloseTo(200, 9);
    expect(b.dhw.tankLitre).toBeCloseTo(4000, 9);
    expect(field('Aantal woningen').value).toBe('20');
    expect(field('Piekvermogen verwarming (totaal)').value).toBe('100,0');
    expect(screen.getByText(`≈ ${nl(5, 1)} kW per woning`)).toBeTruthy();
    expect(field('Tapwaterbehoefte per woning').value).toBe('10,0');
    expect(field('Boilervat (collectief)').value).toBe('4.000');
    expect(screen.getByText('≈ 200 l per woning')).toBeTruthy();

    // minder dan 2 woningen kan in dit veld niet (dan zou de keuze stilzwijgend "Woning" worden)
    typeAndBlur(field('Aantal woningen'), '1');
    expect(st().input.building.dwellings).toBe(2);
    expect(kindButton('Meerdere woningen').getAttribute('aria-pressed')).toBe('true');
  });

  it('tapwater per woning invoeren schrijft het totaal; piekvermogen wijzigen verandert de waarde per woning', () => {
    renderPage();
    click(kindButton('Meerdere woningen'));
    typeAndBlur(field('Tapwaterbehoefte per woning'), '12,5');
    expect(st().input.building.dhw.dailyKwh).toBeCloseTo(125, 9);
    expect(field('Tapwaterbehoefte per woning').value).toBe('12,5');
    // bovengrens per woning (50 kWh/dag), dus 500 kWh/dag voor 10 woningen
    typeAndBlur(field('Tapwaterbehoefte per woning'), '80');
    expect(st().input.building.dhw.dailyKwh).toBeCloseTo(500, 9);
    expect(field('Tapwaterbehoefte per woning').value).toBe('50,0');

    typeAndBlur(field('Boilervat (collectief)'), '3.000');
    expect(st().input.building.dhw.tankLitre).toBe(3000);
    expect(screen.getByText('≈ 300 l per woning')).toBeTruthy();

    typeAndBlur(field('Piekvermogen verwarming (totaal)'), '65');
    expect(st().input.building.designLoadKw).toBe(65);
    expect(st().input.building.dwellings).toBe(10);
    expect(screen.getByText(`≈ ${nl(6.5, 1)} kW per woning`)).toBeTruthy();
  });

  it('tapwater aanzetten vanaf een leeg boilervat: standaard per woning × aantal', () => {
    renderPage();
    click(kindButton('Meerdere woningen'));
    typeAndBlur(field('Tapwaterbehoefte per woning'), '0');
    typeAndBlur(field('Boilervat (collectief)'), '0');
    const check = screen.getByLabelText('Warm tapwater') as HTMLInputElement;
    click(check);
    expect(st().input.building.dhw.enabled).toBe(false);
    expect(screen.queryByLabelText('Tapwaterbehoefte per woning')).toBeNull();
    click(check);
    expect(st().input.building.dhw.enabled).toBe(true);
    expect(st().input.building.dhw.tankLitre).toBe(2000);
    expect(st().input.building.dhw.dailyKwh).toBe(100);
    expect(field('Tapwaterbehoefte per woning').value).toBe('10,0');
  });

  it('één woning: hint "Groot voor één woning" boven 20 kW; terug naar Woning geeft weer 8 kW', () => {
    renderPage();
    expect(screen.queryByText(HELP.singleDwellingLarge)).toBeNull();
    const load = field('Piekvermogen verwarming');
    typeAndBlur(load, '25');
    expect(st().input.building.designLoadKw).toBe(25);
    expect(screen.getByText(HELP.singleDwellingLarge)).toBeTruthy();
    expect(description(field('Piekvermogen verwarming'))).toBe(`kW ${HELP.singleDwellingLarge}`);
    typeAndBlur(field('Piekvermogen verwarming'), '8');
    expect(screen.queryByText(HELP.singleDwellingLarge)).toBeNull();
    // alleen de eenheid beschrijft het veld weer
    expect(description(field('Piekvermogen verwarming'))).toBe('kW');

    click(kindButton('Meerdere woningen'));
    expect(screen.queryByText(HELP.singleDwellingLarge)).toBeNull();
    click(kindButton('Woning'));
    expect(st().input.building.dwellings).toBe(1);
    expect(st().input.building.designLoadKw).toBe(8);
    expect(field('Piekvermogen verwarming').value).toBe('8,0');
    expect(screen.queryByLabelText('Aantal woningen')).toBeNull();
    expect(field('Tapwaterbehoefte').value).toBe('10,0');
    expect(field('Boilervat').value).toBe('200');
  });

  it('kantoor: geen aantal woningen en geen hint, ook niet boven 20 kW', () => {
    renderPage();
    click(kindButton('Kantoor'));
    expect(kindButton('Kantoor').getAttribute('aria-pressed')).toBe('true');
    expect(st().input.building.use).toBe('office');
    expect(screen.queryByLabelText('Aantal woningen')).toBeNull();
    expect(field('Piekvermogen verwarming').value).toBe('100,0');
    expect(screen.queryByText(HELP.singleDwellingLarge)).toBeNull();
    expect(screen.queryByText(/per woning/)).toBeNull();
  });

  it('samenvatting (printversie) en KPI-kaart tonen het aantal woningen en de waarde per woning', async () => {
    renderPage();
    click(kindButton('Meerdere woningen'));
    expect(
      screen.getByText(
        new RegExp(
          `^10 woningen · piekvermogen ${nl(50, 1)} kW \\(${nl(5, 1)} kW per woning\\) · klimaatjaar`,
        ),
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        new RegExp(
          `tapwater ${nl(100, 1)} kWh/dag \\(${nl(10, 1)} kWh/dag per woning\\), collectieve boiler 2\\.000 l\\.$`,
        ),
      ),
    ).toBeTruthy();
    await waitFor(() => expect(st().analysis?.input.building.dwellings).toBe(10), { timeout: 30000 });
    expect(screen.getByText(`Ontwerpverlies ${nl(50, 1)} kW (${nl(5, 1)} kW/woning)`)).toBeTruthy();

    click(kindButton('Woning'));
    expect(screen.getByText(new RegExp(`^Woning · piekvermogen ${nl(8, 1)} kW · klimaatjaar`))).toBeTruthy();
    expect(screen.queryByText(/kW per woning/)).toBeNull();
  }, 40000);
});
