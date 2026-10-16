// Pass 1: ideale warmtevraag Q_ideal(t) met onbegrensde levering (spec §5.6, port van ideale_vraag).
import {
  buildingCapacity,
  buildingUA,
  buildSchedule,
  envelopeAlpha,
  HOURS_PER_YEAR,
  WARMUP_HOURS,
  type Schedule,
} from './building';
import type { Building, ClimateYear } from './types';

/**
 * Onbegrensde warmtelevering: T_i volgt het setpoint, alleen het opwarmvermogen is begrensd
 * (boostFraction · designLoadKw). Eerst een week inregelen (cyclisch, laatste week van het jaar).
 */
export function computeIdealDemand(b: Building, climate: ClimateYear, schedule?: Schedule): Float64Array {
  const sch = schedule ?? buildSchedule(b, climate.startWeekday);
  const UA = buildingUA(b);
  const C = buildingCapacity(b);
  const alpha = envelopeAlpha(b);
  const boostMax = b.boostFraction * b.designLoadKw;
  const T = climate.T;
  const out = new Float64Array(HOURS_PER_YEAR);
  let Tef = T[HOURS_PER_YEAR - WARMUP_HOURS];
  let Ti = b.setpointUseC;
  for (let h = -WARMUP_HOURS; h < HOURS_PER_YEAR; h++) {
    const t = h < 0 ? h + HOURS_PER_YEAR : h;
    Tef += alpha * (T[t] - Tef);
    const Tset = sch.setpoint[t];
    const g = sch.gains[t];
    const qSteady = UA * (Ti - Tef) - g;
    const qReq = Math.max(0, qSteady + Math.min(C * (Tset - Ti), boostMax));
    Ti += (qReq - UA * (Ti - Tef) + g) / C;
    if (h >= 0) out[t] = qReq;
  }
  return out;
}
