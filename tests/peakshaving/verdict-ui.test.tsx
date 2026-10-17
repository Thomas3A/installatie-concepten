// @vitest-environment jsdom
// Resultaat (UX-plan §4, §10 WP-D): de oordeelkaart met kop en detailzin van §4.5 letterlijk, knoppen (met plaatshouder
// zolang het raster rekent, ongedaan maken en de focus op de hendel), meterbalk, tegels en gevolgregels; één statusregel;
// wisselen van modus verandert kop en tegels niet; "Opnieuw proberen" alleen bij een fout; het skelet met vaste hoogte;
// de vaste balk onderaan; ResultMore (advies alleen op papier, Opvallend, Alle kerngetallen, Robuustheid).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sensitivityKey, type Analysis } from '../../src/concepts/peakshaving/model/analysis';
import { createEngine } from '../../src/concepts/peakshaving/model/engine';
import { normalizeInput, rangesOf } from '../../src/concepts/peakshaving/model/input';
import type { Message } from '../../src/concepts/peakshaving/model/messages';
import type { SensitivityRow } from '../../src/concepts/peakshaving/model/sizing';
import type { PeakshavingInput } from '../../src/concepts/peakshaving/model/types';
import { findScenario } from '../../src/concepts/peakshaving/scenarios';
import { configureEngine, useStore } from '../../src/concepts/peakshaving/store';
import { ROBUSTNESS_NOTE, type MessageCode } from '../../src/concepts/peakshaving/texts';
import { MiniVerdictBar } from '../../src/concepts/peakshaving/ui/result/MiniVerdictBar';
import { ResultMore } from '../../src/concepts/peakshaving/ui/result/ResultMore';
import { VerdictCard } from '../../src/concepts/peakshaving/ui/result/VerdictCard';
import { openRobustness } from '../../src/concepts/peakshaving/ui/results/RobustnessTable';
import type { SensitivityState } from '../../src/concepts/peakshaving/view/sensitivityFacts';

const engine = createEngine();
const st = () => useStore.getState();

async function analyzeInput(input: PeakshavingInput): Promise<Analysis> {
  let a: Analysis | null = null;
  let err: string | null = null;
  await engine.handle({ type: 'analyze', id: 1, input }, (m) => {
    if (m.type === 'analysis') a = m.analysis;
    if (m.type === 'error') err = m.message;
  });
  if (!a) throw new Error(`geen doorrekening: ${err}`);
  return a;
}

async function gridOf(input: PeakshavingInput): Promise<SensitivityState> {
  const rows: (SensitivityRow | null)[] = [];
  let total = 0;
  const key = sensitivityKey(input);
  await engine.handle({ type: 'sensitivity', id: 2, key, input }, (m) => {
    if (m.type === 'sensitivity-row') {
      rows[m.index] = m.row;
      total = m.total;
    }
  });
  return { key, rows, total, done: true };
}

function scenarioInput(id: string, patch?: (i: PeakshavingInput) => void): PeakshavingInput {
  const i = findScenario(id)!.build();
  patch?.(i);
  return normalizeInput(i);
}

interface Case {
  input: PeakshavingInput;
  a: Analysis;
  sens: SensitivityState | null;
}

const cases: Record<string, Case> = {};

async function caseOf(input: PeakshavingInput, withGrid: boolean): Promise<Case> {
  const [a, sens] = await Promise.all([analyzeInput(input), withGrid ? gridOf(input) : null]);
  return { input, a, sens };
}

beforeAll(async () => {
  const limited = (i: PeakshavingInput): void => {
    i.grid.mode = 'limited';
  };
  const on1x25 = (i: PeakshavingInput): void => {
    i.grid.connection = '1x25';
  };
  const specs: Record<string, [PeakshavingInput, boolean]> = {
    basis: [scenarioInput('woning-basis'), true],
    basisLimited: [scenarioInput('woning-basis', limited), false],
    buffer: [scenarioInput('woning-buffer'), true],
    both: [scenarioInput('woning-buffer-batterij'), false],
    both25: [scenarioInput('woning-buffer-batterij', on1x25), false],
    both25Limited: [
      scenarioInput('woning-buffer-batterij', (i) => {
        on1x25(i);
        limited(i);
      }),
      false,
    ],
    office: [scenarioInput('kantoor-basis'), true],
  };
  for (const [k, [input, grid]] of Object.entries(specs)) cases[k] = await caseOf(input, grid);
}, 240000);

