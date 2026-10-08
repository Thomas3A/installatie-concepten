// Zustand-store voor het klimaatplafond. De simulatiestatus staat buiten React (live) en wordt ~6× per seconde
// naar de UI doorgegeven via `tick`; dat houdt de animatie vloeiend.
import { create } from 'zustand';
import { defaultConfig, normalizeConfig, withValveCount, type KlimaatplafondConfig, type ValveConfig } from './model/config';
import { computeDesign, resolveAdvice, type Design } from './model/design';
import {
  advance,
  DT_SIM,
  initialState,
  LOG_INTERVAL,
  LOG_MAX,
  logEntry,
  roomsOf,
  setRunMode,
  type LogEntry,
  type RunMode,
  type SimState,
} from './model/simulation';
import { buildScenario } from './scenarios';

export type TabId = 'dynamiek' | 'puzzel' | 'klep' | 'uitleg';
export type Overlay = 'water' | 'oppervlak' | 'verdeling';

interface Highlight {
  valve: number;
  strands: number[];
}

/** Waarden die tijdens het draaien kunnen veranderen zonder de simulatie te resetten. */
function structuralKey(cfg: KlimaatplafondConfig): string {
  const c = JSON.parse(JSON.stringify(cfg)) as KlimaatplafondConfig;
  for (const k of ['Kp', 'Ti', 'flowChar', 'speed', 'dewProtection', 'rh', 'startTemp', 'keepCurrent'] as const) {
    (c as unknown as Record<string, unknown>)[k] = 0;
  }
  for (const v of c.valves) {
    v.dtManager = false;
    v.dtMinKoelen = 0;
    v.dtMinVerwarmen = 0;
  }
  return JSON.stringify(c);
}

interface Live {
  sim: SimState;
  design: Design;
  log: LogEntry[];
  acc: number;
  lastTick: number;
  structKey: string;
}

const initialConfig = resolveAdvice(defaultConfig());
const initialDesign = computeDesign(initialConfig);

export const live: Live = {
  sim: initialState(initialDesign, 'stop'),
  design: initialDesign,
  log: [],
  acc: 0,
  lastTick: 0,
  structKey: structuralKey(initialConfig),
};

interface State {
  config: KlimaatplafondConfig;
  design: Design;
  scenarioId: string | null;
  tab: TabId;
  overlay: Overlay;
  showLabels: boolean;
  selValve: number;
  selStrand: number | null;
  highlight: Highlight | null;
  tick: number;
  logVersion: number;
  copied: boolean;
  // acties
  setConfig: (updater: (c: KlimaatplafondConfig) => KlimaatplafondConfig, scenario?: string | null) => void;
  patchValve: (i: number, patch: Partial<ValveConfig>) => void;
  setValveCount: (n: 1 | 2 | 3) => void;
  loadConfig: (c: KlimaatplafondConfig, scenario?: string | null) => void;
  loadScenario: (id: string) => void;
  applyAdvice: (valve: number) => void;
  setTab: (t: TabId) => void;
  setOverlay: (o: Overlay) => void;
  setShowLabels: (b: boolean) => void;
  select: (valve: number, strand?: number | null) => void;
  setHighlight: (h: Highlight | null) => void;
  setMode: (m: RunMode) => void;
  reset: () => void;
  markCopied: (b: boolean) => void;
}

let designTimer: ReturnType<typeof setTimeout> | null = null;

function applyDesign(cfg: KlimaatplafondConfig, force = false): void {
  const design = computeDesign(cfg);
  const key = structuralKey(cfg);
  const prevMode = live.sim.mode;
  const prevT = live.sim.t;
  const sameStruct = key === live.structKey && live.sim.zones.length === design.valves.length;
  live.design = design;
  live.structKey = key;
  if (sameStruct && !force) {
    // hot-swap: alleen runtime-parameters zijn veranderd
  } else {
    const keepTemp = cfg.keepCurrent && prevT > 0 && live.sim.tAir.length === design.valves.length;
    const old = live.sim.tAir;
    let s = initialState(design, 'stop');
    s = setRunMode(s, design, prevMode);
    if (keepTemp) s = { ...s, tAir: old.slice(), tOp: old.slice() };
    live.sim = s;
    live.log = [];
    live.acc = 0;
  }
  useStore.setState({ design, tick: useStore.getState().tick + 1, logVersion: useStore.getState().logVersion + 1 });
}

