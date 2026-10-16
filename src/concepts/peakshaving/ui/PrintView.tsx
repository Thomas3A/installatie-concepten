// Printweergave (spec §2.2): koude-weekgrafiek en gevoeligheidsgrafiek worden buiten beeld opgebouwd; zodra alle
// resultaten er zijn, opent het printvenster. Invoersamenvatting, KPI's, advies en robuustheidstabel staan al op de pagina.
// Het printen blijft nooit hangen: eindigt het gevoeligheidsraster in een fout, of komt er te lang geen voortgang,
// dan wordt zonder raster geprint (met een korte notitie).
import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { ColdWeekCharts } from './charts/ColdWeekCharts';
import { SensitivityChart } from './charts/SensitivityChart';
import p from './peakshaving.module.css';

/** Wachttijd zodat de grafieken getekend zijn voordat het printvenster opent [ms]. */
const DRAW_DELAY_MS = 600;
/** Zonder enige voortgang zo lang gewacht: printen met wat er is [ms]. */
export const PRINT_STALL_MS = 20000;

export function PrintView() {
  const printing = useStore((st) => st.printing);
  const analysis = useStore((st) => st.analysis);
  const busy = useStore((st) => st.busy);
  const error = useStore((st) => st.error);
  const sensitivity = useStore((st) => st.sensitivity);
  const endPrint = useStore((st) => st.endPrint);
  const [stalled, setStalled] = useState(false);

  const sensDone = !!sensitivity && sensitivity.done && !sensitivity.error;
  const sensError = sensitivity?.error ?? null;
  // zonder raster printen: het eindigde in een fout, of het duurde te lang
  const withoutGrid = !sensDone && (sensError !== null || stalled);
  const ready = !!analysis && (stalled || (!busy && (sensDone || withoutGrid)));

  // waakhond: elke voortgang (rij, doorrekening) zet de klok opnieuw
  useEffect(() => {
    if (!printing) {
      setStalled(false);
      return;
    }
    const t = window.setTimeout(() => setStalled(true), PRINT_STALL_MS);
    return () => window.clearTimeout(t);
  }, [printing, sensitivity, analysis, busy]);

  // niets om te printen (de eerste doorrekening mislukte, of bleef te lang uit): printen afbreken
  useEffect(() => {
    if (printing && !analysis && (stalled || (!busy && error))) endPrint();
  }, [printing, analysis, busy, error, stalled, endPrint]);

  useEffect(() => {
    if (!printing || !ready) return;
    // het printvenster sluiten (printen of annuleren) geeft afterprint → endPrint
    const t = window.setTimeout(() => window.print(), DRAW_DELAY_MS);
    return () => window.clearTimeout(t);
  }, [printing, ready]);

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
      {withoutGrid ? (
        <p>
          Het gevoeligheidsraster is niet opgenomen:{' '}
          {sensError !== null
            ? `de berekening gaf een fout. Melding: ${sensError}.`
            : 'de berekening duurde te lang.'}
        </p>
      ) : (
        <SensitivityChart print />
      )}
    </section>
  );
}
