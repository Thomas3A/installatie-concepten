// Gevolgregels onder de tegels (UX-plan §4.4): met begrenzer (uren te koud, laagste binnentemperatuur) en de
// stresstest in een strenge winter (T1). "toon in grafieken" zet de grafieken op "met begrenzer", kiest het tabblad
// Koude week en scrolt naar Verdieping (showInDepth). De stresstest heeft geen eigen link: de robuustheidstabel staat
// direct onder de oordeelkaart (ResultMore), een tweede bediening ernaartoe zou dubbel zijn.
import u from '../../../../ui/ui.module.css';
import { useStore } from '../../store';
import { UI_LABELS } from '../../texts';
import type { Verdict } from '../../view/verdict';
import { showInDepth } from '../depth/depthLinks';
import css from './Result.module.css';

export interface ConsequenceLinesProps {
  limiterLine: Verdict['limiterLine'];
  stressLine: string | null;
}

export function ConsequenceLines({ limiterLine, stressLine }: ConsequenceLinesProps) {
  const setMode = useStore((st) => st.setMode);

  const showInCharts = (): void => {
    // de modus is een weergavekeuze voor grafieken en kerngetallen (geen invoerwijziging); kop en tegels hangen er
    // niet van af
    setMode('limited');
    showInDepth('koude-week');
  };

  return (
    <ul className={css.lines}>
      <li className={css.line} data-tone={limiterLine.tone} data-testid="limiter-line">
        {limiterLine.tone === 'warn' && (
          <span className={css.lineIcon} aria-hidden="true">
            !
          </span>
        )}
        <span className={css.lineText}>{limiterLine.text}</span>
        <button type="button" className={`${u.btnLink} ${css.lineLink} noPrint`} onClick={showInCharts}>
          {UI_LABELS.showInCharts}
        </button>
      </li>
      {stressLine && (
        <li className={css.line} data-testid="stress-line">
          <span className={css.lineText}>{stressLine}</span>
        </li>
      )}
    </ul>
  );
}
