import { fmt } from '../../../../core/format';
import { cp, rho } from '../../../../core/water';
import { TYPE_A, TYPE_B } from '../../data/valves';
import { kvRel, thetaToState } from '../../model/valves';
import { live, useStore } from '../../store';
import s from '../ui.module.css';

const COLD = 'var(--cold)';
const WARM = 'var(--warm)';

const HOW_B =
  'Eén kogelklep doet zowel de omschakeling als de modulatie: 0–30° is sequentie koelen (0° = volledig open), 30–60° is dicht (de dode zone) en 60–90° is sequentie verwarmen (90° = volledig open). De klep draait met 1°/s, dus omschakelen duurt minimaal 30 s waarin het debiet nul is. Hij meet debiet en temperaturen en regelt het debiet elektronisch, onafhankelijk van drukschommelingen. Zo is er direct energiemeting en kan de ΔT-manager het debiet begrenzen.';
const HOW_A =
  'Een schakelende 6-weg-klep kiest alleen tussen koelen en verwarmen (omschakeltijd 30 s, debiet nul). De modulatie gebeurt door een drukonafhankelijk regelventiel (PICV) in de plafondretour. Het PICV houdt het debiet constant zolang het Δp erover boven het minimum ligt; daaronder is het niet meer drukonafhankelijk en zakt het debiet. Vmax wordt softwarematig per sequentie ingesteld. Bij een omschakeling sluit eerst de PICV, schakelt dan de 6-weg en opent de PICV daarna weer.';

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div className={s.kpi}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Dial({ theta, target }: { theta: number; target: number }) {
  const cx = 110;
  const cy = 100;
  const r = 78;
  const ang = (d: number): number => Math.PI + (d / 90) * Math.PI;
  const pt = (d: number, rad: number): [number, number] => [cx + rad * Math.cos(ang(d)), cy + rad * Math.sin(ang(d))];
  const arc = (a: number, b: number, col: string): React.ReactNode => {
    const [x0, y0] = pt(a, r);
    const [x1, y1] = pt(b, r);
    return <path d={`M ${x0} ${y0} A ${r} ${r} 0 0 1 ${x1} ${y1}`} stroke={col} strokeWidth={14} fill="none" />;
  };
  const needle = (d: number, dash?: string): React.ReactNode => {
    const [x, y] = pt(d, r + 6);
    return <line x1={cx} y1={cy} x2={x} y2={y} stroke="var(--text)" strokeWidth={dash ? 1.5 : 3} strokeDasharray={dash} />;
  };
  return (
    <svg viewBox="0 0 220 130" width="100%" style={{ maxWidth: 300 }} role="img" aria-label={`Draaischaal, stand ${fmt(theta, 0)} graden`}>
      {arc(0, 30, COLD)}
      {arc(30, 60, 'var(--border)')}
      {arc(60, 90, WARM)}
      {[0, 15, 30, 45, 60, 75, 90].map((d) => {
        const [x, y] = pt(d, r + 16);
        return (
          <text key={d} x={x} y={y + 3} fontSize={9} textAnchor="middle" fill="var(--text-2)">
            {d}°
          </text>
        );
      })}
      <text x={pt(15, r - 20)[0]} y={pt(15, r - 20)[1] + 3} fontSize={9} textAnchor="middle" fill={COLD}>koelen</text>
      <text x={pt(45, r - 20)[0]} y={pt(45, r - 20)[1] + 3} fontSize={9} textAnchor="middle" fill="var(--text-2)">dicht</text>
      <text x={pt(75, r - 20)[0]} y={pt(75, r - 20)[1] + 3} fontSize={9} textAnchor="middle" fill={WARM}>verwarmen</text>
      {needle(target, '4 3')}
      {needle(theta)}
      <circle cx={cx} cy={cy} r={5} fill="var(--text)" />
      <text x={cx} y={cy + 20} fontSize={12} textAnchor="middle" fill="var(--text)" className="num">{fmt(theta, 1)}°</text>
    </svg>
  );
}

