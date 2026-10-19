// Robuustheid: dezelfde configuratie (WP vast) in energiejaar, T5, T1 en de stresstestjaren 1978/79 en 1962/63
// (spec §6.3). Ingeklapt in ResultMore, direct onder de oordeelkaart (met de regel voor de strenge winter); op papier open
// (data-print-open).
import { fmt } from '../../../../core/format';
import { climateShortName } from '../../model/climate';
import { useStore } from '../../store';
import { ROBUSTNESS_NOTE } from '../../texts';
import { ScrollRegion } from '../../../../ui/ScrollRegion';
import u from '../../../../ui/ui.module.css';
import p from '../peakshaving.module.css';

export function RobustnessTable({ open = false }: { open?: boolean }) {
  const analysis = useStore((st) => st.analysis);

  if (!analysis) return null;
  const rows = analysis.robustness;
  return (
    // `open` alleen als begintoestand; daarna beslist de gebruiker
    <details className={u.acc} open={open || undefined} data-print-open="">
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
