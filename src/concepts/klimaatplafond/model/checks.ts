// Controles en meldingen (§6): ontwerp (bij Vmax en ontwerpcondities) en bedrijf (live).
import { fmt } from '../../../core/format';
import { dewPoint } from '../../../core/psychro';
import { reynolds, velocity } from '../../../core/hydraulics/friction';
import type { Mode } from './config';
import { MODES, type Design, type ValveDesign } from './design';
import { strandDp } from './strand';
import type { SimState } from './simulation';

export type Severity = 'fout' | 'waarschuwing' | 'info';
export type Action = 'puzzel' | 'advies' | 'tichelmann';

export interface Msg {
  id: string;
  code: string;
  severity: Severity;
  group: 'ontwerp' | 'bedrijf';
  /** klepindex; −1 = globaal */
  valve: number;
  /** getroffen strengen (0-based), leeg = hele klep */
  strands: number[];
  /** actuele waarden */
  lines: string[];
  action?: Action;
}

const MODE_LABEL: Record<Mode, string> = { koelen: 'Koelen', verwarmen: 'Verwarmen' };
const SEV_RANK: Record<Severity, number> = { fout: 0, waarschuwing: 1, info: 2 };

function strandRange(idx: number[]): string {
  const s = idx.map((i) => i + 1);
  if (s.length === 1) return `streng ${s[0]}`;
  const contiguous = s.every((v, i) => i === 0 || v === s[i - 1] + 1);
  if (contiguous && s.length > 3) return `strengen ${s[0]}–${s[s.length - 1]}`;
  return `strengen ${s.join(', ')}`;
}

export function sortMessages(list: Msg[]): Msg[] {
  return [...list].sort(
    (a, b) =>
      SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.valve - b.valve || a.code.localeCompare(b.code),
  );
}

interface Acc {
  list: Msg[];
}

function push(acc: Acc, m: Omit<Msg, 'id'>): void {
  acc.list.push({ ...m, id: `${m.group}-${m.code}-${m.valve}` });
}

export function designMessages(design: Design): Msg[] {
  const acc: Acc = { list: [] };
  const cfg = design.cfg;
  const lim = cfg.advanced.limits;
  const dpMax = cfg.dpMax * 1000;

  // Globaal: W14 (ontwerp-ΔT onhaalbaar)
  const w14: string[] = [];
  for (const m of MODES) {
    const c = design.ctx.conditions[m];
    const limit = Math.abs(c.tRoom - c.tIn) - 0.5;
    if (c.dt >= limit)
      w14.push(
        `${MODE_LABEL[m]}: ΔT ${fmt(c.dt, 1)} K ≥ |${fmt(c.tRoom, 1)} − ${fmt(c.tIn, 1)}| − 0,5 = ${fmt(limit, 1)} K`,
      );
  }
  if (w14.length)
    push(acc, { code: 'W14', severity: 'fout', group: 'ontwerp', valve: -1, strands: [], lines: w14 });

  for (const vd of design.valves) designValve(acc, design, vd, dpMax, lim);
  return sortMessages(acc.list);
}

