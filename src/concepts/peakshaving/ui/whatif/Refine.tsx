// Wat als? › Verfijnen (UX-plan §5.3, B8): WP-vermogen automatisch of handmatig, laadstrategie van de buffer en het
// batterijvermogen. Velden en labels ongewijzigd uit de oude panelen Warmtepomp & afgifte en Maatregelen.
import { fmt } from '../../../../core/format';
import { CheckField, SegField } from '../../../../ui/fields';
import {
  BATTERY_C_RATE_MAX,
  BATTERY_C_RATE_MIN,
  BATTERY_DEFAULT_C_RATE,
  batteryPower,
} from '../../model/battery';
import type { Battery, BufferStrategy, HeatPump, SizingMode, ThermalBuffer } from '../../model/types';
import { useStore } from '../../store';
import { HELP, UI_LABELS, WHATIF_TEXTS } from '../../texts';
import { refineChanged } from '../../view/settingsDiff';
import { RangeField } from '../inputs/controls';
import { batteryCRate } from './BatteryLever';
import css from './WhatIf.module.css';

// TODO(texts): labels en opties van Verfijnen, ongewijzigd uit de oude panelen (HeatPumpPanel, MeasuresPanel)
export const REFINE_TEXTS = {
  sizing: 'WP-vermogen',
  sizingOptions: { auto: 'Automatisch', manual: 'Handmatig' },
  nominal: 'WP-vermogen (A7/W35)',
  nominalUnit: 'kW th',
  strategy: 'Laadstrategie buffer',
  strategyOptions: { predictive: 'Voorspellend', always: 'Altijd' },
  batteryAuto: 'Batterijvermogen automatisch (0,5 C)',
  batteryCRate: 'Batterijvermogen (C-waarde)',
  batteryPowerHint: (kw: number): string => `= ${fmt(kw, 1)} kW laden/ontladen`,
} as const;

export function Refine() {
  const input = useStore((st) => st.input);
  const ranges = useStore((st) => st.ranges);
  const sized = useStore((st) => st.analysis?.sizing.withBuffer ?? null);
  const nominalUsed = useStore((st) => st.analysis?.nominalKw ?? null);
  const update = useStore((st) => st.update);
  const hp = input.heatPump;
  const battery = input.battery;
  const designLoad = input.building.designLoadKw;
  const changed = refineChanged(input);
  const cRate = batteryCRate(battery);

  const patchHp = (x: Partial<HeatPump>): void =>
    update((i) => ({ ...i, heatPump: { ...i.heatPump, ...x } }));
  const patchBuf = (x: Partial<ThermalBuffer>): void =>
    update((i) => ({ ...i, buffer: { ...i.buffer, ...x } }));
  const patchBat = (x: Partial<Battery>): void => update((i) => ({ ...i, battery: { ...i.battery, ...x } }));

  return (
    <details className={`${css.refine} noPrint`}>
      <summary>
        {UI_LABELS.refine} ·{' '}
        <span className={`${css.badge} ${changed > 0 ? css.badgeChanged : ''}`}>
          {changed > 0 ? UI_LABELS.changed(changed) : UI_LABELS.refineDefault}
        </span>
      </summary>
      <div className={css.refineBody}>
        <div className={css.stack} data-field="sizing">
          <SegField<SizingMode>
            label={REFINE_TEXTS.sizing}
            info={HELP.sizing}
            value={hp.sizingMode}
            options={[
              { value: 'auto', label: REFINE_TEXTS.sizingOptions.auto },
              { value: 'manual', label: REFINE_TEXTS.sizingOptions.manual },
            ]}
            onChange={(sizingMode) =>
              // handmatig begint bij het vermogen dat nu gebruikt wordt
              patchHp(
                sizingMode === 'manual' && nominalUsed !== null && Number.isFinite(nominalUsed)
                  ? { sizingMode, nominalKw: Math.round(nominalUsed * 10) / 10 }
                  : { sizingMode },
              )
            }
          />
          {hp.sizingMode === 'manual' && (
            <RangeField
              label={REFINE_TEXTS.nominal}
              value={hp.nominalKw}
              min={ranges.heatPumpMinKw}
              max={ranges.heatPumpMaxKw}
              step={designLoad >= 50 ? 1 : 0.1}
              digits={1}
              unit={REFINE_TEXTS.nominalUnit}
              hint={
                sized === null ? undefined : WHATIF_TEXTS.refineSizingHint(hp.nominalKw / designLoad, sized)
              }
              onChange={(nominalKw) => patchHp({ nominalKw })}
            />
          )}
        </div>
        <SegField<BufferStrategy>
          label={REFINE_TEXTS.strategy}
          info={HELP.strategy}
          value={input.buffer.strategy}
          options={[
            { value: 'predictive', label: REFINE_TEXTS.strategyOptions.predictive },
            { value: 'always', label: REFINE_TEXTS.strategyOptions.always },
          ]}
          onChange={(strategy) => patchBuf({ strategy })}
        />
        <div className={css.stack}>
          <CheckField
            label={REFINE_TEXTS.batteryAuto}
            info={HELP.batteryPower}
            checked={battery.powerKw === null}
            onChange={(auto) =>
              patchBat({ powerKw: auto ? null : BATTERY_DEFAULT_C_RATE * battery.capacityKwh })
            }
          />
          {battery.powerKw !== null && (
            <RangeField
              label={REFINE_TEXTS.batteryCRate}
              value={cRate}
              min={BATTERY_C_RATE_MIN}
              max={BATTERY_C_RATE_MAX}
              step={0.05}
              digits={2}
              unit="C"
              disabled={battery.capacityKwh <= 0}
              hint={REFINE_TEXTS.batteryPowerHint(batteryPower(battery))}
              onChange={(c) => patchBat({ powerKw: c * battery.capacityKwh })}
            />
          )}
        </div>
      </div>
    </details>
  );
}
