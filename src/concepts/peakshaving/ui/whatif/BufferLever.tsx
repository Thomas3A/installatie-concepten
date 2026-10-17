// Bufferhendel in Wat als? (UX-plan §5, §5.2): mini-grafiek, schuif "Buffervolume" met de markeringen 2 h / 4 h / 8 h,
// de effectregel en de meldingen die bij de buffer horen. Het opslagdeel van de effectregel volgt de schuif direct;
// het warmtepompdeel komt uit de doorrekening en is gedimd zolang er een nieuwe loopt.
import { useMemo } from 'react';
import { useStore } from '../../store';
import { HELP, UI_LABELS, WHATIF_TEXTS } from '../../texts';
import { bufferEffect } from '../../view/levers';
import { tourAnchor } from '../tour/anchors';
import { RangeField } from '../inputs/controls';
import { Messages } from '../results/Messages';
import { BufferMiniChart } from './BufferMiniChart';
import { SeparatedText } from './SeparatedText';
import css from './WhatIf.module.css';

export function BufferLever() {
  const input = useStore((st) => st.input);
  const volumeM3 = input.buffer.volumeM3;
  const r = useStore((st) => st.ranges);
  const update = useStore((st) => st.update);
  const a = useStore((st) => st.analysis);
  const sens = useStore((st) => st.sensitivity);
  // het warmtepompdeel hoort bij de vorige doorrekening zolang er een nieuwe loopt of die mislukte
  const stale = useStore((st) => st.busy || st.error !== null);
  const effect = useMemo(() => (a ? bufferEffect(a, sens, { input, ranges: r }) : null), [a, sens, input, r]);

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
        markers={r.bufferMarkersM3.map((m) => ({ value: m.value, label: WHATIF_TEXTS.markerHours(m.hours) }))}
        hint={
          <span className={css.effect} data-testid="buffer-effect">
            {effect ? (
              <>
                <span className={css.effectLine}>
                  <SeparatedText text={effect.storage} />
                  {effect.sizing && (
                    <span className={stale ? css.stalePart : undefined} data-testid="buffer-effect-sizing">
                      {' · '}
                      <SeparatedText text={effect.sizing} />
                    </span>
                  )}
                </span>
                {effect.plateau && <span className={css.effectLine}>{effect.plateau}</span>}
              </>
            ) : (
              UI_LABELS.computing
            )}
          </span>
        }
        onChange={(v) => update((i) => ({ ...i, buffer: { ...i.buffer, volumeM3: v } }))}
      />
      {/* "Buffer helpt niet verder" zegt hetzelfde als de regel vanaf het knikpunt: niet allebei */}
      <Messages
        include={effect?.plateau ? ['smallBufferDeltaT'] : ['bufferPlateau', 'smallBufferDeltaT']}
        compact
        hideEmpty
      />
    </div>
  );
}
