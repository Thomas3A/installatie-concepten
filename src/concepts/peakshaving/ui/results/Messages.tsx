// Meldingen met "Waarom?" (spec §6.4): maximaal vier, gesorteerd op ernst.
import type { Message, Severity } from '../../model/messages';
import { useStore } from '../../store';
import u from '../../../../ui/ui.module.css';

const ICON: Record<Severity, string> = { error: '🔴', warning: '🟠', info: '🔵' };
const LABEL: Record<Severity, string> = { error: 'kritiek', warning: 'waarschuwing', info: 'info' };
const CLASS: Record<Severity, string> = { error: u.msgErr, warning: u.msgWarn, info: u.msgInfo };

function MessageItem({ m }: { m: Message }) {
  return (
    <div className={`${u.msg} ${CLASS[m.severity]}`}>
      <div style={{ padding: '6px 8px', display: 'flex', gap: 6, alignItems: 'baseline' }}>
        <span className={u.msgIcon} role="img" aria-label={LABEL[m.severity]}>
          {ICON[m.severity]}
        </span>
        <span>
          <strong>{m.title}</strong>
          <br />
          <span className={u.msgLines}>{m.summary}</span>
        </span>
      </div>
      <details className={u.msgBody}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Waarom?</summary>
        {m.why.map((w, i) => (
          <p key={i}>{w}</p>
        ))}
        {m.solutions.length > 0 && (
          <>
            <strong>Wat helpt</strong>
            <ul>
              {m.solutions.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </>
        )}
      </details>
    </div>
  );
}

export function Messages() {
  const messages = useStore((st) => st.analysis?.messages ?? null);
  if (!messages) return null;
  return (
    <section aria-label="Meldingen" style={{ marginBottom: 12 }}>
      {messages.length === 0 ? (
        <div className={u.okBox}>✓ Geen meldingen: de configuratie heeft geen bijzonderheden.</div>
      ) : (
        messages.map((m) => <MessageItem key={m.code} m={m} />)
      )}
    </section>
  );
}