function designValve(
  acc: Acc,
  design: Design,
  vd: ValveDesign,
  dpMax: number,
  lim: Design['cfg']['advanced']['limits'],
): void {
  const cfg = design.cfg;
  const ctx = design.ctx;
  const v = vd.cfg;
  const i = vd.index;
  const perMode: Record<string, { mode: Mode; idx: number[]; text: string }[]> = {};
  const add = (code: string, mode: Mode, idx: number[], text: string): void => {
    (perMode[code] ??= []).push({ mode, idx, text });
  };

  for (const m of MODES) {
    const md = vd.modes[m];
    const q = md.net.q;
    const th = md.thermal;
    const re: number[] = [];
    const vel: number[] = [];
    const dp: number[] = [];
    for (let k = 0; k < q.length; k++) {
      re.push(reynolds(q[k], ctx.di, md.tMean[k]));
      vel.push(velocity(q[k], ctx.di));
      dp.push(strandDp(ctx, vd.strands[k].panels, vd.strands[k].extraLength, q[k], md.tMean[k]));
    }
    const sel = (pred: (k: number) => boolean): number[] => q.map((_, k) => k).filter(pred);

    const w01 = sel((k) => dp[k] > dpMax);
    if (w01.length)
      add(
        'W01',
        m,
        w01,
        `${MODE_LABEL[m]}: ${strandRange(w01)}: Δp tot ${fmt(Math.max(...w01.map((k) => dp[k])) / 1000, 1)} kPa (> ${fmt(dpMax / 1000, 0)} kPa)`,
      );
    const w03 = sel((k) => re[k] < lim.reLaminar);
    if (w03.length)
      add(
        'W03',
        m,
        w03,
        `${MODE_LABEL[m]}: Re = ${fmt(Math.min(...w03.map((k) => re[k])), 0)} in ${strandRange(w03)} (< ${fmt(lim.reLaminar, 0)})`,
      );
    const i01 = sel((k) => re[k] >= lim.reLaminar && re[k] < lim.reTransition);
    if (i01.length)
      add(
        'I01',
        m,
        i01,
        `${MODE_LABEL[m]}: Re ${fmt(Math.min(...i01.map((k) => re[k])), 0)}–${fmt(Math.max(...i01.map((k) => re[k])), 0)} in ${strandRange(i01)}`,
      );
    const w04 = sel((k) => vel[k] < lim.vMin);
    if (w04.length)
      add(
        'W04',
        m,
        w04,
        `${MODE_LABEL[m]}: v = ${fmt(Math.min(...w04.map((k) => vel[k])), 2)} m/s in ${strandRange(w04)} (< ${fmt(lim.vMin, 2)})`,
      );
    const w05 = sel((k) => vel[k] > lim.vMax);
    if (w05.length)
      add(
        'W05',
        m,
        w05,
        `${MODE_LABEL[m]}: v = ${fmt(Math.max(...w05.map((k) => vel[k])), 2)} m/s in ${strandRange(w05)} (> ${fmt(lim.vMax, 1)})`,
      );

    // W02
    if (md.vmax > 0 && vd.qMaxFeasible[m] < lim.feasibleFraction * md.vmax) {
      add(
        'W02',
        m,
        [],
        `${MODE_LABEL[m]}: haalbaar ${fmt(vd.qMaxFeasible[m] * 3.6e6, 0)} l/h < Vmax ${fmt(md.vmax * 3.6e6, 0)} l/h; benodigd Δp ${fmt(vd.needed[m], 1)} kPa, beschikbaar ${fmt(vd.dpAvail / 1000, 1)} kPa`,
      );
    }
    // W06
    const dtLim = m === 'koelen' ? lim.dtMinCool : lim.dtMinHeat;
    const cond = md.cond;
    const dtEff = Math.min(cond.dt, md.dtMix);
    if (dtEff < dtLim) add('W06', m, [], `${MODE_LABEL[m]}: ΔT ${fmt(dtEff, 1)} K (< ${fmt(dtLim, 1)} K)`);
    // W07
    const w07 = sel(
      (k) => Number.isFinite(th[k].tRet) && Math.abs(th[k].tRet - cond.tRoom) < lim.exhaustedDt,
    );
    if (w07.length)
      add(
        'W07',
        m,
        w07,
        `${MODE_LABEL[m]}: ${strandRange(w07)}: T_ret ${fmt(th[w07[0]].tRet, 1)} °C nadert ${fmt(cond.tRoom, 1)} °C`,
      );
    // W08
    const devMax = Math.max(...md.deviation.map(Math.abs));
    const w08 = sel((k) => Math.abs(md.deviation[k]) > lim.maldistInfo);
    if (w08.length) {
      const hi = devMax > lim.maldistWarn;
      add(
        hi ? 'W08' : 'W08i',
        m,
        w08,
        `${MODE_LABEL[m]}: ${Math.max(...md.deviation) >= 0 ? '+' : ''}${fmt(Math.max(...md.deviation) * 100, 1)} % / ${fmt(Math.min(...md.deviation) * 100, 1)} % t.o.v. ontwerpdebiet`,
      );
    }
    // W09 (koelen)
    if (m === 'koelen') {
      const tDew = dewPoint(cfg.setCool, cfg.rh);
      if (md.tOppMin < tDew + lim.dewMargin) {
        add(
          'W09',
          m,
          [],
          `T_opp,min ${fmt(md.tOppMin, 1)} °C < T_dauw ${fmt(tDew, 1)} °C + ${fmt(lim.dewMargin, 0)} K`,
        );
      }
    }
    // W10 (verwarmen)
    if (m === 'verwarmen' && md.tOppMean > lim.ceilingMaxHeat) {
      add('W10', m, [], `T_opp,gem ${fmt(md.tOppMean, 1)} °C > ${fmt(lim.ceilingMaxHeat, 0)} °C`);
    }
    // W11
    const load = m === 'koelen' ? vd.loadCool : vd.loadHeat;
    if (md.power < load) {
      add(
        'W11',
        m,
        [],
        `${MODE_LABEL[m]}: ${fmt(md.power, 0)} W < last ${fmt(load, 0)} W; tekort ${fmt(load - md.power, 0)} W (${fmt((load - md.power) / Math.max(vd.areaZone, 1e-9), 1)} W/m²)`,
      );
    }
    // W12 / W13
    if (v.type === 'B' && Number.isFinite(vd.advice.b.kvNodig[m])) {
      const ratio = vd.kvRatio[m];
      if (ratio < lim.kvRatioMin) {
        add(
          'W12',
          m,
          [],
          `${MODE_LABEL[m]}: Kv nodig ${fmt(vd.advice.b.kvNodig[m], 2)} / Kvs ${fmt(vd.kvs[m], 2)} = ${fmt(ratio, 2)} (< ${fmt(lim.kvRatioMin, 1)}); advies Kvs ${vd.advice.b.kvs[m] ?? '–'}`,
        );
      }
    }
    if (v.type === 'A') {
      const vlh = md.vmax * 3.6e6;
      const p = vd.picv;
      if (vlh > p.qNom)
        add(
          'W13',
          m,
          [],
          `${MODE_LABEL[m]}: Vmax ${fmt(vlh, 0)} l/h > q_nom ${fmt(p.qNom, 0)} l/h (${p.label})`,
        );
      else if (vlh < p.rangeMin * p.qNom) {
        add(
          'W13',
          m,
          [],
          `${MODE_LABEL[m]}: Vmax ${fmt(vlh, 0)} l/h < ${fmt(p.rangeMin * p.qNom, 0)} l/h (ondergrens instelbereik ${p.label})`,
        );
      }
    }
  }

  const emit = (code: string, sev: Severity, action?: Action, codeOut = code): void => {
    const items = perMode[code];
    if (!items?.length) return;
    const idx = Array.from(new Set(items.flatMap((x) => x.idx))).sort((a, b) => a - b);
    push(acc, {
      code: codeOut,
      severity: sev,
      group: 'ontwerp',
      valve: i,
      strands: idx,
      lines: items.map((x) => x.text),
      action,
    });
  };
  emit('W01', 'waarschuwing', 'puzzel');
  emit('W02', 'fout', 'advies');
  emit('W03', 'waarschuwing', 'puzzel');
  emit('I01', 'info');
  emit('W04', 'waarschuwing', 'puzzel');
  emit('W05', 'waarschuwing', 'puzzel');
  emit('W06', 'waarschuwing');
  emit('W07', 'waarschuwing', 'puzzel');
  emit('W08', 'waarschuwing', v.layout === 'direct' ? 'tichelmann' : 'puzzel');
  emit('W08i', 'info', v.layout === 'direct' ? 'tichelmann' : 'puzzel', 'W08');
  emit('W09', 'fout');
  emit('W10', 'waarschuwing');
  emit('W11', 'waarschuwing', 'puzzel');
  emit('W12', 'waarschuwing', 'advies');
  emit('W13', 'fout', 'advies');
  // W13 is 🔴 bij Vmax > q_nom en 🟠 bij te klein: verfijn de ernst
  const w13 = acc.list.find((m) => m.code === 'W13' && m.valve === i);
  if (w13 && !w13.lines.some((l) => l.includes('> q_nom'))) w13.severity = 'waarschuwing';

  if (vd.tooManyStrandsNeeded) {
    push(acc, {
      code: 'W15',
      severity: 'fout',
      group: 'ontwerp',
      valve: i,
      strands: [],
      lines: ['Alle kandidaten met ≤ 16 strengen voldoen niet; een geldige koppeling vraagt > 16 strengen.'],
      action: 'puzzel',
    });
  }
  const dpKpa = vd.dpAvail / 1000;
  const dpLimit = v.type === 'B' ? lim.maxDpB : lim.maxDpA;
  if (dpKpa > dpLimit) {
    push(acc, {
      code: 'W16',
      severity: 'fout',
      group: 'ontwerp',
      valve: i,
      strands: [],
      lines: [`Δp over de klep ≤ ${fmt(dpKpa, 0)} kPa > ${fmt(dpLimit, 0)} kPa`],
    });
  }
  if (vd.areaZone > 0) {
    const occ = (v.panelCount * design.ctx.geom.area) / vd.areaZone;
    if (occ > lim.occupancy) {
      push(acc, {
        code: 'I02',
        severity: 'info',
        group: 'ontwerp',
        valve: i,
        strands: [],
        lines: [`Bezetting ${fmt(occ * 100, 0)} % (> ${fmt(lim.occupancy * 100, 0)} %)`],
      });
    }
  }
}

