// Vaste balk onderaan (UX-plan B13, §2.4): het oordeel in één regel ("✕ Past niet · 101 uur · WP 10,6 kW"), op alle
// breedtes, alleen zolang de kop van het oordeel uit beeld is. Eén knop scrolt terug naar het oordeel en zet de focus
// op H2 "Resultaat". De pijl wijst naar het oordeel (↓ eronder bij een open Basis, ↑ erboven verder op de pagina).
// Zolang de balk staat, krijgt de body de klasse `ps-mini-verdict`: ruimte onderaan (padding-bottom) en de variabele
// --ps-bottom-bar, zodat de melding (toast) erboven kan staan.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { UI_LABELS } from '../../texts';
import { buildVerdict } from '../../view/verdict';
import { prefersReducedMotion, useInView } from '../hooks';
import css from './Result.module.css';
import { RESULT_HEADING_ID, VERDICT_HEAD_ID } from './VerdictCard';

/** Hoogte van de balk [px] (zonder de veilige zone van iOS). */
export const MINI_BAR_HEIGHT_PX = 52;
/** Klasse op de body zolang de balk zichtbaar is. */
export const MINI_BAR_BODY_CLASS = 'ps-mini-verdict';

/** Ligt de kop van het oordeel boven het scherm (dan wijst de pijl omhoog)? */
function headAbove(): boolean {
  const el = document.getElementById(VERDICT_HEAD_ID);
  return el ? el.getBoundingClientRect().bottom < 0 : false;
}

export function MiniVerdictBar() {
  const analysis = useStore((st) => st.analysis);
  // alleen kop, icoon en de korte tekst; de knoppen (raster) doen hier niet ter zake
  const verdict = useMemo(() => (analysis ? buildVerdict(analysis, null) : null), [analysis]);
  // de kop onder de balk zelf telt als uit beeld: anders zou de balk hem bedekken
  const [observe, inView] = useInView<HTMLElement>({ rootMargin: `0px 0px -${MINI_BAR_HEIGHT_PX}px 0px` });
  const [above, setAbove] = useState(false);

  // de kop staat in de oordeelkaart (een andere component): na elke weergave opzoeken; hetzelfde element geeft geen
  // nieuwe toestand, een nieuw element (skelet → oordeel) wordt vanzelf gevolgd
  useEffect(() => {
    observe(document.getElementById(VERDICT_HEAD_ID));
  });

  const visible = verdict !== null && !inView;

  // richting van de pijl: bijwerken bij scrollen zolang de balk staat (een sprong met End gaat niet door beeld)
  useEffect(() => {
    if (!visible) return;
    setAbove(headAbove());
    let frame = 0;
    const onScroll = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setAbove(headAbove()));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [visible]);

  // ruimte onderaan de pagina zolang de balk staat
  useEffect(() => {
    if (!visible) return;
    document.body.classList.add(MINI_BAR_BODY_CLASS);
    return () => document.body.classList.remove(MINI_BAR_BODY_CLASS);
  }, [visible]);

  if (!visible || !verdict) return null;

  const toResult = (): void => {
    const heading = document.getElementById(RESULT_HEADING_ID);
    if (!heading) return;
    heading.scrollIntoView?.({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    heading.focus({ preventScroll: true });
  };

  return (
    <div className={`${css.miniBar} noPrint`} data-tone={verdict.tone} data-testid="mini-verdict">
      <button
        type="button"
        className={css.miniButton}
        onClick={toResult}
        aria-label={`${verdict.mini}. ${UI_LABELS.skipToResult}`}
      >
        <span className={css.icon} data-tone={verdict.tone} aria-hidden="true">
          {verdict.icon}
        </span>
        <span className={css.miniText}>{verdict.mini}</span>
        <span className={css.miniArrow} aria-hidden="true">
          {above ? '↑' : '↓'}
        </span>
      </button>
    </div>
  );
}
