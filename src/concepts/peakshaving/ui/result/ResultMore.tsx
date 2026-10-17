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
 * batteryEmpty en batteryPower bij de batterij); sizingFailed is bij automatisch WP-vermogen de toestand van het
 * oordeel zelf, en staat alleen bij een handmatig vermogen hier (zie noteworthyCodes).
 */
export const NOTEWORTHY_CODES: MessageCode[] = [
  'dhwPeak',
  'preheatPeak',
  'coldSpell',
  'comfortLoss',
  'backupPeak',
];

/**
 * Bij een handmatig WP-vermogen geeft het oordeel geen "niet te dimensioneren" (het rekent met het gekozen vermogen);
 * dan staat de melding sizingFailed ("De berekening gebruikt het handmatig gekozen WP-vermogen.") in Opvallend.
 */
export function noteworthyCodes(manual: boolean): MessageCode[] {
  return manual ? [...NOTEWORTHY_CODES, 'sizingFailed'] : NOTEWORTHY_CODES;
}

export function ResultMore() {
  const hasAnalysis = useStore((st) => st.analysis !== null);
  // de kaarten volgen de modus van de getoonde doorrekening
  const limited = useStore((st) => (st.analysis?.main.mode ?? st.input.grid.mode) === 'limited');
  // de melding hoort bij de getoonde doorrekening
  const manual = useStore((st) => st.analysis?.input.heatPump.sizingMode === 'manual');
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
            <Messages include={noteworthyCodes(manual)} compact />
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
