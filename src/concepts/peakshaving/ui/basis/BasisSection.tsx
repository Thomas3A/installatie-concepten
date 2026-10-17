// Stap 1 · Basis (UX-plan §2, §3): open bij een eerste bezoek, ingeklapt tot een strook na "Bekijk het resultaat"
// (bewaard in localStorage via setBasisOpen) of bij een deellink. Het open paneel blijft in de DOM met `hidden`, zodat
// velden hun plek houden; de strook rendert alleen als de Basis dicht is. Verzoeken van revealSetting (chip, Wijzig,
// knop of melding elders) zetten de focus op het veld in <div data-field="…">, zo nodig na het openklappen van Meer
// instellingen. Velden in Wat als? (buffer, batterij, stapper, WP-vermogen) handelt dat paneel zelf af.
import { useEffect, useRef } from 'react';
import { findScenario } from '../../scenarios';
import { useStore } from '../../store';
import { BASIS_TEXTS, STEP_TITLES, UI_LABELS } from '../../texts';
import { isWhatIfField } from '../../view/types';
import { prefersReducedMotion } from '../hooks';
import { tourAnchor } from '../tour/anchors';
import p from '../peakshaving.module.css';
import { BasisForm } from './BasisForm';
import { BasisStrip } from './BasisStrip';
import { MoreSettings } from './MoreSettings';
import s from './Basis.module.css';

/** id van de H2 "Resultaat" in de oordeelkaart (WP-D): doel van "Bekijk het resultaat". */
export const RESULT_HEADING_ID = 'ps-resultaat';

/**
 * Element dat de focus krijgt binnen een veld: eerst een getalveld, keuzelijst of vinkje (geen schuif), dan de
 * gekozen knop van een knoppengroep, dan een andere knop dan de toelichting (i).
 */
function focusTarget(field: Element): HTMLElement | null {
  return (
    field.querySelector<HTMLElement>(
      'input:not([type="range"]):not([type="hidden"]):not([disabled]), select:not([disabled]), textarea',
    ) ??
    field.querySelector<HTMLElement>('button[aria-pressed="true"]') ??
    field.querySelector<HTMLElement>('button:not([aria-label^="Toelichting"])')
  );
}

function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? 'auto' : 'smooth';
}

export function BasisSection() {
  const open = useStore((st) => st.basisOpen);
  const setBasisOpen = useStore((st) => st.setBasisOpen);
  const revealSetting = useStore((st) => st.revealSetting);
  const reveal = useStore((st) => st.reveal);
  const scenarioId = useStore((st) => st.scenarioId);
  const sectionRef = useRef<HTMLElement>(null);
  const editRef = useRef<HTMLDivElement>(null);
  // een verzoek van vóór het tekenen (bijv. een eerder bezoek aan de pagina) zet de focus niet opnieuw
  const handledSeq = useRef(reveal?.seq ?? 0);
  // na "Bekijk het resultaat": na het inklappen scrollen naar het oordeel en de focus op H2 "Resultaat"
  const toResult = useRef(false);

  useEffect(() => {
    if (!reveal || reveal.seq === handledSeq.current) return;
    handledSeq.current = reveal.seq;
    if (isWhatIfField(reveal.target)) return;
    const field = sectionRef.current?.querySelector(`[data-field="${reveal.target}"]`);
    if (!field) return;
    // velden in Meer instellingen: eerst openklappen (de inhoud van <details> is dicht niet focusbaar)
    const details = field.closest('details');
    if (details && !details.open) details.open = true;
    const el = focusTarget(field);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: 'center', behavior: scrollBehavior() });
  }, [reveal, open]);

  useEffect(() => {
    if (open || !toResult.current) return;
    toResult.current = false;
    const heading = document.getElementById(RESULT_HEADING_ID);
    if (heading) {
      heading.scrollIntoView?.({ block: 'start', behavior: scrollBehavior() });
      heading.focus({ preventScroll: true });
    } else {
      // zonder oordeelkaart (nog niet getekend) de focus niet verliezen: naar de strook
      editRef.current?.querySelector<HTMLElement>('[role="toolbar"] [tabindex="0"]')?.focus();
    }
  }, [open]);

  const scenario = scenarioId !== null ? findScenario(scenarioId) : undefined;
  const line = open
    ? scenario
      ? BASIS_TEXTS.exampleLine(scenario.shortTitle)
      : BASIS_TEXTS.ownInputLine
    : scenario
      ? BASIS_TEXTS.stripExample(scenario.shortTitle)
      : BASIS_TEXTS.stripOwnInput;

  const showResult = (): void => {
    toResult.current = true;
    setBasisOpen(false);
  };

  return (
    <section
      ref={sectionRef}
      aria-label="Invoer"
      className={`${s.basis} ${open ? s.isOpen : s.isClosed} noPrint`}
      {...tourAnchor('basis')}
    >
      <div className={s.top} ref={editRef}>
        <h2 className={s.title}>
          <span className={p.stepNo} aria-hidden="true">
            1
          </span>
          {STEP_TITLES.basis}
        </h2>
        {/* vaste hoogte, één regel met ellips; de volledige tekst en de beschrijving van het voorbeeld als tooltip */}
        <p className={s.line} title={scenario ? `${line} ${scenario.description}` : line}>
          {line}
        </p>
        {!open && <BasisStrip onEdit={() => revealSetting('kind')} />}
      </div>
      <div className={s.panel} hidden={!open}>
        <BasisForm />
        <div className={s.footer}>
          <MoreSettings />
          <button type="button" className={s.showResult} onClick={showResult}>
            {UI_LABELS.showResult}{' '}
            <span aria-hidden="true" className={s.arrow}>
              ↓
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
