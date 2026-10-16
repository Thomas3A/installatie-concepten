// Onderdelen van het conceptschema (spec §8): symbolen, vaste tekening en de delen die per uur veranderen.
// Alle maten in viewBox-eenheden (zie conceptGeometry.ts); kleuren via thema-variabelen (licht en donker).
import type { ReactNode } from 'react';
import { fmt } from '../../../../core/format';
import type { Analysis } from '../../model/analysis';
import {
  approxTextWidth,
  BATTERY,
  BOILER_W,
  BUFFER_W,
  BUILDING,
  fanPeriod,
  FLOW_EPS_KW,
  HEAT_PUMP,
  METER,
  meterSegments,
  NET,
  PIPE_LEGEND,
  supplyColorFraction,
  TANK_BOTTOM,
  TANK_LABEL_Y,
  TANK_TOP,
  thermocline,
  warmColdMix,
  type ConceptLayout,
  type FlowPath,
  type HourState,
  type MeterScale,
} from './conceptGeometry';
import c from './Concept.module.css';

/** Hoogte van de elliptische kap van het buffervat. */
export const CAP_RY = 10;

/** Vermogen in kW met decimalen naar grootte. */
export function kw(v: number): string {
  const a = Math.abs(v);
  return fmt(v, a >= 100 ? 0 : a >= 10 ? 1 : 2);
}

/** Hoeveelheid zonder overbodige decimalen (5 → "5", 7,5 → "7,5"). */
export function num(v: number): string {
  return fmt(v, Number.isInteger(v) ? 0 : 1);
}

/** Energie in kWh: één decimaal, vanaf 100 kWh zonder decimalen. */
export function kwh(v: number): string {
  return fmt(v, Math.abs(v) >= 100 ? 0 : 1);
}

export function pct(f: number): string {
  return `${fmt(f * 100, 0)}\u00a0%`;
}

/** Symbool met subscript, bijv. T_i; de tekst erna staat weer op de basislijn. */
export function Sym({ m, s, children }: { m: string; s: string; children?: ReactNode }) {
  return (
    <>
      <tspan>{m}</tspan>
      <tspan className={c.sub} dy={4}>
        {s}
      </tspan>
      <tspan dy={-4}>{children ?? ' '}</tspan>
    </>
  );
}

/** Label in een afgerond kader (comfortverlies, boilerbedrijf). */
export function Pill({
  x,
  y,
  text,
  tone,
  anchor = 'start',
}: {
  x: number;
  y: number;
  text: string;
  tone: 'err' | 'warm';
  anchor?: 'start' | 'middle';
}) {
  const w = Math.round(text.length * 8.3 + 18);
  const x0 = anchor === 'middle' ? x - w / 2 : x;
  return (
    <g>
      <rect
        x={x0}
        y={y - 15}
        width={w}
        height={21}
        rx={10.5}
        className={tone === 'err' ? c.pillErr : c.pillWarm}
      />
      <text x={x0 + w / 2} y={y} textAnchor="middle" className={`${c.b} ${tone === 'err' ? c.err : c.warm}`}>
        {text}
      </text>
    </g>
  );
}

// ---------------------------------------------------------------- statische delen (per analyse gememoiseerd)

export function NetSymbol() {
  const x = NET.cx;
  return (
    <g aria-hidden="true">
      <path
        className={c.line2}
        d={`M${x - 12} 112 L${x - 4} 40 M${x + 12} 112 L${x + 4} 40 M${x - 4} 40 L${x} 30 L${x + 4} 40
            M${x - 22} 46 H${x + 22} M${x - 20} 46 V${NET.cableY} M${x + 20} 46 V${NET.cableY}
            M${x - 10} 98 L${x + 10} 80 M${x + 10} 98 L${x - 10} 80 M${x - 8} 76 L${x + 8} 60
            M${x + 8} 76 L${x - 8} 60 M${x - 6} 56 L${x + 6} 46 M${x + 6} 56 L${x - 6} 46 M${x - 14} 112 H${x + 14}`}
      />
      <text x={x} y={130} textAnchor="middle" className={c.t2}>
        Net
      </text>
    </g>
  );
}

