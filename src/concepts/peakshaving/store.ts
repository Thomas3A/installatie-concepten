// Zustand-store voor het peakshaving-concept: invoer, afgeleide bereiken, resultaten uit de Worker en UI-toestand.
// UI-toestand (Basis open/dicht, eigen invoer, ongedaan maken, rondleiding) komt nooit in de deelbare link.
import { create } from 'zustand';
import { defaultInput } from './data/defaults';
import { createEngineClient, type EngineClient, type EngineClientOptions } from './engineClient';
import { sensitivityKey, type Analysis } from './model/analysis';
import { climateInSentence, COLD_WEEK_HOURS } from './model/climate';
import type { EngineResponse } from './model/engine';
import {
  buildingKind,
  normalizeInput,
  rangesOf,
  switchKind,
  switchUse,
  withDesignLoad,
  withDwellings,
} from './model/input';
import type { Ranges } from './model/ranges';
import type { SensitivityRow } from './model/sizing';
import type {
  BuildingKind,
  BuildingUse,
  ClimateYearId,
  OperatingMode,
  PeakshavingInput,
} from './model/types';
import { findScenario, SCENARIOS } from './scenarios';
import { decodeInput, encodeInput, sameInput } from './share';
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
  /** bewaarde eigen invoer van vóór de stap, als de stap die heeft teruggezet (wissel naar zijn gebouwfunctie) */
  ownInput?: PeakshavingInput;
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
  /** telt elke start van de rondleiding: opnieuw starten in stap 1 toont die stap opnieuw (scrollen en focus) */
  tourRun: number;
  /**
   * de rondleiding heeft een ingeklapte Basis opengeklapt (alleen UI-toestand); bij het afsluiten klapt hij weer in,
   * tenzij je hem intussen zelf open of dicht hebt gezet
   */
  tourOpenedBasis: boolean;
  /**
   * je klapte de Basis tijdens deze rondleiding zelf in ("Bekijk het resultaat"): stappen in het ingeklapte paneel
   * worden overgeslagen en de rondleiding klapt hem niet meer open (tot je hem zelf weer opent)
   */
  tourBasisClosed: boolean;
  /** rondleiding mag vanzelf starten bij een eerste bezoek (uit in de tests) */
  tourAutoStart: boolean;
  // acties
  update: (fn: (i: PeakshavingInput) => PeakshavingInput) => void;
  setDesignLoad: (kw: number) => void;
  setUse: (use: BuildingUse) => void;
  /**
   * één woning, meerdere woningen of kantoor: standaardinvoer van die keuze (klimaatjaar blijft). Is er bewaarde eigen
   * invoer van die keuze en staat er nu een ongewijzigd voorbeeld, dan komt de eigen invoer terug.
   */
  setKind: (kind: BuildingKind) => void;
  /** aantal woningen op de warmtepomp; piekvermogen, tapwater, buffer en batterij schalen mee */
  setDwellings: (n: number) => void;
  setClimateYear: (id: ClimateYearId) => void;
  /**
   * bedrijfsmodus van grafieken en kerngetallen: een weergavekeuze, geen invoerwijziging. Het voorbeeld, de eigen
   * invoer en het ongedaan maken blijven staan; de modus gaat wel mee in de deellink.
   */
  setMode: (mode: OperatingMode) => void;
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
  /**
   * Basis openklappen voor een stap van de rondleiding: niet bewaard en na afloop weer ingeklapt. Niet als je hem in
   * deze ronde zelf inklapte (tourBasisClosed).
   */
  openBasisForTour: () => void;
  /**
   * rondleiding sluiten. Standaard (Overslaan, Klaar, Esc) als gezien bewaren; `seen` = false bewaart niets (pagina
   * verlaten, geen stap te tonen). Een Basis die de rondleiding opende, klapt weer in, behalve met `keepBasis`.
   */
  endTour: (opts?: { seen?: boolean; keepBasis?: boolean }) => void;
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

/** Invoer met een andere bedrijfsmodus; dezelfde invoer (hetzelfde object) als de modus al klopt. */
function withMode(input: PeakshavingInput, mode: OperatingMode): PeakshavingInput {
  return input.grid.mode === mode ? input : { ...input, grid: { ...input.grid, mode } };
}

/**
 * Id van het voorbeeld met deze invoer, anders null. De bedrijfsmodus telt niet mee: dat is een weergavekeuze in
 * Verdieping, geen eigenschap van het voorbeeld (zie setMode).
 */
