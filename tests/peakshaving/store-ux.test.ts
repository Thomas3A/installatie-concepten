// Store van de werkbank (UX-plan §10, store-contract): eigen invoer en ongedaan maken bij voorbeelden, gebouwfunctie
// en knoppen; Basis open/dicht met localStorage (ook als die een fout gooit); een deellink opent ingeklapt; de link
// bevat geen UI-toestand; het raster rekent automatisch mee, maar niet opnieuw bij een andere buffer, en na een
// rasterfout alleen op een expliciete vraag of bij een andere sleutel.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fromBase64Url } from '../../src/core/shareCodec';
import { defaultInput } from '../../src/concepts/peakshaving/data/defaults';
import { sensitivityKey } from '../../src/concepts/peakshaving/model/analysis';
import { createEngine, type Engine } from '../../src/concepts/peakshaving/model/engine';
import { normalizeInput, rangesOf } from '../../src/concepts/peakshaving/model/input';
import type { PeakshavingInput } from '../../src/concepts/peakshaving/model/types';
import { findScenario } from '../../src/concepts/peakshaving/scenarios';
import { decodeInput, encodeInput, sameInput } from '../../src/concepts/peakshaving/share';
import { configureEngine, useStore } from '../../src/concepts/peakshaving/store';

const st = () => useStore.getState();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function until(cond: () => boolean, what: string, timeoutMs = 40000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) throw new Error(`time-out: ${what}`);
    await sleep(20);
  }
}

const analysisDone = (): boolean => {
  const { analysis, input, busy } = st();
  return !busy && analysis !== null && sameInput(analysis.input, input);
};

/** Eigen invoer: de woning met een ander piekvermogen en een andere aansluiting (geen voorbeeld). */
function ownInput(): PeakshavingInput {
  const i = defaultInput('residential');
  i.building.designLoadKw = 9.5;
  i.grid.connection = '3x25';
  i.buffer.volumeM3 = 0.35;
  return normalizeInput(i);
}

const scenarioInput = (id: string): PeakshavingInput => normalizeInput(findScenario(id)!.build());

/** localStorage-vervanger in het geheugen. */
function memoryStorage(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k: string) => data.get(k) ?? null,
    key: (n: number) => [...data.keys()][n] ?? null,
    removeItem: (k: string) => void data.delete(k),
    setItem: (k: string, v: string) => void data.set(k, String(v)),
  };
}

/** localStorage die bij elke toegang een fout gooit (privévenster, geblokkeerd). */
function throwingStorage(): Storage {
  const fail = (): never => {
    throw new Error('SecurityError: localStorage geblokkeerd');
  };
  return {
    get length(): number {
      return fail();
    },
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  };
}

/** Verse store-module (de beginwaarde van basisOpen wordt bij het laden gelezen). */
async function freshStore(): Promise<typeof import('../../src/concepts/peakshaving/store')> {
  vi.resetModules();
  return import('../../src/concepts/peakshaving/store');
}

