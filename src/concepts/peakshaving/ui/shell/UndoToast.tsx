// Melding onderaan (toast, UX-plan §6): niet modaal, linksonder boven de balk met het oordeel. Toont de melding uit
// de store met één actie: "Ongedaan maken" na een knop of een andere gebouwfunctie, "Terug naar je invoer" na een
// voorbeeld. Verdwijnt na 8 s; zolang de muis erop staat of de focus erin zit, loopt die tijd niet. Sluiten (×, Esc
// of de tijd) laat ook het ongedaan maken vervallen; de bewaarde eigen invoer blijft in Voorbeelden staan.
// De regio met role="status" staat er altijd (leeg zonder melding), zodat een nieuwe melding wordt voorgelezen.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import { useStore, type Notice } from '../../store';
import { TOAST_TEXTS } from '../../texts';
import { RESULT_HEADING_ID } from '../result/VerdictCard';
import css from './Shell.module.css';

/** Zo lang blijft een melding staan [ms]. */
export const TOAST_MS = 8000;

// elke melding een eigen sleutel: dezelfde tekst nog eens (dezelfde knop twee keer) begint opnieuw met 8 s
const noticeKeys = new WeakMap<Notice, number>();
let lastKey = 0;
function noticeKey(n: Notice): number {
  let k = noticeKeys.get(n);
  if (k === undefined) {
    k = ++lastKey;
    noticeKeys.set(n, k);
  }
  return k;
}

/** Werd het element met het toetsenbord gefocust? (Dan mag de focus elders de pagina laten scrollen.) */
function focusVisible(el: Element | null): boolean {
  try {
    return el?.matches(':focus-visible') ?? false;
  } catch {
    return false;
  }
}

export function UndoToast() {
  const notice = useStore((st) => st.notice);
  return (
    <div role="status" className={`${css.toastRegion} noPrint`} data-testid="undo-toast">
      {notice && <ToastCard key={noticeKey(notice)} notice={notice} />}
    </div>
  );
}

function ToastCard({ notice }: { notice: Notice }) {
  const canUndo = useStore((st) => st.undo !== null);
  const canRestore = useStore((st) => st.ownInput !== null);
  const undoLast = useStore((st) => st.undoLast);
  const restoreOwnInput = useStore((st) => st.restoreOwnInput);
  const dismissNotice = useStore((st) => st.dismissNotice);
  const card = useRef<HTMLDivElement>(null);
  // waar de focus vandaan kwam toen die de melding in ging: daar gaat hij na het sluiten naartoe terug
  const returnTo = useRef<HTMLElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;

  useEffect(() => {
    if (paused) return;
    const t = window.setTimeout(dismissNotice, TOAST_MS);
    return () => window.clearTimeout(t);
  }, [paused, dismissNotice]);

  const action =
    notice.kind === 'example'
      ? canRestore
        ? { label: TOAST_TEXTS.backToOwnInput, run: restoreOwnInput }
        : null
      : canUndo
        ? { label: TOAST_TEXTS.undo, run: undoLast }
        : null;

  /**
   * Actie uitvoeren of sluiten. Zat de focus in de melding, dan gaat die terug naar waar hij vandaan kwam (of naar H2
   * "Resultaat") in plaats van naar de body te vallen.
   */
  const finish = (run: () => void): void => {
    const active = document.activeElement;
    const hadFocus = card.current?.contains(active) ?? false;
    const keyboard = focusVisible(active);
    flushSync(run);
    if (!hadFocus) return;
    // eerst de herkomst; is die weg of niet (meer) focusbaar (bijv. een ingeklapte Basis), dan H2 "Resultaat"
    for (const el of [returnTo.current, document.getElementById(RESULT_HEADING_ID)]) {
      if (!el?.isConnected || el === document.body) continue;
      // met de muis geklikt: niet laten verspringen
      el.focus({ preventScroll: !keyboard });
      if (document.activeElement === el) return;
    }
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    finish(dismissNotice);
  };

  return (
    <div
      ref={card}
      className={css.toast}
      data-kind={notice.kind}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={(e) => {
        const from = e.relatedTarget;
        if (from instanceof HTMLElement && !card.current?.contains(from)) returnTo.current = from;
        setFocused(true);
      }}
      onBlur={(e) => {
        if (!card.current?.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onKeyDown={onKeyDown}
    >
      <span className={css.toastText}>{notice.text}</span>
      {action && (
        <button type="button" className={css.toastAction} onClick={() => finish(action.run)}>
          {action.label}
        </button>
      )}
      <button
        type="button"
        className={css.toastClose}
        aria-label={TOAST_TEXTS.close}
        title={TOAST_TEXTS.close}
        onClick={() => finish(dismissNotice)}
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