export function HouseShape() {
  const b = BUILDING;
  const [l, top, r] = b.roof;
  return (
    <g>
      <rect x={b.x} y={b.houseTop} width={b.w} height={b.ground - b.houseTop} className={c.outline} />
      <polygon points={`${l.x},${l.y} ${top.x},${top.y} ${r.x},${r.y}`} className={c.outlineSoft} />
      <rect x={b.x + 88} y={492} width={44} height={32} className={c.outlineSoft} />
      <path className={c.faint} d={`M${b.x + 110} 492 V524 M${b.x + 88} 508 H${b.x + 132}`} />
      <rect x={b.x + 212} y={496} width={32} height={52} className={c.outlineSoft} />
    </g>
  );
}

export function houseOutline(): string {
  const b = BUILDING;
  const [l, top, r] = b.roof;
  return `M${b.x} ${b.ground} V${l.y} H${l.x} L${top.x} ${top.y} L${r.x} ${r.y} H${b.x + b.w} V${b.ground} Z`;
}

export function OfficeShape() {
  const b = BUILDING;
  const floors = Math.round((b.ground - b.officeTop) / b.officeFloorH);
  const els: ReactNode[] = [];
  for (let k = 1; k < floors; k++) {
    const y = b.officeTop + k * b.officeFloorH;
    els.push(<line key={`f${k}`} x1={b.x} y1={y} x2={b.x + b.w} y2={y} className={c.thin} />);
  }
  const card = b.card;
  for (let k = 0; k < floors; k++) {
    const y = b.officeTop + k * b.officeFloorH + 19;
    // ramen die (deels) achter de infokaart vallen, weglaten
    if (y < card.y + card.h + 4 && y + 28 > card.y - 4) continue;
    for (let i = 0; i < 6; i++) {
      if (k === floors - 1 && (i === 2 || i === 3)) continue; // entree
      els.push(
        <rect
          key={`w${k}-${i}`}
          x={b.x + 76 + i * 30}
          y={y}
          width={18}
          height={28}
          className={c.outlineSoft}
        />,
      );
    }
  }
  return (
    <g>
      <rect x={b.x} y={b.officeTop} width={b.w} height={b.ground - b.officeTop} className={c.outline} />
      <rect x={b.x - 6} y={b.officeTop - 7} width={b.w + 12} height={8} className={c.outlineSoft} />
      {els}
      <rect x={b.x + 136} y={b.ground - 44} width={44} height={44} className={c.outlineSoft} />
    </g>
  );
}

export function Radiator() {
  const b = BUILDING;
  const x = b.emitterX - 18;
  const fins: ReactNode[] = [];
  for (let fx = x + 6; fx < x + 36; fx += 6)
    fins.push(
      <line key={fx} x1={fx} y1={b.radiatorTop + 6} x2={fx} y2={b.radiatorBottom - 6} className={c.faint} />,
    );
  return (
    <g>
      <rect
        x={x}
        y={b.radiatorTop}
        width={36}
        height={b.radiatorBottom - b.radiatorTop}
        rx={3}
        className={c.outlineSoft}
      />
      {fins}
    </g>
  );
}

export function PipeLegend() {
  const { x, y0, lineH } = PIPE_LEGEND;
  return (
    <g aria-hidden="true">
      <line x1={x} y1={y0 - 5} x2={x + 28} y2={y0 - 5} className={c.pipeSupply} />
      <text x={x + 38} y={y0} className={c.t2}>
        aanvoer
      </text>
      <line x1={x} y1={y0 + lineH - 5} x2={x + 28} y2={y0 + lineH - 5} className={c.pipeReturn} />
      <text x={x + 38} y={y0 + lineH} className={c.t2}>
        retour
      </text>
      <line x1={x} y1={y0 + 2 * lineH - 5} x2={x + 28} y2={y0 + 2 * lineH - 5} className={c.cable} />
      <circle cx={x + 14} cy={y0 + 2 * lineH - 5} r={2.8} className={c.chevronCable} />
      <text x={x + 38} y={y0 + 2 * lineH} className={c.t2}>
        kabel
      </text>
      <text x={x} y={y0 + 3 * lineH} className={c.t2}>
        deeltjes: snelheid ∝ vermogen
      </text>
    </g>
  );
}

