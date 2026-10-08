// Standaardwaarden van de invoer (§4).
// waarden uit leveranciersdocumentatie, geanonimiseerd

export const DEFAULTS = {
  floorArea: 40,
  heatLoss: 1000,
  coolLoad: 1100,
  mass: 'middel',
  rh: 50,
  tSupplyCool: 16,
  tSupplyHeat: 35,
  dtCool: 3,
  dtHeat: 5,
  setHeat: 21,
  setCool: 24,
  panelSize: '600x1200',
  pitch: 75,
  tube: '8x0.5',
  valveCount: 1,
  dpAvailable: 30,
  dpMax: 25,
  dewProtection: true,
  Kp: 0.6,
  Ti: 900,
  flowChar: 'gelijkprocentig',
  speed: 60,
} as const;

export const VALVE_DEFAULTS = {
  type: 'B',
  dn: 15,
  panelCount: 28,
  vmaxKoelen: 400,
  vmaxVerwarmen: 320,
  dtMinKoelen: 2,
  dtMinVerwarmen: 3,
  distPipe: '20x2',
  distanceFirst: 1.0,
  spacing: 1.2,
  layout: 'direct',
} as const;
