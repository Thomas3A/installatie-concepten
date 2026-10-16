// Tapwaterprofiel woning (spec §5.7): fractie van het dagverbruik per uur (MET), wordt genormaliseerd op som 1.

export const DHW_PROFILE: readonly number[] = [
  0.005, 0.003, 0.002, 0.002, 0.005, 0.02, 0.07, 0.12, 0.1, 0.05, 0.04, 0.035, 0.035, 0.03, 0.03, 0.03, 0.04,
  0.06, 0.09, 0.09, 0.06, 0.04, 0.025, 0.012,
];

export const DHW_PROFILE_SUM = DHW_PROFILE.reduce((a, b) => a + b, 0);

/** Temperatuur van het koude leidingwater [°C]. */
export const COLD_WATER_C = 10;
/** Benutbaar deel van de boilerinhoud. */
export const TANK_USABLE_FRACTION = 0.85;
/** Boiler gaat in laadbedrijf onder deze vulgraad (hysterese tot vol). */
export const TANK_RECHARGE_BELOW = 0.5;
