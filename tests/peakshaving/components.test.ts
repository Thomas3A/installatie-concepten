// Componenten (spec §9.1): controlewaarden van §5.2, §5.3, §5.4, §5.5 en §5.7, plus interpolatie en bereiken (§3.5).
import { describe, expect, it } from 'vitest';
import { clamp, interpolate, type Table } from '../../src/core/interp';
import {
  CONNECTIONS,
  findConnection,
  type ConnectionId,
} from '../../src/concepts/peakshaving/data/connections';
import {
  defaultGrid,
  officeBuilding,
  residentialBuilding,
} from '../../src/concepts/peakshaving/data/defaults';
import { DHW_PROFILE } from '../../src/concepts/peakshaving/data/dhwProfile';
import { CAPACITY_FACTOR_TABLE, DEFROST_TABLE } from '../../src/concepts/peakshaving/data/heatPumpCurves';
import {
  batteryEfficiency,
  batteryPower,
  batteryUsableEnergy,
} from '../../src/concepts/peakshaving/model/battery';
import {
  bufferDeltaT,
  bufferEnergy,
  bufferKwhPerM3,
  bufferUA,
} from '../../src/concepts/peakshaving/model/buffer';
import {
  buildingCapacity,
  buildingUA,
  dhwDemandAt,
  gainsAt,
  tankEnergy,
} from '../../src/concepts/peakshaving/model/building';
import {
  connectionLabel,
  connectionPowerKw,
  gridLimitKw,
  limitFromConnection,
} from '../../src/concepts/peakshaving/model/grid';
import {
  bufferChargeTemperature,
  capacityFactor,
  cop,
  defrostFactor,
  supplyTemperature,
} from '../../src/concepts/peakshaving/model/heatPump';
import { deriveRanges, roundUpNice } from '../../src/concepts/peakshaving/model/ranges';
import type { EmitterPreset } from '../../src/concepts/peakshaving/model/types';

// Carnot-rendement van de controlewaarden in §5.2 (default van de warmtepomp)
const ETA = 0.45;
// Ontwerpbuitentemperatuur van de stooklijn-controlewaarden (default woning en kantoor)
const DESIGN_OUTDOOR_C = -10;

describe('interpolatie (core/interp)', () => {
  const table: Table = [
    [0, 10],
    [10, 20],
    [20, 0],
  ];

  it('klemt onder het bereik op de eerste y-waarde', () => {
    expect(interpolate(table, -5)).toBe(10);
    expect(interpolate(table, -1e9)).toBe(10);
  });

  it('klemt boven het bereik op de laatste y-waarde', () => {
    expect(interpolate(table, 25)).toBe(0);
    expect(interpolate(table, 1e9)).toBe(0);
  });

  it('is exact in de tabelpunten', () => {
    expect(interpolate(table, 0)).toBe(10);
    expect(interpolate(table, 10)).toBe(20);
    expect(interpolate(table, 20)).toBe(0);
  });

  it('interpoleert lineair tussen de tabelpunten', () => {
    expect(interpolate(table, 5)).toBeCloseTo(15, 12);
    expect(interpolate(table, 2.5)).toBeCloseTo(12.5, 12);
    expect(interpolate(table, 15)).toBeCloseTo(10, 12);
    expect(interpolate(table, 17.5)).toBeCloseTo(5, 12);
  });

  it('werkt met een tabel van twee punten', () => {
    const two: Table = [
      [-1, -2],
      [1, 2],
    ];
    expect(interpolate(two, 0)).toBeCloseTo(0, 12);
    expect(interpolate(two, 0.5)).toBeCloseTo(1, 12);
    expect(interpolate(two, -3)).toBe(-2);
    expect(interpolate(two, 3)).toBe(2);
  });

  it('clamp begrenst op [lo, hi]', () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(0.4, 0, 1)).toBe(0.4);
  });
});

