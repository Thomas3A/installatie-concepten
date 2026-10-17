// Pagina van concept 2: peakshaving van een lucht/water-warmtepomp met warmtebuffer en batterij.
// Eén pagina in drie stappen (UX-plan §2.1): Basis bovenaan over de volle breedte, daaronder Resultaat en Wat als?
// naast elkaar (de werkbank), daaronder Verdieping. DOM-volgorde = tabvolgorde = printvolgorde.
import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { fmt } from '../../../core/format';
import u from '../../../ui/ui.module.css';
import { connectionLabel, gridLimitKw } from '../model/grid';
import { buildingText } from '../model/kpis';
import { startEngine, useStore } from '../store';
import { EMITTER_PRESETS } from '../data/heatPumpCurves';
import { PAGE_TITLE } from '../texts';
import { BasisSection } from './basis/BasisSection';
import { DepthSection } from './depth/DepthSection';
import { MiniVerdictBar } from './result/MiniVerdictBar';
import { ResultMore } from './result/ResultMore';
import { VerdictCard } from './result/VerdictCard';
import { PageHeader } from './shell/PageHeader';
import { SkipLink } from './shell/SkipLink';
import { SmallScreenNotice } from './shell/SmallScreenNotice';
import { UndoToast } from './shell/UndoToast';
import { WhatIfPanel } from './whatif/WhatIfPanel';
import { PrintView } from './PrintView';
import p from './peakshaving.module.css';

function PrintSummary() {
  const input = useStore((st) => st.input);
  const a = useStore((st) => st.analysis);
  const b = input.building;
  // meerdere woningen: totalen van het gebouw, met de waarde per woning erbij
  const n = b.use === 'office' ? 1 : b.dwellings;
  const perDwelling = (x: number, digits: number, unit: string): string =>
    n > 1 ? ` (${fmt(x / n, digits)} ${unit} per woning)` : '';
  return (
    <section className={u.printOnly} aria-hidden="true">
      <h1>Installatieconcepten — {PAGE_TITLE}</h1>
      <p>
        {buildingText(b)} · piekvermogen {fmt(b.designLoadKw, 1)} kW{perDwelling(b.designLoadKw, 1, 'kW')} ·
        klimaatjaar {a?.climateName ?? input.climateYear} · aansluiting {connectionLabel(input.grid)} (
        {fmt(input.grid.heatPumpShare * 100, 0)} % voor de WP, budget {fmt(gridLimitKw(input.grid), 2)} kW) ·
        stooklijn {EMITTER_PRESETS[input.heatPump.emitterPreset].label} · max. aanvoer{' '}
        {fmt(input.heatPump.maxSupplyC, 0)} °C · WP{' '}
        {input.heatPump.sizingMode === 'auto' ? 'automatisch' : 'handmatig'}{' '}
        {a ? `${fmt(a.nominalKw, 1)} kW` : ''} · buffer {fmt(input.buffer.volumeM3, 2)} m³ (
        {input.buffer.strategy === 'predictive' ? 'voorspellend' : 'altijd'}) · batterij{' '}
        {fmt(input.battery.capacityKwh, 1)} kWh · modus{' '}
        {input.grid.mode === 'exceedance' ? 'overschrijding tonen' : 'aansluiting begrenst'}
        {b.dhw.enabled
          ? ` · tapwater ${fmt(b.dhw.dailyKwh, 1)} kWh/dag${perDwelling(b.dhw.dailyKwh, 1, 'kWh/dag')}, ${
              n > 1 ? 'collectieve boiler' : 'boiler'
            } ${fmt(b.dhw.tankLitre, 0)} l`
          : ''}
        .
      </p>
    </section>
  );
}

export default function PeakshavingPage() {
  const fromShareHash = useStore((st) => st.fromShareHash);
  const busy = useStore((st) => st.busy);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const lastCode = useRef<string | null>(null);
  const loadedFromLink = useRef(false);

  // invoer uit de URL (#/peakshaving?c=...); ook als de link in dezelfde tab wordt vervangen.
  // Na het inlezen gaat ?c= uit de adresbalk: anders zet herladen (F5) de gedeelde invoer terug over de
  // wijzigingen van de gebruiker heen, en deelt wie de adresbalk kopieert een verouderde toestand.
  useEffect(() => {
    const code = params.get('c');
    if (code) {
      if (code !== lastCode.current) {
        lastCode.current = code;
        loadedFromLink.current = fromShareHash(code);
      }
      const rest = new URLSearchParams(params);
      rest.delete('c');
      const search = rest.toString();
      navigate({ pathname, search: search ? `?${search}` : '' }, { replace: true });
      return;
    }
    lastCode.current = null;
    // de gedeelde invoer rekent al; niet nog een keer starten
    if (loadedFromLink.current) {
      loadedFromLink.current = false;
      return;
    }
    startEngine();
  }, [params, pathname, navigate, fromShareHash]);

  useEffect(() => {
    document.title = 'Peakshaving · Installatieconcepten';
    // printen op A4 staand (zie peakshaving.module.css)
    document.body.classList.add('ps-print-page');
    return () => document.body.classList.remove('ps-print-page');
  }, []);

  // printen (ook met Ctrl+P): inklapbare blokken met data-print-open tijdelijk openklappen
  useEffect(() => {
    let opened: HTMLDetailsElement[] = [];
    const before = (): void => {
      opened = Array.from(document.querySelectorAll<HTMLDetailsElement>('details[data-print-open]')).filter(
        (d) => !d.open,
      );
      opened.forEach((d) => (d.open = true));
    };
    const after = (): void => {
      opened.forEach((d) => (d.open = false));
      opened = [];
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  return (
    <main className={p.page}>
      {/* alleen op een telefoon of tablet zichtbaar (CSS); niet focusbaar, dus de skip-link blijft vooraan */}
      <SmallScreenNotice />
      <SkipLink />
      <PageHeader />
      <PrintSummary />
      <BasisSection />
      <section className={p.results} aria-label="Resultaat" aria-busy={busy}>
        {/* werkbank: oordeel en "meer" links, Wat als? rechts over beide rijen; op papier onder elkaar */}
        <div className={p.workbench}>
          <div className={p.verdict}>
            <VerdictCard />
          </div>
          <div className={`${p.whatif} noPrint`}>
            <WhatIfPanel />
          </div>
          <div className={p.more}>
            <ResultMore />
          </div>
        </div>
        <DepthSection />
      </section>
      <MiniVerdictBar />
      <UndoToast />
      <PrintView />
    </main>
  );
}
