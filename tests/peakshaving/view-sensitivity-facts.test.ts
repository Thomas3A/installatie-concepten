// Feiten uit het gevoeligheidsraster (UX-plan §4.5, §5.1): overgangen "toereikend vanaf" voor het woningraster,
// de poort gridMatches, het eerste passende rasterpunt, het knikpunt en de eerstvolgende kleinere aansluiting.
import { beforeAll, describe, expect, it } from 'vitest';
import { CONNECTIONS, findConnection } from '../../src/concepts/peakshaving/data/connections';
import { sensitivityKey } from '../../src/concepts/peakshaving/model/analysis';
import { createEngine } from '../../src/concepts/peakshaving/model/engine';
import { normalizeInput, rangesOf } from '../../src/concepts/peakshaving/model/input';
import type { SensitivityRow } from '../../src/concepts/peakshaving/model/sizing';
import type { PeakshavingInput } from '../../src/concepts/peakshaving/model/types';
import { findScenario } from '../../src/concepts/peakshaving/scenarios';
import {
  batteriesText,
  compact,
  connectionIndex,
  firstFitVolume,
  fitsConnection,
  gridMatches,
  gridModel,
  gridStatus,
  plateauStart,
  smallerOption,
  smallerRoute,
  smallerTransition,
  transitionsOf,
  type SensitivityState,
} from '../../src/concepts/peakshaving/view/sensitivityFacts';

const conn = (id: string) => findConnection(id as never)!;

let input: PeakshavingInput;
let sens: SensitivityState;

beforeAll(async () => {
  // geverifieerde uitkomsten van het UX-plan (§4.5): in ontwerpjaar T5 doorgerekend
  input = normalizeInput({ ...findScenario('woning-basis')!.build(), climateYear: 'T5' });
  const rows: SensitivityRow[] = [];
  const key = sensitivityKey(input);
  await createEngine().handle({ type: 'sensitivity', id: 1, key, input }, (m) => {
    if (m.type === 'sensitivity-row') rows[m.index] = m.row;
  });
  sens = { key, rows, total: rows.length, done: true };
}, 60000);

/** Synthetische rij: P_th,min en per batterij de uren en de kleinste aansluiting. */
function row(volumeM3: number, nominalKw: number, cells: [number, string][]): SensitivityRow {
  return {
    volumeM3,
    nominalKw,
    cells: cells.map(([exceedanceHours, id], j) => {
      const c = findConnection(id as never);
      return {
        capacityKwh: j * 5,
        pGridMaxKw: 3,
        exceedanceHours,
        smallest: c
          ? { id: c.id, label: c.label, powerKw: c.powerKw, exceedanceHours: 0 }
          : { id: 'grootverbruik', label: 'Grootverbruik', powerKw: 95, exceedanceHours: NaN },
      };
    }),
  };
}

describe('gevoeligheidsraster van de woning (8 kW, 1×35 A, 40 %)', () => {
  it('overgangen: 1×35 A vanaf 0,20 m³ zonder batterij; 1×25 A vanaf 0,60 m³ met 7,5 kWh', () => {
    const m = gridModel(sens, rangesOf(input));
    expect(m.n).toBe(13);
    expect(m.computed).toBe(13);
    expect(m.caps).toEqual([0, 7.5, 15, 30]);
    const ts = transitionsOf(m, input.grid.heatPumpShare);
    const simple = ts.map((t) => ({ conn: t.conn.label, v: t.volumeM3, batteries: t.batteries }));
    expect(simple).toContainEqual({ conn: '1×35 A', v: 0.2, batteries: [0] });
    expect(simple.find((t) => t.conn === '1×25 A')).toMatchObject({
      v: expect.closeTo(0.6, 9),
      batteries: [1],
    });
    expect(ts.map((t) => t.text)).toEqual(
      expect.arrayContaining([
        '1×35 A vanaf 0,20 m³ (zonder batterij)',
        '1×25 A vanaf 0,60 m³ (batterij 7,5 kWh)',
      ]),
    );
    // zonder batterij past 1×25 A nergens; met 15 kWh al bij V = 0 (geen overgang)
    expect(ts.some((t) => t.conn.label === '1×25 A' && t.batteries.includes(0))).toBe(false);
    expect(ts.some((t) => t.batteries.includes(2))).toBe(false);
  });

  it('eerste passende rasterpunt zonder batterij en het knikpunt', () => {
    expect(firstFitVolume(sens.rows, 0)).toEqual({ index: 1, volumeM3: 0.2 });
    const knee = plateauStart(sens.rows)!;
    expect(knee.volumeM3).toBeCloseTo(0.8, 9);
    expect(knee.index).toBe(4);
    expect(knee.minKw).toBeCloseTo(8.717, 2);
  });

  it('route naar een kleinere aansluiting: dezelfde als stip (b), nooit meer batterij dan nodig', () => {
    const m = gridModel(sens, rangesOf(input));
    const share = input.grid.heatPumpShare;
    // vanaf 1×40 A naar 1×35 A: alleen buffer, 0,20 m³ (zoals stip (b) "1×35 A · 0,20 m³"), niet 7,5 kWh bij V = 0
    expect(smallerRoute(m, conn('1x35'), share, 0)).toEqual({ kind: 'buffer', volumeM3: 0.2 });
    expect(smallerTransition(transitionsOf(m, share), conn('1x35'))).toMatchObject({
      volumeM3: 0.2,
      batteries: [0],
    });
    // vanaf 1×35 A naar 1×25 A: past zonder batterij nergens; met batterij al bij of onder de huidige buffer, dus
    // alleen de aansluiting (het oordeel noemt daarna de exacte batterij) in plaats van 15 kWh of meer buffer
    for (const v of [0, 0.2, 0.3, 1.05])
      expect(smallerRoute(m, conn('1x25'), share, v), `V = ${v}`).toEqual({ kind: 'battery' });
    expect(fitsConnection(sens.rows[3]!, 1, conn('1x25'))).toBe(true);
    expect(fitsConnection(sens.rows[3]!, 0, conn('1x25'))).toBe(false);
    // stip (b) voor 1×25 A: 7,5 kWh vanaf 0,60 m³
    expect(smallerTransition(transitionsOf(m, share), conn('1x25'))).toMatchObject({ batteries: [1] });
  });
});

