import { it } from 'vitest';
import { multiDwellingInput } from '../../src/concepts/peakshaving/data/defaults';
import { analyze } from '../../src/concepts/peakshaving/model/analysis';
import { tankEnergy } from '../../src/concepts/peakshaving/model/building';
import { SCENARIOS } from '../../src/concepts/peakshaving/scenarios';
import { refYear } from './helpers';
import type { PeakshavingInput } from '../../src/concepts/peakshaving/model/types';

const y = refYear('T5');
function show(label: string, i: PeakshavingInput) {
  const a = analyze(i, y, { robustnessYears: [y] });
  console.log(
    label,
    JSON.stringify({
      conn: i.grid.connection,
      share: i.grid.heatPumpShare,
      dhw: i.building.dhw,
      buf: i.buffer.volumeM3,
      bat: i.battery.capacityKwh,
      nominalKw: +a.nominalKw.toFixed(3),
      pLimitKw: +a.pLimitKw.toFixed(3),
      pGridMax: +a.main.kpis.pGridMaxKw.toFixed(3),
      exH: a.main.kpis.exceedanceHours,
      smallest: a.smallest.label,
      woNominal: +a.withoutMeasures.nominalKw.toFixed(3),
      woPGrid: +a.withoutMeasures.kpis.pGridMaxKw.toFixed(3),
      woExH: a.withoutMeasures.kpis.exceedanceHours,
      woSmallest: a.withoutMeasures.smallest.label,
      sizing: a.sizing,
      tankKwh: +tankEnergy(a.input.building).toFixed(3),
    }),
  );
}

it('verify', () => {
  const base = multiDwellingInput();
  show('default', base);
  show('scen woningen-basis', SCENARIOS.find((s) => s.id === 'woningen-basis')!.build());
  show('scen woningen-buffer', SCENARIOS.find((s) => s.id === 'woningen-buffer')!.build());
  const b1 = multiDwellingInput(); b1.buffer.volumeM3 = 1; show('1m3', b1);
  const b2 = multiDwellingInput(); b2.buffer.volumeM3 = 2; show('2m3', b2);
  const b2b = multiDwellingInput(); b2b.buffer.volumeM3 = 2; b2b.battery.capacityKwh = 20; show('2m3+20kWh', b2b);
  // oude standaard (10 kWh/dag, 200 l per woning, 3x40 A)
  const old = multiDwellingInput(); old.building.dhw.dailyKwh = 100; old.building.dhw.tankLitre = 2000; old.grid.connection = '3x40';
  show('old default', old);
  // oud per woning tapwater met nieuwe aansluiting
  const old35 = multiDwellingInput(); old35.building.dhw.dailyKwh = 100; old35.building.dhw.tankLitre = 2000;
  show('old dhw 3x35', old35);
  console.log('tank 120 l', (120 / 1000) * 1.163 * 45 * 0.85, 'days', ((120 / 1000) * 1.163 * 45 * 0.85) / 6);
  console.log('tank 200 l', (200 / 1000) * 1.163 * 45 * 0.85, 'days', ((200 / 1000) * 1.163 * 45 * 0.85) / 10);
});
