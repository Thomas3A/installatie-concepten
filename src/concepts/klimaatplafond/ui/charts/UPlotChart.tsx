import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import { fmt, fmtClock } from '../../../../core/format';
import s from './Chart.module.css';

export interface ChartSeries {
  label: string;
  color: string;
  /** streepjespatroon in px (zoals uPlot); leeg = volle lijn */
  dash?: number[];
  width?: number;
  scale?: string;
  show?: boolean;
  /** vul onder de lijn */
  fill?: string;
  points?: boolean;
  /** aantal decimalen van de cursorwaarde in de legenda */
  digits?: number;
}

/** Extra legenda-item voor iets dat niet als reeks is getekend (verticale lijn, gearceerd venster). */
export interface LegendExtra {
  label: string;
  color: string;
  dash?: number[];
  kind?: 'line' | 'band';
}

export interface ChartAxis {
  scale: string;
  label?: string;
  side?: 1 | 3;
  grid?: boolean;
  /** formatter voor tick-labels */
  format?: (v: number) => string;
}

export interface UPlotChartProps {
  data: uPlot.AlignedData;
  series: ChartSeries[];
  /** x-as is tijd in seconden (hh:mm) of een gewone getalas */
  xKind?: 'time' | 'number';
  xLabel?: string;
  axes?: ChartAxis[];
  scales?: Record<string, uPlot.Scale>;
  height?: number;
  syncKey?: string;
  /** extra tekenhaken (bijv. arcering of verticale lijnen): `draw` en `drawClear` volgen altijd de laatste props */
  hooks?: uPlot.Hooks.Arrays;
  legendExtras?: LegendExtra[];
  ariaLabel: string;
}

function cssColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const CLOCK_STEPS = [60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 21600, 43200];

function clockSplits(
  _u: uPlot,
  _ax: number,
  min: number,
  max: number,
  _inc: number,
  _space: number,
): number[] {
  const span = Math.max(max - min, 1);
  const wantTicks = Math.max(2, Math.floor(700 / 80));
  const target = span / wantTicks;
  const step = CLOCK_STEPS.find((c) => c >= target) ?? CLOCK_STEPS[CLOCK_STEPS.length - 1];
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
  return out;
}

/** Lijnvoorbeeld in de legenda: toont kleur én streepjespatroon (vol, gestreept, gestippeld, streep-punt). */
function LineSwatch({
  color,
  dash,
  width = 1.6,
  dim,
}: {
  color: string;
  dash?: number[];
  width?: number;
  dim?: boolean;
}) {
  return (
    <svg
      className={s.swatch}
      width={34}
      height={10}
      viewBox="0 0 34 10"
      aria-hidden="true"
      opacity={dim ? 0.35 : 1}
    >
      <line
        x1={1}
        y1={5}
        x2={33}
        y2={5}
        stroke={color}
        strokeWidth={Math.max(2, width)}
        strokeDasharray={dash && dash.length ? dash.join(' ') : undefined}
      />
    </svg>
  );
}

function valueText(v: number | null | undefined, digits: number): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  return fmt(v, Math.abs(v) >= 1000 ? 0 : digits);
}

