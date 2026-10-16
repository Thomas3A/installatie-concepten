// Regressietests voor de store met de echte rekenmotor in de hoofdthread: verouderde rasterrijen na een cache-treffer,
// de wedloop tussen een lazy geladen werkelijk jaar en een referentiejaar, foutafhandeling van het gevoeligheidsraster,
// opnieuw laden van de werkelijke jaren en de herkenning van een ongewijzigd scenario in een deelbare link.
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultInput } from '../../src/concepts/peakshaving/data/defaults';
import { sensitivityAxes, sensitivityKey } from '../../src/concepts/peakshaving/model/analysis';
import type { RealYearsJson } from '../../src/concepts/peakshaving/model/climate';
import { createEngine } from '../../src/concepts/peakshaving/model/engine';
import { normalizeInput } from '../../src/concepts/peakshaving/model/input';
import type { PeakshavingInput } from '../../src/concepts/peakshaving/model/types';
import { SCENARIOS } from '../../src/concepts/peakshaving/scenarios';
import { encodeInput, scenarioIdOf } from '../../src/concepts/peakshaving/share';
import { configureEngine, useStore, type SensitivityState } from '../../src/concepts/peakshaving/store';
import { REAL_JSON } from './helpers';

const st = () => useStore.getState();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function until(cond: () => boolean, what: string, timeoutMs = 40000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`time-out: ${what}`);
    await sleep(20);
  }
}

const computed = (s: SensitivityState | null): number => (s ? s.rows.filter((r) => r !== null).length : 0);

function withYear(
  climateYear: string,
  base: PeakshavingInput = defaultInput('residential'),
): PeakshavingInput {
  return normalizeInput({ ...base, climateYear });
}

/** Volledig raster voor precies deze invoer: alle rijen, de juiste buffervolumes, zonder fout. */
function expectCompleteGrid(s: SensitivityState | null, input: PeakshavingInput): void {
  expect(s).not.toBeNull();
  if (!s) return;
  expect(s.key).toBe(sensitivityKey(input));
  expect(s.done).toBe(true);
  expect(s.error).toBeUndefined();
  const { volumes } = sensitivityAxes(input);
  expect(s.rows).toHaveLength(volumes.length);
  expect(s.rows.map((r) => r?.volumeM3)).toEqual(volumes);
}

beforeEach(() => {
  configureEngine({ mainThread: true });
  useStore.setState({ tab: 'koude-week', analysis: null, sensitivity: null, printing: false, error: null });
});

