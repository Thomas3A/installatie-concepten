// Zustand-store voor het peakshaving-concept: invoer, afgeleide bereiken, resultaten uit de Worker en UI-toestand.
// UI-toestand (Basis open/dicht, eigen invoer, ongedaan maken, rondleiding) komt nooit in de deelbare link.
import { create } from 'zustand';
import { defaultInput } from './data/defaults';
import { createEngineClient, type EngineClient, type EngineClientOptions } from './engineClient';
import { sensitivityKey, type Analysis } from './model/analysis';
import { climateInSentence, COLD_WEEK_HOURS } from './model/climate';
import type { EngineResponse } from './model/engine';
import {
  normalizeInput,
  rangesOf,
  switchKind,
  switchUse,
  withDesignLoad,
  withDwellings,
} from './model/input';
import type { Ranges } from './model/ranges';
import type { SensitivityRow } from './model/sizing';
import type { BuildingKind, BuildingUse, ClimateYearId, PeakshavingInput } from './model/types';
import { findScenario } from './scenarios';
import { decodeInput, encodeInput, sameInput, scenarioIdOf } from './share';
import { TOAST_TEXTS } from './texts';
import { readKey, STORAGE_KEYS, writeKey } from './ui/storage';
import type { SensitivityState } from './view/sensitivityFacts';
import { isWhatIfField, type FieldKey } from './view/types';

export type { SensitivityState } from './view/sensitivityFacts';
export type { FieldKey } from './view/types';

export type TabId = 'koude-week' | 'jaar' | 'gevoeligheid' | 'concept' | 'uitleg';

/** Wachttijd na de laatste wijziging voordat er wordt herberekend [ms] (spec §7.4). */
export const DEBOUNCE_MS = 250;
export const DEFAULT_SCENARIO = 'woning-basis';
/** Standaardtabblad van Verdieping: het schema. */
export const DEFAULT_TAB: TabId = 'concept';

/** Melding onderaan (toast): 'example' → "Terug naar je invoer", 'kind' en 'fix' → "Ongedaan maken". */
export interface Notice {
  kind: 'example' | 'kind' | 'fix';
  text: string;
}

/** Invoer van vóór de laatste knop of gebouwfunctiewissel (één stap terug). */
export interface UndoEntry {
  input: PeakshavingInput;
  scenarioId: string | null;
}

