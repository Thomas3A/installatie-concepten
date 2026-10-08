// Bereiken van de invoer (§4) en standaard-grenswaarden voor de meldingen (§6).
// waarden uit leveranciersdocumentatie, geanonimiseerd

export const LIMITS = {
  floorArea: { min: 10, max: 500, step: 1 },
  heatLoss: { min: 0, max: 20000, step: 50 },
  coolLoad: { min: 0, max: 20000, step: 50 },
  rh: { min: 30, max: 70, step: 1 },
  startTemp: { min: 10, max: 30, step: 0.5 },
  tSupplyCool: { min: 14, max: 18, step: 0.5 },
  tSupplyHeat: { min: 28, max: 40, step: 0.5 },
  dtCool: { min: 1.5, max: 5, step: 0.5 },
  dtHeat: { min: 2, max: 10, step: 0.5 },
  setHeat: { min: 19, max: 22, step: 0.5 },
  setCool: { min: 23, max: 26, step: 0.5 },
  dpAvailable: { min: 10, max: 60, step: 1 },
  dpMax: { min: 10, max: 40, step: 1 },
  panelCount: { min: 1, max: 64, step: 1 },
  maxStrands: 16,
  maxPanelsPerStrand: 16,
  extraLength: { min: 0, max: 10, step: 0.5 },
  vmax: { min: 10, max: 3000, step: 5 },
  dtMinCool: { min: 0.5, max: 5, step: 0.5 },
  dtMinHeat: { min: 0.5, max: 10, step: 0.5 },
  distanceFirst: { min: 0.5, max: 10, step: 0.5 },
  spacing: { min: 0.6, max: 3, step: 0.1 },
  Kp: { min: 0.1, max: 2, step: 0.1 },
  Ti: { min: 60, max: 3600, step: 60 },
} as const;

export interface CheckLimits {
  /** Minimale/maximale stroomsnelheid (m/s) */
  vMin: number;
  vMax: number;
  /** Re-grenzen laminair/overgang */
  reLaminar: number;
  reTransition: number;
  /** Minimale ΔT (K) */
  dtMinCool: number;
  dtMinHeat: number;
  /** W07: |T_ret − T_ruimte| onder deze waarde (K) */
  exhaustedDt: number;
  /** W08: afwijking verdeling */
  maldistWarn: number;
  maldistInfo: number;
  /** W09: marge boven dauwpunt (K) */
  dewMargin: number;
  /** W10: max gemiddelde plafondtemperatuur bij verwarmen (°C) */
  ceilingMaxHeat: number;
  /** W12: Kv_nodig/Kvs onder deze waarde */
  kvRatioMin: number;
  /** W02: haalbaar debiet onder deze fractie van Vmax */
  feasibleFraction: number;
  /** W16: max Δp over de klep (kPa) */
  maxDpB: number;
  maxDpA: number;
  /** I02: bezettingsgraad */
  occupancy: number;
}

export const DEFAULT_CHECK_LIMITS: CheckLimits = {
  vMin: 0.25,
  vMax: 1.0,
  reLaminar: 2300,
  reTransition: 4000,
  dtMinCool: 2,
  dtMinHeat: 3,
  exhaustedDt: 1,
  maldistWarn: 0.15,
  maldistInfo: 0.05,
  dewMargin: 1,
  ceilingMaxHeat: 35,
  kvRatioMin: 0.3,
  feasibleFraction: 0.98,
  maxDpB: 110,
  maxDpA: 600,
  occupancy: 0.8,
};
