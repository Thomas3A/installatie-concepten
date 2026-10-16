// Horizontaal scrollbare gebieden (brede tabellen, schema's, formules) bereikbaar maken met het toetsenbord.
import { useEffect, useState, type ReactNode } from 'react';

/**
 * true zolang het element breder is dan zijn kader (er valt horizontaal te scrollen).
 * Volgt maatwijzigingen van het element zelf en van zijn eerste kind (bijv. de tabel in de omhulling),
 * en kijkt opnieuw als de webfonts geladen zijn (KaTeX-formules worden dan breder of smaller).
 */
export function useOverflowX(el: HTMLElement | null): boolean {
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    if (!el) return;
    let alive = true;
    const check = (): void => {
      // ook 1 px overloop is echt scrollbaar en moet dan met het toetsenbord bereikbaar zijn
      if (alive) setOverflow(el.scrollWidth > el.clientWidth);
    };
    check();
    void document.fonts?.ready.then(check);
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', check);
      return () => {
        alive = false;
        window.removeEventListener('resize', check);
      };
    }
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      alive = false;
      ro.disconnect();
    };
  }, [el]);
  return overflow;
}

/**
 * Attributen voor een scrollcontainer: alleen als er echt iets te scrollen valt, wordt het een benoemd
 * gebied (role="region") in de tabvolgorde, zodat toetsenbordgebruikers met de pijltjestoetsen kunnen scrollen.
 */
export function scrollRegionProps(
  overflow: boolean,
  label: string,
): { role?: 'region'; tabIndex?: number; 'aria-label'?: string } {
  return overflow ? { role: 'region', tabIndex: 0, 'aria-label': label } : {};
}

/** div die horizontaal mag scrollen en dan focusbaar en benoemd is (zie scrollRegionProps). */
export function ScrollRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const overflow = useOverflowX(el);
  return (
    <div ref={setEl} className={className} {...scrollRegionProps(overflow, label)}>
      {children}
    </div>
  );
}
