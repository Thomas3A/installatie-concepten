import { useMemo } from 'react';
import { fmtClock } from '../../../../core/format';
import { live, useStore } from '../../store';
import type { LogEntry } from '../../model/simulation';
import { UPlotChart, type ChartSeries } from '../charts/UPlotChart';
import s from '../ui.module.css';

const ZONE_COLORS = ['#0f766e', '#7c3aed', '#b45309'];
const STRAND_COLORS = ['#0f766e', '#7c3aed', '#b45309', '#475569', '#be185d', '#4d7c0f', '#0369a1', '#a16207', '#6d28d9', '#047857', '#9a3412', '#334155', '#a21caf', '#3f6212', '#0e7490', '#854d0e'];

function nan(x: number): number | null {
  return Number.isFinite(x) ? x : null;
}

export function exportCsv(log: LogEntry[], zones: number): void {
  const head = ['t_s', 'tijd'];
  for (let z = 1; z <= zones; z++) head.push(`zone${z}_Tlucht`, `zone${z}_Top`, `zone${z}_Taanvoer`, `zone${z}_Tretour`, `zone${z}_Pplafond_W`, `zone${z}_Plast_W`, `zone${z}_vraag`, `zone${z}_Q_lh`, `zone${z}_Vmax_lh`, `zone${z}_klepstand`);
  const rows = [head.join(';')];
  for (const e of log) {
    const r: (string | number)[] = [e.t, fmtClock(e.t)];
    for (let z = 0; z < zones; z++) {
      r.push(e.tAir[z], e.tOp[z], e.tSupply[z], e.tReturn[z], Math.round(e.pCeiling[z]), Math.round(e.pLoad[z]), e.vraag[z].toFixed(3), (e.q[z] * 3.6e6).toFixed(1), (e.vmax[z] * 3.6e6).toFixed(1), e.valvePos[z].toFixed(1));
    }
    rows.push(r.map((x) => (typeof x === 'number' ? String(x).replace('.', ',') : x)).join(';'));
  }
  const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'klimaatplafond-tijdreeks.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function DynamicsTab() {
  useStore((st) => st.logVersion);
  const design = useStore((st) => st.design);
  const selValve = useStore((st) => st.selValve);
  const selStrand = useStore((st) => st.selStrand);
  const log = live.log;
  const nz = design.valves.length;
  const sel = Math.min(selValve, nz - 1);

  const temps = useMemo(() => {
    const series: ChartSeries[] = [];
    const cols: (number | null)[][] = [log.map((e) => e.t)];
    for (let z = 0; z < nz; z++) {
      const c = ZONE_COLORS[z];
      const sfx = nz > 1 ? ` z${z + 1}` : '';
      series.push({ label: `T lucht${sfx}`, color: c, width: 2 });
      cols.push(log.map((e) => e.tAir[z]));
      series.push({ label: `T operatief${sfx}`, color: c, dash: [6, 4] });
      cols.push(log.map((e) => e.tOp[z]));
      series.push({ label: `T aanvoer${sfx}`, color: c, dash: [2, 3], width: 1.2 });
      cols.push(log.map((e) => nan(e.tSupply[z])));
      series.push({ label: `T retour${sfx}`, color: c, dash: [10, 3, 2, 3], width: 1.2 });
      cols.push(log.map((e) => nan(e.tReturn[z])));
    }
    series.push({ label: 'Setpoint', color: '#6b7280', dash: [1, 4], width: 1.6 });
    cols.push(log.map((e) => e.tSet));
    return { series, cols };
  }, [log, nz, log.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const power = useMemo(() => {
    const series: ChartSeries[] = [];
    const cols: (number | null)[][] = [log.map((e) => e.t)];
    for (let z = 0; z < nz; z++) {
      const sfx = nz > 1 ? ` z${z + 1}` : '';
      series.push({ label: `P plafond${sfx}`, color: ZONE_COLORS[z], width: 2 });
      cols.push(log.map((e) => e.pCeiling[z]));
      series.push({ label: `−Last${sfx}`, color: ZONE_COLORS[z], dash: [6, 4] });
      cols.push(log.map((e) => -e.pLoad[z]));
    }
    return { series, cols };
  }, [log, nz, log.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const valve = useMemo(() => {
    const z = sel;
    const type = design.valves[z]?.cfg.type ?? 'B';
    const series: ChartSeries[] = [
      { label: 'Q (l/h)', color: ZONE_COLORS[0], width: 2, scale: 'flow' },
      { label: 'Vmax (l/h)', color: '#6b7280', dash: [6, 4], scale: 'flow' },
      { label: 'Vraag (%)', color: ZONE_COLORS[1], scale: 'pct' },
      { label: type === 'B' ? 'θ (°)' : 'PICV-slag (%)', color: ZONE_COLORS[2], dash: [2, 3], scale: 'pct' },
    ];
    const cols: (number | null)[][] = [
      log.map((e) => e.t),
      log.map((e) => e.q[z] * 3.6e6),
      log.map((e) => e.vmax[z] * 3.6e6),
      log.map((e) => e.vraag[z] * 100),
      log.map((e) => e.valvePos[z]),
    ];
    return { series, cols };
  }, [log, sel, design, log.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const strands = useMemo(() => {
    const n = design.valves[sel]?.strands.length ?? 0;
    const series: ChartSeries[] = [];
    const cols: (number | null)[][] = [log.map((e) => e.t)];
    for (let k = 0; k < n; k++) {
      series.push({ label: `Streng ${k + 1}`, color: STRAND_COLORS[k % STRAND_COLORS.length], width: selStrand === k ? 3 : 1.4 });
      cols.push(log.map((e) => (e.strandQ[sel]?.[k] ?? 0) * 3.6e6));
    }
    return { series, cols };
  }, [log, sel, design, selStrand, log.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const empty = log.length < 2;
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <button type="button" className={`${s.btn} ${s.btnSmall}`} disabled={empty} onClick={() => exportCsv(log, nz)}>
          Exporteer CSV
        </button>
        <span className={s.hint}>
          {empty ? 'Start de simulatie met Verwarmen of Koelen om de tijdreeksen te vullen.' : `${log.length} punten (elke 30 s simulatietijd, max. 24 uur)`}
        </span>
      </div>
      <div className={s.chartGrid}>
        <div className={s.chartBox}>
          <h3>Temperaturen</h3>
          <UPlotChart data={temps.cols as never} series={temps.series} syncKey="kp" ariaLabel="Temperaturen in de tijd" axes={[{ scale: 'y', label: '°C', format: (v) => v.toFixed(1).replace('.', ',') }]} />
        </div>
        <div className={s.chartBox}>
          <h3>Vermogen plafond versus last (W)</h3>
          <UPlotChart data={power.cols as never} series={power.series} syncKey="kp" ariaLabel="Vermogen en last in de tijd" axes={[{ scale: 'y', label: 'W' }]} />
        </div>
        <div className={s.chartBox}>
          <h3>Klep zone {sel + 1}: vraag, debiet en stand</h3>
          <UPlotChart
            data={valve.cols as never}
            series={valve.series}
            syncKey="kp"
            ariaLabel="Klepgegevens in de tijd"
            axes={[
              { scale: 'flow', label: 'l/h' },
              { scale: 'pct', label: '% / °', side: 1, grid: false },
            ]}
            scales={{ pct: { range: [0, 100] } }}
          />
        </div>
        <div className={s.chartBox}>
          <h3>Strengdebieten zone {sel + 1} (l/h)</h3>
          <UPlotChart data={strands.cols as never} series={strands.series} syncKey="kp" ariaLabel="Strengdebieten in de tijd" axes={[{ scale: 'y', label: 'l/h' }]} />
        </div>
      </div>
    </div>
  );
}