describe('store: gevoeligheidsraster', () => {
  it('na een cache-treffer overschrijven rijen van een ander, nog lopend raster het getoonde raster niet', async () => {
    const mt = normalizeInput(defaultInput('residential'));
    const ht = normalizeInput({ ...mt, heatPump: { ...mt.heatPump, emitterPreset: 'HT' } });
    expect(sensitivityKey(ht)).not.toBe(sensitivityKey(mt));

    st().setTab('gevoeligheid');
    st().loadInput(mt);
    await until(() => st().sensitivity?.key === sensitivityKey(mt) && !!st().sensitivity?.done, 'raster MT');
    const gridMt = st().sensitivity;
    expectCompleteGrid(gridMt, mt);

    // HT starten en terug naar MT zodra de eerste HT-rij er is
    st().loadInput(ht);
    await until(
      () => st().sensitivity?.key === sensitivityKey(ht) && computed(st().sensitivity) >= 1,
      'eerste HT-rij',
    );
    st().loadInput(mt);
    expect(st().sensitivity).toBe(gridMt);
    const seen: (SensitivityState | null)[] = [];
    const unsubscribe = useStore.subscribe((s) => void seen.push(s.sensitivity));
    // het HT-raster rekent intussen door
    await sleep(1500);
    unsubscribe();
    expect(st().sensitivity).toBe(gridMt);
    expect(seen.every((s) => s === gridMt)).toBe(true);

    // terug naar HT: het doorgerekende raster is compleet (uit de cache of nog onderweg), met de HT-volumes
    st().loadInput(ht);
    await until(() => st().sensitivity?.key === sensitivityKey(ht) && !!st().sensitivity?.done, 'raster HT');
    expectCompleteGrid(st().sensitivity, ht);

    st().loadInput(mt);
    expect(st().sensitivity).toBe(gridMt);
  }, 60000);

  it('bedrijfsmodus wisselen gebruikt het klare raster (de modus telt niet mee in de sleutel)', async () => {
    const exceed = normalizeInput(defaultInput('residential'));
    const limited = normalizeInput({ ...exceed, grid: { ...exceed.grid, mode: 'limited' } });
    expect(sensitivityKey(limited)).toBe(sensitivityKey(exceed));

    st().setTab('gevoeligheid');
    st().loadInput(exceed);
    await until(() => !!st().sensitivity?.done, 'raster');
    const grid = st().sensitivity;
    st().loadInput(limited);
    expect(st().sensitivity).toBe(grid);
  }, 60000);

  it('wedloop: een trage download van een werkelijk jaar laat het nieuwere raster voor T1 niet hangen', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    configureEngine({
      mainThread: true,
      createEngine: () =>
        createEngine(async (): Promise<RealYearsJson> => {
          await gate;
          return REAL_JSON;
        }),
    });
    const y2012 = withYear('knmi-2012');
    const t1 = withYear('T1');

    st().setTab('gevoeligheid');
    st().loadInput(y2012);
    await sleep(50);
    st().loadInput(t1);
    await until(
      () => st().sensitivity?.key === sensitivityKey(t1) && computed(st().sensitivity) >= 1,
      'T1-rij',
    );
    release();
    await until(() => st().sensitivity?.key === sensitivityKey(t1) && !!st().sensitivity?.done, 'raster T1');
    expectCompleteGrid(st().sensitivity, t1);
    await until(() => !st().busy, 'doorrekening T1');
    expect(st().analysis?.climateId).toBe('T1');

    // het afgebroken raster van 2012 wordt bij een volgend verzoek gewoon opnieuw berekend
    st().loadInput(y2012);
    await until(() => !!st().sensitivity?.done, 'raster 2012');
    expectCompleteGrid(st().sensitivity, y2012);
  }, 60000);

  it('een fout in het raster eindigt met een melding, komt niet in de cache en wordt opnieuw geprobeerd', async () => {
    let calls = 0;
    configureEngine({
      mainThread: true,
      createEngine: () =>
        createEngine(async () => {
          calls++;
          if (calls === 1) throw new Error('netwerkfout');
          return REAL_JSON;
        }),
    });
    const y2012 = withYear('knmi-2012');
    st().setTab('gevoeligheid');
    st().loadInput(y2012);
    await until(() => !!st().sensitivity?.done, 'raster met fout');
    expect(st().sensitivity?.key).toBe(sensitivityKey(y2012));
    expect(st().sensitivity?.error).toContain('netwerkfout');
    await until(() => !st().busy, 'doorrekening met fout');
    expect(st().error).toContain('netwerkfout');

    // tabblad opnieuw openen: nieuw verzoek, nu met succes
    st().setTab('koude-week');
    st().setTab('gevoeligheid');
    expect(st().sensitivity?.error).toBeUndefined();
    expect(st().sensitivity?.done).toBe(false);
    await until(() => !!st().sensitivity?.done, 'raster na nieuwe poging');
    expectCompleteGrid(st().sensitivity, y2012);
    expect(calls).toBe(2);
  }, 60000);

  it('printen na een rekenfout rekent doorrekening en raster opnieuw (geen oude uitkomst op papier)', async () => {
    let calls = 0;
    configureEngine({
      mainThread: true,
      createEngine: () =>
        createEngine(async () => {
          calls++;
          if (calls === 1) throw new Error('netwerkfout');
          return REAL_JSON;
        }),
    });
    const y2012 = withYear('knmi-2012');
    st().loadInput(y2012);
    await until(() => !st().busy, 'doorrekening met fout');
    expect(st().error).toContain('netwerkfout');

    st().requestPrint();
    expect(st().printing).toBe(true);
    expect(st().busy).toBe(true);
    await until(() => !st().busy && !!st().sensitivity?.done, 'doorrekening en raster');
    expect(st().error).toBeNull();
    expect(st().analysis?.climateId).toBe('knmi-2012');
    expectCompleteGrid(st().sensitivity, y2012);
    st().endPrint();
  }, 60000);
});

describe('store: werkelijke klimaatjaren', () => {
  it('na een mislukte download laadt het volgende jaar opnieuw; de melding noemt het jaar van de getoonde resultaten', async () => {
    let calls = 0;
    configureEngine({
      mainThread: true,
      createEngine: () =>
        createEngine(async () => {
          calls++;
          if (calls === 1) throw new Error('netwerkfout');
          return REAL_JSON;
        }),
    });
    st().loadInput(withYear('T5'));
    await until(() => st().analysis?.climateId === 'T5' && !st().busy, 'T5');

    st().setClimateYear('knmi-2012');
    await until(() => st().error !== null, 'fout 2012');
    expect(st().busy).toBe(false);
    expect(st().error).toContain('netwerkfout');
    expect(st().error).toContain('ontwerpjaar T5');
    expect(st().analysis?.climateId).toBe('T5');

    st().setClimateYear('knmi-1997');
    await until(() => st().analysis?.climateId === 'knmi-1997', '1997');
    expect(st().error).toBeNull();
    expect(calls).toBe(2);
  }, 60000);
});

describe('store: deelbare link van een scenario', () => {
  it('elk ongewijzigd scenario wordt herkend, een gewijzigde invoer niet', () => {
    for (const sc of SCENARIOS) expect(scenarioIdOf(sc.build())).toBe(sc.id);
    const changed = SCENARIOS[1].build();
    changed.buffer.volumeM3 += 0.05;
    expect(scenarioIdOf(changed)).toBeNull();
  });

  it('fromShareHash toont het scenario (met titel) bij een link van een ongewijzigd scenario', () => {
    const sc = SCENARIOS.find((s) => s.id === 'kantoor-buffer') ?? SCENARIOS[5];
    expect(st().fromShareHash(encodeInput(sc.build()))).toBe(true);
    expect(st().scenarioId).toBe(sc.id);

    const own = sc.build();
    own.grid.allowedExceedanceH += 10;
    expect(st().fromShareHash(encodeInput(own))).toBe(true);
    expect(st().scenarioId).toBeNull();
  });
});
