// Invoerelementen van het peakshaving-concept: getal + schuif met eigen schuifbereik en markeringen.
import { useEffect, useId, useState, type ReactNode } from 'react';
import { fmt, parseNum } from '../../../../core/format';
import { Field } from '../../../../ui/fields';
import u from '../../../../ui/ui.module.css';
import p from '../peakshaving.module.css';

export interface Marker {
  value: number;
  label: string;
}

interface RangeFieldProps {
  label: string;
  info?: string;
  value: number;
  /** geldig bereik van het getal (ongeldige waarden worden begrensd) */
  min: number;
  max: number;
  /** bereik van de schuif (standaard gelijk aan min/max) */
  sliderMin?: number;
  sliderMax?: number;
  step?: number;
  unit?: string;
  digits?: number;
  disabled?: boolean;
  markers?: Marker[];
  /** regel onder het veld (live afgeleide waarden of een korte opmerking); beschrijft het getalveld voor schermlezers */
  hint?: ReactNode;
  /** geen schuif tonen */
  noSlider?: boolean;
  onChange: (v: number) => void;
}

/** Getalveld met schuif; commit bij verlaten of Enter, begrensd op [min, max]. */
export function RangeField({
  label,
  info,
  value,
  min,
  max,
  sliderMin = min,
  sliderMax = max,
  step = 1,
  unit,
  digits,
  disabled,
  markers,
  hint,
  noSlider,
  onChange,
}: RangeFieldProps) {
  const id = useId();
  const dig = digits ?? (step < 1 ? (step < 0.1 ? 2 : 1) : 0);
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [value]);
  const clampV = (v: number): number => Math.min(Math.max(v, min), max);
  // "1.234" (duizendtal), "1.5" (decimale punt) en "−5" (minteken zoals fmt() het toont) worden geaccepteerd;
  // lege of ongeldige tekst zet de huidige waarde terug in plaats van 0 (en dus het minimum) te kiezen
  const commit = (txt: string): void => {
    const val = parseNum(txt);
    setDraft(null);
    if (val !== null) onChange(clampV(val));
  };
  const unitId = `${id}-unit`;
  const hintId = `${id}-hint`;
  // eenheid en regel onder het veld beschrijven het getalveld (eerst de eenheid)
  const describedBy = [unit ? unitId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  const valueText = unit ? `${fmt(value, dig)} ${unit}` : fmt(value, dig);
  const span = sliderMax - sliderMin;
  return (
    <Field label={label} info={info} htmlFor={id}>
      <div className={u.inputWrap}>
        <input
          id={id}
          className={u.input}
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={draft ?? fmt(value, dig)}
          aria-describedby={describedBy}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => draft !== null && commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const d = e.key === 'ArrowUp' ? step : -step;
              onChange(clampV(Math.round((value + d) * 1e6) / 1e6));
            }
          }}
        />
        {unit && (
          <span className={u.unit} id={unitId}>
            {unit}
          </span>
        )}
      </div>
      {!noSlider && (
        <div className={p.sliderWrap}>
          <input
            type="range"
            min={sliderMin}
            max={sliderMax}
            step={step}
            value={Math.min(Math.max(value, sliderMin), sliderMax)}
            disabled={disabled}
            aria-label={`${label} (schuif)`}
            aria-valuetext={valueText}
            onChange={(e) => onChange(clampV(Number(e.target.value)))}
            className={p.slider}
          />
          {markers && markers.length > 0 && span > 0 && (
            <div className={p.markers} aria-hidden="true">
              {markers
                .filter((m) => m.value >= sliderMin && m.value <= sliderMax)
                .map((m) => (
                  <span
                    key={m.label}
                    className={p.marker}
                    // de schuifknop is ~16 px breed: markeringen op het midden van de knop plaatsen
                    style={{ left: `calc(8px + (100% - 16px) * ${(m.value - sliderMin) / span})` }}
                  >
                    {m.label}
                  </span>
                ))}
            </div>
          )}
        </div>
      )}
      {hint && (
        <div className={p.live} id={hintId}>
          {hint}
        </div>
      )}
    </Field>
  );
}
