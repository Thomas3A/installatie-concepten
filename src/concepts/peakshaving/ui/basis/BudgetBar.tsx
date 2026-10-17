// Budgetbalk onder "Aandeel voor warmtepomp" (UX-plan §3.1, §7 #7): de aansluiting verdeeld in het WP-budget en het
// overige gebruik, met de tekst "WP-budget 3,22 kW · overig gebruik 4,83 kW". De balk zelf is decoratief; de tekst
// beschrijft het getalveld (hint van RangeField, dus aria-describedby).
import { BASIS_TEXTS } from '../../texts';
import { kwDigitsFor } from '../../view/format';
import s from './Basis.module.css';

export function BudgetBar({ budgetKw, connectionKw }: { budgetKw: number; connectionKw: number }) {
  const valid = Number.isFinite(budgetKw) && Number.isFinite(connectionKw) && connectionKw > 0;
  const other = valid ? Math.max(0, connectionKw - budgetKw) : 0;
  // alle kW-getallen in de zin met de decimalen van het budget
  const t = BASIS_TEXTS.budgetBar(budgetKw, other, kwDigitsFor(budgetKw));
  const share = valid ? Math.min(1, Math.max(0, budgetKw / connectionKw)) : 0;
  return (
    <span className={s.budget}>
      <span className={s.budgetBar} aria-hidden="true">
        <span className={s.budgetPart} style={{ width: `${(share * 100).toFixed(2)}%` }} />
        <span className={s.otherPart} />
      </span>
      <span className={s.budgetText}>
        {t.lead}
        <strong>{t.budget}</strong>
        {t.rest}
      </span>
    </span>
  );
}
