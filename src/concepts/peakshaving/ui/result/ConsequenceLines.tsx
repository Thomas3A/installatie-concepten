// Gevolgregels onder de tegels (UX-plan §4.4): met begrenzer (uren te koud, laagste binnentemperatuur) en de
// stresstest in een strenge winter (T1). "toon in grafieken" zet de grafieken op "met begrenzer", kiest het tabblad
// Koude week en scrolt naar Verdieping; "Robuustheid ▸" klapt de robuustheidstabel open en scrolt erheen.
import u from '../../../../ui/ui.module.css';
import { useStore, type TabId } from '../../store';
import { UI_LABELS } from '../../texts';
import type { Verdict } from '../../view/verdict';
import { prefersReducedMotion } from '../hooks';
import { openRobustness } from '../results/RobustnessTable';
import css from './Result.module.css';

// TODO(integratie): dezelfde id's staan in Verdieping (WP-E) en in de mini-grafiek (WP-C); één bron maken
/** id van de sectie Verdieping */
export const DEPTH_SECTION_ID = 'ps-verdieping';
/** id van de tab-knop van een tabblad in Verdieping */
export const depthTabId = (t: TabId): string => `ps-tab-${t}`;

export interface ConsequenceLinesProps {
  limiterLine: Verdict['limiterLine'];
  stressLine: string | null;
}

export function ConsequenceLines({ limiterLine, stressLine }: ConsequenceLinesProps) {
  const mode = useStore((st) => st.input.grid.mode);
  const update = useStore((st) => st.update);
  const setTab = useStore((st) => st.setTab);

  const showInCharts = (): void => {
    // de modus is een weergavekeuze voor grafieken en kerngetallen; het oordeel hangt er niet van af
    if (mode !== 'limited') update((i) => ({ ...i, grid: { ...i.grid, mode: 'limited' } }));
    setTab('koude-week');
    document
      .getElementById(DEPTH_SECTION_ID)
      ?.scrollIntoView?.({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    document.getElementById(depthTabId('koude-week'))?.focus({ preventScroll: true });
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
          <button type="button" className={`${u.btnLink} ${css.lineLink} noPrint`} onClick={openRobustness}>
            {UI_LABELS.robustness}
            <span className={css.marker} aria-hidden="true">
              ▸
            </span>
          </button>
        </li>
      )}
    </ul>
  );
}
