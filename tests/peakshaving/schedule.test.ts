// Gebouwschema (spec §9.3): weekdag, gebruik, setpoint/opstoken, winsten en tapwater (port van §4 in peakshaving_ref.py).
import { describe, expect, it } from 'vitest';
import { officeBuilding, residentialBuilding } from '../../src/concepts/peakshaving/data/defaults';
import {
  buildingUA,
  buildSchedule,
  dhwDemandAt,
  gainsAt,
  HOURS_PER_YEAR,
  isInUse,
  isPreheatHour,
  setpointAt,
  weekdayOf,
} from '../../src/concepts/peakshaving/model/building';
import type { Building } from '../../src/concepts/peakshaving/model/types';
import { realYear, refYear } from './helpers';

const HOURS_PER_DAY = 24;
const SATURDAY = 5; // dagindex 5 in een jaar dat op maandag begint

// Letterlijke port van weekdag/in_gebruik/setpoint uit tools/peakshaving_ref/peakshaving_ref.py,
// als onafhankelijke controle van de implementatie (incl. de (t + k) % 8760-regel bij opstoken).
function pyWeekday(startWeekday: number, t: number): number {
  return ((startWeekday - 1 + Math.floor(t / 24)) % 7) + 1;
}
function pyInUse(b: Building, startWeekday: number, t: number): boolean {
  if (b.use === 'residential') return true;
  const u = t % 24;
  return pyWeekday(startWeekday, t) <= 5 && b.useStartH <= u && u < b.useEndH;
}
function pySetpoint(b: Building, startWeekday: number, t: number): number {
  if (pyInUse(b, startWeekday, t)) return b.setpointUseC;
  if (b.use === 'office' && b.preheatH > 0) {
    for (let k = 1; k <= b.preheatH; k++) {
      if (pyInUse(b, startWeekday, (t + k) % 8760)) return b.setpointUseC;
    }
  }
  return b.setpointSetbackC;
}

describe('kantoor met defaults in T5 (spec §9.3)', () => {
  const b = officeBuilding();
  const sw = refYear('T5').startWeekday;

  it('T5 begint op maandag (startWeekday 1)', () => {
    expect(sw).toBe(1);
  });

  it('weekdag van uur 0 is 1 (maandag)', () => {
    expect(weekdayOf(sw, 0)).toBe(1);
    expect(weekdayOf(sw, 23)).toBe(1);
    expect(weekdayOf(sw, 24)).toBe(2);
    expect(weekdayOf(sw, SATURDAY * HOURS_PER_DAY)).toBe(6);
    expect(weekdayOf(sw, 6 * HOURS_PER_DAY)).toBe(7);
    expect(weekdayOf(sw, 7 * HOURS_PER_DAY)).toBe(1);
  });

  it('in gebruik: uur 7 ja, uur 6 nee, zaterdag 10:00 (uur 130) nee', () => {
    expect(isInUse(b, sw, 7)).toBe(true);
    expect(isInUse(b, sw, 6)).toBe(false);
    expect(weekdayOf(sw, 130)).toBe(6);
    expect(130 % 24).toBe(10);
    expect(isInUse(b, sw, 130)).toBe(false);
  });

  it('gebruiksuren zijn [useStartH, useEndH): uur 17 nog wel, uur 18 niet', () => {
    expect(isInUse(b, sw, 17)).toBe(true);
    expect(isInUse(b, sw, 18)).toBe(false);
    // vrijdag (dag 4) wel, zondag (dag 6) niet
    expect(isInUse(b, sw, 4 * HOURS_PER_DAY + 10)).toBe(true);
    expect(isInUse(b, sw, 6 * HOURS_PER_DAY + 10)).toBe(false);
  });

  it('setpoint: uur 2 = 19, uur 3 = 21 (opstoken), uur 7 = 21, uur 18 = 19', () => {
    expect(setpointAt(b, sw, 2)).toBe(19);
    expect(setpointAt(b, sw, 3)).toBe(21);
    expect(setpointAt(b, sw, 7)).toBe(21);
    expect(setpointAt(b, sw, 18)).toBe(19);
  });

  it('opstookuren: uur 3 t/m 6 op een werkdag wel, niet op zaterdag', () => {
    for (let h = 3; h <= 6; h++) {
      expect(isPreheatHour(b, sw, h), `maandag uur ${h}`).toBe(true);
      expect(isPreheatHour(b, sw, SATURDAY * HOURS_PER_DAY + h), `zaterdag uur ${h}`).toBe(false);
      expect(setpointAt(b, sw, SATURDAY * HOURS_PER_DAY + h), `zaterdag uur ${h}`).toBe(19);
    }
    // vóór de opstookperiode, tijdens gebruik en erna is het geen opstookuur
    expect(isPreheatHour(b, sw, 2)).toBe(false);
    expect(isPreheatHour(b, sw, 7)).toBe(false);
    expect(isPreheatHour(b, sw, 18)).toBe(false);
  });

  it('zondag stookt niet op; maandag 03:00–06:00 na het weekend wel', () => {
    const sunday = 6 * HOURS_PER_DAY;
    for (let h = 0; h < 24; h++) expect(isPreheatHour(b, sw, sunday + h), `zondag uur ${h}`).toBe(false);
    const monday = 7 * HOURS_PER_DAY;
    for (let h = 3; h <= 6; h++) expect(isPreheatHour(b, sw, monday + h), `maandag uur ${h}`).toBe(true);
  });

  it('opstookuren per week: 5 werkdagen × 4 uur', () => {
    let n = 0;
    for (let t = 0; t < 7 * HOURS_PER_DAY; t++) if (isPreheatHour(b, sw, t)) n++;
    expect(n).toBe(5 * b.preheatH);
  });

  it('geen opstookuren als preheatH = 0 of als het nachtsetpoint gelijk is aan het gebruikssetpoint', () => {
    const noPreheat: Building = { ...b, preheatH: 0 };
    expect(setpointAt(noPreheat, sw, 3)).toBe(19);
    expect(isPreheatHour(noPreheat, sw, 3)).toBe(false);
    const flat: Building = { ...b, setpointSetbackC: b.setpointUseC };
    expect(setpointAt(flat, sw, 3)).toBe(21);
    expect(isPreheatHour(flat, sw, 3)).toBe(false);
  });

  it('winsten alleen tijdens gebruik: UA·(21 − 12) = 29,032 kW, anders 0', () => {
    const g = buildingUA(b) * (b.setpointUseC - b.balanceTempC);
    expect(g).toBeCloseTo(29.032, 3);
    expect(gainsAt(b, sw, 7)).toBeCloseTo(29.032, 3);
    for (const t of [0, 3, 6, 18, 23, 130]) expect(gainsAt(b, sw, t), `uur ${t}`).toBe(0);
    for (let t = 0; t < HOURS_PER_YEAR; t++) {
      expect(gainsAt(b, sw, t)).toBe(isInUse(b, sw, t) ? g : 0);
    }
  });

  it('kantoor heeft geen tapwater', () => {
    for (let t = 0; t < 48; t++) expect(dhwDemandAt(b, t)).toBe(0);
  });
});

