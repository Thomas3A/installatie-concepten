// Buisdata. Binnendiameters en ruwheden in meters.
// waarden uit leveranciersdocumentatie, geanonimiseerd

export interface PipeSpec {
  id: string;
  label: string;
  /** Binnendiameter in m */
  di: number;
  /** Absolute ruwheid in m */
  eps: number;
}

export const COPPER_EPS = 0.0015e-3; // m
export const MULTILAYER_EPS = 0.007e-3; // m

export const COPPER_TUBES: PipeSpec[] = [
  { id: '8x0.5', label: 'Cu 8×0,5 (Di 7,0)', di: 0.007, eps: COPPER_EPS },
  { id: '10x0.5', label: 'Cu 10×0,5 (Di 9,0)', di: 0.009, eps: COPPER_EPS },
  { id: '12x0.6', label: 'Cu 12×0,6 (Di 10,8)', di: 0.0108, eps: COPPER_EPS },
];

export const DIST_PIPES: PipeSpec[] = [
  { id: '16x2', label: 'Meerlagenbuis 16×2 (Di 12)', di: 0.012, eps: MULTILAYER_EPS },
  { id: '20x2', label: 'Meerlagenbuis 20×2 (Di 16)', di: 0.016, eps: MULTILAYER_EPS },
  { id: '26x3', label: 'Meerlagenbuis 26×3 (Di 20)', di: 0.02, eps: MULTILAYER_EPS },
];

export type CopperTubeId = '8x0.5' | '10x0.5' | '12x0.6';
export type DistPipeId = '16x2' | '20x2' | '26x3';

export const copperTube = (id: CopperTubeId): PipeSpec => COPPER_TUBES.find((t) => t.id === id) ?? COPPER_TUBES[0];
export const distPipe = (id: DistPipeId): PipeSpec => DIST_PIPES.find((t) => t.id === id) ?? DIST_PIPES[1];
