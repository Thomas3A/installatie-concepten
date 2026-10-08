// Plafondkarakteristiek en thermische constanten.
// waarden uit leveranciersdocumentatie, geanonimiseerd

export type Pitch = 75 | 100 | 150;
export type PanelSize = '600x1200' | '600x600';

export const PANEL_SIZES: Record<PanelSize, { L: number; B: number; label: string }> = {
  '600x1200': { L: 1.2, B: 0.6, label: '600 × 1200 mm' },
  '600x600': { L: 0.6, B: 0.6, label: '600 × 600 mm' },
};

export const PITCHES: Pitch[] = [75, 100, 150];

/** Randafstand tot de buitenste meanderbenen (m). */
export const EDGE_SIDE = 0.05;
/** Lengte van de aansluitstukjes per paneel (m): 2 × 0,10 m, een aan elke korte zijde. */
export const STUB_LENGTH = 0.2;
/** Maximale lengte van een thermisch segment (m). */
export const SEG_LENGTH = 0.25;

export const CEILING_DEFAULTS = {
  charKoelen: { K: 9.6, n: 1.05 },
  charVerwarmen: { K: 6.1, n: 1.1 },
  fs: { 75: 1.05, 100: 1.0, 150: 0.9 } as Record<Pitch, number>,
  rCond: 0.01, // m²·K/W
  reRef: 4000,
  cPanel: 5, // kJ/(m²·K) actief oppervlak
};