/** Basis van de leidingen en kabels (zonder deeltjes). */
export function FlowBase({ paths }: { paths: FlowPath[] }) {
  return (
    <g>
      {paths.map((p) => (
        <path
          key={p.id}
          d={p.d}
          className={p.kind === 'supply' ? c.pipeSupply : p.kind === 'return' ? c.pipeReturn : c.cable}
        />
      ))}
    </g>
  );
}

/** Vaste delen van de meterkast: paneel, balk (= aansluiting), overig gebruik, haken en labels. */
export function MeterStatic({ a, scale }: { a: Analysis; scale: MeterScale }) {
  const m = METER;
  const lim = a.pLimitKw;
  const hasLimit = Number.isFinite(lim);
  const y = m.barY;
  const other = scale.otherKw;
  const xWp = scale.wp(0);
  const share = fmt(a.input.grid.heatPumpShare * 100, 0);
  // labels boven de haken: overig links; WP-budget rechts uitgelijnd op de budgetlijn, of bij een smalle haak
  // vanaf het begin van die haak; bij te weinig ruimte wordt het overig-label korter
  let otherText = `overig gebruik ${kw(other)} kW`;
  const wpPlain = `WP-budget Plimiet ${kw(lim)} kW (${share} %)`;
  const wpWidth = approxTextWidth(wpPlain);
  const rightEdge = m.x + m.w - 14;
  let wpStart: number = m.barX0;
  if (other > 0) {
    wpStart = wpWidth <= scale.connX - xWp ? scale.connX - wpWidth : Math.min(xWp + 3, rightEdge - wpWidth);
    if (wpStart < m.barX0 + approxTextWidth(otherText) + 18) otherText = `overig ${kw(other)} kW`;
    wpStart = Math.min(Math.max(wpStart, m.barX0 + approxTextWidth(otherText) + 18), rightEdge - wpWidth);
  }
  return (
    <g>
      <rect x={m.x} y={m.y} width={m.w} height={m.h} rx={8} className={c.panel} />
      <text x={m.x + 16} y={m.titleY}>
        <tspan className={c.title}>Meterkast</tspan>
        <tspan className={c.t2}>{` · aansluiting ${a.connectionLabel} · ${kw(a.connectionKw)} kW`}</tspan>
      </text>
      {/* balk = aansluitvermogen; links het overige gebruik (grijs), daarna de ruimte voor de WP-groep */}
      <rect
        x={m.barX0}
        y={y}
        width={Math.max(0, scale.connX - m.barX0)}
        height={m.barH}
        className={c.track}
      />
      {other > 0 && (
        <rect x={m.barX0} y={y} width={Math.max(0, xWp - m.barX0)} height={m.barH} className={c.other} />
      )}
      {scale.compressed && (
        <g aria-hidden="true">
          <path
            className={c.breakCut}
            d={`M${scale.breakX - 4} ${y + m.barH + 4} L${scale.breakX + 4} ${y - 4}`}
          />
          <path
            className={c.line2}
            d={`M${scale.breakX - 7} ${y + m.barH + 4} L${scale.breakX + 1} ${y - 4} M${scale.breakX - 1} ${
              y + m.barH + 4
            } L${scale.breakX + 7} ${y - 4}`}
          />
        </g>
      )}
      {!hasLimit && (
        <line x1={scale.connX} y1={y - 3} x2={scale.connX} y2={y + m.barH + 3} className={c.line2} />
      )}
      {/* haken met de vaste verdeling van de aansluiting */}
      {hasLimit ? (
        <>
          {other > 0 && (
            <>
              <path
                className={c.line2}
                d={`M${m.barX0} ${m.bracketY + 4} V${m.bracketY} H${xWp - 3} V${m.bracketY + 4}`}
              />
              <text x={m.barX0} y={m.bracketTextY} className={c.t2}>
                {otherText}
              </text>
            </>
          )}
          <path
            className={c.line2}
            d={`M${other > 0 ? xWp + 3 : m.barX0} ${m.bracketY + 4} V${m.bracketY} H${scale.connX} V${m.bracketY + 4}`}
          />
          <text x={wpStart} y={m.bracketTextY}>
            WP-budget <Sym m="P" s="limiet" />
            <tspan className={c.b}>{`${kw(lim)} kW`}</tspan>
            <tspan className={c.t2}>{` (${share}\u00a0%)`}</tspan>
          </text>
        </>
      ) : (
        <text x={m.barX0} y={m.bracketTextY} className={c.t2}>
          geen WP-budget ingesteld
        </text>
      )}
    </g>
  );
}

