// Regressietests voor de rekenmotor (Web Worker-protocol): afbreken van het gevoeligheidsraster bij een lazy geladen
// werkelijk jaar, opnieuw laden na een mislukte download, de volledigheid van 'sensitivity-done' en de terugval op de
// hoofdthread als de Worker uitvalt.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultInput } from '../../src/concepts/peakshaving/data/defaults';
import { createEngineClient } from '../../src/concepts/peakshaving/engineClient';
import type { RealYearsJson } from '../../src/concepts/peakshaving/model/climate';
import { createEngine, type EngineResponse } from '../../src/concepts/peakshaving/model/engine';
import type { PeakshavingInput } from '../../src/concepts/peakshaving/model/types';
import { REAL_JSON } from './helpers';

function withYear(climateYear: string): PeakshavingInput {
  return { ...defaultInput('residential'), climateYear };
}

/** Loader die pas antwoordt als de poort open gaat. */
function gatedLoader(): { load: () => Promise<RealYearsJson>; open: () => void; calls: () => number } {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => (release = r));
  let n = 0;
  return {
    load: async () => {
      n++;
      await gate;
      return REAL_JSON;
    },
    open: () => release(),
    calls: () => n,
  };
}

describe('rekenmotor: gevoeligheidsraster en werkelijke jaren', () => {
  it('een ouder verzoek voor een werkelijk jaar breekt een nieuwer verzoek voor een referentiejaar niet af', async () => {
    const loader = gatedLoader();
    const engine = createEngine(loader.load);
    const got: EngineResponse[] = [];
    const emit = (m: EngineResponse): void => {
      got.push(m);
      // pas laden als het nieuwere verzoek al rekent: precies de volgorde uit de bevinding
      if (m.type === 'sensitivity-row' && m.id === 2 && m.index === 0) loader.open();
    };
    const first = engine.handle(
      { type: 'sensitivity', id: 1, key: 'knmi', input: withYear('knmi-2012') },
      emit,
    );
    const second = engine.handle({ type: 'sensitivity', id: 2, key: 't5', input: withYear('T5') }, emit);
    await Promise.all([first, second]);

    const rows = (id: number): number =>
      got.filter((m) => m.type === 'sensitivity-row' && m.id === id).length;
    const done = got.filter((m) => m.type === 'sensitivity-done').map((m) => m.id);
    expect(loader.calls()).toBe(1);
    expect(rows(2)).toBe(13);
    expect(done).toEqual([2]);
    // het oudere verzoek levert niets meer op
    expect(rows(1)).toBe(0);
    expect(got.some((m) => m.type === 'error')).toBe(false);
  }, 60000);

  it("'sensitivity-done' meldt het aantal rijen, zodat de store een onvolledig raster herkent", async () => {
    const engine = createEngine();
    const got: EngineResponse[] = [];
    await engine.handle({ type: 'sensitivity', id: 7, key: 'k', input: defaultInput('residential') }, (m) =>
      got.push(m),
    );
    const last = got[got.length - 1];
    expect(last.type).toBe('sensitivity-done');
    if (last.type !== 'sensitivity-done') return;
    expect(last.total).toBe(got.filter((m) => m.type === 'sensitivity-row').length);
  }, 60000);

  it('na een mislukte download van de werkelijke jaren wordt bij het volgende verzoek opnieuw geladen', async () => {
    let calls = 0;
    const engine = createEngine(async () => {
      calls++;
      if (calls === 1) throw new Error('netwerkfout');
      return REAL_JSON;
    });
    const got: EngineResponse[] = [];
    const emit = (m: EngineResponse): void => void got.push(m);

    await engine.handle({ type: 'analyze', id: 1, input: withYear('knmi-2012') }, emit);
    expect(got[0].type).toBe('error');
    if (got[0].type === 'error') expect(got[0].message).toContain('netwerkfout');

    await engine.handle({ type: 'analyze', id: 2, input: withYear('knmi-1997') }, emit);
    expect(calls).toBe(2);
    const second = got[1];
    expect(second.type).toBe('analysis');
    if (second.type === 'analysis') expect(second.analysis.climateId).toBe('knmi-1997');
  }, 60000);

  it('gelijktijdige verzoeken tijdens één mislukte download krijgen allebei de fout, daarna lukt het', async () => {
    let calls = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    const engine = createEngine(async () => {
      calls++;
      if (calls === 1) {
        await gate;
        throw new Error('time-out');
      }
      return REAL_JSON;
    });
    const got: EngineResponse[] = [];
    const emit = (m: EngineResponse): void => void got.push(m);
    const a = engine.handle({ type: 'analyze', id: 1, input: withYear('knmi-2012') }, emit);
    const b = engine.handle({ type: 'analyze', id: 2, input: withYear('knmi-2010') }, emit);
    release();
    await Promise.all([a, b]);
    expect(got.map((m) => m.type)).toEqual(['error', 'error']);
    expect(calls).toBe(1);

    await engine.handle({ type: 'analyze', id: 3, input: withYear('knmi-2012') }, emit);
    expect(got[2].type).toBe('analysis');
    expect(calls).toBe(2);
  }, 60000);
});

