// Badges "Meer instellingen · {n} aangepast" en "Verfijnen · {n} aangepast" (UX-plan §3.2, §5.3).
import { describe, expect, it } from 'vitest';
import { defaultInputOfKind } from '../../src/concepts/peakshaving/data/defaults';
import { normalizeInput, withDesignLoad, withDwellings } from '../../src/concepts/peakshaving/model/input';
import type { BuildingKind, PeakshavingInput } from '../../src/concepts/peakshaving/model/types';
import { SCENARIOS } from '../../src/concepts/peakshaving/scenarios';
import { UI_LABELS } from '../../src/concepts/peakshaving/texts';
import {
  dhwOnDefaults,
  moreSettingsChanged,
  refineChanged,
} from '../../src/concepts/peakshaving/view/settingsDiff';

const base = (kind: BuildingKind): PeakshavingInput => normalizeInput(defaultInputOfKind(kind));

function edit(kind: BuildingKind, patch: (i: PeakshavingInput) => void): PeakshavingInput {
  const i = base(kind);
  patch(i);
  return normalizeInput(i);
}

describe('Meer instellingen: aantal aangepaste velden', () => {
  it('standaardwaarden van elke gebouwfunctie: 0', () => {
    for (const kind of ['single', 'multi', 'office'] as const)
      expect(moreSettingsChanged(base(kind)), kind).toBe(0);
  });

  it('voorbeelden: maatregelen, aansluiting, stooklijn en piekvermogen tellen niet; klimaatjaar en tapwater wel', () => {
    const counts = Object.fromEntries(SCENARIOS.map((s) => [s.id, moreSettingsChanged(s.build())]));
    expect(counts).toEqual({
      'woning-basis': 0,
      'woning-buffer': 0,
      'woning-buffer-batterij': 0,
      // tapwater 12 kWh/dag (Meer instellingen › Tapwater)
      nieuwbouw: 1,
      'woningen-basis': 0,
      'woningen-buffer': 0,
      'kantoor-basis': 0,
      'kantoor-buffer': 0,
      'kantoor-buffer-batterij': 0,
      'kantoor-t1': 1,
    });
    expect(moreSettingsChanged(withDesignLoad(base('single'), 12))).toBe(0);
  });

  it('elk veld telt één keer', () => {
    expect(moreSettingsChanged(edit('single', (i) => void (i.climateYear = 'knmi-1997')))).toBe(1);
    expect(
      moreSettingsChanged(
        edit('single', (i) => {
          i.building.designOutdoorC = -12;
          i.heatPump.maxSupplyC = 55;
          i.grid.allowedExceedanceH = 5;
          i.grid.allowedComfortLossH = 2;
          i.building.timeConstantH = 80;
        }),
      ),
    ).toBe(5);
    // opstooktijd alleen bij kantoor
    expect(moreSettingsChanged(edit('office', (i) => void (i.building.preheatH = 2)))).toBe(1);
  });

  it('een waarde die alleen door een begrenzing meeschuift, telt niet dubbel', () => {
    // lager gebruikssetpoint: het verlaagde setpoint en de stookgrens schuiven mee
    expect(moreSettingsChanged(edit('office', (i) => void (i.building.setpointUseC = 18)))).toBe(1);
    expect(moreSettingsChanged(edit('single', (i) => void (i.building.setpointUseC = 14.5)))).toBe(1);
    // lagere maximale aanvoer: de boilertemperatuur schuift mee
    expect(moreSettingsChanged(edit('single', (i) => void (i.heatPump.maxSupplyC = 50)))).toBe(1);
  });

  it('tapwater bij meerdere woningen per woning; het aantal woningen telt niet', () => {
    const twenty = withDwellings(base('multi'), 20);
    expect(twenty.building.dhw.dailyKwh).toBe(120);
    expect(moreSettingsChanged(twenty)).toBe(0);
    expect(moreSettingsChanged(edit('multi', (i) => void (i.building.dhw.dailyKwh = 70)))).toBe(1);
    expect(moreSettingsChanged(edit('multi', (i) => void (i.building.dhw.tankLitre = 1500)))).toBe(1);
  });

  it('tapwater bij kantoor: het vinkje telt, de getallen tegen wat het vinkje invult', () => {
    const on = dhwOnDefaults('office');
    expect(on).toEqual({ dailyKwh: 20, tankLitre: 500 });
    const enabled = edit(
      'office',
      (i) => void (i.building.dhw = { ...i.building.dhw, enabled: true, ...on }),
    );
    expect(moreSettingsChanged(enabled)).toBe(1);
    const more = edit(
      'office',
      (i) => void (i.building.dhw = { ...i.building.dhw, enabled: true, ...on, dailyKwh: 30 }),
    );
    expect(moreSettingsChanged(more)).toBe(2);
    // woning zonder tapwater (vinkje in de Basis): de verborgen getallen tellen niet
    expect(
      moreSettingsChanged(
        edit('single', (i) => void (i.building.dhw = { ...i.building.dhw, enabled: false, dailyKwh: 3 })),
      ),
    ).toBe(0);
  });

  it('badge-tekst', () => {
    expect(UI_LABELS.moreSettingsSummary(0)).toBe('Meer instellingen · standaardwaarden');
    expect(UI_LABELS.moreSettingsSummary(2)).toBe('Meer instellingen · 2 aangepast');
  });
});

describe('Verfijnen: aantal aangepaste keuzes', () => {
  it('standaard 0; handmatig WP-vermogen, laadstrategie altijd en handmatig batterijvermogen tellen elk één', () => {
    expect(refineChanged(base('single'))).toBe(0);
    const i = edit('single', (x) => {
      x.heatPump.sizingMode = 'manual';
      x.buffer.strategy = 'always';
      x.battery = { capacityKwh: 10, powerKw: 2 };
    });
    expect(refineChanged(i)).toBe(3);
    expect(UI_LABELS.refineSummary(0)).toBe('Verfijnen · standaard');
    expect(UI_LABELS.refineSummary(3)).toBe('Verfijnen · 3 aangepast');
  });
});