/** Een doorrekening (en raster) in de store zetten, zoals de rekenmotor dat doet. */
function show(c: Case, extra: Partial<ReturnType<typeof st>> = {}): void {
  act(() =>
    useStore.setState({
      input: c.input,
      ranges: rangesOf(c.input),
      analysis: c.a,
      sensitivity: c.sens,
      busy: false,
      error: null,
      ...extra,
    }),
  );
}

const card = (): HTMLElement => document.querySelector<HTMLElement>('[data-tour="verdict"]')!;
const fixGroup = (name: string): HTMLElement => screen.getByRole('group', { name });
const buttonNames = (root: HTMLElement): string[] =>
  within(root)
    .queryAllByRole('button')
    .map((b) => b.textContent ?? '');
const tile = (title: string): HTMLElement =>
  within(screen.getByRole('group', { name: 'Antwoord' }))
    .getByText(title)
    .closest<HTMLElement>('[data-tile]')!;
/** Tekst van een tegel: titel, waarde (met eenheid), regel en verwijzing, gescheiden door " | ". */
function tileText(title: string): string {
  return Array.from(tile(title).children)
    .filter((el) => el.tagName !== 'BUTTON')
    .map((el) => el.textContent)
    .join(' | ');
}
const cssText = readFileSync(
  resolve(process.cwd(), 'src/concepts/peakshaving/ui/result/Result.module.css'),
  'utf8',
);
const initialRetry = useStore.getState().retry;

beforeEach(() => {
  localStorage.clear();
  configureEngine({ mainThread: true });
  useStore.setState({
    scenarioId: null,
    tab: 'concept',
    analysis: null,
    sensitivity: null,
    busy: false,
    error: null,
    printing: false,
    ownInput: null,
    undo: null,
    notice: null,
    reveal: null,
    basisOpen: false,
    autoSensitivity: false,
    retry: initialRetry,
  });
});

afterEach(() => {
  // lopende doorrekeningen (na een knop) negeren, daarna pas opruimen
  configureEngine({ mainThread: true });
  cleanup();
  vi.restoreAllMocks();
  document.body.classList.remove('ps-mini-verdict');
});

describe('Resultaat: opbouw', () => {
  it('H2 "Resultaat" (id ps-resultaat, tabIndex -1, stapnummer aria-hidden) in een kaart zonder eigen regio', () => {
    show(cases.basis);
    render(<VerdictCard />);
    const h2 = screen.getByRole('heading', { level: 2, name: 'Resultaat' });
    expect(h2.id).toBe('ps-resultaat');
    expect(h2.getAttribute('tabindex')).toBe('-1');
    expect(h2.textContent).toBe('2Resultaat');
    expect(h2.querySelector('[aria-hidden="true"]')?.textContent).toBe('2');
    expect(card().contains(h2)).toBe(true);
    expect(card().tagName).toBe('DIV');
    expect(within(card()).queryAllByRole('region')).toHaveLength(0);
    // kleur alleen op de kaart: de toon als attribuut (linkerrand en icoon)
    expect(card().getAttribute('data-tone')).toBe('err');
  });

  it('skelet met vaste hoogte vóór de eerste doorrekening; daarna het oordeel', () => {
    act(() => useStore.setState({ analysis: null, busy: true }));
    render(<VerdictCard />);
    const skeleton = screen.getByTestId('verdict-skeleton');
    expect(skeleton.getAttribute('aria-hidden')).toBe('true');
    expect(cssText).toMatch(/\.skeleton\s*\{[^}]*min-height:\s*340px;/);
    expect(screen.getByText('Rekent…')).toBeTruthy();
    // statusregel staat er al (leeg), zodat het eerste oordeel wordt voorgelezen
    expect(within(card()).getByRole('status').textContent).toBe('');
    expect(screen.queryByRole('button', { name: 'Opnieuw proberen' })).toBeNull();
    show(cases.basis);
    expect(screen.queryByTestId('verdict-skeleton')).toBeNull();
    expect(screen.queryByText('Rekent…')).toBeNull();
    expect(screen.getByText('Past niet op 1×35 A')).toBeTruthy();
  });

  it('één statusregel met het oordeel; die wordt alleen bijgewerkt als de tekst verandert', () => {
    show(cases.basis);
    render(
      <>
        <VerdictCard />
        <ResultMore />
        <MiniVerdictBar />
      </>,
    );
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(1);
    const live = statuses[0];
    expect(card().contains(live)).toBe(true);
    expect(live.className).toBe('sr-only');
    expect(live.textContent).toBe('Past niet op 1×35 A: 101 uur per jaar boven het budget.');
    const text = live.firstChild;
    // rekenen (zelfde doorrekening): dezelfde tekstknoop, niets nieuws voor te lezen
    act(() => useStore.setState({ busy: true }));
    expect(live.firstChild).toBe(text);
    show(cases.buffer);
    expect(screen.getByRole('status')).toBe(live);
    expect(live.textContent).toBe('Past op 1×35 A met 0,50 m³ buffer: 0 uur per jaar boven het budget.');
    // het advies op papier heeft geen aria-live meer
    expect(document.querySelectorAll('[aria-live]')).toHaveLength(0);
  });
});

