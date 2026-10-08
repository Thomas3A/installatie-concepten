// Ruimtemodel: één luchtknoop per zone, lastmodel en operatieve temperatuur (§5.10).
import type { KlimaatplafondConfig, Mode } from './config';
import { MASS_KJ } from './config';

export interface ZoneRoom {
  /** zonevloeroppervlak (m²) */
  area: number;
  /** warmtecapaciteit (J/K) */
  C: number;
  loadHeat: number;
  loadCool: number;
  /** paneelbezetting: panelen·A/A_zone */
  occupancy: number;
}

export function zoneRoom(cfg: KlimaatplafondConfig, share: number, panels: number, panelArea: number): ZoneRoom {
  const area = cfg.floorArea * share;
  return {
    area,
    C: MASS_KJ[cfg.mass] * 1000 * area,
    loadHeat: cfg.heatLoss * share,
    loadCool: cfg.coolLoad * share,
    occupancy: area > 0 ? (panels * panelArea) / area : 0,
  };
}

/** Last op de ruimte (W); positief = warmtewinst. Volgt de laatst actieve modus. */
export function loadPower(cfg: KlimaatplafondConfig, z: ZoneRoom, mode: Mode, tAir: number): number {
  if (mode === 'verwarmen') {
    const H = z.loadHeat / (cfg.setHeat - cfg.advanced.tOutDesign);
    return -z.loadHeat - H * (tAir - cfg.setHeat);
  }
  const H = cfg.advanced.hK * z.area;
  return z.loadCool - H * (tAir - cfg.setCool);
}

/** Operatieve temperatuur (indicatief). */
export function operativeTemp(tAir: number, tOppMean: number, occupancy: number): number {
  const F = 0.35 * Math.min(1, occupancy);
  const tMrt = tAir + F * (tOppMean - tAir);
  return 0.5 * (tAir + tMrt);
}
