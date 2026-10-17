// Sjabloonteksten van de werkbank die de UI-pakketten zonder eigen tekst gebruiken (UX-plan §2.3, §3.1, §4.5): de
// tapwaterhint en de chips van de strook met de echte standaardwaarden, en buffervolumes die de waarde noemen die een
// knop zet, ook naast de schuifstap.
import { describe, expect, it } from 'vitest';
import { EMITTER_PRESETS } from '../../src/concepts/peakshaving/data/heatPumpCurves';
import { defaultInputOfKind } from '../../src/concepts/peakshaving/data/defaults';
import { gridLimitKw } from '../../src/concepts/peakshaving/model/grid';
import { buildingText, designLoadText } from '../../src/concepts/peakshaving/model/kpis';
import { normalizeInput } from '../../src/concepts/peakshaving/model/input';
import { BASIS_TEXTS, fmtVolume, VERDICT_TEXTS, WHATIF_TEXTS } from '../../src/concepts/peakshaving/texts';
import { kwDigitsFor } from '../../src/concepts/peakshaving/view/format';

describe('Basis: tapwaterhint en chips van de strook', () => {
  it('woning: "10 kWh/dag · boiler 200 l" en de chips van §2.3', () => {
    const i = normalizeInput(defaultInputOfKind('single'));
    const b = i.building;
    expect(BASIS_TEXTS.dhwHint(b.dhw.dailyKwh, b.dhw.tankLitre, false)).toBe('10 kWh/dag · boiler 200 l');
    expect(BASIS_TEXTS.chipDhw(b.dhw.dailyKwh)).toBe('tapwater 10 kWh/dag');
    const budget = gridLimitKw(i.grid);
    expect(BASIS_TEXTS.chipBudget(budget, 100 * i.grid.heatPumpShare, kwDigitsFor(budget))).toBe(
      'budget 3,22 kW · 40 %',
    );
    const p = EMITTER_PRESETS[i.heatPump.emitterPreset];
    expect(BASIS_TEXTS.chipEmitter(p.id, p.supplyDesignC, p.returnDesignC)).toBe('MT 45/35');
    expect(BASIS_TEXTS.emitterOption(p.id, p.supplyDesignC)).toBe('MT 45');
    expect(buildingText(b)).toBe('Woning');
    expect(designLoadText(b)).toBe('8,0 kW');
    expect(BASIS_TEXTS.chipName('Piekvermogen verwarming', designLoadText(b))).toBe(
      'Piekvermogen verwarming: 8,0 kW, wijzigen',
    );
  });

  it('meerdere woningen: tapwater per woning en het collectieve vat; piekvermogen met "kW/woning"', () => {
    const i = normalizeInput(defaultInputOfKind('multi'));
    const b = i.building;
    const n = b.dwellings;
    expect(n).toBe(10);
    expect(BASIS_TEXTS.dhwHint(b.dhw.dailyKwh / n, b.dhw.tankLitre, true)).toBe(
      '6,0 kWh/dag per woning · boiler 1.200 l',
    );
    expect(BASIS_TEXTS.chipDhw(b.dhw.dailyKwh / n, true)).toBe('tapwater 6,0 kWh/dag per woning');
    expect(buildingText(b)).toBe('10 woningen');
    expect(designLoadText(b)).toBe('50,0 kW (5,0 kW/woning)');
  });

  it('kantoor: gebruikstijden en nachtverlaging', () => {
    const b = normalizeInput(defaultInputOfKind('office')).building;
    expect(BASIS_TEXTS.chipUseHours(b.useStartH, b.useEndH)).toMatch(/^gebruik \d+–\d+ uur$/);
    expect(BASIS_TEXTS.chipNightSetback(b.setpointSetbackC < b.setpointUseC)).toBe('nachtverlaging');
    expect(BASIS_TEXTS.chipNightSetback(false)).toBe('geen nachtverlaging');
    expect(BASIS_TEXTS.chipDhwOff).toBe('geen tapwater');
    // nergens "per woning" bij kantoor
    expect(designLoadText(b)).not.toContain('woning');
  });

  it('tapwater: hele getallen vanaf 10 zonder decimalen, anders één', () => {
    expect(BASIS_TEXTS.chipDhw(12)).toBe('tapwater 12 kWh/dag');
    expect(BASIS_TEXTS.chipDhw(12.5)).toBe('tapwater 12,5 kWh/dag');
    expect(BASIS_TEXTS.chipDhw(6.5)).toBe('tapwater 6,5 kWh/dag');
    expect(BASIS_TEXTS.chipDhw(60 / 10)).toBe('tapwater 6,0 kWh/dag');
  });
});

describe('buffervolume in teksten', () => {
  it('twee decimalen zoals het getalveld; een rasterpunt naast de schuifstap exact', () => {
    expect(fmtVolume(0.2)).toBe('0,20');
    expect(fmtVolume(0.15 * 4)).toBe('0,60');
    expect(fmtVolume(20)).toBe('20,00');
    expect(fmtVolume(0.05 * 2.5)).toBe('0,125');
    expect(fmtVolume(0.05 * 1.5)).toBe('0,075');
    expect(fmtVolume(0.15 * 1.5)).toBe('0,225');
    expect(VERDICT_TEXTS.fix.buffer(0.125, false)).toBe('0,125 m³ buffer');
    expect(VERDICT_TEXTS.undo.buffer(0.125)).toBe('Buffer op 0,125 m³');
    expect(VERDICT_TEXTS.measures(0.125, 0)).toBe(' met 0,125 m³ buffer');
    expect(VERDICT_TEXTS.fix.trySmallerWith('1×25 A', 0.375, 4)).toBe(
      'Probeer 1×25 A met 0,375 m³ buffer en 4,0 kWh batterij',
    );
    expect(WHATIF_TEXTS.dotAria('1×35 A', 0.125, false)).toBe('1×35 A past vanaf 0,125 m³: zet buffer');
    expect(WHATIF_TEXTS.dotLabel('1×35 A', 0.125)).toBe('1×35 A · 0,125 m³');
    expect(WHATIF_TEXTS.dotLabel(WHATIF_TEXTS.dotName('1×25 A', 7.5), 0.6)).toBe(
      '1×25 A + 7,5 kWh · 0,60 m³',
    );
    expect(WHATIF_TEXTS.miniPlateau(5.7, 0.375)).toBe('5,7 kW vanaf 0,375 m³: meer helpt niet');
  });
});

describe('percentages in de detailzin', () => {
  it('een klein maar echt verschil wordt "< 1 %", niet "0 %"', () => {
    expect(VERDICT_TEXTS.margin(46.4, 0.2, 0.43, 46.6, 1)).toBe(
      'Piek aan de meter 46,4 kW, 0,2 kW (< 1 %) onder het budget van 46,6 kW.',
    );
    expect(VERDICT_TEXTS.over(2, 3.22, 0.01, 0.3, 2)).toBe(
      '2 uur per jaar boven het WP-budget van 3,22 kW, tot 0,01 kW (< 1 %) erboven.',
    );
    expect(VERDICT_TEXTS.over(101, 3.22, 0.26, 8.1, 2)).toBe(
      '101 uur per jaar boven het WP-budget van 3,22 kW, tot 0,26 kW (8 %) erboven.',
    );
    expect(VERDICT_TEXTS.margin(3.18, 0.04, 1.2, 3.22, 2)).toContain('(1 %)');
  });
});
