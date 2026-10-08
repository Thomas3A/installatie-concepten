import { LIMITS } from '../data/limits';
import { useStore } from '../store';
import type { ManualStrand } from '../model/config';
import { NumInput } from './fields';
import s from './ui.module.css';

/** Handmatige strengen: toevoegen, verwijderen, panelen ±, extra aansluitlengte en volgorde. */
export function StrandEditor({ valve, strands }: { valve: number; strands: ManualStrand[] }) {
  const patchValve = useStore((st) => st.patchValve);
  const update = (list: ManualStrand[]): void =>
    patchValve(valve, { manualStrands: list, panelCount: Math.min(64, Math.max(1, list.reduce((a, x) => a + x.panels, 0))) });
  const total = strands.reduce((a, x) => a + x.panels, 0);

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {strands.map((st, i) => (
        <div key={i} className={s.strandRow}>
          <span className="num">{i + 1}</span>
          <span className={s.stepper}>
            <button
              type="button"
              className={`${s.btn} ${s.btnSmall}`}
              aria-label={`Streng ${i + 1}: één paneel minder`}
              disabled={st.panels <= 1}
              onClick={() => update(strands.map((x, k) => (k === i ? { ...x, panels: x.panels - 1 } : x)))}
            >
              −
            </button>
            <output aria-label={`Panelen in streng ${i + 1}`}>{st.panels}</output>
            <button
              type="button"
              className={`${s.btn} ${s.btnSmall}`}
              aria-label={`Streng ${i + 1}: één paneel meer`}
              disabled={st.panels >= LIMITS.maxPanelsPerStrand || total >= LIMITS.panelCount.max}
              onClick={() => update(strands.map((x, k) => (k === i ? { ...x, panels: x.panels + 1 } : x)))}
            >
              +
            </button>
            <span className={s.hint}>pan.</span>
          </span>
          <span style={{ width: 84 }}>
            <NumInput
              label="+m"
              value={st.extraLength}
              min={LIMITS.extraLength.min}
              max={LIMITS.extraLength.max}
              step={0.5}
              unit="m"
              onChange={(v) => update(strands.map((x, k) => (k === i ? { ...x, extraLength: v } : x)))}
              info="Extra aansluitlengte (koppelslang) van deze streng, 0–10 m."
            />
          </span>
          <span className={s.stepper}>
            <button
              type="button"
              className={`${s.btn} ${s.btnSmall}`}
              aria-label={`Streng ${i + 1} naar voren`}
              disabled={i === 0}
              onClick={() => {
                const l = strands.slice();
                [l[i - 1], l[i]] = [l[i], l[i - 1]];
                update(l);
              }}
            >
              ↑
            </button>
            <button
              type="button"
              className={`${s.btn} ${s.btnSmall}`}
              aria-label={`Streng ${i + 1} naar achteren`}
              disabled={i === strands.length - 1}
              onClick={() => {
                const l = strands.slice();
                [l[i + 1], l[i]] = [l[i], l[i + 1]];
                update(l);
              }}
            >
              ↓
            </button>
          </span>
          <button
            type="button"
            className={`${s.btn} ${s.btnSmall}`}
            aria-label={`Streng ${i + 1} verwijderen`}
            disabled={strands.length <= 1}
            onClick={() => update(strands.filter((_, k) => k !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`${s.btn} ${s.btnSmall}`}
          disabled={strands.length >= LIMITS.maxStrands || total >= LIMITS.panelCount.max}
          onClick={() => update([...strands, { panels: 4, extraLength: 0 }])}
        >
          + Streng toevoegen
        </button>
        <span className={s.hint}>
          {strands.length} strengen · {total} panelen (volgorde: dichtst bij de klep eerst)
        </span>
      </div>
    </div>
  );
}
