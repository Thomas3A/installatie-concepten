// Badges "Meer instellingen · {n} aangepast" en "Verfijnen · {n} aangepast" (UX-plan §3.2, §5.3): hoeveel velden
// afwijken van de standaard van de gebouwfunctie. Puur.
import {
  DEFAULT_MULTI_DHW_KWH_PER_DWELLING,
  DEFAULT_MULTI_TANK_L_PER_DWELLING,
  defaultInputOfKind,
} from '../data/defaults';
import { DEFAULT_CLIMATE_YEAR } from '../model/climate';
import { buildingKind, normalizeInput } from '../model/input';
import type { BuildingKind, PeakshavingInput } from '../model/types';

const near = (a: number, b: number): boolean =>
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * Tapwater per woning dat het vinkje Warm tapwater invult als er nog geen boilervat is: woning 10 kWh/dag en 200 l,
 * appartement 6 kWh/dag en 120 l, kantoor 20 kWh/dag en 500 l (zoals het vinkje in de invoer nu doet).
 */
export function dhwOnDefaults(kind: BuildingKind): { dailyKwh: number; tankLitre: number } {
  if (kind === 'office') return { dailyKwh: 20, tankLitre: 500 };
  if (kind === 'multi')
    return { dailyKwh: DEFAULT_MULTI_DHW_KWH_PER_DWELLING, tankLitre: DEFAULT_MULTI_TANK_L_PER_DWELLING };
  return { dailyKwh: 10, tankLitre: 200 };
}

/**
 * Aantal aangepaste velden in Meer instellingen: klimaatjaar, gebouw (massa, ontwerptemperaturen, setpoints,
 * stookgrens, gevel, opwarmfactor, bij kantoor de opstooktijd), tapwater (bij kantoor ook het vinkje; de getallen
 * alleen als tapwater aan staat, bij meerdere woningen per woning), warmtepomp en beoordeling. Een waarde die alleen
 * door een begrenzing meeschuift (verlaagd setpoint, stookgrens, boilertemperatuur) telt niet dubbel.
 */
export function moreSettingsChanged(input: PeakshavingInput): number {
  const kind = buildingKind(input.building);
  const def = normalizeInput(defaultInputOfKind(kind));
  const b = input.building;
  const db = def.building;
  let n = 0;
  const count = (changed: boolean): void => {
    if (changed) n++;
  };
  const diff = (x: number, y: number): void => count(!near(x, y));

  // Klimaat
  count(input.climateYear !== DEFAULT_CLIMATE_YEAR);

  // Gebouw
  diff(b.timeConstantH, db.timeConstantH);
  diff(b.designOutdoorC, db.designOutdoorC);
  diff(b.designIndoorC, db.designIndoorC);
  diff(b.setpointUseC, db.setpointUseC);
  diff(b.setpointSetbackC, Math.min(db.setpointSetbackC, b.setpointUseC));
  diff(b.balanceTempC, Math.min(db.balanceTempC, b.setpointUseC));
  diff(b.envelopeLagH, db.envelopeLagH);
  diff(b.boostFraction, db.boostFraction);
  if (kind === 'office') diff(b.preheatH, db.preheatH);

  // Tapwater
  if (kind === 'office') count(b.dhw.enabled !== db.dhw.enabled);
  if (b.dhw.enabled) {
    const ref = dhwOnDefaults(kind);
    const per = kind === 'multi' ? b.dwellings : 1;
    diff(b.dhw.dailyKwh / per, ref.dailyKwh);
    diff(b.dhw.tankLitre / per, ref.tankLitre);
    diff(b.dhw.tankTempC, Math.min(db.dhw.tankTempC, input.heatPump.maxSupplyC));
  }

  // Warmtepomp
  const hp = input.heatPump;
  const dhp = def.heatPump;
  diff(hp.maxSupplyC, dhp.maxSupplyC);
  diff(hp.backupHeaterKw, dhp.backupHeaterKw);
  diff(hp.carnotEfficiency, dhp.carnotEfficiency);

  // Beoordeling
  diff(input.grid.allowedExceedanceH, def.grid.allowedExceedanceH);
  diff(input.grid.allowedComfortLossH, def.grid.allowedComfortLossH);
  return n;
}

/** Aantal aangepaste keuzes in Verfijnen: handmatig WP-vermogen, laadstrategie, handmatig batterijvermogen. */
export function refineChanged(input: PeakshavingInput): number {
  let n = 0;
  if (input.heatPump.sizingMode !== 'auto') n++;
  if (input.buffer.strategy !== 'predictive') n++;
  if (input.battery.powerKw !== null) n++;
  return n;
}
