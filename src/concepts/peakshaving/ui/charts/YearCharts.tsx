// Tabblad Jaar (spec §7.2): jaarbelastingduurkromme elektrisch en thermisch, en de maandbalans.
import { useMemo, useState, useSyncExternalStore } from 'react';
import uPlot from 'uplot';
import { fmt } from '../../../../core/format';
import ui from '../../../../ui/ui.module.css';
import { cssColor, UPlotChart, type ChartSeries, type LegendExtra } from '../../../../ui/charts/UPlotChart';
import { CONNECTIONS, LARGE_CONNECTION_ID, type ConnectionDef } from '../../data/connections';
import type { Analysis } from '../../model/analysis';
import { HOURS_PER_YEAR } from '../../model/building';
import { MONTH_SHORT } from '../../model/climate';
import { limitFromConnection } from '../../model/grid';
import { useStore } from '../../store';
import css from './YearCharts.module.css';

type XMode = 'log' | 'lin';

/** Zelfde marge als de telling van overschrijdingsuren in de simulatie. */
const EXCEED_EPS = 1e-6;

/** Rangnummer 1…8760 (x-as van de duurkrommen; begint bij 1 zodat een logaritmische as kan). */
const RANK = Float64Array.from({ length: HOURS_PER_YEAR }, (_, i) => i + 1);
const MONTH_X = Array.from({ length: 12 }, (_, i) => i);

/** onder deze grafiekbreedte smalle y-assen zonder gedraaide astitels [px] */
const COMPACT_BELOW_PX = 560;
/**
 * Een budgetlijn hoger dan deze factor × de hoogste kromme rekt de as niet op (bijv. grootverbruik): de krommen
 * blijven leesbaar en de lijn verschijnt als label "↑ …" aan de bovenrand.
 */
const OFF_SCALE_FACTOR = 2;

// vaste middentinten die in het lichte én donkere thema leesbaar zijn
const BUFFER_COLOR = '#e8892b';
const DHW_COLOR = '#8b5cf6';
const REFERENCE_GREY = '#9ca3af';

/** Korte uitleg per grafiek (UX-plan §7 #18). */
const LEAD = {
  electric:
    'Alle uren van het jaar, van hoog naar laag; boven een lijn is die aansluiting te klein (uren in de legenda).',
  thermal: 'Warmtevraag per uur, van hoog naar laag, met wat de warmtepomp bij −10 °C levert.',
  monthly: 'Warmte per bron en elektriciteit per maand; de lijn is de SCOP.',
} as const;
/** Bediening met de muis (de tool is voor een pc of laptop). */
const HINT = 'Sleep om in te zoomen, dubbelklik om terug te gaan.';

// ---------------------------------------------------------------- thema

function subscribeScheme(cb: () => void): () => void {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  mq?.addEventListener?.('change', cb);
  return () => mq?.removeEventListener?.('change', cb);
}

/** Herteken met de themakleuren als het kleurschema van het systeem wisselt. */
function useDarkScheme(): boolean {
  return useSyncExternalStore(
    subscribeScheme,
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
    () => false,
  );
}

interface Palette {
  text: string;
  text2: string;
  surface: string;
  cold: string;
  warm: string;
  err: string;
  warn: string;
  ok: string;
}

function palette(): Palette {
  return {
    text: cssColor('--text', '#1c2229'),
    text2: cssColor('--text-2', '#55606c'),
    surface: cssColor('--surface', '#ffffff'),
    cold: cssColor('--cold', '#2563a8'),
    warm: cssColor('--warm', '#c2410c'),
    err: cssColor('--err', '#b42318'),
    warn: cssColor('--warn', '#b45309'),
    ok: cssColor('--ok', '#1a7f4b'),
  };
}

/** Hex-kleur met transparantie (andere notaties ongewijzigd). */
function withAlpha(color: string, alpha: number): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) {
    return (
      color +
      Math.round(alpha * 255)
        .toString(16)
        .padStart(2, '0')
    );
  }
  return color;
}

// ---------------------------------------------------------------- hulpfuncties

/** Mooie bovengrens voor een as (1; 1,2; 1,4; … 9 · 10^k). */
function niceCeil(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const f of [1, 1.2, 1.4, 1.6, 1.8, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6, 7, 8, 9, 10]) {
    if (f * mag >= v - 1e-12) return f * mag;
  }
  return 10 * mag;
}

