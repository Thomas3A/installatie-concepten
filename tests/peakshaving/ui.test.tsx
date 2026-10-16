// @vitest-environment jsdom
// UI-smoketest (spec §9.8): pagina rendert met standaardwaarden, piekvermogen schaalt de schuifbereiken,
// de deelbare link reproduceert de toestand.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { defaultInput } from '../../src/concepts/peakshaving/data/defaults';
import { decodeInput, encodeInput } from '../../src/concepts/peakshaving/share';
import { useStore } from '../../src/concepts/peakshaving/store';
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
});

afterEach(() => cleanup());

function renderPage(path = '/peakshaving') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PeakshavingPage />
    </MemoryRouter>,
  );
}

describe('peakshaving-pagina', () => {
  it('rendert met standaardwaarden en toont de kerngetallen', async () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: /Peakshaving warmtepomp/ })).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText('Kerngetallen')).toBeTruthy(), { timeout: 20000 });
    expect(screen.getByText('Piek warmtevraag')).toBeTruthy();
    expect(screen.getByText('Kleinste passende aansluiting')).toBeTruthy();
    expect(screen.getByLabelText('Advies').textContent).toMatch(/warmtepomp/);
  }, 30000);

  it('piekvermogen wijzigen schaalt de schuifbereiken van buffer en batterij', async () => {
    renderPage();
    const slider = (): HTMLInputElement => screen.getByLabelText('Buffervolume (schuif)') as HTMLInputElement;
    const battery = (): HTMLInputElement =>
      screen.getByLabelText('Batterijcapaciteit (schuif)') as HTMLInputElement;
    const vMax0 = Number(slider().max);
    const eMax0 = Number(battery().max);
    const field = screen.getByLabelText('Piekvermogen verwarming') as HTMLInputElement;
    act(() => {
      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: '16' } });
      fireEvent.keyDown(field, { key: 'Enter' });
    });
    await waitFor(() => expect(Number(slider().max)).toBeGreaterThan(vMax0));
    // 12 h · 16 kW / 24,074 kWh/m³ = 7,97 m³ → afgerond naar boven op de 1-2-5-reeks: 10 m³
    expect(Number(slider().max)).toBe(10);
    expect(Number(battery().max)).toBeGreaterThan(eMax0);
    expect(useStore.getState().input.building.designLoadKw).toBe(16);
  });

  it('deelbare link reproduceert de toestand', async () => {
    const input = defaultInput('office');
    input.buffer.volumeM3 = 12.5;
    input.battery.capacityKwh = 60;
    input.grid.heatPumpShare = 0.55;
    input.climateYear = 'knmi-1997';
    input.heatPump.emitterPreset = 'LT';
    const code = encodeInput(input);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeInput(code)).toEqual(input);
    renderPage(`/peakshaving?c=${code}`);
    await waitFor(() => expect(useStore.getState().input).toEqual(input));
    expect((screen.getByLabelText('Buffervolume') as HTMLInputElement).value).toBe('12,50');
    expect(decodeInput('%%%')).toBeNull();
  });

  it('tabbladen Koude week, Jaar en Gevoeligheid renderen met resultaten', async () => {
    useStore.getState().applyScenario('woning-buffer-batterij');
    renderPage();
    await waitFor(() => expect(useStore.getState().analysis?.input.buffer.volumeM3).toBe(1), {
      timeout: 20000,
    });
    // koude week (standaardtabblad) met scrubber
    await waitFor(() => expect(screen.getByLabelText('Uur in de koude week')).toBeTruthy());
    expect(screen.getByText(/Koudste week \(hoogste warmtevraag\)/)).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'Jaar' }));
    });
    expect(screen.getByText(/Maandbalans/)).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'Gevoeligheid' }));
    });
    await waitFor(() => expect(useStore.getState().sensitivity?.done).toBe(true), { timeout: 30000 });
    expect(screen.getByText(/Tabel met alle punten/)).toBeTruthy();
  }, 60000);

  it('tabblad Uitleg toont de negen secties met formules', () => {
    renderPage();
    act(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'Uitleg' }));
    });
    for (const t of ['1. Wat de tool berekent', '4. Warmtebuffer', '9. Beperkingen']) {
      expect(screen.getByRole('heading', { name: t })).toBeTruthy();
    }
    expect(document.querySelectorAll('.katex').length).toBeGreaterThan(9);
    // **vet** wordt opgemaakt, niet letterlijk getoond
    expect(document.body.textContent).not.toContain('**');
  });

  it('printen: bouwt de printversie met grafieken op en opent dan het printvenster', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderPage();
    await waitFor(() => expect(useStore.getState().analysis).not.toBeNull(), { timeout: 20000 });
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Print / PDF' }));
    });
    expect(useStore.getState().printing).toBe(true);
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1), { timeout: 30000 });
    expect(useStore.getState().sensitivity?.done).toBe(true);
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(useStore.getState().printing).toBe(false);
    print.mockRestore();
  }, 60000);
});
