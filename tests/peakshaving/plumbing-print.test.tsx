// @vitest-environment jsdom
// Printversie blijft niet hangen: een gevoeligheidsraster dat in een fout eindigt of geen voortgang meer maakt,
// wordt overgeslagen (met een notitie) en het printvenster opent toch.
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultInput } from '../../src/concepts/peakshaving/data/defaults';
import { createEngine, type Engine } from '../../src/concepts/peakshaving/model/engine';
import { configureEngine, useStore } from '../../src/concepts/peakshaving/store';
import { PRINT_STALL_MS, PrintView } from '../../src/concepts/peakshaving/ui/PrintView';

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

beforeEach(() => {
  useStore.setState({ tab: 'koude-week', analysis: null, sensitivity: null, printing: false, error: null });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
});

describe('printversie', () => {
  it('print zonder gevoeligheidsraster als dat in een fout eindigt', async () => {
    configureEngine({
      mainThread: true,
      createEngine: () =>
        createEngine(async () => {
          throw new Error('netwerkfout');
        }),
    });
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<PrintView />);
    // eerst een geslaagde doorrekening (T5), daarna een werkelijk jaar dat niet te laden is
    act(() => useStore.getState().loadInput(defaultInput('residential')));
    await waitFor(() => expect(useStore.getState().analysis).not.toBeNull(), { timeout: 30000 });
    act(() => useStore.getState().setClimateYear('knmi-2012'));
    await waitFor(() => expect(useStore.getState().error).toContain('netwerkfout'), { timeout: 30000 });

    act(() => useStore.getState().requestPrint());
    await waitFor(() => expect(print).toHaveBeenCalledTimes(1), { timeout: 30000 });
    expect(useStore.getState().sensitivity?.error).toContain('netwerkfout');
    expect(document.body.textContent).toContain('Het gevoeligheidsraster is niet opgenomen');
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(useStore.getState().printing).toBe(false);
  }, 60000);

  it(`print na ${PRINT_STALL_MS / 1000} s zonder voortgang toch, zonder raster`, async () => {
    // motor die het gevoeligheidsraster nooit beantwoordt
    configureEngine({
      mainThread: true,
      createEngine: (): Engine => {
        const real = createEngine();
        return {
          climate: real.climate,
          handle: (req, emit) =>
            req.type === 'sensitivity' ? new Promise(() => undefined) : real.handle(req, emit),
        };
      },
    });
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<PrintView />);
    act(() => useStore.getState().loadInput(defaultInput('residential')));
    await waitFor(() => expect(useStore.getState().busy).toBe(false), { timeout: 30000 });
    expect(useStore.getState().analysis).not.toBeNull();

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    act(() => useStore.getState().requestPrint());
    act(() => vi.advanceTimersByTime(PRINT_STALL_MS - 1000));
    expect(print).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(2000));
    // daarna nog de tekenpauze vóór het printvenster
    act(() => vi.advanceTimersByTime(1000));
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('de berekening duurde te lang');
  }, 60000);
});
