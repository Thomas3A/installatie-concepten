// Blok 1 — Gebouw (spec §3.1).
import { CheckField, SegField } from '../../../../ui/fields';
import { LIMITS } from '../../model/input';
import type { Building } from '../../model/types';
import { useStore } from '../../store';
import { BLOCK_TITLES, HELP, MASS_PRESETS } from '../../texts';
import { Block, RangeField } from './controls';

export function BuildingPanel() {
  const b = useStore((st) => st.input.building);
  const update = useStore((st) => st.update);
  const setUse = useStore((st) => st.setUse);
  const setDesignLoad = useStore((st) => st.setDesignLoad);
  const office = b.use === 'office';
  const patch = (x: Partial<Building>): void => update((i) => ({ ...i, building: { ...i.building, ...x } }));
  const patchDhw = (x: Partial<Building['dhw']>): void =>
    update((i) => ({ ...i, building: { ...i.building, dhw: { ...i.building.dhw, ...x } } }));
  const massPreset = MASS_PRESETS.find((m) => m.value === b.timeConstantH)?.value ?? 0;

  return (
    <Block
      no={1}
      title={BLOCK_TITLES[0]}
      expert={
        <>
          <RangeField
            label="Ontwerpbuitentemperatuur"
            info={HELP.designOutdoor}
            value={b.designOutdoorC}
            min={LIMITS.designOutdoorC[0]}
            max={LIMITS.designOutdoorC[1]}
            step={1}
            unit="°C"
            noSlider
            onChange={(v) => patch({ designOutdoorC: v })}
          />
          <RangeField
            label="Ontwerpbinnentemperatuur"
            info={HELP.designIndoor}
            value={b.designIndoorC}
            min={LIMITS.designIndoorC[0]}
            max={LIMITS.designIndoorC[1]}
            step={0.5}
            unit="°C"
            noSlider
            onChange={(v) => patch({ designIndoorC: v })}
          />
          <RangeField
            label="Setpoint tijdens gebruik"
            info={HELP.setpointUse}
            value={b.setpointUseC}
            min={LIMITS.setpointUseC[0]}
            max={LIMITS.setpointUseC[1]}
            step={0.5}
            unit="°C"
            noSlider
            onChange={(v) => patch({ setpointUseC: v })}
          />
          <RangeField
            label="Setpoint buiten gebruik"
            info={HELP.setpointSetback}
            value={b.setpointSetbackC}
            min={LIMITS.setpointSetbackC[0]}
            max={LIMITS.setpointSetbackC[1]}
            step={0.5}
            unit="°C"
            noSlider
            onChange={(v) => patch({ setpointSetbackC: v })}
          />
          <RangeField
            label="Stookgrens tijdens gebruik"
            info={HELP.balanceTemp}
            value={b.balanceTempC}
            min={LIMITS.balanceTempC[0]}
            max={LIMITS.balanceTempC[1]}
            step={0.5}
            unit="°C"
            noSlider
            onChange={(v) => patch({ balanceTempC: v })}
          />
          <RangeField
            label="Gebouwmassa (tijdconstante)"
            info={HELP.mass}
            value={b.timeConstantH}
            min={LIMITS.timeConstantH[0]}
            max={LIMITS.timeConstantH[1]}
            step={1}
            unit="h"
            onChange={(v) => patch({ timeConstantH: v })}
          />
          <RangeField
            label="Traagheid gevel"
            info={HELP.envelopeLag}
            value={b.envelopeLagH}
            min={LIMITS.envelopeLagH[0]}
            max={LIMITS.envelopeLagH[1]}
            step={0.5}
            unit="h"
            noSlider
            onChange={(v) => patch({ envelopeLagH: v })}
          />
          <RangeField
            label="Opwarmfactor"
            info={HELP.boost}
            value={b.boostFraction}
            min={LIMITS.boostFraction[0]}
            max={LIMITS.boostFraction[1]}
            step={0.05}
            digits={2}
            unit="× P"
            noSlider
            onChange={(v) => patch({ boostFraction: v })}
          />
          {office && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <RangeField
                  label="Gebruik vanaf"
                  info={HELP.useHours}
                  value={b.useStartH}
                  min={0}
                  max={23}
                  step={1}
                  unit="h"
                  noSlider
                  onChange={(v) => patch({ useStartH: v })}
                />
                <RangeField
                  label="Gebruik tot"
                  value={b.useEndH}
                  min={1}
                  max={24}
                  step={1}
                  unit="h"
                  noSlider
                  onChange={(v) => patch({ useEndH: v })}
                />
              </div>
              <RangeField
                label="Opstooktijd"
                info={HELP.preheat}
                value={b.preheatH}
                min={LIMITS.preheatH[0]}
                max={LIMITS.preheatH[1]}
                step={1}
                unit="h"
                noSlider
                onChange={(v) => patch({ preheatH: v })}
              />
            </>
          )}
          {b.dhw.enabled && (
            <RangeField
              label="Boilertemperatuur"
              info={HELP.tankTemp}
              value={b.dhw.tankTempC}
              min={LIMITS.tankTempC[0]}
              max={LIMITS.tankTempC[1]}
              step={1}
              unit="°C"
              noSlider
              onChange={(v) => patchDhw({ tankTempC: v })}
            />
          )}
        </>
      }
    >
      <SegField
        label="Gebouwfunctie"
        info={HELP.use}
        value={b.use}
        options={[
          { value: 'residential', label: 'Woning' },
          { value: 'office', label: 'Kantoor' },
        ]}
        onChange={setUse}
      />
      <RangeField
        label="Piekvermogen verwarming"
        info={HELP.designLoad}
        value={b.designLoadKw}
        min={LIMITS.designLoadKw[0]}
        max={LIMITS.designLoadKw[1]}
        sliderMin={office ? 10 : 1}
        sliderMax={office ? 500 : 30}
        step={office ? 5 : 0.5}
        digits={1}
        unit="kW"
        onChange={setDesignLoad}
      />
      <SegField
        label="Gebouwmassa"
        info={HELP.mass}
        value={massPreset}
        options={[
          ...MASS_PRESETS.map((m) => ({ value: m.value, label: `${m.label} ${m.value} h` })),
          ...(massPreset === 0 ? [{ value: 0, label: `Eigen ${b.timeConstantH} h` }] : []),
        ]}
        onChange={(v) => v > 0 && patch({ timeConstantH: v })}
      />
      <CheckField
        label="Warm tapwater"
        info={HELP.dhw}
        checked={b.dhw.enabled}
        onChange={(enabled) =>
          patchDhw(
            enabled && b.dhw.tankLitre === 0
              ? { enabled, tankLitre: office ? 500 : 200, dailyKwh: b.dhw.dailyKwh || (office ? 20 : 10) }
              : { enabled },
          )
        }
      />
      {b.dhw.enabled && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <RangeField
            label="Tapwaterbehoefte"
            info={HELP.dhwDaily}
            value={b.dhw.dailyKwh}
            min={LIMITS.dhwDailyKwh[0]}
            max={LIMITS.dhwDailyKwh[1]}
            step={0.5}
            unit="kWh/d"
            noSlider
            onChange={(v) => patchDhw({ dailyKwh: v })}
          />
          <RangeField
            label="Boilervat"
            info={HELP.tank}
            value={b.dhw.tankLitre}
            min={LIMITS.tankLitre[0]}
            max={LIMITS.tankLitre[1]}
            step={10}
            unit="l"
            noSlider
            onChange={(v) => patchDhw({ tankLitre: v })}
          />
        </div>
      )}
    </Block>
  );
}