interface State {
  input: PeakshavingInput;
  ranges: Ranges;
  scenarioId: string | null;
  /** laatste geslaagde doorrekening; `analysis.input` is de invoer waarvoor die is berekend */
  analysis: Analysis | null;
  busy: boolean;
  error: string | null;
  sensitivity: SensitivityState | null;
  tab: TabId;
  /** geselecteerd uur (0…8759) voor scrubber en conceptschema; null = standaard */
  scrubHour: number | null;
  playing: boolean;
  copied: boolean;
  /** printversie wordt opgebouwd (grafieken buiten beeld, daarna window.print()) */
  printing: boolean;
  /** Basis open (eerste bezoek) of ingeklapt tot een strook; bewaard in localStorage, nooit in de link */
  basisOpen: boolean;
  /** verzoek om een veld te tonen en te focussen; `seq` maakt een herhaald verzoek voor hetzelfde veld zichtbaar */
  reveal: { target: FieldKey; seq: number } | null;
  /** eigen invoer, bewaard bij het laden van een voorbeeld of een andere gebouwfunctie */
  ownInput: PeakshavingInput | null;
  undo: UndoEntry | null;
  notice: Notice | null;
  /** gevoeligheidsraster na elke doorrekening (standaard aan, uit in de tests) */
  autoSensitivity: boolean;
  /** pagina geopend met een deellink (?c=): Basis dicht, geen automatische rondleiding */
  openedFromLink: boolean;
  /** stap van de rondleiding (0…), null = niet actief */
  tourStep: number | null;
  /** rondleiding mag vanzelf starten bij een eerste bezoek (uit in de tests) */
  tourAutoStart: boolean;
  // acties
  update: (fn: (i: PeakshavingInput) => PeakshavingInput) => void;
  setDesignLoad: (kw: number) => void;
  setUse: (use: BuildingUse) => void;
  /** één woning, meerdere woningen of kantoor: standaardinvoer van die keuze (klimaatjaar blijft) */
  setKind: (kind: BuildingKind) => void;
  /** aantal woningen op de warmtepomp; piekvermogen, tapwater, buffer en batterij schalen mee */
  setDwellings: (n: number) => void;
  setClimateYear: (id: ClimateYearId) => void;
  applyScenario: (id: string) => void;
  loadInput: (input: PeakshavingInput, scenarioId?: string | null) => void;
  fromShareHash: (code: string) => boolean;
  /**
   * na een rekenfout opnieuw proberen: doorrekening en, als er een raster nodig is (tabblad Gevoeligheid, printen of
   * automatisch), ook een raster dat bij deze invoer mislukte
   */
  retry: () => void;
  toShareHash: () => string;
  setTab: (t: TabId) => void;
  setScrubHour: (h: number | null) => void;
  setPlaying: (p: boolean) => void;
  markCopied: (b: boolean) => void;
  /** printversie opbouwen: rekent zo nodig ook het gevoeligheidsraster en print als alles klaar is */
  requestPrint: () => void;
  endPrint: () => void;
  /** Basis open of dicht; `persist` = false bewaart de keuze niet (bijv. bij een deellink) */
  setBasisOpen: (open: boolean, persist?: boolean) => void;
  /** veld tonen: opent zo nodig de Basis; de UI klapt Meer instellingen of Verfijnen open en zet de focus */
  revealSetting: (target: FieldKey) => void;
  /** bewaarde eigen invoer terugzetten */
  restoreOwnInput: () => void;
  /**
   * knop "Wat helpt" e.d.: invoer wijzigen met één stap ongedaan maken en een melding "{label} · Ongedaan maken".
   * Verandert de knop niets (of is er geen tekst), dan gebeurt er niets: geen stap terug en geen melding.
   */
  applyFix: (label: string, fn: (i: PeakshavingInput) => PeakshavingInput) => void;
  undoLast: () => void;
  /** melding sluiten; daarmee vervalt ook het ongedaan maken */
  dismissNotice: () => void;
  setAutoSensitivity: (on: boolean) => void;
  startTour: () => void;
  setTourStep: (n: number) => void;
  /** rondleiding sluiten (Overslaan of Klaar) en als gezien bewaren */
  endTour: () => void;
}

let client: EngineClient | null = null;
let nextId = 1;
let latestAnalyze = 0;
let latestSensitivity = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let engineOptions: EngineClientOptions = {};
/** volledig berekende rasters per invoer-sleutel */
const sensitivityCache = new Map<string, SensitivityState>();
/**
 * Het lopende rasterverzoek (id `latestSensitivity`). Het rekent door als intussen een ander raster uit de cache wordt
 * getoond, en komt na afloop in de cache; alleen als zijn sleutel wordt getoond, gaan de rijen ook naar de UI.
 */
let running: SensitivityState | null = null;
/**
 * Het laatst mislukte raster, als dat bij de invoer van dat moment hoorde. Zolang de sleutel gelijk blijft, vraagt een
 * doorrekening (automatisch raster, schuif, knop) het niet opnieuw op: anders rekent na een fout het hele raster bij
 * elke schuifstap opnieuw (UX-plan §5.3) en wisselt de mini-grafiek tussen "wordt berekend" en "niet beschikbaar".
 * Opnieuw alleen bij een expliciete vraag (Opnieuw proberen, tabblad Gevoeligheid, printen) of een andere sleutel.
 */
let failedSensitivity: SensitivityState | null = null;

function engine(): EngineClient {
  client ??= createEngineClient(onResponse, engineOptions);
  return client;
}

/** Toon `next` als het getoonde raster bij dezelfde invoer-sleutel hoort. */
function showSensitivity(next: SensitivityState): void {
  if (useStore.getState().sensitivity?.key === next.key) useStore.setState({ sensitivity: next });
}

/** Mislukt of onvolledig raster: niet in de cache, wel onthouden als het bij de huidige invoer hoort. */
function failSensitivity(failed: SensitivityState): void {
  running = null;
  if (failed.key === sensitivityKey(useStore.getState().input)) failedSensitivity = failed;
  showSensitivity(failed);
}

