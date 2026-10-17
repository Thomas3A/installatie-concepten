// Aansluitingsstapper in Wat als? (UX-plan §5): ◀ en ▶ door de standaardaansluitingen, daarna grootverbruik. Bewust
// zonder veldlabel "Aansluitwaarde": dat label blijft uniek in de Basis. De groep zelf krijgt de focus als een knop
// de aansluiting of het aandeel zet (revealSetting('connectionStepper')).
import { Fragment, useId } from 'react';
import u from '../../../../ui/ui.module.css';
import { useStore } from '../../store';
import { WHATIF_TEXTS } from '../../texts';
import { connectionSteps, type ConnectionSteps } from '../../view/levers';
import css from './WhatIf.module.css';

type Step = ConnectionSteps['smaller'];

/** Scheiding tussen de delen van de stappertekst (WHATIF_TEXTS.stepper). */
const SEPARATOR = ' · ';

export function ConnectionStepper() {
  const grid = useStore((st) => st.input.grid);
  const update = useStore((st) => st.update);
  const steps = connectionSteps(grid);
  const labelId = useId();
  const textId = useId();

  // aan de rand: aria-disabled in plaats van disabled, zodat de focus op de knop blijft na de laatste stap
  const go = (to: Step): void => {
    if (to) update((i) => ({ ...i, grid: { ...i.grid, ...to } }));
  };

  return (
    <div
      className={css.stepper}
      role="group"
      aria-labelledby={labelId}
      aria-describedby={textId}
      tabIndex={-1}
      data-field="connectionStepper"
    >
      <span id={labelId} className={css.stepperLabel}>
        {WHATIF_TEXTS.connectionLabel}
      </span>
      <div className={css.stepperRow}>
        <button
          type="button"
          className={`${u.btn} ${css.stepBtn}`}
          aria-label={WHATIF_TEXTS.smallerConnection}
          aria-disabled={steps.smaller ? undefined : true}
          onClick={() => go(steps.smaller)}
        >
          <span aria-hidden="true">◀</span>
        </button>
        {/* de nieuwe aansluiting en het budget worden voorgelezen na een stap (de knoppen houden hun naam) */}
        <span
          id={textId}
          className={css.stepperText}
          aria-live="polite"
          data-testid="connection-stepper-text"
        >
          {/* afbreken alleen tussen de delen: "1×35 A · 8,05 kW ·" / "budget 3,22 kW (40 %)" */}
          {steps.text.split(SEPARATOR).map((part, i) => (
            <Fragment key={i}>
              {i > 0 && SEPARATOR}
              <span className={css.nowrap}>{part}</span>
            </Fragment>
          ))}
        </span>
        <button
          type="button"
          className={`${u.btn} ${css.stepBtn}`}
          aria-label={WHATIF_TEXTS.largerConnection}
          aria-disabled={steps.larger ? undefined : true}
          onClick={() => go(steps.larger)}
        >
          <span aria-hidden="true">▶</span>
        </button>
      </div>
    </div>
  );
}
