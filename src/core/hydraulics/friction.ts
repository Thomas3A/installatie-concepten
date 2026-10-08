import { mu as muW, rho as rhoW } from '../water';

/** Churchill-wrijvingsfactor (Darcy), continu over laminair, overgang en turbulent. */
export function churchill(Re: number, relRough: number): number {
  if (Re < 50) return 64 / Math.max(Re, 1e-9); // puur laminair, Churchill levert hier 64/Re
  const A = (2.457 * Math.log(1 / ((7 / Re) ** 0.9 + 0.27 * relRough))) ** 16;
  const B = (37530 / Re) ** 16;
  return 8 * ((8 / Re) ** 12 + (A + B) ** -1.5) ** (1 / 12);
}

/** Reynoldsgetal in een ronde buis. q in m³/s, d in m, T in °C. */
export function reynolds(q: number, d: number, T: number): number {
  return (4 * rhoW(T) * Math.abs(q)) / (Math.PI * d * muW(T));
}

/** Stroomsnelheid in m/s. */
export const velocity = (q: number, d: number): number => (4 * Math.abs(q)) / (Math.PI * d * d);

export interface PipeDpArgs {
  q: number; // m³/s
  d: number; // binnendiameter m
  len: number; // m
  eps: number; // ruwheid m
  T: number; // °C
  zeta?: number; // som verliescoëfficiënten
}

/** Drukval Δp = (f·L/D + Σζ)·ρv²/2 in Pa. Oneven in q zodat solvers met negatieve waarden kunnen omgaan. */
export function pipeDp({ q, d, len, eps, T, zeta = 0 }: PipeDpArgs): number {
  const qa = Math.abs(q);
  if (qa < 1e-15) return 0;
  const Re = reynolds(qa, d, T);
  const f = churchill(Re, eps / d);
  const v = velocity(qa, d);
  const dp = (f * (len / d) + zeta) * 0.5 * rhoW(T) * v * v;
  return q < 0 ? -dp : dp;
}
