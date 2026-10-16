// Blok 2 — Elektrische aansluiting (spec §3.2).
import { fmt } from '../../../../core/format';
import { SelectField } from '../../../../ui/fields';
import { CONNECTIONS, LARGE_CONNECTION_ID, type ConnectionId } from '../../data/connections';
import { connectionPowerKw, gridLimitKw } from '../../model/grid';
import { LIMITS } from '../../model/input';
import type { GridConnection } from '../../model/types';
import { useStore } from '../../store';
import { BLOCK_TITLES, HELP } from '../../texts';
import { Block, RangeField } from './controls';

export function GridPanel() {
  const g = useStore((st) => st.input.grid);
  const update = useStore((st) => st.update);
  const patch = (x: Partial<GridConnection>): void => update((i) => ({ ...i, grid: { ...i.grid, ...x } }));
  const pConn = connectionPowerKw(g);
  const pLim = gridLimitKw(g);

  return (
    <Block
      no={2}
      title={BLOCK_TITLES[1]}
      expert={
        <RangeField
          label="Toegestane comfortverliesuren"
          info={HELP.allowedComfort}
          value={g.allowedComfortLossH}
          min={LIMITS.allowedHours[0]}
          max={LIMITS.allowedHours[1]}
          step={1}
          unit="uur/jaar"
          noSlider
          onChange={(v) => patch({ allowedComfortLossH: v })}
        />
      }
    >
      <SelectField<ConnectionId>
        label="Aansluitwaarde"
        info={HELP.connection}
        value={g.connection}
        options={[
          ...CONNECTIONS.map((c) => ({ value: c.id, label: `${c.label} — ${fmt(c.powerKw, 2)} kW` })),
          { value: LARGE_CONNECTION_ID, label: 'Grootverbruik (gecontracteerd vermogen)' },
        ]}
        onChange={(connection) => patch({ connection })}
      />
      {g.connection === LARGE_CONNECTION_ID && (
        <RangeField
          label="Gecontracteerd vermogen"
          info={HELP.contracted}
          value={g.contractedKw}
          min={LIMITS.contractedKw[0]}
          max={LIMITS.contractedKw[1]}
          sliderMax={1000}
          step={5}
          unit="kW"
          onChange={(contractedKw) => patch({ contractedKw })}
        />
      )}
      <RangeField
        label="Aandeel voor warmtepomp"
        info={HELP.share}
        value={Math.round(g.heatPumpShare * 100)}
        min={LIMITS.heatPumpShare[0] * 100}
        max={LIMITS.heatPumpShare[1] * 100}
        step={1}
        unit="%"
        hint={
          <>
            WP-budget P<sub>limiet</sub> = {fmt(pConn, 2)} kW × {fmt(g.heatPumpShare * 100, 0)} % ={' '}
            <strong>{fmt(pLim, 2)} kW</strong>
          </>
        }
        onChange={(v) => patch({ heatPumpShare: v / 100 })}
      />
      <RangeField
        label="Toegestane overschrijdingsuren"
        info={HELP.allowedExceedance}
        value={g.allowedExceedanceH}
        min={LIMITS.allowedHours[0]}
        max={LIMITS.allowedHours[1]}
        step={1}
        unit="uur/jaar"
        noSlider
        onChange={(v) => patch({ allowedExceedanceH: v })}
      />
    </Block>
  );
}