/** Aantal uren boven een grens in een aflopend gesorteerde reeks (binair zoeken). */
function hoursAbove(sortedDesc: Float64Array, limit: number): number {
  let lo = 0;
  let hi = sortedDesc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedDesc[mid] > limit + EXCEED_EPS) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Tickposities voor de rang-as: decaden (log) of een ronde stap (lineair). */
function rankSplits(mode: XMode) {
  return (min: number, max: number): number[] => {
    const out: number[] = [];
    if (mode === 'log') {
      const lo = Math.max(min, 1);
      const span = Math.log10(max / lo);
      // bij ingezoomd venster ook 2 en 5 per decade
      const mults = span < 1.6 ? [1, 2, 5] : [1];
      for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(max)); e++) {
        for (const m of mults) {
          const v = m * 10 ** e;
          if (v >= lo - 1e-9 && v <= max + 1e-9) out.push(v);
        }
      }
      // geen tick op 8760: uPlot toont op een logaritmische as alleen labels bij 1, 2, 5 · 10^k
      return out;
    }
    const span = Math.max(max - min, 1);
    const raw = span / 5;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = ([1, 2, 5, 10].find((f) => f * mag >= raw) ?? 10) * mag;
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(v);
    return out;
  };
}

/** x-schaal van de duurkrommen; de bereikfunctie is idempotent (uPlot roept haar bij elke herteken aan). */
function rankScale(mode: XMode): uPlot.Scale {
  if (mode === 'log') {
    return {
      time: false,
      distr: 3,
      log: 10,
      range: (_u, min, max) => [Math.max(1, min), Math.min(HOURS_PER_YEAR, max)],
    };
  }
  return {
    time: false,
    range: (_u, min, max) => [min <= 1 ? 0 : min, Math.min(HOURS_PER_YEAR, max)],
  };
}

/** Cursortekst van de rang-as: het aantal uren per jaar met minstens dit vermogen. */
const formatRank = (v: number | null): string =>
  v === null || !Number.isFinite(v) ? '' : `${fmt(v, 0)} uur/jaar`;
/** Ticklabels van de rang-as (de eenheid staat in de astitel); uPlot geeft `null` voor weggefilterde ticks. */
const rankTick = (v: number | null): string => (v === null || !Number.isFinite(v) ? '' : fmt(v, 0));

interface HLine {
  value: number;
  color: string;
  dash: number[];
  width: number;
  /** label op de lijn, rechts uitgelijnd */
  text: string;
  /** tekstkleur als die af moet wijken van de lijnkleur (lichtgrijze lijnen) */
  textColor?: string;
}

/**
 * Horizontale referentielijnen met label rechts in het grafiekvlak (labels schuiven op als ze elkaar raken). Lijnen
 * boven de as (bijv. een grootverbruikaansluiting ver boven de krommen) komen als label "↑ …" aan de bovenrand.
 */
