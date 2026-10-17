// Mini-grafiek boven de bufferschuif (UX-plan §5.1): zelfde x-schaal als de schuif en de markeringen, knik op
// 0,80 m³ bij de woning, onderbroken lijn bij ontbrekende punten en de twee stippen met hun knoppen.
import { beforeAll, describe, expect, it } from 'vitest';
import { sensitivityKey } from '../../src/concepts/peakshaving/model/analysis';
import { createEngine } from '../../src/concepts/peakshaving/model/engine';
import { normalizeInput, rangesOf } from '../../src/concepts/peakshaving/model/input';
import { exceedanceKpis } from '../../src/concepts/peakshaving/model/kpis';
import type { SensitivityRow } from '../../src/concepts/peakshaving/model/sizing';
import type { PeakshavingInput } from '../../src/concepts/peakshaving/model/types';
import { findScenario } from '../../src/concepts/peakshaving/scenarios';
import {
  DOT_HIT_PX,
  MINI_CHART_PAD,
  miniChartGeometry,
  nearestRowVolume,
  sliderX,
  volumeAtX,
} from '../../src/concepts/peakshaving/view/miniChart';

const engine = createEngine();
let input: PeakshavingInput;
let rows: SensitivityRow[];

beforeAll(async () => {
  input = normalizeInput(findScenario('woning-basis')!.build());
  rows = [];
  const key = sensitivityKey(input);
  await engine.handle({ type: 'sensitivity', id: 1, key, input }, (m) => {
    if (m.type === 'sensitivity-row') rows[m.index] = m.row;
  });
}, 60000);

/** De formule van de markeringen onder de schuif (controls.tsx): calc(8px + (100% - 16px) * ratio). */
const markerX = (v: number, max: number, w: number): number => 8 + (w - 16) * (v / max);

describe('x-schaal', () => {
  it('sliderX is gelijk aan de markeringsformule van de schuif', () => {
    for (const w of [200, 333, 640])
      for (const v of [0, 0.05, 0.2, 0.6646, 1.33, 2.6585, 4])
        expect(sliderX(v, 4, w)).toBeCloseTo(markerX(v, 4, w), 9);
    // begrensd op de schuif
    expect(sliderX(-1, 4, 200)).toBe(8);
    expect(sliderX(9, 4, 200)).toBe(192);
    expect(sliderX(1, 0, 200)).toBe(8);
  });

  it('volumeAtX is de omgekeerde van sliderX; een klik kiest het dichtstbijzijnde rasterpunt', () => {
    for (const v of [0, 0.3, 2.5, 4]) expect(volumeAtX(sliderX(v, 4, 300), 4, 300)).toBeCloseTo(v, 9);
    expect(volumeAtX(0, 4, 300)).toBe(0);
    expect(volumeAtX(1000, 4, 300)).toBe(4);
    expect(nearestRowVolume(rows, 0.33)).toBe(0.4);
    expect(nearestRowVolume(rows, 0.65)).toBe(0.6);
    expect(nearestRowVolume([null], 1)).toBeNull();
  });
});

