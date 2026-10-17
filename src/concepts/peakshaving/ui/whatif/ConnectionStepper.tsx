// Aansluitingsstapper in Wat als? (UX-plan §5): ◀ en ▶ door de standaardaansluitingen, daarna grootverbruik. Bewust
// zonder veldlabel "Aansluitwaarde": dat label blijft uniek in de Basis. De groep zelf krijgt de focus als een knop
// de aansluiting of het aandeel zet (revealSetting('connectionStepper')).
import { useId, useState } from 'react';
import u from '../../../../ui/ui.module.css';
import { useStore } from '../../store';
import { WHATIF_TEXTS } from '../../texts';
import { connectionSteps, type ConnectionSteps } from '../../view/levers';
import { SEPARATOR, SeparatedText } from './SeparatedText';
import css from './WhatIf.module.css';

type Step = ConnectionSteps['smaller'];

export function ConnectionStepper() {
  const grid = useStore((st) => st.input.grid);
  const update = useStore((st) => st.update);
  const steps = connectionSteps(grid);
  // het laatste deel ("budget 3,22 kW (40 %)") op een eigen regel
  const cut = steps.text.lastIndexOf(SEPARATOR);
  const head = cut >= 0 ? steps.text.slice(0, cut) : steps.text;
  const tail = cut >= 0 ? steps.text.slice(cut + SEPARATOR.length) : null;
  const labelId = useId();
  const textId = useId();
  // voorgelezen na een stap van de stapper; niet bij een wijziging in de Basis (bijv. de schuif Aandeel)
  const [announced, setAnnounced] = useState('');

  // aan de rand: aria-disabled in plaats van disabled, zodat de focus op de knop blijft na de laatste stap
  const go = (to: Step): void => {
    if (!to) return;
    update((i) => ({ ...i, grid: { ...i.grid, ...to } }));
    setAnnounced(connectionSteps({ ...grid, ...to }).text);
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
        <span id={textId} className={css.stepperText} data-testid="connection-stepper-text">
          {/* bewust twee regels, "1×35 A · 8,05 kW" en "budget 3,22 kW (40 %)": in de kolom van Wat als? past het
              niet op één regel, en zo hangt er geen "·" aan het eind van de eerste regel. De scheiding blijft voor
              schermlezers en in de tekst staan. */}
          <SeparatedText text={head} />
          {tail !== null && (
            <>
              <span className="sr-only">{SEPARATOR}</span>
              <span className={css.stepperBudget}>{tail}</span>
            </>
          )}
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
      {/* de nieuwe aansluiting en het budget na een stap (de knoppen houden hun naam); geen role="status": die is er
          alleen voor het oordeel en de melding onderaan */}
      <span className="sr-only" aria-live="polite">
        {announced}
      </span>
    </div>
  );
}
