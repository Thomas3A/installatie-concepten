// Oordeel van het Resultaat (UX-plan §4.1–§4.5) met de echte rekenmotor in de hoofdthread: de geverifieerde
// uitkomsten van §4.5 letterlijk, en elke knop doet wat hij belooft (toepassen, opnieuw doorrekenen, uren ≤ toegestaan),
// in elk voorbeeld: de knoppen van het oordeel, "Zet" bij de batterij en de stippen in de mini-grafiek; ook bij
// rasterpunten die niet op de schuifstap liggen (V_max = 2,5 m³, E_max = 15 kWh).
import { beforeAll, describe, expect, it } from 'vitest';
import { sensitivityKey, type Analysis } from '../../src/concepts/peakshaving/model/analysis';
import { createEngine } from '../../src/concepts/peakshaving/model/engine';
import { normalizeInput, withDesignLoad } from '../../src/concepts/peakshaving/model/input';
import { exceedanceKpis } from '../../src/concepts/peakshaving/model/kpis';
import type { SensitivityRow } from '../../src/concepts/peakshaving/model/sizing';
import type { PeakshavingInput } from '../../src/concepts/peakshaving/model/types';
import { findScenario, SCENARIOS } from '../../src/concepts/peakshaving/scenarios';
import { MESSAGE_TEXTS } from '../../src/concepts/peakshaving/texts';
import { fmt } from '../../src/core/format';
import {
  batteryForZero,
  boilerLimitedByBudget,
  shareForPeak,
  type Fix,
} from '../../src/concepts/peakshaving/view/fixes';
import { batteryState } from '../../src/concepts/peakshaving/view/levers';
import { miniChartGeometry } from '../../src/concepts/peakshaving/view/miniChart';
import { gridMatches, type SensitivityState } from '../../src/concepts/peakshaving/view/sensitivityFacts';
import { buildVerdict, NEARLY_FIT_FRACTION, type Verdict } from '../../src/concepts/peakshaving/view/verdict';

const engine = createEngine();

async function analyzeInput(input: PeakshavingInput): Promise<Analysis> {
  let a: Analysis | null = null;
  let err: string | null = null;
  await engine.handle({ type: 'analyze', id: 1, input }, (m) => {
    if (m.type === 'analysis') a = m.analysis;
    if (m.type === 'error') err = m.message;
  });
  if (!a) throw new Error(`geen doorrekening: ${err}`);
  return a;
}

async function gridOf(input: PeakshavingInput): Promise<SensitivityState> {
  const rows: (SensitivityRow | null)[] = [];
  let total = 0;
  const key = sensitivityKey(input);
  await engine.handle({ type: 'sensitivity', id: 2, key, input }, (m) => {
    if (m.type === 'sensitivity-row') {
      rows[m.index] = m.row;
      total = m.total;
    }
  });
  return { key, rows, total, done: true };
}

const scenario = (id: string): PeakshavingInput => normalizeInput(findScenario(id)!.build());

function variant(id: string, patch: (i: PeakshavingInput) => void): PeakshavingInput {
  const i = scenario(id);
  patch(i);
  return normalizeInput(i);
}

interface Case {
  input: PeakshavingInput;
  a: Analysis;
  sens: SensitivityState;
  v: Verdict;
}

async function caseOf(input: PeakshavingInput): Promise<Case> {
  const [a, sens] = await Promise.all([analyzeInput(input), gridOf(input)]);
  return { input, a, sens, v: buildVerdict(a, sens) };
}

const labels = (fixes: Fix[]): string[] => fixes.map((f) => f.label);

/** Knop toepassen en opnieuw doorrekenen: de uren boven de limiet na de knop. */
async function hoursAfter(input: PeakshavingInput, fix: Fix): Promise<number> {
  const next = normalizeInput(fix.apply(input));
  return exceedanceKpis(await analyzeInput(next)).exceedanceHours;
}

const cases: Record<string, Case> = {};
/** Elk voorbeeld uit SCENARIOS, op id. */
const examples: Record<string, Case> = {};