// ---------------------------------------------------------------- dynamische delen

export function MeterDynamic({ h, scale }: { h: HourState; scale: MeterScale }) {
  const m = METER;
  const seg = meterSegments(h);
  const y = m.barY;
  // segmenten van de WP-groep, gestapeld ná het overige gebruik;
  // minWidth: kleine maar betekenisvolle segmenten (batterij, overschrijding) blijven zichtbaar
  const r = (from: number, to: number, cls: string, inset = 0, minWidth = 0): ReactNode => {
    const x0 = scale.wp(from);
    const w = Math.max(minWidth, scale.wp(to) - x0);
    if (w < 0.3) return null;
    return <rect x={x0} y={y + inset} width={w} height={m.barH - 2 * inset} className={cls} />;
  };
  const hasLimit = Number.isFinite(h.pLimitKw);
  const [s0, s1, s2] = m.legendSlots;
  const charging = h.pBattery < -FLOW_EPS_KW;
  const discharging = h.pBattery > FLOW_EPS_KW;
  const exceeding = h.exceedKw > FLOW_EPS_KW;
  const backupOn = h.qBackup > FLOW_EPS_KW;
  return (
    <g>
      {r(seg.grid[0], seg.grid[1], c.segWp)}
      {seg.charge && r(seg.charge[0], seg.charge[1], c.segCharge, 0, 3)}
      {seg.overflow && r(seg.overflow[0], seg.overflow[1], c.segOverflow, 0, 4)}
      {seg.discharge && r(seg.discharge[0], seg.discharge[1], c.segDischarge, 6, 3)}
      {/* budgetlijn = einde van de aansluiting */}
      {hasLimit && (
        <line x1={scale.connX} y1={y - 6} x2={scale.connX} y2={y + m.barH + 6} className={c.budget} />
      )}
      {/* P_net rechtsboven in het paneel */}
      <text x={m.x + m.w - 16} y={m.titleY} textAnchor="end">
        <tspan className={c.t2}>WP-groep aan de meter </tspan>
        <Sym m="P" s="net" />
        <tspan className={c.val}>{`${kw(h.pGrid)} kW`}</tspan>
      </text>
      {/* legenda met de waarden van het uur, vaste posities */}
      <rect x={s0} y={m.legendY - 11} width={12} height={12} rx={2} className={c.segWp} />
      <text x={s0 + 18} y={m.legendY}>
        {backupOn ? 'WP + bijstook ' : 'WP '}
        <tspan className={c.b}>{`${kw(h.pElectric)} kW`}</tspan>
      </text>
      <rect
        x={s1}
        y={m.legendY - 11}
        width={12}
        height={12}
        rx={2}
        className={charging ? c.segCharge : discharging ? c.segDischarge : c.swatchNeutral}
      />
      {!h.hasBattery ? (
        <text x={s1 + 18} y={m.legendY} className={c.t2}>
          geen batterij
        </text>
      ) : charging || discharging ? (
        <text x={s1 + 18} y={m.legendY}>
          {charging ? 'batterij laden ' : 'batterij ontladen '}
          <tspan className={c.b}>{`${kw(Math.abs(h.pBattery))} kW`}</tspan>
        </text>
      ) : (
        <text x={s1 + 18} y={m.legendY} className={c.t2}>
          {`batterij ${kw(0)} kW`}
        </text>
      )}
      <rect
        x={s2}
        y={m.legendY - 11}
        width={12}
        height={12}
        rx={2}
        className={exceeding ? c.segOverflow : c.swatchNeutral}
      />
      {!hasLimit ? (
        <text x={s2 + 18} y={m.legendY} className={c.t2}>
          geen WP-budget
        </text>
      ) : exceeding ? (
        <text x={s2 + 18} y={m.legendY} className={`${c.err} ${c.b}`}>
          {`overschrijding ${kw(h.exceedKw)} kW`}
        </text>
      ) : (
        <text x={s2 + 18} y={m.legendY} className={c.t2}>
          geen overschrijding
        </text>
      )}
    </g>
  );
}

