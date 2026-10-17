// Pure hulpfuncties van het conceptschema: schaal van de meterkastbalk, segmenten, stromen en kleuren.
import { describe, expect, it } from 'vitest';
import {
  conceptLayout,
  fanPeriod,
  flowPaths,
  flowPowers,
  flowSpeed,
  FLOW_SPEED_MAX,
  meterScale,
  meterSegments,
  pointAlong,
  supplyColorFraction,
  thermocline,
  type HourState,
} from '../../src/concepts/peakshaving/ui/concept/conceptGeometry';

describe('meterScale', () => {
  it('gestapeld: overig gebruik links, daarna de WP-groep; limietlijn = einde van de aansluiting', () => {
    const s = meterScale(8.05, 3.22, 3.0, 100, 850);
    expect(s.compressed).toBe(false);
    expect(s.otherKw).toBeCloseTo(4.83, 9);
    expect(s.x(0)).toBe(100);
    // de WP-groep past binnen de limiet: de aansluiting vult de hele balk
    expect(s.connX).toBeCloseTo(850, 6);
    expect(s.wp(0)).toBeCloseTo(100 + (750 * 4.83) / 8.05, 6);
    expect(s.wp(3.22)).toBeCloseTo(s.connX, 6);
  });

  it('ruimte voor overschrijding voorbij de aansluiting', () => {
    const s = meterScale(8.05, 3.22, 3.48, 0, 1000);
    expect(s.connX).toBeLessThan(1000);
    expect(s.wp(3.48)).toBeLessThanOrEqual(1000);
    expect(s.wp(3.48)).toBeGreaterThan(s.connX);
  });

  it('kort het overige gebruik in bij een zeer grote aansluiting', () => {
    const s = meterScale(60, 6, 3.15, 0, 1000);
    expect(s.compressed).toBe(true);
    expect(s.wp(0)).toBeCloseTo(250, 6);
    expect(s.connX).toBeCloseTo(1000, 6);
    expect(s.breakX).toBeLessThan(s.wp(0));
    // de WP-groep blijft lineair
    expect(s.wp(3) - s.wp(0)).toBeCloseTo((s.wp(6) - s.wp(0)) / 2, 6);
  });

  it('zonder WP-limiet: geen overig gebruik, WP-groep vanaf het begin', () => {
    const s = meterScale(8.05, Infinity, 5, 0, 1000);
    expect(s.otherKw).toBe(0);
    expect(s.wp(0)).toBe(0);
    expect(s.connX).toBeCloseTo(1000, 6);
  });
});

describe('meterSegments', () => {
  it('laden: blauw tot P_el, oranje tot P_net', () => {
    const seg = meterSegments({ pElectric: 2, pBattery: -0.5, pGrid: 2.5, pLimitKw: 3 });
    expect(seg.grid).toEqual([0, 2]);
    expect(seg.charge).toEqual([2, 2.5]);
    expect(seg.discharge).toBeNull();
    expect(seg.overflow).toBeNull();
  });

  it('ontladen: blauw tot P_net, groen tot P_el; overschrijding boven P_limiet', () => {
    const seg = meterSegments({ pElectric: 4, pBattery: 0.5, pGrid: 3.5, pLimitKw: 3 });
    expect(seg.grid).toEqual([0, 3.5]);
    expect(seg.discharge).toEqual([3.5, 4]);
    expect(seg.overflow).toEqual([3, 3.5]);
  });

  it('de stapel klopt: overig + P_el − P_bat,uit + P_bat,in = overig + P_net, overschrijding voorbij de aansluiting', () => {
    const conn = 8.05;
    const lim = 3.22;
    const s = meterScale(conn, lim, 4, 0, 1000);
    for (const h of [
      { pElectric: 3.48, pBattery: 0, pGrid: 3.48, pLimitKw: lim },
      { pElectric: 3.6, pBattery: 0.38, pGrid: 3.22, pLimitKw: lim },
      { pElectric: 2.5, pBattery: -0.5, pGrid: 3.0, pLimitKw: lim },
    ]) {
      const seg = meterSegments(h);
      // einde van wat via de meter gaat (blauw + oranje) = overig + P_net
      const meterEnd = seg.charge ? seg.charge[1] : seg.grid[1];
      expect(s.wp(meterEnd)).toBeCloseTo(s.x(conn - lim + h.pGrid), 9);
      if (seg.overflow) {
        expect(s.wp(seg.overflow[0])).toBeCloseTo(s.connX, 9);
        expect(seg.overflow[1] - seg.overflow[0]).toBeCloseTo(h.pGrid - lim, 9);
      }
    }
  });

  it('geen overschrijding zonder limiet', () => {
    expect(meterSegments({ pElectric: 9, pBattery: 0, pGrid: 9, pLimitKw: Infinity }).overflow).toBeNull();
  });
});

