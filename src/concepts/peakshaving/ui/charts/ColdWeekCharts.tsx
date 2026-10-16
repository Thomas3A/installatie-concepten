// Tabblad Koude week (spec §7.1): drie gekoppelde panelen (warmte, elektrisch, toestand) over de koude week ± 24 uur,
// met arcering van weekend en gebruikstijd, een markering van het gekozen uur en de scrubber eronder.
// De grafieken krijgen de volledige jaarreeksen; het zichtbare venster wordt met setScale op de koude week gezet.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type uPlot from 'uplot';
import { fmt } from '../../../../core/format';
import {
  cssColor,
  UPlotChart,
  type ChartAxis,
  type ChartSeries,
  type LegendExtra,
} from '../../../../ui/charts/UPlotChart';
import u from '../../../../ui/ui.module.css';
import type { Analysis } from '../../model/analysis';
import { batteryUsableEnergy } from '../../model/battery';
import { COMFORT_MARGIN_K, HOURS_PER_YEAR } from '../../model/building';
import { COLD_WEEK_HOURS, formatHour, hourInfo, MONTH_SHORT, WEEKDAY_SHORT } from '../../model/climate';
import { useSelectedHour, useStore } from '../../store';
import {
  hatchToZero,
  hourSplits,
  markHours,
  markHoursAtBottom,
  pixelRatio,
  shadeAbove,
  shadeHours,
  shadeWeekends,
  verticalLine,
  withAlpha,
} from './coldWeekDraw';
import c from './ColdWeek.module.css';
import { Scrubber } from './Scrubber';

const N = HOURS_PER_YEAR;
/** x-waarden: uurindex van het jaar */
const HOURS_X = Float64Array.from({ length: N }, (_, i) => i);
/** lege reeks (houdt de linker as van paneel 3 aan als er geen opslag is) */
const NULLS: null[] = new Array<null>(N).fill(null);
const PANEL_HEIGHT = 210;
const PRINT_PANEL_HEIGHT = 170;
const SYNC_KEY = 'ps-koude-week';
/** breedte van een y-as met label in de wrapper (52 px as + 30 px label) */
const AXIS_WITH_LABEL_PX = 82;
// vaste middentonen, leesbaar op een lichte én een donkere achtergrond
const ORANGE = '#d97706';
const PURPLE = '#8b5cf6';
const CYAN = '#0891b2';
// gebied onder 0 % in paneel 3 voor de comfortverliesmarkeringen
const PCT_MIN = -14;

interface Palette {
  text: string;
  text2: string;
  cold: string;
  err: string;
  ok: string;
  accent: string;
  warn: string;
}

function readPalette(): Palette {
  return {
    text: cssColor('--text', '#1c2229'),
    text2: cssColor('--text-2', '#55606c'),
    cold: cssColor('--cold', '#2563a8'),
    err: cssColor('--err', '#b42318'),
    ok: cssColor('--ok', '#1a7f4b'),
    accent: cssColor('--accent', '#0f766e'),
    warn: cssColor('--warn', '#b45309'),
  };
}

/** Themakleuren; opnieuw gelezen bij een wisseling licht/donker. */
function usePalette(): Palette {
  const [pal, setPal] = useState(readPalette);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    const f = (): void => setPal(readPalette());
    mq?.addEventListener?.('change', f);
    return () => mq?.removeEventListener?.('change', f);
  }, []);
  return pal;
}

/** Afgeleide reeksen voor de panelen (gestapeld, negatief, percentages, comfortverlies). */
interface Derived {
  stackBuffer: Float64Array;
  stackBackup: Float64Array;
  stackDhw: Float64Array;
  charge: Float64Array;
  limit: Float64Array | null;
  socBuffer: Float64Array | null;
  socBattery: Float64Array | null;
  comfort: Uint8Array;
  comfortInWindow: number;
  /** uren met P_net > P_limiet in het venster */
  exceedInWindow: number;
  hasBattery: boolean;
  office: boolean;
}