describe('woning met defaults (spec §9.3)', () => {
  const b = residentialBuilding();
  const sw = refYear('T5').startWeekday;

  it('altijd in gebruik, setpoint altijd 20 °C en nooit een opstookuur', () => {
    for (let t = 0; t < HOURS_PER_YEAR; t++) {
      expect(isInUse(b, sw, t)).toBe(true);
      expect(setpointAt(b, sw, t)).toBe(20);
      expect(isPreheatHour(b, sw, t)).toBe(false);
    }
  });

  it('tapvraag uur 7 = 1,207 kWh bij 10 kWh/dag', () => {
    expect(dhwDemandAt(b, 7)).toBeCloseTo(1.207, 3);
  });

  it('dagsom tapvraag = 10,0 kWh voor elke dag, jaarsom = 3650 kWh', () => {
    let year = 0;
    for (let d = 0; d < HOURS_PER_YEAR / HOURS_PER_DAY; d++) {
      let day = 0;
      for (let h = 0; h < HOURS_PER_DAY; h++) day += dhwDemandAt(b, d * HOURS_PER_DAY + h);
      expect(day, `dag ${d}`).toBeCloseTo(10.0, 9);
      year += day;
    }
    expect(year).toBeCloseTo(3650, 6);
  });

  it('tapvraag is 0 als tapwater uit staat en schaalt lineair met het dagverbruik', () => {
    const off: Building = { ...b, dhw: { ...b.dhw, enabled: false } };
    expect(dhwDemandAt(off, 7)).toBe(0);
    const double: Building = { ...b, dhw: { ...b.dhw, dailyKwh: 20 } };
    expect(dhwDemandAt(double, 7)).toBeCloseTo(2 * dhwDemandAt(b, 7), 12);
  });

  it('winsten constant: UA·(20 − 15) = 1,333 kW in elk uur', () => {
    const g = buildingUA(b) * (b.setpointUseC - b.balanceTempC);
    expect(g).toBeCloseTo(1.333, 3);
    for (let t = 0; t < HOURS_PER_YEAR; t++) expect(gainsAt(b, sw, t)).toBe(g);
  });
});