beforeAll(async () => {
  for (const sc of SCENARIOS) examples[sc.id] = await caseOf(scenario(sc.id));
  Object.assign(cases, {
    basis: examples['woning-basis'],
    buffer: examples['woning-buffer'],
    both: examples['woning-buffer-batterij'],
    dwellings: examples['woningen-basis'],
    office: examples['kantoor-basis'],
  });
  const inputs: Record<string, PeakshavingInput> = {
    both25: variant('woning-buffer-batterij', (i) => {
      i.grid.connection = '1x25';
    }),
    buffer3x25: variant('woning-buffer', (i) => {
      i.grid.connection = '3x25';
    }),
    // net boven en net onder de grens van 3 % (B15)
    share425: variant('woning-basis', (i) => {
      i.grid.heatPumpShare = 0.425;
    }),
    share42: variant('woning-basis', (i) => {
      i.grid.heatPumpShare = 0.42;
    }),
    share43: variant('woning-basis', (i) => {
      i.grid.heatPumpShare = 0.43;
      i.grid.allowedExceedanceH = 5;
    }),
    officeHeavy: variant('kantoor-basis', (i) => {
      i.building.timeConstantH = 80;
    }),
    officeHeavyMeasures: variant('kantoor-basis', (i) => {
      i.building.timeConstantH = 80;
      i.buffer.volumeM3 = 2;
      i.battery.capacityKwh = 50;
    }),
    // boiler veel te klein voor de tapvraag: niet te dimensioneren door het tapwater
    tinyBoiler: variant('woning-basis', (i) => {
      i.building.dhw.tankLitre = 50;
      i.building.dhw.dailyKwh = 30;
    }),
    // rasterpunten naast de schuifstap: V_max = 2,5 m³ (0,05 × 2,5 = 0,125 m³) en E_max = 15 kWh (0,25 × 15 = 3,75)
    offStep5kW: normalizeInput({
      ...withDesignLoad(scenario('woning-basis'), 5),
      grid: { ...scenario('woning-basis').grid, heatPumpShare: 0.3 },
    }),
    nieuwbouw35: variant('nieuwbouw', (i) => {
      i.grid.connection = '1x35';
    }),
    // handmatig WP-vermogen met buffer: de doorrekening zonder maatregelen dimensioneert automatisch
    manualBuffer: variant('woning-buffer', (i) => {
      i.heatPump.sizingMode = 'manual';
      i.heatPump.nominalKw = 12;
    }),
    // te kleine batterij: 0,01 kW boven de limiet, afgerond 0 %
    tinyOver: variant('woning-basis', (i) => {
      i.battery.capacityKwh = 0.5;
    }),
  };
  for (const [k, input] of Object.entries(inputs)) cases[k] = await caseOf(input);
}, 240000);