function onResponse(msg: EngineResponse): void {
  const st = useStore.getState();
  switch (msg.type) {
    case 'analysis': {
      if (msg.id !== latestAnalyze) return;
      const a = msg.analysis;
      const keep = st.scrubHour !== null && st.scrubHour >= a.coldWeek.from && st.scrubHour < a.coldWeek.to;
      useStore.setState({ analysis: a, busy: false, error: null, scrubHour: keep ? st.scrubHour : null });
      return;
    }
    case 'sensitivity-row': {
      if (msg.id !== latestSensitivity || !running || running.key !== msg.key) return;
      const prev = running.rows;
      const rows = Array.from({ length: msg.total }, (_, i): SensitivityRow | null => prev[i] ?? null);
      rows[msg.index] = msg.row;
      running = { key: msg.key, rows, total: msg.total, done: false };
      showSensitivity(running);
      return;
    }
    case 'sensitivity-done': {
      if (msg.id !== latestSensitivity || !running || running.key !== msg.key) return;
      const complete = running.total === msg.total && running.rows.every((r) => r !== null);
      if (!complete) {
        failSensitivity({ ...running, done: true, error: 'gevoeligheidsraster onvolledig berekend' });
        return;
      }
      const finished: SensitivityState = { ...running, done: true };
      running = null;
      sensitivityCache.set(msg.key, finished);
      showSensitivity(finished);
      return;
    }
    case 'error': {
      if (msg.id === latestAnalyze) {
        // de getoonde resultaten horen nog bij de vorige invoer: dat in de melding zeggen
        const shown = st.analysis;
        let note = '';
        if (shown && shown.climateId !== st.input.climateYear)
          note = `; getoonde resultaten gelden nog voor ${climateInSentence(shown.climateId)}`;
        else if (shown && !sameInput(shown.input, st.input))
          note = '; getoonde resultaten gelden nog voor de vorige invoer';
        useStore.setState({ busy: false, error: msg.message + note });
      }
      if (msg.id === latestSensitivity && running) {
        // niet in de cache: Opnieuw proberen, het tabblad Gevoeligheid, printen of een andere invoer rekent opnieuw
        failSensitivity({ ...running, done: true, error: msg.message });
      }
      return;
    }
  }
}

/**
 * Herbereken nu (zonder wachttijd); het raster ook bij het tabblad Gevoeligheid, bij printen of automatisch.
 * `retry` = Opnieuw proberen: ook een raster dat bij deze sleutel mislukte, wordt opnieuw gevraagd.
 */
function computeNow(retry = false): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const { input, tab } = useStore.getState();
  latestAnalyze = nextId++;
  useStore.setState({ busy: true });
  engine().post({ type: 'analyze', id: latestAnalyze, input });
  const st = useStore.getState();
  if (tab === 'gevoeligheid' || st.printing || st.autoSensitivity) requestSensitivity(retry);
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  useStore.setState({ busy: true });
  timer = setTimeout(() => computeNow(), DEBOUNCE_MS);
}

/**
 * Gevoeligheidsraster op verzoek (tabblad, printen of automatisch), met cache op de invoer-sleutel. `explicit` = de
 * gebruiker vraagt erom (Opnieuw proberen, tabblad Gevoeligheid, printen): dan ook opnieuw na een fout bij deze
 * sleutel; anders blijft een mislukt raster staan tot de sleutel verandert.
 */
function requestSensitivity(explicit = false): void {
  const { input, sensitivity } = useStore.getState();
  const key = sensitivityKey(input);
  if (failedSensitivity && (explicit || failedSensitivity.key !== key)) failedSensitivity = null;
  // klaar (cache), nog onderweg of bij deze sleutel mislukt: alleen tonen
  const known =
    sensitivityCache.get(key) ?? (running && running.key === key ? running : null) ?? failedSensitivity;
  if (known) {
    if (sensitivity !== known) useStore.setState({ sensitivity: known });
    return;
  }
  // nieuw verzoek; de motor breekt een lopend raster voor een andere invoer dan af
  latestSensitivity = nextId++;
  running = { key, rows: [], total: 0, done: false };
  useStore.setState({ sensitivity: running });
  engine().post({ type: 'sensitivity', id: latestSensitivity, key, input });
}

const initialInput = normalizeInput(findScenario(DEFAULT_SCENARIO)?.build() ?? defaultInput('residential'));

/** Een handmatige invoerwijziging: het ongedaan maken vervalt, en daarmee een melding die erop steunt. */
function manualChange(st: Pick<State, 'notice'>): Pick<State, 'undo' | 'notice'> {
  return { undo: null, notice: st.notice && st.notice.kind !== 'example' ? null : st.notice };
}