describe('warmtepomp (spec §5.2)', () => {
  describe('capaciteitsfactor t.o.v. A7/W35', () => {
    const cases: [number, number][] = [
      [7, 1.0],
      [-10, 0.7],
      [-8.5, 0.73],
      [4.5, 0.93],
      [20, 1.125],
      [-25, 0.55],
    ];
    for (const [te, expected] of cases) {
      it(`capFactor(${te}) = ${expected}`, () => {
        expect(capacityFactor(te)).toBeCloseTo(expected, 3);
      });
    }

    it('is exact in alle tabelpunten van §5.2', () => {
      const nodes: [number, number][] = [
        [-20, 0.55],
        [-15, 0.62],
        [-10, 0.7],
        [-7, 0.76],
        [2, 0.86],
        [7, 1.0],
        [15, 1.1],
        [25, 1.15],
      ];
      expect(CAPACITY_FACTOR_TABLE.map(([x, y]) => [x, y])).toEqual(nodes);
      for (const [te, expected] of nodes) expect(capacityFactor(te)).toBeCloseTo(expected, 3);
    });

    it('is buiten het bereik geklemd', () => {
      expect(capacityFactor(-40)).toBeCloseTo(0.55, 3);
      expect(capacityFactor(40)).toBeCloseTo(1.15, 3);
    });
  });

  describe('ontdooifactor op de COP', () => {
    const cases: [number, number][] = [
      [-6, 0.95],
      [0, 0.9],
      [10, 1.0],
    ];
    for (const [te, expected] of cases) {
      it(`f_ontdooi(${te}) = ${expected}`, () => {
        expect(defrostFactor(te)).toBeCloseTo(expected, 3);
      });
    }

    it('volgt de punten (−7; 1,0) (−5; 0,9) (5; 0,9) (7; 1,0) en is daarbuiten 1,0', () => {
      expect(DEFROST_TABLE.map(([x, y]) => [x, y])).toEqual([
        [-7, 1.0],
        [-5, 0.9],
        [5, 0.9],
        [7, 1.0],
      ]);
      expect(defrostFactor(-7)).toBeCloseTo(1.0, 3);
      expect(defrostFactor(-5)).toBeCloseTo(0.9, 3);
      expect(defrostFactor(5)).toBeCloseTo(0.9, 3);
      expect(defrostFactor(7)).toBeCloseTo(1.0, 3);
      expect(defrostFactor(6)).toBeCloseTo(0.95, 3);
      expect(defrostFactor(-20)).toBeCloseTo(1.0, 3);
      expect(defrostFactor(30)).toBeCloseTo(1.0, 3);
    });
  });

  describe('COP (η = 0,45)', () => {
    const cases: [number, number, number][] = [
      [7, 35, 4.952],
      [-7, 35, 3.302],
      [2, 35, 3.782],
      [-10, 45, 2.603],
      [-10, 58, 2.191],
      [15, 30, 7.0],
    ];
    for (const [te, sup, expected] of cases) {
      it(`cop(${te}, ${sup}) = ${expected}`, () => {
        expect(cop(ETA, te, sup)).toBeCloseTo(expected, 3);
      });
    }

    it('cop(15, 30) is geklemd op de bovengrens 7,0', () => {
      expect(cop(ETA, 15, 30)).toBe(7.0);
    });

    it('gebruikt een minimale lift van 8 K', () => {
      // T_sup − T_e = 2 K < 8 K → noemer 8 K; bij 12 °C geen ontdooifactor
      expect(cop(0.1, 12, 14)).toBeCloseTo((0.1 * (14 + 273.15)) / 8, 9);
    });

    it('is geklemd op de ondergrens 1,2', () => {
      expect(cop(0.05, -20, 75)).toBe(1.2);
    });
  });

  describe('stooklijn (aanvoertemperatuur)', () => {
    const cases: [EmitterPreset, number, number][] = [
      ['MT', 2.5, 37.5],
      ['LT', -12, 35.0],
      ['HT', 20, 35.0],
    ];
    for (const [preset, te, expected] of cases) {
      it(`${preset} bij ${te} °C = ${expected} °C`, () => {
        expect(supplyTemperature({ emitterPreset: preset }, DESIGN_OUTDOOR_C, te)).toBeCloseTo(expected, 3);
      });
    }

    it('geeft de ontwerpaanvoer bij T_e ≤ T_e,ontwerp en de minimale aanvoer bij T_e ≥ 15 °C', () => {
      const presets: [EmitterPreset, number, number][] = [
        ['LT', 35, 25],
        ['MT', 45, 30],
        ['HT', 55, 35],
      ];
      for (const [preset, design, min] of presets) {
        expect(supplyTemperature({ emitterPreset: preset }, DESIGN_OUTDOOR_C, -10)).toBeCloseTo(design, 3);
        expect(supplyTemperature({ emitterPreset: preset }, DESIGN_OUTDOOR_C, -20)).toBeCloseTo(design, 3);
        expect(supplyTemperature({ emitterPreset: preset }, DESIGN_OUTDOOR_C, 15)).toBeCloseTo(min, 3);
        expect(supplyTemperature({ emitterPreset: preset }, DESIGN_OUTDOOR_C, 25)).toBeCloseTo(min, 3);
      }
    });
  });

  it('laadtemperatuur buffer = maximale aanvoer − 2 K', () => {
    expect(bufferChargeTemperature({ maxSupplyC: 60 })).toBe(58);
    expect(bufferChargeTemperature({ maxSupplyC: 75 })).toBe(73);
  });
});

