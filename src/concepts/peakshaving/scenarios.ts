// Scenario's: de acht van spec §10 plus twee met meerdere woningen op één warmtepomp (buiten de spec, zie
// docs/AANNAMES.md). Basis is steeds de standaardinvoer van de gekozen gebouwfunctie, plus de genoemde wijzigingen.
// De getallen in de beschrijvingen gelden voor het standaardklimaatjaar T1 (strenge winter, spec §4.3).
import { defaultInput, multiDwellingInput } from './data/defaults';
import { normalizeInput } from './model/input';
import type { BuildingKind, PeakshavingInput } from './model/types';

export interface Scenario {
  id: string;
  title: string;
  /** korte naam voor de keuzelijst Voorbeelden en de regel in de Basis */
  shortTitle: string;
  /** optgroup in de keuzelijst Voorbeelden */
  group: BuildingKind;
  /** één zin toelichting */
  description: string;
  build: () => PeakshavingInput;
}

function residential(patch: (i: PeakshavingInput) => void): () => PeakshavingInput {
  return () => {
    const i = defaultInput('residential');
    patch(i);
    return normalizeInput(i);
  };
}

/** Meerdere woningen op één warmtepomp: standaard 10 woningen van 5 kW op een eigen aansluiting van 3×35 A. */
function multiDwelling(patch: (i: PeakshavingInput) => void): () => PeakshavingInput {
  return () => {
    const i = multiDwellingInput();
    patch(i);
    return normalizeInput(i);
  };
}

function office(patch: (i: PeakshavingInput) => void): () => PeakshavingInput {
  return () => {
    const i = defaultInput('office');
    patch(i);
    return normalizeInput(i);
  };
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'woning-basis',
    title: "Woning jaren '70 na isolatie — 8 kW, 1×35 A, zonder maatregelen",
    shortTitle: "Woning jaren '70 · zonder maatregelen",
    group: 'single',
    description:
      'De warmtepomp wordt gedimensioneerd op de piek (12,9 kW) en zit zo’n 150 uur per jaar boven de WP-limiet van 3,2 kW.',
    build: residential(() => undefined),
  },
  {
    id: 'woning-buffer',
    title: '… met 0,5 m³ buffer',
    shortTitle: "Woning jaren '70 · 0,5 m³ buffer",
    group: 'single',
    description:
      'Een halve kuub buffer vangt de uurpieken op: de warmtepomp wordt kleiner (11,4 in plaats van 12,9 kW) en zit nog maar 2 uur per jaar boven de WP-limiet.',
    build: residential((i) => {
      i.buffer.volumeM3 = 0.5;
    }),
  },
  {
    id: 'woning-buffer-batterij',
    title: '… met 1 m³ buffer en 5 kWh batterij',
    shortTitle: "Woning jaren '70 · 1 m³ buffer + 5 kWh batterij",
    group: 'single',
    description:
      'Met 1 m³ buffer blijft de woning binnen 1×35 A, ook zonder batterij; op 1×25 A blijven er met 5 kWh batterij zo’n 45 uur boven de limiet.',
    build: residential((i) => {
      i.buffer.volumeM3 = 1;
      i.battery.capacityKwh = 5;
    }),
  },
  {
    id: 'nieuwbouw',
    title: 'Nieuwbouwwoning all-electric — 4 kW LT, 1×25 A, tapwater 12 kWh/dag',
    shortTitle: 'Nieuwbouwwoning all-electric (4 kW, LT)',
    group: 'single',
    description: 'Laag warmteverlies en vloerverwarming: hier bepaalt het tapwater de elektrische piek.',
    build: residential((i) => {
      i.building.designLoadKw = 4;
      i.heatPump.emitterPreset = 'LT';
      i.grid.connection = '1x25';
      i.building.dhw.dailyKwh = 12;
    }),
  },
  {
    id: 'woningen-basis',
    title: '10 woningen op één warmtepomp — 50 kW, 3×35 A, zonder maatregelen',
    shortTitle: '10 woningen · zonder maatregelen',
    group: 'multi',
    description:
      'Verwarming plus het tapwater van tien woningen: de warmtepomp wordt zo’n 80 kW en zit zo’n 160 uur per jaar boven de WP-limiet van 19,4 kW; pas 3×50 A past.',
    build: multiDwelling(() => undefined),
  },
  {
    id: 'woningen-buffer',
    title: '… met 1 m³ buffer',
    shortTitle: '10 woningen · 1 m³ buffer',
    group: 'multi',
    description:
      'Eén kuub buffer: de warmtepomp wordt kleiner (75 in plaats van 80 kW), de piek aan de meter zakt van 25,7 naar 21,8 kW en de uren boven de WP-limiet van zo’n 160 naar 15; 3×40 A past.',
    build: multiDwelling((i) => {
      i.buffer.volumeM3 = 1;
    }),
  },
  {
    id: 'kantoor-basis',
    title: 'Kantoor 100 kW, 3×80 A — zonder maatregelen',
    shortTitle: 'Kantoor 100 kW · zonder maatregelen',
    group: 'office',
    description:
      'De opstookpiek na het weekend bepaalt de warmtepomp; de WP-groep zit honderden uren boven de limiet.',
    build: office(() => undefined),
  },
  {
    id: 'kantoor-buffer',
    title: 'Kantoor 100 kW — 20 m³ buffer',
    shortTitle: 'Kantoor 100 kW · 20 m³ buffer',
    group: 'office',
    description:
      'Met 20 m³ buffer wordt de warmtepomp 127 in plaats van 206 kW, maar in de strenge winter van T1 zit de WP-groep nog 41 uur boven de limiet van 3×80 A bij 50 %.',
    build: office((i) => {
      i.buffer.volumeM3 = 20;
    }),
  },
  {
    id: 'kantoor-buffer-batterij',
    title: 'Kantoor 100 kW — 10 m³ buffer en 100 kWh batterij',
    shortTitle: 'Kantoor 100 kW · 10 m³ buffer + 100 kWh batterij',
    group: 'office',
    description:
      'Een kleinere buffer met een batterij: de batterij brengt de uren boven de limiet van 80 naar 32; voor 0 uur is zo’n 440 kWh nodig.',
    build: office((i) => {
      i.buffer.volumeM3 = 10;
      i.battery.capacityKwh = 100;
    }),
  },
  {
    id: 'kantoor-winter1979',
    title: 'Kantoor 100 kW — stresstest strenge winter 1978/79 met 20 m³ buffer',
    shortTitle: 'Kantoor 100 kW · stresstest 1978/79, 20 m³ buffer',
    group: 'office',
    description:
      'Het kantoor met 20 m³ buffer in de strenge winter van 1978/79 (≈ 1× per 25 jaar): zo’n 115 uur boven de limiet, tegen 41 in T1.',
    build: office((i) => {
      i.climateYear = 'winter1979';
      i.buffer.volumeM3 = 20;
    }),
  },
];

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
