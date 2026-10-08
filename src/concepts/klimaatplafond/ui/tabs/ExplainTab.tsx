import { EXPLAIN } from '../../texts';
import { MathText } from '../MathText';
import s from '../ui.module.css';

export function ExplainTab() {
  return (
    <div style={{ maxWidth: 820 }}>
      {EXPLAIN.map((sec) => (
        <section key={sec.id} id={`uitleg-${sec.id}`} style={{ marginBottom: 20 }}>
          <h2>{sec.title}</h2>
          {sec.body.map((b, i) => (
            <MathText key={i} text={b} as={b.startsWith('$$') ? 'div' : 'p'} />
          ))}
        </section>
      ))}
      <p className={s.hint}>Alle modelaannames staan in docs/AANNAMES.md van de repository.</p>
    </div>
  );
}
