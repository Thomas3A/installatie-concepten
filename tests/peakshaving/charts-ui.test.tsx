// @vitest-environment jsdom
// Grafiekonderdelen: naam van de exportknoppen, smalle weergave met astitels boven de grafiek, gevoeligheidsgrafiek
// die tijdens een herberekening het vorige raster laat staan, een foutmelding toont en een verre aansluiting niet
// op de as zet.
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CONNECTIONS } from '../../src/concepts/peakshaving/data/connections';
import {
  SENSITIVITY_BATTERY_FRACTIONS,
  SENSITIVITY_VOLUME_FRACTIONS,
  type SensitivityRow,
} from '../../src/concepts/peakshaving/model/sizing';
import { useStore, type SensitivityState } from '../../src/concepts/peakshaving/store';
import { SensitivityChart } from '../../src/concepts/peakshaving/ui/charts/SensitivityChart';
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
    expect(text).toContain('Budget huidige aansluiting (P limiet)');
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
    expect(container.textContent).toContain('Budget huidige aansluiting (P limiet), boven de as (↑)');
  });
});
