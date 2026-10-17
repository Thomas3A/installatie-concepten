// Verdieping (UX-plan §2.1, §6): kop "Verdieping" met de keuze "Grafieken en kerngetallen" (de bedrijfsmodus; die geldt
// voor de grafieken en Alle kerngetallen, het oordeel toont altijd beide gevolgen) en daaronder de tabbladen Schema,
// Koude week, Jaar, Gevoeligheid en Uitleg. De tabrij scrolt horizontaal als hij niet past (telefoon).
import { useEffect, useRef, type KeyboardEvent } from 'react';
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
import { prefersReducedMotion } from '../hooks';
import { TOUR_ANCHORS, tourAnchor } from '../tour/anchors';
import css from './Depth.module.css';

/** Id van de kop "Verdieping": doel van "toon in grafieken" en "volledige gevoeligheid →". */
export const DEPTH_SECTION_ID = 'ps-verdieping';
// TODO(texts): naam van de regio en de tabrij (stond letterlijk in PeakshavingPage.tsx)
const DETAIL_LABEL = 'Detailweergave';

/** Tabbladen in de volgorde van TAB_LABELS: Schema (standaard), Koude week, Jaar, Gevoeligheid, Uitleg. */
export const DEPTH_TABS = Object.keys(TAB_LABELS) as TabId[];

/** Id van de tabknop (`ps-tab-{TabId}`) en van het paneel (`ps-panel-{TabId}`). */
export const tabButtonId = (t: TabId): string => `ps-tab-${t}`;
export const tabPanelId = (t: TabId): string => `ps-panel-${t}`;

const MODE_OPTIONS: { value: OperatingMode; label: string }[] = [
  { value: 'exceedance', label: UI_LABELS.modeOptions.exceedance },
  { value: 'limited', label: UI_LABELS.modeOptions.limited },
];

/**
 * Tabblad kiezen, Verdieping in beeld scrollen (direct bij prefers-reduced-motion) en de focus op het tabblad zetten.
 * Voor links buiten deze sectie, zoals "toon in grafieken" in het oordeel.
 */
export function showInDepth(tab: TabId): void {
  useStore.getState().setTab(tab);
  document
    .getElementById(DEPTH_SECTION_ID)
    ?.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  document.getElementById(tabButtonId(tab))?.focus({ preventScroll: true });
}

/** Volgend tabblad bij een pijltoets, Home of End (roving tabindex); null bij een andere toets. */
function nextTab(current: TabId, key: string): TabId | null {
  const n = DEPTH_TABS.length;
  const i = DEPTH_TABS.indexOf(current);
  if (key === 'ArrowRight') return DEPTH_TABS[(i + 1) % n];
  if (key === 'ArrowLeft') return DEPTH_TABS[(i - 1 + n) % n];
  if (key === 'Home') return DEPTH_TABS[0];
  if (key === 'End') return DEPTH_TABS[n - 1];
  return null;
}

/** Het gekozen tabblad in een scrollende tabrij in beeld houden, zonder de pagina zelf te scrollen. */
function keepTabVisible(row: HTMLElement, tab: HTMLElement): void {
  if (row.scrollWidth <= row.clientWidth) return;
  // ruimte naast het tabblad, zodat ook zichtbaar is dat er nog meer tabbladen zijn
  const margin = 24;
  // de tabrij is position: relative, dus offsetLeft telt vanaf de tabrij
  const left = tab.offsetLeft;
  const right = left + tab.offsetWidth;
  if (left - margin < row.scrollLeft) row.scrollLeft = Math.max(0, left - margin);
  else if (right + margin > row.scrollLeft + row.clientWidth)
    row.scrollLeft = right + margin - row.clientWidth;
}

export function DepthSection() {
  const tab = useStore((st) => st.tab);
  const setTab = useStore((st) => st.setTab);
  const mode = useStore((st) => st.input.grid.mode);
  const update = useStore((st) => st.update);
  const row = useRef<HTMLDivElement>(null);

  /** Tabknop in deze tabrij (niet een ander element met hetzelfde id). */
  const tabButton = (t: TabId): HTMLElement | null =>
    row.current?.querySelector<HTMLElement>(`[id="${tabButtonId(t)}"]`) ?? null;

  // ook bij een tabblad dat van buiten wordt gekozen ("volledige gevoeligheid →")
  useEffect(() => {
    const btn = row.current?.querySelector<HTMLElement>(`[id="${tabButtonId(tab)}"]`);
    if (row.current && btn) keepTabVisible(row.current, btn);
  }, [tab]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const next = nextTab(tab, e.key);
    if (!next) return;
    e.preventDefault();
    setTab(next);
    tabButton(next)?.focus();
  };

  const setMode = (m: OperatingMode): void => {
    // nogmaals dezelfde keuze: geen invoerwijziging (anders vervalt het voorbeeld en het ongedaan maken)
    if (m === mode) return;
    update((i) => ({ ...i, grid: { ...i.grid, mode: m } }));
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
      <section className={css.detail} aria-label={DETAIL_LABEL}>
        <div
          ref={row}
          className={`${u.tabList} ${css.tabList}`}
          role="tablist"
          aria-label={DETAIL_LABEL}
          onKeyDown={onKeyDown}
        >
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
