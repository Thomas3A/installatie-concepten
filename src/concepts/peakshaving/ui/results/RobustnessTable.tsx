// Robuustheid: dezelfde configuratie (WP vast) in energiejaar, T5 en T1 (spec §6.3).
import { fmt } from '../../../../core/format';
import { climateShortName } from '../../model/climate';
import { useStore } from '../../store';
import { MODE_LABELS } from '../../texts';
import u from '../../../../ui/ui.module.css';
import p from '../peakshaving.module.css';

export function RobustnessTable({ open = false }: { open?: boolean }) {
  const analysis = useStore((st) => st.analysis);
  if (!analysis) return null;
  const rows = analysis.robustness;
  return (
    <details className={u.acc} open={open} data-print-open="">
      <summary>Robuustheid: zelfde configuratie in andere klimaatjaren</summary>
      <div className={u.accBody}>
        <p className={u.hint} style={{ margin: 0 }}>
          WP-vermogen vast op {fmt(analysis.nominalKw, 1)} kW (A7/W35). Piek aan de meter, SCOP en
          elektriciteit in de gekozen modus ({MODE_LABELS[analysis.main.mode]}); uren overschrijding zonder
          begrenzer en uren comfortverlies als de aansluiting begrenst.
        </p>
        <div className={u.tableWrap}>
          <table className={u.table}>
            <thead>
              <tr>
                <th scope="col">Klimaatjaar</th>
                <th scope="col">Piek warmtevraag [kW]</th>
                <th scope="col">Piek aan de meter [kW]</th>
                <th scope="col">Uren overschrijding (zonder begrenzer)</th>
                <th scope="col">Uren comfortverlies (bij begrenzen)</th>
                <th scope="col">SCOP</th>
                <th scope="col">Elektriciteit [kWh/jaar]</th>
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
        </div>
      </div>
    </details>
  );
}
