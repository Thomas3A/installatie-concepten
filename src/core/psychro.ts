// Dauwpunt volgens Magnus (T in °C, RV in %).
export function dewPoint(T: number, RH: number): number {
  const gamma = Math.log(Math.max(RH, 0.1) / 100) + (17.62 * T) / (243.12 + T);
  return (243.12 * gamma) / (17.62 - gamma);
}