describe('warmtebuffer (spec §5.3)', () => {
  const cases: [EmitterPreset, number, number][] = [
    ['MT', 23, 24.074],
    ['LT', 30, 31.401],
    ['HT', 13, 13.607],
  ];
  for (const [preset, dT, energy] of cases) {
    it(`1 m³ bij ${preset} en maxSupplyC 60 → ΔT ${dT} K → ${energy} kWh`, () => {
      const hp = { emitterPreset: preset, maxSupplyC: 60 };
      expect(bufferDeltaT(hp)).toBeCloseTo(dT, 3);
      expect(bufferEnergy(1, hp)).toBeCloseTo(energy, 3);
      expect(bufferKwhPerM3(hp)).toBeCloseTo(energy, 3);
    });
  }

  it('nuttige inhoud schaalt lineair met het volume', () => {
    const hp = { emitterPreset: 'MT' as const, maxSupplyC: 60 };
    expect(bufferEnergy(10, hp)).toBeCloseTo(240.741, 3);
    expect(bufferEnergy(0, hp)).toBe(0);
  });

  it('ΔT_buffer is nooit negatief', () => {
    // HT-retour 45 °C, laadtemperatuur 55 − 2 = 53 °C → 8 K; bij een (fictieve) 45 °C-WP: max(43 − 45, 0) = 0
    expect(bufferDeltaT({ emitterPreset: 'HT', maxSupplyC: 55 })).toBeCloseTo(8, 3);
    expect(bufferDeltaT({ emitterPreset: 'HT', maxSupplyC: 45 })).toBe(0);
    expect(bufferEnergy(1, { emitterPreset: 'HT', maxSupplyC: 45 })).toBe(0);
  });

  it('stilstandsverlies: 10 m³ → 6,96 W/K, 1 m³ → 1,5 W/K (bufferUA in kW/K)', () => {
    expect(bufferUA(10) * 1000).toBeCloseTo(6.96, 2);
    expect(bufferUA(1) * 1000).toBeCloseTo(1.5, 3);
    expect(bufferUA(1)).toBeCloseTo(0.0015, 6);
    expect(bufferUA(0)).toBe(0);
  });
});

describe('batterij (spec §5.4, §9.1)', () => {
  it('10 kWh: P = 5 kW (0,5 C), nuttig 9,0 kWh, η = 0,9487 per richting', () => {
    const b = { capacityKwh: 10, powerKw: null };
    expect(batteryPower(b)).toBeCloseTo(5, 3);
    expect(batteryUsableEnergy(b)).toBeCloseTo(9.0, 3);
    expect(batteryEfficiency()).toBeCloseTo(0.9487, 4);
    expect(batteryEfficiency() ** 2).toBeCloseTo(0.9, 9);
  });

  it('gebruikt een ingesteld vermogen in plaats van 0,5 C', () => {
    expect(batteryPower({ capacityKwh: 10, powerKw: 8 })).toBe(8);
  });
});

