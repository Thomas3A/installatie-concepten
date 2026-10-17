// Automatisch gegenereerd advies in één alinea (spec §6.2). Op het scherm staat het oordeel (kop en detailzin); de
// alinea staat alleen nog op papier (UX-plan §4.6, §7 #4). Zonder aria-live: de statusregel van het oordeel meldt
// wijzigingen al.
import u from '../../../../ui/ui.module.css';
import { buildAdvice } from '../../model/kpis';
import { useStore } from '../../store';
import p from '../peakshaving.module.css';

export function AdviceBanner() {
  const analysis = useStore((st) => st.analysis);
  if (!analysis) return null;
  return (
    <section className={`${p.advice} ${u.printOnly}`} aria-label="Advies">
      <p>
        {buildAdvice(analysis).map((part, i) =>
          part.strong ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>,
        )}
      </p>
    </section>
  );
}
