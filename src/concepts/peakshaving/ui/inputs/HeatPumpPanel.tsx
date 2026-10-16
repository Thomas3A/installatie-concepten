// Blok 3 — Warmtepomp en afgifte (spec §3.3).
import { fmt } from '../../../../core/format';
import { SegField, SelectField } from '../../../../ui/fields';
import { EMITTER_PRESETS, MAX_SUPPLY_OPTIONS, type EmitterPreset } from '../../data/heatPumpCurves';
import { LIMITS } from '../../model/input';
import type { HeatPump, SizingMode } from '../../model/types';
import { useStore } from '../../store';
import { BLOCK_TITLES, HELP } from '../../texts';
import { Block, RangeField } from './controls';

export function HeatPumpPanel() {
  const hp = useStore((st) => st.input.heatPump);
  const designLoad = useStore((st) => st.input.building.designLoadKw);
  const ranges = useStore((st) => st.ranges);
  const sized = useStore((st) => st.analysis?.sizing.withBuffer ?? null);
  const nominalUsed = useStore((st) => st.analysis?.nominalKw ?? null);
  const update = useStore((st) => st.update);
  const patch = (x: Partial<HeatPump>): void => update((i) => ({ ...i, heatPump: { ...i.heatPump, ...x } }));
  const preset = EMITTER_PRESETS[hp.emitterPreset];

  return (
    <Block
      no={3}
      title={BLOCK_TITLES[2]}
      expert={
        <RangeField
          label="Carnot-rendement"
          info={HELP.carnot}
          value={hp.carnotEfficiency}
          min={LIMITS.carnotEfficiency[0]}
          max={LIMITS.carnotEfficiency[1]}
          step={0.01}
          digits={2}
          onChange={(carnotEfficiency) => patch({ carnotEfficiency })}
        />
      }
    >
      <SegField<EmitterPreset>
        label="Stooklijn (afgifte)"
        info={HELP.emitter}
        value={hp.emitterPreset}
        options={(Object.keys(EMITTER_PRESETS) as EmitterPreset[]).map((k) => ({
          value: k,
          label: EMITTER_PRESETS[k].label,
        }))}
        onChange={(emitterPreset) => patch({ emitterPreset })}
      />
      <div className="hint" style={{ fontSize: '0.8rem', color: 'var(--text-2)', marginTop: -6 }}>
        {preset.description}; aanvoer {fmt(preset.supplyDesignC, 0)} °C bij −10 °C,{' '}
        {fmt(preset.supplyMinC, 0)} °C vanaf 15 °C.
      </div>
      <SelectField<number>
        label="Max. aanvoertemperatuur warmtepomp"
        info={HELP.maxSupply}
        value={hp.maxSupplyC}
        options={MAX_SUPPLY_OPTIONS.map((v) => ({ value: v, label: `${v} °C` }))}
        onChange={(maxSupplyC) => patch({ maxSupplyC })}
      />
      <SegField<SizingMode>
        label="WP-vermogen"
        info={HELP.sizing}
        value={hp.sizingMode}
        options={[
          { value: 'auto', label: 'Automatisch' },
          { value: 'manual', label: 'Handmatig' },
        ]}
        onChange={(sizingMode) =>
          patch(
            sizingMode === 'manual' && nominalUsed !== null && Number.isFinite(nominalUsed)
              ? { sizingMode, nominalKw: Math.round(nominalUsed * 10) / 10 }
              : { sizingMode },
          )
        }
      />
      {hp.sizingMode === 'auto' ? (
        <div style={{ fontSize: '0.85rem' }}>
          Gedimensioneerd op het klimaatjaar:{' '}
          <strong className="num">
            {sized === null ? '…' : Number.isFinite(sized) ? `${fmt(sized, 1)} kW` : 'niet te bepalen'}
          </strong>{' '}
          thermisch bij A7/W35.
        </div>
      ) : (
        <RangeField
          label="WP-vermogen (A7/W35)"
          value={hp.nominalKw}
          min={ranges.heatPumpMinKw}
          max={ranges.heatPumpMaxKw}
          step={designLoad >= 50 ? 1 : 0.1}
          digits={1}
          unit="kW th"
          hint={
            <>
              {fmt(hp.nominalKw / designLoad, 2)} × piekvermogen
              {sized !== null && Number.isFinite(sized) ? ` · benodigd ${fmt(sized, 1)} kW` : ''}
            </>
          }
          onChange={(nominalKw) => patch({ nominalKw })}
        />
      )}
      <RangeField
        label="Bijstookelement"
        info={HELP.backup}
        value={hp.backupHeaterKw}
        min={LIMITS.backupHeaterKw[0]}
        max={LIMITS.backupHeaterKw[1]}
        step={0.5}
        digits={1}
        unit="kW"
        noSlider
        onChange={(backupHeaterKw) => patch({ backupHeaterKw })}
      />
    </Block>
  );
}