describe('Resultaat: geverifieerde uitkomsten (§4.5) letterlijk', () => {
  it('woning-basis: ✕ past niet, vier knoppen "Wat helpt", meterbalk, tegels en gevolgregels', () => {
    show(cases.basis);
    render(<VerdictCard />);
    expect(screen.getByText('Past niet op 1×35 A').tagName).toBe('P');
    expect(
      screen.getByText('101 uur per jaar boven het WP-budget van 3,22 kW, tot 0,26 kW (8 %) erboven.'),
    ).toBeTruthy();
    const icon = document.querySelector('#ps-oordeel-kop [aria-hidden="true"]')!;
    expect(icon.textContent).toBe('✕');
    // knoppen
    const fixes = fixGroup('Wat helpt');
    expect(fixes.textContent).toMatch(/^Wat helpt:/);
    expect(buttonNames(fixes)).toEqual([
      '0,20 m³ buffer',
      '1,0 kWh batterij',
      '1×40 A',
      'of 44 % voor de warmtepomp',
    ]);
    expect(fixes.classList.contains('noPrint')).toBe(true);
    // meterbalk
    const meter = screen.getByRole('img', {
      name: 'Piek aan de meter 3,48 kW tegen een budget van 3,22 kW',
    });
    expect(meter.closest('[data-testid="meter-bar"]')?.textContent).toBe(
      'Piek aan de meter 3,48 kW' + 'budget 3,22 kW = 40 % van 1×35 A (8,05 kW)',
    );
    expect(meter.querySelector('[class*="over"]')).not.toBeNull();
    expect(meter.querySelector('[class*="shaved"]')).toBeNull();
    expect(meter.querySelector('[class*="shadowMark"]')).toBeNull();
    // tegels
    expect(tileText('Warmtepomp')).toBe('Warmtepomp | 10,6kW | A7/W35 · 7,4 kW bij −10 °C');
    expect(tileText('Boven budget')).toBe('Boven budget | 101uur/jaar | 12 kWh/jaar · max. 0,26 kW');
    expect(tileText('Kleinste aansluiting')).toBe(
      'Kleinste aansluiting | 1×40 A | 1 stap groter dan de huidige 1×35 A',
    );
    expect(within(tile('Warmtepomp')).getByRole('button', { name: 'eigen vermogen kiezen' })).toBeTruthy();
    // gevolgregels
    const limiter = screen.getByTestId('limiter-line');
    expect(limiter.getAttribute('data-tone')).toBe('neutral');
    expect(limiter.textContent).toBe('Met begrenzer: geen uur te koud (laagste 19,5 °C).toon in grafieken');
    expect(screen.getByTestId('stress-line').textContent).toBe(
      'Strenge winter (T1): 111 uur boven budget, 40 uur te koud.Robuustheid▸',
    );
    expect(screen.getByRole('button', { name: 'Robuustheid' })).toBeTruthy();
  });

  it('+ 0,5 m³ (voorbeeld 2): ✓ past; "Kleinere aansluiting volstaat ook" uit het raster; verwijzingen', () => {
    show(cases.buffer);
    render(<VerdictCard />);
    expect(card().getAttribute('data-tone')).toBe('ok');
    expect(screen.getByText('Past op 1×35 A met 0,50 m³ buffer')).toBeTruthy();
    expect(
      screen.getByText('Piek aan de meter 3,18 kW, 0,04 kW (1 %) onder het budget van 3,22 kW.'),
    ).toBeTruthy();
    expect(buttonNames(fixGroup('Kleinere aansluiting volstaat ook'))).toEqual([
      'Probeer 1×25 A met 0,60 m³ buffer en 7,5 kWh batterij',
    ]);
    expect(screen.queryByRole('group', { name: 'Wat helpt' })).toBeNull();
    expect(tileText('Warmtepomp')).toMatch(
      /^Warmtepomp \| 9,4kW \| A7\/W35 · \d+,\d kW bij −10 °C \| zonder maatregelen 10,6 kW \(−1,1\)$/,
    );
    expect(tileText('Boven budget')).toBe(
      'Boven budget | 0uur/jaar | geen enkel uur | zonder maatregelen 101 uur',
    );
    expect(tileText('Kleinste aansluiting')).toBe(
      'Kleinste aansluiting | 1×35 A | gelijk aan de huidige aansluiting | zonder maatregelen 1×40 A',
    );
    // meterbalk: schaduwstreep en label "zonder maatregelen"
    const meter = screen.getByRole('img', { name: /^Piek aan de meter 3,18 kW/ });
    expect(meter.querySelector('[class*="shadowMark"]')).not.toBeNull();
    expect(screen.getByText('zonder maatregelen 3,48 kW')).toBeTruthy();
    expect(screen.getByTestId('stress-line').textContent).toMatch(
      /^Strenge winter \(T1\): 0 uur boven budget, 48 uur te koud\./,
    );
  });

  it('voorbeeld 3: [Probeer 1×25 A]; op 1×25 A schaaft de batterij af en is het met begrenzer te koud (warn)', () => {
    show(cases.both);
    render(<VerdictCard />);
    expect(screen.getByText('Past op 1×35 A met 1,00 m³ buffer en 5,0 kWh batterij')).toBeTruthy();
    expect(
      screen.getByText('Piek aan de meter 2,95 kW, 0,27 kW (8 %) onder het budget van 3,22 kW.'),
    ).toBeTruthy();
    expect(buttonNames(fixGroup('Kleinere aansluiting volstaat ook'))).toEqual(['Probeer 1×25 A']);

    show(cases.both25);
    expect(screen.getByText('Past op 1×25 A met 1,00 m³ buffer en 5,0 kWh batterij')).toBeTruthy();
    expect(
      screen.getByText('Piek aan de meter 2,30 kW = budget; de batterij schaaft 0,62 kW af.'),
    ).toBeTruthy();
    expect(screen.queryByRole('group', { name: /Wat helpt|Kleinere aansluiting/ })).toBeNull();
    const limiter = screen.getByTestId('limiter-line');
    expect(limiter.getAttribute('data-tone')).toBe('warn');
    expect(limiter.textContent).toBe('!Met begrenzer: 11 uur te koud (laagste 18,7 °C).toon in grafieken');
    expect(limiter.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
    // meterbalk: gearceerd wat de batterij afschaaft
    const meter = screen.getByRole('img', { name: /^Piek aan de meter 2,30 kW/ });
    expect(meter.querySelector('[class*="shaved"]')).not.toBeNull();
    // de piek ligt op het budget (hoogstens een afrondingsverschil erboven): geen zichtbaar rood deel
    const over = meter.querySelector<HTMLElement>('[class*="over"]');
    expect(over === null || parseFloat(over.style.width) < 0.5).toBe(true);
  });

  it('kantoor-basis: past niet op 3×80 A; vier knoppen, grootverbruik; met begrenzer te koud', () => {
    show(cases.office);
    render(<VerdictCard />);
    expect(screen.getByText('Past niet op 3×80 A')).toBeTruthy();
    expect(
      screen.getByText('327 uur per jaar boven het WP-budget van 27,7 kW, tot 18,6 kW (67 %) erboven.'),
    ).toBeTruthy();
    expect(buttonNames(fixGroup('Wat helpt'))).toEqual([
      '20,00 m³ buffer',
      '200,0 kWh batterij',
      'Grootverbruik 95 kW',
      'of 84 % voor de warmtepomp',
    ]);
    expect(screen.getByTestId('limiter-line').textContent).toMatch(
      /^!Met begrenzer: 115 uur te koud \(laagste 15,2 °C\)\./,
    );
    expect(screen.getByTestId('stress-line').textContent).toMatch(
      /^Strenge winter \(T1\): 424 uur boven budget, 157 uur te koud\./,
    );
    expect(screen.getByText('budget 27,7 kW = 50 % van 3×80 A (55,4 kW)')).toBeTruthy();
  });
});

describe('Resultaat: knoppen', () => {
  it('zolang het raster rekent: een plaatshouder (geen knop) op de plek van de bufferknop', () => {
    const c = cases.basis;
    show(c, { sensitivity: { key: sensitivityKey(c.input), rows: [], total: 0, done: false } });
    render(<VerdictCard />);
    const fixes = fixGroup('Wat helpt');
    const pending = fixes.querySelector('[data-pending]')!;
    expect(pending.tagName).toBe('SPAN');
    expect(pending.textContent).toBe('wordt berekend…');
    // eerste plek, daarna de knoppen die niet op het raster steunen
    expect(fixes.children[1]).toBe(pending);
    expect(buttonNames(fixes)).toEqual(['1,0 kWh batterij', '1×40 A', 'of 44 % voor de warmtepomp']);
    // raster klaar: de knop verschijnt op dezelfde plek
    show(c);
    expect(buttonNames(fixGroup('Wat helpt'))[0]).toBe('0,20 m³ buffer');
  });

  it('een knop zet de invoer met ongedaan maken en geeft de focus aan de hendel in Wat als? (Basis blijft dicht)', () => {
    const c = cases.basis;
    show(c);
    render(<VerdictCard />);
    fireEvent.click(screen.getByRole('button', { name: '0,20 m³ buffer' }));
    expect(st().input.buffer.volumeM3).toBe(0.2);
    expect(st().undo?.input).toBe(c.input);
    expect(st().notice).toEqual({ kind: 'fix', text: 'Buffer op 0,20 m³' });
    expect(st().reveal?.target).toBe('buffer');
    expect(st().basisOpen).toBe(false);

    show(c, { undo: null, notice: null });
    fireEvent.click(screen.getByRole('button', { name: '1,0 kWh batterij' }));
    expect(st().input.battery).toEqual({ capacityKwh: 1, powerKw: null });
    expect(st().reveal?.target).toBe('battery');

    show(c, { undo: null, notice: null });
    fireEvent.click(screen.getByRole('button', { name: '1×40 A' }));
    expect(st().input.grid.connection).toBe('1x40');
    expect(st().notice?.text).toBe('Aansluiting 1×40 A');
    expect(st().reveal?.target).toBe('connectionStepper');

    show(c, { undo: null, notice: null });
    fireEvent.click(screen.getByRole('button', { name: 'of 44 % voor de warmtepomp' }));
    expect(st().input.grid.heatPumpShare).toBeCloseTo(0.44, 9);
    expect(st().reveal?.target).toBe('connectionStepper');
    expect(st().basisOpen).toBe(false);
  });

  it('"eigen vermogen kiezen" vraagt om het veld WP-vermogen in Verfijnen', () => {
    show(cases.basis);
    render(<VerdictCard />);
    fireEvent.click(screen.getByRole('button', { name: 'eigen vermogen kiezen' }));
    expect(st().reveal?.target).toBe('sizing');
    expect(st().basisOpen).toBe(false);
  });
});

describe('Resultaat: rekenen en fouten', () => {
  it('"Opnieuw proberen" alleen bij een fout (en niet terwijl er gerekend wordt); waarden "Verouderd"', () => {
    const retry = vi.fn();
    show(cases.basis, { retry });
    render(<VerdictCard />);
    expect(screen.queryByRole('button', { name: 'Opnieuw proberen' })).toBeNull();
    act(() => useStore.setState({ busy: true }));
    expect(screen.queryByRole('button', { name: 'Opnieuw proberen' })).toBeNull();

    act(() => useStore.setState({ busy: false, error: 'werkelijke klimaatjaren niet geladen (proef)' }));
    const msg = screen.getByText('Rekenfout: werkelijke klimaatjaren niet geladen (proef)');
    expect(msg.getAttribute('role')).toBe('alert');
    expect(card().contains(msg)).toBe(true);
    expect(screen.getAllByRole('button', { name: 'Opnieuw proberen' })).toHaveLength(1);
    expect(screen.getByText('Verouderd')).toBeTruthy();
    expect(card().querySelector('[data-dim]')?.getAttribute('data-dim')).toBe('stale');
    fireEvent.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));
    expect(retry).toHaveBeenCalledTimes(1);

    // opnieuw aan het rekenen: geen knop, wel de fout tot de uitkomst er is
    act(() => useStore.setState({ busy: true }));
    expect(screen.queryByRole('button', { name: 'Opnieuw proberen' })).toBeNull();
    act(() => useStore.setState({ busy: false, error: null }));
    expect(screen.queryByText(/Rekenfout/)).toBeNull();
    expect(screen.queryByText('Verouderd')).toBeNull();
    expect(card().querySelector('[data-dim]')).toBeNull();
  });

  it('een rekenfout vóór de eerste doorrekening: skelet met de fout en de knop', () => {
    act(() => useStore.setState({ analysis: null, busy: false, error: 'rekenmotor niet geladen (proef)' }));
    render(<VerdictCard />);
    expect(screen.getByTestId('verdict-skeleton')).toBeTruthy();
    expect(screen.getByText('Rekenfout: rekenmotor niet geladen (proef)')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Opnieuw proberen' })).toHaveLength(1);
    expect(screen.queryByText('Verouderd')).toBeNull();
  });

  it('tijdens het rekenen: "Rekent…" naast de H2, voortgangsbalk, waarden na 150 ms gedimd', () => {
    show(cases.basis, { busy: true });
    render(<VerdictCard />);
    const title = screen.getByRole('heading', { level: 2 }).parentElement!;
    expect(within(title).getByText('Rekent…')).toBeTruthy();
    expect(card().querySelector('[class*="progress"]')?.getAttribute('aria-hidden')).toBe('true');
    expect(card().querySelector('[data-dim]')?.getAttribute('data-dim')).toBe('busy');
    expect(cssText).toMatch(/\.values\[data-dim\]\s*\{[^}]*opacity:\s*0\.55;[^}]*transition:[^;}]*150ms/);
    // de oude waarden blijven staan
    expect(screen.getByText('Past niet op 1×35 A')).toBeTruthy();
  });
});

