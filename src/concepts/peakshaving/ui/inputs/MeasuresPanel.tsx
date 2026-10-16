// Blok 4 — Maatregelen: buffer, batterij en bedrijfsmodus (spec §3.4, §3.5).
import { fmt } from '../../../../core/format';
import { CheckField, SegField } from '../../../../ui/fields';
import {
  BATTERY_C_RATE_MAX,
  BATTERY_C_RATE_MIN,
  BATTERY_DEFAULT_C_RATE,
  batteryPower,
  batteryUsableEnergy,
} from '../../model/battery';
import { bufferHoursOfPeak } from '../../model/ranges';
import type { Battery, BufferStrategy, OperatingMode, ThermalBuffer } from '../../model/types';
import { useStore } from '../../store';
import { BLOCK_TITLES, HELP } from '../../texts';
import { Block, RangeField } from './controls';

export function MeasuresPanel() {
  const buffer = useStore((st) => st.input.buffer);
  const battery = useStore((st) => st.input.battery);
  const mode = useStore((st) => st.input.grid.mode);
  const designLoad = useStore((st) => st.input.building.designLoadKw);
  const r = useStore((st) => st.ranges);
  const update = useStore((st) => st.update);
  const patchBuf = (x: Partial<ThermalBuffer>): void =>
    update((i) => ({ ...i, buffer: { ...i.buffer, ...x } }));
  const patchBat = (x: Partial<Battery>): void => update((i) => ({ ...i, battery: { ...i.battery, ...x } }));
  const kwh = buffer.volumeM3 * r.kwhPerM3;
  const hours = bufferHoursOfPeak(buffer.volumeM3, r.kwhPerM3, designLoad);
  const cRate =
    battery.capacityKwh > 0 ? batteryPower(battery) / battery.capacityKwh : BATTERY_DEFAULT_C_RATE;

  return (
    <Block
      no={4}
      title={BLOCK_TITLES[3]}
      expert={
        <>
          <CheckField
            label="Batterijvermogen automatisch (0,5 C)"
            info={HELP.batteryPower}
            checked={battery.powerKw === null}
            onChange={(auto) =>
              patchBat({ powerKw: auto ? null : BATTERY_DEFAULT_C_RATE * battery.capacityKwh })
            }
          />
          {battery.powerKw !== null && (
            <RangeField
              label="Batterijvermogen (C-waarde)"
              value={cRate}
              min={BATTERY_C_RATE_MIN}
              max={BATTERY_C_RATE_MAX}
              step={0.05}
              digits={2}
              unit="C"
              disabled={battery.capacityKwh <= 0}
              hint={<>= {fmt(batteryPower(battery), 1)} kW laden/ontladen</>}
              onChange={(c) => patchBat({ powerKw: c * battery.capacityKwh })}
            />
          )}
        </>
      }
    >
      <RangeField
        label="Buffervolume"
        info={HELP.bufferVolume}
        value={buffer.volumeM3}
        min={0}
        max={r.bufferMaxM3}
        step={r.bufferStepM3}
        digits={2}
        unit="m³"
        markers={r.bufferMarkersM3.map((m) => ({ value: m.value, label: `${m.hours} h` }))}
        hint={
          <>
            Nuttig <strong>{fmt(kwh, 1)} kWh</strong> (ΔT × 1,163 × 0,9 = {fmt(r.kwhPerM3, 1)} kWh/m³) · ≈{' '}
            <strong>{fmt(hours, 1)} uur</strong> piekvermogen
          </>
        }
        onChange={(volumeM3) => patchBuf({ volumeM3 })}
      />
      <SegField<BufferStrategy>
        label="Laadstrategie buffer"
        info={HELP.strategy}
        value={buffer.strategy}
        options={[
          { value: 'predictive', label: 'Voorspellend' },
          { value: 'always', label: 'Altijd' },
        ]}
        onChange={(strategy) => patchBuf({ strategy })}
      />
      <RangeField
        label="Batterijcapaciteit"
        info={HELP.batteryCapacity}
        value={battery.capacityKwh}
        min={0}
        max={r.batteryMaxKwh}
        step={r.batteryStepKwh}
        digits={1}
        unit="kWh"
        markers={r.batteryMarkersKwh.map((m) => ({ value: m.value, label: `${m.hours} h` }))}
        hint={
          <>
            Nuttig <strong>{fmt(batteryUsableEnergy(battery), 1)} kWh</strong> · vermogen{' '}
            <strong>{fmt(batteryPower(battery), 1)} kW</strong> ({fmt(cRate, 2)} C) · rendement 90 % heen en
            terug
          </>
        }
        onChange={(capacityKwh) =>
          patchBat({
            capacityKwh,
            // vermogen houdt dezelfde C-waarde bij een handmatig vermogen
            powerKw: battery.powerKw === null ? null : cRate * capacityKwh,
          })
        }
      />
      <SegField<OperatingMode>
        label="Bedrijfsmodus"
        info={HELP.mode}
        value={mode}
        options={[
          { value: 'exceedance', label: 'Overschrijding tonen' },
          { value: 'limited', label: 'Aansluiting begrenst' },
        ]}
        onChange={(m) => update((i) => ({ ...i, grid: { ...i.grid, mode: m } }))}
      />
    </Block>
  );
}
