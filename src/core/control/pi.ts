export interface PiState {
  I: number;
}

export interface PiParams {
  Kp: number; // 1/K
  Ti: number; // s
}

/**
 * PI-regelaar met anti-windup (conditionele integratie).
 * e > 0 betekent: er is vraag. Retourneert nieuwe toestand en de vraag 0..1.
 */
export function piStep(state: PiState, e: number, p: PiParams, dt: number): { state: PiState; u: number } {
  const raw = p.Kp * e + state.I;
  const pushingHigh = raw >= 1 && e > 0;
  const pushingLow = raw <= 0 && e < 0;
  let I = state.I;
  if (!pushingHigh && !pushingLow) I += (p.Kp * e * dt) / p.Ti;
  I = Math.min(Math.max(I, -1), 2);
  const u = Math.min(Math.max(p.Kp * e + I, 0), 1);
  return { state: { I }, u };
}