export function BatteryBlock({ h, capacityKwh }: { h: HourState; capacityKwh: number }) {
  const { x, y, w, h: bh, textX } = BATTERY;
  if (!h.hasBattery) {
    return (
      <g>
        <rect x={x} y={y} width={w} height={bh} rx={5} className={c.absent} />
        <rect x={x + w} y={y + 11} width={7} height={14} rx={2} className={c.absent} />
        <text x={x + w / 2} y={y + bh / 2 + 5} textAnchor="middle" className={c.t2}>
          geen batterij
        </text>
      </g>
    );
  }
  const charging = h.pBattery < -FLOW_EPS_KW;
  const discharging = h.pBattery > FLOW_EPS_KW;
  return (
    <g>
      <rect x={x} y={y} width={w} height={bh} rx={5} className={c.outline} />
      <rect x={x + w} y={y + 11} width={7} height={14} rx={2} className={c.solid2} />
      <rect
        x={x + 4}
        y={y + 4}
        width={Math.max(0, (w - 8) * h.batteryFrac)}
        height={bh - 8}
        rx={3}
        className={c.batteryFill}
      />
      <text x={x + w / 2} y={y + bh / 2 + 5} textAnchor="middle" className={`${c.val} ${c.halo}`}>
        {pct(h.batteryFrac)}
      </text>
      <text x={textX} y={y + 13}>
        <tspan className={c.title}>Batterij</tspan>
        <tspan className={c.t2}>{` ${num(capacityKwh)} kWh`}</tspan>
      </text>
      <text x={textX} y={y + 33} className={`${c.b} ${charging ? c.warn : discharging ? c.ok : c.t2}`}>
        {charging ? `laden ${kw(-h.pBattery)} kW` : discharging ? `ontladen ${kw(h.pBattery)} kW` : 'rust'}
      </text>
      <text x={textX} y={y + 53} className={c.t2}>
        {`${kwh(h.batteryKwh)} van ${kwh(h.batteryUsableKwh)} kWh`}
      </text>
    </g>
  );
}

/** Kleur op de schaal blauw → rood van een watertemperatuur. */
function tempColor(tC: number): string {
  return warmColdMix(supplyColorFraction(tC));
}

