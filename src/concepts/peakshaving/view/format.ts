// Getalnotatie van de werkbank (UX-plan §4.1): kW onder 20 met 2 decimalen, daarboven met 1.

/**
 * Decimalen voor kW-waarden rond een limiet: < 20 kW twee, anders één. Alle kW-getallen in één zin krijgen de
 * decimalen van de limiet, zodat "tot 18,6 kW" naast "limiet 27,7 kW" staat en "2,18 kW" naast "19,40 kW".
 */
export function kwDigitsFor(refKw: number): number {
  return Number.isFinite(refKw) && Math.abs(refKw) < 20 ? 2 : 1;
}

/** Naar boven afronden op een stap (de stap van een schuif), zonder zwevendekommaruis: 0,527 → 1,0 bij stap 0,5. */
export function ceilToStep(x: number, step: number): number {
  if (!Number.isFinite(x)) return x;
  if (!(step > 0)) return x;
  return Number((Math.ceil(x / step - 1e-9) * step).toFixed(9));
}

/**
 * Batterij uit het gevoeligheidsraster als waarde van de schuif. Het raster rekent met fracties van E_max, die niet
 * altijd op de schuifstap liggen (0,25 × 15 kWh = 3,75 kWh bij stap 0,5). Naar boven afgerond op de stap: meer
 * capaciteit (bij 0,5 C ook meer vermogen) verlaagt de piek alleen maar, dus de belofte van het rasterpunt blijft
 * gelden. Valt de afgeronde waarde buiten de schuif, dan de exacte rasterwaarde (die ligt altijd binnen E_max).
 */
export function batteryOnStep(
  capacityKwh: number,
  ranges: { batteryStepKwh: number; batteryMaxKwh: number },
): number {
  const e = ceilToStep(capacityKwh, ranges.batteryStepKwh);
  return e <= ranges.batteryMaxKwh + 1e-9 ? e : capacityKwh;
}

/** Buffervolume van een rasterpunt als nette invoerwaarde (0,15 × 4 = 0,6000000000000001 → 0,6). */
export function cleanVolume(v: number): number {
  return Number(v.toFixed(6));
}
