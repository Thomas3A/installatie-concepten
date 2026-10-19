// Effectregels onder de hendels (UX-plan §5.2) en de aansluitingsstapper (§5), met de echte rekenmotor.
import { beforeAll, describe, expect, it } from 'vitest';
import { sensitivityKey, type Analysis } from '../../src/concepts/peakshaving/model/analysis';
import { createEngine } from '../../src/concepts/peakshaving/model/engine';
import { normalizeInput } from '../../src/concepts/peakshaving/model/input';
import { connectionText, exceedanceKpis } from '../../src/concepts/peakshaving/model/kpis';
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

// De geverifieerde uitkomsten van het UX-plan (§4.5) zijn in ontwerpjaar T5 doorgerekend; de voorbeelden rekenen
// sinds de klimaatupdate standaard in T1, dus hier expliciet T5.
const scenario = (id: string): PeakshavingInput =>
  normalizeInput({ ...findScenario(id)!.build(), climateYear: 'T5' });
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
    smallManual: variant('woning-basis', (i) => void (i.battery = { capacityKwh: 0.5, powerKw: 0.15 })),
    // 6 kW op 3×25 A: past ruim, de kleinste passende aansluiting is 1×35 A
    small6: variant('woning-basis', (i) => {
      i.building.designLoadKw = 6;
      i.grid.connection = '3x25';
    }),
    // voorbeeld 3 op 1×25 A met 3 kWh: één schuifstap boven de behoefte
    exact25: variant('woning-buffer-batterij', (i) => {
      i.grid.connection = '1x25';
      i.battery.capacityKwh = 3;
    }),
    limited25: variant('woning-buffer-batterij', (i) => {
      i.grid.connection = '1x25';
      i.grid.mode = 'limited';
    }),
    plateau: variant('woning-basis', (i) => void (i.buffer.volumeM3 = 1.2)),
    // 9 kW met LT 35 en 0,5 m³: de buffer laadt de piek precies tot de limiet (3,22 kW), de batterij doet niets
    atBudget: variant('woning-basis', (i) => {
      i.building.designLoadKw = 9;
      i.heatPump.emitterPreset = 'LT';
      i.buffer.volumeM3 = 0.5;
      i.battery.capacityKwh = 3;
    }),
    // kantoor met tijdconstante 80 h: warmtepomp niet te dimensioneren (de doorrekening gebruikt 3 × 100 kW)
    unsizable: variant('kantoor-basis', (i) => void (i.building.timeConstantH = 80)),
    unsizableMeasures: variant('kantoor-basis', (i) => {
      i.building.timeConstantH = 80;
      i.buffer.volumeM3 = 2;
      i.battery.capacityKwh = 50;
    }),
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
    expect(bufferEffect(A.basis)).toEqual({
      storage: 'Geen buffer · 24,1 kWh per m³',
      sizing: null,
      text: 'Geen buffer · 24,1 kWh per m³',
      plateau: null,
    });
  });

  it('met buffer: opslag, uren piekvermogen en warmtepomp zonder → met', () => {
    expect(bufferEffect(A.buffer, woningGrid)).toEqual({
      storage: '12,0 kWh opslag ≈ 1,5 uur piekvermogen',
      sizing: 'warmtepomp 10,6 → 9,4 kW',
      text: '12,0 kWh opslag ≈ 1,5 uur piekvermogen · warmtepomp 10,6 → 9,4 kW',
      plateau: null,
    });
  });

  it('tijdens het schuiven: het opslagdeel volgt de invoer direct, het warmtepompdeel komt uit de doorrekening', () => {
    const live = (a: Analysis, volumeM3: number) => ({
      input: { ...a.input, buffer: { ...a.input.buffer, volumeM3 } },
      ranges: a.ranges,
    });
    // doorrekening nog zonder buffer, schuif op 0,50 m³: geen "Geen buffer" naast 0,50 en nog geen warmtepompdeel
    expect(bufferEffect(A.basis, woningGrid, live(A.basis, 0.5))).toMatchObject({
      text: '12,0 kWh opslag ≈ 1,5 uur piekvermogen',
      sizing: null,
    });
    // doorrekening met 0,50 m³, schuif op 1,20 m³: opslag van 1,20 m³, warmtepomp van de vorige doorrekening
    expect(bufferEffect(A.buffer, woningGrid, live(A.buffer, 1.2))).toMatchObject({
      storage: '28,9 kWh opslag ≈ 3,6 uur piekvermogen',
      sizing: 'warmtepomp 10,6 → 9,4 kW',
      plateau: 'Meer buffer maakt de warmtepomp niet kleiner: een buffer overbrugt uren, geen dagen.',
    });
    // terug naar 0: geen warmtepompdeel van de vorige doorrekening achter "Geen buffer"
    expect(bufferEffect(A.buffer, woningGrid, live(A.buffer, 0))).toMatchObject({
      text: 'Geen buffer · 24,1 kWh per m³',
      plateau: null,
    });
  });

  it('niet te dimensioneren: "warmtepomp niet te dimensioneren" in plaats van "– → – kW"', () => {
    expect(bufferEffect(A.unsizableMeasures).text).toBe(
      '48,1 kWh opslag ≈ 0,5 uur piekvermogen · warmtepomp niet te dimensioneren',
    );
  });

  it('vanaf het knikpunt de regel "uren, geen dagen" (alleen met een passend raster)', () => {
    expect(bufferEffect(A.plateau, woningGrid).plateau).toBe(
      'Meer buffer maakt de warmtepomp niet kleiner: een buffer overbrugt uren, geen dagen.',
    );
    expect(bufferEffect(A.plateau, null).plateau).toBeNull();
  });
});