export function HeatPumpUnit({
  h,
  refKw,
  backupConfigured,
}: {
  h: HourState;
  refKw: number;
  /** er is een bijstookelement: P_el van de WP zelf krijgt dan het subscript "el,WP" */
  backupConfigured: boolean;
}) {
  const u = HEAT_PUMP;
  // kleur naar de aanvoertemperatuur zolang de compressor draait; stil = neutraal
  const col = h.running ? tempColor(h.supplyC) : 'var(--text-2)';
  const period = fanPeriod(h.qHeatPump, refKw);
  const right = u.x + u.w;
  const mid = (u.splitX + right) / 2;
  const blade = 'M0 0 C 8 -15, 30 -22, 44 -9 C 33 -3, 16 4, 0 0 Z';
  // hogere laadtemperaturen in hetzelfde uur: boilerbedrijf en buffer laden
  const modes: { label: string; tC: number }[] = [];
  if (h.qDhw > FLOW_EPS_KW) modes.push({ label: 'boiler', tC: h.dhwTempC });
  if (h.qBufferIn > FLOW_EPS_KW) modes.push({ label: 'buffer', tC: h.bufferMaxC });
  const louvres: ReactNode[] = [];
  for (let ly = u.y + 112; ly <= u.y + u.h - 10; ly += 8)
    louvres.push(<line key={ly} x1={u.splitX + 12} y1={ly} x2={right - 12} y2={ly} className={c.faint} />);
  return (
    <g>
      <rect x={u.x + 20} y={u.y + u.h} width={20} height={7} className={c.solid2} />
      <rect x={right - 40} y={u.y + u.h} width={20} height={7} className={c.solid2} />
      <rect x={u.x} y={u.y} width={u.w} height={u.h} rx={10} className={c.outline} style={{ stroke: col }} />
      <path
        d={`M${u.splitX} ${u.y + 1.5} H${right - 10} Q${right - 1.5} ${u.y + 1.5} ${right - 1.5} ${u.y + 10}
            V${u.y + u.h - 10} Q${right - 1.5} ${u.y + u.h - 1.5} ${right - 10} ${u.y + u.h - 1.5} H${u.splitX} Z`}
        className={c.unitTint}
        style={{ fill: col }}
      />
      <line x1={u.splitX} y1={u.y} x2={u.splitX} y2={u.y + u.h} style={{ stroke: col, strokeWidth: 2 }} />
      <text x={mid} y={u.y + 34} textAnchor="middle" className={c.t2}>
        aanvoer
      </text>
      <text x={mid} y={u.y + 58} textAnchor="middle" className={c.big} style={{ fill: col }}>
        {`${fmt(h.supplyC, 0)} °C`}
      </text>
      {modes.map((md, i) => (
        <text key={md.label} x={mid} y={u.y + 80 + i * 17} textAnchor="middle" className={c.small}>
          <tspan className={c.t2}>{`${md.label} `}</tspan>
          <tspan className={c.b} style={{ fill: tempColor(md.tC) }}>{`${fmt(md.tC, 0)} °C`}</tspan>
        </text>
      ))}
      {louvres}
      {/* ventilator */}
      <circle cx={u.fanCx} cy={u.fanCy} r={u.fanR} className={c.line2} />
      <circle cx={u.fanCx} cy={u.fanCy} r={u.fanR - 14} className={c.faint} />
      <g transform={`translate(${u.fanCx} ${u.fanCy})`}>
        <g
          className={`${c.fan} ${period === null ? c.fanStill : ''}`}
          style={period === null ? undefined : { animationDuration: `${period}s` }}
        >
          <circle r={46} fill="none" stroke="none" />
          {[0, 120, 240].map((deg) => (
            <path key={deg} d={blade} transform={`rotate(${deg})`} className={c.fanBlade} />
          ))}
          <circle r={7} className={c.solid2} />
        </g>
      </g>
      {/* waarden onder de unit */}
      <text x={u.x} y={u.textY0} className={c.title}>
        Buitenunit lucht/water-WP
      </text>
      <text x={u.x} y={u.textY0 + u.lineH}>
        <Sym m="Q" s="WP" />
        <tspan className={c.val}>{`${kw(h.qHeatPump)} kW`}</tspan>
        <tspan className={c.t2}>{h.running ? ' thermisch' : ' · staat stil'}</tspan>
      </text>
      <text x={u.x} y={u.textY0 + 2 * u.lineH}>
        <Sym m="P" s={backupConfigured ? 'el,WP' : 'el'} />
        <tspan className={c.val}>{`${kw(h.pHeatPump)} kW`}</tspan>
        <tspan className={c.t2}> · COP </tspan>
        <tspan className={c.val}>{h.running ? fmt(h.cop, 2) : '–'}</tspan>
      </text>
      <text x={u.x} y={u.textY0 + 3 * u.lineH}>
        <Sym m="T" s="e" />
        <tspan className={c.val}>{`${fmt(h.outdoorC, 1)} °C`}</tspan>
        <tspan className={c.t2}> buiten</tspan>
      </text>
    </g>
  );
}

/** Pad van een staande cilinder met elliptische kappen. */
export function cylinderPath(cx: number, w: number): string {
  const x0 = cx - w / 2;
  const rx = w / 2;
  return `M${x0} ${TANK_TOP} A${rx} ${CAP_RY} 0 0 1 ${x0 + w} ${TANK_TOP} V${TANK_BOTTOM} A${rx} ${CAP_RY} 0 0 1 ${x0} ${TANK_BOTTOM} Z`;
}

