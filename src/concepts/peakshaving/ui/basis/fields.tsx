// Veldcomponenten van de Basis en Meer instellingen (UX-plan §3). De code komt uit de oude invoerblokken
// (inputs/BuildingPanel, GridPanel, HeatPumpPanel); alle labels zijn ongewijzigd (B14). Elk veld staat in een
// <div data-field="…"> met een FieldKey, zodat een chip, knop of melding er de focus op kan zetten (revealSetting).
import { useId, useMemo, type ReactNode } from 'react';
import { fmt } from '../../../../core/format';
import { clamp } from '../../../../core/interp';
import { InfoIcon, SegField, SelectField } from '../../../../ui/fields';
import u from '../../../../ui/ui.module.css';
import {
  CONNECTIONS,
  LARGE_CONNECTION_ID,
  LARGE_CONNECTION_LABEL,
  type ConnectionId,
} from '../../data/connections';
import { EMITTER_PRESETS, MAX_SUPPLY_OPTIONS, type EmitterPreset } from '../../data/heatPumpCurves';
import { connectionPowerKw, gridLimitKw } from '../../model/grid';
import { buildingKind, LIMITS } from '../../model/input';
import type { Building, BuildingKind, DhwConfig, GridConnection, HeatPump } from '../../model/types';
import { useStore } from '../../store';
import { BASIS_TEXTS, HELP, MASS_PRESETS, UI_LABELS } from '../../texts';
import type { FieldKey } from '../../view/types';
import { dhwOnDefaults } from '../../view/settingsDiff';
import { tourAnchor } from '../tour/anchors';
import { RangeField } from '../inputs/controls';
import p from '../peakshaving.module.css';
import { BudgetBar } from './BudgetBar';
import s from './Basis.module.css';

const KIND_OPTIONS: { value: BuildingKind; label: string }[] = [
  { value: 'single', label: 'Woning' },
  { value: 'multi', label: 'Meerdere woningen' },
  { value: 'office', label: 'Kantoor' },
];

/** Eén woning: boven dit piekvermogen [kW] de hint "Groot voor één woning" tonen. */
const SINGLE_LARGE_KW = 20;
/** Meerdere woningen: schuifbereik aantal woningen (het getalveld gaat tot LIMITS.dwellings). */
const DWELLINGS_SLIDER: readonly [number, number] = [2, 100];
/** Nachtverlaging aan: het setpoint buiten gebruik zoveel lager dan tijdens gebruik [K] (UX-plan §3.1). */
export const NIGHT_SETBACK_K = 2;

/** Schuifbereik piekvermogen bij meerdere woningen: tot 500 kW, bij veel woningen tot ca. 10 kW per woning. */
function multiLoadSliderMax(dwellings: number): number {
  return Math.min(LIMITS.designLoadKw[1], Math.max(500, Math.ceil(dwellings / 10) * 100));
}

/** Wijzigacties op een deel van de invoer (via `update`: handmatige invoer, ongedaan maken vervalt). */
function usePatch() {
  const update = useStore((st) => st.update);
  return useMemo(
    () => ({
      building: (x: Partial<Building>): void => update((i) => ({ ...i, building: { ...i.building, ...x } })),
      dhw: (x: Partial<DhwConfig>): void =>
        update((i) => ({ ...i, building: { ...i.building, dhw: { ...i.building.dhw, ...x } } })),
      grid: (x: Partial<GridConnection>): void => update((i) => ({ ...i, grid: { ...i.grid, ...x } })),
      heatPump: (x: Partial<HeatPump>): void => update((i) => ({ ...i, heatPump: { ...i.heatPump, ...x } })),
    }),
    [update],
  );
}

/** Omhulling van een veld: doel van revealSetting via data-field. */
export function FieldCell({
  field,
  className,
  children,
  ...rest
}: {
  field: FieldKey;
  className?: string;
  children: ReactNode;
  'data-tour'?: string;
}) {
  return (
    <div data-field={field} className={className ? `${s.cell} ${className}` : s.cell} {...rest}>
      {children}
    </div>
  );
}

