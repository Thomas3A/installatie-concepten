// Vaste balk onderaan (UX-plan B13): het oordeel in één regel ("✕ Past niet · 101 uur · WP 10,6 kW"), alleen zolang de
// kop van het oordeel (icoon, kop en detailzin) uit beeld is: als je Basis invult en het oordeel nog onder de vouw
// staat, of verder op de pagina in Verdieping. Eén knop scrolt terug naar het oordeel en zet de focus op H2
// "Resultaat"; de pijl wijst naar het oordeel (↓ eronder, ↑ erboven). Zolang de balk staat, krijgt de body de klasse
// `ps-mini-verdict`: ruimte onderaan (padding-bottom) en de variabele --ps-bottom-bar, zodat de melding (toast) erboven
// kan staan en de footer er niet onder valt.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../store';
import { UI_LABELS } from '../../texts';
import { buildVerdict } from '../../view/verdict';
import { useInView } from '../hooks';
import css from './Result.module.css';
import { focusResult, VERDICT_HEAD_ID } from './VerdictCard';

/** Hoogte van de balk [px] (gelijk aan --ps-bottom-bar in Result.module.css). */
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

  return (
    <div className={`${css.miniBar} noPrint`} data-tone={verdict.tone} data-testid="mini-verdict">
      <button
        type="button"
        className={css.miniButton}
        onClick={() => focusResult()}
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
