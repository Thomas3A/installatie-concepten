// @vitest-environment jsdom
// Grafiekonderdelen: naam van de exportknoppen, smalle weergave met astitels boven de grafiek, gevoeligheidsgrafiek
// die tijdens een herberekening het vorige raster laat staan, een foutmelding toont en een verre aansluiting niet
// op de as zet; korte leads en bedieningshints (muis) in Koude week, Jaar en Gevoeligheid.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import refJson from '../../src/concepts/peakshaving/data/referentiejaren.json';
import { CONNECTIONS } from '../../src/concepts/peakshaving/data/connections';
import { analyze, type Analysis } from '../../src/concepts/peakshaving/model/analysis';
import { decodeReferenceYear, type ReferenceYearsJson } from '../../src/concepts/peakshaving/model/climate';
import {
  SENSITIVITY_BATTERY_FRACTIONS,
  SENSITIVITY_VOLUME_FRACTIONS,
  type SensitivityRow,
} from '../../src/concepts/peakshaving/model/sizing';
import { findScenario } from '../../src/concepts/peakshaving/scenarios';
import { useStore, type SensitivityState } from '../../src/concepts/peakshaving/store';
import { ColdWeekCharts } from '../../src/concepts/peakshaving/ui/charts/ColdWeekCharts';
import { SensitivityChart } from '../../src/concepts/peakshaving/ui/charts/SensitivityChart';
import { YearCharts } from '../../src/concepts/peakshaving/ui/charts/YearCharts';
import { UPlotChart } from '../../src/ui/charts/UPlotChart';

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

const initial = useStore.getState();

beforeEach(() => {
  useStore.setState({ input: initial.input, ranges: initial.ranges, sensitivity: null, analysis: null });
});

afterEach(() => cleanup());

/** Volledig raster met vaste meterpieken rond `peakKw` (genoeg om de grafiek te tekenen). */
function grid(key: string, peakKw = 3.5): SensitivityState {
  const { ranges } = useStore.getState();
  const caps = SENSITIVITY_BATTERY_FRACTIONS.map((f) => f * ranges.batteryMaxKwh);
  const c = CONNECTIONS[2];
  const rows: SensitivityRow[] = SENSITIVITY_VOLUME_FRACTIONS.map((f, i) => ({
    volumeM3: f * ranges.bufferMaxM3,
    nominalKw: 10 - i * 0.1,
    cells: caps.map((capacityKwh, j) => ({
      capacityKwh,
      pGridMaxKw: peakKw - j * 0.1,
      exceedanceHours: 0,
      smallest: { id: c.id, label: c.label, powerKw: c.powerKw, exceedanceHours: 0 },
    })),
  }));
  return { key, rows, total: rows.length, done: true };
}

const chartBox = (): HTMLElement | null =>
  screen.queryByRole('img', { name: /^Gevoeligheid: piek aan de meter/ });

describe('exportknop', () => {
  const base = {
    data: [
      [0, 1],
      [1, 2],
    ] as [number[], number[]],
    series: [{ label: 'a', color: '#000' }],
    ariaLabel: 'grafiek',
  };

  it('heeft een naam per grafiek (exportLabel, anders de titel, anders de bestandsnaam)', () => {
    render(
      <>
        <UPlotChart {...base} exportName="koude-week-warmte" exportLabel="Warmte (koude week)" />
        <UPlotChart {...base} exportName="maand" exportTitle="Maandbalans" />
        <UPlotChart {...base} exportName="peakshaving-duurkromme" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Warmte (koude week) opslaan als PNG' }).textContent).toBe(
      'PNG',
    );
    expect(screen.getByRole('button', { name: 'Maandbalans opslaan als PNG' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'peakshaving duurkromme opslaan als PNG' })).toBeTruthy();
  });
});

