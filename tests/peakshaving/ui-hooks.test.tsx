// @vitest-environment jsdom
// useInView (UX-plan §2.4, §6, B13): het element mag na de eerste render verschijnen of wisselen (de oordeelkaart die
// het skelet vervangt); de waarnemer volgt het element. Zonder element of zonder IntersectionObserver altijd "in beeld".
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInView } from '../../src/concepts/peakshaving/ui/hooks';

/** IntersectionObserver-nabootsing: houdt bij wat er wordt waargenomen en laat de test een waarneming melden. */
class FakeObserver {
  static all: FakeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;
  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    FakeObserver.all.push(this);
  }
  observe(el: Element): void {
    this.observed.push(el);
  }
  unobserve(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
  /** waarneming voor alle waargenomen elementen */
  report(isIntersecting: boolean): void {
    const entries = this.observed.map((target) => ({ target, isIntersecting }) as IntersectionObserverEntry);
    act(() => this.callback(entries, this as unknown as IntersectionObserver));
  }
}

/** Actieve waarnemer van een element. */
function observerOf(el: Element): FakeObserver {
  const o = FakeObserver.all.find((x) => !x.disconnected && x.observed.includes(el));
  if (!o) throw new Error('geen actieve waarnemer voor dit element');
  return o;
}

function Probe({ show, version = 1 }: { show: boolean; version?: number }) {
  const [ref, inView] = useInView<HTMLDivElement>({ threshold: 0.1 });
  return (
    <>
      <p data-testid="state">{inView ? 'in beeld' : 'uit beeld'}</p>
      {/* een andere key = een nieuw element (zoals een kaart die het skelet vervangt) */}
      {show && <div key={version} ref={ref} data-testid="target" />}
    </>
  );
}

const state = (): string => screen.getByTestId('state').textContent ?? '';

beforeEach(() => {
  FakeObserver.all = [];
  vi.stubGlobal('IntersectionObserver', FakeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useInView', () => {
  it('een element dat na de eerste render verschijnt, wordt toch waargenomen', () => {
    const { rerender } = render(<Probe show={false} />);
    // zonder element: in beeld, en niets om waar te nemen
    expect(state()).toBe('in beeld');
    expect(FakeObserver.all).toHaveLength(0);

    rerender(<Probe show />);
    const target = screen.getByTestId('target');
    const io = observerOf(target);
    expect(io.options?.threshold).toBe(0.1);
    // tot de eerste waarneming: in beeld (niets knippert)
    expect(state()).toBe('in beeld');
    io.report(false);
    expect(state()).toBe('uit beeld');
    io.report(true);
    expect(state()).toBe('in beeld');
    io.report(false);

    // element weg: waarnemer los, weer "in beeld"
    rerender(<Probe show={false} />);
    expect(io.disconnected).toBe(true);
    expect(state()).toBe('in beeld');
  });

  it('een nieuw element krijgt een eigen waarnemer; een waarneming van het vorige telt niet', () => {
    const { rerender } = render(<Probe show version={1} />);
    const first = screen.getByTestId('target');
    const io1 = observerOf(first);
    io1.report(false);
    expect(state()).toBe('uit beeld');

    rerender(<Probe show version={2} />);
    const second = screen.getByTestId('target');
    expect(second).not.toBe(first);
    expect(io1.disconnected).toBe(true);
    const io2 = observerOf(second);
    expect(io2).not.toBe(io1);
    expect(state()).toBe('in beeld');
    io2.report(false);
    expect(state()).toBe('uit beeld');
  });

  it('zonder IntersectionObserver altijd in beeld', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<Probe show />);
    expect(screen.getByTestId('target')).toBeTruthy();
    expect(state()).toBe('in beeld');
  });
});