describe('elektrische aansluiting (spec §5.5)', () => {
  const expected: [ConnectionId, string, number][] = [
    ['1x25', '1×25 A', 5.75],
    ['1x35', '1×35 A', 8.05],
    ['1x40', '1×40 A', 9.2],
    ['3x25', '3×25 A', 17.32],
    ['3x35', '3×35 A', 24.25],
    ['3x40', '3×40 A', 27.71],
    ['3x50', '3×50 A', 34.64],
    ['3x63', '3×63 A', 43.65],
    ['3x80', '3×80 A', 55.43],
  ];

  it('bevat precies de negen standaardaansluitingen, oplopend in vermogen', () => {
    expect(CONNECTIONS.map((c) => c.id)).toEqual(expected.map(([id]) => id));
    for (let i = 1; i < CONNECTIONS.length; i++) {
      expect(CONNECTIONS[i].powerKw).toBeGreaterThan(CONNECTIONS[i - 1].powerKw);
    }
  });

  for (const [id, label, kw] of expected) {
    it(`${label} = ${kw} kW`, () => {
      const c = findConnection(id);
      expect(c).toBeDefined();
      expect(c!.label).toBe(label);
      expect(c!.powerKw).toBeCloseTo(kw, 2);
      // P = 0,230·I (1-fase) of 0,400·√3·I (3-fase)
      const exact = c!.phases === 1 ? 0.23 * c!.amps : 0.4 * Math.sqrt(3) * c!.amps;
      expect(c!.powerKw).toBeCloseTo(exact, 9);
      expect(connectionPowerKw({ connection: id, contractedKw: 0 })).toBeCloseTo(kw, 2);
      expect(connectionLabel({ connection: id, contractedKw: 0 })).toBe(label);
    });
  }

  it('grootverbruik gebruikt het gecontracteerd vermogen', () => {
    expect(connectionPowerKw({ connection: 'grootverbruik', contractedKw: 250 })).toBe(250);
  });

  it('P_limiet = P_aansluiting · aandeel voor elke standaardaansluiting', () => {
    for (const [id, , kw] of expected) {
      for (const share of [0.1, 0.4, 0.5, 1]) {
        const p = connectionPowerKw({ connection: id, contractedKw: 0 });
        expect(limitFromConnection(p, share)).toBeCloseTo(kw * share, 2);
        expect(limitFromConnection(p, share)).toBeCloseTo(p * share, 9);
      }
    }
  });

  it('P_limiet van de defaults: woning 1×35 A · 0,40 = 3,22 kW, kantoor 3×80 A · 0,50 = 27,71 kW', () => {
    expect(gridLimitKw(defaultGrid('residential'))).toBeCloseTo(3.22, 3);
    expect(gridLimitKw(defaultGrid('office'))).toBeCloseTo(27.713, 3);
    expect(
      gridLimitKw({ ...defaultGrid('office'), connection: 'grootverbruik', contractedKw: 100 }),
    ).toBeCloseTo(50, 3);
  });

  it('zonder (eindige) aansluiting is er geen limiet', () => {
    expect(limitFromConnection(Infinity, 0.4)).toBe(Infinity);
  });
});

describe('tapwater (spec §5.7)', () => {
  const b = residentialBuilding(8);

  it('profiel heeft 24 uurfracties', () => {
    expect(DHW_PROFILE).toHaveLength(24);
  });

  it('boiler 200 l / 55 °C = 8,897 kWh nuttig', () => {
    expect(tankEnergy(b)).toBeCloseTo(8.897, 3);
  });

  it('zonder tapwater is de boilerinhoud 0', () => {
    expect(tankEnergy(officeBuilding(100))).toBe(0);
    expect(dhwDemandAt(officeBuilding(100), 7)).toBe(0);
  });

  it('tapvraag uur 7 bij 10 kWh/dag = 1,207 kWh', () => {
    expect(b.dhw.dailyKwh).toBe(10);
    expect(dhwDemandAt(b, 7)).toBeCloseTo(1.207, 3);
    // t mod 24: elke dag hetzelfde profiel
    expect(dhwDemandAt(b, 7 + 24 * 100)).toBeCloseTo(1.207, 3);
  });

  it('dagsom van de tapvraag = 10 kWh (genormaliseerd profiel)', () => {
    let sum = 0;
    for (let t = 0; t < 24; t++) sum += dhwDemandAt(b, t);
    expect(sum).toBeCloseTo(10, 9);
    let sumDay2 = 0;
    for (let t = 24; t < 48; t++) sumDay2 += dhwDemandAt(b, t);
    expect(sumDay2).toBeCloseTo(10, 9);
  });
});

