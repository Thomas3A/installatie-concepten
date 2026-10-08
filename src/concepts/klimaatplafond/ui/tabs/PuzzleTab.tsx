import { useMemo, useState } from 'react';
import type uPlot from 'uplot';
import { fmt } from '../../../../core/format';
import { copperTube } from '../../data/pipes';
import type { Mode } from '../../model/config';
import { MODES, type Candidate, type Design, type ValveDesign } from '../../model/design';
import { strandDp, strandThermal } from '../../model/strand';
import { solveZoneCoupled } from '../../model/zoneHydraulics';
import { useStore } from '../../store';
import { UPlotChart } from '../charts/UPlotChart';
import s from '../ui.module.css';

const MODE_LABEL: Record<Mode, string> = { koelen: 'Koelen', verwarmen: 'Verwarmen' };
const COLD = '#2563a8';
const WARM = '#c2410c';

type Status = 'ok' | 'warn' | 'err';
const CELL: Record<Status, string> = { ok: s.cellOk, warn: s.cellWarn, err: s.cellErr };

/** Genereer de "Wat zie je?"-zin uit de data. */
export function whatDoYouSee(design: Design, vd: ValveDesign): string {
  const tube = copperTube(design.cfg.tube).label.split(' (')[0];
  const lim = design.cfg.advanced.limits;
  const dpMax = design.cfg.dpMax;
  const cands = vd.candidates;
  const valid = cands.filter((c) => c.valid);
  if (vd.cfg.coupling === 'manual') {
    return `Je gebruikt een handmatige koppeling (${vd.strands.map((x) => x.panels).join('·')}). De automatische keuze zou ${vd.chosen !== null ? vd.candidates[vd.chosen].distribution.join('·') : 'ontbreken'} zijn.`;
  }
  if (!valid.length) {
    const best = vd.chosen !== null ? cands[vd.chosen] : null;
    return `Met ${tube} is er voor ${vd.cfg.panelCount} panelen geen koppeling die in beide modi aan alle grenzen voldoet. De minst slechte is ${best ? `${best.s} panelen per streng (${best.p} strengen)` : '–'}; zie de rode cellen voor de overschrijdingen.`;
  }
  const best = cands[vd.chosen as number];
  const sBest = best.s;
  const reason = (c: Candidate | undefined, side: 'lo' | 'hi'): string => {
    if (!c) return '';
    for (const m of MODES) {
      const h = c.modes[m].head; // de langste streng bepaalt de kolomwaarden
      if (side === 'lo') {
        if (h.re < lim.reLaminar) return `bij ${c.s} is de stroming laminair (Re ${fmt(h.re, 0)})`;
        if (h.v < lim.vMin) return `bij ${c.s} is de stroomsnelheid te laag (${fmt(h.v, 2)} m/s)`;
      } else {
        if (h.dp / 1000 > dpMax) return `bij ${c.s} wordt de drukval ${fmt(h.dp / 1000, 0)} kPa (> ${fmt(dpMax, 0)} kPa)`;
        if (h.v > lim.vMax) return `bij ${c.s} is de stroomsnelheid te hoog (${fmt(h.v, 2)} m/s)`;
      }
    }
    return '';
  };
  const lo = reason(cands[sBest - 2], 'lo');
  const hi = reason(cands.find((c) => c.s === sBest + 1), 'hi');
  const parts = [lo, hi].filter(Boolean);
  return `Met ${tube} ligt het werkbare venster bij ${sBest} panelen per streng${parts.length ? `: ${parts.join(', ')}` : ''}.`;
}

function statusOf(kind: 'dp' | 're' | 'v', value: number, design: Design): Status {
  const lim = design.cfg.advanced.limits;
  if (kind === 'dp') return value / 1000 > design.cfg.dpMax ? 'err' : value / 1000 > 0.85 * design.cfg.dpMax ? 'warn' : 'ok';
  if (kind === 're') return value < lim.reLaminar ? 'err' : value < lim.reTransition ? 'warn' : 'ok';
  return value < lim.vMin || value > lim.vMax ? 'err' : 'ok';
}

