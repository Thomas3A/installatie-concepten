// Effectregel (ook de regel in een tegel van het Resultaat) met delen gescheiden door " · ": korte delen ("meterpiek
// 3,59 → 3,22 kW", "6,6 kW/woning") breken niet af, zodat een regel alleen tussen de delen naar de volgende regel gaat.
// Lange delen (een hele zin) breken gewoon af. De tekst zelf (textContent) blijft gelijk.
import { Fragment } from 'react';
import css from './WhatIf.module.css';

/** Scheiding tussen de delen van een effectregel of de stappertekst. */
export const SEPARATOR = ' · ';
/** Langere delen mogen afbreken: anders loopt een zin uit de kolom. */
const KEEP_TOGETHER_MAX_CHARS = 30;

export function SeparatedText({ text }: { text: string }) {
  return (
    <>
      {text.split(SEPARATOR).map((part, i) => (
        <Fragment key={i}>
          {i > 0 && SEPARATOR}
          {part.length <= KEEP_TOGETHER_MAX_CHARS ? <span className={css.nowrap}>{part}</span> : part}
        </Fragment>
      ))}
    </>
  );
}
