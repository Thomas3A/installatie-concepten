// Tabblad Uitleg (spec §11): korte secties met één formule per sectie (KaTeX).
import { MathText } from '../../../../ui/MathText';
import u from '../../../../ui/ui.module.css';
import { EXPLAIN } from '../../texts';

export function ExplainTab() {
  return (
    <div style={{ maxWidth: 860 }}>
      <nav aria-label="Inhoud uitleg" className={u.hint} style={{ marginBottom: 12 }}>
        {EXPLAIN.map((sec, i) => (
          <span key={sec.id}>
            {i > 0 && ' · '}
            <a
              href={`#uitleg-${sec.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(`uitleg-${sec.id}`)?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              {sec.title.replace(/^\d+\.\s*/, '')}
            </a>
          </span>
        ))}
      </nav>
      {EXPLAIN.map((sec) => (
        <section key={sec.id} id={`uitleg-${sec.id}`} style={{ marginBottom: 20 }}>
          <h2>{sec.title}</h2>
          {sec.body.map((b, i) => (
            <MathText key={i} text={b} as={b.startsWith('$$') ? 'div' : 'p'} emphasis />
          ))}
        </section>
      ))}
      <p className={u.hint}>
        Alle modelaannames staan in docs/AANNAMES.md van de repository; het rekenmodel in
        docs/SPEC-peakshaving.md §5.
      </p>
    </div>
  );
}