describe('smalle weergave', () => {
  const props = {
    data: [
      [0, 1],
      [1, 2],
      [3, 4],
    ] as [number[], number[], number[]],
    series: [
      { label: 'a', color: '#000' },
      { label: 'b', color: '#111', scale: 'temp' },
    ],
    axes: [
      { scale: 'y', label: 'Warmte [kW]' },
      { scale: 'temp', label: 'Buiten [°C]', side: 1 as const },
    ],
    ariaLabel: 'grafiek',
  };

  it('zet de astitels als regel boven een smalle grafiek', () => {
    // jsdom meet 0 px breed, dus smaller dan de grens
    render(<UPlotChart {...props} compactBelow={560} />);
    expect(screen.getByText('links: Warmte [kW] · rechts: Buiten [°C]')).toBeTruthy();
  });

  it('noemt een spiegelas met dezelfde titel maar één keer', () => {
    render(
      <UPlotChart
        {...props}
        series={[{ label: 'a', color: '#000' }]}
        axes={[
          { scale: 'y', label: 'Elektrisch [kW]' },
          { scale: 'y', label: 'Elektrisch [kW]', side: 1 },
        ]}
        compactBelow={560}
      />,
    );
    expect(screen.getByText('Elektrisch [kW]')).toBeTruthy();
  });

  it('zonder compactBelow blijft alles zoals het was (geen regel met astitels)', () => {
    render(<UPlotChart {...props} />);
    expect(screen.queryByText(/Warmte \[kW\]/)).toBeNull();
  });
});