describe('gebouw (spec §5.1, §9.1)', () => {
  it('woning 8 kW: UA = 0,2667 kW/K, C = 10,667 kWh/K', () => {
    const b = residentialBuilding(8);
    expect(buildingUA(b)).toBeCloseTo(0.2667, 4);
    expect(buildingCapacity(b)).toBeCloseTo(10.667, 3);
  });

  it('woning 8 kW: interne winsten altijd UA · (20 − 15) = 1,333 kW', () => {
    const b = residentialBuilding(8);
    expect(gainsAt(b, 1, 3)).toBeCloseTo(1.333, 3);
    expect(gainsAt(b, 1, 12)).toBeCloseTo(1.333, 3);
    expect(gainsAt(b, 1, 5 * 24 + 12)).toBeCloseTo(1.333, 3);
  });

  it('kantoor 100 kW: UA = 3,2258 kW/K, C = 64,516 kWh/K', () => {
    const b = officeBuilding(100);
    expect(buildingUA(b)).toBeCloseTo(3.2258, 4);
    expect(buildingCapacity(b)).toBeCloseTo(64.516, 3);
  });

  it('kantoor 100 kW: winsten in gebruik = 29,032 kW, buiten gebruik 0', () => {
    const b = officeBuilding(100);
    // startWeekday 1 = maandag; uur 10 = maandag 10:00 (in gebruik)
    expect(gainsAt(b, 1, 10)).toBeCloseTo(29.032, 3);
    // maandag 03:00, maandag 18:00 (einde gebruik is exclusief) en zaterdag 10:00: niet in gebruik
    expect(gainsAt(b, 1, 3)).toBe(0);
    expect(gainsAt(b, 1, 18)).toBe(0);
    expect(gainsAt(b, 1, 5 * 24 + 10)).toBe(0);
  });
});

describe('roundUpNice (spec §3.5)', () => {
  // 1-2-5-reeks met tussenstappen 1,5 / 2,5 / 3 / 4: 1 · 1,5 · 2 · 2,5 · 3 · 4 · 5 · 10 per decade
  const cases: [number, number][] = [
    [3.988, 4],
    [25.6, 30],
    [49.85, 50],
    [320, 400],
    [1.2, 1.5],
    [2.2, 2.5],
    [0.031, 0.04],
    [1, 1],
    [1.5, 1.5],
    [2, 2],
    [2.5, 2.5],
    [3, 3],
    [4, 4],
    [5, 5],
    [10, 10],
    [1.01, 1.5],
    [1.6, 2],
    [2.6, 3],
    [3.1, 4],
    [4.1, 5],
    [5.1, 10],
    [7, 10],
    [9.99, 10],
    [11, 15],
    [16, 20],
    [21, 25],
    [26, 30],
    [31, 40],
    [41, 50],
    [51, 100],
    [100, 100],
    [101, 150],
    [1001, 1500],
    [0.12, 0.15],
    [0.6646, 1],
  ];
  for (const [x, expected] of cases) {
    it(`roundUpNice(${x}) = ${expected}`, () => {
      expect(roundUpNice(x)).toBeCloseTo(expected, 9);
    });
  }

  it('rondt nooit naar beneden af', () => {
    for (let x = 0.01; x < 5000; x *= 1.07) expect(roundUpNice(x)).toBeGreaterThanOrEqual(x - 1e-9);
  });
});

