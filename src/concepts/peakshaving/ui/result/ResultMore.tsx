// Onder de oordeelkaart (UX-plan §4.6), in DOM-volgorde: het advies (alleen op papier), "Opvallend" (meldingen die niet
// bij een hendel horen), "Alle kerngetallen (8)" ingeklapt met de ongewijzigde KPI-kaarten, en de robuustheidstabel.
// Beide <details> staan op papier open (data-print-open).
import { useId } from 'react';
import u from '../../../../ui/ui.module.css';
import { useStore } from '../../store';
import { UI_LABELS, type MessageCode } from '../../texts';
import { AdviceBanner } from '../results/AdviceBanner';
import { KpiCards } from '../results/KpiCards';
import { Messages } from '../results/Messages';
import { RobustnessTable } from '../results/RobustnessTable';
import css from './Result.module.css';

/**
 * Meldingen onder "Opvallend". De andere staan bij hun hendel (bufferPlateau en smallBufferDeltaT bij de buffer,
 * batteryEmpty en batteryPower bij de batterij); sizingFailed is de toestand van het oordeel zelf.
 */
export const NOTEWORTHY_CODES: MessageCode[] = [
  'dhwPeak',
  'preheatPeak',
  'coldSpell',
  'comfortLoss',
  'backupPeak',
];

export function ResultMore() {
  const hasAnalysis = useStore((st) => st.analysis !== null);
  // de kaarten volgen de modus van de getoonde doorrekening
  const limited = useStore((st) => (st.analysis?.main.mode ?? st.input.grid.mode) === 'limited');
  const labelId = useId();
  return (
    <div className={css.more}>
      <AdviceBanner />
      {hasAnalysis && (
        <>
          <div className={`${css.noteworthy} noPrint`} role="group" aria-labelledby={labelId}>
            <span id={labelId} className={css.moreLabel}>
              {UI_LABELS.noteworthy}
            </span>
            <Messages include={NOTEWORTHY_CODES} compact />
          </div>
          <details className={`${u.acc} ${css.allKpis}`} data-print-open="">
            <summary>{UI_LABELS.allKpis(limited)}</summary>
            <div className={`${u.accBody} ${css.allKpisBody}`}>
              <KpiCards />
            </div>
          </details>
        </>
      )}
      <RobustnessTable />
    </div>
  );
}