function derive(a: Analysis): Derived {
  const se = a.main.series;
  const stackBuffer = new Float64Array(N);
  const stackBackup = new Float64Array(N);
  const stackDhw = new Float64Array(N);
  const charge = new Float64Array(N);
  const comfort = new Uint8Array(N);
  for (let t = 0; t < N; t++) {
    stackBuffer[t] = se.qSpaceHeating[t] + se.qBufferDischarge[t];
    stackBackup[t] = stackBuffer[t] + se.qBackup[t];
    stackDhw[t] = stackBackup[t] + se.qDhw[t];
    // geen −0 in de legenda
    charge[t] = se.qBufferCharge[t] > 0 ? -se.qBufferCharge[t] : 0;
    comfort[t] = a.hours.inUse[t] === 1 && se.indoorC[t] < se.setpointC[t] - COMFORT_MARGIN_K ? 1 : 0;
  }
  let comfortInWindow = 0;
  let exceedInWindow = 0;
  for (let t = a.coldWeek.from; t < a.coldWeek.to; t++) {
    comfortInWindow += comfort[t];
    if (se.pGrid[t] > a.pLimitKw + 1e-9) exceedInWindow++;
  }
  const eBuffer = a.main.kpis.bufferEnergyKwh;
  const eBattery = batteryUsableEnergy(a.input.battery);
  return {
    stackBuffer,
    stackBackup,
    stackDhw,
    charge,
    limit: Number.isFinite(a.pLimitKw) ? new Float64Array(N).fill(a.pLimitKw) : null,
    socBuffer: eBuffer > 0 ? se.socBuffer.map((v) => (100 * v) / eBuffer) : null,
    socBattery: eBattery > 0 ? se.socBattery.map((v) => (100 * v) / eBattery) : null,
    comfort,
    comfortInWindow,
    exceedInWindow,
    hasBattery: a.input.battery.capacityKwh > 0,
    office: a.input.building.use === 'office',
  };
}

/** Ticklabel: om 00:00 de dag ("do 16 jan"), anders het uur ("12:00"). */
function tickLabel(v: number, startWeekday: number): string {
  const t = Math.round(v);
  if (t < 0 || t >= N) return '';
  const h = hourInfo(t, startWeekday);
  if (h.hour === 0) return `${WEEKDAY_SHORT[h.weekday - 1]} ${h.day} ${MONTH_SHORT[h.month]}`;
  return `${String(h.hour).padStart(2, '0')}:00`;
}

/** Bereik van de temperatuuras: minstens 4 K, op hele graden. */
function tempRange(_u: uPlot, min: number | null, max: number | null): [number, number] {
  if (min === null || max === null || !Number.isFinite(min) || !Number.isFinite(max)) return [15, 22];
  const mid = (min + max) / 2;
  const half = Math.max((max - min) / 2 + 0.4, 2);
  return [Math.floor(mid - half), Math.ceil(mid + half)];
}

