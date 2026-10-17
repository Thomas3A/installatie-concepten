// Stap 3 "Wat als?" (UX-plan §5): hendels op de bestaande invoer, zonder tweede toestand. Buffer met mini-grafiek;
// batterij en aansluitingsstapper; Verfijnen; "↺ Zonder maatregelen" (met ongedaan maken). Vanaf 620 px paneelbreedte
// staan buffer en batterij naast elkaar (container query in WhatIf.module.css).
import { useEffect, useRef } from 'react';
import u from '../../../../ui/ui.module.css';
import { useStore } from '../../store';
import { STEP_TITLES, UI_LABELS } from '../../texts';
import { withoutMeasuresFix } from '../../view/fixes';
import { isWhatIfField, type WhatIfFieldKey } from '../../view/types';
import { prefersReducedMotion } from '../hooks';
import p from '../peakshaving.module.css';
import { tourAnchor } from '../tour/anchors';
import { BatteryLever } from './BatteryLever';
import { BufferLever } from './BufferLever';
import { ConnectionStepper } from './ConnectionStepper';
import { Refine } from './Refine';
import css from './WhatIf.module.css';

/** Id van de kop "Wat als?". */
export const WHATIF_HEADING_ID = 'ps-wat-als';

/**
 * Bedieningselement van een hendel: de groep zelf als die focusbaar is (stapper), anders het getalveld, anders de
 * nog niet gekozen optie van een knoppengroep (WP-vermogen automatisch → "Handmatig"), anders het eerste element.
 */
function controlOf(field: HTMLElement): HTMLElement | null {
  if (field.hasAttribute('tabindex')) return field;
  return (
    field.querySelector<HTMLElement>('input[type="text"]:not(:disabled)') ??
    field.querySelector<HTMLElement>('button[aria-pressed="false"]') ??
    field.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled), select:not(:disabled)')
  );
}

/** Hendel tonen en focussen: Verfijnen zo nodig openklappen, in beeld scrollen, focus erop. */
function revealField(root: HTMLElement, target: WhatIfFieldKey): void {
  const field = root.querySelector<HTMLElement>(`[data-field="${target}"]`);
  if (!field) return;
  const details = field.closest('details');
  if (details && !details.open) details.open = true;
  const control = controlOf(field);
  if (!control) return;
  control.scrollIntoView?.({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  control.focus({ preventScroll: true });
}

export function WhatIfPanel() {
  const hasMeasures = useStore((st) => st.input.buffer.volumeM3 > 0 || st.input.battery.capacityKwh > 0);
  const applyFix = useStore((st) => st.applyFix);
  const revealSetting = useStore((st) => st.revealSetting);
  const reveal = useStore((st) => st.reveal);
  const root = useRef<HTMLDivElement>(null);
  // een verzoek van vóór het tekenen van het paneel telt niet (bijv. een chip in de Basis)
  const handled = useRef(reveal?.seq ?? 0);

  // knop, stip of chip vraagt om een hendel: focus erop (de Basis blijft zoals hij is)
  useEffect(() => {
    if (!reveal || reveal.seq === handled.current) return;
    handled.current = reveal.seq;
    if (root.current && isWhatIfField(reveal.target)) revealField(root.current, reveal.target);
  }, [reveal]);

  const withoutMeasures = (): void => {
    const f = withoutMeasuresFix();
    applyFix(f.undoLabel, f.apply);
    revealSetting(f.target);
  };

  return (
    // een <div> met een kop, geen eigen regio: binnen "Resultaat" bestaan alleen blokken met een H2 (§2.1)
    <div ref={root} className={`${css.panel} noPrint`} {...tourAnchor('whatif')}>
      <div className={`${u.card} ${css.card}`}>
        <div className={css.head}>
          <h2 className={css.title} id={WHATIF_HEADING_ID}>
            <span className={p.stepNo} aria-hidden="true">
              3
            </span>
            {STEP_TITLES.whatIf}
          </h2>
          {hasMeasures && (
            <button type="button" className={`${u.btn} ${u.btnSmall} ${css.reset}`} onClick={withoutMeasures}>
              <span className={css.resetIcon} aria-hidden="true">
                ↺
              </span>
              {UI_LABELS.withoutMeasures}
            </button>
          )}
        </div>
        <div className={css.levers}>
          <BufferLever />
          <div className={css.lever} {...tourAnchor('battery-connection')}>
            <BatteryLever />
            <ConnectionStepper />
          </div>
        </div>
        <Refine />
      </div>
    </div>
  );
}
