// Meldingen met "Waarom?" (spec §6.4): maximaal vier, gesorteerd op ernst. Met `include`/`exclude` toont de werkbank
// een deel ervan op de plek waar ze horen (Opvallend, bij de buffer, bij de batterij).
import type { Message, Severity } from '../../model/messages';
import { useStore } from '../../store';
import { MESSAGE_UI, type MessageCode } from '../../texts';
import u from '../../../../ui/ui.module.css';
import css from './Messages.module.css';

const CLASS: Record<Severity, string> = { error: u.msgErr, warning: u.msgWarn, info: u.msgInfo };
const SEV_CLASS: Record<Severity, string> = {
  error: css.sevError,
  warning: css.sevWarning,
  info: css.sevInfo,
};

function MessageItem({ m }: { m: Message }) {
  const sev = MESSAGE_UI.severity[m.severity];
  return (
    <div className={`${u.msg} ${CLASS[m.severity]}`}>
      <div className={css.head}>
        {/* ernst in woorden: kleur is nooit de enige drager */}
        <span className={`${css.sev} ${SEV_CLASS[m.severity]}`}>
          <span className={css.sevIcon} aria-hidden="true">
            {sev.icon}
          </span>{' '}
          {sev.text}
        </span>
        <span>
          <strong>{m.title}</strong>
          <br />
          <span className={u.msgLines}>{m.summary}</span>
        </span>
      </div>
      <details className={`${u.msgBody} ${css.why}`}>
        <summary>{MESSAGE_UI.why}</summary>
        {m.why.map((w, i) => (
          <p key={i}>{w}</p>
        ))}
        {m.solutions.length > 0 && (
          <>
            <strong>{MESSAGE_UI.solutions}</strong>
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

export interface MessagesProps {
  /** alleen deze meldingen */
  include?: MessageCode[];
  /** deze meldingen niet */
  exclude?: MessageCode[];
  /** compact (in de werkbank): geen eigen regio, kleinere marges */
  compact?: boolean;
  /** zonder meldingen niets tonen in plaats van "Geen bijzonderheden." (bijv. onder een hendel) */
  hideEmpty?: boolean;
}

export function Messages({ include, exclude, compact = false, hideEmpty = false }: MessagesProps) {
  const all = useStore((st) => st.analysis?.messages ?? null);
  if (!all) return null;
  const messages = all.filter(
    (m) => (!include || include.includes(m.code)) && !(exclude && exclude.includes(m.code)),
  );
  if (messages.length === 0 && hideEmpty) return null;
  const body =
    messages.length === 0 ? (
      compact ? (
        <p className={css.empty}>{MESSAGE_UI.empty}</p>
      ) : (
        <div className={u.okBox}>{MESSAGE_UI.empty}</div>
      )
    ) : (
      messages.map((m) => <MessageItem key={m.code} m={m} />)
    );
  // compact: geen eigen regio (de pagina heeft alleen Invoer, Resultaat en Detailweergave)
  return compact ? (
    <div className={`${css.list} ${css.compact}`}>{body}</div>
  ) : (
    <section aria-label={MESSAGE_UI.region} className={css.list}>
      {body}
    </section>
  );
}
