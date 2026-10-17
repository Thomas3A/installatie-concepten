// Robuustheid: dezelfde configuratie (WP vast) in energiejaar, T5 en T1 (spec §6.3). Ingeklapt in ResultMore, op
// papier open (data-print-open). De link "Robuustheid ▸" in het oordeel opent de tabel met openRobustness(): een
// DOM-gebeurtenis op window, zodat het oordeel geen ref of storeveld nodig heeft.
import { useEffect, useRef } from 'react';
import { fmt } from '../../../../core/format';
import { climateShortName } from '../../model/climate';
import { useStore } from '../../store';
import { ROBUSTNESS_NOTE } from '../../texts';
import { ScrollRegion } from '../../../../ui/ScrollRegion';
import u from '../../../../ui/ui.module.css';
import { prefersReducedMotion } from '../hooks';
import p from '../peakshaving.module.css';

/** Gebeurtenis (op window) die de robuustheidstabel openklapt, in beeld scrolt en de focus op de titel zet. */
export const OPEN_ROBUSTNESS_EVENT = 'ps:open-robustness';

/** Robuustheidstabel openen en erheen scrollen (doet niets als de tabel er niet is). */
export function openRobustness(): void {
  window.dispatchEvent(new Event(OPEN_ROBUSTNESS_EVENT));
}

export function RobustnessTable({ open = false }: { open?: boolean }) {
  const analysis = useStore((st) => st.analysis);
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const onOpen = (): void => {
      const details = ref.current;
      if (!details) return;
      details.open = true;
      details.scrollIntoView?.({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      details.querySelector('summary')?.focus({ preventScroll: true });
    };
    window.addEventListener(OPEN_ROBUSTNESS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ROBUSTNESS_EVENT, onOpen);
  }, []);

  if (!analysis) return null;
  const rows = analysis.robustness;
  return (
    // `open` alleen als begintoestand; daarna beslist de gebruiker (of openRobustness)
    <details
      ref={ref}
      className={u.acc}
      open={open || undefined}
      data-print-open=""
      style={{ scrollMarginTop: 12 }}
    >
      <summary>Robuustheid: zelfde configuratie in andere klimaatjaren</summary>
      <div className={u.accBody}>
        <p className={u.hint} style={{ margin: 0 }}>
          {ROBUSTNESS_NOTE(analysis.nominalKw)}
        </p>
        <ScrollRegion className={`${u.tableWrap} ${p.robustWrap}`} label="Robuustheid per klimaatjaar">
          {/* koppen met zachte afbreekstreepjes (\u00ad): ze breken af in plaats van de tabel te verbreden */}
          <table className={`${u.table} ${p.robustTable}`}>
            <thead>
              <tr>
                <th scope="col">Klimaatjaar</th>
                <th scope="col">Piek warmte{'\u00ad'}vraag [kW]</th>
                <th scope="col">Piek aan de meter [kW]</th>
                <th scope="col">Over{'\u00ad'}schrijding [uur/jaar]</th>
                <th scope="col">Comfort{'\u00ad'}verlies [uur/jaar]</th>
                <th scope="col">SCOP</th>
                <th scope="col">Elektri{'\u00ad'}citeit [kWh/jaar]</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.climateId} className={r.selected ? p.selectedRow : undefined}>
                  <th scope="row" style={{ fontWeight: r.selected ? 700 : 500 }}>
                    {climateShortName(r.climateId)}
                    {r.selected ? ' (gekozen)' : ''}
                  </th>
                  <td>{fmt(r.qIdealMaxKw, 1)}</td>
                  <td>{fmt(r.pGridMaxKw, 2)}</td>
                  <td>{fmt(r.exceedanceHours, 0)}</td>
                  <td>{fmt(r.comfortLossHours, 0)}</td>
                  <td>{fmt(r.scop, 2)}</td>
                  <td>{fmt(r.electricityKwh, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </div>
    </details>
  );
}
