import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmt } from '../../../../core/format';
import { dewPoint } from '../../../../core/psychro';
import { strandDp } from '../../model/strand';
import { engineFrame, live, useStore, type Overlay } from '../../store';
import { Particles, DEV_LUT, TEMP_LUT, drawColors, scaleRange, type View } from './planDraw';
import { RETURN_Y, TICH_Y, buildLayout, STRAND_Y0 } from './planGeometry';
import { reynolds } from '../../../../core/hydraulics/friction';
import p from './Plan.module.css';
import ui from '../ui.module.css';

const OVERLAYS: { id: Overlay; label: string }[] = [
  { id: 'water', label: 'Watertemperatuur' },
  { id: 'oppervlak', label: 'Oppervlaktetemp.' },
  { id: 'verdeling', label: 'Verdeling' },
];

function cssVar(el: HTMLElement, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim() || '#888';
}

export function PlanView() {
  const design = useStore((s) => s.design);
  const overlay = useStore((s) => s.overlay);
  const setOverlay = useStore((s) => s.setOverlay);
  const showLabels = useStore((s) => s.showLabels);
  const setShowLabels = useStore((s) => s.setShowLabels);
  const select = useStore((s) => s.select);
  const selValve = useStore((s) => s.selValve);
  const selStrand = useStore((s) => s.selStrand);
  const highlight = useStore((s) => s.highlight);
  useStore((s) => s.tick); // herrender op simulatietik
  const tickValue = useStore.getState().tick;

  const wrapRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLCanvasElement>(null);
  const partRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 420 });
  const [view, setView] = useState<View>({ k: 40, tx: 20, ty: 40 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const userMoved = useRef(false);
  const [tip, setTip] = useState<{ x: number; y: number; valve: number; strand: number } | null>(null);

  const layout = useMemo(() => buildLayout(design), [design]);
  const particles = useMemo(() => new Particles(layout, design), [layout, design]);

  // ----- afmeting
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      setSize({ w, h: Math.round(Math.min(Math.max(w * 0.52, w < 640 ? 420 : 320), 620)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const b = layout.bounds;
    const m = 24;
    const top = size.w < 640 ? 118 : 50; // ruimte voor de werkbalk (die op smalle schermen over meer regels loopt)
    const availH = size.h - top - m;
    const k = Math.min((size.w - 2 * m) / (b.maxX - b.minX), availH / (b.maxY - b.minY));
    const kk = Math.max(k, 4);
    setView({
      k: kk,
      tx: (size.w - (b.maxX - b.minX) * kk) / 2 - b.minX * kk,
      ty: top + (availH - (b.maxY - b.minY) * kk) / 2 - b.minY * kk,
    });
    userMoved.current = false;
  }, [layout, size]);

  useEffect(() => {
    if (!userMoved.current) fit();
  }, [fit]);

  // ----- zoomen en pannen
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const v = viewRef.current;
      const f = Math.exp(-e.deltaY * 0.0015);
      const k = Math.min(Math.max(v.k * f, 4), 400);
      const wx = (mx - v.tx) / v.k;
      const wy = (my - v.ty) / v.k;
      userMoved.current = true;
      setView({ k, tx: mx - wx * k, ty: my - wy * k });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const onPointerDown = (e: React.PointerEvent): void => {
    drag.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty, moved: false };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent): void => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.moved) {
      userMoved.current = true;
      setView((v) => ({ ...v, tx: d.tx + dx, ty: d.ty + dy }));
    }
  };
  const onPointerUp = (): void => {
    window.setTimeout(() => (drag.current = null), 0);
  };

  // ----- animatielus (simulatie + tekenen)
  const lastColor = useRef({ tick: -1, view: view, overlay, layout });
  const needColors = useRef(true);
  useEffect(() => {
    needColors.current = true;
  }, [view, overlay, layout, size, tickValue]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const cc = colorRef.current;
    const pc = partRef.current;
    if (!cc || !pc) return;
    const cctx = cc.getContext('2d');
    const pctx = pc.getContext('2d');
    if (!cctx || !pctx) return;
    const frame = (now: number): void => {
      const dt = now - last;
      last = now;
      engineFrame(dt);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = size.w;
      const h = size.h;
      if (cc.width !== Math.round(w * dpr) || cc.height !== Math.round(h * dpr)) {
        cc.width = pc.width = Math.round(w * dpr);
        cc.height = pc.height = Math.round(h * dpr);
        needColors.current = true;
      }
      const v = viewRef.current;
      if (needColors.current) {
        needColors.current = false;
        drawColorsOver(cctx, v, dpr, w, h);
        lastColor.current = { tick: live.sim.t, view: v, overlay, layout };
      }
      particles.advance(Math.min(dt, 100) / 1000, live.sim, design);
      particles.draw(pctx, { design, sim: live.sim, layout, view: v, dpr, width: w, height: h });
      raf = requestAnimationFrame(frame);
    };
    const drawColorsOver = (
      ctx: CanvasRenderingContext2D,
      v: View,
      dpr: number,
      w: number,
      h: number,
    ): void => {
      // drawColors wist het canvas; teken daarom eerst de achtergrond opnieuw erachter via compositing
      const panelFill = cssVar(cc, '--surface-2');
      drawColors({ ctx, layout, design, sim: live.sim, overlay, view: v, dpr, width: w, height: h });
      ctx.globalCompositeOperation = 'destination-over';
      ctx.setTransform(dpr * v.k, 0, 0, dpr * v.k, dpr * v.tx, dpr * v.ty);
      ctx.fillStyle = panelFill;
      for (const z of layout.zones)
        for (const s of z.strands)
          for (const pn of s.panels) ctx.fillRect(pn.x, pn.y, layout.geom.B, layout.geom.L);
      ctx.globalCompositeOperation = 'source-over';
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [layout, design, overlay, size, particles]);

  // ----- SVG-statisch
  const g = layout.geom;
  const sim = live.sim;
  const labelFs = 11 / view.k;

  const staticSvg = useMemo(() => {
    const els: React.ReactNode[] = [];
    layout.zones.forEach((z) => {
      const vd = design.valves[z.valve];
      const last = z.strands[z.strands.length - 1];
      const first = z.strands[0];
      // aanvoer en retour
      els.push(
        <line
          key={`s${z.valve}`}
          x1={z.x0}
          y1={0}
          x2={last.supplyX}
          y2={0}
          stroke="var(--text-2)"
          strokeWidth={2.2}
          vectorEffect="non-scaling-stroke"
        />,
        <line
          key={`r${z.valve}`}
          x1={z.x0}
          y1={RETURN_Y}
          x2={last.riserX}
          y2={RETURN_Y}
          stroke="var(--text-2)"
          strokeWidth={2.2}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />,
      );
      if (vd.cfg.layout === 'tichelmann') {
        els.push(
          <polyline
            key={`t${z.valve}`}
            points={`${first.riserX},${RETURN_Y} ${first.riserX},${TICH_Y} ${last.riserX},${TICH_Y} ${last.riserX},${TICH_Y - 0.15} ${z.x0},${TICH_Y - 0.15}`}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />,
          <text
            key={`tl${z.valve}`}
            x={z.x0 + 0.05}
            y={TICH_Y - 0.2}
            fontSize={10 / view.k}
            fill="var(--accent)"
          >
            Tichelmann-retour
          </text>,
        );
      }
      z.strands.forEach((st) => {
        // aanvoerafgang, koppelslangen en stijgleiding
        const first = st.panels[0];
        void first;
        const parts: string[] = [];
        // feed
        parts.push(`M ${st.supplyX} 0 L ${st.path[1].x} ${st.path[1].y}`);
        // hoses en riser uit het pad: alles buiten de meanderspans
        const meanderLen = layout.meander.length;
        let idx = 1;
        for (let pn = 0; pn < st.panels.length; pn++) {
          idx += meanderLen; // pad[1..] is eerste meanderpunt
          const startHose = idx - 1;
          if (pn < st.panels.length - 1) {
            const pts = st.path.slice(startHose, startHose + 11);
            parts.push(
              `M ${pts[0].x} ${pts[0].y} ` +
                pts
                  .slice(1)
                  .map((q) => `L ${q.x} ${q.y}`)
                  .join(' '),
            );
            idx += 10;
          } else {
            const pts = st.path.slice(startHose);
            parts.push(
              `M ${pts[0].x} ${pts[0].y} ` +
                pts
                  .slice(1)
                  .map((q) => `L ${q.x} ${q.y}`)
                  .join(' '),
            );
          }
        }
        els.push(
          <path
            key={`f${z.valve}-${st.index}`}
            d={parts.join(' ')}
            fill="none"
            stroke="var(--text-2)"
            strokeWidth={1.4}
            vectorEffect="non-scaling-stroke"
            opacity={0.85}
          />,
        );
        st.panels.forEach((pn, k) => {
          els.push(
            <rect
              key={`p${z.valve}-${st.index}-${k}`}
              x={pn.x}
              y={pn.y}
              width={g.B}
              height={g.L}
              fill="none"
              stroke="var(--border)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />,
          );
        });
        // aansluitpunten op de korte zijden
        const e0 = layout.meander[0];
        const eN = layout.meander[layout.meander.length - 1];
        const lastPn = st.panels[st.panels.length - 1];
        els.push(
          <circle
            key={`ci${z.valve}-${st.index}`}
            cx={st.panels[0].x + e0.x}
            cy={st.panels[0].y + e0.y}
            r={0.025}
            fill="var(--text-2)"
          />,
          <circle
            key={`co${z.valve}-${st.index}`}
            cx={lastPn.x + eN.x}
            cy={lastPn.y + eN.y}
            r={0.025}
            fill="var(--text-2)"
          />,
        );
      });
    });
    return els;
  }, [layout, design, g.B, g.L, view.k]);

  // ----- dynamische overlay (labels, klepsymbool, selectie)
  const dyn = (() => {
    const els: React.ReactNode[] = [];
    layout.zones.forEach((z) => {
      const vd = design.valves[z.valve];
      const zs = sim.zones[z.valve];
      if (!zs) return;
      const act = sim.mode === 'stop' ? null : sim.mode;
      const cfgv = vd.cfg;
      const kvTxt =
        cfgv.type === 'B'
          ? `Kvs ${fmt(vd.kvs.koelen, 2).replace(/,00$/, '')}/${fmt(vd.kvs.verwarmen, 2).replace(/,00$/, '')}`
          : vd.picv.label.split(' ')[0] +
            (vd.picv.label.includes('HF') ? ' HF' : vd.picv.label.includes('LF') ? ' LF' : '');
      const hydc = act === 'koelen' ? 'var(--cold)' : act === 'verwarmen' ? 'var(--warm)' : 'var(--text-2)';
      els.push(
        <text
          key={`zl${z.valve}`}
          x={z.x0}
          y={RETURN_Y - (cfgv.layout === 'tichelmann' ? 0.75 : 0.25)}
          fontSize={12 / view.k}
          fill="var(--text)"
          className={p.zoneLabel}
        >
          {`Zone ${z.valve + 1} · ${cfgv.panelCount} panelen · ${fmt(sim.tAir[z.valve], 1)} °C`}
        </text>,
        view.k >= 22 && (
          <g key={`kl${z.valve}`}>
            <text x={z.x0 - 0.05} y={0.3} fontSize={10 / view.k} fill="var(--text-2)" textAnchor="end">
              {`Type ${cfgv.type} · DN${cfgv.dn}`}
            </text>
            <text
              x={z.x0 - 0.05}
              y={0.3 + 12 / view.k}
              fontSize={10 / view.k}
              fill="var(--text-2)"
              textAnchor="end"
            >
              {kvTxt}
            </text>
          </g>
        ),
      );
      // klepsymbool
      const cx = z.x0 - 0.3;
      const cy = -0.07;
      const r = 0.13;
      if (cfgv.type === 'B') {
        const ang = (deg: number): number => Math.PI + (deg / 90) * Math.PI; // 0..90° → halve cirkel
        const arc = (a0: number, a1: number, col: string): React.ReactNode => (
          <path
            key={`${a0}`}
            d={`M ${cx + r * Math.cos(ang(a0))} ${cy + r * Math.sin(ang(a0))} A ${r} ${r} 0 0 1 ${cx + r * Math.cos(ang(a1))} ${cy + r * Math.sin(ang(a1))}`}
            stroke={col}
            strokeWidth={4}
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        );
        els.push(
          <g key={`kv${z.valve}`}>
            <circle
              cx={cx}
              cy={cy}
              r={r + 0.04}
              fill="var(--surface)"
              stroke="var(--border)"
              vectorEffect="non-scaling-stroke"
            />
            {arc(0, 30, 'var(--cold)')}
            {arc(30, 60, 'var(--text-2)')}
            {arc(60, 90, 'var(--warm)')}
            <line
              x1={cx}
              y1={cy}
              x2={cx + r * 0.95 * Math.cos(ang(zs.theta))}
              y2={cy + r * 0.95 * Math.sin(ang(zs.theta))}
              stroke="var(--text)"
              strokeWidth={2.4}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={cx} cy={cy} r={0.02} fill="var(--text)" />
          </g>,
        );
      } else {
        const md = vd.modes[zs.sixWay];
        const frac = Math.min(zs.picvQ / Math.max(md.vmax, 1e-12), 1);
        els.push(
          <g key={`kv${z.valve}`}>
            <rect
              x={cx - 0.17}
              y={cy - 0.12}
              width={0.34}
              height={0.24}
              rx={0.03}
              fill="var(--surface)"
              stroke="var(--border)"
              vectorEffect="non-scaling-stroke"
            />
            <rect x={cx - 0.14} y={cy + 0.01} width={0.28} height={0.07} fill="var(--surface-2)" />
            <rect
              x={cx - 0.14}
              y={cy + 0.01}
              width={0.28 * frac}
              height={0.07}
              fill={zs.sixWay === 'koelen' ? 'var(--cold)' : 'var(--warm)'}
            />
            <text x={cx} y={cy - 0.03} fontSize={9 / view.k} textAnchor="middle" fill={hydc}>
              {zs.switchLeft > 0 ? 'schakelt' : zs.sixWay === 'koelen' ? 'koud' : 'warm'}
            </text>
          </g>,
        );
      }
      // strand-labels en badges
      z.strands.forEach((st) => {
        const th = zs.thermal[st.index];
        const q = zs.qStrand[st.index] ?? 0;
        const yBottom = STRAND_Y0 + st.height;
        if (q > 0 && th) {
          const re = th.re;
          if (re < design.cfg.advanced.limits.reLaminar) {
            els.push(
              <text
                key={`b${z.valve}-${st.index}`}
                x={st.cx}
                y={STRAND_Y0 - 0.1}
                fontSize={9 / view.k}
                textAnchor="middle"
                fill="var(--err)"
                fontWeight={700}
              >
                {view.k >= 22 ? '▲ laminair' : '▲'}
              </text>,
            );
          } else if (re < design.cfg.advanced.limits.reTransition) {
            els.push(
              <text
                key={`b${z.valve}-${st.index}`}
                x={st.cx}
                y={STRAND_Y0 - 0.1}
                fontSize={9 / view.k}
                textAnchor="middle"
                fill="var(--info)"
                fontWeight={600}
              >
                {view.k >= 40 ? '◆ overgang' : '◆'}
              </text>,
            );
          }
        }
        if (showLabels) {
          const hyd = zs.hydMode !== 'dicht' ? zs.hydMode : zs.lastHyd;
          const md = vd.modes[hyd];
          const sp = vd.strands[st.index];
          const dpv = q > 0 && th ? strandDp(design.ctx, sp.panels, sp.extraLength, q, th.tMean) : 0;
          const lines =
            q > 0 && th
              ? [
                  `${fmt(q * 3.6e6, 1)} l/h · ${fmt(th.v, 2)} m/s`,
                  `Re ${fmt(th.re, 0)} · Δp ${fmt(dpv / 1000, 1)} kPa`,
                  `${fmt(md.cond.tIn, 1)}→${fmt(zs.tRetStrand[st.index], 1)} °C · ${fmt(Math.abs(zs.pStrand[st.index]), 0)} W`,
                ]
              : ['stilstaand'];
          lines.forEach((t, i) => {
            els.push(
              <text
                key={`lb${z.valve}-${st.index}-${i}`}
                x={st.cx}
                y={yBottom + 0.22 + i * (labelFs * 1.2)}
                fontSize={labelFs * 0.9}
                textAnchor="middle"
                fill="var(--text)"
                className="num"
              >
                {t}
              </text>,
            );
          });
        }
      });
    });
    return els;
  })();

  // ----- selectie en markering
  const marks: React.ReactNode[] = [];
  layout.zones.forEach((z) => {
    z.strands.forEach((st) => {
      const sel = selValve === z.valve && selStrand === st.index;
      const hl =
        highlight &&
        highlight.valve === z.valve &&
        (highlight.strands.length === 0 || highlight.strands.includes(st.index));
      marks.push(
        <rect
          key={`h${z.valve}-${st.index}`}
          x={st.cx - g.B / 2 - 0.12}
          y={STRAND_Y0 - 0.16}
          width={g.B + 0.24}
          height={st.height + 0.32}
          fill="transparent"
          stroke={sel ? 'var(--accent)' : hl ? 'var(--warn)' : 'transparent'}
          strokeWidth={sel || hl ? 2.5 : 0}
          strokeDasharray={hl && !sel ? '5 3' : undefined}
          vectorEffect="non-scaling-stroke"
          style={{ cursor: 'pointer' }}
          tabIndex={0}
          role="button"
          aria-label={`Zone ${z.valve + 1}, streng ${st.index + 1}, ${st.panels.length} panelen. Selecteren.`}
          onPointerEnter={(e) => setTip({ x: e.clientX, y: e.clientY, valve: z.valve, strand: st.index })}
          onPointerMove={(e) => setTip({ x: e.clientX, y: e.clientY, valve: z.valve, strand: st.index })}
          onPointerLeave={() => setTip(null)}
          onClick={() => {
            if (!drag.current?.moved) select(z.valve, st.index);
          }}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && select(z.valve, st.index)}
        />,
      );
    });
    if (highlight && highlight.valve === z.valve && highlight.strands.length === 0) {
      marks.push(
        <rect
          key={`hz${z.valve}`}
          x={z.x0 - 0.7}
          y={RETURN_Y - 0.6}
          width={z.width + 0.8}
          height={z.bottom - RETURN_Y + 0.8}
          fill="none"
          stroke="var(--warn)"
          strokeWidth={2.5}
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
        />,
      );
    }
  });

  // ----- legenda
  const rng = scaleRange(design);
  const tRoom0 = sim.tAir[0] ?? design.cfg.setCool;
  const legendGradient = (lut: string[]): string =>
    `linear-gradient(90deg, ${lut.filter((_, i) => i % 6 === 0).join(',')})`;
  const tDew = dewPoint(design.cfg.setCool, design.cfg.rh);

  // ----- tooltip
  let tipEl: React.ReactNode = null;
  if (tip && wrapRef.current) {
    const vd = design.valves[tip.valve];
    const zs = sim.zones[tip.valve];
    const th = zs?.thermal[tip.strand];
    const q = zs?.qStrand[tip.strand] ?? 0;
    const hyd = zs && zs.hydMode !== 'dicht' ? zs.hydMode : (zs?.lastHyd ?? 'koelen');
    const md = vd.modes[hyd];
    const sp = vd.strands[tip.strand];
    const rect = wrapRef.current.getBoundingClientRect();
    const dpv = q > 0 && th ? strandDp(design.ctx, sp.panels, sp.extraLength, q, th.tMean) : 0;
    const dq = md.points[tip.strand]?.q ?? 0;
    tipEl = (
      <div
        className={p.tip}
        style={{
          left: Math.min(tip.x - rect.left + 14, size.w - 230),
          top: Math.max(tip.y - rect.top - 10, 4),
        }}
        role="tooltip"
      >
        <strong>
          Zone {tip.valve + 1} · streng {tip.strand + 1} ({sp.panels} panelen)
        </strong>
        {q > 0 && th ? (
          <>
            Q {fmt(q * 3.6e6, 1)} l/h (ontwerp {fmt(dq * 3.6e6, 1)})
            <br />v {fmt(th.v, 2)} m/s · Re {fmt(reynolds(q, design.ctx.di, th.tMean), 0)}
            <br />
            Δp {fmt(dpv / 1000, 1)} kPa
            <br />
            {fmt(md.cond.tIn, 1)} → {fmt(zs.tRetStrand[tip.strand], 1)} °C ·{' '}
            {fmt(Math.abs(zs.pStrand[tip.strand]), 0)} W
          </>
        ) : (
          <>Geen doorstroming · ontwerp {fmt(dq * 3.6e6, 1)} l/h</>
        )}
      </div>
    );
  }

  return (
    <div>
      <div ref={wrapRef} className={p.wrap} style={{ height: size.h }} aria-label="Plafondplattegrond">
        <canvas ref={colorRef} className={p.canvas} aria-hidden="true" />
        <canvas ref={partRef} className={p.canvas} aria-hidden="true" style={{ pointerEvents: 'none' }} />
        <svg
          className={p.svg}
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="img"
          aria-label="Plafondplattegrond met strengen, panelen en kleppen. Selecteer een streng voor details."
        >
          <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
            {staticSvg}
            {dyn}
            {marks}
          </g>
        </svg>
        <div className={`${p.toolbar} noPrint`} role="group" aria-label="Weergave">
          <div className={ui.seg}>
            {OVERLAYS.map((o) => (
              <button
                key={o.id}
                type="button"
                aria-pressed={overlay === o.id}
                onClick={() => setOverlay(o.id)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <label>
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />{' '}
            Labels
          </label>
          <button type="button" className={`${ui.btn} ${ui.btnSmall}`} onClick={fit}>
            Passend maken
          </button>
        </div>
        <div className={p.legend} aria-label="Legenda">
          {overlay === 'verdeling' ? (
            <>
              <div>
                Q / Q<sub>ontwerp</sub>
              </div>
              <div className={p.legendBar} style={{ background: legendGradient(DEV_LUT) }} />
              <div className={p.legendTicks}>
                <span>−30 %</span>
                <span>0</span>
                <span>+30 %</span>
              </div>
            </>
          ) : (
            <>
              <div>{overlay === 'water' ? 'Watertemperatuur' : 'Oppervlaktetemperatuur'} (°C)</div>
              <div className={p.legendBar} style={{ background: legendGradient(TEMP_LUT) }} />
              <div className={p.legendTicks}>
                <span>{fmt(rng.cold, 0)}</span>
                <span>{fmt(tRoom0, 1)} (ruimte)</span>
                <span>{fmt(rng.warm, 0)}</span>
              </div>
              {overlay === 'oppervlak' && (
                <div style={{ marginTop: 3 }}>
                  ▨ gearceerd: onder T<sub>dauw</sub> + 1 K ({fmt(tDew + 1, 1)} °C)
                </div>
              )}
            </>
          )}
        </div>
        <div className={p.scale}>
          <div className={p.scaleBar} style={{ width: view.k }} />1 m
        </div>
        {tipEl}
      </div>
    </div>
  );
}