describe('bereiken afgeleid van het piekvermogen (spec §3.5)', () => {
  const mt60 = { emitterPreset: 'MT' as const, maxSupplyC: 60 };

  it('woning 8 kW, MT/60: kwhPerM3 = 24,074, V_max = 4 m³, E_max = 30 kWh', () => {
    const r = deriveRanges('residential', 8, mt60);
    expect(r.kwhPerM3).toBeCloseTo(24.074, 3);
    // 12 · 8 / 24,074 = 3,988 → 4
    expect(r.bufferMaxM3).toBeCloseTo(4, 9);
    // 8 · 8 / 2,5 = 25,6 → 30
    expect(r.batteryMaxKwh).toBeCloseTo(30, 9);
    expect(r.bufferStepM3).toBeCloseTo(0.05, 9);
    expect(r.batteryStepKwh).toBeCloseTo(0.5, 9);
    expect(r.heatPumpMinKw).toBeCloseTo(0.8, 9);
    expect(r.heatPumpMaxKw).toBeCloseTo(24, 9);
  });

  it('kantoor 100 kW, MT/60: V_max = 50 m³, E_max = 400 kWh', () => {
    const r = deriveRanges('office', 100, mt60);
    expect(r.kwhPerM3).toBeCloseTo(24.074, 3);
    // 12 · 100 / 24,074 = 49,85 → 50
    expect(r.bufferMaxM3).toBeCloseTo(50, 9);
    // 8 · 100 / 2,5 = 320 → 400
    expect(r.batteryMaxKwh).toBeCloseTo(400, 9);
    expect(r.bufferStepM3).toBeCloseTo(0.5, 9);
    expect(r.batteryStepKwh).toBeCloseTo(5, 9);
    expect(r.heatPumpMinKw).toBeCloseTo(10, 9);
    expect(r.heatPumpMaxKw).toBeCloseTo(300, 9);
  });

  it('minimaal 1 m³ / 10 kWh voor een woning', () => {
    // 12 · 1 / 24,074 = 0,50 → 0,5 < 1; 8 · 1 / 2,5 = 3,2 → 4 < 10
    const r = deriveRanges('residential', 1, mt60);
    expect(r.bufferMaxM3).toBe(1);
    expect(r.batteryMaxKwh).toBe(10);
  });

  it('minimaal 10 m³ / 100 kWh voor een kantoor', () => {
    // 12 · 10 / 24,074 = 4,98 → 5 < 10; 8 · 10 / 2,5 = 32 → 40 < 100
    const r = deriveRanges('office', 10, mt60);
    expect(r.bufferMaxM3).toBe(10);
    expect(r.batteryMaxKwh).toBe(100);
  });

  it('markeringen bij 2, 4 en 8 uur piekvermogen (woning 8 kW)', () => {
    const r = deriveRanges('residential', 8, mt60);
    expect(r.bufferMarkersM3.map((m) => m.hours)).toEqual([2, 4, 8]);
    expect(r.batteryMarkersKwh.map((m) => m.hours)).toEqual([2, 4, 8]);
    // buffer: uren · 8 kW / 24,074 kWh/m³
    const buf = [0.665, 1.329, 2.658];
    r.bufferMarkersM3.forEach((m, i) => expect(m.value).toBeCloseTo(buf[i], 3));
    // batterij: uren · 8 kW / COP 2,5
    const bat = [6.4, 12.8, 25.6];
    r.batteryMarkersKwh.forEach((m, i) => expect(m.value).toBeCloseTo(bat[i], 3));
  });

  it('markeringen bij 2, 4 en 8 uur piekvermogen (kantoor 100 kW)', () => {
    const r = deriveRanges('office', 100, mt60);
    const buf = [8.308, 16.615, 33.231];
    r.bufferMarkersM3.forEach((m, i) => expect(m.value).toBeCloseTo(buf[i], 3));
    const bat = [80, 160, 320];
    r.batteryMarkersKwh.forEach((m, i) => expect(m.value).toBeCloseTo(bat[i], 3));
  });

  it('nuttige opslag per m³ volgt de stooklijn en de maximale aanvoer', () => {
    expect(deriveRanges('residential', 8, { emitterPreset: 'LT', maxSupplyC: 60 }).kwhPerM3).toBeCloseTo(
      31.401,
      3,
    );
    expect(deriveRanges('residential', 8, { emitterPreset: 'HT', maxSupplyC: 60 }).kwhPerM3).toBeCloseTo(
      13.607,
      3,
    );
  });
});
