// Ingeklapte Basis (UX-plan §2.3): één role="toolbar" (aria-label "Basis") met roving tabindex. Eén tabstop,
// pijltjestoetsen tussen de chips, daarna de knop "Wijzig". Elke chip opent de Basis en zet de focus op zijn veld
// (revealSetting); voor velden in Meer instellingen klapt die eerst open. Toegankelijke naam van een chip:
// "{label}: {waarde}, wijzigen", bijvoorbeeld "Piekvermogen verwarming: 8,0 kW, wijzigen".
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { EMITTER_PRESETS } from '../../data/heatPumpCurves';
import { climateShortName } from '../../model/climate';
import { connectionLabel, connectionPowerKw, gridLimitKw } from '../../model/grid';
import { buildingKind } from '../../model/input';
import { buildingText, connectionText, designLoadText } from '../../model/kpis';
import type { PeakshavingInput } from '../../model/types';
import { useStore } from '../../store';
import { BASIS_TEXTS, STEP_TITLES, UI_LABELS } from '../../texts';
import { kwDigitsFor } from '../../view/format';
import type { FieldKey } from '../../view/types';
import { nightSetbackOn } from './fields';
import s from './Basis.module.css';

export interface StripChip {
  /** sleutel voor React (uniek per chip) */
  key: string;
  /** veldlabel in de toegankelijke naam */
  label: string;
  /** zichtbare tekst */
  value: string;
  /** veld dat de chip toont */
  target: FieldKey;
}

/**
 * Chips van de strook (puur): gebouw, piekvermogen ("kW/woning" bij meerdere woningen), stooklijn, tapwater of bij
 * kantoor gebruikstijden en nachtverlaging, aansluiting, budget en klimaatjaar.
 */
export function stripChips(input: PeakshavingInput): StripChip[] {
  const b = input.building;
  const g = input.grid;
  const kind = buildingKind(b);
  const office = kind === 'office';
  const preset = EMITTER_PRESETS[input.heatPump.emitterPreset];
  const budget = gridLimitKw(g);
  const chips: StripChip[] = [
    { key: 'kind', label: 'Gebouwfunctie', value: buildingText(b), target: 'kind' },
    {
      key: 'designLoad',
      label: kind === 'multi' ? 'Piekvermogen verwarming (totaal)' : 'Piekvermogen verwarming',
      value: designLoadText(b),
      target: 'designLoad',
    },
    {
      key: 'emitter',
      label: 'Stooklijn (afgifte)',
      value: BASIS_TEXTS.chipEmitter(preset.id, preset.supplyDesignC, preset.returnDesignC),
      target: 'emitter',
    },
  ];
  if (office) {
    chips.push(
      {
        key: 'useHours',
        label: BASIS_TEXTS.useHoursLabel,
        value: BASIS_TEXTS.chipUseHours(b.useStartH, b.useEndH),
        target: 'useHours',
      },
      {
        key: 'nightSetback',
        label: UI_LABELS.nightSetback,
        value: BASIS_TEXTS.chipNightSetback(nightSetbackOn(b)),
        target: 'nightSetback',
      },
    );
  }
  // kantoor: tapwater staat in Meer instellingen en is standaard uit; alleen tonen als het aan staat
  if (!office || b.dhw.enabled) {
    const n = kind === 'multi' ? b.dwellings : 1;
    chips.push({
      key: 'dhw',
      label: 'Warm tapwater',
      value: b.dhw.enabled
        ? BASIS_TEXTS.chipDhw(b.dhw.dailyKwh / n, kind === 'multi')
        : BASIS_TEXTS.chipDhwOff,
      target: 'dhw',
    });
  }
  chips.push(
    {
      key: 'connection',
      label: 'Aansluitwaarde',
      value: connectionText({ id: g.connection, label: connectionLabel(g), powerKw: connectionPowerKw(g) }),
      target: 'connection',
    },
    {
      key: 'share',
      label: 'Aandeel voor warmtepomp',
      value: BASIS_TEXTS.chipBudget(budget, g.heatPumpShare * 100, kwDigitsFor(budget)),
      target: 'share',
    },
    { key: 'climate', label: 'Klimaatjaar', value: climateShortName(input.climateYear), target: 'climate' },
  );
  return chips;
}

/** Strook met chips en de knop "Wijzig"; de ouder plaatst beide in zijn raster. */
export function BasisStrip({ onEdit }: { onEdit: () => void }) {
  const input = useStore((st) => st.input);
  const revealSetting = useStore((st) => st.revealSetting);
  const chips = useMemo(() => stripChips(input), [input]);
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // het aantal chips kan veranderen (kantoor heeft er meer): de actieve chip blijft binnen de lijst
  const current = Math.min(active, chips.length - 1);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const last = chips.length - 1;
    let next: number;
    if (e.key === 'ArrowRight') next = current === last ? 0 : current + 1;
    else if (e.key === 'ArrowLeft') next = current === 0 ? last : current - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    else return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  };

  return (
    <>
      <div role="toolbar" aria-label={STEP_TITLES.basis} className={s.chips} onKeyDown={onKeyDown}>
        {chips.map((c, i) => (
          <button
            key={c.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            className={s.chip}
            tabIndex={i === current ? 0 : -1}
            aria-label={BASIS_TEXTS.chipName(c.label, c.value)}
            onFocus={() => setActive(i)}
            onClick={() => revealSetting(c.target)}
          >
            {c.value}
          </button>
        ))}
      </div>
      <button type="button" className={s.edit} onClick={onEdit}>
        {UI_LABELS.edit}
      </button>
    </>
  );
}
