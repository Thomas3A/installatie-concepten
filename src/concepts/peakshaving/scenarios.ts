// Scenario's: de acht van spec §10 plus twee met meerdere woningen op één warmtepomp (buiten de spec, zie
// docs/AANNAMES.md). Basis is steeds de standaardinvoer van de gekozen gebouwfunctie, plus de genoemde wijzigingen.
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
      'De warmtepomp wordt gedimensioneerd op de piek en komt zo’n honderd uur per jaar boven de WP-limiet van 3,2 kW.',
    build: residential(() => undefined),
  },
  {
    id: 'woning-buffer',
    title: '… met 0,5 m³ buffer',
    shortTitle: "Woning jaren '70 · 0,5 m³ buffer",
    group: 'single',
    description:
      'Een halve kuub buffer vangt de uurpieken op: de warmtepomp wordt kleiner en past binnen 1×35 A.',
    build: residential((i) => {
      i.buffer.volumeM3 = 0.5;
    }),
  },
  {
    id: 'woning-buffer-batterij',
    title: '… met 1 m³ buffer en 5 kWh batterij',
    shortTitle: "Woning jaren '70 · 1 m³ buffer + 5 kWh batterij",
    group: 'single',
    description: 'Buffer én batterij: de meterpiek zakt zo ver dat de woning naar 1×25 A kan.',
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
      'Verwarming plus het tapwater van tien woningen: de warmtepomp wordt zo’n 66 kW en zit ruim honderd uur per jaar boven de WP-limiet van 19,4 kW; pas 3×40 A past.',
    build: multiDwelling(() => undefined),
  },
  {
    id: 'woningen-buffer',
    title: '… met 1 m³ buffer',
    shortTitle: '10 woningen · 1 m³ buffer',
    group: 'multi',
    description:
      'Eén kuub buffer vangt het bijladen van de boiler (’s ochtends en ’s avonds) op: de piek aan de meter zakt van 21,6 naar 19,4 kW en past zonder overschrijding binnen 3×35 A.',
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
    description: 'Met 20 m³ buffer past het kantoor binnen 3×80 A bij een aandeel van 50 %.',
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
      'Een kleinere buffer met een batterij: de batterij schaaft de laatste uren overschrijding af.',
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
      'Het kantoor met 20 m³ buffer in de strenge winter van 1978/79 (≈ 1× per 25 jaar): hoe robuust is de keuze?',
    build: office((i) => {
      i.climateYear = 'winter1979';
      i.buffer.volumeM3 = 20;
    }),
  },
];

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
