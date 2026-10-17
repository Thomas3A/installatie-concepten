// Kop van de pagina (UX-plan §2.1): titel, vraagregel, keuzelijst Voorbeelden, de knop Rondleiding (alleen als die
// aanstaat), Deel link en Print / PDF. Niet op papier: daar staat de samenvatting (PrintSummary).
import { useEffect, useRef, useState } from 'react';
import u from '../../../../ui/ui.module.css';
import { shareUrl } from '../../share';
import { useStore } from '../../store';
import { HEADER_TEXTS, PAGE_QUESTION, PAGE_TITLE, UI_LABELS } from '../../texts';
import { TOUR_ENABLED } from '../tour/anchors';
import { ExamplesSelect } from './ExamplesSelect';
import css from './Shell.module.css';

/** Zo lang staat "✓ Link gekopieerd" op de knop [ms]. */
export const COPIED_MS = 2500;
/** Id van de knop Rondleiding: na afloop van de rondleiding gaat de focus hierheen terug. */
export const TOUR_BUTTON_ID = 'ps-rondleiding-knop';

export function PageHeader() {
  const copied = useStore((st) => st.copied);
  const markCopied = useStore((st) => st.markCopied);
  const printing = useStore((st) => st.printing);
  const requestPrint = useStore((st) => st.requestPrint);
  const startTour = useStore((st) => st.startTour);
  const [shareErr, setShareErr] = useState(false);
  const copiedTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const share = async (): Promise<void> => {
    const url = shareUrl(useStore.getState().input);
    try {
      await navigator.clipboard.writeText(url);
      setShareErr(false);
    } catch {
      setShareErr(true);
      window.prompt(HEADER_TEXTS.sharePrompt, url);
    }
    markCopied(true);
    // nogmaals klikken: de tekst blijft weer de volle tijd staan
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => markCopied(false), COPIED_MS);
  };

  return (
    <header className={`${css.header} noPrint`}>
      {/* titel en knoppen op één rij; de vraag eronder over de volle breedte (ook op 1280 px één regel) */}
      <h1 className={css.title}>{PAGE_TITLE}</h1>
      <p className={css.question}>{PAGE_QUESTION}</p>
      <div className={css.controls}>
        <ExamplesSelect />
        {TOUR_ENABLED && (
          <button type="button" id={TOUR_BUTTON_ID} className={u.btn} onClick={startTour}>
            {UI_LABELS.tour}
          </button>
        )}
        <button type="button" className={u.btn} onClick={share} aria-live="polite">
          {copied ? (shareErr ? HEADER_TEXTS.shareShown : HEADER_TEXTS.shareCopied) : HEADER_TEXTS.share}
        </button>
        <button type="button" className={u.btn} onClick={requestPrint} disabled={printing} aria-live="polite">
          {printing ? HEADER_TEXTS.printing : HEADER_TEXTS.print}
        </button>
      </div>
    </header>
  );
}
