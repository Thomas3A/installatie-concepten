// Keuzelijst klimaatjaar (spec §4.3), met de statistiek van het gekozen jaar als tooltip en in een regel eronder.
// ClimateField en ClimateStats staan in Meer instellingen › Klimaat (UX-plan §3.2); ClimateSelect en ClimateNote zijn
// de oude kop-versies en verdwijnen bij de integratie (WP-F).
import { useId } from 'react';
import { fmt } from '../../../core/format';
import { Field } from '../../../ui/fields';
import { REAL_YEAR_STATS, REFERENCE_YEAR_STATS, type ClimateStatsSummary } from '../data/climateStats';
import {
  climateShortName,
  isReferenceYear,
  REAL_YEAR_FIRST,
  REAL_YEAR_LAST,
  realYearId,
  realYearOf,
  RECOMMENDED_STRESS_YEARS,
  REFERENCE_YEAR_LABELS,
  REFERENCE_YEARS,
} from '../model/climate';
import type { ClimateYearId } from '../model/types';
import { useStore } from '../store';
import { CLIMATE_NOTE, CLIMATE_NOTE_SHORT, CLIMATE_RECONSTRUCTION } from '../texts';
import u from '../../../ui/ui.module.css';
import b from './basis/Basis.module.css';
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

/** Statistiek van een klimaatjaar (referentiejaar of werkelijk jaar); null bij een onbekend id. */
export function statsOf(id: ClimateYearId): ClimateStatsSummary | null {
  if (isReferenceYear(id)) return REFERENCE_YEAR_STATS[id];
  const y = realYearOf(id);
  return y === null ? null : (REAL_YEAR_STATS[y] ?? null);
}

/** id van de statistiekregel onder de kop (beschrijving van de keuzelijst). */
const STATS_ID = 'ps-klimaat-statistiek';

const REAL_YEARS = Array.from(
  { length: REAL_YEAR_LAST - REAL_YEAR_FIRST + 1 },
  (_, i) => REAL_YEAR_FIRST + i,
);

/** Tooltip van de keuzelijst: de statistiek van het gekozen jaar en de reconstructiezin. */
function selectTitle(id: ClimateYearId): string {
  const stats = statsOf(id);
  return stats ? `${statsLine(stats)}. ${CLIMATE_RECONSTRUCTION}` : CLIMATE_RECONSTRUCTION;
}

/** Alle 38 klimaatjaren: drie referentiejaren en de werkelijke jaren (★ = aanbevolen stresstest), elk met tooltip. */
function ClimateOptions() {
  return (
    <>
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
    </>
  );
}

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
        // de tooltips op de opties tonen veel browsers niet: de statistiek van het gekozen jaar staat daarom
        // ook op de keuzelijst zelf en in de regel onder de kop (ClimateNote)
        title={selectTitle(id)}
        aria-describedby={STATS_ID}
      >
        <ClimateOptions />
      </select>
    </label>
  );
}

/**
 * Veld Klimaatjaar in Meer instellingen › Klimaat: zelfde label, opties en tooltips als de keuzelijst in de kop. De
 * statistiekregel (ClimateStats) beschrijft de keuzelijst.
 */
export function ClimateField() {
  const id = useStore((st) => st.input.climateYear);
  const setClimateYear = useStore((st) => st.setClimateYear);
  const selectId = useId();
  return (
    <Field label="Klimaatjaar" htmlFor={selectId}>
      <select
        id={selectId}
        className={`${u.select} ${b.climateSelect}`}
        value={id}
        onChange={(e) => setClimateYear(e.target.value)}
        title={selectTitle(id)}
        aria-describedby={STATS_ID}
      >
        <ClimateOptions />
      </select>
    </Field>
  );
}

/**
 * Statistiek van het gekozen klimaatjaar ("Klimaatjaar T5: T gem. …") en de noot van één regel, onder het veld
 * Klimaatjaar. De reconstructiezin staat in de tooltip en in de footer.
 */
export function ClimateStats() {
  const id = useStore((st) => st.input.climateYear);
  const stats = statsOf(id);
  return (
    <div className={b.climateStats}>
      <p id={STATS_ID}>
        <strong>Klimaatjaar {climateShortName(id)}:</strong> {stats ? statsLine(stats) : '–'}
      </p>
      <p>{CLIMATE_NOTE_SHORT}</p>
    </div>
  );
}

export function ClimateNote() {
  const id = useStore((st) => st.input.climateYear);
  const stats = statsOf(id);
  return (
    <div className={p.climateNote}>
      <p className={p.climateStats} id={STATS_ID}>
        <strong>Klimaatjaar {climateShortName(id)}:</strong> {stats ? statsLine(stats) : '–'}
      </p>
      <p>
        {CLIMATE_NOTE} {CLIMATE_RECONSTRUCTION} ★ = aanbevolen stresstest.
      </p>
    </div>
  );
}
