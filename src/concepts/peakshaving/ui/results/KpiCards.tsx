// Rij van acht KPI-kaarten met kleurcodering en secundaire regels (spec §6.1).
import { useMemo } from 'react';
import { buildKpiCards } from '../../model/kpis';
import { useStore } from '../../store';
import p from '../peakshaving.module.css';

export function KpiCards() {
  const analysis = useStore((st) => st.analysis);
  const cards = useMemo(() => (analysis ? buildKpiCards(analysis) : []), [analysis]);
  if (!analysis) return null;
  return (
    <section className={p.kpiRow} aria-label="Kerngetallen">
      {cards.map((c) => (
        <article key={c.id} className={`${p.kpiCard} ${p[`status-${c.status}`] ?? ''}`} aria-label={c.title}>
          <div className={p.kpiTitle}>
            <span>{c.title}</span>
            {c.statusText && <span className={p.kpiStatus}>{c.statusText}</span>}
          </div>
          <div className={p.kpiValue}>
            {c.value}
            {c.unit && <span className={p.kpiUnit}>{c.unit}</span>}
          </div>
          {c.lines.map((l, i) => (
            <div key={i} className={p.kpiLine}>
              {l.strike ? <s>{l.text}</s> : l.text}
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}