beforeEach(() => {
  configureEngine({ mainThread: true });
  const input = scenarioInput('woning-basis');
  useStore.setState({
    input,
    ranges: rangesOf(input),
    scenarioId: 'woning-basis',
    tab: 'concept',
    analysis: null,
    sensitivity: null,
    printing: false,
    error: null,
    ownInput: null,
    undo: null,
    notice: null,
    autoSensitivity: false,
    reveal: null,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('store: standaardwaarden van de werkbank', () => {
  it('Schema is het standaardtabblad; raster en rondleiding staan in de tests uit', async () => {
    const { useStore: fresh } = await freshStore();
    const s = fresh.getState();
    expect(s.tab).toBe('concept');
    expect(s.autoSensitivity).toBe(false);
    expect(s.tourAutoStart).toBe(false);
    expect(s.tourStep).toBeNull();
    expect(s.openedFromLink).toBe(false);
    expect(s.ownInput).toBeNull();
    expect(s.undo).toBeNull();
    expect(s.notice).toBeNull();
  });
});

describe('store: eigen invoer en ongedaan maken', () => {
  it('een voorbeeld over eigen invoer heen bewaart die; "Terug naar je invoer" zet hem exact terug', () => {
    const own = ownInput();
    st().loadInput(own, null);
    st().applyScenario('woning-buffer');
    expect(st().scenarioId).toBe('woning-buffer');
    expect(sameInput(st().input, scenarioInput('woning-buffer'))).toBe(true);
    expect(st().ownInput).toEqual(own);
    expect(st().notice).toEqual({
      kind: 'example',
      text: "Voorbeeld „Woning jaren '70 · 0,5 m³ buffer” geladen",
    });
    // een volgend voorbeeld over een voorbeeld heen laat de bewaarde invoer staan
    st().applyScenario('kantoor-basis');
    expect(st().ownInput).toEqual(own);
    expect(st().notice).toBeNull();
    st().restoreOwnInput();
    expect(st().input).toEqual(own);
    expect(st().scenarioId).toBeNull();
    expect(st().ownInput).toBeNull();
  });

  it('een voorbeeld over een voorbeeld heen bewaart niets', () => {
    st().applyScenario('woning-basis');
    st().applyScenario('woning-buffer');
    expect(st().ownInput).toBeNull();
    expect(st().notice).toBeNull();
  });

  it('gebouwfunctie wisselen over eigen invoer: bewaard, met "Ongedaan maken" exact terug', () => {
    const own = ownInput();
    st().loadInput(own, null);
    st().setKind('office');
    expect(st().input.building.use).toBe('office');
    expect(st().scenarioId).toBe('kantoor-basis');
    expect(st().ownInput).toEqual(own);
    expect(st().undo).toEqual({ input: own, scenarioId: null });
    expect(st().notice).toEqual({ kind: 'kind', text: 'Standaardwaarden voor kantoor geladen' });
    st().undoLast();
    expect(st().input).toEqual(own);
    expect(st().scenarioId).toBeNull();
    expect(st().undo).toBeNull();
    expect(st().notice).toBeNull();
    // terug bij de eigen invoer: niets meer bewaard
    expect(st().ownInput).toBeNull();
  });

  it('terug naar de gebouwfunctie van de eigen invoer: die komt terug (niet de standaardwaarden), met ongedaan maken', () => {
    const own = ownInput();
    st().loadInput(own, null);
    st().setKind('office');
    expect(st().ownInput).toEqual(own);
    // vanaf de ongewijzigde standaardinvoer van kantoor terug naar woning: de eigen woning, niet 8 kW
    st().setKind('single');
    expect(st().input).toEqual(own);
    expect(st().scenarioId).toBeNull();
    expect(st().ownInput).toBeNull();
    expect(st().notice).toEqual({ kind: 'kind', text: 'Je eigen invoer teruggezet' });
    // ongedaan maken: weer het kantoor, en de eigen invoer weer bewaard
    st().undoLast();
    expect(st().scenarioId).toBe('kantoor-basis');
    expect(st().ownInput).toEqual(own);
    // na een wijziging aan het kantoor gaat er iets verloren: dan gewoon de standaardwaarden (en het kantoor bewaard)
    st().update((i) => ({ ...i, building: { ...i.building, designLoadKw: 120 } }));
    const office = st().input;
    st().setKind('single');
    expect(st().scenarioId).toBe('woning-basis');
    expect(st().ownInput).toEqual(office);
  });

  it('gebouwfunctie wisselen vanaf een voorbeeld: geen bewaring en geen melding', () => {
    st().applyScenario('woning-buffer');
    st().setKind('multi');
    expect(st().ownInput).toBeNull();
    expect(st().undo).toBeNull();
    expect(st().notice).toBeNull();
  });

  it('een knop bewaart één stap terug en zet een melding; ongedaan maken zet invoer en voorbeeld exact terug', () => {
    st().applyScenario('woning-basis');
    const before = st().input;
    st().applyFix('Buffer op 0,20 m³', (i) => ({ ...i, buffer: { ...i.buffer, volumeM3: 0.2 } }));
    expect(st().input.buffer.volumeM3).toBe(0.2);
    expect(st().scenarioId).toBeNull();
    expect(st().undo).toEqual({ input: before, scenarioId: 'woning-basis' });
    expect(st().notice).toEqual({ kind: 'fix', text: 'Buffer op 0,20 m³' });
    st().undoLast();
    expect(st().input).toBe(before);
    expect(st().scenarioId).toBe('woning-basis');
    expect(st().undo).toBeNull();
    expect(st().notice).toBeNull();
  });

  it('een knop die een voorbeeld oplevert, herkent dat voorbeeld', () => {
    st().applyScenario('woning-basis');
    st().applyFix('Buffer op 0,50 m³', (i) => ({ ...i, buffer: { ...i.buffer, volumeM3: 0.5 } }));
    expect(st().scenarioId).toBe('woning-buffer');
  });

  it('een handmatige wijziging of het sluiten van de melding laat het ongedaan maken vervallen', () => {
    st().applyScenario('woning-basis');
    // elke ronde een andere batterij: een knop die niets verandert, bewaart geen stap terug
    let kwh = 0;
    const fix = (i: PeakshavingInput): PeakshavingInput => ({
      ...i,
      battery: { capacityKwh: ++kwh, powerKw: null },
    });
    for (const change of [
      () => st().update((i) => ({ ...i, grid: { ...i.grid, heatPumpShare: 0.45 } })),
      () => st().setDesignLoad(9),
      () => st().setClimateYear('T1'),
      () => st().loadInput(defaultInput('office')),
      () => st().dismissNotice(),
    ]) {
      st().applyFix('Batterij op 1,0 kWh', fix);
      expect(st().undo).not.toBeNull();
      change();
      expect(st().undo).toBeNull();
      expect(st().notice).toBeNull();
    }
    // undoLast zonder iets om terug te zetten doet niets
    const input = st().input;
    st().undoLast();
    expect(st().input).toBe(input);
  });

  it('een knop die niets verandert (of geen tekst heeft): geen stap terug, geen melding, geen doorrekening', () => {
    st().applyScenario('woning-basis');
    useStore.setState({ busy: false });
    const before = st().input;
    // een plaatshouder zolang het raster rekent: tekst leeg, invoer ongewijzigd
    st().applyFix('', (i) => i);
    // de waarde staat er al (een nieuwe, gelijke invoer)
    st().applyFix('Buffer op 0,00 m³', (i) => ({ ...i, buffer: { ...i.buffer, volumeM3: 0 } }));
    // zonder tekst: geen melding " · Ongedaan maken", dus ook niets wijzigen
    st().applyFix('', (i) => ({ ...i, buffer: { ...i.buffer, volumeM3: 0.2 } }));
    expect(st().input).toBe(before);
    expect(st().scenarioId).toBe('woning-basis');
    expect(st().undo).toBeNull();
    expect(st().notice).toBeNull();
    expect(st().busy).toBe(false);
    // een eerdere stap terug blijft staan als een volgende knop niets verandert
    st().applyFix('Buffer op 0,20 m³', (i) => ({ ...i, buffer: { ...i.buffer, volumeM3: 0.2 } }));
    const undo = st().undo;
    expect(undo).toEqual({ input: before, scenarioId: 'woning-basis' });
    st().applyFix('Buffer op 0,20 m³', (i) => ({ ...i, buffer: { ...i.buffer, volumeM3: 0.2 } }));
    expect(st().undo).toBe(undo);
    expect(st().notice).toEqual({ kind: 'fix', text: 'Buffer op 0,20 m³' });
  });

  it('de melding "Terug naar je invoer" blijft staan bij een handmatige wijziging', () => {
    st().loadInput(ownInput(), null);
    st().applyScenario('woning-basis');
    st().update((i) => ({ ...i, buffer: { ...i.buffer, volumeM3: 0.4 } }));
    expect(st().notice?.kind).toBe('example');
    expect(st().ownInput).not.toBeNull();
  });
});

describe('store: bedrijfsmodus als weergavekeuze', () => {
  const limitedOf = (i: PeakshavingInput): PeakshavingInput => ({
    ...i,
    grid: { ...i.grid, mode: 'limited' },
  });

  it('wisselen houdt het voorbeeld; terug geeft exact het voorbeeld; een volgend voorbeeld bewaart niets', () => {
    st().applyScenario('woning-basis');
    const before = st().input;
    st().setMode('limited');
    expect(st().input.grid.mode).toBe('limited');
    expect(st().scenarioId).toBe('woning-basis');
    // nogmaals dezelfde keuze: niets
    const limited = st().input;
    st().setMode('limited');
    expect(st().input).toBe(limited);
    st().setMode('exceedance');
    expect(st().input).toEqual(before);
    expect(st().scenarioId).toBe('woning-basis');
    // geen eigen invoer ontstaan: geen "Terug naar je invoer"
    st().setMode('limited');
    st().applyScenario('woning-buffer');
    expect(st().ownInput).toBeNull();
    expect(st().notice).toBeNull();
    // de weergavekeuze blijft staan bij een ander voorbeeld
    expect(st().scenarioId).toBe('woning-buffer');
    expect(st().input).toEqual(limitedOf(scenarioInput('woning-buffer')));
  });

  it('een stap terug en de melding blijven staan; ongedaan maken houdt de gekozen modus', () => {
    st().applyScenario('woning-basis');
    const before = st().input;
    st().applyFix('Buffer op 0,20 m³', (i) => ({ ...i, buffer: { ...i.buffer, volumeM3: 0.2 } }));
    const undo = st().undo;
    const notice = st().notice;
    st().setMode('limited');
    expect(st().undo).toBe(undo);
    expect(st().notice).toBe(notice);
    st().undoLast();
    expect(st().input).toEqual(limitedOf(before));
    expect(st().scenarioId).toBe('woning-basis');
  });

  it('eigen invoer: blijft eigen invoer; bewaren en terugzetten houden de gekozen modus', () => {
    const own = ownInput();
    st().loadInput(own, null);
    st().setMode('limited');
    expect(st().scenarioId).toBeNull();
    expect(st().ownInput).toBeNull();
    st().applyScenario('woning-buffer');
    expect(st().ownInput).toEqual(limitedOf(own));
    expect(st().notice?.kind).toBe('example');
    st().setMode('exceedance');
    st().restoreOwnInput();
    expect(st().input).toEqual(own);
    expect(st().scenarioId).toBeNull();
  });

  it('gebouwfunctie wisselen houdt de modus en herkent het voorbeeld', () => {
    st().applyScenario('woning-basis');
    st().setMode('limited');
    st().setKind('office');
    expect(st().input.grid.mode).toBe('limited');
    expect(st().scenarioId).toBe('kantoor-basis');
    expect(st().ownInput).toBeNull();
  });

  it('de modus gaat mee in de deellink; een link van een voorbeeld met begrenzer toont dat voorbeeld', () => {
    st().applyScenario('woning-buffer');
    st().setMode('limited');
    const code = encodeInput(st().input);
    expect(decodeInput(code)?.grid.mode).toBe('limited');
    st().applyScenario('kantoor-basis');
    st().setMode('exceedance');
    expect(st().fromShareHash(code)).toBe(true);
    expect(st().input.grid.mode).toBe('limited');
    expect(st().scenarioId).toBe('woning-buffer');
    useStore.setState({ openedFromLink: false, basisOpen: true });
  });
});

describe('store: Basis open of dicht', () => {
  it('eerste bezoek open; de keuze wordt bewaard en bij het volgende bezoek gelezen', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const first = (await freshStore()).useStore;
    expect(first.getState().basisOpen).toBe(true);
    first.getState().setBasisOpen(false);
    expect(first.getState().basisOpen).toBe(false);
    expect(storage.data.get('ps-basis-v1')).toBe('dicht');
    const second = (await freshStore()).useStore;
    expect(second.getState().basisOpen).toBe(false);
    second.getState().setBasisOpen(true);
    expect(storage.data.get('ps-basis-v1')).toBe('open');
    // zonder bewaren
    second.getState().setBasisOpen(false, false);
    expect(second.getState().basisOpen).toBe(false);
    expect(storage.data.get('ps-basis-v1')).toBe('open');
  });

  it('localStorage die een fout gooit: open, en wijzigen werkt zonder fout', async () => {
    vi.stubGlobal('localStorage', throwingStorage());
    const { useStore: fresh } = await freshStore();
    expect(fresh.getState().basisOpen).toBe(true);
    expect(() => fresh.getState().setBasisOpen(false)).not.toThrow();
    expect(fresh.getState().basisOpen).toBe(false);
    expect(() => fresh.getState().endTour()).not.toThrow();
  });

  it('een veld tonen opent de Basis, behalve voor de hendels van Wat als?', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    const { useStore: fresh } = await freshStore();
    const s = () => fresh.getState();
    s().setBasisOpen(false);
    s().revealSetting('buffer');
    expect(s().reveal).toEqual({ target: 'buffer', seq: 1 });
    expect(s().basisOpen).toBe(false);
    // de aansluitingsstapper staat in Wat als? (het doel van knoppen die de aansluiting zetten)
    s().revealSetting('connectionStepper');
    expect(s().reveal).toEqual({ target: 'connectionStepper', seq: 2 });
    expect(s().basisOpen).toBe(false);
    s().revealSetting('climate');
    expect(s().reveal).toEqual({ target: 'climate', seq: 3 });
    expect(s().basisOpen).toBe(true);
    // nogmaals hetzelfde veld: een nieuw verzoek
    s().revealSetting('climate');
    expect(s().reveal).toEqual({ target: 'climate', seq: 4 });
  });

  it('een deellink (?c=) opent ingeklapt, zonder dat te bewaren', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const mod = await freshStore();
    mod.configureEngine({ mainThread: true });
    const s = () => mod.useStore.getState();
    expect(s().basisOpen).toBe(true);
    const input = scenarioInput('kantoor-buffer');
    expect(s().fromShareHash(encodeInput(input))).toBe(true);
    expect(s().basisOpen).toBe(false);
    expect(s().openedFromLink).toBe(true);
    expect(s().scenarioId).toBe('kantoor-buffer');
    expect(storage.data.has('ps-basis-v1')).toBe(false);
    // een ongeldige link verandert niets
    expect(s().fromShareHash('%%%')).toBe(false);
  });

  it('rondleiding: starten, stap kiezen en afsluiten bewaart "gezien"', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const mod = await freshStore();
    const s = () => mod.useStore.getState();
    expect(mod.tourSeen()).toBe(false);
    s().startTour();
    expect(s().tourStep).toBe(0);
    s().setTourStep(3);
    expect(s().tourStep).toBe(3);
    s().endTour();
    expect(s().tourStep).toBeNull();
    expect(storage.data.get('ps-rondleiding-v1')).toBe('gezien');
    expect(mod.tourSeen()).toBe(true);
  });

  it('rondleiding: elke start telt (ook vanuit stap 1); stoppen zonder "gezien" bewaart niets', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const mod = await freshStore();
    const s = () => mod.useStore.getState();
    s().startTour();
    const run = s().tourRun;
    s().startTour();
    expect(s().tourStep).toBe(0);
    expect(s().tourRun).toBe(run + 1);
    s().endTour({ seen: false });
    expect(s().tourStep).toBeNull();
    expect(storage.data.has('ps-rondleiding-v1')).toBe(false);
  });

  it('rondleiding: een Basis die de rondleiding opende, klapt na afloop weer in, tenzij je hem zelf zette', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const mod = await freshStore();
    const s = () => mod.useStore.getState();
    s().setBasisOpen(false);
    expect(storage.data.get('ps-basis-v1')).toBe('dicht');
    // de rondleiding opent hem (niet bewaard) en klapt hem bij het afsluiten weer in
    s().startTour();
    s().openBasisForTour();
    expect(s().basisOpen).toBe(true);
    expect(storage.data.get('ps-basis-v1')).toBe('dicht');
    s().endTour();
    expect(s().basisOpen).toBe(false);
    // ook bij stoppen zonder "gezien" (pagina verlaten)
    s().startTour();
    s().openBasisForTour();
    s().endTour({ seen: false });
    expect(s().basisOpen).toBe(false);
    // zelf opengezet tijdens de rondleiding: blijft open (en bewaard)
    s().startTour();
    s().openBasisForTour();
    s().setBasisOpen(true);
    s().endTour();
    expect(s().basisOpen).toBe(true);
    expect(storage.data.get('ps-basis-v1')).toBe('open');
    // al open vóór de rondleiding: blijft open
    s().startTour();
    s().openBasisForTour();
    s().endTour();
    expect(s().basisOpen).toBe(true);
    // je werkt er nog in (keepBasis): blijft open
    s().setBasisOpen(false);
    s().startTour();
    s().openBasisForTour();
    s().endTour({ keepBasis: true });
    expect(s().basisOpen).toBe(true);
    expect(s().tourOpenedBasis).toBe(false);
  });

  it('rondleiding: zelf ingeklapt tijdens de rondleiding klapt hij in die ronde niet meer open', async () => {
    const storage = memoryStorage();
    vi.stubGlobal('localStorage', storage);
    const mod = await freshStore();
    const s = () => mod.useStore.getState();
    // buiten de rondleiding ingeklapt: geen rol
    s().setBasisOpen(false);
    expect(s().tourBasisClosed).toBe(false);
    s().startTour();
    s().openBasisForTour();
    expect(s().basisOpen).toBe(true);
    // "Bekijk het resultaat" tijdens de rondleiding: dicht, bewaard, en niet meer door de rondleiding geopend
    s().setBasisOpen(false);
    expect(s().tourBasisClosed).toBe(true);
    expect(storage.data.get('ps-basis-v1')).toBe('dicht');
    s().openBasisForTour();
    expect(s().basisOpen).toBe(false);
    // zelf weer open (Wijzig): de rondleiding mag hem weer gebruiken
    s().setBasisOpen(true);
    expect(s().tourBasisClosed).toBe(false);
    s().setBasisOpen(false);
    expect(s().tourBasisClosed).toBe(true);
    // afsluiten en een nieuwe ronde: weer zoals altijd
    s().endTour();
    expect(s().tourBasisClosed).toBe(false);
    expect(s().basisOpen).toBe(false);
    s().startTour();
    s().openBasisForTour();
    expect(s().basisOpen).toBe(true);
    s().endTour();
    expect(s().basisOpen).toBe(false);
  });
});