describe('Resultaat: modus', () => {
  it('wisselen van modus verandert kop en tegels niet (woning-basis en voorbeeld 3 op 1×25 A)', () => {
    render(<VerdictCard />);
    const snapshot = (): string[] => [
      card().querySelector('#ps-oordeel-kop p')!.textContent!,
      ...['Warmtepomp', 'Boven budget', 'Kleinste aansluiting'].map(tileText),
      screen.getByRole('img').getAttribute('aria-label')!,
      screen.getByTestId('limiter-line').textContent!,
      screen.getByTestId('stress-line').textContent!,
    ];
    for (const [ex, lim] of [
      [cases.basis, cases.basisLimited],
      [cases.both25, cases.both25Limited],
    ]) {
      show(ex);
      const before = snapshot();
      show(lim);
      expect(lim.a.main.mode).toBe('limited');
      expect(snapshot()).toEqual(before);
    }
  });
});

describe('Resultaat: gevolgregels', () => {
  it('"toon in grafieken": modus met begrenzer, tabblad Koude week, scrollen naar Verdieping', () => {
    show(cases.basis);
    render(
      <>
        <VerdictCard />
        <section id="ps-verdieping">
          <button type="button" id="ps-tab-koude-week">
            Koude week
          </button>
        </section>
      </>,
    );
    const depth = document.getElementById('ps-verdieping')!;
    const scroll = vi.fn();
    depth.scrollIntoView = scroll;
    fireEvent.click(screen.getByRole('button', { name: 'toon in grafieken' }));
    expect(st().input.grid.mode).toBe('limited');
    expect(st().tab).toBe('koude-week');
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.id).toBe('ps-tab-koude-week');
  });

  it('"Robuustheid ▸" klapt de robuustheidstabel open, scrolt erheen en zet de focus op de titel', () => {
    show(cases.basis);
    render(
      <>
        <VerdictCard />
        <ResultMore />
      </>,
    );
    const details = screen.getByText(/^Robuustheid: zelfde configuratie/).closest('details')!;
    expect(details.open).toBe(false);
    const scroll = vi.fn();
    details.scrollIntoView = scroll;
    fireEvent.click(screen.getByRole('button', { name: 'Robuustheid' }));
    expect(details.open).toBe(true);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(details.querySelector('summary'));
    // ook rechtstreeks (zonder tabel gebeurt er niets)
    details.open = false;
    act(() => openRobustness());
    expect(details.open).toBe(true);
  });

  it('T1 gekozen: "Dit is al de stresstest (T1)."', async () => {
    const input = scenarioInput('woning-basis', (i) => {
      i.climateYear = 'T1';
    });
    show({ input, a: await analyzeInput(input), sens: null });
    render(<VerdictCard />);
    expect(screen.getByTestId('stress-line').textContent).toBe('Dit is al de stresstest (T1).Robuustheid▸');
  });
});

