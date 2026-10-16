// KPI-kaarten en advies-banner (spec §6.1, §6.2) uit de doorrekening; puur, de UI tekent alleen.
// De kaarten tonen de gekozen modus en, waar relevant, de tegenhanger in de andere modus (spec §5.8).
import { fmt } from '../../../core/format';
import { COUNTERPART_PREFIX, KPI_TITLES, UNIT_HOURS_PER_YEAR } from '../texts';
import type { Analysis } from './analysis';
import { capacityFactor } from './heatPump';
import type { Building, SimulationKpis } from './types';

export type KpiStatus = 'ok' | 'warn' | 'err' | 'neutral';

export interface KpiLine {
  text: string;
  /** doorgestreept weergeven (bijv. WP-vermogen zonder buffer als dat hoger is) */
  strike?: boolean;
}

export interface KpiCard {
  id: string;
  title: string;
  value: string;
  unit: string;
  status: KpiStatus;
  /** kleurcodering in woorden (kleur is nooit de enige informatiedrager) */
  statusText?: string;
  lines: KpiLine[];
}

const kw = (x: number, d = 1): string => (Number.isFinite(x) ? `${fmt(x, d)} kW` : 'niet te bepalen');

/** Kleurcode piek aan de meter: groen ≤ budget, oranje ≤ 110 %, rood daarboven. */
export function meterPeakStatus(peakKw: number, limitKw: number): KpiStatus {
  if (!Number.isFinite(limitKw)) return 'neutral';
  if (peakKw <= limitKw + 1e-6) return 'ok';
  if (peakKw <= 1.1 * limitKw) return 'warn';
  return 'err';
}

/** Kleurcode uren overschrijding: groen 0, oranje ≤ toegestaan, rood daarboven. */
export function exceedanceStatus(hours: number, allowed: number): KpiStatus {
  if (hours === 0) return 'ok';
  if (hours <= allowed) return 'warn';
  return 'err';
}

/** KPI's in modus 'exceedance' (onbegrensde pieken, uren overschrijding). */
export function exceedanceKpis(a: Analysis): SimulationKpis {
  return a.main.mode === 'exceedance' ? a.main.kpis : a.counterpart.kpis;
}

/** KPI's in modus 'limited' (comfort bij begrenzen). */
export function limitedKpis(a: Analysis): SimulationKpis {
  return a.main.mode === 'limited' ? a.main.kpis : a.counterpart.kpis;
}

/** Tekst van een aansluitadvies: "1×35 A", "Grootverbruik 95 kW" of "niet te bepalen". */
export function connectionText(c: { id: string; label: string; powerKw: number }): string {
  if (c.id === 'grootverbruik')
    return Number.isFinite(c.powerKw) ? `${c.label} ${fmt(c.powerKw, 0)} kW` : c.label;
  return c.label;
}

/** Gebouw in een paar woorden: "Woning", "10 woningen" of "Kantoor". */
export function buildingText(b: Pick<Building, 'use' | 'dwellings'>): string {
  if (b.use === 'office') return 'Kantoor';
  return b.dwellings > 1 ? `${fmt(b.dwellings, 0)} woningen` : 'Woning';
}

/** Ontwerpverlies met, bij meerdere woningen, kort het verlies per woning: "50,0 kW (5,0 kW/woning)". */
export function designLoadText(b: Pick<Building, 'use' | 'dwellings' | 'designLoadKw'>): string {
  const total = kw(b.designLoadKw);
  return b.use !== 'office' && b.dwellings > 1
    ? `${total} (${fmt(b.designLoadKw / b.dwellings, 1)} kW/woning)`
    : total;
}

/** Huidige aansluiting als tekst, bij grootverbruik met het gecontracteerde vermogen. */
export function currentConnectionText(a: Analysis): string {
  return a.input.grid.connection === 'grootverbruik'
    ? `${a.connectionLabel} ${fmt(a.connectionKw, 0)} kW`
    : a.connectionLabel;
}

