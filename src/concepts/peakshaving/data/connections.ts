// Standaardaansluitingen kleinverbruik (spec §5.5).
// P = 0,230·I (1-fase) of P = 0,400·√3·I (3-fase), cos φ = 1. Grootverbruik: gecontracteerd vermogen.

export type ConnectionId =
  | '1x25'
  | '1x35'
  | '1x40'
  | '3x25'
  | '3x35'
  | '3x40'
  | '3x50'
  | '3x63'
  | '3x80'
  | 'grootverbruik';

export interface ConnectionDef {
  id: Exclude<ConnectionId, 'grootverbruik'>;
  label: string;
  phases: 1 | 3;
  amps: number;
  /** aansluitvermogen [kW] */
  powerKw: number;
}

export const LARGE_CONNECTION_ID = 'grootverbruik' as const;
export const LARGE_CONNECTION_LABEL = 'Grootverbruik';

function def(phases: 1 | 3, amps: number): ConnectionDef {
  // zelfde rekenvolgorde als de Python-referentie (0,400·√3)·I
  const powerKw = phases === 1 ? 0.23 * amps : 0.4 * Math.sqrt(3) * amps;
  return {
    id: `${phases}x${amps}` as ConnectionDef['id'],
    label: `${phases}×${amps} A`,
    phases,
    amps,
    powerKw,
  };
}

/** Oplopend in vermogen; de volgorde is die van "kleinste passende aansluiting". */
export const CONNECTIONS: readonly ConnectionDef[] = [
  def(1, 25),
  def(1, 35),
  def(1, 40),
  def(3, 25),
  def(3, 35),
  def(3, 40),
  def(3, 50),
  def(3, 63),
  def(3, 80),
];

export function findConnection(id: ConnectionId): ConnectionDef | undefined {
  return CONNECTIONS.find((c) => c.id === id);
}