export function PuzzleMatrix({ design, vd, selected, onSelect }: { design: Design; vd: ValveDesign; selected?: number; onSelect?: (i: number) => void }) {
  const cands = vd.candidates;
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <caption className="sr-only">Puzzelmatrix: panelen per streng tegenover debiet, stroomsnelheid, Reynoldsgetal, drukval en vermogen</caption>
        <thead>
          <tr>
            <th scope="col">Panelen per streng</th>
            {cands.map((c, i) => {
              const txt = c.distribution.length > 8 ? `${c.distribution[0]}·…·${c.distribution[c.distribution.length - 1]}` : c.distribution.join('·');
              return (
                <th
                  key={c.s}
                  scope="col"
                  className={`${s.colHead} ${selected === i ? s.colSel : ''}`}
                  title={`${c.s} panelen per streng → ${c.p} strengen (${c.distribution.join('·')})${c.tooMany ? ' — te veel strengen' : ''}`}
                  onClick={() => onSelect?.(i)}
                >
                  <button type="button" className={s.btnLink} style={{ color: 'inherit', textDecoration: 'none', font: 'inherit' }} onClick={() => onSelect?.(i)} aria-pressed={selected === i}>
                    s = {c.s}
                    {vd.chosen === i && <span className={s.star} title="Automatisch advies"> ★ advies</span>}
                    <br />
                    <span style={{ fontWeight: 400 }}>→ {c.p} str.</span>
                    <br />
                    <span style={{ fontWeight: 400, color: 'var(--text-2)' }}>({txt})</span>
                    {c.sameAs ? <><br /><span style={{ fontWeight: 400, color: 'var(--text-2)' }}>= s {c.sameAs}</span></> : null}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {MODES.map((m) => (
            <ModeRows key={m} design={design} cands={cands} mode={m} selected={selected} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ModeRows({ design, cands, mode, selected }: { design: Design; cands: Candidate[]; mode: Mode; selected?: number }) {
  const dpMax = design.cfg.dpMax;
  const rows: { label: string; cell: (c: Candidate) => { text: string; st?: Status } }[] = [
    { label: 'Debiet per streng (l/h)', cell: (c) => ({ text: fmt(c.modes[mode].head.q * 3.6e6, 1) }) },
    { label: 'v (m/s)', cell: (c) => ({ text: fmt(c.modes[mode].head.v, 2), st: statusOf('v', c.modes[mode].head.v, design) }) },
    { label: 'Re', cell: (c) => ({ text: fmt(c.modes[mode].head.re, 0), st: statusOf('re', c.modes[mode].head.re, design) }) },
    { label: `Δp streng (kPa, max ${fmt(dpMax, 0)})`, cell: (c) => ({ text: fmt(c.modes[mode].head.dp / 1000, 1), st: statusOf('dp', c.modes[mode].head.dp, design) }) },
    { label: 'Zonevermogen (W)', cell: (c) => ({ text: fmt(c.modes[mode].zonePower, 0) }) },
    {
      label: 'Status',
      cell: (c) => {
        const ok = c.modes[mode].valid && !c.tooMany;
        return { text: c.tooMany ? '✗ te veel strengen' : ok ? '✓ geldig' : '✗ niet geldig', st: ok ? 'ok' : 'err' };
      },
    },
  ];
  return (
    <>
      <tr>
        <th scope="rowgroup" colSpan={cands.length + 1} style={{ textAlign: 'left', color: mode === 'koelen' ? COLD : WARM }}>
          {MODE_LABEL[mode]}
        </th>
      </tr>
      {rows.map((r) => (
        <tr key={r.label}>
          <td>{r.label}</td>
          {cands.map((c, i) => {
            const v = r.cell(c);
            return (
              <td key={c.s} className={`${v.st ? CELL[v.st] : ''} ${selected === i ? s.colSel : ''}`}>
                {v.text}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

function bandHook(cands: Candidate[]): uPlot.Hooks.Arrays {
  return {
    drawClear: [
      (u: uPlot) => {
        const { ctx } = u;
        const { top, height } = u.bbox;
        ctx.save();
        ctx.fillStyle = 'rgba(15,118,110,0.13)';
        for (const c of cands) {
          if (!c.valid) continue;
          const x0 = u.valToPos(c.s - 0.5, 'x', true);
          const x1 = u.valToPos(c.s + 0.5, 'x', true);
          ctx.fillRect(x0, top, x1 - x0, height);
        }
        ctx.restore();
      },
    ],
  };
}

function vlinesHook(lines: { x: number; color: string; dash?: number[] }[]): uPlot.Hooks.Arrays {
  return {
    draw: [
      (u: uPlot) => {
        const { ctx } = u;
        const { top, height } = u.bbox;
        ctx.save();
        for (const l of lines) {
          const x = u.valToPos(l.x, 'x', true);
          ctx.strokeStyle = l.color;
          ctx.lineWidth = 1.5;
          ctx.setLineDash(l.dash ?? [5, 4]);
          ctx.beginPath();
          ctx.moveTo(x, top);
          ctx.lineTo(x, top + height);
          ctx.stroke();
        }
        ctx.restore();
      },
    ],
  };
}

export function PuzzleTab() {
  const design = useStore((st) => st.design);
  const selValve = useStore((st) => st.selValve);
  const selStrand = useStore((st) => st.selStrand);
  const select = useStore((st) => st.select);
  const patchValve = useStore((st) => st.patchValve);
  const [candSel, setCandSel] = useState<number | null>(null);
  const [mode3, setMode3] = useState<Mode>('koelen');
  const [layoutView, setLayoutView] = useState<'actual' | 'direct' | 'tichelmann'>('actual');
  const [modeBars, setModeBars] = useState<Mode>('koelen');

  const vi = Math.min(selValve, design.valves.length - 1);
  const vd = design.valves[vi];
  const cfg = design.cfg;
  const cands = vd.candidates;
  const selected = candSel !== null && candSel < cands.length ? candSel : vd.chosen ?? undefined;

  // grafiek 1 en 2
  const xs = cands.map((c) => c.s);
  const lim = cfg.advanced.limits;
  const g1 = {
    data: [xs, cands.map((c) => c.modes.koelen.head.dp / 1000), cands.map((c) => c.modes.verwarmen.head.dp / 1000), xs.map(() => cfg.dpMax)] as never,
  };
  const g2 = { data: [xs, cands.map((c) => c.modes.koelen.head.re), cands.map((c) => c.modes.verwarmen.head.re), xs.map(() => lim.reLaminar), xs.map(() => lim.reTransition)] as never };
  const g2v = { data: [xs, cands.map((c) => c.modes.koelen.head.v), cands.map((c) => c.modes.verwarmen.head.v), xs.map(() => lim.vMin), xs.map(() => lim.vMax)] as never };

  // grafiek 3: geselecteerde streng
  const strandIdx = Math.min(selStrand ?? 0, vd.strands.length - 1);
  const sp = vd.strands[strandIdx];
  const g3 = useMemo(() => {
    const cond = design.ctx.conditions[mode3];
    const md = vd.modes[mode3];
    const qd = md.points[strandIdx].q;
    const flows: number[] = [];
    const power: number[] = [];
    const dp: number[] = [];
    for (let i = 1; i <= 48; i++) {
      const q = (qd * 3 * i) / 48;
      const th = strandThermal(design.ctx, cond, sp.panels, q);
      flows.push(q * 3.6e6);
      power.push(th.power);
      dp.push(strandDp(design.ctx, sp.panels, sp.extraLength, q, th.tMean) / 1000);
    }
    return { flows, power, dp, qd: qd * 3.6e6, qa: md.net.q[strandIdx] * 3.6e6 };
  }, [design, vd, mode3, strandIdx, sp]);

  // verdeling bij Vmax (vergelijkingsberekening)
  const bars = useMemo(() => {
    const md = vd.modes[modeBars];
    const layout = layoutView === 'actual' ? vd.cfg.layout : layoutView;
    const spec = { ...vd.spec, layout };
    const zs = layout === vd.cfg.layout ? { net: md.net, thermal: md.thermal } : solveZoneCoupled(design.ctx, md.cond, spec, md.vmax, undefined, 3, false);
    const scale = md.vmax / md.points.reduce((a, p) => a + p.q, 0);
    return { q: zs.net.q, qd: md.points.map((p) => p.q * scale), tRet: zs.thermal.map((t) => t.tRet), dp0: zs.net.dp0, layout };
  }, [design, vd, modeBars, layoutView]);

  const apply = (i: number): void => {
    const c = cands[i];
    patchValve(vi, {
      coupling: 'manual',
      panelCount: vd.cfg.panelCount,
      manualStrands: c.distribution.map((n) => ({ panels: n, extraLength: 0 })),
    });
  };

  const maxQ = Math.max(...bars.q, ...bars.qd);
  const W = 640;
  const barH = 150;
  const bw = Math.min(26, (W - 40) / (bars.q.length * 2.4));

  return (
    <div>
      {design.valves.length > 1 && (
        <div className={s.seg} role="group" aria-label="Zonekeuze" style={{ marginBottom: 10 }}>
          {design.valves.map((_, i) => (
            <button key={i} type="button" aria-pressed={vi === i} onClick={() => select(i, null)}>
              Zone {i + 1}
            </button>
          ))}
        </div>
      )}
      <div className={s.whatCard}>
        <strong>Wat zie je?</strong> {whatDoYouSee(design, vd)}
        <div className={s.hint} style={{ marginTop: 4 }}>
          Volgorde in de zone: de langste strengen liggen het dichtst bij de klep. Dat compenseert deels de verliezen in de verdeelleiding.
        </div>
      </div>

      <PuzzleMatrix design={design} vd={vd} selected={selected} onSelect={setCandSel} />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0 16px', flexWrap: 'wrap' }}>
        <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={selected === undefined} onClick={() => selected !== undefined && apply(selected)}>
          Toepassen{selected !== undefined ? ` (s = ${cands[selected].s}: ${cands[selected].distribution.join('·')})` : ''}
        </button>
        <span className={s.hint}>Zet de klep op handmatig met de gekozen koppeling. Klik op een kolomkop om een kandidaat te kiezen.</span>
      </div>

      <div className={s.chartGrid}>
        <div className={s.chartBox}>
          <h3>1 · Drukval per streng tegen s</h3>
          <UPlotChart
            xKind="number"
            xLabel="panelen per streng s"
            data={g1.data}
            ariaLabel="Drukval per streng tegen het aantal panelen per streng"
            series={[
              { label: 'Koelen (kPa)', color: COLD, width: 2, points: true },
              { label: 'Verwarmen (kPa)', color: WARM, width: 2, points: true },
              { label: `Max ${fmt(cfg.dpMax, 0)} kPa`, color: '#6b7280', dash: [6, 4] },
            ]}
            axes={[{ scale: 'y', label: 'kPa (log)', format: (v) => fmt(v, v < 10 ? 1 : 0) }]}
            scales={{ x: { time: false, range: (_u, a, b) => [a - 0.5, b + 0.5] }, y: { distr: 3, log: 10 } }}
            hooks={bandHook(cands)}
          />
        </div>
        <div className={s.chartBox}>
          <h3>2 · Reynolds en stroomsnelheid tegen s</h3>
          <UPlotChart
            xKind="number"
            data={g2.data}
            height={150}
            ariaLabel="Reynoldsgetal tegen het aantal panelen per streng"
            series={[
              { label: 'Re koelen', color: COLD, width: 2, points: true },
              { label: 'Re verwarmen', color: WARM, width: 2, points: true },
              { label: 'Re 2.300', color: '#6b7280', dash: [6, 4] },
              { label: 'Re 4.000', color: '#6b7280', dash: [2, 3] },
            ]}
            axes={[{ scale: 'y', label: 'Re' }]}
            scales={{ x: { time: false, range: (_u, a, b) => [a - 0.5, b + 0.5] } }}
            hooks={bandHook(cands)}
          />
          <UPlotChart
            xKind="number"
            xLabel="panelen per streng s"
            data={g2v.data}
            height={150}
            ariaLabel="Stroomsnelheid tegen het aantal panelen per streng"
            series={[
              { label: 'v koelen', color: COLD, width: 2, points: true },
              { label: 'v verwarmen', color: WARM, width: 2, points: true },
              { label: 'v min', color: '#6b7280', dash: [6, 4] },
              { label: 'v max', color: '#6b7280', dash: [2, 3] },
            ]}
            axes={[{ scale: 'y', label: 'm/s', format: (v) => fmt(v, 2) }]}
            scales={{ x: { time: false, range: (_u, a, b) => [a - 0.5, b + 0.5] } }}
            hooks={bandHook(cands)}
          />
        </div>
        <div className={s.chartBox}>
          <h3>
            3 · Streng {strandIdx + 1} ({sp.panels} panelen): vermogen en Δp tegen debiet
          </h3>
          <div className={s.seg} role="group" aria-label="Modus grafiek 3" style={{ marginBottom: 6 }}>
            {MODES.map((m) => (
              <button key={m} type="button" aria-pressed={mode3 === m} onClick={() => setMode3(m)}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <UPlotChart
            xKind="number"
            xLabel="debiet (l/h)"
            data={[g3.flows, g3.power, g3.dp] as never}
            ariaLabel="Vermogen en drukval tegen het debiet van de gekozen streng"
            series={[
              { label: 'Vermogen (W)', color: mode3 === 'koelen' ? COLD : WARM, width: 2, scale: 'p' },
              { label: 'Δp (kPa)', color: '#6b7280', width: 2, dash: [6, 3], scale: 'dp' },
            ]}
            axes={[
              { scale: 'p', label: 'W' },
              { scale: 'dp', label: 'kPa', side: 1, grid: false },
            ]}
            hooks={vlinesHook([
              { x: g3.qd, color: '#0f766e' },
              { x: g3.qa, color: '#b45309', dash: [2, 3] },
            ])}
          />
          <p className={s.hint} style={{ margin: '4px 0 0' }}>
            Groene lijn: ontwerpdebiet ({fmt(g3.qd, 1)} l/h). Oranje stippellijn: werkelijk debiet in het netwerk ({fmt(g3.qa, 1)} l/h). Meer debiet geeft steeds minder extra vermogen, maar wel veel extra drukval.
          </p>
        </div>
      </div>

      <div className={s.card} style={{ marginTop: 14 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ margin: 0 }}>Verdeling bij Vmax (zone {vi + 1})</h3>
          <div className={s.seg} role="group" aria-label="Modus verdeling">
            {MODES.map((m) => (
              <button key={m} type="button" aria-pressed={modeBars === m} onClick={() => setModeBars(m)}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <div className={s.seg} role="group" aria-label="Aansluitwijze (vergelijking)">
            <button type="button" aria-pressed={layoutView === 'actual'} onClick={() => setLayoutView('actual')}>
              Huidig ({vd.cfg.layout === 'direct' ? 'direct retour' : 'Tichelmann'})
            </button>
            <button type="button" aria-pressed={layoutView === 'direct'} onClick={() => setLayoutView('direct')}>
              Direct retour
            </button>
            <button type="button" aria-pressed={layoutView === 'tichelmann'} onClick={() => setLayoutView('tichelmann')}>
              Tichelmann
            </button>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${barH + 70}`} width="100%" style={{ maxWidth: 760 }} role="img" aria-label="Werkelijk debiet per streng ten opzichte van het ontwerpdebiet">
          {bars.q.map((q, i) => {
            const x = 30 + i * ((W - 40) / bars.q.length);
            const h1 = (bars.qd[i] / maxQ) * barH;
            const h2 = (q / maxQ) * barH;
            const dev = q / bars.qd[i] - 1;
            const bad = Math.abs(dev) > lim.maldistWarn;
            return (
              <g key={i}>
                <rect x={x} y={barH - h1 + 10} width={bw} height={h1} fill="var(--border)" />
                <rect x={x + bw + 2} y={barH - h2 + 10} width={bw} height={h2} fill={bad ? 'var(--warn)' : 'var(--accent)'} />
                <text x={x + bw} y={barH + 26} fontSize={10} textAnchor="middle" fill="var(--text)">{i + 1}</text>
                <text x={x + bw} y={barH + 40} fontSize={9} textAnchor="middle" fill="var(--text-2)">{(dev >= 0 ? '+' : '') + fmt(dev * 100, 0)} %</text>
                <text x={x + bw} y={barH + 52} fontSize={9} textAnchor="middle" fill="var(--text-2)">{fmt(bars.tRet[i], 1)}°</text>
              </g>
            );
          })}
          <text x={4} y={barH + 40} fontSize={9} fill="var(--text-2)">Δ</text>
          <text x={4} y={barH + 52} fontSize={9} fill="var(--text-2)">T<tspan fontSize={7} dy={2}>ret</tspan></text>
          <rect x={W - 330} y={barH + 56} width={10} height={10} fill="var(--border)" />
          <text x={W - 316} y={barH + 65} fontSize={10} fill="var(--text)">Q ontwerp</text>
          <rect x={W - 250} y={barH + 56} width={10} height={10} fill="var(--accent)" />
          <text x={W - 236} y={barH + 65} fontSize={10} fill="var(--text)">Q werkelijk</text>
          <rect x={W - 160} y={barH + 56} width={10} height={10} fill="var(--warn)" />
          <text x={W - 146} y={barH + 65} fontSize={10} fill="var(--text)">&gt; 15 % afwijking</text>
        </svg>
        <p className={s.hint} style={{ margin: 0 }}>
          Circuitdrukval bij Vmax: {fmt(bars.dp0 / 1000, 1)} kPa ({bars.layout === 'direct' ? 'direct retour' : 'Tichelmann'}). Dit is een vergelijkingsberekening; de configuratie wordt niet gewijzigd.
        </p>
      </div>
    </div>
  );
}