describe('store: deellink zonder UI-toestand', () => {
  it('encodeInput bevat alleen de invoer, ook met eigen invoer, ongedaan maken, melding en rondleiding', () => {
    st().loadInput(ownInput(), null);
    st().applyScenario('woning-buffer');
    st().applyFix('Batterij op 2,0 kWh', (i) => ({ ...i, battery: { capacityKwh: 2, powerKw: null } }));
    st().setBasisOpen(false, false);
    st().startTour();
    st().revealSetting('battery');
    expect(st().ownInput).not.toBeNull();
    expect(st().undo).not.toBeNull();
    const code = st().toShareHash();
    expect(code).toBe(encodeInput(st().input));
    const json = fromBase64Url(code);
    const keys = Object.keys(JSON.parse(json));
    expect(
      keys.every((k) =>
        ['v', 'climateYear', 'building', 'grid', 'heatPump', 'buffer', 'battery'].includes(k),
      ),
    ).toBe(true);
    for (const ui of ['basisOpen', 'ownInput', 'undo', 'notice', 'tourStep', 'reveal', 'openedFromLink'])
      expect(json).not.toContain(ui);
    expect(JSON.parse(json).v).toBe(2);
    expect(decodeInput(code)).toEqual(st().input);
    st().endTour();
  });
});

