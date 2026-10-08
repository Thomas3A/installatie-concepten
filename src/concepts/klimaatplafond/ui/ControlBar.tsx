import { fmtClock } from '../../../core/format';
import { live, useStore } from '../store';
import s from './ui.module.css';

export function ControlBar() {
  useStore((st) => st.tick);
  const setMode = useStore((st) => st.setMode);
  const reset = useStore((st) => st.reset);
  const speed = useStore((st) => st.config.speed);
  const setConfig = useStore((st) => st.setConfig);
  const sim = live.sim;
  const mode = sim.mode;

  return (
    <div className={`${s.controlBar} noPrint`} role="group" aria-label="Bediening simulatie">
      <button
        type="button"
        className={`${s.btn} ${s.btnWarm} ${mode === 'verwarmen' ? s.btnActive : ''}`}
        aria-pressed={mode === 'verwarmen'}
        onClick={() => setMode('verwarmen')}
      >
        🔥 Verwarmen
      </button>
      <button
        type="button"
        className={`${s.btn} ${s.btnCold} ${mode === 'koelen' ? s.btnActive : ''}`}
        aria-pressed={mode === 'koelen'}
        onClick={() => setMode('koelen')}
      >
        ❄ Koelen
      </button>
      <button
        type="button"
        className={`${s.btn} ${mode === 'stop' && sim.t > 0 ? s.btnActive : ''}`}
        aria-pressed={mode === 'stop'}
        onClick={() => setMode('stop')}
      >
        ■ Stop
      </button>
      <button type="button" className={s.btn} onClick={reset}>
        ↺ Reset
      </button>
      <div className={s.seg} role="group" aria-label="Simulatiesnelheid">
        {([1, 10, 60, 300] as const).map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={speed === v}
            onClick={() => setConfig((c) => ({ ...c, speed: v }))}
          >
            {v}×
          </button>
        ))}
      </div>
      <span className={s.spacer} />
      <span className={s.clock} aria-label="Simulatieklok">
        {fmtClock(sim.t)}
      </span>
      <span
        className={`${s.modeTag} ${mode === 'verwarmen' ? s.modeTagWarm : mode === 'koelen' ? s.modeTagCold : ''}`}
        aria-live="polite"
      >
        {mode === 'verwarmen' ? 'Verwarmen' : mode === 'koelen' ? 'Koelen' : sim.t === 0 ? 'Gereed' : 'Stop'}
      </span>
    </div>
  );
}