describe('ResultMore', () => {
  function msg(code: MessageCode): Message {
    return { code, severity: 'info', title: `Titel ${code}`, summary: 'kort', why: [], solutions: [] };
  }

  it('volgorde: advies (alleen op papier, zonder aria-live), Opvallend, Alle kerngetallen, Robuustheid', () => {
    show(cases.basis);
    const { container } = render(<ResultMore />);
    const advice = screen.getByLabelText('Advies');
    expect(advice.className).toMatch(/printOnly/);
    expect(advice.hasAttribute('aria-live')).toBe(false);
    expect(advice.textContent).toMatch(/warmtepomp/);
    const noteworthy = screen.getByRole('group', { name: 'Opvallend' });
    expect(noteworthy.classList.contains('noPrint')).toBe(true);
    const kpis = screen.getByText('Alle kerngetallen (8) · zonder begrenzer');
    expect(kpis.tagName).toBe('SUMMARY');
    const robust = screen.getByText(/^Robuustheid: zelfde configuratie/);
    const order = [advice, noteworthy, kpis, robust];
    for (let i = 1; i < order.length; i++)
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // geen regio's behalve het advies (printOnly) en de ongewijzigde kerngetallen in het ingeklapte blok
    expect(container.querySelectorAll('details[data-print-open]')).toHaveLength(2);
    for (const d of container.querySelectorAll('details')) expect(d.open).toBe(false);
  });

  it('"Alle kerngetallen (8)": de acht ongewijzigde kaarten, met de modus van de doorrekening in de titel', () => {
    show(cases.basis);
    render(<ResultMore />);
    const details = screen.getByText('Alle kerngetallen (8) · zonder begrenzer').closest('details')!;
    const region = within(details).getByLabelText('Kerngetallen');
    expect(region.querySelectorAll('article')).toHaveLength(8);
    expect(within(region).getByText('Kleinste passende aansluiting')).toBeTruthy();
    show(cases.basisLimited);
    expect(screen.getByText('Alle kerngetallen (8) · met begrenzer')).toBeTruthy();
  });

  it('"Opvallend": alleen de meldingen die niet bij een hendel of het oordeel horen; anders "Geen bijzonderheden."', () => {
    const all: MessageCode[] = [
      'sizingFailed',
      'backupPeak',
      'comfortLoss',
      'batteryEmpty',
      'batteryPower',
      'smallBufferDeltaT',
      'bufferPlateau',
      'coldSpell',
      'dhwPeak',
      'preheatPeak',
    ];
    show({ ...cases.basis, a: { ...cases.basis.a, messages: all.map(msg) } });
    render(<ResultMore />);
    const group = screen.getByRole('group', { name: 'Opvallend' });
    const titles = Array.from(group.querySelectorAll('strong')).map((s) => s.textContent);
    expect(titles).toEqual([
      'Titel backupPeak',
      'Titel comfortLoss',
      'Titel coldSpell',
      'Titel dhwPeak',
      'Titel preheatPeak',
    ]);
    show({ ...cases.basis, a: { ...cases.basis.a, messages: [msg('bufferPlateau')] } });
    expect(within(group).getByText('Geen bijzonderheden.')).toBeTruthy();
  });

  it('robuustheidstabel: titel ongewijzigd, ingekorte toelichting', () => {
    show(cases.basis);
    render(<ResultMore />);
    const details = screen
      .getByText('Robuustheid: zelfde configuratie in andere klimaatjaren')
      .closest('details')!;
    expect(details.hasAttribute('data-print-open')).toBe(true);
    expect(ROBUSTNESS_NOTE(cases.basis.a.nominalKw)).toBe(
      'Zelfde warmtepomp (10,6 kW), ander weer. Overschrijding: zonder begrenzer; comfortverlies: als de aansluiting begrenst.',
    );
    expect(within(details).getByText(ROBUSTNESS_NOTE(cases.basis.a.nominalKw))).toBeTruthy();
  });

  it('zonder doorrekening: niets', () => {
    const { container } = render(<ResultMore />);
    expect(container.textContent).toBe('');
  });
});

