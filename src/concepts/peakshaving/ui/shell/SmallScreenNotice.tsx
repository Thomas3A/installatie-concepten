// Korte melding op een telefoon of tablet: de tool is gemaakt voor een pc of laptop (vanaf 1024 px breed). Alleen
// CSS bepaalt of hij te zien is (smal scherm, of een aanraakscherm tot 1024 px); geen JavaScript en geen sluitknop.
// De pagina eronder blijft gewoon bruikbaar: de gebruiker beslist zelf of die verder scrolt of de pc pakt.
import { SMALL_SCREEN_NOTICE } from '../../texts';
import css from './Shell.module.css';

/** Telefoon of tablet: dezelfde mediaquery als .smallScreen in Shell.module.css (ook de rondleiding start dan niet). */
export const SMALL_SCREEN_QUERY = '(max-width: 760px), (pointer: coarse) and (max-width: 1024px)';

export function SmallScreenNotice() {
  return (
    <p role="note" className={`${css.smallScreen} noPrint`}>
      {SMALL_SCREEN_NOTICE}
    </p>
  );
}
