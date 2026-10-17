// Pagina van concept 2: peakshaving van een lucht/water-warmtepomp met warmtebuffer en batterij.
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { fmt } from '../../../core/format';
import u from '../../../ui/ui.module.css';
import { connectionLabel, gridLimitKw } from '../model/grid';
import { buildingText } from '../model/kpis';
import { SCENARIOS } from '../scenarios';
import { shareUrl } from '../share';
import { startEngine, useStore, type TabId } from '../store';
import { EMITTER_PRESETS } from '../data/heatPumpCurves';
import { PAGE_SUBTITLE, PAGE_TITLE, TAB_LABELS } from '../texts';
import { ClimateNote, ClimateSelect } from './ClimateSelect';
import { BuildingPanel } from './inputs/BuildingPanel';
import { GridPanel } from './inputs/GridPanel';
import { HeatPumpPanel } from './inputs/HeatPumpPanel';
import { MeasuresPanel } from './inputs/MeasuresPanel';
import { AdviceBanner } from './results/AdviceBanner';
import { KpiCards } from './results/KpiCards';
import { Messages } from './results/Messages';
import { RobustnessTable } from './results/RobustnessTable';
import { ColdWeekCharts } from './charts/ColdWeekCharts';
import { SensitivityChart } from './charts/SensitivityChart';
import { YearCharts } from './charts/YearCharts';
import { ConceptDiagram } from './concept/ConceptDiagram';
import { ExplainTab } from './explain/ExplainTab';
import { PrintView } from './PrintView';
import p from './peakshaving.module.css';

const TABS = Object.keys(TAB_LABELS) as TabId[];

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
  const tab = useStore((st) => st.tab);
  const setTab = useStore((st) => st.setTab);
  const scenarioId = useStore((st) => st.scenarioId);
  const applyScenario = useStore((st) => st.applyScenario);
  const fromShareHash = useStore((st) => st.fromShareHash);
  const input = useStore((st) => st.input);
  const busy = useStore((st) => st.busy);
  const error = useStore((st) => st.error);
  const retry = useStore((st) => st.retry);
  const copied = useStore((st) => st.copied);
  const markCopied = useStore((st) => st.markCopied);
  const printing = useStore((st) => st.printing);
  const requestPrint = useStore((st) => st.requestPrint);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [shareErr, setShareErr] = useState(false);
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

  const scenario = SCENARIOS.find((s) => s.id === scenarioId);

  const share = async (): Promise<void> => {
    const url = shareUrl(input);
    try {
      await navigator.clipboard.writeText(url);
      setShareErr(false);
    } catch {
      setShareErr(true);
      window.prompt('Kopieer deze link:', url);
    }
    markCopied(true);
    window.setTimeout(() => markCopied(false), 2500);
  };

  return (
    <main className={p.page}>
      <div className={`${u.topbar} noPrint`}>
        <div>
          <h1>{PAGE_TITLE}</h1>
          <div className={u.sub}>{PAGE_SUBTITLE}</div>
        </div>
        <span className={u.spacer} />
        <div className={p.headControls}>
          <ClimateSelect />
          <label className={p.headField}>
            Scenario&apos;s
            <select
              className={u.select}
              value={scenarioId ?? ''}
              onChange={(e) => e.target.value && applyScenario(e.target.value)}
            >
              {scenarioId === null && <option value="">Eigen invoer</option>}
              {SCENARIOS.map((sc, i) => (
                <option key={sc.id} value={sc.id}>
                  {`${i + 1}. ${sc.title}`}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={u.btn} onClick={share} aria-live="polite">
            {copied ? (shareErr ? 'Link getoond' : '✓ Link gekopieerd') : 'Deel link'}
          </button>
          <button
            type="button"
            className={u.btn}
            onClick={requestPrint}
            disabled={printing}
            aria-live="polite"
          >
            {printing ? 'Printversie voorbereiden…' : 'Print / PDF'}
          </button>
        </div>
      </div>
      <div className="noPrint">
        <ClimateNote />
      </div>
      {scenario && (
        <section className={`${u.card} ${u.scenario} noPrint`} aria-label="Scenario">
          <strong>{scenario.title}</strong> — {scenario.description}
        </section>
      )}
      <PrintSummary />

      <div className={p.layout}>
        <section className={`${p.inputs} noPrint`} aria-label="Invoer">
          <BuildingPanel />
          <GridPanel />
          <HeatPumpPanel />
          <MeasuresPanel />
        </section>
        <section className={p.results} aria-label="Resultaat" aria-busy={busy}>
          <div className={`${p.statusRow} noPrint`}>
            {busy && <span className={p.busy}>Rekent…</span>}
            {error && <span className={u.pill + ' ' + u.pillErr}>Rekenfout: {error}</span>}
            {error && !busy && (
              <button type="button" className={`${u.btnLink} ${p.retry}`} onClick={retry}>
                Opnieuw proberen
              </button>
            )}
          </div>
          <KpiCards />
          <AdviceBanner />
          <RobustnessTable />
          <div className="noPrint">
            <Messages />
          </div>
          <section className={`${u.card} noPrint`} aria-label="Detailweergave">
            <div
              className={u.tabList}
              role="tablist"
              aria-label="Detailweergave"
              onKeyDown={(e) => {
                const i = TABS.indexOf(tab);
                let n = i;
                if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
                else if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
                else if (e.key === 'Home') n = 0;
                else if (e.key === 'End') n = TABS.length - 1;
                else return;
                e.preventDefault();
                setTab(TABS[n]);
                document.getElementById(`ps-tab-${TABS[n]}`)?.focus();
              }}
            >
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  id={`ps-tab-${t}`}
                  aria-selected={tab === t}
                  aria-controls={`ps-panel-${t}`}
                  tabIndex={tab === t ? 0 : -1}
                  className={u.tab}
                  onClick={() => setTab(t)}
                >
                  {TAB_LABELS[t]}
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`ps-panel-${tab}`} aria-labelledby={`ps-tab-${tab}`}>
              {tab === 'koude-week' && <ColdWeekCharts />}
              {tab === 'jaar' && <YearCharts />}
              {tab === 'gevoeligheid' && <SensitivityChart />}
              {tab === 'concept' && <ConceptDiagram />}
              {tab === 'uitleg' && <ExplainTab />}
            </div>
          </section>
        </section>
      </div>
      <PrintView />
    </main>
  );
}
