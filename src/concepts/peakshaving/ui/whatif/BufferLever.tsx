// Bufferhendel in Wat als? (UX-plan §5, §5.2): mini-grafiek, schuif "Buffervolume" met de markeringen 2 h / 4 h / 8 h,
// de effectregel uit de doorrekening en de meldingen die bij de buffer horen.
import { useMemo } from 'react';
import { useStore } from '../../store';
import { HELP, UI_LABELS } from '../../texts';
import { bufferEffect } from '../../view/levers';
import { tourAnchor } from '../tour/anchors';
import { RangeField } from '../inputs/controls';
import { Messages } from '../results/Messages';
import { BufferMiniChart } from './BufferMiniChart';
import css from './WhatIf.module.css';

/** Markering onder de schuif: uren piekvermogen ("2 h"). */
// TODO(texts): eenheid van de markeringen (ongewijzigd uit het oude paneel Maatregelen)
export const markerLabel = (hours: number): string => `${hours} h`;

export function BufferLever() {
  const volumeM3 = useStore((st) => st.input.buffer.volumeM3);
  const r = useStore((st) => st.ranges);
  const update = useStore((st) => st.update);
  const a = useStore((st) => st.analysis);
  const sens = useStore((st) => st.sensitivity);
  // de effectregel hoort bij de vorige doorrekening zolang er een nieuwe loopt of die mislukte
  const stale = useStore((st) => st.busy || st.error !== null);
  const effect = useMemo(() => (a ? bufferEffect(a, sens) : null), [a, sens]);

  return (
    <div className={css.lever} {...tourAnchor('buffer')} data-field="buffer">
      <BufferMiniChart />
      <RangeField
        label="Buffervolume"
        info={HELP.bufferVolume}
        value={volumeM3}
        min={0}
        max={r.bufferMaxM3}
        step={r.bufferStepM3}
        digits={2}
        unit="m³"
        markers={r.bufferMarkersM3.map((m) => ({ value: m.value, label: markerLabel(m.hours) }))}
        hint={
          <span className={`${css.effect} ${stale ? css.stale : ''}`} data-testid="buffer-effect">
            {effect ? (
              <>
                <span className={css.effectLine}>{effect.text}</span>
                {effect.plateau && <span className={css.effectLine}>{effect.plateau}</span>}
              </>
            ) : (
              UI_LABELS.computing
            )}
          </span>
        }
        onChange={(v) => update((i) => ({ ...i, buffer: { ...i.buffer, volumeM3: v } }))}
      />
      <Messages include={['bufferPlateau', 'smallBufferDeltaT']} compact hideEmpty />
    </div>
  );
}