describe('stromen', () => {
  const h = {
    qSpace: 3,
    qDhw: 1.5,
    qBufferIn: 0.8,
    qBufferOut: 0,
    qBackup: 0.4,
    pElectric: 2.4,
    pBattery: -0.3,
    pGrid: 2.7,
    hasDhw: true,
  } as HourState;

  it('energiebalans op de aftakkingen', () => {
    const p = flowPowers(h);
    // aanvoer: buitenunit = boiler + verder; verder = buffer + gebouw (zonder bijstook)
    expect(p.supplyMain).toBeCloseTo(p.boilerIn + p.supplyMid, 9);
    expect(p.supplyMid).toBeCloseTo(p.bufferTop + p.supplyBuilding - h.qBackup, 9);
    // retour spiegelt de aanvoer
    expect(p.returnMid).toBeCloseTo(p.returnBuilding - h.qBackup + p.bufferBottom, 9);
    expect(p.returnMain).toBeCloseTo(p.returnMid + p.boilerOut, 9);
    // batterij laden: positief (van het knooppunt naar de batterij)
    expect(p.battery).toBeCloseTo(0.3, 9);
  });

  it('paden per configuratie en snelheid evenredig met vermogen', () => {
    const full = flowPaths(conceptLayout(true, true, true)).map((f) => f.id);
    const bare = flowPaths(conceptLayout(false, false, false)).map((f) => f.id);
    expect(full).toContain('boilerIn');
    expect(full).toContain('bufferTop');
    expect(full).toContain('battery');
    expect(bare).not.toContain('boilerIn');
    expect(bare).not.toContain('bufferTop');
    expect(bare).not.toContain('battery');
    expect(flowSpeed(5, 10)).toBeCloseTo(FLOW_SPEED_MAX / 2, 9);
    expect(flowSpeed(-10, 10)).toBeCloseTo(-FLOW_SPEED_MAX, 9);
    expect(flowSpeed(0, 10)).toBe(0);
  });

  it('ventilator: stil bij 0, sneller bij meer vermogen', () => {
    expect(fanPeriod(0, 10)).toBeNull();
    expect(fanPeriod(10, 10)!).toBeLessThan(fanPeriod(1, 10)!);
  });

  it('punt halverwege een geknikte leiding', () => {
    const m = pointAlong(
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
      ],
      0.75,
    );
    expect(m.x).toBeCloseTo(10, 9);
    expect(m.y).toBeCloseTo(5, 9);
    expect(m.angle).toBeCloseTo(90, 9);
  });
});

describe('kleurschaal aanvoertemperatuur', () => {
  it('25 °C koud, 55 °C warm, begrensd', () => {
    expect(supplyColorFraction(25)).toBe(0);
    expect(supplyColorFraction(40)).toBeCloseTo(0.5, 9);
    expect(supplyColorFraction(55)).toBe(1);
    expect(supplyColorFraction(70)).toBe(1);
    expect(supplyColorFraction(10)).toBe(0);
  });
});

describe('gelaagd vat', () => {
  it('warm boven tot de laadtoestand; vol = helemaal warm, leeg = helemaal koel', () => {
    expect(thermocline(0)).toEqual([0, 0]);
    expect(thermocline(1)).toEqual([1, 1]);
    const [a, b] = thermocline(0.3);
    expect(a).toBeLessThan(0.3);
    expect(b).toBeGreaterThan(0.3);
    expect((a + b) / 2).toBeCloseTo(0.3, 9);
  });
});
