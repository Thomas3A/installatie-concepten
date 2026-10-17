// Effectregels onder de hendels (UX-plan §5.2) en de aansluitingsstapper (§5), met de echte rekenmotor.
import { beforeAll, describe, expect, it } from 'vitest';
import { sensitivityKey, type Analysis } from '../../src/concepts/peakshaving/model/analysis';
import { createEngine } from '../../src/concepts/peakshaving/model/engine';
import { normalizeInput } from '../../src/concepts/peakshaving/model/input';
import { exceedanceKpis } from '../../src/concepts/peakshaving/model/kpis';
import type { SensitivityRow } from '../../src/concepts/peakshaving/model/sizing';
import type { PeakshavingInput } from '../../src/concepts/peakshaving/model/types';
import { findScenario } from '../../src/concepts/peakshaving/scenarios';
import { withoutMeasuresFix } from '../../src/concepts/peakshaving/view/fixes';
import {
  batteryState,
  bufferEffect,
  connectionSteps,
  largeContractedKw,
} from '../../src/concepts/peakshaving/view/levers';
import type { SensitivityState } from '../../src/concepts/peakshaving/view/sensitivityFacts';

const engine = createEngine();

async function analyzeInput(input: PeakshavingInput): Promise<Analysis> {
  let a: Analysis | null = null;
  await engine.handle({ type: 'analyze', id: 1, input }, (m) => {
    if (m.type === 'analysis') a = m.analysis;
  });
  return a!;
}

const scenario = (id: string): PeakshavingInput => normalizeInput(findScenario(id)!.build());
function variant(id: string, patch: (i: PeakshavingInput) => void): PeakshavingInput {
  const i = scenario(id);
  patch(i);
  return normalizeInput(i);
}

const A: Record<string, Analysis> = {};
let woningGrid: SensitivityState;

beforeAll(async () => {
  const inputs = {
    basis: scenario('woning-basis'),
    buffer: scenario('woning-buffer'),
    both: scenario('woning-buffer-batterij'),
    both25: variant('woning-buffer-batterij', (i) => void (i.grid.connection = '1x25')),
    small: variant('woning-basis', (i) => void (i.battery.capacityKwh = 0.5)),
    limited25: variant('woning-buffer-batterij', (i) => {
      i.grid.connection = '1x25';
      i.grid.mode = 'limited';
    }),
    plateau: variant('woning-basis', (i) => void (i.buffer.volumeM3 = 1.2)),
  };
  for (const [k, i] of Object.entries(inputs)) A[k] = await analyzeInput(i);
  const rows: SensitivityRow[] = [];
  const input = inputs.basis;
  const key = sensitivityKey(input);
  await engine.handle({ type: 'sensitivity', id: 2, key, input }, (m) => {
    if (m.type === 'sensitivity-row') rows[m.index] = m.row;
  });
  woningGrid = { key, rows, total: rows.length, done: true };
}, 120000);

describe('effectregel buffer', () => {
  it('zonder buffer: nuttige opslag per m³', () => {
    expect(bufferEffect(A.basis)).toEqual({ text: 'Geen buffer · 24,1 kWh per m³', plateau: null });
  });

  it('met buffer: opslag, uren piekvermogen en warmtepomp zonder → met', () => {
    expect(bufferEffect(A.buffer, woningGrid)).toEqual({
      text: '12,0 kWh opslag ≈ 1,5 uur piekvermogen · warmtepomp 10,6 → 9,4 kW',
      plateau: null,
    });
  });

  it('vanaf het knikpunt de regel "uren, geen dagen" (alleen met een passend raster)', () => {
    expect(bufferEffect(A.plateau, woningGrid).plateau).toBe(
      'Meer buffer maakt de warmtepomp niet kleiner: een buffer overbrugt uren, geen dagen.',
    );
    expect(bufferEffect(A.plateau, null).plateau).toBeNull();
  });
});