/**
 * Verticale gradiënt van een gelaagd vat: warm water boven (tot de laadtoestand), een korte spronglaag en
 * daaronder water op retourtemperatuur. Een vol vat is helemaal warm, een leeg vat helemaal koel.
 */
function StratifiedGradient({ id, soc, y0, y1 }: { id: string; soc: number; y0: number; y1: number }) {
  const [a, b] = thermocline(soc);
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={0} y1={y0} x2={0} y2={y1}>
      <stop offset={0} className={c.stopWarm} />
      <stop offset={a} className={c.stopWarm} />
      <stop offset={b} className={c.stopCold} />
      <stop offset={1} className={c.stopCold} />
    </linearGradient>
  );
}

export function BufferVessel({
  h,
  layout,
  volumeM3,
  gradId,
}: {
  h: HourState;
  layout: ConceptLayout;
  volumeM3: number;
  gradId: string;
}) {
  const cx = layout.bufferX;
  const w = BUFFER_W;
  const d = cylinderPath(cx, w);
  const [ly0, ly1] = TANK_LABEL_Y;
  if (!h.hasBuffer) {
    return (
      <g>
        <path d={d} className={c.absent} />
        <text x={cx} y={(TANK_TOP + TANK_BOTTOM) / 2 + 5} textAnchor="middle" className={c.t2}>
          geen buffer
        </text>
        <text x={cx} y={ly0} textAnchor="middle" className={c.t2}>
          Buffervat
        </text>
      </g>
    );
  }
  const midY = (TANK_TOP + TANK_BOTTOM) / 2;
  const inOn = h.qBufferIn > FLOW_EPS_KW;
  const outOn = h.qBufferOut > FLOW_EPS_KW;
  const ay = TANK_TOP - CAP_RY - 10;
  return (
    <g>
      <defs>
        <StratifiedGradient id={gradId} soc={h.bufferFrac} y0={TANK_TOP - CAP_RY} y1={TANK_BOTTOM + CAP_RY} />
      </defs>
      <path d={d} fill={`url(#${gradId})`} />
      <path d={d} className={c.tankShell} />
      <ellipse cx={cx} cy={TANK_TOP} rx={w / 2} ry={CAP_RY} className={c.faint} />
      <text x={cx} y={midY - 6} textAnchor="middle" className={`${c.big} ${c.halo}`}>
        {pct(h.bufferFrac)}
      </text>
      <text x={cx} y={midY + 16} textAnchor="middle" className={c.halo}>
        {`${kwh(h.bufferKwh)} kWh`}
      </text>
      {/* pijlen in (laden) en uit (ontladen) bij de bovenaansluiting */}
      {inOn && (
        <g>
          <polygon
            points={`${cx - 18},${ay - 6} ${cx - 8},${ay - 6} ${cx - 13},${ay + 4}`}
            className={c.arrowWarm}
          />
          <text x={cx - 23} y={ay + 4} textAnchor="end">
            in <tspan className={c.b}>{`${kw(h.qBufferIn)} kW`}</tspan>
          </text>
        </g>
      )}
      {outOn && (
        <g>
          <polygon
            points={`${cx + 8},${ay + 4} ${cx + 18},${ay + 4} ${cx + 13},${ay - 6}`}
            className={c.arrowWarm}
          />
          <text x={cx + 23} y={ay + 4}>
            uit <tspan className={c.b}>{`${kw(h.qBufferOut)} kW`}</tspan>
          </text>
        </g>
      )}
      <text x={cx} y={ly0} textAnchor="middle">
        <tspan className={c.b}>Buffervat</tspan>
        {` ${fmt(volumeM3, volumeM3 >= 10 ? 0 : 1)} m³`}
      </text>
      <text x={cx} y={ly1} textAnchor="middle" className={c.t2}>
        <Sym m="T" s="buf,max" />
        {` ${fmt(h.bufferMaxC, 0)} °C`}
      </text>
    </g>
  );
}

