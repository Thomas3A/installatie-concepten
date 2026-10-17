// Knoppen bij het oordeel (UX-plan §4.5): "Wat helpt:" of "Kleinere aansluiting volstaat ook:". Een knop zet de invoer
// via applyFix (één stap ongedaan maken en een melding "{tekst} · Ongedaan maken") en geeft de focus aan de hendel in
// Wat als? (revealSetting). Zolang het gevoeligheidsraster rekent, staat er een grijze plaatshouder met vaste breedte.
import { useId } from 'react';
import { useStore } from '../../store';
import type { Fix } from '../../view/fixes';
import css from './Result.module.css';

export interface FixChipsProps {
  /** "Wat helpt" of "Kleinere aansluiting volstaat ook" */
  label: string;
  fixes: Fix[];
}

export function FixChips({ label, fixes }: FixChipsProps) {
  const applyFix = useStore((st) => st.applyFix);
  const revealSetting = useStore((st) => st.revealSetting);
  const labelId = useId();
  if (fixes.length === 0) return null;
  return (
    // knoppen zijn een bediening, geen uitkomst: niet op papier
    <div className={`${css.fixes} noPrint`} role="group" aria-labelledby={labelId}>
      <span id={labelId} className={css.fixesLabel}>
        {label}
        <span aria-hidden="true">:</span>
      </span>
      {fixes.map((f, i) =>
        f.pending ? (
          <span key={`${f.id}-${i}`} className={`${css.chip} ${css.chipPending}`} data-pending="">
            {f.label}
          </span>
        ) : (
          <button
            key={`${f.id}-${i}`}
            type="button"
            className={css.chip}
            onClick={() => {
              applyFix(f.undoLabel, f.apply);
              revealSetting(f.target);
            }}
          >
            {f.label}
          </button>
        ),
      )}
    </div>
  );
}