export const useStore = create<State>((set, get) => ({
  input: initialInput,
  ranges: rangesOf(initialInput),
  scenarioId: DEFAULT_SCENARIO,
  analysis: null,
  busy: true,
  error: null,
  sensitivity: null,
  tab: DEFAULT_TAB,
  scrubHour: null,
  playing: false,
  copied: false,
  printing: false,
  basisOpen: readKey(STORAGE_KEYS.basis) !== 'dicht',
  reveal: null,
  ownInput: null,
  undo: null,
  notice: null,
  autoSensitivity: import.meta.env.MODE !== 'test',
  openedFromLink: false,
  tourStep: null,
  tourAutoStart: import.meta.env.MODE !== 'test',

  update: (fn) => {
    const next = normalizeInput(fn(get().input));
    set({ input: next, ranges: rangesOf(next), scenarioId: null, ...manualChange(get()) });
    schedule();
  },
  setDesignLoad: (kw) => {
    const next = withDesignLoad(get().input, kw);
    set({ input: next, ranges: rangesOf(next), scenarioId: null, ...manualChange(get()) });
    schedule();
  },
  setUse: (use) => {
    const next = switchUse(get().input, use);
    set({
      input: next,
      ranges: rangesOf(next),
      scenarioId: scenarioIdOf(next),
      scrubHour: null,
      ...manualChange(get()),
    });
    schedule();
  },
  setKind: (kind) => {
    const st = get();
    const next = switchKind(st.input, kind);
    // dezelfde keuze nogmaals: niets wijzigen (het scenario blijft dan ook staan)
    if (next === st.input) return;
    // over eigen invoer heen: die bewaren, met één stap terug en een melding "… · Ongedaan maken"
    const own = st.scenarioId === null;
    set({
      input: next,
      ranges: rangesOf(next),
      // de standaardinvoer van een keuze is meestal ook een scenario (zoals bij een gedeelde link)
      scenarioId: scenarioIdOf(next),
      scrubHour: null,
      ...(own
        ? {
            ownInput: st.input,
            undo: { input: st.input, scenarioId: st.scenarioId },
            notice: { kind: 'kind', text: TOAST_TEXTS.kindLoaded(kind) },
          }
        : manualChange(st)),
    });
    schedule();
  },
  setDwellings: (n) => {
    const next = withDwellings(get().input, n);
    // kantoor, ongeldig of ongewijzigd aantal: niets te doen
    if (next === get().input) return;
    set({ input: next, ranges: rangesOf(next), scenarioId: null, ...manualChange(get()) });
    schedule();
  },
  setClimateYear: (id) => {
    get().update((i) => ({ ...i, climateYear: id }));
    set({ scrubHour: null });
  },
  applyScenario: (id) => {
    const sc = findScenario(id);
    if (!sc) return;
    const st = get();
    get().loadInput(sc.build(), id);
    // over eigen invoer heen: die bewaren en terug kunnen ("Terug naar je invoer")
    if (st.scenarioId === null)
      set({
        ownInput: st.input,
        notice: { kind: 'example', text: TOAST_TEXTS.exampleLoaded(sc.shortTitle) },
      });
  },
  loadInput: (input, scenarioId = null) => {
    const next = normalizeInput(input);
    set({
      input: next,
      ranges: rangesOf(next),
      scenarioId,
      scrubHour: null,
      playing: false,
      undo: null,
      notice: null,
    });
    computeNow();
  },
  fromShareHash: (code) => {
    const input = decodeInput(code);
    if (!input) return false;
    // link van een ongewijzigd scenario: dat scenario (met titel) tonen
    get().loadInput(input, scenarioIdOf(input));
    // de ontvanger ziet eerst het resultaat; de keuze voor de Basis wordt niet bewaard
    get().setBasisOpen(false, false);
    set({ openedFromLink: true });
    return true;
  },
  retry: () => computeNow(true),
  toShareHash: () => encodeInput(get().input),
  setTab: (tab) => {
    set({ tab });
    if (tab === 'gevoeligheid') requestSensitivity(true);
  },
  setScrubHour: (scrubHour) => set({ scrubHour }),
  setPlaying: (playing) => set({ playing }),
  markCopied: (copied) => set({ copied }),
  requestPrint: () => {
    set({ printing: true, playing: false });
    // wachtende invoer direct doorrekenen; na een rekenfout eerst opnieuw proberen (anders print de vorige uitkomst)
    if (timer || get().error) computeNow(true);
    requestSensitivity(true);
  },
  endPrint: () => set({ printing: false }),
  setBasisOpen: (open, persist = true) => {
    set({ basisOpen: open });
    if (persist) writeKey(STORAGE_KEYS.basis, open ? 'open' : 'dicht');
  },
  revealSetting: (target) => {
    const seq = (get().reveal?.seq ?? 0) + 1;
    set({ reveal: { target, seq } });
    if (!isWhatIfField(target)) get().setBasisOpen(true);
  },
  restoreOwnInput: () => {
    const own = get().ownInput;
    if (!own) return;
    get().loadInput(own, null);
    set({ ownInput: null });
  },
  applyFix: (label, fn) => {
    const st = get();
    const next = normalizeInput(fn(st.input));
    // niets te doen (bijv. een plaatshouder zolang het raster rekent, of de waarde staat er al): geen stap terug en
    // geen melding; zonder tekst geen melding " · Ongedaan maken"
    if (label.trim() === '' || sameInput(next, st.input)) return;
    set({
      input: next,
      ranges: rangesOf(next),
      scenarioId: scenarioIdOf(next),
      undo: { input: st.input, scenarioId: st.scenarioId },
      notice: { kind: 'fix', text: label },
    });
    computeNow();
  },
  undoLast: () => {
    const { undo, ownInput } = get();
    if (!undo) return;
    set({
      input: undo.input,
      ranges: rangesOf(undo.input),
      scenarioId: undo.scenarioId,
      undo: null,
      notice: null,
      // terug naar de eigen invoer van vóór een gebouwfunctiewissel: die hoeft niet meer bewaard
      ownInput: ownInput === undo.input ? null : ownInput,
    });
    computeNow();
  },
  dismissNotice: () => set({ notice: null, undo: null }),
  setAutoSensitivity: (on) => {
    set({ autoSensitivity: on });
    if (on) requestSensitivity();
  },
  startTour: () => set({ tourStep: 0 }),
  setTourStep: (n) => set({ tourStep: n }),
  endTour: () => {
    set({ tourStep: null });
    writeKey(STORAGE_KEYS.tour, 'gezien');
  },
}));

