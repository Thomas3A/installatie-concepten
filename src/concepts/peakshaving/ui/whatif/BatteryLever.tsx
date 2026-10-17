// Batterijhendel in Wat als? (UX-plan §5, §5.2): schuif "Batterijcapaciteit", de effectregel met de knoppen
// "Zet op … kWh", "Zet" en "◀ Probeer {kleiner}" (met ongedaan maken) en de meldingen die bij de batterij horen.
import { useMemo } from 'react';
import { BATTERY_DEFAULT_C_RATE, batteryPower } from '../../model/battery';
import type { Battery } from '../../model/types';
import { useStore } from '../../store';
import { HELP, UI_LABELS } from '../../texts';
import type { Fix } from '../../view/fixes';
import { batteryState } from '../../view/levers';
import u from '../../../../ui/ui.module.css';
import { RangeField } from '../inputs/controls';
import { Messages } from '../results/Messages';
import { markerLabel } from './BufferLever';
import css from './WhatIf.module.css';

/** C-waarde van de batterij (vermogen / capaciteit); zonder capaciteit de standaard 0,5 C. */
export function batteryCRate(b: Battery): number {
  return b.capacityKwh > 0 ? batteryPower(b) / b.capacityKwh : BATTERY_DEFAULT_C_RATE;
}

/**
 * Knop achter een effectregel: past de wijziging toe met één stap ongedaan maken en geeft de focus aan de hendel die
 * de knop zet (de batterij, of de stapper bij "Probeer 1×25 A").
 */
export function FixButton({ fix }: { fix: Fix }) {
  const applyFix = useStore((st) => st.applyFix);
  const revealSetting = useStore((st) => st.revealSetting);
  return (
    <button
      type="button"
      className={`${u.btn} ${u.btnSmall} ${css.fixBtn}`}
      onClick={() => {
        applyFix(fix.undoLabel, fix.apply);
        revealSetting(fix.target);
      }}
    >
      {fix.id === 'trySmaller' && (
        <span className={css.arrow} aria-hidden="true">
          ◀
        </span>
      )}
      {fix.label}
    </button>
  );
}

export function BatteryLever() {
  const battery = useStore((st) => st.input.battery);
  const r = useStore((st) => st.ranges);
  const update = useStore((st) => st.update);
  const a = useStore((st) => st.analysis);
  const stale = useStore((st) => st.busy || st.error !== null);
  const state = useMemo(() => (a ? batteryState(a) : null), [a]);
  const cRate = batteryCRate(battery);

  return (
    <div className={css.lever} data-field="battery">
      <RangeField
        label="Batterijcapaciteit"
        info={HELP.batteryCapacity}
        value={battery.capacityKwh}
        min={0}
        max={r.batteryMaxKwh}
        step={r.batteryStepKwh}
        digits={1}
        unit="kWh"
        markers={r.batteryMarkersKwh.map((m) => ({ value: m.value, label: markerLabel(m.hours) }))}
        hint={
          <span className={`${css.effect} ${stale ? css.stale : ''}`} data-testid="battery-effect">
            {state ? (
              <>
                {state.text}
                {state.fix && <FixButton fix={state.fix} />}
              </>
            ) : (
              UI_LABELS.computing
            )}
          </span>
        }
        onChange={(capacityKwh) =>
          update((i) => ({
            ...i,
            battery: {
              ...i.battery,
              capacityKwh,
              // een handmatig vermogen houdt dezelfde C-waarde
              powerKw: i.battery.powerKw === null ? null : cRate * capacityKwh,
            },
          }))
        }
      />
      <Messages include={['batteryEmpty', 'batteryPower']} compact hideEmpty />
    </div>
  );
}