describe('gevoeligheidsgrafiek', () => {
  it('laat het vorige volledige raster gedimd staan tot de eerste nieuwe rij er is', () => {
    const first = grid('a');
    act(() => useStore.setState({ sensitivity: first }));
    const { container } = render(<SensitivityChart />);
    expect(chartBox()).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();

    // nieuw verzoek: de store begint met een leeg raster
    act(() => useStore.setState({ sensitivity: { key: 'b', rows: [], total: 0, done: false } }));
    expect(chartBox()).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(screen.queryByText(/De gevoeligheid wordt berekend/)).toBeNull();
    expect(screen.getByText(/Herberekenen: 0 van 13 buffervolumes berekend/)).toBeTruthy();

    // eerste nieuwe rij: het nieuwe (onvolledige) raster, niet meer gedimd
    const next = grid('b');
    act(() =>
      useStore.setState({
        sensitivity: { key: 'b', rows: [next.rows[0]], total: next.total, done: false },
      }),
    );
    expect(chartBox()).toBeTruthy();
    expect(container.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('houdt de regel voor voortgang en klikhint altijd vast (zichtbaarheid wisselt)', () => {
    act(() => useStore.setState({ sensitivity: { key: 'a', rows: [], total: 0, done: false } }));
    render(<SensitivityChart />);
    expect(screen.getByText(/De gevoeligheid wordt berekend/)).toBeTruthy();
    const progress = screen.getByLabelText('Voortgang gevoeligheidsberekening');
    const hint = screen.getByText('Klik in de grafiek om het buffervolume te kiezen.');
    expect(progress.parentElement?.parentElement).toBe(hint.parentElement);

    act(() => useStore.setState({ sensitivity: grid('a') }));
    // na afloop staan beide er nog: alleen de zichtbaarheid wisselt, de hoogte niet
    expect(screen.getByLabelText('Voortgang gevoeligheidsberekening')).toBeTruthy();
    expect(screen.getByText('Klik in de grafiek om het buffervolume te kiezen.')).toBeTruthy();
  });

  it('toont een korte foutmelding als het raster in een fout eindigt, met een knop om opnieuw te proberen', () => {
    const retry = vi.fn();
    act(() =>
      useStore.setState({
        sensitivity: { key: 'a', rows: [], total: 0, done: true, error: 'rekenmotor gestopt' },
        retry,
      }),
    );
    render(<SensitivityChart />);
    expect(screen.getByRole('status').textContent).toMatch(
      /De gevoeligheid kon niet worden berekend: rekenmotor gestopt\./,
    );
    expect(screen.queryByText(/De gevoeligheid wordt berekend/)).toBeNull();
    act(() => screen.getByRole('button', { name: 'Opnieuw proberen' }).click());
    expect(retry).toHaveBeenCalledTimes(1);
    act(() => useStore.setState({ retry: initial.retry }));
  });

  it('schrijft subscripts zonder underscore en uren als uur/jaar', () => {
    act(() => useStore.setState({ sensitivity: grid('a') }));
    const { container } = render(<SensitivityChart />);
    const text = container.textContent ?? '';
    expect(text).toContain('Benodigd WP-vermogen (P th,min)');
    expect(text).toContain('WP-limiet huidige aansluiting (P limiet)');
    expect(text).not.toMatch(/P_/);
    expect(text).toContain('Overschr. [uur/jaar]');
  });

  it('zet een grootverbruikaansluiting ver boven de krommen niet op de as, maar noemt haar boven de as', () => {
    const input = initial.input;
    act(() =>
      useStore.setState({
        input: { ...input, grid: { ...input.grid, connection: 'grootverbruik', contractedKw: 5000 } },
        sensitivity: grid('a', 3.5),
      }),
    );
    const { container } = render(<SensitivityChart />);
    expect(container.textContent).toContain('WP-limiet huidige aansluiting (P limiet), boven de as (↑)');
  });
});

describe('korte teksten en bedieningshints (UX-plan §7 #14–18)', () => {
  let a: Analysis;
  beforeAll(() => {
    const climate = decodeReferenceYear(refJson as unknown as ReferenceYearsJson, 'T5');
    a = analyze(findScenario('woning-buffer-batterij')!.build(), climate);
  });
  beforeEach(() => {
    act(() => useStore.setState({ input: a.input, ranges: initial.ranges, analysis: a, scrubHour: null }));
  });

  const text = (): string => document.body.textContent ?? '';

  it('Koude week: één korte bedieningshint; de oude lange hint is weg', () => {
    render(<ColdWeekCharts />);
    expect(
      screen.getByText('Sleep om te zoomen, klik om een uur te kiezen; ◀ ▶ schuift door het jaar.'),
    ).toBeTruthy();
    // het testanker van de intro blijft
    expect(screen.getByText(/Koudste week \(hoogste warmtevraag\)/)).toBeTruthy();
    expect(text()).not.toMatch(/Shift \+ scrollwiel|De panelen bewegen samen/);
  });

  it('Koude week: de printversie heeft geen bedieningshint', () => {
    render(<ColdWeekCharts print />);
    expect(text()).not.toMatch(/Sleep om te zoomen/);
  });

  it('Jaar: korte leads per grafiek en een korte x-as-hint', () => {
    render(<YearCharts />);
    for (const lead of [
      'Alle uren van het jaar, van hoog naar laag; boven een lijn is die aansluiting te klein (uren in de legenda).',
      'Warmtevraag per uur, van hoog naar laag, met wat de warmtepomp bij −10 °C levert.',
      'Warmte per bron en elektriciteit per maand; de lijn is de SCOP.',
    ]) {
      expect(screen.getByText(lead)).toBeTruthy();
    }
    expect(text()).toContain(
      `Klimaatjaar ${a.climateShort}. Logaritmisch: de piekuren groot. Sleep om in te zoomen, dubbelklik om terug te gaan.`,
    );
    expect(text()).not.toMatch(/Elk punt is één uur|eerste paar honderd piekuren/);
  });

  it('Gevoeligheid: korte lead, de leeswijzer ingeklapt onder "Hoe lees ik dit?"', () => {
    act(() => useStore.setState({ sensitivity: grid('a') }));
    render(<SensitivityChart />);
    expect(
      screen.getByText(
        'Waar de lijnen vlak worden, helpt meer buffer niet meer; een stip markeert vanaf welk buffervolume een aansluiting volstaat.',
      ),
    ).toBeTruthy();
    const summary = screen.getByText('Hoe lees ik dit?');
    const details = summary.closest('details')!;
    expect(details.open).toBe(false);
    // de batterijnuance staat alleen nog in de leeswijzer
    expect(details.textContent).toMatch(/Met batterij ligt de piek vaak precies op de WP-limiet/);
    expect(text().match(/Met batterij ligt de piek/g)).toHaveLength(1);
    fireEvent.click(summary);
    expect(details.open).toBe(true);
  });

  it('Gevoeligheid: korte plaatshouder; de printversie heeft geen leeswijzer', () => {
    act(() => useStore.setState({ sensitivity: { key: 'a', rows: [], total: 0, done: false } }));
    const { unmount } = render(<SensitivityChart />);
    expect(screen.getByText('De gevoeligheid wordt berekend…')).toBeTruthy();
    unmount();

    act(() => useStore.setState({ sensitivity: grid('a') }));
    render(<SensitivityChart print />);
    expect(screen.queryByText('Hoe lees ik dit?')).toBeNull();
    expect(screen.queryByText(/Klik in de grafiek/)).toBeNull();
  });

  it('Gevoeligheid: klikhint en uitleesregel', () => {
    act(() => useStore.setState({ sensitivity: grid('a') }));
    render(<SensitivityChart />);
    expect(screen.getByText('Klik in de grafiek om het buffervolume te kiezen.')).toBeTruthy();
    expect(
      screen.getByText(
        'Beweeg over de grafiek voor de overschrijding en de kleinste aansluiting per batterijgrootte.',
      ),
    ).toBeTruthy();
  });
});
