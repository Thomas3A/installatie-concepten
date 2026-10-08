import { fmt } from '../../../core/format';
import { operativeTemp } from '../model/room';
import { live, useStore } from '../store';
import s from './ui.module.css';

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={s.kpi}>
      <dt>{label}</dt>
      <dd>
        {value}
        {sub && <span style={{ color: 'var(--text-2)', fontWeight: 400 }}> {sub}</span>}
      </dd>
    </div>
  );
}

export function KpiPanel() {
  useStore((st) => st.tick);
  const design = useStore((st) => st.design);
  const selValve = useStore((st) => st.selValve);
  const select = useStore((st) => st.select);
  const sim = live.sim;
  const cfg = design.cfg;
  const act = sim.mode === 'stop' ? sim.lastMode : sim.mode;

  return (
    <section aria-label="Kengetallen per zone">
      {design.valves.map((vd, i) => {
        const z = sim.zones[i];
        if (!z) return null;
        const md = vd.modes[act];
        const hyd = z.hydMode !== 'dicht' ? z.hydMode : z.lastHyd;
        const cond = vd.modes[hyd].cond;
        const tSet = act === 'verwarmen' ? cfg.setHeat : cfg.setCool;
        const qPct = md.vmax > 0 ? (z.q / md.vmax) * 100 : 0;
        const load = -(sim.eLoad[i] > 0 ? 0 : 0);
        void load;
        const pLoadNow = (() => {
          const H =
            act === 'verwarmen'
              ? vd.loadHeat / (cfg.setHeat - cfg.advanced.tOutDesign)
              : cfg.advanced.hK * vd.areaZone;
          const T = sim.tAir[i];
          return act === 'verwarmen'
            ? -vd.loadHeat - H * (T - cfg.setHeat)
            : vd.loadCool - H * (T - cfg.setCool);
        })();
        const tOppGem = sim.tAir[i] + z.oppDev;
        const to = operativeTemp(
          sim.tAir[i],
          tOppGem,
          (vd.cfg.panelCount * design.ctx.geom.area) / Math.max(vd.areaZone, 1e-9),
        );
        const valvePos =
          vd.cfg.type === 'B'
            ? `${fmt(z.theta, 0)}°`
            : z.switchLeft > 0
              ? `schakelt ${fmt(z.switchLeft, 0)} s`
              : `${fmt((z.picvQ / Math.max(vd.modes[z.sixWay].vmax, 1e-12)) * 100, 0)} %`;
        const measured = vd.cfg.type === 'B' ? 'gemeten' : 'berekend';
        const needed = vd.needed[act];
        const dpOk = needed <= vd.dpAvail / 1000;
        const pCeil = z.power;
        return (
          <div
            key={i}
            className={s.card}
            style={selValve === i ? { borderColor: 'var(--accent)' } : undefined}
            onClick={() => select(i, null)}
          >
            <div className={s.kpiHead}>
              <h3 style={{ margin: 0 }}>Zone {i + 1}</h3>
              <span
                className={`${s.pill} ${z.q > 0 ? (hyd === 'koelen' ? s.pillInfo : s.pillWarn) : s.pillOk}`}
              >
                {z.q > 0
                  ? hyd === 'koelen'
                    ? '❄ koelt'
                    : '🔥 verwarmt'
                  : z.switchLeft > 0
                    ? 'schakelt om'
                    : 'dicht'}
              </span>
            </div>
            <dl className={s.kpiGrid}>
              <Kpi label="T lucht" value={`${fmt(sim.tAir[i], 2)} °C`} sub={`(set ${fmt(tSet, 1)})`} />
              <Kpi label="T operatief" value={`${fmt(to, 2)} °C`} />
              <Kpi
                label={vd.cfg.type === 'B' ? 'Klepstand' : 'PICV-slag'}
                value={valvePos}
                sub={`vraag ${fmt(z.vraag * 100, 0)} %`}
              />
              <Kpi
                label={`Debiet (${measured})`}
                value={`${fmt(z.q * 3.6e6, 0)} l/h`}
                sub={`/ ${fmt(md.vmax * 3.6e6, 0)}`}
              />
              <Kpi label="T aanvoer" value={z.q > 0 ? `${fmt(cond.tIn, 1)} °C` : '–'} />
              <Kpi
                label="T retour"
                value={`${fmt(z.tRetMix, 1)} °C`}
                sub={Number.isFinite(z.dtMeas) ? `ΔT ${fmt(z.dtMeas, 1)} K` : undefined}
              />
              <Kpi
                label="Vermogen plafond"
                value={`${fmt(Math.abs(pCeil), 0)} W`}
                sub={pCeil < 0 ? 'koud' : pCeil > 0 ? 'warm' : ''}
              />
              <Kpi
                label="Last"
                value={`${fmt(Math.abs(pLoadNow), 0)} W`}
                sub={pLoadNow < 0 ? 'verlies' : 'winst'}
              />
              <Kpi
                label="Δp benodigd / beschikbaar"
                value={`${fmt(needed, 1)} / ${fmt(vd.dpAvail / 1000, 1)} kPa`}
                sub={dpOk ? '✓' : '✗'}
              />
              <Kpi
                label="Energie koud / warm"
                value={`${fmt(z.energyCool / 3.6e6, 2)} / ${fmt(z.energyHeat / 3.6e6, 2)} kWh`}
              />
            </dl>
            <div className={s.bar} aria-hidden="true">
              <span style={{ width: `${Math.min(qPct, 100)}%` }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}
