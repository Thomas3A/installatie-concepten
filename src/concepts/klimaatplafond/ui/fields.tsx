import { useEffect, useId, useState, type ReactNode } from 'react';
import { fmt } from '../../../core/format';
import s from './ui.module.css';

export function InfoIcon({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        className={s.infoBtn}
        aria-label={`Toelichting: ${label}`}
        aria-expanded={open}
        aria-controls={id}
        title={text}
        onClick={() => setOpen((o) => !o)}
      >
        i
      </button>
      {open && (
        <span id={id} role="note" className={s.infoText} style={{ flexBasis: '100%' }}>
          {text}
        </span>
      )}
    </>
  );
}

interface FieldShell {
  label: string;
  info?: string;
  htmlFor?: string;
  children: ReactNode;
}

export function Field({ label, info, htmlFor, children }: FieldShell) {
  return (
    <div className={s.field}>
      <div className={s.label} style={{ flexWrap: 'wrap' }}>
        <label htmlFor={htmlFor}>{label}</label>
        {info && <InfoIcon text={info} label={label} />}
      </div>
      {children}
    </div>
  );
}

interface NumFieldProps {
  label: string;
  info?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  digits?: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}

/** Numeriek veld met concept-tekst: commit bij verlaten of Enter, geklemd op bereik. */
export function NumField({
  label,
  info,
  value,
  min,
  max,
  step = 1,
  unit,
  digits,
  disabled,
  onChange,
}: NumFieldProps) {
  const id = useId();
  const dig = digits ?? (step < 1 ? (step < 0.1 ? 2 : 1) : 0);
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [value]);
  const commit = (txt: string): void => {
    const v = Number(txt.replace(',', '.'));
    setDraft(null);
    if (Number.isFinite(v)) onChange(Math.min(Math.max(v, min), max));
  };
  return (
    <Field label={label} info={info} htmlFor={id}>
      <div className={s.inputWrap}>
        <input
          id={id}
          className={s.input}
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={draft ?? fmt(value, dig)}
          aria-label={label}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => draft !== null && commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const d = e.key === 'ArrowUp' ? step : -step;
              onChange(Math.min(Math.max(Math.round((value + d) * 1e6) / 1e6, min), max));
            }
          }}
        />
        {unit && <span className={s.unit}>{unit}</span>}
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={`${label} (schuif)`}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--accent)' }}
      />
    </Field>
  );
}

/** Compact numeriek veld zonder schuifbalk. */
export function NumInput({
  label,
  info,
  value,
  min,
  max,
  step = 1,
  unit,
  digits,
  disabled,
  onChange,
}: NumFieldProps) {
  const id = useId();
  const dig = digits ?? (step < 1 ? (step < 0.1 ? 2 : 1) : 0);
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [value]);
  const commit = (txt: string): void => {
    const v = Number(txt.replace(',', '.'));
    setDraft(null);
    if (Number.isFinite(v)) onChange(Math.min(Math.max(v, min), max));
  };
  return (
    <Field label={label} info={info} htmlFor={id}>
      <div className={s.inputWrap}>
        <input
          id={id}
          className={s.input}
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={draft ?? fmt(value, dig)}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => draft !== null && commit(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && commit((e.target as HTMLInputElement).value)}
        />
        {unit && <span className={s.unit}>{unit}</span>}
      </div>
    </Field>
  );
}

export function SelectField<T extends string | number>({
  label,
  info,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  info?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <Field label={label} info={info} htmlFor={id}>
      <select
        id={id}
        className={s.select}
        value={String(value)}
        disabled={disabled}
        onChange={(e) => {
          const opt = options.find((o) => String(o.value) === e.target.value);
          if (opt) onChange(opt.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function SegField<T extends string | number>({
  label,
  info,
  value,
  options,
  onChange,
}: {
  label: string;
  info?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <Field label={label} info={info}>
      <div className={s.seg} role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={String(o.value)}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

export function CheckField({
  label,
  info,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  info?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={s.field}>
      <div className={s.check}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <label htmlFor={id}>{label}</label>
        {info && <InfoIcon text={info} label={label} />}
      </div>
    </div>
  );
}

export function Accordion({ title, open, children }: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className={s.acc} open={open}>
      <summary>{title}</summary>
      <div className={s.accBody}>{children}</div>
    </details>
  );
}
