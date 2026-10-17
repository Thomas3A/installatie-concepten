// Drie tegels (UX-plan §4.2, role=group "Antwoord"): Warmtepomp, Boven de limiet en Kleinste aansluiting, met de
// verwijzing "zonder maatregelen …" zodra er een buffer of batterij is. Neutraal; alleen een te klein handmatig
// WP-vermogen krijgt de toon "warn". "eigen vermogen kiezen" klapt in Wat als? Verfijnen open (revealSetting('sizing')).
import u from '../../../../ui/ui.module.css';
import { useStore } from '../../store';
import { UI_LABELS } from '../../texts';
import type { Tile } from '../../view/verdict';
import { SeparatedText } from '../whatif/SeparatedText';
import css from './Result.module.css';

/** Tegelwaarde zonder getal (view/verdict.ts: WP-vermogen niet te dimensioneren). */
const NO_VALUE = '–';

/** Lengteklasse van een tekstwaarde: 'l' boven 9 tekens, 'xl' boven 18 (zie .tileValue[data-long]). */
function longValue(value: string): 'l' | 'xl' | undefined {
  if (value.length > 18) return 'xl';
  return value.length > 9 ? 'l' : undefined;
}

export function AnswerTiles({ tiles }: { tiles: readonly Tile[] }) {
  const revealSetting = useStore((st) => st.revealSetting);
  return (
    <div className={css.tiles} role="group" aria-label={UI_LABELS.answerGroup}>
      {tiles.map((t) => (
        <div key={t.id} className={css.tile} data-tone={t.tone} data-tile={t.id}>
          <div className={css.tileTitle}>{t.title}</div>
          {/* lange tekstwaarde ("Grootverbruik 95 kW") kleiner, en "Grootverbruik 115 kW" nog iets kleiner, zodat de
              tegel ook op 1280 px niet over twee regels gaat */}
          <div className={css.tileValue} data-long={longValue(t.value)}>
            {t.value}
            {/* zonder waarde ("–", niet te dimensioneren) ook geen eenheid */}
            {t.unit && t.value !== NO_VALUE && <span className={css.tileUnit}>{t.unit}</span>}
          </div>
          {/* alleen bij " · " afbreken, niet tussen een getal en zijn eenheid ("6,6 kW/woning") */}
          {t.line && (
            <div className={css.tileLine}>
              <SeparatedText text={t.line} />
            </div>
          )}
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