/** De rondleiding is al eens afgerond of overgeslagen. */
export function tourSeen(): boolean {
  return readKey(STORAGE_KEYS.tour) !== null;
}

/** Eerste berekening starten (aangeroepen door de pagina bij het openen). */
export function startEngine(): void {
  if (!useStore.getState().analysis) computeNow();
}

/**
 * Rekenmotor (opnieuw) instellen, bijv. in tests de motor in de hoofdthread met een eigen loader. Lopende verzoeken
 * worden genegeerd en de cache van het gevoeligheidsraster wordt geleegd; de volgende berekening start de nieuwe motor.
 */
export function configureEngine(options: EngineClientOptions = {}): void {
  client?.dispose();
  client = null;
  engineOptions = options;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  latestAnalyze = latestSensitivity = nextId++;
  running = null;
  failedSensitivity = null;
  sensitivityCache.clear();
  useStore.setState({ sensitivity: null, busy: false, error: null });
}

/**
 * Standaarduur van de scrubber en het conceptschema: het uur van max P_net in de koude week zelf (168 uur, spec §8);
 * bij gelijke P_net (bijv. een batterij die op het budget afschaaft) het uur met de hoogste P_el.
 */
export function defaultScrubHour(a: Analysis): number {
  const { pGrid, pElectric } = a.main.series;
  const from = a.coldWeek.start;
  const to = Math.min(from + COLD_WEEK_HOURS, pGrid.length);
  let best = from;
  for (let t = from; t < to; t++) {
    if (
      pGrid[t] > pGrid[best] + 1e-9 ||
      (Math.abs(pGrid[t] - pGrid[best]) <= 1e-9 && pElectric[t] > pElectric[best])
    )
      best = t;
  }
  return best;
}

/** Geselecteerd uur voor scrubber en conceptschema: gekozen uur, anders het uur van max P_net in de koude week. */
export function useSelectedHour(): number | null {
  const scrub = useStore((st) => st.scrubHour);
  const analysis = useStore((st) => st.analysis);
  if (!analysis) return null;
  return scrub ?? defaultScrubHour(analysis);
}
