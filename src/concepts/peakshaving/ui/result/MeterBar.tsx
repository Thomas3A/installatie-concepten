// Meterbalk (UX-plan §4.3): piek aan de meter tegen de WP-limiet, in HTML/CSS. Neutraal blauw tot min(piek, limiet),
// rood boven de limiet, groen gearceerd wat de batterij afschaaft, een zwarte streep op de limiet en een grijze
// schaduwstreep op de piek zonder maatregelen. Het model (schaal, delen, teksten) komt uit view/verdict.ts.
import type { CSSProperties } from 'react';
import type { MeterModel, MeterSpan } from '../../view/verdict';
import css from './Result.module.css';

/** Fractie (0…1) als percentage voor `left`/`width`; buiten de schaal afgekapt. */
function pct(x: number): string {
  const v = Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;
  return `${(100 * v).toFixed(3)}%`;
}

function spanStyle(s: MeterSpan): CSSProperties {
  return { left: pct(s.start), width: pct(s.end - s.start) };
}

export function MeterBar({ meter }: { meter: MeterModel }) {
  return (
    <div className={css.meter} data-testid="meter-bar">
      {/* de piek staat ook in de naam van de balk; de zichtbare regel hoeft niet dubbel voorgelezen */}
      <div className={css.meterHead} aria-hidden="true">
        {meter.peakLabel}
      </div>
      <div className={css.track} role="img" aria-label={meter.ariaLabel}>
        <div className={css.fill}>
          <span className={`${css.seg} ${css.base}`} style={spanStyle(meter.base)} />
          {meter.over && <span className={`${css.seg} ${css.over}`} style={spanStyle(meter.over)} />}
          {meter.shaved && <span className={`${css.seg} ${css.shaved}`} style={spanStyle(meter.shaved)} />}
        </div>
        {meter.shadowPos !== null && (
          <span className={css.shadowMark} style={{ left: pct(meter.shadowPos) }} />
        )}
        <span className={css.budgetMark} style={{ left: pct(meter.budgetPos) }} />
      </div>
      <div className={css.meterFoot}>
        <span className={css.legend}>
          <span className={css.legendBudget} aria-hidden="true" />
          {meter.budgetLabel}
        </span>
        {meter.withoutLabel && (
          <span className={css.legend}>
            <span className={css.legendShadow} aria-hidden="true" />
            {meter.withoutLabel}
          </span>
        )}
      </div>
    </div>
  );
}
