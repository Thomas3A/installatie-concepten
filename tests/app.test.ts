import { describe, expect, it } from 'vitest';
import { decodeConfig, encodeConfig } from '../src/concepts/klimaatplafond/share';
import {
  defaultAdvanced,
  defaultConfig,
  normalizeConfig,
  withValveCount,
  distributePanels,
} from '../src/concepts/klimaatplafond/model/config';
import { computeDesign, resolveAdvice } from '../src/concepts/klimaatplafond/model/design';
import { designMessages } from '../src/concepts/klimaatplafond/model/checks';
import { advance, initialState, setRunMode } from '../src/concepts/klimaatplafond/model/simulation';
import { ADV_GROUPS } from '../src/concepts/klimaatplafond/ui/advancedFields';
import { fmt, fmtClock } from '../src/core/format';
import { piStep } from '../src/core/control/pi';
import { CONCEPTS } from '../src/concepts';
import { SCENARIOS, buildScenario } from '../src/concepts/klimaatplafond/scenarios';
import { MESSAGE_TEXTS } from '../src/concepts/klimaatplafond/texts';

describe('formattering (nl-NL)', () => {
  it('decimale komma en punt als duizendtalscheiding', () => {
    expect(fmt(1234.567, 1)).toBe('1.234,6');
    expect(fmt(0.5, 2)).toBe('0,50');
    expect(fmt(NaN)).toBe('–');
    expect(fmtClock(3600 + 30 * 60)).toBe('01:30');
  });
});

describe('configuratie', () => {
  it('klemt invoer op de bereiken en dwingt de dode zone af', () => {
    const c = normalizeConfig({
      floorArea: 5000,
      setHeat: 22,
      setCool: 22,
      tSupplyCool: 5,
      valveCount: 7,
      pitch: 123,
    });
    expect(c.floorArea).toBe(500);
    expect(c.setCool).toBeGreaterThanOrEqual(c.setHeat + 1);
    expect(c.tSupplyCool).toBe(14);
    expect(c.valveCount).toBe(1);
    expect(c.pitch).toBe(75);
    expect(c.valves).toHaveLength(1);
  });
  it('verdeelt panelen gelijk over kleppen, de rest naar de eerste', () => {
    expect(distributePanels(28, 3)).toEqual([10, 9, 9]);
    const c = withValveCount(defaultConfig(), 3);
    expect(c.valves.map((v) => v.panelCount)).toEqual([10, 9, 9]);
  });
  it('deelbare link: encode → decode geeft dezelfde configuratie', () => {
    const cfg = resolveAdvice(
      normalizeConfig({ ...defaultConfig(), rh: 65, pitch: 100, flowChar: 'lineair' }),
    );
    const code = encodeConfig(cfg);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeConfig(code)).toEqual(cfg);
  });
  it('ongeldige of beschadigde link geeft null of wordt geklemd', () => {
    expect(decodeConfig('%%%')).toBeNull();
    const bad = btoa(JSON.stringify({ floorArea: 1e9 })).replace(/=+$/, '');
    expect(decodeConfig(bad)?.floorArea).toBe(500);
  });
});

describe('aanvoertemperatuur verwarmen tot 45 °C', () => {
  it('wordt geaccepteerd en daarboven geklemd', () => {
    expect(normalizeConfig({ tSupplyHeat: 45 }).tSupplyHeat).toBe(45);
    expect(normalizeConfig({ tSupplyHeat: 46 }).tSupplyHeat).toBe(45);
    expect(normalizeConfig({ tSupplyHeat: 27 }).tSupplyHeat).toBe(28);
  });
  it('geeft een geldig ontwerp en een W10-melding (plafond te warm)', () => {
    const cfg = resolveAdvice(normalizeConfig({ ...defaultConfig(), tSupplyHeat: 45 }));
    const d = computeDesign(cfg);
    for (const v of d.valves) {
      expect(Number.isFinite(v.modes.verwarmen.vmax)).toBe(true);
      expect(v.modes.verwarmen.tOppMean).toBeGreaterThan(35);
    }
    expect(designMessages(d).map((m) => m.code)).toContain('W10');
  });
});

