import { useEffect, useRef, useState } from 'react';
import uPlot from 'uplot';
import { fmtClock } from '../../../../core/format';

export interface ChartSeries {
  label: string;
  color: string;
  dash?: number[];
  width?: number;
  scale?: string;
  show?: boolean;
  /** vul onder de lijn */
  fill?: string;
  points?: boolean;
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
  /** extra tekenhaken (bijv. arcering of verticale lijnen) */
  hooks?: uPlot.Hooks.Arrays;
  ariaLabel: string;
}

function cssColor(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

const CLOCK_STEPS = [60, 120, 300, 600, 900, 1800, 3600, 7200, 14400, 21600, 43200];

function clockSplits(_u: uPlot, _ax: number, min: number, max: number, _inc: number, space: number): number[] {
  const span = Math.max(max - min, 1);
  const wantTicks = Math.max(2, Math.floor((space > 0 ? 700 : 700) / 80));
  const target = span / wantTicks;
  const step = CLOCK_STEPS.find((s) => s >= target) ?? CLOCK_STEPS[CLOCK_STEPS.length - 1];
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
  return out;
}

export function UPlotChart({ data, series, xKind = 'time', xLabel, axes, scales, height = 220, syncKey, hooks, ariaLabel }: UPlotChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const [theme, setTheme] = useState(0);
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
    const axStyle = { stroke: text, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid, width: 1 }, font: '11px system-ui', labelFont: '11px system-ui' };
    const ax: uPlot.Axis[] = [
      {
        ...axStyle,
        label: xLabel,
        values: xKind === 'time' ? (_u, vals) => vals.map((v) => fmtClock(v)) : undefined,
        splits: xKind === 'time' ? clockSplits : undefined,
        size: 38,
      },
    ];
    const used = new Set(series.map((s) => s.scale ?? 'y'));
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
      padding: [8, 8, 0, 0],
      cursor: syncKey ? { sync: { key: syncKey }, drag: { x: true, y: false } } : { drag: { x: true, y: false } },
      legend: { show: true, live: true },
      scales: { x: { time: false }, ...scales },
      axes: ax,
      series: [
        {},
        ...series.map(
          (s): uPlot.Series => ({
            label: s.label,
            stroke: s.color,
            width: s.width ?? 1.6,
            dash: s.dash,
            scale: s.scale ?? 'y',
            show: s.show ?? true,
            fill: s.fill,
            points: { show: s.points ?? false, size: 6 },
            spanGaps: false,
          }),
        ),
      ],
      hooks,
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

  return <div ref={host} role="img" aria-label={ariaLabel} />;
}