describe('store: gevoeligheidsraster automatisch', () => {
  /** Rekenmotor die de rasterverzoeken telt. */
  function countingEngine(): { create: () => Engine; requests: () => number } {
    let n = 0;
    return {
      create: () => {
        const e = createEngine();
        return {
          ...e,
          handle: (req, emit) => {
            if (req.type === 'sensitivity') n++;
            return e.handle(req, emit);
          },
        };
      },
      requests: () => n,
    };
  }

  it('uit: alleen een doorrekening; aan: het raster wordt meteen en na elke doorrekening opgevraagd', async () => {
    const input = scenarioInput('woning-basis');
    st().loadInput(input, 'woning-basis');
    await until(analysisDone, 'doorrekening');
    expect(st().sensitivity).toBeNull();
    st().setAutoSensitivity(true);
    expect(st().sensitivity?.key).toBe(sensitivityKey(input));
    await until(() => !!st().sensitivity?.done, 'raster woning');
    expect(st().sensitivity?.error).toBeUndefined();
    // een andere invoer (zonder tabblad Gevoeligheid): ook een raster
    const office = scenarioInput('kantoor-basis');
    st().loadInput(office, 'kantoor-basis');
    expect(st().sensitivity?.key).toBe(sensitivityKey(office));
    await until(() => !!st().sensitivity?.done && analysisDone(), 'raster kantoor');
  }, 60000);

  it('na een rasterfout: geen nieuw raster bij buffer, batterij of knop; wel bij een expliciete vraag of een andere sleutel', async () => {
    // motor waarvan elk raster in een fout eindigt; de doorrekening werkt gewoon
    let requests = 0;
    configureEngine({
      mainThread: true,
      createEngine: () => {
        const e = createEngine();
        return {
          ...e,
          handle: async (req, emit) => {
            if (req.type !== 'sensitivity') return e.handle(req, emit);
            requests++;
            emit({ type: 'error', id: req.id, message: 'raster kapot' });
          },
        };
      },
    });
    const failedNow = (): boolean =>
      st().sensitivity?.key === sensitivityKey(st().input) && st().sensitivity?.error === 'raster kapot';
    st().loadInput(scenarioInput('woning-basis'), 'woning-basis');
    await until(analysisDone, 'doorrekening');
    st().setAutoSensitivity(true);
    await until(failedNow, 'mislukt raster');
    expect(requests).toBe(1);
    const failed = st().sensitivity;
    // de getoonde toestand blijft het mislukte raster: geen wissel naar "wordt berekend" en terug
    const seen: unknown[] = [];
    const unsubscribe = useStore.subscribe((s) => void seen.push(s.sensitivity));
    st().update((i) => ({ ...i, buffer: { ...i.buffer, volumeM3: 0.4 } }));
    await until(analysisDone, 'doorrekening met buffer');
    st().applyFix('Batterij op 1,0 kWh', (i) => ({ ...i, battery: { capacityKwh: 1, powerKw: null } }));
    await until(analysisDone, 'doorrekening met batterij');
    unsubscribe();
    expect(requests).toBe(1);
    expect(st().sensitivity).toBe(failed);
    expect(seen.every((x) => x === failed)).toBe(true);

    // Opnieuw proberen, het tabblad Gevoeligheid en printen vragen het wel opnieuw
    st().retry();
    await until(() => requests === 2 && failedNow() && analysisDone(), 'opnieuw proberen');
    st().setTab('gevoeligheid');
    await until(() => requests === 3 && failedNow(), 'tabblad Gevoeligheid');
    st().setTab('concept');
    st().requestPrint();
    await until(() => requests === 4 && failedNow(), 'printen');
    st().endPrint();
    // een doorrekening daarna weer niet
    st().update((i) => ({ ...i, buffer: { ...i.buffer, volumeM3: 0.6 } }));
    await until(analysisDone, 'doorrekening na printen');
    expect(requests).toBe(4);
    // een andere sleutel (aansluiting) wel, en terug naar de mislukte sleutel ook (ook dat is een andere sleutel)
    st().update((i) => ({ ...i, grid: { ...i.grid, connection: '1x25' } }));
    await until(() => requests === 5 && failedNow() && analysisDone(), 'raster op 1×25 A');
    st().update((i) => ({ ...i, grid: { ...i.grid, connection: '1x35' } }));
    await until(() => requests === 6 && failedNow() && analysisDone(), 'raster terug op 1×35 A');
  }, 60000);

  it('buffer en batterij wijzigen vraagt geen nieuw raster op; de aansluiting wel', async () => {
    const counter = countingEngine();
    configureEngine({ mainThread: true, createEngine: counter.create });
    const input = scenarioInput('woning-buffer');
    st().loadInput(input, 'woning-buffer');
    await until(analysisDone, 'doorrekening');
    expect(counter.requests()).toBe(0);
    st().setAutoSensitivity(true);
    await until(() => !!st().sensitivity?.done, 'raster');
    expect(counter.requests()).toBe(1);
    const grid = st().sensitivity;
    st().update((i) => ({ ...i, buffer: { ...i.buffer, volumeM3: 0.6 } }));
    await until(analysisDone, 'doorrekening met buffer');
    st().applyFix('Batterij op 1,0 kWh', (i) => ({ ...i, battery: { capacityKwh: 1, powerKw: null } }));
    await until(analysisDone, 'doorrekening met batterij');
    expect(counter.requests()).toBe(1);
    expect(st().sensitivity).toBe(grid);
    st().update((i) => ({ ...i, grid: { ...i.grid, connection: '1x25' } }));
    await until(analysisDone, 'doorrekening op 1×25 A');
    expect(counter.requests()).toBe(2);
    expect(st().sensitivity?.key).toBe(sensitivityKey(st().input));
    await until(() => !!st().sensitivity?.done, 'raster 1×25 A');
  }, 60000);
});
