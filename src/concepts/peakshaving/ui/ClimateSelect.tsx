// Keuzelijst klimaatjaar in de kop (spec §4.3), met de statistiek als tooltip.
import { fmt } from '../../../core/format';
import { REAL_YEAR_STATS, REFERENCE_YEAR_STATS, type ClimateStatsSummary } from '../data/climateStats';
import {
  REAL_YEAR_FIRST,
  REAL_YEAR_LAST,
  realYearId,
  RECOMMENDED_STRESS_YEARS,
  REFERENCE_YEAR_LABELS,
  REFERENCE_YEARS,
} from '../model/climate';
import { useStore } from '../store';
import { CLIMATE_NOTE, CLIMATE_RECONSTRUCTION } from '../texts';
import u from '../../../ui/ui.module.css';
import p from './peakshaving.module.css';

/** Statistiekregel voor de tooltip (zoals de tabel in spec §4.2). */
export function statsLine(s: ClimateStatsSummary): string {
  return (
    `T gem. ${fmt(s.Tgem, 2)} °C · T min ${fmt(s.Tmin, 1)} °C · ${fmt(s.uren_onder_0, 0)} uur < 0 °C · ` +
    `${fmt(s.uren_onder_min5, 0)} uur < −5 °C · ${fmt(s.uren_onder_min10, 0)} uur < −10 °C · ` +
    `koudste 24 u ${fmt(s.koudste_24u, 1)} °C · koudste 72 u ${fmt(s.koudste_72u, 1)} °C · ` +
    `koudste week ${fmt(s.koudste_168u, 1)} °C · ${fmt(s.graaddagen_18, 0)} graaddagen (18 °C)`
  );
}

const REAL_YEARS = Array.from(
  { length: REAL_YEAR_LAST - REAL_YEAR_FIRST + 1 },
  (_, i) => REAL_YEAR_FIRST + i,
);

export function ClimateSelect() {
  const id = useStore((st) => st.input.climateYear);
  const setClimateYear = useStore((st) => st.setClimateYear);
  return (
    <label className={p.headField}>
      Klimaatjaar
      <select
        className={u.select}
        value={id}
        onChange={(e) => setClimateYear(e.target.value)}
        title={CLIMATE_RECONSTRUCTION}
      >
        <optgroup label="Referentiejaren (reconstructie NEN 5060:2018)">
          {REFERENCE_YEARS.map((y) => (
            <option key={y} value={y} title={statsLine(REFERENCE_YEAR_STATS[y])}>
              {REFERENCE_YEAR_LABELS[y]}
            </option>
          ))}
        </optgroup>
        <optgroup label="Werkelijk jaar KNMI De Bilt (stresstest met echt weer)">
          {REAL_YEARS.map((y) => {
            const s = REAL_YEAR_STATS[y];
            const star = RECOMMENDED_STRESS_YEARS.includes(y);
            return (
              <option key={y} value={realYearId(y)} title={statsLine(s)}>
                {`${y}${star ? ' ★' : ''} — T min ${fmt(s.Tmin, 1)} °C, koudste week ${fmt(s.koudste_168u, 1)} °C`}
              </option>
            );
          })}
        </optgroup>
      </select>
    </label>
  );
}

export function ClimateNote() {
  return (
    <p className={p.climateNote}>
      {CLIMATE_NOTE} {CLIMATE_RECONSTRUCTION} ★ = aanbevolen stresstest.
    </p>
  );
}
