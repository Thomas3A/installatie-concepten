// Tabblad Concept (spec §8): schematische, live weergave van het concept in het uur dat met de scrubber is gekozen
// (standaard het uur met de hoogste piek aan de meter in de koude week). Net, meterkast, batterij, buitenunit,
// boiler, buffervat en gebouw met bewegende deeltjes op leidingen en kabels; de scrubber staat eronder.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { fmt } from '../../../../core/format';
import { scrollRegionProps, useOverflowX } from '../../../../ui/ScrollRegion';
import type { Analysis } from '../../model/analysis';
import { formatHour } from '../../model/climate';
import { buildingKind } from '../../model/input';
import { useSelectedHour, useStore } from '../../store';
import { Scrubber } from '../charts/Scrubber';
import {
  BUILDING,
  conceptLayout,
  FLOW_EPS_KW,
  flowPaths,
  flowPowers,
  flowSpeed,
  hourState,
  JUNCTION,
  METER,
  meterScale,
  pointAlong,
  VIEW_H,
  VIEW_W,
  windowRefs,
  type HourState,
} from './conceptGeometry';
import {
  ApartmentShape,
  BatteryBlock,
  Boiler,
  BufferVessel,
  BuildingInfo,
  FlowBase,
  Heater,
  HeatPumpUnit,
  houseOutline,
  HouseShape,
  kw,
  kwh,
  MeterDynamic,
  MeterStatic,
  NetSymbol,
  officeOutline,
  OfficeShape,
  pct,
  PipeLegend,
  Radiator,
} from './ConceptParts';
import c from './Concept.module.css';

/** Periode van het stippelpatroon van de deeltjes [eenheden] (zie Concept.module.css). */
const DASH_PERIOD = { pipe: 14, cable: 16 } as const;

// ---------------------------------------------------------------- samenvatting voor schermlezers

function summaryLabel(a: Analysis, h: HourState): string {
  const when = formatHour(h.t, a.startWeekday);
  const ex = h.exceedKw > FLOW_EPS_KW ? `, overschrijding ${kw(h.exceedKw)} kW` : ', geen overschrijding';
  const hp = h.running
    ? `warmtepomp ${kw(h.qHeatPump)} kW warmte bij ${kw(h.pHeatPump)} kW elektrisch`
    : 'warmtepomp staat stil';
  return `Conceptschema op ${when}: ${hp}, WP-groep aan de meter ${kw(h.pGrid)} kW${ex}.`;
}

function summaryText(a: Analysis, h: HourState): string {
  const parts: string[] = [];
  const modes: string[] = [];
  if (h.qDhw > FLOW_EPS_KW) modes.push(`boilerbedrijf op ${fmt(h.dhwTempC, 0)} °C`);
  if (h.qBufferIn > FLOW_EPS_KW) modes.push(`buffer laden op ${fmt(h.bufferMaxC, 0)} °C`);
  parts.push(
    `Buitentemperatuur ${fmt(h.outdoorC, 1)} °C, aanvoertemperatuur volgens de stooklijn ${fmt(h.supplyC, 0)} °C${
      modes.length ? `, ${modes.join(' en ')}` : ''
    }, ${h.running ? `COP ${fmt(h.cop, 2)}` : 'warmtepomp staat stil'}.`,
  );
  if (h.hasBuffer)
    parts.push(
      `Buffervat ${pct(h.bufferFrac)} geladen (${kwh(h.bufferKwh)} kWh), laden ${kw(h.qBufferIn)} kW, ontladen ${kw(h.qBufferOut)} kW.`,
    );
  else parts.push('Geen buffervat.');
  if (h.hasDhw)
    parts.push(
      `Boiler ${pct(h.tankFrac)} vol${h.qDhw > FLOW_EPS_KW ? `, boilerbedrijf ${kw(h.qDhw)} kW` : ''}.`,
    );
  if (h.hasBattery) {
    const state =
      h.pBattery > FLOW_EPS_KW
        ? `ontlaadt ${kw(h.pBattery)} kW`
        : h.pBattery < -FLOW_EPS_KW
          ? `laadt ${kw(-h.pBattery)} kW`
          : 'in rust';
    parts.push(`Batterij ${pct(h.batteryFrac)} vol, ${state}.`);
  } else parts.push('Geen batterij.');
  // meerdere woningen: het model rekent met de totalen, per woning = totaal / aantal
  const n = a.input.building.dwellings;
  const multi = buildingKind(a.input.building) === 'multi';
  const who = multi ? `Woongebouw met ${fmt(n, 0)} woningen op één warmtepomp` : 'Gebouw';
  const perDwelling = multi ? ` (${kw(h.qRequested / n)} kW per woning)` : '';
  parts.push(
    `${who}: binnen ${fmt(h.indoorC, 1)} °C bij setpoint ${fmt(h.setpointC, 1)} °C, gevraagd ${kw(h.qRequested)} kW${perDwelling}, interne winsten ${kw(h.gainsKw)} kW${
      h.qBackup > FLOW_EPS_KW ? `, bijstook ${kw(h.qBackup)} kW` : ''
    }${h.comfortLoss ? ', comfortverlies' : ''}.`,
  );
  parts.push(
    `Meterkast: aansluiting ${a.connectionLabel} (${kw(a.connectionKw)} kW), ${
      Number.isFinite(a.pLimitKw)
        ? `overig gebruik ${kw(a.connectionKw - a.pLimitKw)} kW, WP-budget ${kw(a.pLimitKw)} kW`
        : 'geen WP-budget ingesteld'
    }, warmtepomp${h.qBackup > FLOW_EPS_KW ? ' en bijstook' : ''} ${kw(h.pElectric)} kW, WP-groep aan de meter ${kw(h.pGrid)} kW${
      h.exceedKw > FLOW_EPS_KW ? `, overschrijding ${kw(h.exceedKw)} kW` : ''
    }.`,
  );
  return parts.join(' ');
}

