// Keuzelijst "Voorbeelden" in de kop (UX-plan §6): optgroups per gebouwfunctie met de korte titel als optietekst en
// de toelichting als title. Bij eigen invoer staat bovenaan "Eigen invoer"; is er eigen invoer bewaard (na het laden
// van een voorbeeld of een andere gebouwfunctie), dan ook "↩ Je eigen invoer (bewaard)", die hem terugzet.
import u from '../../../../ui/ui.module.css';
import type { BuildingKind } from '../../model/types';
import { SCENARIOS } from '../../scenarios';
import { useStore } from '../../store';
import { EXAMPLES_TEXTS } from '../../texts';
import { tourAnchor } from '../tour/anchors';
import css from './Shell.module.css';

/** Waarde van de optie "Eigen invoer" (de huidige invoer is geen voorbeeld). */
export const OWN_INPUT_VALUE = '';
/** Waarde van de optie "↩ Je eigen invoer (bewaard)". */
export const RESTORE_OWN_INPUT_VALUE = 'eigen-invoer-terug';

/** Volgorde van de groepen in de lijst. */
const GROUPS: readonly BuildingKind[] = ['single', 'multi', 'office'];

export function ExamplesSelect() {
  const scenarioId = useStore((st) => st.scenarioId);
  const hasOwnInput = useStore((st) => st.ownInput !== null);
  const applyScenario = useStore((st) => st.applyScenario);
  const restoreOwnInput = useStore((st) => st.restoreOwnInput);
  const current = SCENARIOS.find((sc) => sc.id === scenarioId);

  const onChange = (value: string): void => {
    if (value === OWN_INPUT_VALUE) return;
    if (value === RESTORE_OWN_INPUT_VALUE) restoreOwnInput();
    else applyScenario(value);
  };

  return (
    <label className={css.examples} {...tourAnchor('examples')}>
      {EXAMPLES_TEXTS.label}
      <select
        className={`${u.select} ${css.examplesSelect}`}
        value={current ? current.id : OWN_INPUT_VALUE}
        // de toelichting van het gekozen voorbeeld bij aanwijzen met de muis
        title={current?.description}
        onChange={(e) => onChange(e.target.value)}
      >
        {!current && <option value={OWN_INPUT_VALUE}>{EXAMPLES_TEXTS.ownInput}</option>}
        {hasOwnInput && <option value={RESTORE_OWN_INPUT_VALUE}>{EXAMPLES_TEXTS.savedOwnInput}</option>}
        {GROUPS.map((group) => {
          const items = SCENARIOS.filter((sc) => sc.group === group);
          if (items.length === 0) return null;
          return (
            <optgroup key={group} label={EXAMPLES_TEXTS.groups[group]}>
              {items.map((sc) => (
                <option key={sc.id} value={sc.id} title={sc.description}>
                  {sc.shortTitle}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </label>
  );
}
