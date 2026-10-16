// Pagina van concept 2: peakshaving van een lucht/water-warmtepomp met warmtebuffer en batterij.
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fmt } from '../../../core/format';
import u from '../../../ui/ui.module.css';
import { connectionLabel, gridLimitKw } from '../model/grid';
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
import p from './peakshaving.module.css';

const TABS = Object.keys(TAB_LABELS) as TabId[];

function PrintSummary() {
  const input = useStore((st) => st.input);
  const a = useStore((st) => st.analysis);
  const b = input.building;
  return (
    <section className={u.printOnly} aria-hidden="true">
      <h1>Installatieconcepten — {PAGE_TITLE}</h1>
      <p>
        {b.use === 'office' ? 'Kantoor' : 'Woning'} · piekvermogen {fmt(b.designLoadKw, 1)} kW · klimaatjaar{' '}
        {a?.climateName ?? input.climateYear} · aansluiting {connectionLabel(input.grid)} (
        {fmt(input.grid.heatPumpShare * 100, 0)} % voor de WP, budget {fmt(gridLimitKw(input.grid), 2)} kW) ·
        stooklijn {EMITTER_PRESETS[input.heatPump.emitterPreset].label} · max. aanvoer{' '}
        {fmt(input.heatPump.maxSupplyC, 0)} °C · WP{' '}
        {input.heatPump.sizingMode === 'auto' ? 'automatisch' : 'handmatig'}{' '}
        {a ? `${fmt(a.nominalKw, 1)} kW` : ''} · buffer {fmt(input.buffer.volumeM3, 2)} m³ (
        {input.buffer.strategy === 'predictive' ? 'voorspellend' : 'altijd'}) · batterij{' '}
        {fmt(input.battery.capacityKwh, 1)} kWh · modus{' '}
        {input.grid.mode === 'exceedance' ? 'overschrijding tonen' : 'aansluiting begrenst'}
        {b.dhw.enabled
          ? ` · tapwater ${fmt(b.dhw.dailyKwh, 1)} kWh/dag, boiler ${fmt(b.dhw.tankLitre, 0)} l`
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
  const copied = useStore((st) => st.copied);
  const markCopied = useStore((st) => st.markCopied);
  const [params] = useSearchParams();
  const [shareErr, setShareErr] = useState(false);
  const lastCode = useRef<string | null>(null);

  // invoer uit de URL (#/peakshaving?c=...); ook als de link in dezelfde tab wordt vervangen
  useEffect(() => {
    const code = params.get('c');
    if (code && code !== lastCode.current) {
      lastCode.current = code;
      if (fromShareHash(code)) return;
    }
    startEngine();
  }, [params, fromShareHash]);

  useEffect(() => {
    document.title = 'Peakshaving · Installatieconcepten';
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
    <div className={p.page}>
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
          <button type="button" className={u.btn} onClick={() => window.print()}>
            Print / PDF
          </button>
        </div>
      </div>
      <div className="noPrint">
        <ClimateNote />
      </div>
      {scenario && (
        <aside className={`${u.card} ${u.scenario} noPrint`} aria-label="Scenario">
          <strong>{scenario.title}</strong> — {scenario.description}
        </aside>
      )}
      <PrintSummary />

      <div className={p.layout}>
        <aside className={`${p.inputs} noPrint`} aria-label="Invoer">
          <BuildingPanel />
          <GridPanel />
          <HeatPumpPanel />
          <MeasuresPanel />
        </aside>
        <main className={p.results} aria-label="Resultaat" aria-busy={busy}>
          <div style={{ minHeight: 20, marginBottom: 4 }} className="noPrint">
            {busy && <span className={p.busy}>Rekent…</span>}
            {error && <span className={u.pill + ' ' + u.pillErr}>Rekenfout: {error}</span>}
          </div>
          <KpiCards />
          <AdviceBanner />
          <RobustnessTable />
          <Messages />
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
              {(tab === 'concept' || tab === 'uitleg') && (
                <p className={p.placeholder}>Dit tabblad volgt in een volgende fase.</p>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
