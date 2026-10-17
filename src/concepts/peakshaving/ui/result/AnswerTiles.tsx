// Drie tegels (UX-plan §4.2, role=group "Antwoord"): Warmtepomp, Boven budget en Kleinste aansluiting, met de
// verwijzing "zonder maatregelen …" zodra er een buffer of batterij is. Neutraal; alleen een te klein handmatig
// WP-vermogen krijgt de toon "warn". "eigen vermogen kiezen" klapt in Wat als? Verfijnen open (revealSetting('sizing')).
import u from '../../../../ui/ui.module.css';
import { useStore } from '../../store';
import { UI_LABELS } from '../../texts';
import type { Tile } from '../../view/verdict';
import css from './Result.module.css';

export function AnswerTiles({ tiles }: { tiles: readonly Tile[] }) {
  const revealSetting = useStore((st) => st.revealSetting);
  return (
    <div className={css.tiles} role="group" aria-label={UI_LABELS.answerGroup}>
      {tiles.map((t) => (
        <div key={t.id} className={css.tile} data-tone={t.tone} data-tile={t.id}>
          <div className={css.tileTitle}>{t.title}</div>
          {/* lange tekstwaarde ("Grootverbruik 95 kW") kleiner, zodat de tegel niet over twee regels gaat */}
          <div className={css.tileValue} data-long={t.value.length > 9 || undefined}>
            {t.value}
            {t.unit && <span className={css.tileUnit}>{t.unit}</span>}
          </div>
          {t.line && <div className={css.tileLine}>{t.line}</div>}
          {t.reference && <div className={css.tileRef}>{t.reference}</div>}
          {t.refineLink && (
            <button
              type="button"
              className={`${u.btnLink} ${css.tileLink} noPrint`}
              onClick={() => revealSetting('sizing')}
            >
              {UI_LABELS.chooseOwnPower}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