describe('geometrie bij de woning', () => {
  const W = 320;
  const H = 96;

  it('knik op 0,80 m³ met het plateau en de naam van de grafiek', () => {
    const g = miniChartGeometry(rows, rangesOf(input), { volumeM3: 0, grid: input.grid, dots: false }, W, H);
    expect(g.plateau).not.toBeNull();
    expect(g.plateau!.kneeM3).toBeCloseTo(0.8, 9);
    expect(g.plateau!.x).toBeCloseTo(markerX(0.8, 4, W), 9);
    expect(g.plateau!.label).toBe('8,7 kW vanaf 0,80 m³: meer helpt niet');
    expect(g.ariaLabel).toBe(
      'Benodigde warmtepomp per buffervolume: 10,6 kW zonder buffer, 8,7 kW vanaf 0,80 m³',
    );
    expect(g.firstKw).toBeCloseTo(10.562, 2);
    expect(g.points).toHaveLength(13);
    // hoogste punt boven, laagste onder
    const ys = g.points.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(MINI_CHART_PAD.top, 9);
    expect(Math.max(...ys)).toBeCloseTo(H - MINI_CHART_PAD.bottom, 9);
    expect(g.path.startsWith('M8 ')).toBe(true);
    expect(g.path.match(/M/g)).toHaveLength(1);
    expect(g.dots).toEqual([]);
  });

  it('de verticale lijn volgt de invoer', () => {
    const g = miniChartGeometry(
      rows,
      rangesOf(input),
      { volumeM3: 1.25, grid: input.grid, dots: false },
      W,
      H,
    );
    expect(g.currentX).toBeCloseTo(markerX(1.25, 4, W), 9);
  });

  it('een ontbrekend of niet te bepalen punt onderbreekt de lijn', () => {
    const broken: (SensitivityRow | null)[] = [...rows];
    broken[3] = null;
    broken[7] = { ...rows[7], nominalKw: NaN };
    const g = miniChartGeometry(
      broken,
      rangesOf(input),
      { volumeM3: 0, grid: input.grid, dots: false },
      W,
      H,
    );
    expect(g.path.match(/M/g)).toHaveLength(3);
    expect(g.points).toHaveLength(11);
  });

  it('twee stippen: 1×35 A vanaf 0,20 m³ en 1×25 A + 7,5 kWh vanaf 0,60 m³; de knoppen houden hun belofte', async () => {
    const g = miniChartGeometry(rows, rangesOf(input), { volumeM3: 0, grid: input.grid, dots: true }, W, H);
    expect(g.dots.map((d) => [d.id, d.label, d.ariaLabel])).toEqual([
      ['current', '1×35 A', '1×35 A past vanaf 0,20 m³: zet buffer'],
      [
        'smaller',
        '1×25 A + 7,5 kWh',
        '1×25 A + 7,5 kWh past vanaf 0,60 m³: zet buffer, batterij en aansluiting',
      ],
    ]);
    expect(g.dots[0].x).toBeCloseTo(markerX(0.2, 4, W), 9);
    expect(g.dots[1].x).toBeCloseTo(markerX(0.6, 4, W), 9);
    // op de lijn (ver genoeg uit elkaar: niet verschoven)
    expect(g.dots[0].y).toBeCloseTo(g.points[1].y, 9);
    expect(g.dots[1].y).toBeCloseTo(g.points[3].y, 9);
    expect(g.dots.map((d) => d.anchorY)).toEqual([null, null]);

    const a = normalizeInput(g.dots[0].fix.apply(input));
    expect(a.buffer.volumeM3).toBe(0.2);
    expect(a.grid.connection).toBe('1x35');
    const b = normalizeInput(g.dots[1].fix.apply(input));
    expect(b.buffer.volumeM3).toBe(0.6);
    expect(b.battery).toEqual({ capacityKwh: 7.5, powerKw: null });
    expect(b.grid.connection).toBe('1x25');
    expect(g.dots[1].fix.undoLabel).toBe('1×25 A met 0,60 m³ buffer en 7,5 kWh batterij');
    for (const next of [a, b]) {
      let hours = NaN;
      await engine.handle({ type: 'analyze', id: 2, input: next }, (m) => {
        if (m.type === 'analysis') hours = exceedanceKpis(m.analysis).exceedanceHours;
      });
      expect(hours).toBe(0);
    }
  }, 60000);

  it('stip (b) met een rasterbatterij naast de schuifstap: naar boven op de stap (3,75 → 4,0 kWh)', () => {
    // raster met E_max = 15 kWh (stap 0,5): batterijen 0 / 3,75 / 7,5 / 15 kWh. 1×35 A past zonder batterij vanaf
    // 0,10 m³; 1×25 A pas vanaf 0,20 m³ en alleen met een batterij.
    const CONN = {
      '1x25': { label: '1×25 A', powerKw: 5.75 },
      '1x35': { label: '1×35 A', powerKw: 8.05 },
      '1x40': { label: '1×40 A', powerKw: 9.2 },
    } as const;
    /** rij met per batterij de kleinste passende aansluiting */
    const row = (volumeM3: number, nominalKw: number, ids: (keyof typeof CONN)[]): SensitivityRow => ({
      volumeM3,
      nominalKw,
      cells: ids.map((id, j) => ({
        capacityKwh: [0, 3.75, 7.5, 15][j],
        pGridMaxKw: 3,
        exceedanceHours: 0,
        smallest: { id, ...CONN[id], exceedanceHours: 0 },
      })),
    });
    const grid: SensitivityRow[] = [
      row(0, 6, ['1x40', '1x40', '1x40', '1x40']),
      row(0.1, 5, ['1x35', '1x35', '1x35', '1x35']),
      row(0.2, 4.5, ['1x35', '1x25', '1x25', '1x25']),
    ];
    const ranges = { bufferMaxM3: 2, batteryMaxKwh: 15, batteryStepKwh: 0.5 };
    const g = miniChartGeometry(grid, ranges, { volumeM3: 0, grid: input.grid, dots: true }, W, H);
    expect(g.dots.map((d) => [d.id, d.label, d.ariaLabel])).toEqual([
      ['current', '1×35 A', '1×35 A past vanaf 0,10 m³: zet buffer'],
      [
        'smaller',
        '1×25 A + 4,0 kWh',
        '1×25 A + 4,0 kWh past vanaf 0,20 m³: zet buffer, batterij en aansluiting',
      ],
    ]);
    const b = normalizeInput(g.dots[1].fix.apply(input));
    expect(b.battery).toEqual({ capacityKwh: 4, powerKw: null });
    expect(b.buffer.volumeM3).toBe(0.2);
    expect(g.dots[1].fix.undoLabel).toBe('1×25 A met 0,20 m³ buffer en 4,0 kWh batterij');
  });

  describe('samenvallende stippen (beide "vanaf 0,20 m³")', () => {
    const CONN = {
      '1x25': { label: '1×25 A', powerKw: 5.75 },
      '1x35': { label: '1×35 A', powerKw: 8.05 },
      '1x40': { label: '1×40 A', powerKw: 9.2 },
    } as const;
    const row = (volumeM3: number, nominalKw: number, ids: (keyof typeof CONN)[]): SensitivityRow => ({
      volumeM3,
      nominalKw,
      cells: ids.map((id, j) => ({
        capacityKwh: [0, 3.75, 7.5, 15][j],
        pGridMaxKw: 3,
        exceedanceHours: 0,
        smallest: { id, ...CONN[id], exceedanceHours: 0 },
      })),
    });
    const ranges = { bufferMaxM3: 2, batteryMaxKwh: 15, batteryStepKwh: 0.5 };
    const geometry = (rows: SensitivityRow[]) =>
      miniChartGeometry(rows, ranges, { volumeM3: 0, grid: input.grid, dots: true }, W, H);

    it('stip (a) blijft op de lijn; stip (b) een raakvlak lager, met een anker op de lijn', () => {
      // de hoogste P_th,min ligt op 0,20 m³ (bovenaan): (b) schuift omlaag
      const g = geometry([
        row(0, 6, ['1x40', '1x40', '1x40', '1x40']),
        row(0.2, 7, ['1x35', '1x35', '1x25', '1x25']),
        row(0.4, 5, ['1x35', '1x35', '1x25', '1x25']),
      ]);
      expect(g.dots.map((d) => [d.id, d.label, d.volumeM3])).toEqual([
        ['current', '1×35 A', 0.2],
        ['smaller', '1×25 A + 7,5 kWh', 0.2],
      ]);
      const [a, b] = g.dots;
      expect(b.x).toBe(a.x);
      expect(a.y).toBeCloseTo(MINI_CHART_PAD.top, 9);
      expect(a.anchorY).toBeNull();
      expect(b.anchorY).toBeCloseTo(a.y, 9);
      expect(b.y).toBeCloseTo(a.y + DOT_HIT_PX, 9);
    });

    it('onderaan (op het plateau) schuift stip (b) omhoog; de knoppen houden elk hun eigen actie', () => {
      const g = geometry([
        row(0, 6, ['1x40', '1x40', '1x40', '1x40']),
        row(0.2, 4.5, ['1x35', '1x35', '1x25', '1x25']),
        row(0.4, 4.6, ['1x35', '1x35', '1x25', '1x25']),
      ]);
      const [a, b] = g.dots;
      expect(a.y).toBeCloseTo(H - MINI_CHART_PAD.bottom, 9);
      expect(b.anchorY).toBeCloseTo(a.y, 9);
      expect(b.y).toBeCloseTo(a.y - DOT_HIT_PX, 9);
      expect(normalizeInput(a.fix.apply(input))).toMatchObject({
        buffer: { volumeM3: 0.2 },
        battery: { capacityKwh: 0 },
        grid: { connection: '1x35' },
      });
      expect(normalizeInput(b.fix.apply(input))).toMatchObject({
        buffer: { volumeM3: 0.2 },
        battery: { capacityKwh: 7.5, powerKw: null },
        grid: { connection: '1x25' },
      });
    });

    it('dicht bij elkaar maar niet op hetzelfde punt: ook uit elkaar; ver genoeg uit elkaar: niet', () => {
      // 0,20 en 0,25 m³ bij V_max = 2 m³ liggen 7,6 px uit elkaar (W = 320), op dezelfde hoogte
      const near = geometry([
        row(0, 6, ['1x40', '1x40', '1x40', '1x40']),
        row(0.2, 5, ['1x35', '1x40', '1x40', '1x40']),
        row(0.25, 5, ['1x35', '1x35', '1x25', '1x25']),
      ]);
      expect(near.dots[1].x - near.dots[0].x).toBeLessThan(DOT_HIT_PX);
      expect(near.dots[1].anchorY).not.toBeNull();
      expect(Math.abs(near.dots[1].y - near.dots[0].y)).toBeCloseTo(DOT_HIT_PX, 9);
      const far = geometry([
        row(0, 6, ['1x40', '1x40', '1x40', '1x40']),
        row(0.2, 5, ['1x35', '1x40', '1x40', '1x40']),
        row(0.4, 5, ['1x35', '1x35', '1x25', '1x25']),
      ]);
      expect(far.dots[1].x - far.dots[0].x).toBeGreaterThanOrEqual(DOT_HIT_PX);
      expect(far.dots.map((d) => d.anchorY)).toEqual([null, null]);
    });
  });

  it('lijn daalt tot het einde van het bereik: geen plateau, wel het laagste punt "(einde bereik)"', () => {
    // knik = laatste rasterpunt (V_max): "meer helpt niet" is binnen het bereik niet aangetoond
    const falling = rows.map((r, i) => ({ ...r, nominalKw: 12 - 0.3 * i }));
    expect(falling[falling.length - 1].volumeM3).toBe(4);
    const g = miniChartGeometry(
      falling,
      rangesOf(input),
      { volumeM3: 0, grid: input.grid, dots: false },
      W,
      H,
    );
    expect(g.plateau).toBeNull();
    expect(g.endLabel).toBe('8,4 kW bij 4,00 m³ (einde bereik)');
    expect(g.ariaLabel).toBe(
      'Benodigde warmtepomp per buffervolume: 12,0 kW zonder buffer, 8,4 kW bij 4,00 m³',
    );
    // een raster dat nog rekent (laatste punt ontbreekt): geen plateau en ook geen "einde bereik"
    const partial: (SensitivityRow | null)[] = [...falling];
    partial[partial.length - 1] = null;
    const p = miniChartGeometry(
      partial,
      rangesOf(input),
      { volumeM3: 0, grid: input.grid, dots: false },
      W,
      H,
    );
    expect(p.plateau).toBeNull();
    expect(p.endLabel).toBeNull();
    expect(p.ariaLabel).toBe('Benodigde warmtepomp per buffervolume');
    // bij de woning (wel een plateau) geen "einde bereik"
    const woning = miniChartGeometry(
      rows,
      rangesOf(input),
      { volumeM3: 0, grid: input.grid, dots: false },
      W,
      H,
    );
    expect(woning.endLabel).toBeNull();
  });

  it('bij geen enkel buffervolume te dimensioneren: geen punten, geen plateau en geen stippen', () => {
    const unsizable = rows.map((r) => ({ ...r, nominalKw: NaN }));
    const g = miniChartGeometry(
      unsizable,
      rangesOf(input),
      { volumeM3: 0.5, grid: input.grid, dots: true },
      W,
      H,
    );
    expect(g.points).toEqual([]);
    expect(g.path).toBe('');
    expect(g.plateau).toBeNull();
    expect(g.endLabel).toBeNull();
    expect(g.firstKw).toBeNull();
  });

  it('zonder berekende punten: geen lijn, geen plateau, een neutrale naam', () => {
    const g = miniChartGeometry(
      [null, null],
      rangesOf(input),
      { volumeM3: 0.5, grid: input.grid, dots: true },
      W,
      H,
    );
    expect(g.path).toBe('');
    expect(g.plateau).toBeNull();
    expect(g.dots).toEqual([]);
    expect(g.ariaLabel).toBe('Benodigde warmtepomp per buffervolume');
  });
});