export function Boiler({
  h,
  layout,
  tankLitre,
  gradId,
}: {
  h: HourState;
  layout: ConceptLayout;
  tankLitre: number;
  gradId: string;
}) {
  const cx = layout.boilerX;
  const w = BOILER_W;
  const x0 = cx - w / 2;
  const [ly0, ly1] = TANK_LABEL_Y;
  const coil = `M${x0 + 12} ${TANK_BOTTOM - 62} l${w - 24} 9 l${-(w - 24)} 9 l${w - 24} 9 l${-(w - 24)} 9 l${w - 24} 9`;
  const shell = { x: x0, y: TANK_TOP, width: w, height: TANK_BOTTOM - TANK_TOP, rx: w / 2 };
  return (
    <g>
      <defs>
        <StratifiedGradient id={gradId} soc={h.tankFrac} y0={TANK_TOP} y1={TANK_BOTTOM} />
      </defs>
      <rect {...shell} fill={`url(#${gradId})`} />
      <path d={coil} className={c.line2} opacity={0.6} />
      <rect {...shell} className={c.tankShell} />
      <text x={cx} y={(TANK_TOP + TANK_BOTTOM) / 2 - 12} textAnchor="middle" className={`${c.val} ${c.halo}`}>
        {pct(h.tankFrac)}
      </text>
      <text x={cx} y={ly0} textAnchor="middle">
        <tspan className={c.b}>Boiler</tspan>
        {` ${fmt(tankLitre, 0)} l`}
      </text>
      {h.qDhw > FLOW_EPS_KW && <Pill x={cx} y={ly1 + 2} text="boilerbedrijf" tone="warm" anchor="middle" />}
    </g>
  );
}

export function BuildingInfo({ h, office }: { h: HourState; office: boolean }) {
  const { x, y, w, h: ch } = BUILDING.card;
  const tx = x + 14;
  const status = !office ? '' : h.inUse ? 'in gebruik' : h.preheat ? 'opstoken' : 'buiten gebruik';
  const heaterOn = h.qBackup > FLOW_EPS_KW;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={ch}
        rx={8}
        className={`${c.card} ${h.comfortLoss ? c.cardAlert : ''}`}
      />
      <text x={tx} y={y + 26} className={c.title}>
        {office ? 'Kantoor' : 'Woning'}
      </text>
      {status && (
        <text x={tx} y={y + 46} className={c.t2}>
          {status}
        </text>
      )}
      <text x={tx} y={y + 76}>
        <Sym m="T" s="i" />
        <tspan className={`${c.big} ${h.comfortLoss ? c.err : ''}`}>{`${fmt(h.indoorC, 1)} °C`}</tspan>
      </text>
      <text x={tx} y={y + 100}>
        <Sym m="T" s="set" />
        <tspan className={c.b}>{`${fmt(h.setpointC, 1)} °C`}</tspan>
      </text>
      <text x={tx} y={y + 122}>
        <Sym m="Q" s="req" />
        <tspan className={c.b}>{`${kw(h.qRequested)} kW`}</tspan>
      </text>
      <text x={tx} y={y + 144}>
        winsten <tspan className={c.b}>{`${kw(h.gainsKw)} kW`}</tspan>
      </text>
      {heaterOn && (
        <text x={tx} y={y + 166} className={c.warm}>
          bijstook <tspan className={c.b}>{`${kw(h.qBackup)} kW`}</tspan>
        </text>
      )}
      {h.comfortLoss && <Pill x={tx} y={y + 196} text="comfortverlies" tone="err" />}
    </g>
  );
}

export function Heater({ on }: { on: boolean }) {
  const b = BUILDING;
  const x = b.emitterX;
  const y = b.heaterY;
  return (
    <g>
      <rect x={x - 11} y={y} width={22} height={36} rx={3} className={on ? c.heaterOn : c.heater} />
      <path
        d={`M${x} ${y + 4} l-6 4 l12 6 l-12 6 l12 6 l-6 4 V${y + 32}`}
        className={c.line2}
        style={on ? { stroke: 'var(--warm)' } : undefined}
      />
    </g>
  );
}

export function officeOutline(): string {
  const b = BUILDING;
  return `M${b.x} ${b.ground} V${b.officeTop} H${b.x + b.w} V${b.ground} Z`;
}
