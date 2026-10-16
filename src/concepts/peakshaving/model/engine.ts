// Rekenmotor achter de Web Worker (spec §7.4): verzoeken met een id, antwoorden via een callback.
// Puur TypeScript zonder DOM, zodat dezelfde motor ook in de hoofdthread en in de tests draait.
import refJson from '../data/referentiejaren.json';
import { analyze, sensitivityAxes, type Analysis } from './analysis';
import {
  decodeRealYear,
  decodeReferenceYear,
  isReferenceYear,
  realYearOf,
  REFERENCE_YEARS,
  type RealYearsJson,
  type ReferenceYearName,
  type ReferenceYearsJson,
} from './climate';
import { gridLimitKw } from './grid';
import { normalizeInput } from './input';
import { prepareYear } from './simulate';
import { sensitivityRow, type SensitivityRow } from './sizing';
import type { ClimateYear, ClimateYearId, PeakshavingInput } from './types';

export type EngineRequest =
  | { type: 'analyze'; id: number; input: PeakshavingInput }
  | { type: 'sensitivity'; id: number; key: string; input: PeakshavingInput };

export type EngineResponse =
  | { type: 'analysis'; id: number; analysis: Analysis }
  | { type: 'sensitivity-row'; id: number; key: string; index: number; total: number; row: SensitivityRow }
  | { type: 'sensitivity-done'; id: number; key: string }
  | { type: 'error'; id: number; message: string };

export type Emit = (msg: EngineResponse, transfer?: Transferable[]) => void;

/** Volgorde van de robuustheidstabel. */
const ROBUSTNESS_ORDER: readonly ReferenceYearName[] = ['energie', 'T5', 'T1'];

/** Overdraagbare buffers van een doorrekening (sneller dan kopiëren). */
export function transferablesOf(a: Analysis): Transferable[] {
  const list: ArrayBuffer[] = [];
  for (const arr of Object.values(a.main.series)) list.push((arr as Float64Array).buffer as ArrayBuffer);
  for (const arr of Object.values(a.durationCurves)) list.push((arr as Float64Array).buffer as ArrayBuffer);
  list.push(a.hours.inUse.buffer as ArrayBuffer, a.hours.preheat.buffer as ArrayBuffer);
  return list;
}

const nextTick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export interface Engine {
  handle: (req: EngineRequest, emit: Emit) => Promise<void>;
  climate: (id: ClimateYearId) => Promise<ClimateYear>;
}

export function createEngine(loadRealYears?: () => Promise<RealYearsJson>): Engine {
  const ref = refJson as unknown as ReferenceYearsJson;
  const refYears = new Map<ReferenceYearName, ClimateYear>();
  const realYears = new Map<number, ClimateYear>();
  let realJson: Promise<RealYearsJson> | null = null;
  let latestSensitivity = 0;

  const loadReal =
    loadRealYears ??
    (async (): Promise<RealYearsJson> => {
      const m = await import('../data/knmi-debilt-1991-2025.json');
      return (m.default ?? m) as unknown as RealYearsJson;
    });

  function reference(name: ReferenceYearName): ClimateYear {
    let y = refYears.get(name);
    if (!y) {
      y = decodeReferenceYear(ref, name);
      refYears.set(name, y);
    }
    return y;
  }

  async function climate(id: ClimateYearId): Promise<ClimateYear> {
    if (isReferenceYear(id)) return reference(id);
    const year = realYearOf(id);
    if (year === null) return reference('T5');
    let y = realYears.get(year);
    if (!y) {
      realJson ??= loadReal();
      y = decodeRealYear(await realJson, year);
      realYears.set(year, y);
    }
    return y;
  }

  async function handle(req: EngineRequest, emit: Emit): Promise<void> {
    try {
      const input = normalizeInput(req.input);
      const year = await climate(input.climateYear);
      if (req.type === 'analyze') {
        const robustnessYears = ROBUSTNESS_ORDER.map(reference);
        if (!isReferenceYear(year.id)) robustnessYears.push(year);
        const analysis = analyze(input, year, { robustnessYears });
        emit({ type: 'analysis', id: req.id, analysis }, transferablesOf(analysis));
        return;
      }
      // gevoeligheidsraster: rij voor rij, met een pauze ertussen zodat een nieuwer verzoek dit kan afbreken
      latestSensitivity = req.id;
      const { building: b, heatPump: hp, buffer, grid } = input;
      const prepared = prepareYear(b, hp, year);
      const { volumes, batteries } = sensitivityAxes(input);
      const base = {
        building: b,
        heatPump: hp,
        buffer,
        pLimitKw: gridLimitKw(grid),
        share: grid.heatPumpShare,
      };
      for (let i = 0; i < volumes.length; i++) {
        await nextTick();
        if (latestSensitivity !== req.id) return;
        const row = sensitivityRow(
          base,
          year,
          volumes[i],
          batteries,
          grid.allowedComfortLossH,
          grid.allowedExceedanceH,
          prepared,
        );
        emit({ type: 'sensitivity-row', id: req.id, key: req.key, index: i, total: volumes.length, row });
      }
      emit({ type: 'sensitivity-done', id: req.id, key: req.key });
    } catch (e) {
      emit({ type: 'error', id: req.id, message: e instanceof Error ? e.message : String(e) });
    }
  }

  return { handle, climate };
}

export { REFERENCE_YEARS };
