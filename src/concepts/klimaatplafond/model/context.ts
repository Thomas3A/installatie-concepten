// Gedeelde rekencontext, afgeleid uit de configuratie.
import { PANEL_SIZES } from '../data/ceiling';
import { copperTube, distPipe } from '../data/pipes';
import { MASS_KJ, type KlimaatplafondConfig, type Mode } from './config';
import { panelGeometry, type PanelGeometry } from './panel';

export interface ModeConditions {
  mode: Mode;
  /** Aanvoertemperatuur (°C) */
  tIn: number;
  /** Ruimtetemperatuur bij ontwerp = setpoint (°C) */
  tRoom: number;
  /** Ontwerp-ΔT (K) */
  dt: number;
  K: number;
  n: number;
}

export interface PlafondContext {
  geom: PanelGeometry;
  /** Binnendiameter paneelbuis en koppelslang (m) */
  di: number;
  epsTube: number;
  hoseLength: number;
  zetaHose: number;
  zetaBend: number;
  zetaT: number;
  fs: number;
  rCond: number;
  reRef: number;
  /** J/(m²·K) */
  cPanel: number;
  /** Kalibratiefactor strengdrukval in het netwerk */
  netFactor: number;
  /** Kalibratiefactor paneel-tijdconstante */
  tauFactor: number;
  conditions: Record<Mode, ModeConditions>;
}

export function buildContext(cfg: KlimaatplafondConfig): PlafondContext {
  const tube = copperTube(cfg.tube);
  const a = cfg.advanced;
  return {
    geom: panelGeometry(cfg.panelSize, cfg.pitch),
    di: tube.di,
    epsTube: a.epsCopper * 1e-3,
    hoseLength: a.hoseLength,
    zetaHose: a.zetaHose,
    zetaBend: a.zetaBend,
    zetaT: a.zetaT,
    fs: a.fs[cfg.pitch],
    rCond: a.rCond,
    reRef: a.reRef,
    cPanel: a.cPanel * 1000,
    netFactor: a.netFactor,
    tauFactor: a.tauFactor,
    conditions: {
      koelen: { mode: 'koelen', tIn: cfg.tSupplyCool, tRoom: cfg.setCool, dt: cfg.dtCool, ...a.charKoelen },
      verwarmen: {
        mode: 'verwarmen',
        tIn: cfg.tSupplyHeat,
        tRoom: cfg.setHeat,
        dt: cfg.dtHeat,
        ...a.charVerwarmen,
      },
    },
  };
}

export function distPipeSpec(id: string, cfg: KlimaatplafondConfig): { di: number; eps: number } {
  const p = distPipe(id as never);
  return { di: p.di, eps: cfg.advanced.epsMulti * 1e-3 };
}

export const cThermalPerM2 = (cfg: KlimaatplafondConfig): number => MASS_KJ[cfg.mass] * 1000; // J/(m²·K)
export const panelArea = (cfg: KlimaatplafondConfig): number => {
  const p = PANEL_SIZES[cfg.panelSize];
  return p.L * p.B;
};