describe('Mini-oordeel (vaste balk onderaan)', () => {
  type Callback = (entries: Partial<IntersectionObserverEntry>[]) => void;
  let observers: { cb: Callback; options: IntersectionObserverInit; targets: Element[] }[] = [];

  beforeEach(() => {
    observers = [];
    class FakeIO {
      private rec: { cb: Callback; options: IntersectionObserverInit; targets: Element[] };
      constructor(cb: Callback, options: IntersectionObserverInit = {}) {
        this.rec = { cb, options, targets: [] };
        observers.push(this.rec);
      }
      observe(el: Element): void {
        this.rec.targets.push(el);
      }
      unobserve(): void {}
      disconnect(): void {
        this.rec.targets = [];
      }
    }
    vi.stubGlobal('IntersectionObserver', FakeIO);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** De kop van het oordeel in of uit beeld melden. */
  function headInView(inView: boolean): void {
    const head = document.getElementById('ps-oordeel-kop')!;
    act(() => {
      for (const o of observers)
        if (o.targets.includes(head)) o.cb([{ isIntersecting: inView, target: head }]);
    });
  }

  it('alleen zichtbaar als de kop van het oordeel uit beeld is; knop terug naar H2 "Resultaat"', () => {
    show(cases.basis);
    render(
      <>
        <VerdictCard />
        <MiniVerdictBar />
      </>,
    );
    // nog geen waarneming: geen balk
    expect(screen.queryByTestId('mini-verdict')).toBeNull();
    const head = document.getElementById('ps-oordeel-kop')!;
    const watching = observers.filter((o) => o.targets.includes(head));
    expect(watching).toHaveLength(1);
    // de strook onder de balk telt als uit beeld
    expect(watching[0].options.rootMargin).toBe('0px 0px -52px 0px');

    // kop boven het scherm: balk met pijl omhoog
    vi.spyOn(head, 'getBoundingClientRect').mockReturnValue({ top: -300, bottom: -200 } as DOMRect);
    headInView(false);
    const bar = screen.getByTestId('mini-verdict');
    expect(bar.classList.contains('noPrint')).toBe(true);
    expect(bar.getAttribute('data-tone')).toBe('err');
    expect(within(bar).queryByRole('status')).toBeNull();
    const button = within(bar).getByRole('button', {
      name: 'Past niet · 101 uur · WP 10,6 kW. Naar resultaat',
    });
    expect(button.textContent).toBe('✕Past niet · 101 uur · WP 10,6 kW↑');
    expect(document.body.classList.contains('ps-mini-verdict')).toBe(true);

    const h2 = screen.getByRole('heading', { level: 2, name: 'Resultaat' });
    const scroll = vi.fn();
    h2.scrollIntoView = scroll;
    fireEvent.click(button);
    expect(scroll).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(h2);

    // weer in beeld: geen balk, geen ruimte onderaan
    headInView(true);
    expect(screen.queryByTestId('mini-verdict')).toBeNull();
    expect(document.body.classList.contains('ps-mini-verdict')).toBe(false);
  });

  it('kop onder het scherm (Basis open): pijl omlaag; tekst volgt de doorrekening', () => {
    show(cases.basis);
    render(
      <>
        <VerdictCard />
        <MiniVerdictBar />
      </>,
    );
    const head = document.getElementById('ps-oordeel-kop')!;
    vi.spyOn(head, 'getBoundingClientRect').mockReturnValue({ top: 1200, bottom: 1260 } as DOMRect);
    headInView(false);
    expect(screen.getByTestId('mini-verdict').textContent).toBe('✕Past niet · 101 uur · WP 10,6 kW↓');
    show(cases.buffer);
    expect(screen.getByTestId('mini-verdict').textContent).toBe('✓Past · 0 uur · WP 9,4 kW↓');
    expect(screen.getByTestId('mini-verdict').getAttribute('data-tone')).toBe('ok');
  });

  it('zonder doorrekening geen balk; vaste positie met de veilige zone van iOS', () => {
    render(
      <>
        <VerdictCard />
        <MiniVerdictBar />
      </>,
    );
    expect(screen.queryByTestId('mini-verdict')).toBeNull();
    expect(cssText).toMatch(/\.miniBar\s*\{[^}]*position:\s*fixed;[^}]*bottom:\s*0;/);
    expect(cssText).toMatch(/\.miniBar\s*\{[^}]*env\(safe-area-inset-bottom/);
    expect(cssText).toMatch(/body\.ps-mini-verdict\)\s*\{[^}]*padding-bottom:/);
  });
});