describe('PICV-advies en lastaandeel', () => {
  it('PICV-advies blijft binnen het gekozen DN, ook als Vmax buiten het instelbereik valt', () => {
    const c = defaultConfig();
    // DN20 met weinig vermogen: Vmax valt onder het instelbereik van de DN20-PICV's
    c.valves[0] = { ...c.valves[0], type: 'A', dn: 20, panelCount: 8, picv: null };
    const d = computeDesign(c);
    const a = d.valves[0].advice.a;
    expect(a.picv.startsWith('DN20')).toBe(true);
    expect(a.fits).toBe(false);
    expect(d.valves[0].picv.dn).toBe(20);
    expect(resolveAdvice(c).valves[0].picv?.startsWith('DN20')).toBe(true);
    // W13 toetst tegen de DN20-PICV (ondergrens 220 l/h)
    const w13 = designMessages(d).find((m) => m.code === 'W13');
    expect(w13?.lines.join(' ')).toContain('DN20');
  });
  it('lastaandeel is minimaal 1 % en een zone met het minimum geeft geen NaN in de simulatie', () => {
    expect(normalizeConfig({ valves: [{ loadShare: 0 }] }).valves[0].loadShare).toBe(1);
    const c = defaultConfig();
    c.floorArea = 60;
    c.valveCount = 2;
    c.advanced = { ...c.advanced, loadSplit: 'manual' };
    c.valves = [
      { ...c.valves[0], panelCount: 20, loadShare: 0 },
      { ...c.valves[0], panelCount: 20, loadShare: 100 },
    ];
    const cfg = resolveAdvice(normalizeConfig(c));
    const d = computeDesign(cfg);
    let s = setRunMode(initialState(d, 'stop'), d, 'koelen');
    s = advance(s, d, 900).state;
    expect(s.tAir.every(Number.isFinite)).toBe(true);
  });
});

describe('Geavanceerd-paneel', () => {
  it('elk veld wijst naar een bestaande instelling (geen dode velden)', () => {
    const adv = defaultAdvanced() as unknown as Record<string, unknown>;
    for (const g of ADV_GROUPS) {
      for (const f of g.fields) {
        const v = f.path.reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], adv);
        expect(typeof v, `${g.title}: ${f.path.join('.')}`).toBe('number');
        expect(Number.isFinite(v as number)).toBe(true);
      }
    }
    // geen Kv/Kvs-velden meer (Type B regelt softwarematig)
    for (const g of ADV_GROUPS)
      for (const f of g.fields) expect(`${f.label} ${f.path.join('.')}`).not.toMatch(/\bkvs?\b|kvRatio/i);
  });
});

describe('regelaar', () => {
  it('anti-windup: integrator loopt niet door in verzadiging', () => {
    let st = { I: 0 };
    for (let k = 0; k < 1000; k++) st = piStep(st, 3, { Kp: 0.6, Ti: 900 }, 2).state;
    expect(st.I).toBe(0);
    const r = piStep(st, 3, { Kp: 0.6, Ti: 900 }, 2);
    expect(r.u).toBe(1);
  });
});

describe('registry en teksten', () => {
  it('klimaatplafond is actief en de rest binnenkort', () => {
    expect(CONCEPTS.find((c) => c.id === 'klimaatplafond')?.status).toBe('actief');
    expect(
      CONCEPTS.filter((c) => c.status === 'binnenkort')
        .map((c) => c.id)
        .sort(),
    ).toEqual(['bka', 'fancoil', 'koelbalk', 'vloer']);
  });
  it('alle meldingscodes hebben uitleg met oplossingen', () => {
    const codes = [
      'W01',
      'W02',
      'W03',
      'I01',
      'W04',
      'W05',
      'W06',
      'W07',
      'W08',
      'W09',
      'W10',
      'W11',
      'W13',
      'W14',
      'W15',
      'W16',
      'I02',
      'I03',
      'I04',
      'I05',
    ];
    for (const c of codes) {
      expect(MESSAGE_TEXTS[c], c).toBeDefined();
      expect(MESSAGE_TEXTS[c].why.length).toBeGreaterThan(0);
      expect(MESSAGE_TEXTS[c].solutions.length).toBeGreaterThan(0);
    }
  });
  it('tien scenario’s zijn bouwbaar', () => {
    expect(SCENARIOS).toHaveLength(10);
    for (const s of SCENARIOS) expect(buildScenario(s.id)).not.toBeNull();
  });
});