function ValveSchema({ mode, flow, angle, switching }: { mode: 'koelen' | 'verwarmen' | 'dicht'; flow: boolean; angle: number; switching: boolean }) {
  const col = mode === 'koelen' ? COLD : mode === 'verwarmen' ? WARM : 'var(--border)';
  const xl = 110;
  const xm = 190;
  const xr = 270;
  const xo = mode === 'koelen' ? xl : xr;
  const dash = flow ? '6 5' : undefined;
  const anim = flow ? { style: { animation: 'dash 1s linear infinite' } as React.CSSProperties } : {};
  return (
    <svg viewBox="0 0 380 300" width="100%" style={{ maxWidth: 440 }} role="img" aria-label="Schema van de 6-weg-klep met zes poorten">
      <style>{`@keyframes dash { to { stroke-dashoffset: -22; } }`}</style>
      {/* poorten */}
      {[xl, xm, xr].map((x, i) => (
        <g key={x}>
          <rect x={x - 8} y={38} width={16} height={34} fill="var(--surface-2)" stroke="var(--border)" />
          <rect x={x - 8} y={228} width={16} height={34} fill="var(--surface-2)" stroke="var(--border)" />
          <text x={x} y={30} fontSize={10} textAnchor="middle" fill={i === 0 ? COLD : i === 2 ? WARM : 'var(--text)'}>
            {['koud-aanvoer', 'plafond-aanv.', 'warm-aanvoer'][i]}
          </text>
          <text x={x} y={278} fontSize={10} textAnchor="middle" fill={i === 0 ? COLD : i === 2 ? WARM : 'var(--text)'}>
            {['koud-retour', 'plafond-retour', 'warm-retour'][i]}
          </text>
        </g>
      ))}
      <rect x={70} y={70} width={240} height={160} rx={16} fill="var(--surface)" stroke="var(--text-2)" strokeWidth={2} />
      {/* kogel */}
      <g transform={`rotate(${angle} ${xm} 150)`}>
        <circle cx={xm} cy={150} r={46} fill="var(--surface-2)" stroke="var(--text-2)" strokeWidth={1.5} />
        <line x1={xm} y1={150 - 46} x2={xm} y2={150 - 30} stroke="var(--text)" strokeWidth={3} />
        <circle cx={xm} cy={150} r={5} fill="var(--text-2)" />
      </g>
      {/* kanalen */}
      {mode !== 'dicht' ? (
        <>
          <path d={`M ${xo} 72 L ${xo} 98 Q ${xo} 110 ${xo + (xm - xo) * 0.3} 112 L ${xm - (xm - xo) * 0.0} 112 L ${xm} 72`} fill="none" stroke={col} strokeWidth={6} strokeLinecap="round" strokeDasharray={dash} {...anim} />
          <path d={`M ${xo} 228 L ${xo} 202 Q ${xo} 190 ${xo + (xm - xo) * 0.3} 188 L ${xm} 188 L ${xm} 228`} fill="none" stroke={col} strokeWidth={6} strokeLinecap="round" strokeDasharray={dash} {...anim} />
        </>
      ) : (
        <text x={xm} y={152} fontSize={11} textAnchor="middle" fill="var(--text-2)" transform={`rotate(${-angle} ${xm} 150)`}>{switching ? 'schakelt…' : 'dicht'}</text>
      )}
      <text x={xm} y={296} fontSize={10} textAnchor="middle" fill="var(--text-2)">de kogel verbindt de plafondpoorten met koud of warm</text>
    </svg>
  );
}

