// Stofwaarden van water, T in °C (geldig 0–100 °C). SI-uitvoer.

export const rho = (T: number): number =>
  1000 * (1 - ((T + 288.9414) / (508929.2 * (T + 68.12963))) * (T - 3.9863) ** 2); // kg/m³

export const cp = (T: number): number =>
  4217.4 - 3.720283 * T + 0.1412855 * T ** 2 - 2.654387e-3 * T ** 3 + 2.093236e-5 * T ** 4; // J/(kg·K)

export const mu = (T: number): number => 2.414e-5 * 10 ** (247.8 / (T + 133.15)); // Pa·s

export const lambda = (T: number): number => 0.565 + 0.00185 * T - 7.5e-6 * T ** 2; // W/(m·K)

export const prandtl = (T: number): number => (mu(T) * cp(T)) / lambda(T);

export interface WaterProps {
  rho: number;
  cp: number;
  mu: number;
  lambda: number;
  Pr: number;
}

export function water(T: number): WaterProps {
  const m = mu(T);
  const c = cp(T);
  const l = lambda(T);
  return { rho: rho(T), cp: c, mu: m, lambda: l, Pr: (m * c) / l };
}