export function buildKpiCards(a: Analysis): KpiCard[] {
  const k = a.main.kpis;
  const c = a.counterpart.kpis;
  const lim = limitedKpis(a);
  const ex = exceedanceKpis(a);
  const limitedMain = a.main.mode === 'limited';
  const other = COUNTERPART_PREFIX[a.counterpart.mode];
  const allowedEx = a.input.grid.allowedExceedanceH;
  const share = a.input.grid.heatPumpShare;
  const auto = a.input.heatPump.sizingMode === 'auto';
  const meterStatus = meterPeakStatus(k.pGridMaxKw, a.pLimitKw);
  const exStatus = exceedanceStatus(k.exceedanceHours, allowedEx);
  const comfortStatus: KpiStatus =
    lim.comfortLossHours === 0
      ? 'ok'
      : lim.comfortLossHours <= a.input.grid.allowedComfortLossH
        ? 'warn'
        : 'err';
  const without = a.sizing.withoutBuffer;
  const withBuf = a.sizing.withBuffer;
  const smallestStatus: KpiStatus = !Number.isFinite(a.smallest.powerKw)
    ? 'warn'
    : a.smallest.powerKw <= a.connectionKw + 1e-9
      ? 'ok'
      : 'err';
  const rb = a.requiredBattery;
  const batteryLine = !rb
    ? null
    : !rb.feasible
      ? 'Batterij voor 0 uur: niet haalbaar'
      : rb.capacityKwh === 0
        ? 'Batterij voor 0 uur: niet nodig'
        : `Batterij voor 0 uur: ${fmt(rb.capacityKwh, 1)} kWh`;
  const cf10 = capacityFactor(-10);

  return [
    {
      id: 'peakDemand',
      title: KPI_TITLES.peakDemand,
      value: fmt(k.qIdealMaxKw, 1),
      unit: 'kW',
      status: 'neutral',
      lines: [
        { text: `Ontwerpverlies ${designLoadText(a.input.building)}` },
        { text: `Jaarwarmtevraag ${fmt((k.eSpaceDemandKwh + k.eDhwDemandKwh) / 1000, 1)} MWh` },
      ],
    },
    {
      id: 'heatPump',
      title: auto ? KPI_TITLES.heatPumpAuto : KPI_TITLES.heatPumpManual,
      value: Number.isFinite(auto ? withBuf : a.nominalKw) ? fmt(auto ? withBuf : a.nominalKw, 1) : '–',
      unit: 'kW th',
      status: Number.isFinite(withBuf) ? 'neutral' : 'err',
      statusText: Number.isFinite(withBuf) ? undefined : 'niet te dimensioneren',
      lines: [
        ...(auto ? [] : [{ text: `Benodigd met deze buffer ${kw(withBuf)}` }]),
        {
          text: `Zonder buffer ${kw(without)}`,
          strike: a.input.buffer.volumeM3 > 0 && Number.isFinite(without) && without > withBuf,
        },
        { text: `Bij −10 °C geleverd ${kw(a.capacityAtMinus10.withBuffer)} (A7/W35 × ${fmt(cf10, 2)})` },
      ],
    },
    {
      id: 'meterPeak',
      title: KPI_TITLES.meterPeak,
      value: fmt(k.pGridMaxKw, 2),
      unit: 'kW',
      status: meterStatus,
      statusText:
        meterStatus === 'ok'
          ? 'binnen budget'
          : meterStatus === 'warn'
            ? '≤ 110 % budget'
            : meterStatus === 'err'
              ? 'boven budget'
              : undefined,
      lines: [
        { text: `WP-budget ${Number.isFinite(a.pLimitKw) ? kw(a.pLimitKw, 2) : 'onbegrensd'}` },
        { text: `Zonder batterij ${kw(a.noBattery.pGridMaxKw, 2)}` },
        { text: `${other}: ${kw(c.pGridMaxKw, 2)}` },
      ],
    },
    {
      id: 'exceedance',
      title: KPI_TITLES.exceedance,
      value: fmt(k.exceedanceHours, 0),
      unit: UNIT_HOURS_PER_YEAR,
      status: exStatus,
      statusText:
        exStatus === 'ok'
          ? limitedMain
            ? 'begrensd'
            : 'geen'
          : exStatus === 'warn'
            ? 'binnen toegestaan'
            : 'boven toegestaan',
      lines: [
        { text: `Max. ${kw(k.maxExceedanceKw, 2)} · ${fmt(k.exceedanceKwh, 0)} kWh/jaar boven budget` },
        ...(limitedMain ? [{ text: `${other}: ${fmt(ex.exceedanceHours, 0)} uur` }] : []),
        ...(batteryLine ? [{ text: batteryLine }] : []),
      ],
    },
    {
      id: 'smallest',
      title: KPI_TITLES.smallest,
      value: connectionText(a.smallest),
      unit: '',
      status: smallestStatus,
      statusText:
        smallestStatus === 'ok' ? 'huidige volstaat' : smallestStatus === 'err' ? 'groter nodig' : undefined,
      lines: [
        { text: `Huidig: ${currentConnectionText(a)} (${kw(a.connectionKw, 2)}, ${fmt(100 * share, 0)} %)` },
        { text: `Zonder maatregelen: ${connectionText(a.withoutMeasures.smallest)}` },
      ],
    },
    {
      id: 'comfort',
      title: KPI_TITLES.comfort,
      value: fmt(lim.comfortLossHours, 0),
      unit: UNIT_HOURS_PER_YEAR,
      status: comfortStatus,
      statusText: comfortStatus === 'ok' ? 'geen comfortverlies' : 'comfortverlies',
      lines: [
        {
          text: `Laagste binnentemperatuur ${fmt(lim.minIndoorC, 1)} °C · tekort ${fmt(lim.shortfallKwh, 0)} kWh`,
        },
        { text: `Tapwatertekort ${fmt(lim.dhwShortfallHours, 0)} uur` },
        ...(limitedMain ? [{ text: `${other}: ${fmt(ex.comfortLossHours, 0)} uur comfortverlies` }] : []),
      ],
    },
    {
      id: 'buffer',
      title: KPI_TITLES.buffer,
      value: fmt(k.bufferEnergyKwh, 1),
      unit: 'kWh',
      status: 'neutral',
      lines: [
        { text: `ΔT ${fmt(k.bufferDeltaT, 0)} K · ${fmt(a.input.buffer.volumeM3, 2)} m³` },
        { text: `${fmt(k.bufferCycles, 0)} laadcycli/jaar · verlies ${fmt(k.eBufferLossKwh, 0)} kWh/jaar` },
      ],
    },
    {
      id: 'energy',
      title: KPI_TITLES.energy,
      value: fmt(k.scop, 2),
      unit: 'SCOP',
      status: 'neutral',
      lines: [
        { text: `${fmt(k.eElectricKwh + k.eBackupKwh, 0)} kWh elektriciteit/jaar` },
        {
          text: `Batterijverlies ${fmt(a.main.batteryLossKwh, 0)} kWh/jaar · ${fmt(k.batteryCycles, 0)} cycli`,
        },
      ],
    },
  ];
}