function scheduleDesign(cfg: KlimaatplafondConfig): void {
  if (designTimer) clearTimeout(designTimer);
  designTimer = setTimeout(() => {
    designTimer = null;
    applyDesign(cfg);
  }, 150);
}

export const useStore = create<State>((set, get) => ({
  config: initialConfig,
  design: initialDesign,
  scenarioId: 'S1',
  tab: 'dynamiek',
  overlay: 'water',
  showLabels: false,
  selValve: 0,
  selStrand: null,
  highlight: null,
  tick: 0,
  logVersion: 0,
  copied: false,

  setConfig: (updater, scenario) => {
    const next = normalizeConfig(updater(get().config));
    set((s) => ({ config: next, scenarioId: scenario === undefined ? s.scenarioId : scenario }));
    scheduleDesign(next);
  },
  patchValve: (i, patch) => {
    get().setConfig((c) => ({ ...c, valves: c.valves.map((v, k) => (k === i ? { ...v, ...patch } : v)) }));
  },
  setValveCount: (n) => {
    get().setConfig((c) => resolveAdvice(normalizeConfig(withValveCount(c, n))));
  },
  loadConfig: (c, scenario = null) => {
    const next = resolveAdvice(normalizeConfig(c));
    if (designTimer) clearTimeout(designTimer);
    set({ config: next, scenarioId: scenario, selValve: 0, selStrand: null, highlight: null });
    applyDesign(next, true);
  },
  loadScenario: (id) => {
    const cfg = buildScenario(id);
    if (!cfg) return;
    get().loadConfig(cfg, id);
    get().reset();
  },
  applyAdvice: (valve) => {
    const cfg = get().config;
    const forced = resolveAdvice(
      { ...cfg, valves: cfg.valves.map((v, i) => (i === valve ? { ...v, kvsKoelen: null, kvsVerwarmen: null, picv: null } : v)) },
      false,
    );
    get().setConfig(() => forced);
  },
  setTab: (tab) => set({ tab }),
  setOverlay: (overlay) => set({ overlay }),
  setShowLabels: (showLabels) => set({ showLabels }),
  select: (valve, strand = null) => set({ selValve: valve, selStrand: strand, highlight: strand === null ? null : { valve, strands: [strand] } }),
  setHighlight: (highlight) => set(highlight ? { highlight, selValve: highlight.valve } : { highlight }),
  setMode: (m) => {
    live.sim = setRunMode(live.sim, live.design, m);
    set((s) => ({ tick: s.tick + 1 }));
  },
  reset: () => {
    if (designTimer) {
      clearTimeout(designTimer);
      designTimer = null;
      applyDesign(get().config, true);
    }
    live.sim = initialState(live.design, 'stop');
    live.log = [];
    live.acc = 0;
    set((s) => ({ tick: s.tick + 1, logVersion: s.logVersion + 1 }));
  },
  markCopied: (copied) => set({ copied }),
}));

/** Eén animatieframe van de simulatie. */
export function engineFrame(dtMs: number): void {
  const { sim, design } = live;
  if (sim.mode === 'stop' && sim.t === 0) return;
  const speed = useStore.getState().config.speed;
  live.acc += (speed * Math.min(dtMs, 100)) / 1000 / DT_SIM;
  const steps = Math.floor(live.acc);
  if (steps > 0) {
    live.acc -= steps;
    let logged = false;
    const res = advance(sim, design, steps, 9, (s) => {
      const t = Math.round(s.t);
      if (t % LOG_INTERVAL === 0) {
        live.log.push(logEntry(s, design));
        if (live.log.length > LOG_MAX) live.log.shift();
        logged = true;
      }
    });
    live.sim = res.state;
    if (res.done < steps) live.acc = 0; // rekenbudget op: niet inhalen
    void logged;
  }
  const now = performance.now();
  if (now - live.lastTick > 160) {
    live.lastTick = now;
    useStore.setState((s) => ({ tick: s.tick + 1, logVersion: s.logVersion + 1 }));
  }
}

export { roomsOf };
