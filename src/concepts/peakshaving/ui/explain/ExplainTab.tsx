// Tabblad Uitleg (spec §11): korte secties met één formule per sectie (KaTeX).
import { MathText } from '../../../../ui/MathText';
import { ScrollRegion } from '../../../../ui/ScrollRegion';
import u from '../../../../ui/ui.module.css';
import { EXPLAIN } from '../../texts';
import p from '../peakshaving.module.css';

/** Naar een sectie springen: scrollen (zacht, tenzij minder beweging gewenst is) en de focus op de kop zetten. */
function goToSection(id: string): void {
  const heading = document.getElementById(`uitleg-${id}-kop`);
  if (!heading) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  heading.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  // focus mee verplaatsen, zodat Tab en de schermlezer verder gaan in de gekozen sectie
  heading.focus({ preventScroll: true });
}

export function ExplainTab() {
  return (
    <div style={{ maxWidth: 860 }}>
      <nav aria-label="Inhoud uitleg" className={`${u.hint} ${p.toc}`}>
        <ul>
          {EXPLAIN.map((sec) => (
            <li key={sec.id}>
              <button type="button" className={u.btnLink} onClick={() => goToSection(sec.id)}>
                {sec.title.replace(/^\d+\.\s*/, '')}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {EXPLAIN.map((sec) => (
        <section
          key={sec.id}
          id={`uitleg-${sec.id}`}
          aria-labelledby={`uitleg-${sec.id}-kop`}
          style={{ marginBottom: 20 }}
        >
          <h2 id={`uitleg-${sec.id}-kop`} tabIndex={-1} className={p.explainHead}>
            {sec.title}
          </h2>
          {sec.body.map((b, i) =>
            b.startsWith('$$') ? (
              <ScrollRegion key={i} label={`Formule bij ${sec.title}`} className={p.formula}>
                <MathText text={b} as="div" />
              </ScrollRegion>
            ) : (
              <MathText key={i} text={b} as="p" emphasis />
            ),
          )}
        </section>
      ))}
      <p className={u.hint}>
        Alle modelaannames staan in docs/AANNAMES.md van de repository; het rekenmodel in
        docs/SPEC-peakshaving.md §5.
      </p>
    </div>
  );
}
