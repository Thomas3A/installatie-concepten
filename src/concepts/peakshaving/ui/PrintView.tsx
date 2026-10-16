// Printweergave (spec §2.2): koude-weekgrafiek en gevoeligheidsgrafiek worden buiten beeld opgebouwd; zodra alle
// resultaten er zijn, opent het printvenster. Invoersamenvatting, KPI's, advies en robuustheidstabel staan al op de pagina.
import { useEffect } from 'react';
import { useStore } from '../store';
import { ColdWeekCharts } from './charts/ColdWeekCharts';
import { SensitivityChart } from './charts/SensitivityChart';
import p from './peakshaving.module.css';

/** Wachttijd zodat de grafieken getekend zijn voordat het printvenster opent [ms]. */
const DRAW_DELAY_MS = 600;

export function PrintView() {
  const printing = useStore((st) => st.printing);
  const analysis = useStore((st) => st.analysis);
  const busy = useStore((st) => st.busy);
  const done = useStore((st) => st.sensitivity?.done ?? false);
  const endPrint = useStore((st) => st.endPrint);

  useEffect(() => {
    if (!printing || !analysis || busy || !done) return;
    // het printvenster sluiten (printen of annuleren) geeft afterprint → endPrint
    const t = window.setTimeout(() => window.print(), DRAW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [printing, analysis, busy, done, endPrint]);

  useEffect(() => {
    if (!printing) return;
    window.addEventListener('afterprint', endPrint);
    return () => window.removeEventListener('afterprint', endPrint);
  }, [printing, endPrint]);

  if (!printing || !analysis) return null;
  return (
    <section className={p.printArea} aria-hidden="true">
      <h2>Koude week</h2>
      <ColdWeekCharts print />
      <h2>Gevoeligheid</h2>
      <SensitivityChart print />
    </section>
  );
}