describe('effectregel batterij', () => {
  it('geen batterij en uren boven budget: kleinste batterij voor 0 uur met "Zet op"', async () => {
    const s = batteryState(A.basis);
    expect(s.text).toBe('Kleinste batterij voor 0 uur: 1,0 kWh');
    expect(s.fix).toMatchObject({
      label: 'Zet op 1,0 kWh',
      undoLabel: 'Batterij op 1,0 kWh',
      target: 'battery',
    });
    const next = normalizeInput(s.fix!.apply(A.basis.input));
    expect(exceedanceKpis(await analyzeInput(next)).exceedanceHours).toBe(0);
  });

  it('geen batterij en geen overschrijding: niet nodig, met een kleinere aansluiting om te proberen', () => {
    const s = batteryState(A.buffer);
    expect(s.text).toBe('Niet nodig op 1×35 A. Een batterij helpt pas bij een kleinere aansluiting.');
    expect(s.fix).toMatchObject({ id: 'trySmaller', label: 'Probeer 1×25 A', target: 'connectionStepper' });
    expect(normalizeInput(s.fix!.apply(A.buffer.input)).grid.connection).toBe('1x25');
  });

  it('batterij die niets doet', () => {
    const s = batteryState(A.both);
    expect(s.text).toBe(
      'Doet nu niets: de piek (2,95 kW) blijft al onder het budget (3,22 kW). Een batterij helpt pas bij een kleinere aansluiting.',
    );
    expect(s.fix?.label).toBe('Probeer 1×25 A');
  });

  it('batterij met effect: bruikbaar, vermogen en meterpiek zonder → met (alleen zonder begrenzer)', () => {
    expect(batteryState(A.both25)).toEqual({
      text: '4,5 kWh bruikbaar · 2,5 kW · meterpiek 2,92 → 2,30 kW',
      fix: null,
    });
    expect(batteryState(A.limited25).text).toBe('4,5 kWh bruikbaar · 2,5 kW');
  });

  it('te kleine batterij: wat er voor 0 uur nodig is, met "Zet"', () => {
    const s = batteryState(A.small);
    expect(s.text).toBe('0,5 kWh bruikbaar · 0,3 kW · meterpiek 3,48 → 3,23 kW · voor 0 uur: 1,0 kWh');
    expect(s.fix).toMatchObject({ label: 'Zet', undoLabel: 'Batterij op 1,0 kWh' });
  });
});

describe('aansluitingsstapper', () => {
  it('tekst en stappen in de volgorde van de lijst, daarna grootverbruik', () => {
    const s = connectionSteps({ connection: '1x35', contractedKw: 100, heatPumpShare: 0.4 });
    expect(s.text).toBe('1×35 A · 8,05 kW · budget 3,22 kW (40 %)');
    expect(s.smaller).toEqual({ connection: '1x25', contractedKw: 100 });
    expect(s.larger).toEqual({ connection: '1x40', contractedKw: 100 });
    expect(connectionSteps({ connection: '1x25', contractedKw: 100, heatPumpShare: 0.4 }).smaller).toBeNull();
  });

  it('vanaf 3×80 A naar grootverbruik met minstens het vermogen van 3×80 A; terug naar 3×80 A', () => {
    expect(largeContractedKw(10)).toBe(60);
    expect(largeContractedKw(100)).toBe(100);
    const top = connectionSteps({ connection: '3x80', contractedKw: 40, heatPumpShare: 0.5 });
    expect(top.text).toBe('3×80 A · 55,4 kW · budget 27,7 kW (50 %)');
    expect(top.larger).toEqual({ connection: 'grootverbruik', contractedKw: 60 });
    const large = connectionSteps({ connection: 'grootverbruik', contractedKw: 100, heatPumpShare: 0.5 });
    expect(large.text).toBe('Grootverbruik · 100 kW · budget 50,0 kW (50 %)');
    expect(large.larger).toBeNull();
    expect(large.smaller).toEqual({ connection: '3x80', contractedKw: 100 });
  });
});

describe('zonder maatregelen', () => {
  it('zet buffer en batterij op 0, met ongedaan maken', () => {
    const f = withoutMeasuresFix();
    expect(f.label).toBe('Zonder maatregelen');
    const next = f.apply(A.both.input);
    expect(next.buffer.volumeM3).toBe(0);
    expect(next.battery).toEqual({ capacityKwh: 0, powerKw: null });
    expect(next.grid).toEqual(A.both.input.grid);
  });
});