/** Vinkje met een regel eronder die het vinkje beschrijft (CheckField uit src/ui kent geen hint). */
function CheckHintField({
  label,
  info,
  checked,
  hint,
  onChange,
}: {
  label: string;
  info?: string;
  checked: boolean;
  hint?: ReactNode;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={u.field}>
      <div className={`${u.check} ${s.check}`}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          aria-describedby={hint ? hintId : undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label htmlFor={id}>{label}</label>
        {info && <InfoIcon text={info} label={label} />}
      </div>
      {hint && (
        <div className={`${p.live} ${s.checkHint}`} id={hintId}>
          {hint}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Basis (§3.1)

export function KindField() {
  const kind = useStore((st) => buildingKind(st.input.building));
  const setKind = useStore((st) => st.setKind);
  return (
    <FieldCell field="kind">
      <SegField
        label="Gebouwfunctie"
        info={HELP.use}
        value={kind}
        options={KIND_OPTIONS}
        onChange={setKind}
      />
    </FieldCell>
  );
}

export function DwellingsField() {
  const dwellings = useStore((st) => st.input.building.dwellings);
  const setDwellings = useStore((st) => st.setDwellings);
  return (
    <FieldCell field="dwellings">
      <RangeField
        label="Aantal woningen"
        info={HELP.dwellings}
        value={dwellings}
        min={2}
        max={LIMITS.dwellings[1]}
        sliderMin={DWELLINGS_SLIDER[0]}
        sliderMax={DWELLINGS_SLIDER[1]}
        step={1}
        digits={0}
        onChange={setDwellings}
      />
    </FieldCell>
  );
}

export function DesignLoadField() {
  const b = useStore((st) => st.input.building);
  const setDesignLoad = useStore((st) => st.setDesignLoad);
  const kind = buildingKind(b);
  const office = kind === 'office';
  return (
    <FieldCell field="designLoad">
      {kind === 'multi' ? (
        <RangeField
          label="Piekvermogen verwarming (totaal)"
          info={HELP.designLoadMulti}
          value={b.designLoadKw}
          min={LIMITS.designLoadKw[0]}
          max={LIMITS.designLoadKw[1]}
          sliderMin={5}
          sliderMax={multiLoadSliderMax(b.dwellings)}
          step={1}
          digits={1}
          unit="kW"
          hint={<>≈ {fmt(b.designLoadKw / b.dwellings, 1)} kW per woning</>}
          onChange={setDesignLoad}
        />
      ) : (
        <RangeField
          label="Piekvermogen verwarming"
          info={HELP.designLoad}
          value={b.designLoadKw}
          min={LIMITS.designLoadKw[0]}
          max={LIMITS.designLoadKw[1]}
          sliderMin={office ? 10 : 1}
          sliderMax={office ? 500 : 30}
          step={office ? 5 : 0.5}
          digits={1}
          unit="kW"
          hint={!office && b.designLoadKw > SINGLE_LARGE_KW ? HELP.singleDwellingLarge : undefined}
          onChange={setDesignLoad}
        />
      )}
    </FieldCell>
  );
}

export function EmitterField() {
  const preset = useStore((st) => st.input.heatPump.emitterPreset);
  const patch = usePatch();
  return (
    <FieldCell field="emitter">
      {/* de beschrijving (vloerverwarming, radiatoren) staat in de toelichting */}
      <SegField<EmitterPreset>
        label="Stooklijn (afgifte)"
        info={HELP.emitter}
        value={preset}
        options={(Object.keys(EMITTER_PRESETS) as EmitterPreset[]).map((k) => ({
          value: k,
          label: BASIS_TEXTS.emitterOption(k, EMITTER_PRESETS[k].supplyDesignC),
        }))}
        onChange={(emitterPreset) => patch.heatPump({ emitterPreset })}
      />
    </FieldCell>
  );
}

/**
 * Vinkje Warm tapwater. In de Basis (woning, meerdere woningen) met de samenvatting als hint; bij kantoor in Meer
 * instellingen › Tapwater, zonder hint (de getallen staan er direct onder).
 */
export function DhwField({ summary = true }: { summary?: boolean }) {
  const b = useStore((st) => st.input.building);
  const patch = usePatch();
  const kind = buildingKind(b);
  // aantal woningen; 1 bij één woning en kantoor (tapwaterwaarden zijn dan gewoon de totalen)
  const n = kind === 'multi' ? b.dwellings : 1;
  return (
    <FieldCell field="dhw">
      <CheckHintField
        label="Warm tapwater"
        info={HELP.dhw}
        checked={b.dhw.enabled}
        hint={
          summary && b.dhw.enabled
            ? BASIS_TEXTS.dhwHint(b.dhw.dailyKwh / n, b.dhw.tankLitre, kind === 'multi')
            : undefined
        }
        onChange={(enabled) => {
          // standaard per woning (bij meerdere woningen de appartementwaarden × het aantal)
          const ref = dhwOnDefaults(kind);
          patch.dhw(
            enabled && b.dhw.tankLitre === 0
              ? { enabled, tankLitre: ref.tankLitre * n, dailyKwh: b.dhw.dailyKwh || ref.dailyKwh * n }
              : { enabled },
          );
        }}
      />
    </FieldCell>
  );
}

/** Kantoor: gebruik vanaf en tot in één cel. */
export function UseHoursField() {
  const b = useStore((st) => st.input.building);
  const patch = usePatch();
  return (
    <FieldCell field="useHours">
      <div className={p.pair}>
        <RangeField
          label="Gebruik vanaf"
          info={HELP.useHours}
          value={b.useStartH}
          min={0}
          max={23}
          step={1}
          unit="h"
          noSlider
          onChange={(v) => patch.building({ useStartH: v })}
        />
        <RangeField
          label="Gebruik tot"
          value={b.useEndH}
          min={1}
          max={24}
          step={1}
          unit="h"
          noSlider
          onChange={(v) => patch.building({ useEndH: v })}
        />
      </div>
    </FieldCell>
  );
}

/** Nachtverlaging staat aan als het setpoint buiten gebruik lager is dan tijdens gebruik. */
export function nightSetbackOn(b: Pick<Building, 'setpointSetbackC' | 'setpointUseC'>): boolean {
  return b.setpointSetbackC < b.setpointUseC;
}

/**
 * Setpoint buiten gebruik bij het (uit)vinken van Nachtverlaging: aan = gebruikssetpoint − 2 K (begrensd), uit =
 * gelijk aan het gebruikssetpoint. Een eigen verlaagd setpoint gaat bij uit- en weer aanvinken verloren; de exacte
 * waarde staat in Meer instellingen › Gebouw.
 */
export function setbackFor(on: boolean, setpointUseC: number): number {
  return on
    ? clamp(setpointUseC - NIGHT_SETBACK_K, LIMITS.setpointSetbackC[0], LIMITS.setpointSetbackC[1])
    : setpointUseC;
}

/** Kantoor: vinkje Nachtverlaging (alleen een vertaling naar het setpoint buiten gebruik). */
export function NightSetbackField() {
  const b = useStore((st) => st.input.building);
  const patch = usePatch();
  return (
    <FieldCell field="nightSetback">
      <CheckHintField
        label={UI_LABELS.nightSetback}
        info={HELP.nightSetback}
        checked={nightSetbackOn(b)}
        onChange={(on) => patch.building({ setpointSetbackC: setbackFor(on, b.setpointUseC) })}
      />
    </FieldCell>
  );
}

export function ConnectionField() {
  const connection = useStore((st) => st.input.grid.connection);
  const patch = usePatch();
  return (
    <FieldCell field="connection">
      <SelectField<ConnectionId>
        label="Aansluitwaarde"
        info={HELP.connection}
        value={connection}
        options={[
          ...CONNECTIONS.map((c) => ({ value: c.id, label: `${c.label} — ${fmt(c.powerKw, 2)} kW` })),
          // kort: het veld ernaast heet al "Gecontracteerd vermogen" (de lange tekst viel buiten de keuzelijst)
          { value: LARGE_CONNECTION_ID, label: LARGE_CONNECTION_LABEL },
        ]}
        onChange={(c) => patch.grid({ connection: c })}
      />
    </FieldCell>
  );
}

/** Grootverbruik: eigen cel naast de aansluitwaarde (geen eigen FieldKey: de chip "Aansluitwaarde" wijst hierheen). */
export function ContractedField() {
  const contractedKw = useStore((st) => st.input.grid.contractedKw);
  const patch = usePatch();
  return (
    <div className={s.cell}>
      <RangeField
        label="Gecontracteerd vermogen"
        info={HELP.contracted}
        value={contractedKw}
        min={LIMITS.contractedKw[0]}
        max={LIMITS.contractedKw[1]}
        sliderMax={1000}
        step={5}
        unit="kW"
        onChange={(v) => patch.grid({ contractedKw: v })}
      />
    </div>
  );
}

/** Aandeel voor warmtepomp, met de budgetbalk als hint (dus ook als beschrijving van het getalveld). */
export function ShareField() {
  const g = useStore((st) => st.input.grid);
  const multi = useStore((st) => buildingKind(st.input.building) === 'multi');
  const patch = usePatch();
  return (
    <FieldCell field="share" {...tourAnchor('budget')}>
      <RangeField
        label="Aandeel voor warmtepomp"
        info={multi ? `${HELP.share} ${HELP.shareMulti}` : HELP.share}
        value={Math.round(g.heatPumpShare * 100)}
        min={LIMITS.heatPumpShare[0] * 100}
        max={LIMITS.heatPumpShare[1] * 100}
        step={1}
        unit="%"
        hint={<BudgetBar budgetKw={gridLimitKw(g)} connectionKw={connectionPowerKw(g)} />}
        onChange={(v) => patch.grid({ heatPumpShare: v / 100 })}
      />
    </FieldCell>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Meer instellingen (§3.2)

/** Gebouwmassa: knoppen direct boven de tijdconstante. */
export function MassField() {
  const tau = useStore((st) => st.input.building.timeConstantH);
  const patch = usePatch();
  const massPreset = MASS_PRESETS.find((m) => m.value === tau)?.value ?? 0;
  return (
    <FieldCell field="mass" className={s.stack}>
      <SegField
        label="Gebouwmassa"
        info={HELP.mass}
        value={massPreset}
        options={[
          ...MASS_PRESETS.map((m) => ({ value: m.value, label: `${m.label} ${m.value} h` })),
          ...(massPreset === 0
            ? [{ value: 0, label: `Eigen ${fmt(tau, Number.isInteger(tau) ? 0 : 1)} h` }]
            : []),
        ]}
        onChange={(v) => v > 0 && patch.building({ timeConstantH: v })}
      />
      <RangeField
        label="Gebouwmassa (tijdconstante)"
        info={HELP.mass}
        value={tau}
        min={LIMITS.timeConstantH[0]}
        max={LIMITS.timeConstantH[1]}
        step={1}
        unit="h"
        onChange={(v) => patch.building({ timeConstantH: v })}
      />
    </FieldCell>
  );
}

/** Ontwerpbuiten- en ontwerpbinnentemperatuur naast elkaar. */
export function DesignTempsField() {
  const b = useStore((st) => st.input.building);
  const patch = usePatch();
  return (
    <FieldCell field="designTemps" className={p.pair}>
      <RangeField
        label="Ontwerpbuitentemperatuur"
        info={HELP.designOutdoor}
        value={b.designOutdoorC}
        min={LIMITS.designOutdoorC[0]}
        max={LIMITS.designOutdoorC[1]}
        step={1}
        unit="°C"
        noSlider
        onChange={(v) => patch.building({ designOutdoorC: v })}
      />
      <RangeField
        label="Ontwerpbinnentemperatuur"
        info={HELP.designIndoor}
        value={b.designIndoorC}
        min={LIMITS.designIndoorC[0]}
        max={LIMITS.designIndoorC[1]}
        step={0.5}
        unit="°C"
        noSlider
        onChange={(v) => patch.building({ designIndoorC: v })}
      />
    </FieldCell>
  );
}

/**
 * Overige gebouwvelden, twee aan twee: setpoints tijdens en buiten gebruik, stookgrens en gevel, opwarmfactor en (kantoor)
 * de opstooktijd.
 */
export function BuildingMoreFields() {
  const b = useStore((st) => st.input.building);
  const patch = usePatch();
  return (
    <>
      <div className={p.pair}>
        <RangeField
          label="Setpoint tijdens gebruik"
          info={HELP.setpointUse}
          value={b.setpointUseC}
          min={LIMITS.setpointUseC[0]}
          max={LIMITS.setpointUseC[1]}
          step={0.5}
          unit="°C"
          noSlider
          onChange={(v) => patch.building({ setpointUseC: v })}
        />
        <RangeField
          label="Setpoint buiten gebruik"
          info={HELP.setpointSetback}
          value={b.setpointSetbackC}
          min={LIMITS.setpointSetbackC[0]}
          max={LIMITS.setpointSetbackC[1]}
          step={0.5}
          unit="°C"
          noSlider
          onChange={(v) => patch.building({ setpointSetbackC: v })}
        />
      </div>
      <div className={p.pair}>
        <RangeField
          label="Stookgrens tijdens gebruik"
          info={HELP.balanceTemp}
          value={b.balanceTempC}
          min={LIMITS.balanceTempC[0]}
          max={LIMITS.balanceTempC[1]}
          step={0.5}
          unit="°C"
          noSlider
          onChange={(v) => patch.building({ balanceTempC: v })}
        />
        <RangeField
          label="Traagheid gevel"
          info={HELP.envelopeLag}
          value={b.envelopeLagH}
          min={LIMITS.envelopeLagH[0]}
          max={LIMITS.envelopeLagH[1]}
          step={0.5}
          unit="h"
          noSlider
          onChange={(v) => patch.building({ envelopeLagH: v })}
        />
      </div>
      <div className={p.pair}>
        <RangeField
          label="Opwarmfactor"
          info={HELP.boost}
          value={b.boostFraction}
          min={LIMITS.boostFraction[0]}
          max={LIMITS.boostFraction[1]}
          step={0.05}
          digits={2}
          unit="× P"
          noSlider
          onChange={(v) => patch.building({ boostFraction: v })}
        />
        {b.use === 'office' && (
          <RangeField
            label="Opstooktijd"
            info={HELP.preheat}
            value={b.preheatH}
            min={LIMITS.preheatH[0]}
            max={LIMITS.preheatH[1]}
            step={1}
            unit="h"
            noSlider
            onChange={(v) => patch.building({ preheatH: v })}
          />
        )}
      </div>
    </>
  );
}

/**
 * Tapwatergetallen (alleen als tapwater aan staat): behoefte (per woning), boilervat (collectief) en
 * boilertemperatuur. Bij meerdere woningen wordt de behoefte per woning ingevoerd; het model krijgt het totaal. Behoefte
 * en boilervat staan naast elkaar, bij meerdere woningen onder elkaar (de labels zijn daar langer), zoals in de oude
 * invoer.
 */
export function DhwDetailsField() {
  const b = useStore((st) => st.input.building);
  const patch = usePatch();
  if (!b.dhw.enabled) return null;
  const multi = buildingKind(b) === 'multi';
  const n = multi ? b.dwellings : 1;
  return (
    <FieldCell field="dhwDetails" className={s.stack}>
      <div className={multi ? s.stack : p.pair}>
        <RangeField
          label={multi ? 'Tapwaterbehoefte per woning' : 'Tapwaterbehoefte'}
          info={multi ? HELP.dhwDailyPerDwelling : HELP.dhwDaily}
          value={b.dhw.dailyKwh / n}
          min={LIMITS.dhwDailyKwh[0]}
          max={LIMITS.dhwDailyKwh[1]}
          step={0.5}
          unit="kWh/dag"
          noSlider
          onChange={(v) => patch.dhw({ dailyKwh: v * n })}
        />
        <RangeField
          label={multi ? 'Boilervat (collectief)' : 'Boilervat'}
          info={multi ? HELP.tankCollective : HELP.tank}
          value={b.dhw.tankLitre}
          min={LIMITS.tankLitre[0]}
          max={LIMITS.tankLitre[1] * n}
          step={multi ? 50 : 10}
          unit="l"
          noSlider
          hint={multi ? <>≈ {fmt(b.dhw.tankLitre / n, 0)} l per woning</> : undefined}
          onChange={(v) => patch.dhw({ tankLitre: v })}
        />
      </div>
      <div className={p.pair}>
        <RangeField
          label="Boilertemperatuur"
          info={HELP.tankTemp}
          value={b.dhw.tankTempC}
          min={LIMITS.tankTempC[0]}
          max={LIMITS.tankTempC[1]}
          step={1}
          unit="°C"
          noSlider
          onChange={(v) => patch.dhw({ tankTempC: v })}
        />
      </div>
    </FieldCell>
  );
}

export function HeatPumpMoreField() {
  const hp = useStore((st) => st.input.heatPump);
  const patch = usePatch();
  return (
    <FieldCell field="heatPumpMore" className={s.stack}>
      {/* het lange label breekt in een halve kolom af; daarom over de volle breedte */}
      <SelectField<number>
        label="Max. aanvoertemperatuur warmtepomp"
        info={HELP.maxSupply}
        value={hp.maxSupplyC}
        options={MAX_SUPPLY_OPTIONS.map((v) => ({ value: v, label: `${v} °C` }))}
        onChange={(maxSupplyC) => patch.heatPump({ maxSupplyC })}
      />
      <div className={p.pair}>
        <RangeField
          label="Bijstookelement"
          info={HELP.backup}
          value={hp.backupHeaterKw}
          min={LIMITS.backupHeaterKw[0]}
          max={LIMITS.backupHeaterKw[1]}
          step={0.5}
          digits={1}
          unit="kW"
          noSlider
          onChange={(backupHeaterKw) => patch.heatPump({ backupHeaterKw })}
        />
      </div>
      <RangeField
        label="Carnot-rendement"
        info={HELP.carnot}
        value={hp.carnotEfficiency}
        min={LIMITS.carnotEfficiency[0]}
        max={LIMITS.carnotEfficiency[1]}
        step={0.01}
        digits={2}
        onChange={(carnotEfficiency) => patch.heatPump({ carnotEfficiency })}
      />
    </FieldCell>
  );
}

export function AllowedHoursField() {
  const g = useStore((st) => st.input.grid);
  const patch = usePatch();
  return (
    <FieldCell field="allowedHours" className={p.pair}>
      <RangeField
        label="Toegestane overschrijdingsuren"
        info={HELP.allowedExceedance}
        value={g.allowedExceedanceH}
        min={LIMITS.allowedHours[0]}
        max={LIMITS.allowedHours[1]}
        step={1}
        unit="uur/jaar"
        noSlider
        onChange={(v) => patch.grid({ allowedExceedanceH: v })}
      />
      <RangeField
        label="Toegestane comfortverliesuren"
        info={HELP.allowedComfort}
        value={g.allowedComfortLossH}
        min={LIMITS.allowedHours[0]}
        max={LIMITS.allowedHours[1]}
        step={1}
        unit="uur/jaar"
        noSlider
        onChange={(v) => patch.grid({ allowedComfortLossH: v })}
      />
    </FieldCell>
  );
}
