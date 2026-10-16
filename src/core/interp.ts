// Stuksgewijs lineaire interpolatie in een tabel met oplopende x, buiten het bereik geklemd.

export type Table = readonly (readonly [number, number])[];

/** y(x) uit een tabel [(x0, y0), (x1, y1), …]; onder x0 → y0, boven de laatste x → laatste y. */
export function interpolate(table: Table, x: number): number {
  const n = table.length;
  if (x <= table[0][0]) return table[0][1];
  if (x >= table[n - 1][0]) return table[n - 1][1];
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = table[i];
    const [x1, y1] = table[i + 1];
    if (x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return table[n - 1][1];
}

/** Klem x op [lo, hi]. */
export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi);
}
