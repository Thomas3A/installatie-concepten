// Elektrische aansluiting en WP-limiet (spec §5.5).
import {
  CONNECTIONS,
  findConnection,
  LARGE_CONNECTION_ID,
  LARGE_CONNECTION_LABEL,
} from '../data/connections';
import type { GridConnection } from './types';

/** Aansluitvermogen [kW]: standaardlijst of gecontracteerd vermogen. */
export function connectionPowerKw(grid: Pick<GridConnection, 'connection' | 'contractedKw'>): number {
  if (grid.connection === LARGE_CONNECTION_ID) return grid.contractedKw;
  return findConnection(grid.connection)?.powerKw ?? NaN;
}

/** P_limiet = P_aansluiting · aandeel; Infinity als er geen (eindige) limiet is. */
export function limitFromConnection(connectionKw: number, share: number): number {
  return share > 0 && Number.isFinite(connectionKw) ? connectionKw * share : Infinity;
}

export function gridLimitKw(grid: GridConnection): number {
  return limitFromConnection(connectionPowerKw(grid), grid.heatPumpShare);
}

/** Label van de aansluiting, bijv. "1×35 A" of "Grootverbruik 100 kW". */
export function connectionLabel(grid: Pick<GridConnection, 'connection' | 'contractedKw'>): string {
  if (grid.connection === LARGE_CONNECTION_ID) return LARGE_CONNECTION_LABEL;
  return findConnection(grid.connection)?.label ?? grid.connection;
}

/** De twee standaardaansluitingen rond een vermogen (voor de referentielijnen in de grafieken). */
export function neighbourConnections(connectionKw: number): {
  below?: (typeof CONNECTIONS)[number];
  above?: (typeof CONNECTIONS)[number];
} {
  let below: (typeof CONNECTIONS)[number] | undefined;
  let above: (typeof CONNECTIONS)[number] | undefined;
  for (const c of CONNECTIONS) {
    if (c.powerKw < connectionKw - 1e-9) below = c;
    else if (c.powerKw > connectionKw + 1e-9 && !above) above = c;
  }
  return { below, above };
}
