/** Nusselt in een ronde buis: laminair 3,66, Gnielinski turbulent, lineaire overgang tussen Re 2300 en 10 000. */
export function nusseltGnielinski(Re: number, Pr: number): number {
  const f = (0.79 * Math.log(Re) - 1.64) ** -2;
  const f8 = f / 8;
  return (f8 * (Re - 1000) * Pr) / (1 + 12.7 * Math.sqrt(f8) * (Pr ** (2 / 3) - 1));
}

export const NU_LAMINAR = 3.66;

export function nusselt(Re: number, Pr: number): number {
  if (Re <= 2300) return NU_LAMINAR;
  if (Re >= 10000) return nusseltGnielinski(Re, Pr);
  const gamma = (Re - 2300) / (10000 - 2300);
  return (1 - gamma) * NU_LAMINAR + gamma * nusseltGnielinski(10000, Pr);
}