describe('gridMatches en gridStatus', () => {
  it('alleen een klaar raster zonder fout voor dezelfde sleutel past', () => {
    expect(gridMatches(sens, input)).toBe(true);
    expect(gridStatus(sens, input)).toBe('ready');
    expect(gridMatches(null, input)).toBe(false);
    expect(gridStatus(null, input)).toBe('pending');
    expect(gridStatus({ ...sens, done: false }, input)).toBe('pending');
    expect(gridStatus({ ...sens, key: 'ander' }, input)).toBe('pending');
    expect(gridStatus({ ...sens, error: 'kapot' }, input)).toBe('failed');
    expect(gridMatches({ ...sens, error: 'kapot' }, input)).toBe(false);
  });

  it('buffer, batterij en WP-vermogen veranderen de sleutel niet; aansluiting en aandeel wel', () => {
    const withMeasures = normalizeInput({
      ...input,
      buffer: { ...input.buffer, volumeM3: 1.5 },
      battery: { capacityKwh: 10, powerKw: null },
      heatPump: { ...input.heatPump, sizingMode: 'manual', nominalKw: 9 },
    });
    expect(gridMatches(sens, withMeasures)).toBe(true);
    expect(gridMatches(sens, normalizeInput({ ...input, grid: { ...input.grid, connection: '1x25' } }))).toBe(
      false,
    );
    expect(gridMatches(sens, normalizeInput({ ...input, grid: { ...input.grid, heatPumpShare: 0.5 } }))).toBe(
      false,
    );
  });
});

