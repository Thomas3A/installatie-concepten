// Automatisch gegenereerd advies in één alinea (spec §6.2).
import { buildAdvice } from '../../model/kpis';
import { useStore } from '../../store';
import p from '../peakshaving.module.css';

export function AdviceBanner() {
  const analysis = useStore((st) => st.analysis);
  if (!analysis) return null;
  return (
    <section className={p.advice} aria-label="Advies" aria-live="polite">
      <p>
        {buildAdvice(analysis).map((part, i) =>
          part.strong ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>,
        )}
      </p>
    </section>
  );
}