function exampleIdOf(input: PeakshavingInput): string | null {
  return (
    SCENARIOS.find((sc) => {
      const example = sc.build();
      return sameInput(withMode(input, example.grid.mode), example);
    })?.id ?? null
  );
}

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
  tourRun: 0,
  tourOpenedBasis: false,
  tourBasisClosed: false,
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
    const cur = get().input;
    // de standaardinvoer van de functie, met dezelfde weergavekeuze (bedrijfsmodus)
    const next = withMode(switchUse(cur, use), cur.grid.mode);
    set({
      input: next,
      ranges: rangesOf(next),
      scenarioId: exampleIdOf(next),
      scrubHour: null,
      ...manualChange(get()),
    });
    schedule();
  },
  setKind: (kind) => {
    const st = get();
    const switched = switchKind(st.input, kind);
    // dezelfde keuze nogmaals: niets wijzigen (het scenario blijft dan ook staan)
    if (switched === st.input) return;
    // terug naar de gebouwfunctie van de bewaarde eigen invoer, vanaf een ongewijzigd voorbeeld of standaardinvoer
    // (er gaat dus niets verloren): de eigen invoer terugzetten in plaats van de standaardwaarden, met één stap terug
    const saved = st.ownInput;
    if (saved && st.scenarioId !== null && buildingKind(saved.building) === kind) {
      const back = withMode(saved, st.input.grid.mode);
      set({
        input: back,
        ranges: rangesOf(back),
        scenarioId: exampleIdOf(back),
        scrubHour: null,
        ownInput: null,
        // ongedaan maken zet ook de bewaarde eigen invoer terug ("↩ Je eigen invoer (bewaard)")
        undo: { input: st.input, scenarioId: st.scenarioId, ownInput: saved },
        notice: { kind: 'kind', text: TOAST_TEXTS.ownInputRestored },
      });
      schedule();
      return;
    }
    // de bedrijfsmodus is een weergavekeuze en blijft staan
    const next = withMode(switched, st.input.grid.mode);
    // over eigen invoer heen: die bewaren, met één stap terug en een melding "… · Ongedaan maken"
    const own = st.scenarioId === null;
    set({
      input: next,
      ranges: rangesOf(next),
      // de standaardinvoer van een keuze is meestal ook een scenario (zoals bij een gedeelde link)
      scenarioId: exampleIdOf(next),
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
  setMode: (mode) => {
    const st = get();
    // nogmaals dezelfde keuze: niets te doen
    if (st.input.grid.mode === mode) return;
    const next = normalizeInput(withMode(st.input, mode));
    // geen manualChange: voorbeeld, eigen invoer, ongedaan maken en melding blijven staan
    set({ input: next, ranges: rangesOf(next) });
    schedule();
  },
  applyScenario: (id) => {
    const sc = findScenario(id);
    if (!sc) return;
    const st = get();
    // het voorbeeld met de huidige weergavekeuze (bedrijfsmodus)
    get().loadInput(withMode(sc.build(), st.input.grid.mode), id);
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
    // link van een ongewijzigd scenario: dat scenario (met titel) tonen; de modus uit de link geldt
    get().loadInput(input, exampleIdOf(input));
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
    // open of dicht gezet buiten de rondleiding om: na afloop niet meer terugzetten; dicht tijdens de rondleiding: die
    // klapt hem in deze ronde niet meer open
    set((st) => ({
      basisOpen: open,
      tourOpenedBasis: false,
      tourBasisClosed: !open && st.tourStep !== null,
    }));
    if (persist) writeKey(STORAGE_KEYS.basis, open ? 'open' : 'dicht');
  },
  revealSetting: (target) => {
    const seq = (get().reveal?.seq ?? 0) + 1;
    set({ reveal: { target, seq } });
    if (!isWhatIfField(target)) get().setBasisOpen(true);
  },
  restoreOwnInput: () => {
    const { ownInput: own, input } = get();
    if (!own) return;
    // de eigen invoer met de huidige weergavekeuze (bedrijfsmodus)
    get().loadInput(withMode(own, input.grid.mode), null);
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
      scenarioId: exampleIdOf(next),
      undo: { input: st.input, scenarioId: st.scenarioId },
      notice: { kind: 'fix', text: label },
    });
    computeNow();
  },
  undoLast: () => {
    const { undo, ownInput, input } = get();
    if (!undo) return;
    // de invoer van vóór de knop, met de huidige weergavekeuze (bedrijfsmodus)
    const back = withMode(undo.input, input.grid.mode);
    set({
      input: back,
      ranges: rangesOf(back),
      scenarioId: undo.scenarioId,
      undo: null,
      notice: null,
      // terug naar de eigen invoer van vóór een gebouwfunctiewissel: die hoeft niet meer bewaard; een teruggezette
      // eigen invoer is na ongedaan maken weer bewaard
      ownInput: undo.ownInput ?? (ownInput === undo.input ? null : ownInput),
    });
    computeNow();
  },
  dismissNotice: () => set({ notice: null, undo: null }),
  setAutoSensitivity: (on) => {
    set({ autoSensitivity: on });
    if (on) requestSensitivity();
  },
  startTour: () => set((st) => ({ tourStep: 0, tourRun: st.tourRun + 1, tourBasisClosed: false })),
  setTourStep: (n) => set({ tourStep: n }),
  openBasisForTour: () => {
    const { basisOpen, tourBasisClosed } = get();
    if (!basisOpen && !tourBasisClosed) set({ basisOpen: true, tourOpenedBasis: true });
  },
  endTour: ({ seen = true, keepBasis = false } = {}) => {
    const { tourOpenedBasis, basisOpen } = get();
    // de Basis weer zoals vóór de rondleiding (dicht); de bewaarde keuze is niet veranderd
    set({
      tourStep: null,
      tourOpenedBasis: false,
      tourBasisClosed: false,
      basisOpen: tourOpenedBasis && !keepBasis ? false : basisOpen,
    });
    if (seen) writeKey(STORAGE_KEYS.tour, 'gezien');
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
 * bij gelijke P_net (bijv. een batterij die op de limiet afschaaft) het uur met de hoogste P_el.
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
