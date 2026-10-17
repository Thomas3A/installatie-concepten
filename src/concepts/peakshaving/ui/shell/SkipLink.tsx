// Skip-link "Naar resultaat" (UX-plan §2.1): het eerste focusbare element van de pagina, alleen zichtbaar bij focus.
// Een knop en geen <a href="#…">: de HashRouter zou op zo'n link naar een andere route navigeren. Scrolt naar H2
// "Resultaat" en zet daar de focus (direct, zonder animatie, bij verminderde beweging).
import { UI_LABELS } from '../../texts';
import { focusResult } from '../result/VerdictCard';
import css from './Shell.module.css';

export function SkipLink() {
  return (
    <button type="button" className={`${css.skip} noPrint`} onClick={() => focusResult()}>
      {UI_LABELS.skipToResult}
    </button>
  );
}
