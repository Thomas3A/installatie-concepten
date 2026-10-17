// Gedeelde typen van de pure weergavelaag (view/**): geen React, geen DOM.

/** Invoerveld (of groep velden) waar een chip, knop of melding naartoe springt. */
export type FieldKey =
  | 'kind'
  | 'dwellings'
  | 'designLoad'
  | 'emitter'
  | 'dhw'
  | 'useHours'
  | 'nightSetback'
  | 'connection'
  | 'share'
  | 'climate'
  | 'mass'
  | 'designTemps'
  | 'dhwDetails'
  | 'heatPumpMore'
  | 'allowedHours'
  | 'sizing'
  | 'buffer'
  | 'battery'
  | 'connectionStepper';

/** Hendel in Wat als?: het enige soort doel van een knop bij het oordeel of een hendel (Fix.target). */
export type WhatIfFieldKey = Extract<FieldKey, 'sizing' | 'buffer' | 'battery' | 'connectionStepper'>;

/**
 * Velden in Wat als? (alle andere staan in de Basis of in Meer instellingen). Let op: 'connection' is het veld
 * Aansluitwaarde in de Basis; de aansluitingsstapper in Wat als? heet 'connectionStepper'. Een knop die de aansluiting
 * zet, geeft de focus aan de stapper en klapt de Basis dus niet open.
 */
export const WHATIF_FIELDS: readonly WhatIfFieldKey[] = ['sizing', 'buffer', 'battery', 'connectionStepper'];

/** Staat dit veld in Wat als? (dan blijft de Basis bij het tonen zoals hij is)? */
export function isWhatIfField(target: FieldKey): target is WhatIfFieldKey {
  return (WHATIF_FIELDS as readonly FieldKey[]).includes(target);
}

/**
 * Velden in Meer instellingen (de Basis klapt open en daarna Meer instellingen). Let op: 'dhw' (het vinkje Warm
 * tapwater) staat bij kantoor ook in Meer instellingen › Tapwater, bij woningen in de Basis.
 */
export const MORE_SETTINGS_FIELDS: readonly FieldKey[] = [
  'climate',
  'mass',
  'designTemps',
  'dhwDetails',
  'heatPumpMore',
  'allowedHours',
];