describe('verbinding met de rekenmotor', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('valt de Worker uit (module niet te laden), dan rekent de hoofdthread de openstaande verzoeken alsnog', async () => {
    const posted: unknown[] = [];
    class FailingWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      onerror: ((e: Partial<ErrorEvent>) => void) | null = null;
      onmessageerror: (() => void) | null = null;
      terminated = false;
      constructor() {
        // zoals een 404 op de worker-chunk: asynchroon een error-event
        setTimeout(() => this.onerror?.({ message: '404', preventDefault: () => undefined }), 10);
      }
      postMessage(m: unknown): void {
        posted.push(m);
      }
      terminate(): void {
        this.terminated = true;
      }
    }
    vi.stubGlobal('Worker', FailingWorker);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const got: EngineResponse[] = [];
    const client = createEngineClient((m) => void got.push(m), { createEngine: () => createEngine() });
    client.post({ type: 'analyze', id: 1, input: defaultInput('residential') });
    client.post({ type: 'sensitivity', id: 2, key: 'k', input: defaultInput('residential') });
    expect(posted).toHaveLength(2);

    const t0 = Date.now();
    while (!got.some((m) => m.type === 'sensitivity-done') && Date.now() - t0 < 40000) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(got.find((m) => m.type === 'analysis')?.id).toBe(1);
    expect(got.filter((m) => m.type === 'sensitivity-row' && m.id === 2)).toHaveLength(13);
    expect(got.some((m) => m.type === 'error')).toBe(false);

    // volgende verzoeken gaan direct naar de hoofdthread
    client.post({ type: 'analyze', id: 3, input: defaultInput('office') });
    while (!got.some((m) => m.id === 3) && Date.now() - t0 < 40000)
      await new Promise((r) => setTimeout(r, 20));
    expect(got.find((m) => m.id === 3)?.type).toBe('analysis');
    expect(posted).toHaveLength(2);
    client.dispose();
  }, 60000);

  it('een rekenmotor die niet te laden is geeft een foutmelding met het id, en wordt later opnieuw geprobeerd', async () => {
    let attempts = 0;
    const got: EngineResponse[] = [];
    const client = createEngineClient((m) => void got.push(m), {
      mainThread: true,
      createEngine: () => {
        attempts++;
        if (attempts === 1) return Promise.reject(new Error('chunk 404'));
        return createEngine();
      },
    });
    client.post({ type: 'analyze', id: 1, input: defaultInput('residential') });
    await new Promise((r) => setTimeout(r, 20));
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ type: 'error', id: 1 });
    if (got[0].type === 'error') expect(got[0].message).toContain('chunk 404');

    client.post({ type: 'analyze', id: 2, input: defaultInput('residential') });
    const t0 = Date.now();
    while (got.length < 2 && Date.now() - t0 < 40000) await new Promise((r) => setTimeout(r, 20));
    expect(got[1]).toMatchObject({ type: 'analysis', id: 2 });
    expect(attempts).toBe(2);
  }, 60000);
});