describe('oordeel: geverifieerde uitkomsten (§4.5)', () => {
  it('woning-basis (8 kW, 1×35 A, 40 %): past niet, met vier knoppen', () => {
    const { v } = cases.basis;
    expect(v.status).toBe('notFit');
    expect(v.tone).toBe('err');
    expect(v.icon).toBe('✕');
    expect(v.headline).toBe('Past niet op 1×35 A');
    expect(v.detail).toBe('101 uur per jaar boven de WP-limiet van 3,22 kW, tot 0,26 kW (8 %) erboven.');
    expect(v.fixesLabel).toBe('Wat helpt');
    expect(labels(v.fixes)).toEqual([
      '0,20 m³ buffer',
      '1,0 kWh batterij',
      '1×40 A',
      'of 44 % voor de warmtepomp',
    ]);
    expect(v.liveText).toBe('Past niet op 1×35 A: 101 uur per jaar boven de limiet.');
    expect(v.mini).toBe('Past niet · 101 uur · WP 10,6 kW');
    expect(v.limiterLine).toEqual({
      text: 'Met begrenzer: geen uur te koud (laagste 19,5 °C).',
      tone: 'neutral',
    });
    expect(v.stressLine).toBe('Strenge winter (T1): 111 uur boven de limiet, 40 uur te koud.');
  });

  it('woning-basis: tegels en meterbalk', () => {
    const { v } = cases.basis;
    const [hp, ex, sm] = v.tiles;
    expect(hp).toMatchObject({
      title: 'Warmtepomp',
      value: '10,6',
      // thermisch, naast de elektrische piek aan de meter en de limiet
      unit: 'kW th',
      line: 'A7/W35 · 7,4 kW bij −10 °C',
      tone: 'neutral',
      reference: null,
      refineLink: true,
    });
    expect(ex).toMatchObject({
      title: 'Boven de limiet',
      value: '101',
      unit: 'uur/jaar',
      line: '12 kWh/jaar',
      reference: null,
    });
    expect(sm).toMatchObject({
      title: 'Kleinste aansluiting',
      value: '1×40 A',
      line: '1 stap groter dan de huidige',
      reference: null,
    });
    const m = v.meter;
    expect(m.ariaLabel).toBe('Piek aan de meter 3,48 kW tegen de WP-limiet van 3,22 kW');
    expect(m.peakLabel).toBe('Piek aan de meter 3,48 kW');
    expect(m.budgetLabel).toBe('limiet 3,22 kW');
    expect(m.withoutLabel).toBeNull();
    expect(m.shadowKw).toBeNull();
    expect(m.shaved).toBeNull();
    expect(m.maxKw).toBeCloseTo(1.1 * m.peakKw, 9);
    expect(m.base.end).toBeCloseTo(m.budgetPos, 9);
    expect(m.over!.start).toBeCloseTo(m.budgetPos, 9);
    expect(m.over!.end).toBeCloseTo(1 / 1.1, 9);
  });

  it('+ 0,5 m³ (voorbeeld 2): past, met de tegels tegen zonder maatregelen en een kleinere aansluiting uit het raster', async () => {
    const { v, input } = cases.buffer;
    expect(v.status).toBe('fit');
    expect(v.icon).toBe('✓');
    expect(v.headline).toBe('Past op 1×35 A met 0,50 m³ buffer');
    expect(v.detail).toBe('Piek aan de meter 3,18 kW, 0,04 kW (1 %) onder de limiet van 3,22 kW.');
    expect(v.tiles.map((t) => [t.value, t.reference])).toEqual([
      // het verschil uit de getoonde waarden: 9,4 − 10,6 = −1,2 (ongerond −1,1)
      ['9,4', 'zonder maatregelen 10,6 kW (−1,2)'],
      ['0', 'zonder maatregelen 101 uur'],
      ['1×35 A', 'zonder maatregelen 1×40 A'],
    ]);
    expect(v.tiles[1].line).toBe('geen enkel uur');
    expect(v.tiles[2].line).toBe('gelijk aan de huidige');
    expect(v.stressLine).toBe('Strenge winter (T1): 0 uur boven de limiet, 48 uur te koud.');
    expect(v.fixesLabel).toBe('Kleinere aansluiting volstaat ook');
    // 1×25 A past zonder batterij nergens, met batterij al bij 0,50 m³ of minder: alleen de aansluiting, het oordeel
    // noemt daarna de exacte batterij (niet de grovere rasterbatterij of meer buffer)
    expect(labels(v.fixes)).toEqual(['Probeer 1×25 A (met batterij)']);
    expect(v.fixes[0].undoLabel).toBe('Aansluiting 1×25 A');
    const next = normalizeInput(v.fixes[0].apply(input));
    expect(next.grid.connection).toBe('1x25');
    expect(next.buffer.volumeM3).toBe(0.5);
    await expectBatteryRoute('Probeer 1×25 A (met batterij)', input, v.fixes[0]);
    // meterbalk: schaduwstreep op de piek zonder maatregelen
    expect(v.meter.withoutLabel).toBe('zonder maatregelen 3,48 kW');
    expect(v.meter.shadowPos).toBeCloseTo(v.meter.shadowKw! / v.meter.maxKw, 9);
  });

  it('voorbeeld 3 (1 m³ + 5 kWh, 1×35 A): past, kleinere aansluiting exact uit het model', async () => {
    const { v, input } = cases.both;
    // de batterij doet hier niets (zonder batterij al 0 uur): geen eer in de kop
    expect(v.headline).toBe('Past op 1×35 A met 1,00 m³ buffer');
    expect(v.detail).toBe('Piek aan de meter 2,95 kW, 0,27 kW (8 %) onder de limiet van 3,22 kW.');
    expect(v.fixesLabel).toBe('Kleinere aansluiting volstaat ook');
    expect(labels(v.fixes)).toEqual(['Probeer 1×25 A']);
    expect(await hoursAfter(input, v.fixes[0])).toBe(0);
  });

  it('handmatig WP-vermogen: geen verwijzingen "zonder maatregelen" (die rekenen met een automatische WP)', () => {
    const { v, a } = cases.manualBuffer;
    // de doorrekening zonder maatregelen heeft een andere warmtepomp dan de knop "↺ Zonder maatregelen" geeft
    expect(a.withoutMeasures.nominalKw).not.toBeCloseTo(12, 1);
    expect(v.tiles.map((t) => t.reference)).toEqual([null, null, null]);
    expect(v.meter.withoutLabel).toBeNull();
    expect(v.meter.shadowKw).toBeNull();
    expect(v.tiles[0]).toMatchObject({ title: 'Warmtepomp (handmatig)', value: '12,0', unit: 'kW th' });
  });

  it('een klein maar echt verschil rondt niet af op "0 %"', () => {
    expect(cases.tinyOver.v.detail).toBe(
      '2 uur per jaar boven de WP-limiet van 3,22 kW, tot 0,01 kW (< 1 %) erboven.',
    );
  });

  it('voorbeeld 3 op 1×25 A: de batterij schaaft af tot de limiet; met begrenzer 11 uur te koud', () => {
    const { v } = cases.both25;
    expect(v.status).toBe('fit');
    expect(v.headline).toBe('Past op 1×25 A met 1,00 m³ buffer en 5,0 kWh batterij');
    expect(v.detail).toBe('Piek aan de meter 2,30 kW = limiet; de batterij schaaft 0,62 kW af.');
    expect(v.limiterLine).toEqual({ text: 'Met begrenzer: 11 uur te koud (laagste 18,7 °C).', tone: 'warn' });
    expect(v.fixes).toEqual([]);
    expect(v.fixesLabel).toBeNull();
    // meterbalk: gearceerd van de piek tot de piek zonder batterij
    expect(v.meter.shaved).not.toBeNull();
    expect(v.meter.shaved!.fromKw).toBeCloseTo(2.3, 6);
    expect(v.meter.shaved!.toKw).toBeCloseTo(cases.both25.a.noBattery.pGridMaxKw, 9);
  });

  it('3×25 A met 0,5 m³: past ruim, kleinste aansluiting twee stappen kleiner', async () => {
    const { v, input } = cases.buffer3x25;
    expect(v.status).toBe('fitAmple');
    expect(v.headline).toBe('Past ruim op 3×25 A met 0,50 m³ buffer');
    expect(v.tiles[2].value).toBe('1×35 A');
    expect(v.tiles[2].line).toBe('2 stappen kleiner dan de huidige');
    expect(labels(v.fixes)).toEqual(['Probeer 1×35 A']);
    expect(await hoursAfter(input, v.fixes[0])).toBe(0);
  });

  it('10 woningen: past niet op 3×35 A, met 90 % voor de warmtepomp', () => {
    const { v } = cases.dwellings;
    expect(v.headline).toBe('Past niet op 3×35 A');
    expect(v.detail).toBe('121 uur per jaar boven de WP-limiet van 19,40 kW, tot 2,18 kW (11 %) erboven.');
    expect(labels(v.fixes)).toEqual([
      '1,25 m³ buffer',
      '4,5 kWh batterij',
      '3×40 A',
      'of 90 % voor de warmtepomp',
    ]);
    // kW/woning in de tegel, nooit "per woning"
    expect(v.tiles[0].line).toBe('A7/W35 · 46,0 kW bij −10 °C · 6,6 kW/woning');
    expect(JSON.stringify(v)).not.toContain('per woning');
  });

  it('kantoor-basis: past niet op 3×80 A; grootverbruik als aansluiting', () => {
    const { v } = cases.office;
    expect(v.headline).toBe('Past niet op 3×80 A');
    expect(v.detail).toBe('327 uur per jaar boven de WP-limiet van 27,7 kW, tot 18,6 kW (67 %) erboven.');
    expect(v.limiterLine).toEqual({
      text: 'Met begrenzer: 115 uur te koud (laagste 15,2 °C).',
      tone: 'warn',
    });
    expect(v.stressLine).toBe('Strenge winter (T1): 424 uur boven de limiet, 157 uur te koud.');
    expect(labels(v.fixes)).toEqual([
      '20,00 m³ buffer',
      '200,0 kWh batterij',
      'Grootverbruik 95 kW',
      'of 84 % voor de warmtepomp',
    ]);
    expect(v.tiles[2]).toMatchObject({ value: 'Grootverbruik 95 kW', line: 'groter dan de huidige' });
    expect(v.meter.budgetLabel).toBe('limiet 27,7 kW');
  });

  it('woning met 43 % en 5 toegestane uren: past binnen de toegestane uren', () => {
    const { v } = cases.share43;
    expect(v.status).toBe('withinAllowed');
    expect(v.tone).toBe('warn');
    expect(v.icon).toBe('!');
    expect(v.headline).toBe('Past op 1×35 A, binnen de toegestane 5 uur');
    expect(v.detail).toBe('4 uur per jaar boven de WP-limiet van 3,46 kW, tot 0,02 kW erboven.');
    expect(v.fixesLabel).toBe('Wat helpt');
    expect(labels(v.fixes)).toEqual(['0,20 m³ buffer', '0,5 kWh batterij', 'of 44 % voor de warmtepomp']);
    // 4 uur boven de limiet met minder dan 0,5 kWh: niet "0 kWh/jaar" onder "4 uur/jaar"
    const kwh = exceedanceKpis(cases.share43.a).exceedanceKwh;
    expect(kwh).toBeGreaterThan(0);
    expect(kwh).toBeLessThan(0.5);
    expect(v.tiles[1].value).toBe('4');
    expect(v.tiles[1].line).toBe('< 1 kWh/jaar');
  });

  it('woning met 42,5 %: past net niet (piek hoogstens 3 % boven de limiet)', () => {
    const { a, v } = cases.share425;
    const ex = exceedanceKpis(a);
    expect(ex.pGridMaxKw - a.pLimitKw).toBeGreaterThan(0);
    expect(ex.pGridMaxKw - a.pLimitKw).toBeLessThanOrEqual(NEARLY_FIT_FRACTION * a.pLimitKw);
    expect(v.status).toBe('nearlyFit');
    expect(v.tone).toBe('err');
    expect(v.icon).toBe('✕');
    expect(v.headline).toBe('Past net niet op 1×35 A');
    expect(v.detail).toBe('13 uur per jaar boven de WP-limiet van 3,42 kW, tot 0,06 kW (2 %) erboven.');
    expect(v.liveText).toBe('Past net niet op 1×35 A: 13 uur per jaar boven de limiet.');
    expect(v.mini).toBe('Past net niet · 13 uur · WP 10,6 kW');
    expect(v.fixesLabel).toBe('Wat helpt');
  });

  it('woning met 42 %: past niet (piek net meer dan 3 % boven de limiet)', () => {
    const { a, v } = cases.share42;
    const ex = exceedanceKpis(a);
    expect(ex.pGridMaxKw - a.pLimitKw).toBeGreaterThan(NEARLY_FIT_FRACTION * a.pLimitKw);
    expect(v.status).toBe('notFit');
    expect(v.tone).toBe('err');
    expect(v.icon).toBe('✕');
    expect(v.headline).toBe('Past niet op 1×35 A');
    expect(v.detail).toMatch(
      /^\d+ uur per jaar boven de WP-limiet van 3,38 kW, tot 0,10 kW \(3 %\) erboven\.$/,
    );
    expect(v.mini).toMatch(/^Past niet · \d+ uur · WP 10,6 kW$/);
  });

  it('piek precies op de limiet zonder afschaving: "= limiet" in plaats van een marge van 0', () => {
    const w = examples['woningen-buffer'].v;
    expect(w.status).toBe('fit');
    expect(w.headline).toBe('Past op 3×35 A met 1,00 m³ buffer');
    expect(w.detail).toBe('Piek aan de meter 19,40 kW = limiet.');
    const k = examples['kantoor-buffer'].v;
    expect(k.status).toBe('fit');
    expect(k.detail).toBe('Piek aan de meter 27,7 kW = limiet.');
    // geen enkel voorbeeld meldt een marge van 0
    for (const { v } of Object.values(examples)) expect(v.detail).not.toMatch(/ 0,0+ kW \(0 %\) onder/);
  });

  it('kantoor met tijdconstante 80 h: warmtepomp niet te dimensioneren, zonder knoppen', () => {
    const { v } = cases.officeHeavy;
    expect(v.status).toBe('sizingFailed');
    expect(v.tone).toBe('err');
    expect(v.headline).toBe('Warmtepomp niet te dimensioneren');
    // kantoor zonder tapwater: het comfort (nachtverlaging) is de oorzaak, geen advies over boiler of tapwater
    const [boiler, allowComfortLoss, setback] = MESSAGE_TEXTS.sizingFailed.solutions;
    expect(cases.officeHeavy.input.building.dhw.enabled).toBe(false);
    expect(v.detail).toBe(`Ook met 3 × het piekvermogen wordt het comfort niet gehaald. ${setback}`);
    expect(v.detail).not.toMatch(/boiler|tapwater/i);
    expect(v.why).not.toBeNull();
    expect(v.why!.solutions).toEqual([setback, allowComfortLoss]);
    expect(v.why!.solutions).not.toContain(boiler);
    // de toelichting van de melding, met de terugvalwaarde ingevuld
    expect(v.why!.paragraphs[0]).toBe(MESSAGE_TEXTS.sizingFailed.why[0]);
    expect(v.why!.paragraphs.join(' ')).not.toContain('{');
    expect(v.fixes).toEqual([]);
    expect(v.fixesLabel).toBeNull();
    expect(v.tiles[0].value).toBe('–');
    // de balk onderaan noemt de terugvalwaarde (3 × piekvermogen) niet, net als de tegel
    expect(v.mini).toMatch(/^Niet te dimensioneren · \d+ uur$/);
    expect(v.mini).not.toContain('WP');
    // ook Wat als? geeft dan geen batterijadvies (dat zou met de terugvalwaarde rekenen)
    expect(batteryState(cases.officeHeavy.a).fix).toBeNull();
  });

  it('niet te dimensioneren met buffer en batterij: geen verwijzing naar de terugvalwaarde in de tegel', () => {
    const { a, v } = cases.officeHeavyMeasures;
    expect(v.status).toBe('sizingFailed');
    expect(a.withoutMeasures.nominalKw).toBe(300);
    expect(v.tiles[0].value).toBe('–');
    expect(v.tiles[0].reference).toBeNull();
    for (const t of v.tiles) expect(`${t.value} ${t.line} ${t.reference ?? ''}`).not.toContain('300,0');
    expect(v.fixes).toEqual([]);
    expect(batteryState(a).fix).toBeNull();
  });

  it('te kleine boiler: niet te dimensioneren door het tapwater, met de boiler als eerste oplossing', () => {
    const { v } = cases.tinyBoiler;
    const [boiler, allowComfortLoss] = MESSAGE_TEXTS.sizingFailed.solutions;
    expect(v.status).toBe('sizingFailed');
    expect(v.detail).toBe(`Ook met 3 × het piekvermogen wordt het tapwater niet gehaald. ${boiler}`);
    // een woning zonder nachtverlaging: geen advies over opwarmfactor en verlaagd setpoint
    expect(v.why!.solutions).toEqual([boiler, allowComfortLoss]);
  });

  it('alleen bij niet te dimensioneren een "Waarom?"', () => {
    for (const { v } of Object.values(examples)) expect(v.why).toBeNull();
  });
});

