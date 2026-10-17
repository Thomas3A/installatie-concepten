// Verwijzingen naar Verdieping vanuit andere blokken ("toon in grafieken" in het oordeel, "volledige gevoeligheid →"
// bij de bufferschuif). Bewust een lichte module zonder de grafieken (uPlot), zodat die blokken hem goedkoop kunnen
// importeren; DepthSection gebruikt dezelfde ids.
import { useStore, type TabId } from '../../store';
import { TAB_LABELS } from '../../texts';
import { prefersReducedMotion } from '../hooks';

/** Id van de kop "Verdieping": doel van "toon in grafieken" en "volledige gevoeligheid →". */
export const DEPTH_SECTION_ID = 'ps-verdieping';

/** Tabbladen in de volgorde van TAB_LABELS: Schema (standaard), Koude week, Jaar, Gevoeligheid, Uitleg. */
export const DEPTH_TABS = Object.keys(TAB_LABELS) as TabId[];

/** Id van de tabknop (`ps-tab-{TabId}`) en van het paneel (`ps-panel-{TabId}`). */
export const tabButtonId = (t: TabId): string => `ps-tab-${t}`;
export const tabPanelId = (t: TabId): string => `ps-panel-${t}`;

/**
 * Tabblad kiezen, Verdieping in beeld scrollen (direct bij prefers-reduced-motion) en de focus op het tabblad zetten,
 * zonder dat de focus de pagina nog een keer verschuift.
 */
export function showInDepth(tab: TabId): void {
  useStore.getState().setTab(tab);
  document
    .getElementById(DEPTH_SECTION_ID)
    ?.scrollIntoView?.({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  document.getElementById(tabButtonId(tab))?.focus({ preventScroll: true });
}
