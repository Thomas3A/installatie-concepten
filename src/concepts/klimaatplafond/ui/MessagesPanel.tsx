import { useMemo } from 'react';
import { designMessages, runtimeMessages, type Msg, type Severity } from '../model/checks';
import { live, useStore } from '../store';
import { MESSAGE_TEXTS } from '../texts';
import { Formula, MathText } from './MathText';
import s from './ui.module.css';

const ICON: Record<Severity, string> = { fout: '🔴', waarschuwing: '🟠', info: '🔵' };
const SEV_LABEL: Record<Severity, string> = { fout: 'fout', waarschuwing: 'waarschuwing', info: 'info' };
const SEV_CLASS: Record<Severity, string> = { fout: s.msgErr, waarschuwing: s.msgWarn, info: s.msgInfo };

function MessageItem({ m }: { m: Msg }) {
  const setHighlight = useStore((st) => st.setHighlight);
  const setTab = useStore((st) => st.setTab);
  const select = useStore((st) => st.select);
  const applyAdvice = useStore((st) => st.applyAdvice);
  const patchValve = useStore((st) => st.patchValve);
  const tx = MESSAGE_TEXTS[m.code];
  if (!tx) return null;
  const where = m.valve >= 0 ? `zone ${m.valve + 1}` : 'algemeen';
  return (
    <details className={`${s.msg} ${SEV_CLASS[m.severity]}`}>
      <summary onClick={() => (m.valve >= 0 ? setHighlight({ valve: m.valve, strands: m.strands }) : undefined)}>
        <span className={s.msgIcon} role="img" aria-label={SEV_LABEL[m.severity]}>
          {ICON[m.severity]}
        </span>
        <span>
          <span className={s.msgCode}>{m.code}</span> {tx.title} <span className={s.msgLines}>· {where}</span>
          <br />
          <span className={s.msgLines}>{m.lines[0]}</span>
        </span>
      </summary>
      <div className={s.msgBody}>
        {m.lines.length > 1 && (
          <ul>
            {m.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        )}
        <details>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Waarom?</summary>
          {tx.why.map((w, i) => (
            <MathText key={i} text={w} />
          ))}
          {tx.formula && <Formula tex={tx.formula} />}
          <strong>Oplossingen</strong>
          <ul>
            {tx.solutions.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </details>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {m.valve >= 0 && (
            <button type="button" className={`${s.btn} ${s.btnSmall}`} onClick={() => setHighlight({ valve: m.valve, strands: m.strands })}>
              Markeer in plattegrond
            </button>
          )}
          {m.action === 'puzzel' && (
            <button
              type="button"
              className={`${s.btn} ${s.btnSmall}`}
              onClick={() => {
                select(m.valve, m.strands[0] ?? null);
                setTab('puzzel');
              }}
            >
              Toon in puzzel
            </button>
          )}
          {m.action === 'advies' && (
            <button type="button" className={`${s.btn} ${s.btnSmall}`} onClick={() => applyAdvice(m.valve)}>
              Advies toepassen
            </button>
          )}
          {m.action === 'tichelmann' && (
            <button type="button" className={`${s.btn} ${s.btnSmall}`} onClick={() => patchValve(m.valve, { layout: 'tichelmann' })}>
              Tichelmann proberen
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

function Group({ title, list }: { title: string; list: Msg[] }) {
  if (!list.length) return null;
  const zones = Array.from(new Set(list.map((m) => m.valve))).sort((a, b) => a - b);
  return (
    <div>
      <div className={s.groupTitle}>{title}</div>
      {zones.map((z) => (
        <div key={z}>
          {zones.length > 1 && z >= 0 && <div className={s.hint} style={{ margin: '4px 0 2px' }}>Zone {z + 1}</div>}
          {list.filter((m) => m.valve === z).map((m) => (
            <MessageItem key={m.id} m={m} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function MessagesPanel() {
  useStore((st) => st.tick);
  const design = useStore((st) => st.design);
  const designList = useMemo(() => designMessages(design), [design]);
  const runtimeList = runtimeMessages(live.sim, design);
  const serious = designList.filter((m) => m.severity !== 'info');

  return (
    <section className={s.card} aria-label="Meldingen">
      <h2>Meldingen</h2>
      {serious.length === 0 && <div className={s.okBox}>✓ Ontwerp voldoet aan alle grenswaarden</div>}
      <Group title="Ontwerp" list={designList} />
      <Group title="Bedrijf" list={runtimeList} />
    </section>
  );
}
