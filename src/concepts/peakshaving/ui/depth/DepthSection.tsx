// Verdieping (UX-plan §2.1, §6): kop "Verdieping" met de keuze "Grafieken en kerngetallen" (de bedrijfsmodus; die geldt
// voor de grafieken en Alle kerngetallen, het oordeel toont altijd beide gevolgen) en daaronder de tabbladen Schema,
// Koude week, Jaar, Gevoeligheid en Uitleg. Ids, toetsenbord en roving tabindex zoals de tabrij die eerst op de
// pagina stond.
import type { KeyboardEvent } from 'react';
import { SegField } from '../../../../ui/fields';
import u from '../../../../ui/ui.module.css';
import type { OperatingMode } from '../../model/types';
import { useStore, type TabId } from '../../store';
import { HELP, STEP_TITLES, TAB_LABELS, UI_LABELS } from '../../texts';
import { ColdWeekCharts } from '../charts/ColdWeekCharts';
import { SensitivityChart } from '../charts/SensitivityChart';
import { YearCharts } from '../charts/YearCharts';
import { ConceptDiagram } from '../concept/ConceptDiagram';
import { ExplainTab } from '../explain/ExplainTab';
import { TOUR_ANCHORS, tourAnchor } from '../tour/anchors';
import css from './Depth.module.css';
import { DEPTH_SECTION_ID, DEPTH_TABS, tabButtonId, tabPanelId } from './depthLinks';

const MODE_OPTIONS: { value: OperatingMode; label: string }[] = [
  { value: 'exceedance', label: UI_LABELS.modeOptions.exceedance },
  { value: 'limited', label: UI_LABELS.modeOptions.limited },
];

/** Volgend tabblad bij een pijltoets, Home of End (rondgaand); null bij een andere toets. */
function nextTab(current: TabId, key: string): TabId | null {
  const n = DEPTH_TABS.length;
  const i = DEPTH_TABS.indexOf(current);
  if (key === 'ArrowRight') return DEPTH_TABS[(i + 1) % n];
  if (key === 'ArrowLeft') return DEPTH_TABS[(i - 1 + n) % n];
  if (key === 'Home') return DEPTH_TABS[0];
  if (key === 'End') return DEPTH_TABS[n - 1];
  return null;
}

export function DepthSection() {
  const tab = useStore((st) => st.tab);
  const setTab = useStore((st) => st.setTab);
  const mode = useStore((st) => st.input.grid.mode);
  // weergavekeuze: het voorbeeld, de eigen invoer en het ongedaan maken blijven staan (store.setMode)
  const setMode = useStore((st) => st.setMode);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const next = nextTab(tab, e.key);
    if (!next) return;
    e.preventDefault();
    setTab(next);
    document.getElementById(tabButtonId(next))?.focus();
  };

  return (
    // een <div> met een kop, geen eigen regio: binnen "Resultaat" is alleen "Detailweergave" een regio (§2.1)
    <div className={`${u.card} ${css.depth} noPrint`} {...tourAnchor(TOUR_ANCHORS.depth)}>
      <div className={css.head}>
        <h2 className={css.title} id={DEPTH_SECTION_ID} tabIndex={-1}>
          {STEP_TITLES.depth}
        </h2>
        <div className={css.mode}>
          <SegField<OperatingMode>
            label={UI_LABELS.modeField}
            info={HELP.mode}
            value={mode}
            options={MODE_OPTIONS}
            onChange={setMode}
          />
        </div>
      </div>
      <section aria-label={UI_LABELS.detailView}>
        <div className={u.tabList} role="tablist" aria-label={UI_LABELS.detailView} onKeyDown={onKeyDown}>
          {DEPTH_TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              id={tabButtonId(t)}
              aria-selected={tab === t}
              aria-controls={tabPanelId(t)}
              tabIndex={tab === t ? 0 : -1}
              className={u.tab}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
        <div role="tabpanel" id={tabPanelId(tab)} aria-labelledby={tabButtonId(tab)}>
          {tab === 'concept' && <ConceptDiagram />}
          {tab === 'koude-week' && <ColdWeekCharts />}
          {tab === 'jaar' && <YearCharts />}
          {tab === 'gevoeligheid' && <SensitivityChart />}
          {tab === 'uitleg' && <ExplainTab />}
        </div>
      </section>
    </div>
  );
}