function hLinesHook(lines: HLine[], background: string): uPlot.Hooks.Arrays {
  return {
    draw: [
      (u: uPlot) => {
        const { ctx } = u;
        const { left, top, width, height } = u.bbox; // canvaspixels
        const r = uPlot.pxRatio || 1;
        const yMax = u.scales.y.max ?? Infinity;
        const above = lines.filter((l) => Number.isFinite(l.value) && l.value > yMax + 1e-9);
        const pos = lines
          .filter((l) => Number.isFinite(l.value))
          .map((l) => ({ l, y: u.valToPos(l.value, 'y', true) }))
          .filter((p) => p.y >= top - 0.5 && p.y <= top + height + 0.5)
          .sort((a, b) => a.y - b.y);
        ctx.save();
        for (const p of pos) {
          ctx.strokeStyle = p.l.color;
          ctx.lineWidth = p.l.width * r;
          ctx.setLineDash(p.l.dash.map((d) => d * r));
          ctx.beginPath();
          ctx.moveTo(left, p.y);
          ctx.lineTo(left + width, p.y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.font = `${Math.round(11 * r)}px system-ui, sans-serif`;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        const lineH = 14 * r;
        const x = left + width - 6 * r;
        let prev = -Infinity;
        for (const l of above) {
          const y = Math.max(top + 12 * r, prev + lineH);
          prev = y;
          const text = `↑ ${l.text}`;
          const w = ctx.measureText(text).width;
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = background;
          ctx.fillRect(x - w - 3 * r, y - 11 * r, w + 6 * r, 14 * r);
          ctx.globalAlpha = 1;
          ctx.fillStyle = l.textColor ?? l.color;
          ctx.fillText(text, x, y);
        }
        for (const p of pos) {
          const y = Math.max(p.y - 4 * r, top + 12 * r, prev + lineH);
          prev = y;
          const w = ctx.measureText(p.l.text).width;
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = background;
          ctx.fillRect(x - w - 3 * r, y - 11 * r, w + 6 * r, 14 * r);
          ctx.globalAlpha = 1;
          ctx.fillStyle = p.l.textColor ?? p.l.color;
          ctx.fillText(p.l.text, x, y);
        }
        ctx.restore();
      },
    ],
  };
}

/**
 * De twee standaardaansluitingen naast de huidige: één kleiner en één groter; aan de rand van de lijst (of bij
 * grootverbruik) de twee dichtstbijzijnde.
 */
function neighbourConnections(connectionKw: number): ConnectionDef[] {
  const others = CONNECTIONS.filter((c) => Math.abs(c.powerKw - connectionKw) > 1e-6);
  const below = others.filter((c) => c.powerKw < connectionKw);
  const above = others.filter((c) => c.powerKw > connectionKw);
  if (below.length > 0 && above.length > 0) return [below[below.length - 1], above[0]];
  return [...others]
    .sort((x, y) => Math.abs(x.powerKw - connectionKw) - Math.abs(y.powerKw - connectionKw))
    .slice(0, 2)
    .sort((x, y) => x.powerKw - y.powerKw);
}

/** P_limiet zoals in de spec: 3,22 kW, 27,71 kW. */
const kwText = (v: number): string => fmt(v, v < 100 ? 2 : 1);
/** Vermogen met zinvolle precisie: 6,10 kW, 88,7 kW, 144 kW. */
const kwShort = (v: number): string => fmt(v, v < 10 ? 2 : v < 100 ? 1 : 0);
/** Volume zonder overbodige nullen: 1 m³, 2,5 m³, 0,25 m³. */
const m3Text = (v: number): string => fmt(v, Number.isInteger(v) ? 0 : Number.isInteger(v * 10) ? 1 : 2);

// ---------------------------------------------------------------- grafiekgegevens

interface DurationLimit {
  /** "1×35 A · 40 % = 3,22 kW" */
  name: string;
  limitKw: number;
  current: boolean;
  color: string;
  dash: number[];
}

function connectionLimits(a: Analysis, pal: Palette): DurationLimit[] {
  const share = a.input.grid.heatPumpShare;
  const pct = `${fmt(share * 100, 0)} %`;
  const out: DurationLimit[] = [];
  const neighbours = neighbourConnections(a.connectionKw);
  neighbours.forEach((c, i) => {
    const limitKw = limitFromConnection(c.powerKw, share);
    if (!Number.isFinite(limitKw)) return;
    out.push({
      name: `${c.label} · ${pct} = ${kwText(limitKw)} kW`,
      limitKw,
      current: false,
      // de lagere van de twee buren oranje, de hogere groen
      color: neighbours.length > 1 && i === 0 ? pal.warn : pal.ok,
      dash: [3, 3],
    });
  });
  if (Number.isFinite(a.pLimitKw)) {
    const conn =
      a.input.grid.connection === LARGE_CONNECTION_ID
        ? `grootverbruik ${fmt(a.connectionKw, 0)} kW`
        : a.connectionLabel;
    out.push({
      name: `${conn} · ${pct} = ${kwText(a.pLimitKw)} kW`,
      limitKw: a.pLimitKw,
      current: true,
      color: pal.err,
      dash: [7, 4],
    });
  }
  return out.sort((x, y) => x.limitKw - y.limitKw);
}

function electricChart(a: Analysis, pal: Palette) {
  const d = a.durationCurves;
  const curves = [d.pGrid, d.pElectricNoBattery, d.pElectricWithoutBuffer];
  const peak = Math.max(d.pGrid[0] ?? 0, d.pElectricNoBattery[0] ?? 0, d.pElectricWithoutBuffer[0] ?? 0);
  const digits = peak < 20 ? 2 : 1;
  // volgorde = tekenvolgorde: de gestreepte blauwe lijn ligt bovenop P_net, zodat die zichtbaar blijft waar ze samenvallen
  const series: ChartSeries[] = [
    { label: 'Zonder maatregelen', color: REFERENCE_GREY, width: 3.5, digits },
    { label: 'Aan de meter (met maatregelen)', color: pal.text, width: 1.8, digits },
    { label: 'Zonder batterij', color: pal.cold, width: 1.8, dash: [8, 5], digits },
  ];
  const limits = connectionLimits(a, pal);
  const extras: LegendExtra[] = limits.map((l) => {
    const [net, noBat, bare] = curves.map((c) => hoursAbove(c, l.limitKw));
    const counts =
      net === noBat && noBat === bare
        ? `${fmt(net, 0)} uur erboven (alle drie de krommen)`
        : `uur erboven: ${fmt(net, 0)} met maatregelen · ${fmt(noBat, 0)} zonder batterij · ${fmt(bare, 0)} zonder maatregelen`;
    return {
      label: `${l.current ? 'Huidige aansluiting ' : ''}${l.name} — ${counts}`,
      color: l.color,
      dash: l.dash,
      kind: 'line',
    };
  });
  const lines: HLine[] = limits.map((l) => ({
    value: l.limitKw,
    color: l.color,
    dash: l.dash,
    width: l.current ? 2 : 1.5,
    text: `${l.current ? 'huidig: ' : ''}${l.name}`,
  }));
  // budgetten ver boven de krommen rekken de as niet op (ze komen als label aan de bovenrand)
  const onScale = limits.filter((l) => l.limitKw <= OFF_SCALE_FACTOR * peak).map((l) => l.limitKw);
  const yMax = niceCeil(Math.max(peak, ...onScale) * 1.06);
  const data: uPlot.AlignedData = [RANK, d.pElectricWithoutBuffer, d.pGrid, d.pElectricNoBattery];
  return { data, series, extras, lines, yMax };
}

function thermalChart(a: Analysis, pal: Palette) {
  const q = a.durationCurves.qIdeal;
  const { withBuffer, withoutBuffer } = a.capacityAtMinus10;
  const auto = a.input.heatPump.sizingMode === 'auto';
  const volume = a.input.buffer.volumeM3;
  const lines: HLine[] = [];
  const extras: LegendExtra[] = [];
  // kort label op de lijn (de kromme blijft vrij), volledige tekst in de legenda
  const add = (value: number, legend: string, short: string, color: string, dash: number[]): void => {
    if (!Number.isFinite(value)) return;
    const kw = `${kwShort(value)} kW`;
    const textColor = color === REFERENCE_GREY ? pal.text2 : undefined;
    lines.push({ value, color, dash, width: 1.8, text: `${short}: ${kw}`, textColor });
    extras.push({ label: `${legend} bij −10 °C: ${kw}`, color, dash, kind: 'line' });
  };
  if (auto && volume <= 0) {
    add(withoutBuffer, 'Benodigde WP (geen buffer)', 'WP zonder buffer', REFERENCE_GREY, [3, 3]);
  } else {
    add(withoutBuffer, 'Benodigde WP zonder buffer', 'zonder buffer', REFERENCE_GREY, [3, 3]);
    if (auto) {
      add(withBuffer, `Benodigde WP met buffer (${m3Text(volume)} m³)`, 'met buffer', pal.cold, [7, 4]);
    } else {
      add(withBuffer, `Gekozen WP (${fmt(a.nominalKw, 1)} kW nominaal)`, 'gekozen WP', pal.cold, [7, 4]);
    }
  }
  const peak = q[0] ?? 0;
  const series: ChartSeries[] = [
    { label: 'Ideale warmtevraag (gesorteerd)', color: pal.warm, width: 2, digits: peak < 20 ? 2 : 1 },
  ];
  const yMax = niceCeil(
    Math.max(peak, ...lines.map((l) => l.value).filter((v) => v <= OFF_SCALE_FACTOR * peak)) * 1.06,
  );
  const data: uPlot.AlignedData = [RANK, q];
  return { data, series, extras, lines, yMax };
}

function monthlyChart(a: Analysis, pal: Palette) {
  const m = a.monthly;
  const maxTotal = Math.max(
    ...m.map((x) => Math.max(x.heatPumpDirect + x.bufferDischarge + x.backup + x.dhw, x.electricity)),
  );
  // grote gebouwen in MWh, anders kWh
  const mwh = maxTotal >= 10000;
  const k = mwh ? 1 / 1000 : 1;
  const unit = mwh ? 'MWh' : 'kWh';
  const digits = mwh ? 1 : 0;
  const direct = m.map((x) => x.heatPumpDirect * k);
  const buf = m.map((x) => x.bufferDischarge * k);
  const backup = m.map((x) => x.backup * k);
  const dhw = m.map((x) => x.dhw * k);
  const el = m.map((x) => x.electricity * k);
  const scop = m.map((x) => (Number.isFinite(x.scop) ? x.scop : null));
  // gestapeld als cumulatieve reeksen, hoogste eerst getekend zodat de kleinere eroverheen vallen
  const s1 = direct;
  const s2 = s1.map((v, i) => v + buf[i]);
  const s3 = s2.map((v, i) => v + backup[i]);
  const s4 = s3.map((v, i) => v + dhw[i]);
  const heatBars = { size: 0.36, align: -1 as const };
  const elBars = { size: 0.36, align: 1 as const };
  const bar = (
    label: string,
    color: string,
    values: number[],
    bars: { size: number; align: -1 | 1 },
  ): ChartSeries => ({
    label,
    color,
    fill: withAlpha(color, 0.82),
    width: 1,
    bars,
    digits,
    legendValue: (i) => values[i] ?? null,
  });
  const series: ChartSeries[] = [
    bar('Tapwater', DHW_COLOR, dhw, heatBars),
    bar('Bijstook', pal.err, backup, heatBars),
    bar('Buffer', BUFFER_COLOR, buf, heatBars),
    bar('WP direct', pal.cold, direct, heatBars),
    bar('Elektriciteit WP (incl. bijstook)', pal.text2, el, elBars),
    { label: 'SCOP', color: pal.text, width: 2, points: true, scale: 'scop', digits: 2 },
  ];
  const data: uPlot.AlignedData = [MONTH_X, s4, s3, s2, s1, el, scop];
  const finiteScop = scop.filter((v): v is number => v !== null);
  const scopMax = niceCeil(Math.max(4, ...finiteScop) * 1.08);
  const yMax = niceCeil(maxTotal * k * 1.06);
  return { data, series, unit, yMax, scopMax };
}

// ---------------------------------------------------------------- weergave

/** Maand-as: altijd hele maanden in beeld (ook na inzoomen); idempotent, want uPlot past dit bij elke herteken toe. */
const monthX: uPlot.Scale = {
  time: false,
  range: (_u, min, max) => [
    Math.max(-0.5, Math.floor(min + 0.5) - 0.5),
    Math.min(11.5, Math.ceil(max - 0.5) + 0.5),
  ],
};
const monthSplits = (min: number, max: number): number[] => {
  const out: number[] = [];
  for (let i = Math.max(0, Math.ceil(min)); i <= Math.min(11, Math.floor(max)); i++) out.push(i);
  return out;
};
const monthFormat = (v: number): string => (Number.isInteger(v) ? (MONTH_SHORT[v] ?? '') : '');
/** Ticklabels: bij een smalle grafiek alleen de beginletter (j f m a …), anders de afkorting. */
const monthTick = (v: number, plotWidthPx: number): string => {
  const m = monthFormat(v);
  return plotWidthPx < 12 * 34 ? m.charAt(0) : m;
};

function YearChartsView({ a }: { a: Analysis }) {
  const dark = useDarkScheme();
  const [xMode, setXMode] = useState<XMode>('log');
  // `dark` als afhankelijkheid: bij een ander kleurschema de themakleuren opnieuw lezen
  const pal = useMemo(palette, [dark]);
  const elec = useMemo(() => electricChart(a, pal), [a, pal]);
  const therm = useMemo(() => thermalChart(a, pal), [a, pal]);
  const month = useMemo(() => monthlyChart(a, pal), [a, pal]);
  const splits = useMemo(() => rankSplits(xMode), [xMode]);
  const xLabel = 'Aantal uren, gesorteerd van hoog naar laag [uur/jaar]';
  const climate = `klimaatjaar ${a.climateShort}`;

  return (
    <div>
      <div className={css.toolbar}>
        <span className={css.toolbarLabel} id="ps-year-xmode">
          x-as van de duurkrommen:
        </span>
        <div className={ui.seg} role="group" aria-labelledby="ps-year-xmode">
          <button
            type="button"
            aria-pressed={xMode === 'log'}
            aria-label="x-as logaritmisch"
            onClick={() => setXMode('log')}
          >
            logaritmisch
          </button>
          <button
            type="button"
            aria-pressed={xMode === 'lin'}
            aria-label="x-as lineair"
            onClick={() => setXMode('lin')}
          >
            lineair
          </button>
        </div>
        <span className={ui.hint}>
          Klimaatjaar {a.climateShort}. Logaritmisch: de piekuren groot. {HINT}
        </span>
      </div>

      <div className={ui.chartGrid}>
        <div className={`${ui.chartBox} ${css.wide} ${css.wrapLegend}`}>
          <h3>Jaarbelastingduurkromme elektrisch (warmtepompgroep)</h3>
          <p className={`${ui.hint} ${css.lead}`}>{LEAD.electric}</p>
          <UPlotChart
            data={elec.data}
            series={elec.series}
            xKind="custom"
            xFormat={formatRank}
            xTickFormat={rankTick}
            xSplits={splits}
            xLabel={xLabel}
            axes={[{ scale: 'y', label: 'Vermogen [kW]' }]}
            scales={{ x: rankScale(xMode), y: { range: [0, elec.yMax] } }}
            hooks={hLinesHook(elec.lines, pal.surface)}
            legendExtras={elec.extras}
            height={300}
            ariaLabel="Jaarbelastingduurkromme elektrisch: vermogen aan de meter per uur, aflopend gesorteerd, met en zonder maatregelen en de budgetten van drie aansluitingen"
            exportName="peakshaving-duurkromme-elektrisch"
            exportTitle={`Jaarbelastingduurkromme elektrisch (warmtepompgroep) — ${climate}`}
            exportLabel="Duurkromme elektrisch"
            compactBelow={COMPACT_BELOW_PX}
          />
        </div>

        <div className={`${ui.chartBox} ${css.wrapLegend}`}>
          <h3>Jaarbelastingduurkromme thermisch</h3>
          <p className={`${ui.hint} ${css.lead}`}>{LEAD.thermal}</p>
          <UPlotChart
            data={therm.data}
            series={therm.series}
            xKind="custom"
            xFormat={formatRank}
            xTickFormat={rankTick}
            xSplits={splits}
            xLabel={xLabel}
            axes={[{ scale: 'y', label: 'Warmtevraag [kW]' }]}
            scales={{ x: rankScale(xMode), y: { range: [0, therm.yMax] } }}
            hooks={hLinesHook(therm.lines, pal.surface)}
            legendExtras={therm.extras}
            height={260}
            ariaLabel="Jaarbelastingduurkromme thermisch: ideale warmtevraag per uur, aflopend gesorteerd, met het vermogen van de warmtepomp bij min tien graden met en zonder buffer"
            exportName="peakshaving-duurkromme-thermisch"
            exportTitle={`Jaarbelastingduurkromme thermisch — ${climate}`}
            exportLabel="Duurkromme thermisch"
            compactBelow={COMPACT_BELOW_PX}
          />
        </div>

        <div className={`${ui.chartBox} ${css.noCursorPoints}`}>
          <h3>Maandbalans</h3>
          <p className={`${ui.hint} ${css.lead}`}>{LEAD.monthly}</p>
          <UPlotChart
            data={month.data}
            series={month.series}
            xKind="custom"
            xFormat={monthFormat}
            xTickFormat={monthTick}
            xSplits={monthSplits}
            xLabel="Maand"
            axes={[
              { scale: 'y', label: `Energie [${month.unit}]` },
              { scale: 'scop', label: 'SCOP [–]', side: 1, grid: false },
            ]}
            scales={{ x: monthX, y: { range: [0, month.yMax] }, scop: { range: [0, month.scopMax] } }}
            height={260}
            ariaLabel="Maandbalans: warmtelevering per maand door de warmtepomp direct, de buffer, bijstook en tapwater, de elektriciteit van de warmtepomp en de SCOP per maand"
            exportName="peakshaving-maandbalans"
            exportTitle={`Maandbalans — ${climate}`}
            exportLabel="Maandbalans"
            compactBelow={COMPACT_BELOW_PX}
          />
        </div>
      </div>
    </div>
  );
}

export function YearCharts() {
  const analysis = useStore((st) => st.analysis);
  if (!analysis) {
    return <p className={ui.hint}>De jaargrafieken verschijnen zodra de berekening klaar is…</p>;
  }
  return <YearChartsView a={analysis} />;
}
