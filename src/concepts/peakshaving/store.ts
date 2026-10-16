// Zustand-store voor het peakshaving-concept: invoer, afgeleide bereiken, resultaten uit de Worker en UI-toestand.
import { create } from 'zustand';
import { defaultInput } from './data/defaults';
import { createEngineClient, type EngineClient } from './engineClient';
import { sensitivityKey, type Analysis } from './model/analysis';
import { COLD_WEEK_HOURS } from './model/climate';
import type { EngineResponse } from './model/engine';
import { normalizeInput, rangesOf, switchUse, withDesignLoad } from './model/input';
import type { Ranges } from './model/ranges';
import type { SensitivityRow } from './model/sizing';
import type { BuildingUse, ClimateYearId, PeakshavingInput } from './model/types';
import { findScenario } from './scenarios';
import { decodeInput, encodeInput } from './share';

export type TabId = 'koude-week' | 'jaar' | 'gevoeligheid' | 'concept' | 'uitleg';

/** Wachttijd na de laatste wijziging voordat er wordt herberekend [ms] (spec §7.4). */
export const DEBOUNCE_MS = 250;
export const DEFAULT_SCENARIO = 'woning-basis';

export interface SensitivityState {
  key: string;
  rows: (SensitivityRow | null)[];
  total: number;
  done: boolean;
}

interface State {
  input: PeakshavingInput;
  ranges: Ranges;
  scenarioId: string | null;
  analysis: Analysis | null;
  /** invoer waarvoor `analysis` is berekend */
  busy: boolean;
  error: string | null;
  sensitivity: SensitivityState | null;
  tab: TabId;
  /** geselecteerd uur (0…8759) voor scrubber en conceptschema; null = standaard */
  scrubHour: number | null;
  playing: boolean;
  copied: boolean;
  // acties
  update: (fn: (i: PeakshavingInput) => PeakshavingInput) => void;
  setDesignLoad: (kw: number) => void;
  setUse: (use: BuildingUse) => void;
  setClimateYear: (id: ClimateYearId) => void;
  applyScenario: (id: string) => void;
  loadInput: (input: PeakshavingInput, scenarioId?: string | null) => void;
  fromShareHash: (code: string) => boolean;
  toShareHash: () => string;
  setTab: (t: TabId) => void;
  setScrubHour: (h: number | null) => void;
  setPlaying: (p: boolean) => void;
  markCopied: (b: boolean) => void;
}

let client: EngineClient | null = null;
let nextId = 1;
let latestAnalyze = 0;
let latestSensitivity = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const sensitivityCache = new Map<string, SensitivityState>();

function engine(): EngineClient {
  client ??= createEngineClient(onResponse);
  return client;
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
      if (msg.id !== latestSensitivity) return;
      const prev = st.sensitivity && st.sensitivity.key === msg.key ? st.sensitivity : null;
      const rows = prev ? prev.rows.slice() : new Array<SensitivityRow | null>(msg.total).fill(null);
      rows[msg.index] = msg.row;
      useStore.setState({ sensitivity: { key: msg.key, rows, total: msg.total, done: false } });
      return;
    }
    case 'sensitivity-done': {
      if (msg.id !== latestSensitivity || !st.sensitivity) return;
      const done = { ...st.sensitivity, done: true };
      sensitivityCache.set(msg.key, done);
      useStore.setState({ sensitivity: done });
      return;
    }
    case 'error':
      if (msg.id === latestAnalyze) useStore.setState({ busy: false, error: msg.message });
      return;
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
  if (tab === 'gevoeligheid') requestSensitivity();
}

function schedule(): void {
  if (timer) clearTimeout(timer);
  useStore.setState({ busy: true });
  timer = setTimeout(computeNow, DEBOUNCE_MS);
}

/** Gevoeligheidsraster alleen als het tabblad open is, met cache op de invoer-sleutel. */
function requestSensitivity(): void {
  const { input, sensitivity } = useStore.getState();
  const key = sensitivityKey(input);
  if (sensitivity && sensitivity.key === key) return;
  const cached = sensitivityCache.get(key);
  if (cached) {
    useStore.setState({ sensitivity: cached });
    return;
  }
  latestSensitivity = nextId++;
  useStore.setState({ sensitivity: { key, rows: [], total: 0, done: false } });
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
    set({ input: next, ranges: rangesOf(next), scenarioId: null, scrubHour: null });
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
    get().loadInput(input, null);
    return true;
  },
  toShareHash: () => encodeInput(get().input),
  setTab: (tab) => {
    set({ tab });
    if (tab === 'gevoeligheid') requestSensitivity();
  },
  setScrubHour: (scrubHour) => set({ scrubHour }),
  setPlaying: (playing) => set({ playing }),
  markCopied: (copied) => set({ copied }),
}));

/** Eerste berekening starten (aangeroepen door de pagina bij het openen). */
export function startEngine(): void {
  if (!useStore.getState().analysis) computeNow();
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
