// Blok 1 — Gebouw (spec §3.1). Bij meerdere woningen op één warmtepomp zijn piekvermogen, tapwaterbehoefte en
// boilervat totalen van het gebouw; de UI toont daarnaast de waarde per woning (tapwater wordt per woning ingevoerd).
import { fmt } from '../../../../core/format';
import { DEFAULT_MULTI_DHW_KWH_PER_DWELLING, DEFAULT_MULTI_TANK_L_PER_DWELLING } from '../../data/defaults';
import { CheckField, SegField } from '../../../../ui/fields';
import { buildingKind, LIMITS } from '../../model/input';
import type { Building, BuildingKind } from '../../model/types';
import { useStore } from '../../store';
import { BLOCK_TITLES, HELP, MASS_PRESETS } from '../../texts';
import { Block, RangeField } from './controls';
import p from '../peakshaving.module.css';

const KIND_OPTIONS: { value: BuildingKind; label: string }[] = [
  { value: 'single', label: 'Woning' },
  { value: 'multi', label: 'Meerdere woningen' },
  { value: 'office', label: 'Kantoor' },
];

/** Eén woning: boven dit piekvermogen [kW] de hint "Groot voor één woning" tonen. */
const SINGLE_LARGE_KW = 20;
/** Meerdere woningen: schuifbereik aantal woningen (het getalveld gaat tot LIMITS.dwellings). */
const DWELLINGS_SLIDER: readonly [number, number] = [2, 100];

/** Schuifbereik piekvermogen bij meerdere woningen: tot 500 kW, bij veel woningen tot ca. 10 kW per woning. */
function multiLoadSliderMax(dwellings: number): number {
  return Math.min(LIMITS.designLoadKw[1], Math.max(500, Math.ceil(dwellings / 10) * 100));
}

export function BuildingPanel() {
  const b = useStore((st) => st.input.building);
  const update = useStore((st) => st.update);
  const setKind = useStore((st) => st.setKind);
  const setDwellings = useStore((st) => st.setDwellings);
  const setDesignLoad = useStore((st) => st.setDesignLoad);
  const kind = buildingKind(b);
  const office = kind === 'office';
  const multi = kind === 'multi';
  // aantal woningen; 1 bij één woning en kantoor (tapwaterwaarden zijn dan gewoon de totalen)
  const n = multi ? b.dwellings : 1;
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
      <div className={p.kindSeg}>
        <SegField
          label="Gebouwfunctie"
          info={HELP.use}
          value={kind}
          options={KIND_OPTIONS}
          onChange={setKind}
        />
      </div>
      {multi && (
        <RangeField
          label="Aantal woningen"
          info={HELP.dwellings}
          value={b.dwellings}
          min={2}
          max={LIMITS.dwellings[1]}
          sliderMin={DWELLINGS_SLIDER[0]}
          sliderMax={DWELLINGS_SLIDER[1]}
          step={1}
          digits={0}
          onChange={setDwellings}
        />
      )}
      {multi ? (
        <RangeField
          label="Piekvermogen verwarming (totaal)"
          info={HELP.designLoadMulti}
          value={b.designLoadKw}
          min={LIMITS.designLoadKw[0]}
          max={LIMITS.designLoadKw[1]}
          sliderMin={5}
          sliderMax={multiLoadSliderMax(b.dwellings)}
          step={1}
          digits={1}
          unit="kW"
          hint={<>≈ {fmt(b.designLoadKw / n, 1)} kW per woning</>}
          onChange={setDesignLoad}
        />
      ) : (
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
          hint={!office && b.designLoadKw > SINGLE_LARGE_KW ? HELP.singleDwellingLarge : undefined}
          onChange={setDesignLoad}
        />
      )}
      <SegField
        label="Gebouwmassa"
        info={HELP.mass}
        value={massPreset}
        options={[
          ...MASS_PRESETS.map((m) => ({ value: m.value, label: `${m.label} ${m.value} h` })),
          ...(massPreset === 0
            ? [
                {
                  value: 0,
                  label: `Eigen ${fmt(b.timeConstantH, Number.isInteger(b.timeConstantH) ? 0 : 1)} h`,
                },
              ]
            : []),
        ]}
        onChange={(v) => v > 0 && patch({ timeConstantH: v })}
      />
      <CheckField
        label="Warm tapwater"
        info={HELP.dhw}
        checked={b.dhw.enabled}
        onChange={(enabled) =>
          patchDhw(
            // standaard per woning (bij meerdere woningen de appartementwaarden × het aantal)
            enabled && b.dhw.tankLitre === 0
              ? {
                  enabled,
                  tankLitre: office ? 500 : multi ? DEFAULT_MULTI_TANK_L_PER_DWELLING * n : 200,
                  dailyKwh:
                    b.dhw.dailyKwh || (office ? 20 : multi ? DEFAULT_MULTI_DHW_KWH_PER_DWELLING * n : 10),
                }
              : { enabled },
          )
        }
      />
      {b.dhw.enabled && (
        // meerdere woningen: onder elkaar (de labels zijn langer); tapwater per woning, het model krijgt het totaal
        <div className={multi ? p.stack : p.pair}>
          <RangeField
            label={multi ? 'Tapwaterbehoefte per woning' : 'Tapwaterbehoefte'}
            info={multi ? HELP.dhwDailyPerDwelling : HELP.dhwDaily}
            value={b.dhw.dailyKwh / n}
            min={LIMITS.dhwDailyKwh[0]}
            max={LIMITS.dhwDailyKwh[1]}
            step={0.5}
            unit="kWh/dag"
            noSlider
            onChange={(v) => patchDhw({ dailyKwh: v * n })}
          />
          <RangeField
            label={multi ? 'Boilervat (collectief)' : 'Boilervat'}
            info={multi ? HELP.tankCollective : HELP.tank}
            value={b.dhw.tankLitre}
            min={LIMITS.tankLitre[0]}
            max={LIMITS.tankLitre[1] * n}
            step={multi ? 50 : 10}
            unit="l"
            noSlider
            hint={multi ? <>≈ {fmt(b.dhw.tankLitre / n, 0)} l per woning</> : undefined}
            onChange={(v) => patchDhw({ tankLitre: v })}
          />
        </div>
      )}
    </Block>
  );
}
