// Zustand-store voor het peakshaving-concept: invoer, afgeleide bereiken, resultaten uit de Worker en UI-toestand.
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

export type TabId = 'koude-week' | 'jaar' | 'gevoeligheid' | 'concept' | 'uitleg';

/** Wachttijd na de laatste wijziging voordat er wordt herberekend [ms] (spec §7.4). */
export const DEBOUNCE_MS = 250;
export const DEFAULT_SCENARIO = 'woning-basis';

export interface SensitivityState {
  key: string;
  rows: (SensitivityRow | null)[];
  total: number;
  /** klaar: alle rijen berekend, of afgebroken met een fout (dan staat `error` gevuld en is het raster onvolledig) */
  done: boolean;
  /** foutmelding van de rekenmotor; zo'n raster komt niet in de cache en wordt bij een volgend verzoek opnieuw berekend */
  error?: string;
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
  /** na een rekenfout opnieuw proberen: doorrekening en (op het tabblad Gevoeligheid) het raster */
  retry: () => void;
  toShareHash: () => string;
  setTab: (t: TabId) => void;
  setScrubHour: (h: number | null) => void;
  setPlaying: (p: boolean) => void;
  markCopied: (b: boolean) => void;
  /** printversie opbouwen: rekent zo nodig ook het gevoeligheidsraster en print als alles klaar is */
  requestPrint: () => void;
  endPrint: () => void;
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

function engine(): EngineClient {
  client ??= createEngineClient(onResponse, engineOptions);
  return client;
}

/** Toon `next` als het getoonde raster bij dezelfde invoer-sleutel hoort. */
function showSensitivity(next: SensitivityState): void {
  if (useStore.getState().sensitivity?.key === next.key) useStore.setState({ sensitivity: next });
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
      const finished: SensitivityState = complete
        ? { ...running, done: true }
        : { ...running, done: true, error: 'gevoeligheidsraster onvolledig berekend' };
      running = null;
      if (complete) sensitivityCache.set(msg.key, finished);
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
        // niet in de cache: een volgend verzoek voor deze invoer rekent opnieuw
        const failed: SensitivityState = { ...running, done: true, error: msg.message };
        running = null;
        showSensitivity(failed);
      }
      return;
    }
  }
}

/** Herbereken nu (zonder wachttijd). */
function computeNow(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const { input, tab } = useStore.getState();
  latestAnalyze = nextId++;
  useStore.setState({ busy: true });
  engine().post({ type: 'analyze', id: latestAnalyze, input });
  if (tab === 'gevoeligheid' || useStore.getState().printing) requestSensitivity();
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  useStore.setState({ busy: true });
  timer = setTimeout(computeNow, DEBOUNCE_MS);
}

/** Gevoeligheidsraster alleen als het tabblad open is (of bij printen), met cache op de invoer-sleutel. */
function requestSensitivity(): void {
  const { input, sensitivity } = useStore.getState();
  const key = sensitivityKey(input);
  // klaar (cache) of nog onderweg: alleen tonen
  const known = sensitivityCache.get(key) ?? (running && running.key === key ? running : null);
  if (known) {
    if (sensitivity !== known) useStore.setState({ sensitivity: known });
    return;
  }
  // nieuw verzoek, ook na een fout; de motor breekt een lopend raster voor een andere invoer dan af
  latestSensitivity = nextId++;
  running = { key, rows: [], total: 0, done: false };
  useStore.setState({ sensitivity: running });
  engine().post({ type: 'sensitivity', id: latestSensitivity, key, input });
}

const initialInput = normalizeInput(findScenario(DEFAULT_SCENARIO)?.build() ?? defaultInput('residential'));

export const useStore = create<State>((set, get) => ({
  input: initialInput,
  ranges: rangesOf(initialInput),
  scenarioId: DEFAULT_SCENARIO,
  analysis: null,
  busy: true,
  error: null,
  sensitivity: null,
  tab: 'koude-week',
  scrubHour: null,
  playing: false,
  copied: false,
  printing: false,

  update: (fn) => {
    const next = normalizeInput(fn(get().input));
    set({ input: next, ranges: rangesOf(next), scenarioId: null });
    schedule();
  },
  setDesignLoad: (kw) => {
    const next = withDesignLoad(get().input, kw);
    set({ input: next, ranges: rangesOf(next), scenarioId: null });
    schedule();
  },
  setUse: (use) => {
    const next = switchUse(get().input, use);
    set({ input: next, ranges: rangesOf(next), scenarioId: scenarioIdOf(next), scrubHour: null });
    schedule();
  },
  setKind: (kind) => {
    const next = switchKind(get().input, kind);
    // dezelfde keuze nogmaals: niets wijzigen (het scenario blijft dan ook staan)
    if (next === get().input) return;
    // de standaardinvoer van een keuze is meestal ook een scenario (zoals bij een gedeelde link)
    set({ input: next, ranges: rangesOf(next), scenarioId: scenarioIdOf(next), scrubHour: null });
    schedule();
  },
  setDwellings: (n) => {
    const next = withDwellings(get().input, n);
    // kantoor, ongeldig of ongewijzigd aantal: niets te doen
    if (next === get().input) return;
    set({ input: next, ranges: rangesOf(next), scenarioId: null });
    schedule();
  },
  setClimateYear: (id) => {
    get().update((i) => ({ ...i, climateYear: id }));
    set({ scrubHour: null });
  },
  applyScenario: (id) => {
    const sc = findScenario(id);
    if (sc) get().loadInput(sc.build(), id);
  },
  loadInput: (input, scenarioId = null) => {
    const next = normalizeInput(input);
    set({ input: next, ranges: rangesOf(next), scenarioId, scrubHour: null, playing: false });
    computeNow();
  },
  fromShareHash: (code) => {
    const input = decodeInput(code);
    if (!input) return false;
    // link van een ongewijzigd scenario: dat scenario (met titel) tonen
    get().loadInput(input, scenarioIdOf(input));
    return true;
  },
  retry: () => computeNow(),
  toShareHash: () => encodeInput(get().input),
  setTab: (tab) => {
    set({ tab });
    if (tab === 'gevoeligheid') requestSensitivity();
  },
  setScrubHour: (scrubHour) => set({ scrubHour }),
  setPlaying: (playing) => set({ playing }),
  markCopied: (copied) => set({ copied }),
  requestPrint: () => {
    set({ printing: true, playing: false });
    // wachtende invoer direct doorrekenen; na een rekenfout eerst opnieuw proberen (anders print de vorige uitkomst)
    if (timer || get().error) computeNow();
    requestSensitivity();
  },
  endPrint: () => set({ printing: false }),
}));

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
