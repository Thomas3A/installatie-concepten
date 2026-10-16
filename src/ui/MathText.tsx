import { useMemo } from 'react';
import katex from 'katex';

/** Render tekst met $...$ (inline) en $$...$$ (blok) wiskunde via KaTeX. */
export function renderMath(src: string): string {
  const esc = (t: string): string => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const parts = src.split(/(\$\$[\s\S]+?\$\$|\$[^$]+?\$)/g);
  return parts
    .map((p) => {
      if (p.startsWith('$$') && p.endsWith('$$') && p.length > 4) {
        return katex.renderToString(p.slice(2, -2), { displayMode: true, throwOnError: false });
      }
      if (p.startsWith('$') && p.endsWith('$') && p.length > 2) {
        return katex.renderToString(p.slice(1, -1), { displayMode: false, throwOnError: false });
      }
      return esc(p);
    })
    .join('');
}

export function MathText({ text, as: Tag = 'p' }: { text: string; as?: 'p' | 'span' | 'div' }) {
  const html = useMemo(() => renderMath(text), [text]);
  return <Tag dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Formula({ tex }: { tex: string }) {
  const html = useMemo(() => katex.renderToString(tex, { displayMode: true, throwOnError: false }), [tex]);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
