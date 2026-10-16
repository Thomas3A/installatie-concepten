// Concept-registry. Een nieuw concept = een map onder concepts/ plus één regel hieronder.
import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export type ConceptStatus = 'actief' | 'binnenkort';

export interface ConceptDef {
  id: string;
  titel: string;
  beschrijving: string;
  status: ConceptStatus;
  route: string;
  component?: LazyExoticComponent<ComponentType>;
  /** extra zin in de footer-disclaimer op de pagina's van dit concept */
  disclaimer?: string;
}

export const CONCEPTS: ConceptDef[] = [
  {
    id: 'klimaatplafond',
    titel: 'Klimaatplafond met 6-weg-klep',
    beschrijving:
      'Open kantoor met metalen plafondpanelen en koperen meanderactivering op één tot drie 6-weg-kleppen in een 4-pijpssysteem. Puzzel: serie versus parallel, debiet, drukval en ongelijke verdeling zonder inregeling.',
    status: 'actief',
    route: '/klimaatplafond',
    component: lazy(() => import('./klimaatplafond/ui/KlimaatplafondPage')),
  },
  {
    id: 'peakshaving',
    titel: 'Peakshaving warmtepomp met buffer en batterij',
    beschrijving:
      'Hoeveel buffervat en batterij zijn nodig om met een lucht/water-warmtepomp binnen de elektrische aansluiting te blijven? Uursimulatie met referentiejaren.',
    status: 'actief',
    route: '/peakshaving',
    component: lazy(() => import('./peakshaving/ui/PeakshavingPage')),
    disclaimer:
      'Klimaatdata: KNMI De Bilt (open data); referentiejaren zijn een reconstructie, geen officiële NEN 5060-data.',
  },
  {
    id: 'vloer',
    titel: 'Vloerverwarming/-koeling',
    beschrijving:
      'Lage-temperatuursysteem in de dekvloer: lusverdeling, regeling per ruimte en vloeroppervlaktetemperatuur.',
    status: 'binnenkort',
    route: '/vloer',
  },
  {
    id: 'bka',
    titel: 'Betonkernactivering',
    beschrijving:
      'Thermische massa als buffer: trage regeling, grote watertemperatuurwindows en piekverschuiving.',
    status: 'binnenkort',
    route: '/bka',
  },
  {
    id: 'fancoil',
    titel: 'Ventilatorconvector (4-pijps)',
    beschrijving: 'Lokale unit met koel- en warmwaterbatterij, ventilatorstanden en condensafvoer.',
    status: 'binnenkort',
    route: '/fancoil',
  },
  {
    id: 'koelbalk',
    titel: 'Actieve koelbalk',
    beschrijving: 'Geïnduceerde luchtstroom over een waterbatterij, gecombineerd met de ventilatielucht.',
    status: 'binnenkort',
    route: '/koelbalk',
  },
];