/** Stuk tekst van de advies-banner; `strong` = vet. */
export interface AdvicePart {
  text: string;
  strong?: boolean;
}

/** Advies-banner (spec §6.2). */
export function buildAdvice(a: Analysis): AdvicePart[] {
  const k = a.main.kpis;
  const V = a.input.buffer.volumeM3;
  const E = a.input.battery.capacityKwh;
  const pth = a.sizing.withBuffer;
  const parts: AdvicePart[] =
    V > 0 || E > 0
      ? [
          { text: 'Met ' },
          { text: `${fmt(V, 2)} m³ buffer`, strong: true },
          { text: ' en ' },
          { text: `${fmt(E, 1)} kWh batterij`, strong: true },
          { text: ' heeft de warmtepomp ' },
        ]
      : [{ text: 'Zonder buffer en batterij heeft de warmtepomp ' }];
  parts.push({
    text: Number.isFinite(pth) ? `${fmt(pth, 1)} kW` : 'meer dan 3 × het piekvermogen',
    strong: true,
  });
  parts.push({ text: ' (A7/W35) nodig' });
  if (a.input.heatPump.sizingMode === 'manual') parts.push({ text: ` (gekozen: ${fmt(a.nominalKw, 1)} kW)` });
  const budget = Number.isFinite(a.pLimitKw) ? `${fmt(a.pLimitKw, 2)} kW` : 'onbegrensd';
  const conn = `${currentConnectionText(a)}, ${fmt(100 * a.input.grid.heatPumpShare, 0)} %`;
  if (a.main.mode === 'limited') {
    parts.push(
      { text: '; de begrenzer houdt de WP-groep binnen het budget van ' },
      { text: budget, strong: true },
      { text: ` (${conn})` },
      {
        text:
          k.comfortLossHours === 0
            ? ', zonder comfortverlies.'
            : `, wat ${fmt(k.comfortLossHours, 0)} uur comfortverlies per jaar kost.`,
      },
    );
  } else if (k.exceedanceHours === 0) {
    parts.push(
      { text: ' en blijft de WP-groep het hele jaar binnen het budget van ' },
      { text: budget, strong: true },
      { text: ` (${conn}).` },
    );
  } else {
    parts.push(
      { text: ' en blijft de WP-groep ' },
      { text: fmt(k.exceedanceHours, 0), strong: true },
      { text: ' uur per jaar boven het budget van ' },
      { text: budget, strong: true },
      { text: ` (${conn}).` },
    );
  }
  parts.push(
    { text: ' Kleinste passende aansluiting: ' },
    { text: connectionText(a.smallest), strong: true },
    { text: '.' },
  );
  const w = a.withoutMeasures;
  const p0 = a.sizing.withoutBuffer;
  parts.push({
    text: ` Zonder maatregelen: ${Number.isFinite(p0) ? `${fmt(p0, 1)} kW` : 'niet te dimensioneren'} warmtepomp, ${fmt(
      w.kpis.exceedanceHours,
      0,
    )} uur overschrijding, ${connectionText(w.smallest)}.`,
  });
  return parts;
}