describe('buildSchedule komt overeen met de losse functies', () => {
  const cases: [string, Building, number][] = [
    ['woning T5', residentialBuilding(), refYear('T5').startWeekday],
    ['kantoor T5', officeBuilding(), refYear('T5').startWeekday],
    ['kantoor 2012 (start op zondag)', officeBuilding(), realYear(2012).startWeekday],
    ['kantoor 1997 (start op woensdag)', officeBuilding(), realYear(1997).startWeekday],
    ['kantoor met opstooktijd 8 h', { ...officeBuilding(), preheatH: 8 }, 1],
  ];
  for (const [name, b, sw] of cases) {
    it(name, () => {
      const s = buildSchedule(b, sw);
      expect(s.inUse.length).toBe(HOURS_PER_YEAR);
      expect(s.setpoint.length).toBe(HOURS_PER_YEAR);
      expect(s.gains.length).toBe(HOURS_PER_YEAR);
      expect(s.dhwDemand.length).toBe(HOURS_PER_YEAR);
      for (let t = 0; t < HOURS_PER_YEAR; t++) {
        if (s.inUse[t] !== (isInUse(b, sw, t) ? 1 : 0)) throw new Error(`${name}: inUse[${t}]`);
        if (s.setpoint[t] !== setpointAt(b, sw, t)) throw new Error(`${name}: setpoint[${t}]`);
        if (s.gains[t] !== gainsAt(b, sw, t)) throw new Error(`${name}: gains[${t}]`);
        if (s.dhwDemand[t] !== dhwDemandAt(b, t)) throw new Error(`${name}: dhwDemand[${t}]`);
      }
    });
  }
});

describe('werkelijke jaren: weekdag van 1 januari', () => {
  it('2012 begint op zondag (7), 1997 op woensdag (3)', () => {
    expect(weekdayOf(realYear(2012).startWeekday, 0)).toBe(7);
    expect(weekdayOf(realYear(2012).startWeekday, 24)).toBe(1);
    expect(weekdayOf(realYear(1997).startWeekday, 0)).toBe(3);
  });

  it('kantoor in 2012: 1 januari (zondag) niet in gebruik, 2 januari 07:00 wel', () => {
    const b = officeBuilding();
    const sw = realYear(2012).startWeekday;
    for (let h = 0; h < 24; h++) expect(isInUse(b, sw, h)).toBe(false);
    expect(isInUse(b, sw, 24 + 7)).toBe(true);
    expect(setpointAt(b, sw, 24 + 3)).toBe(21);
  });
});

describe('opstoken over de jaargrens volgt de Python-regel (t + k) % 8760', () => {
  // Gebruik vanaf 02:00 met 4 uur opstoken: 22:00 en 23:00 op 31 december kijken vooruit naar uur 0..3,
  // en dat zijn (cyclisch) de eerste uren van 1 januari van hetzelfde jaar.
  const b: Building = { ...officeBuilding(), useStartH: 2, preheatH: 4 };
  const lastHours = [8755, 8756, 8757, 8758, 8759];

  it('jaar begint op maandag t/m vrijdag: 22:00 en 23:00 op 31 december stoken op (Python: 19,19,19,21,21)', () => {
    for (let sw = 1; sw <= 5; sw++) {
      expect(
        lastHours.map((t) => setpointAt(b, sw, t)),
        `startWeekday ${sw}`,
      ).toEqual([19, 19, 19, 21, 21]);
    }
  });

  it('jaar begint op zaterdag of zondag: geen opstoken aan het eind van het jaar (Python: 19 overal)', () => {
    // Bij startWeekday 7 is 31 december ook een zondag; zonder modulo zou "1 januari" een maandag zijn en
    // wél opstoken — de Python wikkelt terug naar 1 januari van hetzelfde jaar (zondag).
    for (const sw of [6, 7]) {
      expect(
        lastHours.map((t) => setpointAt(b, sw, t)),
        `startWeekday ${sw}`,
      ).toEqual([19, 19, 19, 19, 19]);
      expect(isPreheatHour(b, sw, 8759), `startWeekday ${sw}`).toBe(false);
    }
  });

  it('isPreheatHour volgt het teruggewikkelde setpoint', () => {
    expect(isPreheatHour(b, 5, 8758)).toBe(true);
    expect(isPreheatHour(b, 5, 8759)).toBe(true);
    expect(isPreheatHour(b, 5, 8757)).toBe(false);
  });

  it('setpoint over het hele jaar gelijk aan de letterlijke Python-port, voor elke startdag en opstooktijd', () => {
    const variants: Building[] = [
      officeBuilding(),
      b,
      { ...officeBuilding(), useStartH: 0, preheatH: 2 },
      { ...officeBuilding(), useStartH: 3, useEndH: 20, preheatH: 8 },
    ];
    for (const v of variants) {
      for (let sw = 1; sw <= 7; sw++) {
        for (let t = 0; t < HOURS_PER_YEAR; t++) {
          if (isInUse(v, sw, t) !== pyInUse(v, sw, t)) {
            throw new Error(`inUse wijkt af: start ${v.useStartH}, opstook ${v.preheatH}, sw ${sw}, t ${t}`);
          }
          if (setpointAt(v, sw, t) !== pySetpoint(v, sw, t)) {
            throw new Error(
              `setpoint wijkt af: start ${v.useStartH}, opstook ${v.preheatH}, sw ${sw}, t ${t}`,
            );
          }
        }
      }
    }
  });
});