/**
 * "Probeer 1×25 A (met batterij)": alleen de aansluiting; daarna noemt het oordeel de exacte kleinste batterij als
 * knop, binnen het schuifbereik, en die knop haalt 0 uur.
 */
async function expectBatteryRoute(what: string, input: PeakshavingInput, fix: Fix): Promise<void> {
  const next = normalizeInput(fix.apply(input));
  expect(next.buffer, what).toEqual(input.buffer);
  expect(next.battery, what).toEqual(input.battery);
  const after = await analyzeInput(next);
  expect(exceedanceKpis(after).exceedanceHours, what).toBeGreaterThan(0);
  const e = batteryForZero(after);
  expect(e, what).not.toBeNull();
  const chip = buildVerdict(after, null).fixes.find((f) => f.id === 'battery');
  expect(chip?.label, what).toBe(`${fmt(e!, 1)} kWh batterij`);
  expect(await hoursAfter(next, chip!), what).toBe(0);
}

/** Alle knoppen van een geval: die van het oordeel, "Zet" bij de batterij en de stippen; elk houdt zijn belofte. */
async function expectPromisesKept({ input, a, sens, v }: Case): Promise<void> {
  const allowed = input.grid.allowedExceedanceH;
  const promises: { what: string; fix: Fix; maxHours: number }[] = [];
  // bij "binnen toegestaan" moet een knop echt helpen
  const verdictMax = v.status === 'withinAllowed' ? 0 : allowed;
  for (const f of v.fixes) {
    if (f.needsBattery) await expectBatteryRoute(`oordeel: ${f.label}`, input, f);
    else promises.push({ what: `oordeel: ${f.label}`, fix: f, maxHours: verdictMax });
  }
  // "Zet" belooft de kleinste batterij voor 0 uur; "◀ Probeer {kleiner}" belooft niets (probeer en kijk)
  const battery = batteryState(a).fix;
  if (battery && battery.id !== 'trySmaller')
    promises.push({ what: `batterij: ${battery.label}`, fix: battery, maxHours: 0 });
  // de stippen: "{aansluiting} past vanaf {V} m³"
  const dots = input.heatPump.sizingMode === 'auto' && gridMatches(sens, input);
  const g = miniChartGeometry(
    sens.rows,
    a.ranges,
    { volumeM3: input.buffer.volumeM3, grid: input.grid, dots },
    320,
    96,
  );
  for (const d of g.dots) promises.push({ what: `stip: ${d.label}`, fix: d.fix, maxHours: allowed });
  expect(promises.length).toBeGreaterThan(0);
  for (const p of promises) {
    expect(p.fix.pending, p.what).toBe(false);
    expect(await hoursAfter(input, p.fix), p.what).toBeLessThanOrEqual(p.maxHours);
  }
}