/** `print`: compacte weergave voor de printversie (warmte en elektrisch, zonder bediening en scrubber). */
export function ColdWeekCharts({ print = false }: { print?: boolean }) {
  const analysis = useStore((st) => st.analysis);
  const setScrubHour = useStore((st) => st.setScrubHour);
  const selected = useSelectedHour();
  const pal = usePalette();
  const derived = useMemo(() => (analysis ? derive(analysis) : null), [analysis]);

  const boxRef = useRef<HTMLDivElement>(null);
  const plots = useRef<(uPlot | null)[]>([null, null, null]);
  const windowRef = useRef<{ from: number; to: number } | null>(null);
  windowRef.current = analysis ? { from: analysis.coldWeek.from, to: analysis.coldWeek.to } : null;
  const weekdayRef = useRef(1);
  weekdayRef.current = analysis?.startWeekday ?? 1;
  // klik na slepen (inzoomen) niet als keuze van een uur tellen
  const pointer = useRef({ downX: 0, dragged: false });

  /** Zichtbaar venster terug op de koude week ± 24 uur. */
  const applyWindow = useCallback((p: uPlot | null): void => {
    const w = windowRef.current;
    if (!p || !w || !p.root.isConnected) return;
    p.setScale('x', { min: w.from, max: w.to - 1 });
  }, []);

  const resetView = useCallback((): void => {
    plots.current.forEach(applyWindow);
  }, [applyWindow]);

  // nieuwe resultaten: setData zet de schalen terug op het hele jaar, dus het venster opnieuw toepassen
  useEffect(() => {
    resetView();
  }, [analysis, resetView]);

  // gekozen uur verandert: alleen opnieuw tekenen (markering), geen nieuwe paden
  useEffect(() => {
    plots.current.forEach((p) => {
      if (p && p.root.isConnected) p.redraw(false);
    });
  }, [selected, pal]);

  const plotWidthCss = (): number => {
    const p = plots.current.find((q) => q && q.root.isConnected && q.bbox);
    if (p) return p.bbox.width / pixelRatio();
    return Math.max(200, (boxRef.current?.clientWidth ?? 700) - 2 * AXIS_WITH_LABEL_PX - 18);
  };
  const xSplits = (min: number, max: number): number[] => hourSplits(min, max, plotWidthCss());
  const xFormat = (v: number): string => {
    const t = Math.round(v);
    return t >= 0 && t < N ? formatHour(t, weekdayRef.current) : '';
  };

  const onReady =
    (i: number) =>
    (p: uPlot): void => {
      plots.current[i] = p;
      // ticklabels kort houden (dag om 00:00, anders het uur); de legenda toont de volledige datum via xFormat
      p.axes[0].values = (_u, splits) => splits.map((v) => tickLabel(v, weekdayRef.current));
      p.over.addEventListener('mousedown', (e: MouseEvent) => {
        pointer.current.downX = e.clientX;
      });
      p.over.addEventListener('click', (e: MouseEvent) => {
        pointer.current.dragged = Math.abs(e.clientX - pointer.current.downX) > 3;
      });
      applyWindow(p);
    };

  const onClickX = (x: number): void => {
    if (pointer.current.dragged) {
      pointer.current.dragged = false;
      return;
    }
    const w = windowRef.current;
    if (!w || !Number.isFinite(x)) return;
    setScrubHour(Math.min(Math.max(Math.round(x), w.from), w.to - 1));
  };

  const data = useMemo(() => {
    if (!analysis || !derived) return null;
    const se = analysis.main.series;
    const heat: uPlot.AlignedData = [
      HOURS_X,
      se.qSpaceHeating,
      derived.stackBuffer,
      derived.stackBackup,
      derived.stackDhw,
      derived.charge,
      se.qRequested,
      se.outdoorC,
      se.outdoorFilteredC,
    ];
    const elec: (Float64Array | null[])[] = [HOURS_X, se.pElectric];
    if (derived.hasBattery) elec.push(se.pBattery);
    elec.push(se.pGrid);
    if (derived.limit) elec.push(derived.limit);
    const state: (Float64Array | null[])[] = [HOURS_X];
    if (derived.socBuffer) state.push(derived.socBuffer);
    if (derived.socBattery) state.push(derived.socBattery);
    if (!derived.socBuffer && !derived.socBattery) state.push(NULLS);
    state.push(se.indoorC, se.setpointC);
    return { heat, elec: elec as uPlot.AlignedData, state: state as uPlot.AlignedData };
  }, [analysis, derived]);

  if (!analysis || !derived || !data) {
    return <p className={c.placeholder}>De koude week wordt berekend…</p>;
  }

  const se = analysis.main.series;
  const sw = analysis.startWeekday;
  const { start, meanOutdoorC } = analysis.coldWeek;
  const pLimit = analysis.pLimitKw;

  // ---- arcering en markering (alle panelen)
  const shading = {
    weekend: withAlpha(pal.text2, 0.13),
    inUse: withAlpha(pal.accent, 0.1),
    preheat: withAlpha(pal.warn, 0.16),
  };
  const shade = (p: uPlot): void => {
    shadeWeekends(p, N, sw, shading.weekend);
    if (derived.office) {
      shadeHours(p, N, (t) => analysis.hours.inUse[t] === 1, shading.inUse);
      shadeHours(p, N, (t) => analysis.hours.preheat[t] === 1, shading.preheat);
    }
  };
  const marker = (p: uPlot): void => {
    if (selected !== null) verticalLine(p, selected, pal.accent, 2);
  };
  const shadingLegend: LegendExtra[] = [
    { label: 'Weekend', color: withAlpha(pal.text2, 0.3), kind: 'band' },
    ...(derived.office
      ? [
          { label: 'Gebruikstijd', color: withAlpha(pal.accent, 0.3), kind: 'band' as const },
          { label: 'Opstookuren', color: withAlpha(pal.warn, 0.35), kind: 'band' as const },
        ]
      : []),
    { label: 'Gekozen uur (scrubber)', color: pal.accent, kind: 'line' },
  ];

  // ---- paneel 1: warmte
  const heatSeries: ChartSeries[] = [
    { label: 'WP direct', color: pal.cold, width: 1.5, fill: withAlpha(pal.cold, 0.3), digits: 2 },
    {
      label: 'Buffer ontladen',
      color: ORANGE,
      width: 0,
      fill: withAlpha(ORANGE, 0.55),
      digits: 2,
      legendValue: (i) => se.qBufferDischarge[i],
    },
    {
      label: 'Bijstook',
      color: pal.err,
      width: 0,
      fill: withAlpha(pal.err, 0.5),
      digits: 2,
      legendValue: (i) => se.qBackup[i],
    },
    {
      label: 'Boiler laden',
      color: PURPLE,
      width: 0,
      fill: withAlpha(PURPLE, 0.45),
      digits: 2,
      legendValue: (i) => se.qDhw[i],
    },
    { label: 'Buffer laden (negatief)', color: ORANGE, width: 0, fill: withAlpha(ORANGE, 0.14), digits: 2 },
    { label: 'Gevraagd', color: pal.text2, dash: [5, 4], width: 1.6, digits: 2 },
    { label: 'T buiten', color: CYAN, width: 1, scale: 'temp', digits: 1 },
    { label: 'T buiten gefilterd', color: CYAN, dash: [2, 3], width: 1.3, scale: 'temp', digits: 1 },
  ];
  const heatBands: uPlot.Band[] = [
    { series: [2, 1], fill: withAlpha(ORANGE, 0.55) },
    { series: [3, 2], fill: withAlpha(pal.err, 0.5) },
    { series: [4, 3], fill: withAlpha(PURPLE, 0.45) },
  ];
  const heatAxes: ChartAxis[] = [
    { scale: 'y', label: 'Warmte [kW]' },
    { scale: 'temp', label: 'Buiten [°C]', side: 1, grid: false },
  ];
  const heatHooks: uPlot.Hooks.Arrays = {
    drawClear: [shade],
    draw: [
      (p: uPlot) => {
        if (p.series[5]?.show) hatchToZero(p, derived.charge, 'y', withAlpha(ORANGE, 0.85));
      },
      marker,
    ],
  };

  // ---- paneel 2: elektrisch
  const elecSeries: ChartSeries[] = [{ label: 'WP elektrisch', color: pal.cold, width: 1.6, digits: 2 }];
  if (derived.hasBattery) {
    elecSeries.push({
      label: 'Batterij (+ ontladen, − laden)',
      color: pal.ok,
      width: 1.4,
      fill: withAlpha(pal.ok, 0.16),
      digits: 2,
    });
  }
  const gridIdx = elecSeries.length + 1; // uPlot-index van P_net (0 = x)
  elecSeries.push({ label: 'Aan de meter (WP-groep)', color: pal.text, width: 2, digits: 2 });
  if (derived.limit) {
    elecSeries.push({
      label: `WP-budget ${fmt(pLimit, 2)} kW`,
      color: pal.err,
      dash: [6, 4],
      width: 1.5,
      digits: 2,
    });
  }
  const elecAxes: ChartAxis[] = [
    { scale: 'y', label: 'Elektrisch [kW]' },
    // spiegelas rechts: houdt de plotbreedte gelijk aan die van de andere panelen
    { scale: 'y', label: 'Elektrisch [kW]', side: 1, grid: false },
  ];
  const elecHooks: uPlot.Hooks.Arrays = {
    drawClear: [
      shade,
      (p: uPlot) => {
        if (derived.limit && p.series[gridIdx]?.show)
          shadeAbove(p, se.pGrid, pLimit, 'y', withAlpha(pal.err, 0.32));
      },
    ],
    draw: [
      // per uur een streepje onderaan: bij een venster van 9 dagen is het vlak boven het budget vaak maar smal
      (p: uPlot) => {
        if (derived.limit) markHoursAtBottom(p, N, (t) => se.pGrid[t] > pLimit + 1e-9, 5, pal.err);
      },
      marker,
    ],
  };
  const elecLegend: LegendExtra[] = derived.limit
    ? [
        {
          label: `Overschrijding boven het budget (vlak; streepje onderaan per uur: ${fmt(derived.exceedInWindow, 0)} uur in venster)`,
          color: withAlpha(pal.err, 0.45),
          kind: 'band',
        },
      ]
    : [];

  // ---- paneel 3: toestand
  const stateSeries: ChartSeries[] = [];
  if (derived.socBuffer) {
    stateSeries.push({ label: 'Laadtoestand buffer', color: ORANGE, width: 1.6, scale: 'pct', digits: 0 });
  }
  if (derived.socBattery) {
    stateSeries.push({ label: 'Laadtoestand batterij', color: pal.ok, width: 1.6, scale: 'pct', digits: 0 });
  }
  if (!derived.socBuffer && !derived.socBattery) {
    stateSeries.push({ label: 'Geen opslag', color: 'transparent', scale: 'pct', hidden: true });
  }
  stateSeries.push(
    { label: 'T binnen', color: pal.text, width: 1.6, scale: 'temp', digits: 1 },
    { label: 'T setpoint', color: pal.text2, dash: [5, 4], width: 1.3, scale: 'temp', digits: 1, step: true },
  );
  const stateAxes: ChartAxis[] = [
    { scale: 'pct', label: 'Laadtoestand [%]', format: (v) => (v < 0 ? '' : fmt(v, 0)) },
    { scale: 'temp', label: 'Binnen [°C]', side: 1, grid: false },
  ];
  const stateScales: Record<string, uPlot.Scale> = {
    pct: { range: [PCT_MIN, 100] },
    temp: { range: tempRange },
  };
  const stateHooks: uPlot.Hooks.Arrays = {
    drawClear: [shade],
    draw: [
      (p: uPlot) => markHours(p, N, (t) => derived.comfort[t] === 1, 'pct', -3, PCT_MIN + 3, pal.err),
      marker,
    ],
  };
  const stateLegend: LegendExtra[] = [
    {
      label: `Comfortverlies: T binnen > 0,5 K onder setpoint in gebruik (${fmt(derived.comfortInWindow, 0)} uur in venster)`,
      color: pal.err,
      kind: 'band',
    },
  ];
  const storageNote =
    !derived.socBuffer && !derived.socBattery
      ? 'Geen buffer en geen batterij ingesteld: geen laadtoestand.'
      : null;

  const common = {
    xKind: 'custom' as const,
    xFormat,
    xSplits,
    height: print ? PRINT_PANEL_HEIGHT : PANEL_HEIGHT,
    syncKey: print ? `${SYNC_KEY}-print` : SYNC_KEY,
    onClickX,
  };

  return (
    <div ref={boxRef}>
      <div className={c.head}>
        <p className={c.intro}>
          Koudste week (hoogste warmtevraag):{' '}
          <strong>
            {formatHour(start, sw)} – {formatHour(start + COLD_WEEK_HOURS - 1, sw)}
          </strong>
          , gemiddeld <strong>{`${fmt(meanOutdoorC, 1)}\u00a0°C`}</strong>; getoond met 24 uur ervoor en erna.
        </p>
        {!print && (
          <button
            type="button"
            className={`${u.btn} ${u.btnSmall}`}
            onClick={resetView}
            title="Zoom terug naar de koude week met 24 uur ervoor en erna"
          >
            Terug naar koude week
          </button>
        )}
      </div>
      {!print && (
        <p className={c.hint}>
          Sleep in een grafiek om in te zoomen; klik om een uur te kiezen. De panelen bewegen samen.
        </p>
      )}
      <div className={c.panels}>
        <section className={c.panel} aria-label="Warmte">
          <h3>Warmte</h3>
          <UPlotChart
            {...common}
            data={data.heat}
            series={heatSeries}
            bands={heatBands}
            axes={heatAxes}
            hooks={heatHooks}
            legendExtras={shadingLegend}
            ariaLabel="Warmte in de koude week: gevraagd vermogen, levering door warmtepomp, buffer, bijstook en boiler, met buitentemperatuur"
            onReady={onReady(0)}
            exportName="koude-week-warmte"
          />
        </section>
        <section className={c.panel} aria-label="Elektrisch">
          <h3>Elektrisch (WP-groep)</h3>
          <UPlotChart
            {...common}
            data={data.elec}
            series={elecSeries}
            axes={elecAxes}
            hooks={elecHooks}
            legendExtras={elecLegend}
            ariaLabel="Elektrisch vermogen in de koude week: warmtepomp, batterij, aan de meter en het WP-budget"
            onReady={onReady(1)}
            exportName="koude-week-elektrisch"
          />
        </section>
        {!print && (
          <section className={c.panel} aria-label="Toestand">
            <h3>Toestand</h3>
            <UPlotChart
              {...common}
              data={data.state}
              series={stateSeries}
              axes={stateAxes}
              scales={stateScales}
              hooks={stateHooks}
              legendExtras={stateLegend}
              ariaLabel="Toestand in de koude week: laadtoestand van buffer en batterij, binnentemperatuur en setpoint"
              onReady={onReady(2)}
              exportName="koude-week-toestand"
            />
            {storageNote && <p className={c.hint}>{storageNote}</p>}
          </section>
        )}
      </div>
      {!print && <Scrubber />}
    </div>
  );
}
