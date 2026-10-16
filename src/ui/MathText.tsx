import { useMemo } from 'react';
import katex from 'katex';

const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Lichte opmaak in gewone tekst: **vet** en *cursief* (na het escapen van HTML). */
function emphasize(html: string): string {
  return html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
}

/**
 * Render tekst met $...$ (inline) en $$...$$ (blok) wiskunde via KaTeX.
 * Met `emphasis` worden **vet** en *cursief* in de tekst buiten de formules opgemaakt.
 */
export function renderMath(src: string, emphasis = false): string {
  const parts = src.split(/(\$\$[\s\S]+?\$\$|\$[^$]+?\$)/g);
  return parts
    .map((p) => {
      if (p.startsWith('$$') && p.endsWith('$$') && p.length > 4) {
        return katex.renderToString(p.slice(2, -2), { displayMode: true, throwOnError: false });
      }
      if (p.startsWith('$') && p.endsWith('$') && p.length > 2) {
        return katex.renderToString(p.slice(1, -1), { displayMode: false, throwOnError: false });
      }
      return emphasis ? emphasize(esc(p)) : esc(p);
    })
    .join('');
}

export function MathText({
  text,
  as: Tag = 'p',
  emphasis = false,
}: {
  text: string;
  as?: 'p' | 'span' | 'div';
  emphasis?: boolean;
}) {
  const html = useMemo(() => renderMath(text, emphasis), [text, emphasis]);
  return <Tag dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Formula({ tex }: { tex: string }) {
  const html = useMemo(() => katex.renderToString(tex, { displayMode: true, throwOnError: false }), [tex]);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