export function ValveTab() {
  useStore((st) => st.tick);
  const design = useStore((st) => st.design);
  const selValve = useStore((st) => st.selValve);
  const select = useStore((st) => st.select);
  const sim = live.sim;
  const vi = Math.min(selValve, design.valves.length - 1);
  const vd = design.valves[vi];
  const z = sim.zones[vi];
  if (!z) return null;
  const v = vd.cfg;
  const nGl = design.cfg.advanced.valveB.nGl;
  const hyd = z.hydMode !== 'dicht' ? z.hydMode : z.lastHyd;
  const cond = vd.modes[hyd].cond;
  const q = z.q;
  const pWater = Math.abs(z.power);
  const dT = Number.isFinite(z.tRetMix) ? Math.abs(z.tRetMix - cond.tIn) : NaN;
  const pCalc = q > 0 && Number.isFinite(dT) ? rho(cond.tIn) * cp(cond.tIn) * q * dT : 0;
  void pWater;
  const measured = v.type === 'B' ? 'gemeten' : 'berekend';

  let schema: React.ReactNode;
  if (v.type === 'B') {
    const st = thetaToState(z.theta);
    schema = <ValveSchema mode={st.seq} flow={q > 0} angle={(z.theta - 45) * 1.6} switching={z.theta > 30 && z.theta < 60} />;
  } else {
    const prog = z.switchLeft > 0 ? 1 - z.switchLeft / design.cfg.advanced.valveA.switchTime : 1;
    const from = z.sixWay === 'koelen' ? -1 : 1;
    const to = z.switchTarget === 'koelen' ? -1 : 1;
    const pos = z.switchLeft > 0 ? from + (to - from) * prog : from;
    schema = <ValveSchema mode={z.switchLeft > 0 ? 'dicht' : z.sixWay} flow={q > 0} angle={pos * 55} switching={z.switchLeft > 0} />;
  }

  // Kv/Kvs-grafiek (type B)
  const curve: string[] = [];
  for (let d = 0; d <= 90; d += 1) {
    const stt = thetaToState(d);
    const y = stt.seq === 'dicht' ? 0 : kvRel(stt.h, nGl);
    curve.push(`${d === 0 ? 'M' : 'L'} ${30 + (d / 90) * 260} ${110 - y * 90}`);
  }
  const stNow = thetaToState(z.theta);
  const yNow = stNow.seq === 'dicht' ? 0 : kvRel(stNow.h, nGl);
  const kvsNow = stNow.seq === 'koelen' ? vd.kvs.koelen : stNow.seq === 'verwarmen' ? vd.kvs.verwarmen : 0;

  // Type A
  const mdPos = vd.modes[z.sixWay];
  const dpPicv = z.dpValve / 1000;
  const dpMin = vd.picv.dpMin;
  const lowDp = v.type === 'A' && q > 0 && dpPicv < dpMin;

  return (
    <div>
      {design.valves.length > 1 && (
        <div className={s.seg} role="group" aria-label="Zonekeuze" style={{ marginBottom: 10 }}>
          {design.valves.map((_, i) => (
            <button key={i} type="button" aria-pressed={vi === i} onClick={() => select(i, null)}>
              Klep {i + 1}
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        <div>
          <h3>
            Klep {vi + 1}: Type {v.type} · DN{v.dn}
          </h3>
          {schema}
          {v.type === 'B' ? (
            <Dial theta={z.theta} target={z.thetaTarget} />
          ) : (
            <div className={s.card} style={{ maxWidth: 440 }}>
              <h3>PICV in de plafondretour ({vd.picv.label})</h3>
              <div className={s.hint}>Slag</div>
              <div className={s.bar}>
                <span style={{ width: `${Math.min((z.picvQ / Math.max(mdPos.vmax, 1e-12)) * 100, 100)}%` }} />
              </div>
              <div className={s.hint} style={{ marginTop: 8 }}>
                Q set {fmt(z.qSet * 3.6e6, 0)} l/h · Q werkelijk {fmt(q * 3.6e6, 0)} l/h (Vmax {fmt(mdPos.vmax * 3.6e6, 0)} l/h)
              </div>
              <div className={s.hint} style={{ marginTop: 8 }}>
                Δp over PICV {fmt(dpPicv, 1)} kPa — minimum {fmt(dpMin, 0)} kPa
              </div>
              <div style={{ position: 'relative', height: 14, background: 'var(--surface-2)', borderRadius: 3, marginTop: 4 }}>
                <div style={{ width: `${Math.min((Math.max(dpPicv, 0) / (dpMin * 2)) * 100, 100)}%`, height: '100%', background: lowDp ? 'var(--warn)' : 'var(--accent)', borderRadius: 3 }} />
                <div style={{ position: 'absolute', left: '50%', top: -3, bottom: -3, borderLeft: '2px solid var(--text)' }} title="Δp-minimum" />
              </div>
              {lowDp && <p style={{ color: 'var(--warn)', fontWeight: 600, marginTop: 6 }}>⚠ niet meer drukonafhankelijk</p>}
              <p className={s.hint} style={{ marginTop: 6 }}>
                6-weg-klep: {z.switchLeft > 0 ? `schakelt om naar ${z.switchTarget} (nog ${fmt(z.switchLeft, 0)} s)` : `staat op ${z.sixWay}`} (Kvs {TYPE_A.kvsSixWay[v.dn]} m³/h)
              </p>
            </div>
          )}
        </div>
        <div>
          <h3>Uitlezing</h3>
          <dl className={s.kpiGrid} style={{ gridTemplateColumns: '1fr 1fr' }}>
            {v.type === 'B' ? (
              <>
                <Reading label="Stand θ" value={`${fmt(z.theta, 1)}°`} />
                <Reading label="Opening h" value={stNow.seq === 'dicht' ? '0 % (dicht)' : `${fmt(stNow.h * 100, 0)} %`} />
                <Reading label="Kv(θ)" value={`${fmt(kvsNow * yNow, 3)} m³/h`} />
                <Reading label="Δp over klep" value={q > 0 ? `${fmt(z.dpValve / 1000, 1)} kPa` : '–'} />
              </>
            ) : (
              <>
                <Reading label="6-weg-klep" value={z.switchLeft > 0 ? 'schakelt' : z.sixWay} />
                <Reading label="Q set" value={`${fmt(z.qSet * 3.6e6, 0)} l/h`} />
              </>
            )}
            <Reading label={`Debiet (${measured})`} value={`${fmt(q * 3.6e6, 1)} l/h`} />
            <Reading label="T aanvoer" value={q > 0 ? `${fmt(cond.tIn, 1)} °C` : '–'} />
            <Reading label="T retour (gemengd)" value={`${fmt(z.tRetMix, 1)} °C`} />
            <Reading label="ΔT" value={Number.isFinite(dT) ? `${fmt(dT, 2)} K` : '–'} />
            <Reading label={`Vermogen (${measured})`} value={`${fmt(pCalc, 0)} W`} />
            <Reading label="Energie koud" value={`${fmt(z.energyCool / 3.6e6, 3)} kWh`} />
            <Reading label="Energie warm" value={`${fmt(z.energyHeat / 3.6e6, 3)} kWh`} />
            {v.dtManager && <Reading label="ΔT-manager debietlimiet" value={`${fmt(z.qLimit * 3.6e6, 0)} l/h`} />}
          </dl>
          {v.type === 'B' && (
            <>
              <h3 style={{ marginTop: 14 }}>Kv/Kvs tegen θ (gelijkprocentig)</h3>
              <svg viewBox="0 0 320 135" width="100%" style={{ maxWidth: 400 }} role="img" aria-label="Kv gedeeld door Kvs tegen de klepstand">
                <rect x={30 + (30 / 90) * 260} y={20} width={(30 / 90) * 260} height={90} fill="var(--surface-2)" />
                <line x1={30} y1={110} x2={290} y2={110} stroke="var(--text-2)" />
                <line x1={30} y1={20} x2={30} y2={110} stroke="var(--text-2)" />
                <path d={curve.join(' ')} fill="none" stroke="var(--accent)" strokeWidth={2} />
                <circle cx={30 + (z.theta / 90) * 260} cy={110 - yNow * 90} r={5} fill="var(--warn)" stroke="var(--surface)" strokeWidth={1.5} />
                {[0, 30, 60, 90].map((d) => (
                  <text key={d} x={30 + (d / 90) * 260} y={124} fontSize={9} textAnchor="middle" fill="var(--text-2)">{d}°</text>
                ))}
                <text x={26} y={24} fontSize={9} textAnchor="end" fill="var(--text-2)">1</text>
                <text x={26} y={113} fontSize={9} textAnchor="end" fill="var(--text-2)">0</text>
                <text x={30 + (45 / 90) * 260} y={70} fontSize={9} textAnchor="middle" fill="var(--text-2)">dode zone</text>
              </svg>
              <p className={s.hint}>Looptijd {TYPE_B.runtime90} s per 90°, max. Δp {TYPE_B.maxDpKpa} kPa. Kvs koelen {fmt(vd.kvs.koelen, 2)} · verwarmen {fmt(vd.kvs.verwarmen, 2)} m³/h.</p>
            </>
          )}
          <div className={s.whatCard} style={{ marginTop: 14 }}>
            <strong>Hoe werkt dit kleptype?</strong>
            <p style={{ margin: '4px 0 0' }}>{v.type === 'B' ? HOW_B : HOW_A}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
