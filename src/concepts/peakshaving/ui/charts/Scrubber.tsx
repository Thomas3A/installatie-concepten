// Scrubber over de koude week (spec §7.1): kiest het uur voor de markering in de grafieken en het conceptschema,
// met afspelen (1 uur per 0,15 s) en een regel met de getallen van dat uur. Leest en schrijft alleen de store.
import { useEffect, type ReactNode } from 'react';
import { fmt } from '../../../../core/format';
import u from '../../../../ui/ui.module.css';
import { formatHour } from '../../model/climate';
import { defaultScrubHour, useSelectedHour, useStore } from '../../store';
import s from './Scrubber.module.css';

/** Afspeelsnelheid: één uur per 150 ms (spec §7.1). */
export const PLAY_STEP_MS = 150;

function Item({
  label,
  value,
  unit,
  className,
}: {
  label: ReactNode;
  value: string;
  unit?: string;
  className?: string;
}) {
  return (
    <div className={`${s.item} ${className ?? ''}`}>
      <dt>{label}</dt>
      <dd>
        {value}
        {unit && <span className={s.unit}> {unit}</span>}
      </dd>
    </div>
  );
}

/** Teken voor de batterij: + ontladen, − laden. */
function batteryText(p: number): string {
  if (Math.abs(p) < 0.005) return fmt(0, 2);
  return `${p > 0 ? '+' : ''}${fmt(p, 2)}`;
}

export function Scrubber() {
  const analysis = useStore((st) => st.analysis);
  const playing = useStore((st) => st.playing);
  const setPlaying = useStore((st) => st.setPlaying);
  const setScrubHour = useStore((st) => st.setScrubHour);
  const hour = useSelectedHour();

  // afspelen: elke 0,15 s één uur verder; stopt aan het eind van het venster
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      const st = useStore.getState();
      const a = st.analysis;
      if (!a) return;
      const cur = st.scrubHour ?? defaultScrubHour(a);
      const next = Math.max(cur + 1, a.coldWeek.from);
      if (next > a.coldWeek.to - 1) {
        st.setPlaying(false);
        return;
      }
      st.setScrubHour(next);
    }, PLAY_STEP_MS);
    return () => window.clearInterval(id);
  }, [playing]);

  if (!analysis || hour === null) {
    return <p className={s.note}>Scrubber verschijnt zodra de berekening klaar is.</p>;
  }

  const { from, to } = analysis.coldWeek;
  const last = to - 1;
  const sw = analysis.startWeekday;
  const se = analysis.main.series;
  const h = Math.min(Math.max(hour, from), last);
  const pLimit = analysis.pLimitKw;
  const qHeatPump = se.qSpaceHeating[h] + se.qDhw[h] + se.qBufferCharge[h];
  const exceed = Number.isFinite(pLimit) ? Math.max(0, se.pGrid[h] - pLimit) : NaN;
  const pBat = se.pBattery[h];

  const togglePlay = (): void => {
    if (playing) {
      setPlaying(false);
      return;
    }
    // aan het eind: opnieuw vanaf het begin van het venster
    if (h >= last) setScrubHour(from);
    setPlaying(true);
  };

  return (
    <div className={s.scrubber}>
      <div className={s.controls}>
        <button
          type="button"
          className={`${u.btn} ${u.btnSmall} ${s.playBtn}`}
          onClick={togglePlay}
          // de naam (zichtbare tekst) wisselt tussen "Speel af" en "Pauze"; daarom geen aria-pressed erbij,
          // anders klinkt de toestand dubbel ("Pauze, ingedrukt")
          title={playing ? 'Afspelen pauzeren' : 'Speel de koude week af, één uur per 0,15 s'}
        >
          <span className={s.icon} aria-hidden="true">
            {playing ? '❚❚' : '▶'}
          </span>{' '}
          {playing ? 'Pauze' : 'Speel af'}
        </button>
        <input
          type="range"
          className={s.range}
          min={from}
          max={last}
          step={1}
          value={h}
          aria-label="Uur in de koude week"
          aria-valuetext={formatHour(h, sw)}
          onChange={(e) => setScrubHour(Number(e.target.value))}
        />
        <button
          type="button"
          className={`${u.btn} ${u.btnSmall}`}
          onClick={() => {
            setPlaying(false);
            setScrubHour(null);
          }}
          title="Terug naar het uur met de hoogste piek aan de meter in de koude week"
        >
          Naar piekuur
        </button>
      </div>
      <dl
        className={s.values}
        aria-live={playing ? 'off' : 'polite'}
        aria-label="Waarden van het gekozen uur"
      >
        <Item className={s.when} label={<span className="sr-only">Uur</span>} value={formatHour(h, sw)} />
        <Item
          label={
            <>
              T<sub>e</sub>
            </>
          }
          value={fmt(se.outdoorC[h], 1)}
          unit="°C"
        />
        <Item
          label={
            <>
              Q<sub>req</sub>
            </>
          }
          value={fmt(se.qRequested[h], 2)}
          unit="kW"
        />
        <Item
          label={
            <>
              Q<sub>WP</sub>
            </>
          }
          value={fmt(qHeatPump, 2)}
          unit="kW"
        />
        <Item
          label="Buffer in / uit"
          value={`${fmt(se.qBufferCharge[h], 2)} / ${fmt(se.qBufferDischarge[h], 2)}`}
          unit="kW"
        />
        <Item
          label={
            <>
              P<sub>el</sub>
            </>
          }
          value={fmt(se.pElectric[h], 2)}
          unit="kW"
        />
        <Item
          label={pBat > 0.005 ? 'Batterij (ontladen)' : pBat < -0.005 ? 'Batterij (laden)' : 'Batterij'}
          value={batteryText(pBat)}
          unit="kW"
        />
        <Item
          label={
            <>
              P<sub>net</sub>
            </>
          }
          value={fmt(se.pGrid[h], 2)}
          unit="kW"
        />
        <Item
          className={exceed > 0.005 ? s.exceed : undefined}
          label="Overschrijding"
          value={Number.isFinite(exceed) ? fmt(exceed, 2) : '–'}
          unit="kW"
        />
      </dl>
    </div>
  );
}