describe('oordeel: elke knop doet wat hij belooft', () => {
  for (const sc of SCENARIOS) {
    it(`voorbeeld ${sc.id}: knoppen van het oordeel, "Zet" bij de batterij en de stippen in de mini-grafiek`, async () => {
      await expectPromisesKept(examples[sc.id]);
    }, 60000);
  }

  it('woning 5 kW op 30 %: een bufferpunt naast de schuifstap staat er exact, ook in de tekst', async () => {
    const c = cases.offStep5kW;
    expect(c.a.ranges.bufferMaxM3).toBe(2.5);
    expect(c.a.ranges.bufferStepM3).toBe(0.05);
    expect(c.v.status).toBe('notFit');
    expect(labels(c.v.fixes)).toEqual([
      '0,125 m³ buffer',
      '1,5 kWh batterij',
      '3×25 A',
      'of 38 % voor de warmtepomp',
    ]);
    const buffer = c.v.fixes[0];
    expect(buffer.undoLabel).toBe('Buffer op 0,125 m³');
    // het berekende rasterpunt, niet afgerond op de schuifstap (het verband is niet monotoon, B10)
    expect(normalizeInput(buffer.apply(c.input)).buffer.volumeM3).toBe(0.125);
    // ook de stip noemt de waarde die hij zet
    const g = miniChartGeometry(
      c.sens.rows,
      c.a.ranges,
      { volumeM3: 0, grid: c.input.grid, dots: true },
      320,
      96,
    );
    expect(g.dots[0].ariaLabel).toBe('1×35 A past vanaf 0,125 m³: zet buffer');
    expect(g.dots[0].fix.undoLabel).toBe('Buffer op 0,125 m³');
    await expectPromisesKept(c);
  }, 60000);

  it('nieuwbouw op 1×35 A: alleen buffer naar 1×25 A (zoals stip (b)), geen grovere rasterbatterij', async () => {
    const c = cases.nieuwbouw35;
    expect(c.a.ranges.batteryMaxKwh).toBe(15);
    expect(c.a.ranges.batteryStepKwh).toBe(0.5);
    expect(c.v.fixesLabel).toBe('Kleinere aansluiting volstaat ook');
    // 1×25 A past ook zonder batterij vanaf 0,10 m³: niet "met 4,0 kWh batterij" (op 1×25 A is 1,5 kWh genoeg)
    expect(labels(c.v.fixes)).toEqual(['Probeer 1×25 A met 0,10 m³ buffer']);
    expect(c.v.fixes[0].undoLabel).toBe('1×25 A met 0,10 m³ buffer');
    const next = normalizeInput(c.v.fixes[0].apply(c.input));
    expect(next.battery).toEqual(c.input.battery);
    expect(next.buffer.volumeM3).toBe(0.1);
    expect(next.grid.connection).toBe('1x25');
    const g = miniChartGeometry(
      c.sens.rows,
      c.a.ranges,
      { volumeM3: 0, grid: c.input.grid, dots: true },
      320,
      96,
    );
    const dot = g.dots.find((d) => d.id === 'smaller')!;
    expect(dot.label).toBe('1×25 A · 0,10 m³');
    // zonder rasterbatterij: de stip zet buffer en aansluiting en laat de batterij zoals hij is
    expect(dot.ariaLabel).toBe('1×25 A past vanaf 0,10 m³: zet buffer en aansluiting');
    const withBattery = normalizeInput({ ...c.input, battery: { capacityKwh: 2, powerKw: null } });
    expect(normalizeInput(dot.fix.apply(withBattery)).battery).toEqual({ capacityKwh: 2, powerKw: null });
    // elke waarde die een knop zet, ligt op de schuifstap
    for (const f of c.v.fixes) {
      const kwh = normalizeInput(f.apply(c.input)).battery.capacityKwh;
      expect(
        Math.abs(kwh / c.a.ranges.batteryStepKwh - Math.round(kwh / c.a.ranges.batteryStepKwh)),
      ).toBeLessThan(1e-9);
    }
    await expectPromisesKept(c);
  }, 60000);

  it('nieuwbouw: de limiet remt de boiler af, dus geen knop voor het aandeel (B11)', async () => {
    const { a, input, v } = examples['nieuwbouw'];
    expect(boilerLimitedByBudget(a)).toBe(true);
    expect(v.fixes.map((f) => f.id)).not.toContain('share');
    // de drempel uit de piek (51 %) is hier niet exact: de boiler laadt dan sneller en de piek stijgt mee
    const p = shareForPeak(a);
    const at = await analyzeInput(
      normalizeInput({ ...input, grid: { ...input.grid, heatPumpShare: p / 100 } }),
    );
    expect(exceedanceKpis(at).exceedanceHours).toBeGreaterThan(input.grid.allowedExceedanceH);
    // tapwater aan, maar de limiet remt de boiler nergens af: de drempel is exact
    expect(boilerLimitedByBudget(cases.basis.a)).toBe(false);
    expect(boilerLimitedByBudget(cases.dwellings.a)).toBe(false);
    // zonder tapwater speelt het niet
    expect(boilerLimitedByBudget(cases.office.a)).toBe(false);
  }, 60000);

  for (const [name, key] of [
    ['woning 42,5 % (past net niet)', 'share425'],
    ['woning 42 %', 'share42'],
    ['woning 43 % / 5 uur', 'share43'],
  ] as const) {
    it(`${name}: na elke knop opnieuw doorgerekend hoogstens het toegestane aantal uren`, async () => {
      const { v, input } = cases[key];
      const allowed = input.grid.allowedExceedanceH;
      expect(v.fixes.length).toBeGreaterThan(0);
      for (const fix of v.fixes) {
        expect(fix.pending).toBe(false);
        const h = await hoursAfter(input, fix);
        expect(h, fix.label).toBeLessThanOrEqual(allowed);
        // bij "binnen toegestaan" moet de knop echt helpen
        if (v.status === 'withinAllowed') expect(h, fix.label).toBe(0);
      }
    }, 60000);
  }

  it('de knoppen geven een melding voor ongedaan maken en een hendel voor de focus', () => {
    const { v } = cases.basis;
    expect(v.fixes.map((f) => [f.undoLabel, f.target])).toEqual([
      ['Buffer op 0,20 m³', 'buffer'],
      ['Batterij op 1,0 kWh', 'battery'],
      ['Aansluiting 1×40 A', 'connectionStepper'],
      // het aandeel staat in de Basis; de focus gaat naar de stapper in Wat als? (die noemt limiet en aandeel)
      ['Aandeel voor warmtepomp 44 %', 'connectionStepper'],
    ]);
  });
});

