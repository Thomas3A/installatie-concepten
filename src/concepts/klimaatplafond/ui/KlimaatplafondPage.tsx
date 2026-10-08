import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SCENARIOS } from '../scenarios';
import { decodeConfig, shareUrl } from '../share';
import { useStore, type TabId } from '../store';
import { fmt } from '../../../core/format';
import { ControlBar } from './ControlBar';
import { KpiPanel } from './KpiPanel';
import { MessagesPanel } from './MessagesPanel';
import { PlanView } from './plan/PlanView';
import { SettingsPanel } from './SettingsPanel';
import { DynamicsTab } from './tabs/DynamicsTab';
import { ExplainTab } from './tabs/ExplainTab';
import { PuzzleMatrix, PuzzleTab } from './tabs/PuzzleTab';
import { ValveTab } from './tabs/ValveTab';
import s from './ui.module.css';

const TABS: { id: TabId; label: string }[] = [
  { id: 'dynamiek', label: 'Dynamiek' },
  { id: 'puzzel', label: 'Puzzel' },
  { id: 'klep', label: 'Klep' },
  { id: 'uitleg', label: 'Uitleg' },
];

function ScenarioCard() {
  const id = useStore((st) => st.scenarioId);
  const sc = SCENARIOS.find((x) => x.id === id);
  if (!sc) return null;
  return (
    <aside className={`${s.card} ${s.scenario} noPrint`} aria-label="Scenario">
      <h2 style={{ marginBottom: 6 }}>{sc.name}</h2>
      <dl>
        <div>
          <dt>Wat zie je?</dt>
          <dd>{sc.wat}</dd>
        </div>
        <div>
          <dt>Probeer zelf</dt>
          <dd>{sc.probeer}</dd>
        </div>
      </dl>
    </aside>
  );
}

function PrintSummary() {
  const config = useStore((st) => st.config);
  const design = useStore((st) => st.design);
  const scenario = useStore((st) => st.scenarioId);
  const vd = design.valves[0];
  return (
    <section className={s.printOnly} aria-hidden="true">
      <h1>Installatieconcepten — Klimaatplafond met 6-weg-klep</h1>
      <p>
        {scenario ? `Scenario ${scenario}. ` : ''}
        Vloer {fmt(config.floorArea, 0)} m² · warmteverlies {fmt(config.heatLoss, 0)} W · koellast {fmt(config.coolLoad, 0)} W · aanvoer koelen {fmt(config.tSupplyCool, 1)} °C (ΔT {fmt(config.dtCool, 1)} K) ·
        aanvoer verwarmen {fmt(config.tSupplyHeat, 1)} °C (ΔT {fmt(config.dtHeat, 1)} K) · setpoints {fmt(config.setHeat, 1)} / {fmt(config.setCool, 1)} °C · RV {fmt(config.rh, 0)} % · paneel{' '}
        {config.panelSize} · steek {config.pitch} mm · buis {config.tube} · Δp vóór klep {fmt(config.dpAvailable, 0)} kPa · max. Δp streng {fmt(config.dpMax, 0)} kPa.
      </p>
      <ul>
        {design.valves.map((v) => (
          <li key={v.index}>
            Klep {v.index + 1}: Type {v.cfg.type} DN{v.cfg.dn}, {v.cfg.panelCount} panelen, strengen {v.strands.map((x) => x.panels).join('·')}, {v.cfg.layout === 'direct' ? 'direct retour' : 'Tichelmann'}, Vmax koelen{' '}
            {fmt(v.modes.koelen.vmax * 3.6e6, 0)} l/h, verwarmen {fmt(v.modes.verwarmen.vmax * 3.6e6, 0)} l/h
          </li>
        ))}
      </ul>
      <h2>Puzzelmatrix klep 1</h2>
      {vd && <PuzzleMatrix design={design} vd={vd} selected={vd.chosen ?? undefined} />}
    </section>
  );
}

export default function KlimaatplafondPage() {
  const tab = useStore((st) => st.tab);
  const setTab = useStore((st) => st.setTab);
  const scenarioId = useStore((st) => st.scenarioId);
  const loadScenario = useStore((st) => st.loadScenario);
  const loadConfig = useStore((st) => st.loadConfig);
  const config = useStore((st) => st.config);
  const copied = useStore((st) => st.copied);
  const markCopied = useStore((st) => st.markCopied);
  const [params] = useSearchParams();
  const loaded = useRef(false);
  const tabsRef = useRef<HTMLElement>(null);
  const [shareErr, setShareErr] = useState(false);

  // Configuratie uit de URL (#/klimaatplafond?c=...)
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    const code = params.get('c');
    if (code) {
      const cfg = decodeConfig(code);
      if (cfg) loadConfig(cfg, null);
    }
  }, [params, loadConfig]);

  useEffect(() => {
    document.title = 'Klimaatplafond · Installatieconcepten';
  }, []);

  const share = async (): Promise<void> => {
    const url = shareUrl(config);
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
    <div className={s.page}>
      <div className={`${s.topbar} noPrint`}>
        <div>
          <h1>Klimaatplafond met 6-weg-klep</h1>
          <div className={s.sub}>Open kantoor · koperen meanderactivering · 4-pijpssysteem</div>
        </div>
        <span className={s.spacer} />
        <label className={s.sub} htmlFor="scenario" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          Scenario
          <select
            id="scenario"
            className={s.select}
            value={scenarioId ?? ''}
            onChange={(e) => e.target.value && loadScenario(e.target.value)}
          >
            {scenarioId === null && <option value="">Eigen configuratie</option>}
            {SCENARIOS.map((sc) => (
              <option key={sc.id} value={sc.id}>
                {sc.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={s.btn} onClick={share} aria-live="polite">
          {copied ? (shareErr ? 'Link getoond' : '✓ Link gekopieerd') : 'Deel link'}
        </button>
        <button type="button" className={s.btn} onClick={() => window.print()}>
          Print / PDF
        </button>
        <button
          type="button"
          className={s.btn}
          onClick={() => {
            setTab('uitleg');
            tabsRef.current?.scrollIntoView({ behavior: 'smooth' });
          }}
        >
          Uitleg
        </button>
      </div>

      <ScenarioCard />
      <PrintSummary />

      <div className={s.layout}>
        <div className={`${s.areaSettings} noPrint`}>
          <SettingsPanel />
        </div>
        <div className={s.areaPlan}>
          <PlanView />
          <ControlBar />
        </div>
        <div className={s.areaRight}>
          <KpiPanel />
          <MessagesPanel />
        </div>
        <section className={`${s.areaTabs} ${s.card} noPrint`} ref={tabsRef} aria-label="Detailweergave">
          <div className={s.tabList} role="tablist" aria-label="Detailweergave">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} className={s.tab} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'dynamiek' && <DynamicsTab />}
            {tab === 'puzzel' && <PuzzleTab />}
            {tab === 'klep' && <ValveTab />}
            {tab === 'uitleg' && <ExplainTab />}
          </div>
        </section>
      </div>
    </div>
  );
}