// ---------------------------------------------------------------- schema

function ConceptSvg({ analysis, hour }: { analysis: Analysis; hour: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ids = useMemo(() => ({ buffer: `cg${uid}-buffer`, boiler: `cg${uid}-boiler` }), [uid]);
  // smaller dan de minimale breedte van het schema scrolt de figuur: dan focusbaar en benoemd (toetsenbord)
  const [figEl, setFigEl] = useState<HTMLElement | null>(null);
  const figScrolls = useOverflowX(figEl);

  // alles wat alleen van de analyse afhangt: posities, paden, schaal, referenties en de vaste tekening
  const fixed = useMemo(() => {
    const input = analysis.input;
    const layout = conceptLayout(
      input.building.dhw.enabled && input.building.dhw.tankLitre > 0,
      input.buffer.volumeM3 > 0 && analysis.main.kpis.bufferEnergyKwh > 0,
      input.battery.capacityKwh > 0,
    );
    const paths = flowPaths(layout);
    const refs = windowRefs(analysis);
    const scale = meterScale(
      analysis.connectionKw,
      analysis.pLimitKw,
      refs.maxStackKw,
      METER.barX0,
      METER.barX1,
    );
    const kind = buildingKind(input.building);
    const chevrons = paths.map((p) => ({ ...pointAlong(p.pts, 0.5), kind: p.kind }));
    const backdrop = (
      <g>
        <NetSymbol />
        <MeterStatic a={analysis} scale={scale} />
        {kind === 'office' ? <OfficeShape /> : kind === 'multi' ? <ApartmentShape /> : <HouseShape />}
        {/* maaiveld onder het gebouw (de woning heeft een dakoverstek) */}
        <line
          x1={(kind === 'single' ? BUILDING.roof[0].x : BUILDING.x) - 14}
          y1={BUILDING.ground}
          x2={VIEW_W}
          y2={BUILDING.ground}
          className={c.line2}
        />
        <PipeLegend />
        <FlowBase paths={paths} />
        {layout.hasBattery && <circle cx={JUNCTION.x} cy={JUNCTION.y} r={3.6} className={c.junction} />}
      </g>
    );
    return { layout, paths, refs, scale, kind, chevrons, backdrop };
  }, [analysis]);

  const h = useMemo(() => hourState(analysis, hour), [analysis, hour]);
  const powers = flowPowers(h);
  const speeds = fixed.paths.map((p) =>
    flowSpeed(powers[p.id], p.kind === 'cable' ? fixed.refs.electricRefKw : fixed.refs.thermalRefKw),
  );

  // deeltjes: een lichte requestAnimationFrame-lus verschuift het stippelpatroon (niet bij bewegingsarm)
  const dotEls = useRef<(SVGPathElement | null)[]>([]);
  const speedRef = useRef<number[]>(speeds);
  useEffect(() => {
    speedRef.current = speeds;
  });
  const nPaths = fixed.paths.length;
  const kinds = useMemo(() => fixed.paths.map((p) => p.kind), [fixed]);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;
    const mq =
      typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const offsets = new Float64Array(nPaths);
    let raf = 0;
    let last = 0;
    const frame = (now: number): void => {
      const dt = last ? Math.min(now - last, 100) / 1000 : 0;
      last = now;
      const sp = speedRef.current;
      for (let i = 0; i < nPaths; i++) {
        const v = sp[i] ?? 0;
        const el = dotEls.current[i];
        if (!el || v === 0) continue;
        const period = kinds[i] === 'cable' ? DASH_PERIOD.cable : DASH_PERIOD.pipe;
        offsets[i] = (offsets[i] - v * dt) % period;
        el.style.strokeDashoffset = offsets[i].toFixed(2);
      }
      raf = window.requestAnimationFrame(frame);
    };
    const start = (): void => {
      if (raf) return;
      last = 0;
      raf = window.requestAnimationFrame(frame);
    };
    const stop = (): void => {
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    };
    const sync = (): void => (mq?.matches ? stop() : start());
    sync();
    mq?.addEventListener?.('change', sync);
    return () => {
      stop();
      mq?.removeEventListener?.('change', sync);
    };
  }, [nPaths, kinds]);

  const { layout, paths, chevrons, scale, kind } = fixed;
  const input = analysis.input;
  const label = summaryLabel(analysis, h);

  return (
    <figure
      ref={setFigEl}
      className={c.figure}
      {...scrollRegionProps(figScrolls, 'Conceptschema (horizontaal scrollbaar)')}
    >
      <svg
        className={c.svg}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={label}
        preserveAspectRatio="xMidYMid meet"
      >
        {fixed.backdrop}

        {/* deeltjes */}
        <g aria-hidden="true">
          {paths.map((p, i) => (
            <path
              key={p.id}
              ref={(el) => {
                dotEls.current[i] = el;
              }}
              d={p.d}
              className={p.kind === 'cable' ? c.dotsCable : c.dotsPipe}
              style={{ opacity: speeds[i] === 0 ? 0 : 1 }}
            />
          ))}
          {chevrons.map((ch, i) =>
            speeds[i] === 0 ? null : (
              <polygon
                key={paths[i].id}
                points="-4.5,-4.5 4,0 -4.5,4.5"
                transform={`translate(${ch.x.toFixed(1)} ${ch.y.toFixed(1)}) rotate(${(ch.angle + (speeds[i] < 0 ? 180 : 0)).toFixed(0)})`}
                className={`${c.chevron} ${ch.kind === 'cable' ? c.chevronCable : c.chevronPipe}`}
              />
            ),
          )}
        </g>

        <MeterDynamic h={h} scale={scale} />
        <BatteryBlock h={h} capacityKwh={input.battery.capacityKwh} />
        <HeatPumpUnit
          h={h}
          refKw={fixed.refs.thermalRefKw}
          backupConfigured={input.heatPump.backupHeaterKw > 0}
        />
        {layout.hasDhw && (
          <Boiler h={h} layout={layout} tankLitre={input.building.dhw.tankLitre} gradId={ids.boiler} />
        )}
        <BufferVessel h={h} layout={layout} volumeM3={input.buffer.volumeM3} gradId={ids.buffer} />
        <Radiator />
        {input.heatPump.backupHeaterKw > 0 && <Heater on={h.qBackup > FLOW_EPS_KW} />}
        {h.comfortLoss && (
          <path d={kind === 'single' ? houseOutline() : officeOutline()} className={c.alertOutline} />
        )}
        <BuildingInfo h={h} kind={kind} dwellings={input.building.dwellings} />
      </svg>
      <p className="sr-only">{summaryText(analysis, h)}</p>
    </figure>
  );
}

export function ConceptDiagram() {
  const analysis = useStore((st) => st.analysis);
  const hour = useSelectedHour();
  const ready = analysis !== null && hour !== null;
  const h = ready ? Math.min(Math.max(hour, analysis.coldWeek.from), analysis.coldWeek.to - 1) : 0;
  return (
    <div className={c.wrap}>
      <p className={c.intro}>
        Schema van het concept in het gekozen uur: wat de warmtepomp, het buffervat, de batterij en de
        meterkast op dat moment doen. Kies het uur met de scrubber of speel de koude week af; de deeltjes
        bewegen sneller naarmate er meer vermogen door een leiding of kabel gaat.
      </p>
      {ready ? (
        <ConceptSvg analysis={analysis} hour={h} />
      ) : (
        <p className={c.placeholder}>Het conceptschema verschijnt zodra de berekening klaar is…</p>
      )}
      <Scrubber />
    </div>
  );
}