describe('rasterhulpjes met een synthetisch raster', () => {
  it('niet monotoon: het eerste exacte rasterpunt telt, ook als een later punt weer slechter is', () => {
    const rows = [
      row(0, 10, [[101, '1x40']]),
      row(0.2, 9.5, [[0, '1x35']]),
      row(0.25, 9.4, [[1, '1x40']]),
      row(0.3, 9.3, [[0, '1x35']]),
    ];
    expect(firstFitVolume(rows, 0)).toEqual({ index: 1, volumeM3: 0.2 });
    expect(firstFitVolume(rows, 200)).toEqual({ index: 1, volumeM3: 0.2 });
    // onvolledig raster: geen antwoord
    expect(firstFitVolume([rows[0], null, rows[2]], 0)).toBeNull();
    expect(firstFitVolume([rows[0], rows[2]], 0)).toBeNull();
  });

  it('knikpunt: eerste punt binnen 2 % van het minimum; NaN en ontbrekende rijen tellen niet', () => {
    const rows = [
      row(0, 10, [[0, '1x35']]),
      row(1, NaN, [[0, '1x35']]),
      null,
      row(3, 8.1, [[0, '1x35']]),
      row(4, 8.0, [[0, '1x35']]),
    ];
    expect(plateauStart(rows)).toEqual({ index: 3, volumeM3: 3, minKw: 8 });
    expect(plateauStart([null, null])).toBeNull();
    // knik op het laatste berekende punt: de lijn daalt tot het einde, dus geen plateau
    expect(
      plateauStart([row(0, 10, [[0, '1x35']]), row(1, 9, [[0, '1x35']]), row(2, 8, [[0, '1x35']])]),
    ).toBeNull();
    expect(plateauStart([row(0, 10, [[0, '1x35']]), row(1, 8, [[0, '1x35']]), null])).toBeNull();
    expect(plateauStart([row(0, 8, [[0, '1x35']])])).toBeNull();
  });

  it('kleinere optie: één stap terug in de lijst, vanaf grootverbruik 3×80 A', () => {
    expect(smallerOption({ connection: '1x35', contractedKw: 100 })?.id).toBe('1x25');
    expect(smallerOption({ connection: '3x25', contractedKw: 100 })?.id).toBe('1x40');
    expect(smallerOption({ connection: '1x25', contractedKw: 100 })).toBeNull();
    expect(smallerOption({ connection: 'grootverbruik', contractedKw: 100 })?.id).toBe('3x80');
    expect(connectionIndex('grootverbruik')).toBe(CONNECTIONS.length);
    expect(connectionIndex('1x25')).toBe(0);
  });

  it('route uit een synthetisch raster: buffer tot en met de huidige, anders stip (b)', () => {
    const sync = (rows: SensitivityRow[]) =>
      gridModel({ key: 'k', rows, total: rows.length, done: true }, { bufferMaxM3: 0.6, batteryMaxKwh: 10 });
    const c = conn('1x25');
    // past zonder batterij bij 0,2 en vanaf 0,6 m³ (niet monotoon): bij 0,4 m³ terug naar 0,2, niet omhoog naar 0,6
    const notMonotone = [
      row(0, 10, [
        [9, '1x35'],
        [0, '1x35'],
      ]),
      row(0.2, 9, [
        [0, '1x25'],
        [0, '1x25'],
      ]),
      row(0.4, 8.5, [
        [3, '1x35'],
        [0, '1x25'],
      ]),
      row(0.6, 8.4, [
        [0, '1x25'],
        [0, '1x25'],
      ]),
    ];
    expect(smallerRoute(sync(notMonotone), c, 0.4, 0.4)).toEqual({ kind: 'buffer', volumeM3: 0.2 });
    expect(smallerRoute(sync(notMonotone), c, 0.4, 0.5)).toEqual({ kind: 'buffer', volumeM3: 0.2 });
    // vanaf V = 0: het punt van stip (b) (begin van de passende reeks aan het eind)
    expect(smallerRoute(sync(notMonotone), c, 0.4, 0)).toEqual({ kind: 'buffer', volumeM3: 0.6 });
    // met batterij alleen boven de huidige buffer: buffer en rasterbatterij van stip (b)
    const above = [
      row(0, 10, [
        [9, '1x35'],
        [9, '1x35'],
        [9, '1x35'],
      ]),
      row(0.2, 9, [
        [9, '1x35'],
        [9, '1x35'],
        [0, '1x25'],
      ]),
      row(0.4, 8.5, [
        [9, '1x35'],
        [0, '1x25'],
        [0, '1x25'],
      ]),
      row(0.6, 8.4, [
        [9, '1x35'],
        [0, '1x25'],
        [0, '1x25'],
      ]),
    ];
    expect(smallerRoute(sync(above), c, 0.4, 0)).toEqual({
      kind: 'bufferBattery',
      volumeM3: 0.4,
      capacityKwh: 5,
    });
    // met batterij bij of onder de huidige buffer: alleen de aansluiting
    expect(smallerRoute(sync(above), c, 0.4, 0.2)).toEqual({ kind: 'battery' });
    // nergens passend, of een onvolledig raster: geen route
    expect(smallerRoute(sync([row(0, 10, [[9, '1x35']]), row(0.2, 9, [[9, '1x35']])]), c, 0.4, 0)).toBeNull();
    expect(
      smallerRoute(
        gridModel(
          { key: 'k', rows: [above[0], null], total: 2, done: false },
          { bufferMaxM3: 0.6, batteryMaxKwh: 10 },
        ),
        c,
        0.4,
        0,
      ),
    ).toBeNull();
  });

  it('grootverbruik telt nooit als passend', () => {
    const r = row(0, 10, [[0, 'grootverbruik']]);
    expect(fitsConnection(r, 0, conn('3x80'))).toBe(false);
  });

  it('notatie van de overgangen', () => {
    expect(compact(0)).toBe('0');
    expect(compact(0.2)).toBe('0,2');
    expect(compact(0.25)).toBe('0,25');
    expect(compact(7.5)).toBe('7,5');
    expect(batteriesText([0], [0, 7.5])).toBe('zonder batterij');
    expect(batteriesText([0, 2, 3], [0, 7.5, 15, 30])).toBe('zonder batterij en batterij 15 / 30 kWh');
  });
});