export function UPlotChart({
  data,
  series,
  xKind = 'time',
  xLabel,
  axes,
  scales,
  height = 220,
  syncKey,
  hooks,
  legendExtras,
  ariaLabel,
}: UPlotChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const [theme, setTheme] = useState(0);
  const [cursorIdx, setCursorIdx] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const hiddenRef = useRef(hidden);
  hiddenRef.current = hidden;
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;
  const sig = JSON.stringify([series, axes, xKind, xLabel, height, syncKey, theme]);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const f = (): void => setTheme((t) => t + 1);
    mq?.addEventListener?.('change', f);
    return () => mq?.removeEventListener?.('change', f);
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const text = cssColor('--text-2', '#666');
    const grid = cssColor('--border', '#ddd');
    const axStyle = {
      stroke: text,
      grid: { stroke: grid, width: 1 },
      ticks: { stroke: grid, width: 1 },
      font: '11px system-ui',
      labelFont: '11px system-ui',
    };
    const ax: uPlot.Axis[] = [
      {
        ...axStyle,
        label: xLabel,
        values: xKind === 'time' ? (_u, vals) => vals.map((v) => fmtClock(v)) : undefined,
        splits: xKind === 'time' ? clockSplits : undefined,
        size: 38,
      },
    ];
    const used = new Set(series.map((sr) => sr.scale ?? 'y'));
    const axDefs = axes ?? [{ scale: 'y' }];
    for (const a of axDefs) {
      if (!used.has(a.scale)) continue;
      ax.push({
        ...axStyle,
        scale: a.scale,
        label: a.label,
        side: a.side ?? 3,
        grid: a.grid === false ? { show: false } : { stroke: grid, width: 1 },
        values: a.format ? (_u, vals) => vals.map((v) => a.format!(v)) : undefined,
        size: 52,
      });
    }
    const opts: uPlot.Options = {
      width: Math.max(el.clientWidth, 200),
      height,
      padding: [8, 18, 0, 0],
      cursor: syncKey
        ? { sync: { key: syncKey }, drag: { x: true, y: false } }
        : { drag: { x: true, y: false } },
      // eigen legenda (zie onder): vaste breedtes, dus geen layoutverschuiving bij hoveren
      legend: { show: false },
      scales: { x: { time: false }, ...scales },
      axes: ax,
      series: [
        {},
        ...series.map(
          (sr): uPlot.Series => ({
            label: sr.label,
            stroke: sr.color,
            width: sr.width ?? 1.6,
            dash: sr.dash,
            scale: sr.scale ?? 'y',
            show: !hiddenRef.current[sr.label] && (sr.show ?? true),
            fill: sr.fill,
            points: { show: sr.points ?? false, size: 6 },
            spanGaps: false,
          }),
        ),
      ],
      hooks: {
        // `draw`/`drawClear` lezen steeds de laatste hooks, zodat de arcering meebeweegt met nieuwe gegevens
        drawClear: [(u: uPlot) => hooksRef.current?.drawClear?.forEach((fn) => fn?.(u))],
        draw: [(u: uPlot) => hooksRef.current?.draw?.forEach((fn) => fn?.(u))],
        setCursor: [(u: uPlot) => setCursorIdx(u.cursor.idx ?? null)],
      },
    };
    const u = new uPlot(opts, data, el);
    plot.current = u;
    const ro = new ResizeObserver(() => u.setSize({ width: Math.max(el.clientWidth, 200), height }));
    ro.observe(el);
    return () => {
      ro.disconnect();
      u.destroy();
      plot.current = null;
    };
    // data wordt apart bijgewerkt
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  useEffect(() => {
    plot.current?.setData(data);
  }, [data]);

  const toggle = (i: number, label: string): void => {
    const nowHidden = !hidden[label];
    setHidden((h) => ({ ...h, [label]: nowHidden }));
    plot.current?.setSeries(i + 1, { show: !nowHidden });
  };

  const xs = data[0] as ArrayLike<number> | undefined;
  const xVal = cursorIdx !== null && xs ? xs[cursorIdx] : null;
  const xText =
    xVal === null || xVal === undefined
      ? '–'
      : xKind === 'time'
        ? `t = ${fmtClock(xVal)}`
        : `x = ${fmt(xVal, Math.abs(xVal) >= 100 ? 0 : 1)}`;

  return (
    <div className={s.wrap}>
      <div ref={host} role="img" aria-label={ariaLabel} />
      <div className={s.legend} role="group" aria-label="Legenda">
        <span className={s.legendX} aria-hidden="true">
          {xText}
        </span>
        {series.map((sr, i) => {
          const on = !hidden[sr.label];
          const v =
            cursorIdx !== null ? (data[i + 1] as ArrayLike<number | null> | undefined)?.[cursorIdx] : null;
          return (
            <button
              key={sr.label}
              type="button"
              className={s.item}
              aria-pressed={on}
              title={`${sr.label}: klik om te tonen of te verbergen`}
              onClick={() => toggle(i, sr.label)}
            >
              <LineSwatch color={sr.color} dash={sr.dash} width={sr.width} dim={!on} />
              <span className={s.label}>{sr.label}</span>
              <span className={s.val}>{on ? valueText(v, sr.digits ?? 1) : ''}</span>
            </button>
          );
        })}
        {legendExtras?.map((x) => (
          <span key={x.label} className={s.extra}>
            {x.kind === 'band' ? (
              <svg className={s.swatch} width={34} height={10} viewBox="0 0 34 10" aria-hidden="true">
                <rect
                  x={1}
                  y={1}
                  width={32}
                  height={8}
                  rx={2}
                  fill={x.color}
                  stroke={x.color}
                  strokeOpacity={0.6}
                />
              </svg>
            ) : (
              <LineSwatch color={x.color} dash={x.dash} width={1.6} />
            )}
            <span>{x.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