describe('effectregel batterij', () => {
  it('geen batterij en uren boven de limiet: kleinste batterij voor 0 uur met "Zet" (naam "Zet op …")', async () => {
    const s = batteryState(A.basis);
    expect(s.text).toBe('Kleinste batterij voor 0 uur: 1,0 kWh');
    // de waarde staat al in de regel; de toegankelijke naam noemt hem wel
    expect(s.fix).toMatchObject({
      label: 'Zet',
      name: 'Zet op 1,0 kWh',
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
      'Doet nu niets: de piek (2,95 kW) blijft al onder de limiet (3,22 kW). Een batterij helpt pas bij een kleinere aansluiting.',
    );
    expect(s.fix?.label).toBe('Probeer 1×25 A');
  });

  it('batterij die niets doet, met de piek afgerond op de limiet: niet "onder" de limiet', () => {
    expect(batteryState(A.atBudget).text).toBe(
      'Doet nu niets: de piek (3,22 kW) komt al niet boven de limiet. Een batterij helpt pas bij een kleinere aansluiting.',
    );
  });

  it('batterij met effect: bruikbaar, vermogen en meterpiek zonder → met (alleen zonder begrenzer)', () => {
    expect(batteryState(A.limited25).text).toBe('4,5 kWh bruikbaar · 2,5 kW · 3,0 kWh is al genoeg');
    expect(batteryState(A.exact25)).toEqual({
      text: '2,7 kWh bruikbaar · 1,5 kW · meterpiek 2,92 → 2,30 kW',
      fix: null,
    });
  });

  it('ruim grotere batterij dan nodig: "{E} kWh is al genoeg" met "Zet", die 0 uur houdt', async () => {
    const s = batteryState(A.both25);
    expect(s.text).toBe('4,5 kWh bruikbaar · 2,5 kW · meterpiek 2,92 → 2,30 kW · 3,0 kWh is al genoeg');
    expect(s.fix).toMatchObject({ label: 'Zet', name: 'Zet op 3,0 kWh', undoLabel: 'Batterij op 3,0 kWh' });
    const next = normalizeInput(s.fix!.apply(A.both25.input));
    expect(next.battery).toEqual({ capacityKwh: 3, powerKw: null });
    expect(exceedanceKpis(await analyzeInput(next)).exceedanceHours).toBe(0);
    // één schuifstap boven de behoefte: geen opmerking
    expect(batteryState(A.exact25).fix).toBeNull();
  });

  it('"◀ Probeer": past al een kleinere aansluiting zonder batterij, dan één stap daaronder (daar is er een nodig)', () => {
    // 6 kW op 3×25 A: het oordeel zegt "Probeer 1×35 A"; op 1×40 A en 1×35 A doet een batterij niets
    expect(connectionText(A.small6.smallest)).toBe('1×35 A');
    const s = batteryState(A.small6);
    expect(s.text).toBe('Niet nodig op 3×25 A. Een batterij helpt pas bij een kleinere aansluiting.');
    expect(s.fix).toMatchObject({ id: 'trySmaller', label: 'Probeer 1×25 A' });
    // met een batterij is de kleinste passende met die batterij berekend: die zelf, zoals de knop bij het oordeel
    expect(connectionText(A.both.smallest)).toBe('1×25 A');
    expect(batteryState(A.both).fix).toMatchObject({ id: 'trySmaller', label: 'Probeer 1×25 A' });
  });

  it('"Zet" bij een handmatig batterijvermogen: de melding zegt dat het vermogen automatisch wordt', () => {
    const s = batteryState(A.smallManual);
    expect(s.fix).toMatchObject({
      name: 'Zet op 1,0 kWh',
      undoLabel: 'Batterij op 1,0 kWh · vermogen automatisch (0,5 C)',
    });
    expect(normalizeInput(s.fix!.apply(A.smallManual.input)).battery).toEqual({
      capacityKwh: 1,
      powerKw: null,
    });
  });

  it('niet te dimensioneren (kantoor, tijdconstante 80 h): geen advies op de terugvalwaarde, geen knop', () => {
    // zonder de poort: "Kleinste batterij voor 0 uur: 210,0 kWh" met "Zet", berekend met 3 × het piekvermogen
    expect(A.unsizable.nominalKw).toBe(300);
    expect(A.unsizable.requiredBattery?.feasible).toBe(true);
    expect(batteryState(A.unsizable)).toEqual({
      text: 'Geen advies zolang de warmtepomp niet te dimensioneren is (zie Resultaat).',
      fix: null,
    });
    // met een batterij: alleen wat de batterij zelf is (geen meterpiek, geen "voor 0 uur")
    expect(batteryState(A.unsizableMeasures)).toEqual({
      text: '45,0 kWh bruikbaar · 25,0 kW · Geen advies zolang de warmtepomp niet te dimensioneren is (zie Resultaat).',
      fix: null,
    });
  });

  it('te kleine batterij: wat er voor 0 uur nodig is, met "Zet"', () => {
    const s = batteryState(A.small);
    expect(s.text).toBe('0,5 kWh bruikbaar · 0,3 kW · meterpiek 3,48 → 3,23 kW · voor 0 uur: 1,0 kWh');
    expect(s.fix).toMatchObject({ label: 'Zet', name: 'Zet op 1,0 kWh', undoLabel: 'Batterij op 1,0 kWh' });
  });
});

describe('aansluitingsstapper', () => {
  it('tekst en stappen in de volgorde van de lijst, daarna grootverbruik', () => {
    const s = connectionSteps({ connection: '1x35', contractedKw: 100, heatPumpShare: 0.4 });
    expect(s.text).toBe('1×35 A · 8,05 kW · limiet 3,22 kW (40 %)');
    expect(s.smaller).toEqual({ connection: '1x25', contractedKw: 100 });
    expect(s.larger).toEqual({ connection: '1x40', contractedKw: 100 });
    expect(connectionSteps({ connection: '1x25', contractedKw: 100, heatPumpShare: 0.4 }).smaller).toBeNull();
  });

  it('vanaf 3×80 A naar grootverbruik met minstens het vermogen van 3×80 A; terug naar 3×80 A', () => {
    expect(largeContractedKw(10)).toBe(60);
    expect(largeContractedKw(100)).toBe(100);
    const top = connectionSteps({ connection: '3x80', contractedKw: 40, heatPumpShare: 0.5 });
    expect(top.text).toBe('3×80 A · 55,4 kW · limiet 27,7 kW (50 %)');
    expect(top.larger).toEqual({ connection: 'grootverbruik', contractedKw: 60 });
    const large = connectionSteps({ connection: 'grootverbruik', contractedKw: 100, heatPumpShare: 0.5 });
    expect(large.text).toBe('Grootverbruik · 100 kW · limiet 50,0 kW (50 %)');
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