describe('oordeel: raster en modus', () => {
  it('zolang het raster niet bij de invoer hoort, staat de bufferknop als plaatshouder vooraan', () => {
    const { a, sens } = cases.basis;
    for (const s of [null, { ...sens, key: 'ander' }, { ...sens, done: false }]) {
      const v = buildVerdict(a, s);
      expect(v.fixes[0]).toMatchObject({ id: 'buffer', pending: true });
      expect(v.fixes.slice(1).every((f) => !f.pending)).toBe(true);
      // de plaatshouder verandert niets
      expect(v.fixes[0].apply(a.input)).toBe(a.input);
    }
    // bij een rasterfout geen bufferknop (en geen plaatshouder)
    const failed = buildVerdict(a, { ...sens, error: 'kapot' });
    expect(failed.fixes.map((f) => f.id)).toEqual(['battery', 'connection', 'share']);
  });

  it('kleinere aansluiting uit het raster: plaatshouder tijdens het rekenen, niets bij handmatig WP-vermogen', async () => {
    const { a, sens } = cases.buffer;
    expect(buildVerdict(a, null).fixes).toMatchObject([{ id: 'smaller', pending: true }]);
    const manual = await analyzeInput(
      normalizeInput({ ...a.input, heatPump: { ...a.input.heatPump, sizingMode: 'manual', nominalKw: 9.5 } }),
    );
    expect(buildVerdict(manual, sens).fixes).toEqual([]);
  });

  it('kop en tegels hangen niet af van de bedrijfsmodus', async () => {
    for (const key of ['basis', 'buffer', 'both25', 'office', 'share43'] as const) {
      const { input, sens, v } = cases[key];
      const limited = await analyzeInput(
        normalizeInput({ ...input, grid: { ...input.grid, mode: 'limited' } }),
      );
      const w = buildVerdict(limited, sens);
      expect(w.status, key).toBe(v.status);
      expect(w.headline, key).toBe(v.headline);
      expect(w.tiles, key).toEqual(v.tiles);
      expect(w.limiterLine, key).toEqual(v.limiterLine);
      expect(w.stressLine, key).toBe(v.stressLine);
      expect(labels(w.fixes), key).toEqual(labels(v.fixes));
    }
  }, 60000);

  it('met begrenzer en een batterij die afschaaft: de detailzin noemt de afschaving zonder bedrag', async () => {
    const { input, sens } = cases.both25;
    const limited = await analyzeInput(
      normalizeInput({ ...input, grid: { ...input.grid, mode: 'limited' } }),
    );
    const v = buildVerdict(limited, sens);
    expect(v.detail).toBe('Piek aan de meter 2,30 kW = limiet; de batterij schaaft de piek af.');
    // geen arcering: de piek zonder batterij volgt dan de modus
    expect(v.meter.shaved).toBeNull();
  });

  it('T1 zelf gekozen: de stresstestregel zegt dat, en bij automatisch WP-vermogen dat de WP op T1 is gedimensioneerd', async () => {
    const a = await analyzeInput(normalizeInput({ ...scenario('kantoor-buffer'), climateYear: 'T1' }));
    expect(buildVerdict(a, null).stressLine).toBe(
      'Dit is al de stresstest (T1); de warmtepomp is op dit jaar gedimensioneerd.',
    );
    const manual = await analyzeInput(
      normalizeInput({ ...a.input, heatPump: { ...a.input.heatPump, sizingMode: 'manual', nominalKw: 150 } }),
    );
    expect(buildVerdict(manual, null).stressLine).toBe('Dit is al de stresstest (T1).');
  });
});