/** Live meldingen tijdens de simulatie. */
export function runtimeMessages(state: SimState, design: Design): Msg[] {
  const out: Msg[] = [];
  const cfg = design.cfg;
  const lim = cfg.advanced.limits;
  state.zones.forEach((z, i) => {
    const vd = design.valves[i];
    const act = state.mode;
    if (act !== 'stop' && z.stableTime >= 300 && Number.isFinite(z.dtMeas)) {
      const dtLim = act === 'koelen' ? lim.dtMinCool : lim.dtMinHeat;
      if (z.dtMeas < dtLim) {
        out.push({
          id: `bedrijf-W06-${i}`,
          code: 'W06',
          severity: 'waarschuwing',
          group: 'bedrijf',
          valve: i,
          strands: [],
          lines: [`Gemeten ΔT ${fmt(z.dtMeas, 1)} K (< ${fmt(dtLim, 1)} K)`],
        });
      }
    }
    if (z.hydMode === 'koelen' && z.q > 0) {
      const tDew = dewPoint(cfg.setCool, cfg.rh);
      if (z.tOppMin < tDew + lim.dewMargin) {
        out.push({
          id: `bedrijf-W09-${i}`,
          code: 'W09',
          severity: 'fout',
          group: 'bedrijf',
          valve: i,
          strands: [],
          lines: [
            `T_opp,min ${fmt(z.tOppMin, 1)} °C < T_dauw ${fmt(tDew, 1)} °C + ${fmt(lim.dewMargin, 0)} K`,
          ],
        });
      }
    }
    if (z.dtLimiting) {
      out.push({
        id: `bedrijf-I03-${i}`,
        code: 'I03',
        severity: 'info',
        group: 'bedrijf',
        valve: i,
        strands: [],
        lines: [
          `Debietlimiet ${fmt(z.qLimit * 3.6e6, 0)} l/h van Vmax ${fmt(vd.modes[act === 'stop' ? 'koelen' : act].vmax * 3.6e6, 0)} l/h`,
        ],
      });
    }
    if (state.mode === 'koelen' && z.dew.active) {
      out.push({
        id: `bedrijf-I04-${i}`,
        code: 'I04',
        severity: 'info',
        group: 'bedrijf',
        valve: i,
        strands: [],
        lines: [`T_dauw ${fmt(z.tDew, 1)} °C, aanvoer ${fmt(cfg.tSupplyCool, 1)} °C`],
      });
    }
    if (z.satTime >= 600) {
      out.push({
        id: `bedrijf-I05-${i}`,
        code: 'I05',
        severity: 'info',
        group: 'bedrijf',
        valve: i,
        strands: [],
        lines: [`Vraag 100 % gedurende ${fmt(z.satTime / 60, 0)} min; T_lucht ${fmt(state.tAir[i], 1)} °C`],
      });
    }
  });
  return sortMessages(out);
}
