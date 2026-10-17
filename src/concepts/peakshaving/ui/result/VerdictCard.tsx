// Stap 2 · Resultaat (UX-plan §4.1): de oordeelkaart. Kop en detailzin, knoppen "Wat helpt", meterbalk, drie tegels
// en twee gevolgregels, alles uit buildVerdict (onafhankelijk van de bedrijfsmodus). Rekenen, fouten en het skelet
// staan in de kaart zelf; er is één visueel verborgen statusregel die het oordeel voorleest als het verandert.
import { useMemo } from 'react';
import u from '../../../../ui/ui.module.css';
import { useStore } from '../../store';
import { MESSAGE_UI, STEP_TITLES, UI_LABELS } from '../../texts';
import { buildVerdict, type VerdictWhy } from '../../view/verdict';
import { prefersReducedMotion } from '../hooks';
import p from '../peakshaving.module.css';
import { tourAnchor } from '../tour/anchors';
import { AnswerTiles } from './AnswerTiles';
import { ConsequenceLines } from './ConsequenceLines';
import { FixChips } from './FixChips';
import { MeterBar } from './MeterBar';
import css from './Result.module.css';

/** id van de H2 "Resultaat": doel van "Bekijk het resultaat", de skip-link, de balk onderaan en de toast */
export const RESULT_HEADING_ID = 'ps-resultaat';
/** id van de oordeelkaart */
export const VERDICT_CARD_ID = 'ps-oordeel';
/** id van de kop van het oordeel (icoon, kop en detailzin): de balk onderaan verschijnt als die uit beeld is */
export const VERDICT_HEAD_ID = 'ps-oordeel-kop';

/**
 * Naar H2 "Resultaat" scrollen (direct, zonder animatie, bij verminderde beweging) en daar de focus zetten, zonder dat
 * de focus de pagina nog eens verschuift. Geeft false als de kop er (nog) niet is.
 * `'nearest'` (Bekijk het resultaat): alleen scrollen als de oordeelkaart niet helemaal in beeld staat, en dan zo
 * weinig mogelijk; zo blijven de kop van de pagina en de strook met "Wijzig" in beeld als alles past.
 */
export function focusResult(block: 'start' | 'nearest' = 'start'): boolean {
  const heading = document.getElementById(RESULT_HEADING_ID);
  if (!heading) return false;
  const target = block === 'nearest' ? (document.getElementById(VERDICT_CARD_ID) ?? heading) : heading;
  target.scrollIntoView?.({ block, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  heading.focus({ preventScroll: true });
  return true;
}

/**
 * "Waarom?" onder de detailzin (alleen bij niet te dimensioneren): de toelichting en alle passende oplossingen. Op
 * papier open (data-print-open), want de print heeft geen Opvallend.
 */
function WhyDetails({ why }: { why: VerdictWhy }) {
  return (
    <details className={css.why} data-print-open="">
      <summary>{MESSAGE_UI.why}</summary>
      {why.paragraphs.map((t, i) => (
        <p key={i}>{t}</p>
      ))}
      <strong>{MESSAGE_UI.solutions}</strong>
      <ul>
        {why.solutions.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </details>
  );
}

/** Skelet vóór de eerste doorrekening: vaste hoogte (min-height 340px), zodat er niets verspringt. */
function Skeleton() {
  return (
    <div className={css.skeleton} aria-hidden="true" data-testid="verdict-skeleton">
      <span className={`${css.skBlock} ${css.skHeadline}`} />
      <span className={`${css.skBlock} ${css.skDetail}`} />
      <span className={`${css.skBlock} ${css.skChips}`} />
      <span className={`${css.skBlock} ${css.skMeter}`} />
      <div className={css.skTiles}>
        <span className={`${css.skBlock} ${css.skTile}`} />
        <span className={`${css.skBlock} ${css.skTile}`} />
        <span className={`${css.skBlock} ${css.skTile}`} />
      </div>
      <span className={`${css.skBlock} ${css.skLine}`} />
    </div>
  );
}

export function VerdictCard() {
  const analysis = useStore((st) => st.analysis);
  const sens = useStore((st) => st.sensitivity);
  const busy = useStore((st) => st.busy);
  const error = useStore((st) => st.error);
  const retry = useStore((st) => st.retry);
  const verdict = useMemo(() => (analysis ? buildVerdict(analysis, sens) : null), [analysis, sens]);

  // gedimd na 150 ms rekenen (CSS-wachttijd), of bij een fout als "Verouderd"
  const dim = error ? 'stale' : busy ? 'busy' : undefined;

  return (
    // een <div> met een H2, geen eigen regio: de regio "Resultaat" is de sectie eromheen (§2.1)
    <div
      id={VERDICT_CARD_ID}
      className={css.card}
      data-tone={verdict?.tone}
      data-status={verdict?.status}
      {...tourAnchor('verdict')}
    >
      {busy && <div className={`${css.progress} noPrint`} aria-hidden="true" />}
      <div className={css.titleRow}>
        <h2 id={RESULT_HEADING_ID} className={css.title} tabIndex={-1}>
          <span className={p.stepNo} aria-hidden="true">
            2
          </span>
          {STEP_TITLES.result}
        </h2>
        {busy && <span className={`${p.busy} noPrint`}>{UI_LABELS.computing}</span>}
        {error && verdict && (
          <span className={`${u.pill} ${u.pillWarn} ${css.stale} noPrint`}>{UI_LABELS.stale}</span>
        )}
      </div>

      {error && (
        <div className={`${css.errorBar} noPrint`}>
          {/* een fout wordt meteen voorgelezen (de statusregel houdt het laatste oordeel) */}
          <span className={css.errorText} role="alert">
            {UI_LABELS.calcError(error)}
          </span>
          {/* de enige knop "Opnieuw proberen" buiten het tabblad Gevoeligheid; niet terwijl er al gerekend wordt */}
          {!busy && (
            <button type="button" className={`${u.btn} ${u.btnSmall} ${css.retry}`} onClick={retry}>
              {UI_LABELS.retry}
            </button>
          )}
        </div>
      )}

      {verdict ? (
        <div className={css.values} data-dim={dim}>
          <div id={VERDICT_HEAD_ID} className={css.verdictHead}>
            <span className={css.icon} data-tone={verdict.tone} aria-hidden="true">
              {verdict.icon}
            </span>
            <div className={css.headText}>
              <p className={css.headline}>{verdict.headline}</p>
              <p className={css.detail}>{verdict.detail}</p>
              {verdict.why && <WhyDetails why={verdict.why} />}
            </div>
          </div>
          {verdict.fixesLabel && <FixChips label={verdict.fixesLabel} fixes={verdict.fixes} />}
          <MeterBar meter={verdict.meter} />
          <AnswerTiles tiles={verdict.tiles} />
          <ConsequenceLines limiterLine={verdict.limiterLine} stressLine={verdict.stressLine} />
        </div>
      ) : (
        <Skeleton />
      )}

      {/* de enige statusregel van het oordeel: React werkt de tekst alleen bij als die verandert */}
      <p role="status" className="sr-only">
        {verdict?.liveText ?? ''}
      </p>
    </div>
  );
}
