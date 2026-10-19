// @vitest-environment jsdom
// Wat als? (UX-plan §5, §10 WP-C): effectregels bij de voorbeelden 1, 2 en 3 en bij 3 op 1×25 A; Zet, Probeer en de
// stippen met ongedaan maken en de focus op de hendel; het vorige raster blijft gedimd staan; geen knop "Opnieuw
// proberen" bij een rasterfout; de stapper zonder label "Aansluitwaarde"; Verfijnen met badge; de container query.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sensitivityKey } from '../../src/concepts/peakshaving/model/analysis';
import { createEngine } from '../../src/concepts/peakshaving/model/engine';
import { normalizeInput, rangesOf } from '../../src/concepts/peakshaving/model/input';
import type { SensitivityRow } from '../../src/concepts/peakshaving/model/sizing';
import type { PeakshavingInput } from '../../src/concepts/peakshaving/model/types';
import { findScenario } from '../../src/concepts/peakshaving/scenarios';
import { sameInput } from '../../src/concepts/peakshaving/share';
import { configureEngine, useStore } from '../../src/concepts/peakshaving/store';
import { sliderX } from '../../src/concepts/peakshaving/view/miniChart';
import { BufferMiniChart } from '../../src/concepts/peakshaving/ui/whatif/BufferMiniChart';
import { WhatIfPanel } from '../../src/concepts/peakshaving/ui/whatif/WhatIfPanel';

const st = () => useStore.getState();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Wachten op een toestand van de store; de updates van de rekenmotor vallen binnen act. */
async function settle(cond: () => boolean, what: string, timeoutMs = 40000): Promise<void> {
  await act(async () => {
    const t0 = Date.now();
    while (!cond()) {
      if (Date.now() - t0 > timeoutMs) throw new Error(`time-out: ${what}`);
      await sleep(20);
    }
  });
}

const analysisDone = (): boolean => {
  const { analysis, input, busy } = st();
  return !busy && analysis !== null && sameInput(analysis.input, input);
};
const gridDone = (): boolean => {
  const s = st().sensitivity;
  return !!s && s.done && s.key === sensitivityKey(st().input);
};

// De geverifieerde uitkomsten van het UX-plan (§4.5) zijn in ontwerpjaar T5 doorgerekend; de voorbeelden rekenen
// sinds de klimaatupdate standaard in T1, dus hier expliciet T5.
function scenarioInput(id: string, patch?: (i: PeakshavingInput) => void): PeakshavingInput {
  const i = { ...findScenario(id)!.build(), climateYear: 'T5' };
  patch?.(i);
  return normalizeInput(i);
}

/** Invoer laden en wachten op de doorrekening (en het raster als dat automatisch rekent). */
async function load(input: PeakshavingInput, id: string | null = null): Promise<void> {
  act(() => st().loadInput(input, id));
  await settle(() => analysisDone() && (!st().autoSensitivity || gridDone()), 'doorrekening');
}

const panel = (): HTMLElement => document.querySelector<HTMLElement>('[data-tour="whatif"]')!;
const bufferEffect = (): string => screen.getByTestId('buffer-effect').textContent ?? '';
const batteryEffect = (): string => screen.getByTestId('battery-effect').textContent ?? '';
const stepperText = (): string => screen.getByTestId('connection-stepper-text').textContent ?? '';
const chart = (): HTMLElement => screen.getByTestId('buffer-mini-chart');
const bufferInput = (): HTMLInputElement => screen.getByLabelText('Buffervolume') as HTMLInputElement;
const batteryInput = (): HTMLInputElement => screen.getByLabelText('Batterijcapaciteit') as HTMLInputElement;

const DOT_A = '1×35 A past vanaf 0,20 m³: zet buffer';
const DOT_B = '1×25 A + 7,5 kWh past vanaf 0,60 m³: zet buffer, batterij en aansluiting';

beforeEach(() => {
  localStorage.clear();
  configureEngine({ mainThread: true });
  const input = scenarioInput('woning-basis');
  useStore.setState({
    input,
    ranges: rangesOf(input),
    scenarioId: 'woning-basis',
    tab: 'concept',
    analysis: null,
    sensitivity: null,
    printing: false,
    error: null,
    ownInput: null,
    undo: null,
    notice: null,
    autoSensitivity: false,
    reveal: null,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Wat als?: opbouw', () => {
  it('H2 "Wat als?" zonder eigen regio, de ankers voor de rondleiding en niet in de print', async () => {
    render(<WhatIfPanel />);
    const root = panel();
    expect(root.classList.contains('noPrint')).toBe(true);
    expect(within(root).getByRole('heading', { level: 2 }).textContent).toBe('3Wat als?');
    expect(within(root).getByRole('heading', { level: 2, name: 'Wat als?' })).toBeTruthy();
    expect(within(root).queryAllByRole('region')).toHaveLength(0);
    expect(root.querySelector('[data-tour="buffer"]')?.contains(bufferInput())).toBe(true);
    const bc = root.querySelector('[data-tour="battery-connection"]')!;
    expect(bc.contains(batteryInput())).toBe(true);
    expect(bc.contains(screen.getByRole('group', { name: 'Aansluiting' }))).toBe(true);
    // de mini-grafiek staat in de bufferhendel
    expect(root.querySelector('[data-tour="buffer"]')?.contains(chart())).toBe(true);
    await load(scenarioInput('woning-basis'), 'woning-basis');
  });

  it('container query: vanaf 620 px paneelbreedte buffer links, batterij en stapper rechts', () => {
    // jsdom kent geen container queries: de regel zelf controleren (de weergave is met Playwright bekeken)
    const cssText = readFileSync(
      resolve(process.cwd(), 'src/concepts/peakshaving/ui/whatif/WhatIf.module.css'),
      'utf8',
    );
    expect(cssText).toMatch(/\.panel\s*\{[^}]*container:\s*whatif\s*\/\s*inline-size/);
    const rule = /@container whatif \(min-width: 620px\)\s*\{\s*\.levers\s*\{([^}]*)\}/.exec(cssText);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/grid-template-columns:\s*minmax\(0, [\d.]+fr\) minmax\(0, 1fr\)/);
    // zonder container query één kolom
    expect(cssText).toMatch(/\.levers\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/);
  });
});

describe('Wat als?: effectregels (§5.2)', () => {
  it('voorbeeld 1 (woning, zonder maatregelen): geen buffer; kleinste batterij voor 0 uur met "Zet"', async () => {
    render(<WhatIfPanel />);
    await load(scenarioInput('woning-basis'), 'woning-basis');
    expect(bufferEffect()).toBe('Geen buffer · 24,1 kWh per m³');
    // knoptekst "Zet" (de waarde staat al in de regel), toegankelijke naam "Zet op 1,0 kWh"
    expect(batteryEffect()).toBe('Kleinste batterij voor 0 uur: 1,0 kWh' + 'Zet');
    expect(screen.getByRole('button', { name: 'Zet op 1,0 kWh' }).textContent).toBe('Zet');
    expect(stepperText()).toBe('1×35 A · 8,05 kW · limiet 3,22 kW (40 %)');
    // zonder maatregelen is er niets terug te zetten
    expect(screen.queryByRole('button', { name: 'Zonder maatregelen' })).toBeNull();
    // de effectregel beschrijft het getalveld
    const hintId = bufferInput().getAttribute('aria-describedby')!.split(' ').pop()!;
    expect(document.getElementById(hintId)?.textContent).toBe('Geen buffer · 24,1 kWh per m³');
  });

  it('voorbeeld 2 (0,5 m³ buffer): opslag en warmtepomp zonder → met; batterij niet nodig, "◀ Probeer 1×25 A"', async () => {
    render(<WhatIfPanel />);
    await load(scenarioInput('woning-buffer'), 'woning-buffer');
    expect(bufferEffect()).toBe('12,0 kWh opslag ≈ 1,5 uur piekvermogen · warmtepomp 10,6 → 9,4 kW');
    expect(batteryEffect()).toBe(
      'Niet nodig op 1×35 A. Een batterij helpt pas bij een kleinere aansluiting.' + '◀Probeer 1×25 A',
    );
    // het pijltje is aria-hidden: de knop heet "Probeer 1×25 A"
    expect(screen.getByRole('button', { name: 'Probeer 1×25 A' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Zonder maatregelen' })).toBeTruthy();
  });

  it('voorbeeld 3 (1 m³ + 5 kWh): de batterij doet nu niets; op 1×25 A schaaft hij de meterpiek af', async () => {
    render(<WhatIfPanel />);
    await load(scenarioInput('woning-buffer-batterij'), 'woning-buffer-batterij');
    // zonder raster (automatisch uit in de tests) geen regel over het plateau
    expect(bufferEffect()).toBe('24,1 kWh opslag ≈ 3,0 uur piekvermogen · warmtepomp 10,6 → 8,7 kW');
    expect(batteryEffect()).toBe(
      'Doet nu niets: de piek (2,95 kW) blijft al onder de limiet (3,22 kW). Een batterij helpt pas bij een kleinere aansluiting.' +
        '◀Probeer 1×25 A',
    );

    await load(scenarioInput('woning-buffer-batterij', (i) => void (i.grid.connection = '1x25')));
    // 5 kWh is ruim meer dan nodig: de kleinste batterij voor 0 uur, met "Zet"
    expect(batteryEffect()).toBe(
      '4,5 kWh bruikbaar · 2,5 kW · meterpiek 2,92 → 2,30 kW · 3,0 kWh is al genoegZet',
    );
    expect(
      within(screen.getByTestId('battery-effect')).getByRole('button', { name: 'Zet op 3,0 kWh' }),
    ).toBeTruthy();
    expect(stepperText()).toBe('1×25 A · 5,75 kW · limiet 2,30 kW (40 %)');
  });

  it('kantoor met tijdconstante 80 h (niet te dimensioneren): geen batterijadvies, geen "Zet" en geen 300,0 kW', async () => {
    render(<WhatIfPanel />);
    const heavy = (patch?: (i: PeakshavingInput) => void): PeakshavingInput =>
      scenarioInput('kantoor-basis', (i) => {
        i.building.timeConstantH = 80;
        patch?.(i);
      });
    await load(heavy());
    expect(st().analysis!.nominalKw).toBe(300);
    // zonder de poort: "Kleinste batterij voor 0 uur: 210,0 kWh" met "Zet", op de terugvalwaarde (3 × 100 kW)
    expect(batteryEffect()).toBe(
      'Geen advies zolang de warmtepomp niet te dimensioneren is (zie Resultaat).',
    );
    expect(within(screen.getByTestId('battery-effect')).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Zet|Probeer/ })).toBeNull();

    // met buffer en batterij: alleen de batterij zelf en geen "– → – kW" bij de buffer
    await load(
      heavy((i) => {
        i.buffer.volumeM3 = 2;
        i.battery.capacityKwh = 50;
      }),
    );
    expect(bufferEffect()).toBe('48,1 kWh opslag ≈ 0,5 uur piekvermogen · warmtepomp niet te dimensioneren');
    expect(batteryEffect()).toBe(
      '45,0 kWh bruikbaar · 25,0 kW · Geen advies zolang de warmtepomp niet te dimensioneren is (zie Resultaat).',
    );
    expect(screen.queryByRole('button', { name: /^Zet|Probeer/ })).toBeNull();
    expect(panel().textContent).not.toMatch(/300,0|voor 0 uur|meterpiek/);
    // ook de meldingen bij de batterij rekenen met de terugvalwaarde: niet tonen
    expect(st().analysis!.messages.map((m) => m.code)).toContain('batteryEmpty');
    expect(panel().textContent).not.toContain('Batterij raakt leeg');
  });

  it('tijdens het rekenen volgt het opslagdeel de schuif direct; het warmtepompdeel komt na de doorrekening', async () => {
    render(<WhatIfPanel />);
    await load(scenarioInput('woning-basis'), 'woning-basis');
    act(() => st().update((i) => ({ ...i, buffer: { ...i.buffer, volumeM3: 0.5 } })));
    // de schuif, het getalveld en het opslagdeel volgen direct (geen "Geen buffer" naast 0,50 m³); de warmtepomp pas
    // na de doorrekening
    expect(bufferInput().value).toBe('0,50');
    expect(bufferEffect()).toBe('12,0 kWh opslag ≈ 1,5 uur piekvermogen');
    await settle(analysisDone, 'doorrekening met buffer');
    expect(bufferEffect()).toBe('12,0 kWh opslag ≈ 1,5 uur piekvermogen · warmtepomp 10,6 → 9,4 kW');
    expect(screen.getByTestId('buffer-effect-sizing').className).not.toMatch(/stale/);
    // verder schuiven: het warmtepompdeel van de vorige doorrekening blijft gedimd staan
    act(() => st().update((i) => ({ ...i, buffer: { ...i.buffer, volumeM3: 1 } })));
    expect(bufferEffect()).toBe('24,1 kWh opslag ≈ 3,0 uur piekvermogen · warmtepomp 10,6 → 9,4 kW');
    expect(screen.getByTestId('buffer-effect-sizing').className).toMatch(/stale/);
    await settle(analysisDone, 'doorrekening met 1 m³');
    expect(bufferEffect()).toBe('24,1 kWh opslag ≈ 3,0 uur piekvermogen · warmtepomp 10,6 → 8,7 kW');
    expect(screen.getByTestId('buffer-effect-sizing').className).not.toMatch(/stale/);
  });
});

describe('Wat als?: knoppen met ongedaan maken', () => {
  it('"Zet op 1,0 kWh": batterij gezet, melding met ongedaan maken, focus op de batterij', async () => {
    render(<WhatIfPanel />);
    const before = scenarioInput('woning-basis');
    await load(before, 'woning-basis');
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Zet op 1,0 kWh' })));
    expect(st().input.battery).toEqual({ capacityKwh: 1, powerKw: null });
    expect(st().notice).toEqual({ kind: 'fix', text: 'Batterij op 1,0 kWh' });
    expect(st().undo?.input).toEqual(before);
    expect(document.activeElement).toBe(batteryInput());
    await settle(analysisDone, 'doorrekening met batterij');
    act(() => st().undoLast());
    expect(st().input).toEqual(before);
    expect(batteryInput().value).toBe('0,0');
  });

  it('"Zet" bij een te kleine batterij: naar de kleinste batterij voor 0 uur, met ongedaan maken', async () => {
    render(<WhatIfPanel />);
    const before = scenarioInput('woning-basis', (i) => void (i.battery.capacityKwh = 0.5));
    await load(before);
    expect(batteryEffect()).toMatch(
      /^[\d,]+ kWh bruikbaar · [\d,]+ kW · meterpiek [\d,]+ → [\d,]+ kW · voor 0 uur: 1,0 kWhZet$/,
    );
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Zet op 1,0 kWh' })));
    expect(st().input.battery).toEqual({ capacityKwh: 1, powerKw: null });
    expect(st().notice?.text).toBe('Batterij op 1,0 kWh');
    expect(document.activeElement).toBe(batteryInput());
    act(() => st().undoLast());
    expect(st().input).toEqual(before);
    await settle(analysisDone, 'doorrekening na ongedaan maken');
  });

  it('"◀ Probeer 1×25 A": kleinere aansluiting, focus op de stapper, ongedaan maken zet hem terug', async () => {
    render(<WhatIfPanel />);
    const before = scenarioInput('woning-buffer');
    await load(before, 'woning-buffer');
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Probeer 1×25 A' })));
    expect(st().input.grid.connection).toBe('1x25');
    expect(st().notice?.text).toBe('Aansluiting 1×25 A');
    expect(stepperText()).toBe('1×25 A · 5,75 kW · limiet 2,30 kW (40 %)');
    expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Aansluiting' }));
    act(() => st().undoLast());
    expect(st().input).toEqual(before);
  });

  it('"↺ Zonder maatregelen": buffer en batterij op 0, met ongedaan maken; de focus gaat naar de buffer', async () => {
    render(<WhatIfPanel />);
    const before = scenarioInput('woning-buffer-batterij');
    await load(before, 'woning-buffer-batterij');
    const reset = screen.getByRole('button', { name: 'Zonder maatregelen' });
    expect(reset.textContent).toBe('↺Zonder maatregelen');
    act(() => fireEvent.click(reset));
    expect(st().input.buffer.volumeM3).toBe(0);
    expect(st().input.battery).toEqual({ capacityKwh: 0, powerKw: null });
    expect(st().input.grid).toEqual(before.grid);
    expect(st().notice?.text).toBe('Zonder maatregelen');
    expect(screen.queryByRole('button', { name: 'Zonder maatregelen' })).toBeNull();
    expect(document.activeElement).toBe(bufferInput());
    act(() => st().undoLast());
    expect(st().input).toEqual(before);
    expect(screen.getByRole('button', { name: 'Zonder maatregelen' })).toBeTruthy();
  });
});

describe('Wat als?: aansluitingsstapper', () => {
  it('geen label "Aansluitwaarde"; ◀ en ▶ door de lijst, aan de rand uitgeschakeld met de focus op de knop', async () => {
    render(<WhatIfPanel />);
    await load(scenarioInput('woning-basis'), 'woning-basis');
    expect(screen.queryByLabelText('Aansluitwaarde')).toBeNull();
    expect(within(panel()).queryByText(/Aansluitwaarde/)).toBeNull();
    const smaller = screen.getByRole('button', { name: 'Kleinere aansluiting' });
    const larger = screen.getByRole('button', { name: 'Grotere aansluiting' });
    smaller.focus();
    act(() => fireEvent.click(smaller));
    expect(st().input.grid.connection).toBe('1x25');
    expect(smaller.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(smaller);
    act(() => fireEvent.click(smaller));
    expect(st().input.grid.connection).toBe('1x25');
    expect(larger.getAttribute('aria-disabled')).toBeNull();
    // de stapper is gewone invoer: geen ongedaan maken
    expect(st().undo).toBeNull();
    // na een stap wordt de nieuwe aansluiting voorgelezen; een wijziging in de Basis (aandeel) niet
    const live = panel().querySelector<HTMLElement>('[aria-live="polite"]')!;
    expect(live.textContent).toBe('1×25 A · 5,75 kW · limiet 2,30 kW (40 %)');
    act(() => st().update((i) => ({ ...i, grid: { ...i.grid, heatPumpShare: 0.5 } })));
    expect(stepperText()).toBe('1×25 A · 5,75 kW · limiet 2,88 kW (50 %)');
    expect(live.textContent).toBe('1×25 A · 5,75 kW · limiet 2,30 kW (40 %)');
    act(() => st().update((i) => ({ ...i, grid: { ...i.grid, heatPumpShare: 0.4 } })));

    // vanaf 3×80 A naar grootverbruik (minstens het vermogen van 3×80 A) en terug
    act(() => st().update((i) => ({ ...i, grid: { ...i.grid, connection: '3x80', contractedKw: 40 } })));
    act(() => fireEvent.click(larger));
    expect(st().input.grid.connection).toBe('grootverbruik');
    expect(st().input.grid.contractedKw).toBe(60);
    expect(stepperText()).toBe('Grootverbruik · 60 kW · limiet 24,0 kW (40 %)');
    expect(larger.getAttribute('aria-disabled')).toBe('true');
    act(() => fireEvent.click(larger));
    expect(st().input.grid.connection).toBe('grootverbruik');
    act(() => fireEvent.click(smaller));
    expect(st().input.grid.connection).toBe('3x80');
  });

  it('een knop die de aansluiting zet, geeft de stapper de focus (revealSetting)', () => {
    render(<WhatIfPanel />);
    act(() => st().revealSetting('connectionStepper'));
    expect(document.activeElement).toBe(screen.getByRole('group', { name: 'Aansluiting' }));
    // de Basis blijft zoals hij is
    expect(st().reveal?.target).toBe('connectionStepper');
  });
});

describe('Wat als?: mini-grafiek (§5.1)', () => {
  it('zonder raster: een plaatshouder van vaste hoogte, geen grafiek en geen stippen', () => {
    render(<WhatIfPanel />);
    expect(within(chart()).getByText('Grafiek wordt berekend…')).toBeTruthy();
    expect(within(chart()).queryByRole('img')).toBeNull();
    expect(within(chart()).queryAllByRole('button')).toHaveLength(0);
  });

  it('woning: knik, stippen als knoppen met ongedaan maken, klik kiest een rasterpunt, link naar Gevoeligheid', async () => {
    useStore.setState({ autoSensitivity: true });
    render(<WhatIfPanel />);
    const before = scenarioInput('woning-basis');
    await load(before, 'woning-basis');

    const img = within(chart()).getByRole('img');
    expect(img.getAttribute('aria-label')).toBe(
      'Benodigde warmtepomp per buffervolume: 10,6 kW zonder buffer, 8,7 kW vanaf 0,80 m³',
    );
    expect(chart().getAttribute('aria-busy')).toBeNull();
    expect(within(panel()).getByText('8,7 kW vanaf 0,80 m³: meer helpt niet')).toBeTruthy();
    const dots = within(chart()).getAllByRole('button');
    expect(dots.map((b) => b.getAttribute('aria-label'))).toEqual([DOT_A, DOT_B]);
    // het label noemt het volume (de x-as heeft geen m³); de tooltip zegt wat een klik doet
    expect(dots.map((b) => b.textContent)).toEqual(['1×35 A · 0,20 m³', '1×25 A + 7,5 kWh · 0,60 m³']);
    expect(dots.map((b) => b.title)).toEqual(dots.map((b) => b.getAttribute('aria-label')));

    // stip (a): buffer op 0,20 m³ met ongedaan maken; focus op de buffer
    act(() => fireEvent.click(screen.getByRole('button', { name: DOT_A })));
    expect(st().input.buffer.volumeM3).toBe(0.2);
    expect(st().notice?.text).toBe('Buffer op 0,20 m³');
    expect(document.activeElement).toBe(bufferInput());
    act(() => st().undoLast());
    expect(st().input).toEqual(before);

    // stip (b): buffer, batterij en aansluiting tegelijk
    act(() => fireEvent.click(screen.getByRole('button', { name: DOT_B })));
    expect(st().input.buffer.volumeM3).toBe(0.6);
    expect(st().input.battery).toEqual({ capacityKwh: 7.5, powerKw: null });
    expect(st().input.grid.connection).toBe('1x25');
    expect(st().notice?.text).toBe('1×25 A met 0,60 m³ buffer en 7,5 kWh batterij');
    act(() => st().undoLast());
    expect(st().input).toEqual(before);
    await settle(() => analysisDone() && gridDone(), 'terug naar het begin');

    // klik in de grafiek (muis): het dichtstbijzijnde rasterpunt, als gewone invoer (geen ongedaan maken)
    const svg = within(chart()).getByRole('img');
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 320,
      height: 96,
      right: 320,
      bottom: 96,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    act(() => fireEvent.click(svg, { clientX: sliderX(0.33, 4, 320), clientY: 40 }));
    expect(st().input.buffer.volumeM3).toBe(0.4);
    expect(st().undo).toBeNull();

    // "volledige gevoeligheid →": tabblad Gevoeligheid, naar Verdieping scrollen, focus op het tabblad
    const depth = document.createElement('section');
    depth.id = 'ps-verdieping';
    const tab = document.createElement('button');
    tab.id = 'ps-tab-gevoeligheid';
    depth.appendChild(tab);
    document.body.appendChild(depth);
    const scrolled = vi.fn();
    depth.scrollIntoView = scrolled;
    act(() => fireEvent.click(screen.getByRole('button', { name: 'volledige gevoeligheid' })));
    expect(st().tab).toBe('gevoeligheid');
    expect(scrolled).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(tab);
    depth.remove();
    await settle(analysisDone, 'doorrekening na de klik');
  });

  it('na een stap van de stapper blijft het vorige raster gedimd staan (zonder stippen) tot het nieuwe klaar is', async () => {
    useStore.setState({ autoSensitivity: true });
    render(<WhatIfPanel />);
    await load(scenarioInput('woning-basis'), 'woning-basis');
    const path = (): string | null => chart().querySelector('path[class*="line"]')?.getAttribute('d') ?? null;
    const oldPath = path();
    expect(oldPath).toMatch(/^M8 /);
    expect(within(chart()).getAllByRole('button')).toHaveLength(2);

    act(() => fireEvent.click(screen.getByRole('button', { name: 'Grotere aansluiting' })));
    // andere sleutel: het oude raster gedimd en aria-busy, zonder stippen en zonder klik
    expect(chart().getAttribute('aria-busy')).toBe('true');
    expect(chart().className).toMatch(/staleChart/);
    expect(path()).toBe(oldPath);
    expect(within(chart()).queryAllByRole('button')).toHaveLength(0);
    expect(within(chart()).getByRole('img').getAttribute('class')).not.toMatch(/clickable/);

    // ook zolang het nieuwe raster rekent
    await settle(() => st().sensitivity?.key === sensitivityKey(st().input), 'nieuw raster gevraagd');
    if (!st().sensitivity?.done) {
      expect(chart().getAttribute('aria-busy')).toBe('true');
      expect(path()).toBe(oldPath);
    }
    await settle(() => gridDone() && analysisDone(), 'nieuw raster');
    expect(chart().getAttribute('aria-busy')).toBeNull();
    expect(chart().className).not.toMatch(/staleChart/);
    expect(within(chart()).getByRole('img').getAttribute('class')).toMatch(/clickable/);

    // een ander piekvermogen met een ander schuifbereik (4 → 10 m³): het oude raster past niet op de nieuwe schaal,
    // dus de plaatshouder in plaats van een samengedrukte lijn
    act(() => st().setDesignLoad(16));
    expect(st().ranges.bufferMaxM3).toBe(10);
    expect(within(chart()).getByText('Grafiek wordt berekend…')).toBeTruthy();
    expect(within(chart()).queryByRole('img')).toBeNull();
    await settle(() => gridDone() && analysisDone(), 'raster bij 16 kW');
    expect(within(chart()).getByRole('img')).toBeTruthy();
  });

  it('samenvallende stippen (beide vanaf 0,20 m³): elk een eigen raakvlak, elk zijn eigen actie', async () => {
    // raster waarin 1×35 A zonder batterij en 1×25 A met 7,5 kWh allebei vanaf 0,20 m³ passen (zoals bij 9 kW en
    // LT 35); batterijen 0 / 7,5 / 15 / 30 kWh
    const CONN = {
      '1x25': { label: '1×25 A', powerKw: 5.75 },
      '1x35': { label: '1×35 A', powerKw: 8.05 },
      '1x40': { label: '1×40 A', powerKw: 9.2 },
    } as const;
    const row = (volumeM3: number, nominalKw: number, ids: (keyof typeof CONN)[]): SensitivityRow => ({
      volumeM3,
      nominalKw,
      cells: ids.map((id, j) => ({
        capacityKwh: [0, 7.5, 15, 30][j],
        pGridMaxKw: 3,
        exceedanceHours: 0,
        smallest: { id, ...CONN[id], exceedanceHours: 0 },
      })),
    });
    const before = st().input;
    useStore.setState({
      sensitivity: {
        key: sensitivityKey(before),
        rows: [
          row(0, 11.8, ['1x40', '1x40', '1x40', '1x40']),
          row(0.2, 10.4, ['1x35', '1x25', '1x25', '1x25']),
          row(0.4, 9.6, ['1x35', '1x25', '1x25', '1x25']),
        ],
        total: 3,
        done: true,
      },
    });
    render(<WhatIfPanel />);
    const a = screen.getByRole('button', { name: '1×35 A past vanaf 0,20 m³: zet buffer' });
    const b = screen.getByRole('button', {
      name: '1×25 A + 7,5 kWh past vanaf 0,20 m³: zet buffer, batterij en aansluiting',
    });
    // zelfde x, maar een raakvlak (24 px) uit elkaar, met een verbindingslijn naar het punt op de lijn
    expect(b.style.left).toBe(a.style.left);
    expect(Math.abs(parseFloat(b.style.top) - parseFloat(a.style.top))).toBeGreaterThanOrEqual(24);
    expect(within(chart()).getAllByTestId('dot-link')).toHaveLength(1);
    // elk label naast zijn eigen stip
    expect(a.textContent).toBe('1×35 A · 0,20 m³');
    expect(b.textContent).toBe('1×25 A + 7,5 kWh · 0,20 m³');

    act(() => fireEvent.click(a));
    expect(st().input.buffer.volumeM3).toBe(0.2);
    expect(st().input.battery.capacityKwh).toBe(0);
    expect(st().input.grid.connection).toBe('1x35');
    expect(st().notice?.text).toBe('Buffer op 0,20 m³');
    act(() => st().undoLast());
    expect(st().input).toEqual(before);

    act(() => fireEvent.click(b));
    expect(st().input.buffer.volumeM3).toBe(0.2);
    expect(st().input.battery).toEqual({ capacityKwh: 7.5, powerKw: null });
    expect(st().input.grid.connection).toBe('1x25');
    expect(st().notice?.text).toBe('1×25 A met 0,20 m³ buffer en 7,5 kWh batterij');
    act(() => st().undoLast());
    expect(st().input).toEqual(before);
    await settle(analysisDone, 'doorrekening na ongedaan maken');
  });

  it('handmatig WP-vermogen: de lijn blijft, zonder stippen, met de regel over de suggesties', async () => {
    useStore.setState({ autoSensitivity: true });
    render(<WhatIfPanel />);
    await load(
      scenarioInput('woning-basis', (i) => {
        i.heatPump.sizingMode = 'manual';
        i.heatPump.nominalKw = 9;
      }),
    );
    expect(within(chart()).getByRole('img')).toBeTruthy();
    expect(within(chart()).queryAllByRole('button')).toHaveLength(0);
    expect(
      within(panel()).getByText('Suggesties gelden voor een automatisch gedimensioneerde warmtepomp.'),
    ).toBeTruthy();
  });

  it('rasterfout: "Grafiek niet beschikbaar." zonder knop "Opnieuw proberen"', async () => {
    configureEngine({
      mainThread: true,
      createEngine: () => {
        const e = createEngine();
        return {
          ...e,
          handle: async (req, emit) => {
            if (req.type !== 'sensitivity') return e.handle(req, emit);
            emit({ type: 'error', id: req.id, message: 'raster kapot' });
          },
        };
      },
    });
    useStore.setState({ autoSensitivity: true });
    render(<WhatIfPanel />);
    act(() => st().loadInput(scenarioInput('woning-basis'), 'woning-basis'));
    await settle(
      () => analysisDone() && st().sensitivity?.error === 'raster kapot',
      'mislukt raster en doorrekening',
    );
    expect(within(chart()).getByText('Grafiek niet beschikbaar.')).toBeTruthy();
    expect(within(chart()).queryByRole('img')).toBeNull();
    expect(within(panel()).queryByRole('button', { name: /Opnieuw proberen/ })).toBeNull();
    // de link naar de volledige gevoeligheid (met daar wel Opnieuw proberen) blijft
    expect(screen.getByRole('button', { name: 'volledige gevoeligheid' })).toBeTruthy();
  });

  it('bij geen enkel buffervolume te dimensioneren: een plaatshouder met de reden, zonder knop', () => {
    const input = st().input;
    const nan: SensitivityRow[] = [0, 1, 2, 3, 4].map((v) => ({ volumeM3: v, nominalKw: NaN, cells: [] }));
    const key = sensitivityKey(input);
    // het raster rekent nog: de gewone plaatshouder, nog geen conclusie
    act(() => useStore.setState({ sensitivity: { key, rows: nan.slice(0, 2), total: 5, done: false } }));
    render(<BufferMiniChart />);
    expect(within(chart()).getByText('Grafiek wordt berekend…')).toBeTruthy();
    // raster klaar, alle punten niet te bepalen
    act(() => useStore.setState({ sensitivity: { key, rows: nan, total: 5, done: true } }));
    expect(
      within(chart()).getByText('Grafiek niet beschikbaar: warmtepomp niet te dimensioneren.'),
    ).toBeTruthy();
    expect(within(chart()).queryByRole('img')).toBeNull();
    expect(within(chart()).queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByRole('button', { name: /Opnieuw proberen/ })).toBeNull();
  });
});

describe('Wat als?: meldingen bij de hendels', () => {
  it('"Buffer helpt niet verder" onder de buffer, niet naast de regel vanaf het knikpunt; meldingen van Opvallend niet in Wat als?', async () => {
    render(<WhatIfPanel />);
    await load(scenarioInput('woning-basis', (i) => void (i.buffer.volumeM3 = 2)));
    const codes = st().analysis!.messages.map((m) => m.code);
    expect(codes).toContain('bufferPlateau');
    const buffer = panel().querySelector<HTMLElement>('[data-field="buffer"]')!;
    // zonder raster geen regel vanaf het knikpunt: dan de melding
    expect(within(buffer).getByText('Buffer helpt niet verder')).toBeTruthy();
    expect(bufferEffect()).not.toContain('Meer buffer');
    // met raster de regel vanaf het knikpunt, en niet daaronder nog eens hetzelfde als melding
    act(() => st().setAutoSensitivity(true));
    await settle(gridDone, 'raster');
    expect(bufferEffect()).toContain(
      'Meer buffer maakt de warmtepomp niet kleiner: een buffer overbrugt uren, geen dagen.',
    );
    expect(within(buffer).queryByText('Buffer helpt niet verder')).toBeNull();
    // meldingen van Opvallend (bijv. tapwater) staan niet bij de hendels
    for (const m of st().analysis!.messages)
      if (!['bufferPlateau', 'smallBufferDeltaT', 'batteryEmpty', 'batteryPower'].includes(m.code))
        expect(within(panel()).queryByText(m.title)).toBeNull();
    // geen lege lijst "Geen bijzonderheden." bij de batterij
    expect(within(panel()).queryByText('Geen bijzonderheden.')).toBeNull();
  });
});

describe('Wat als?: Verfijnen', () => {
  it('ingeklapt met badge; WP-vermogen, laadstrategie en batterijvermogen met de oude labels', async () => {
    render(<WhatIfPanel />);
    await load(scenarioInput('woning-buffer-batterij'), 'woning-buffer-batterij');
    const details = Array.from(panel().querySelectorAll('details')).find((d) =>
      d.querySelector('summary')?.textContent?.startsWith('Verfijnen'),
    )!;
    const summary = details.querySelector('summary')!;
    expect(details.open).toBe(false);
    expect(details.classList.contains('noPrint')).toBe(true);
    expect(summary.textContent).toBe('Verfijnen · standaard');
    // velden staan altijd in de DOM
    expect(screen.getByRole('group', { name: 'WP-vermogen' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Laadstrategie buffer' })).toBeTruthy();
    const auto = screen.getByLabelText('Batterijvermogen automatisch (0,5 C)') as HTMLInputElement;
    expect(auto.checked).toBe(true);
    expect(screen.queryByLabelText('WP-vermogen (A7/W35)')).toBeNull();

    // vraag om het WP-vermogen (tegel "eigen vermogen kiezen"): Verfijnen open, focus op "Handmatig"
    act(() => st().revealSetting('sizing'));
    expect(details.open).toBe(true);
    expect(document.activeElement?.textContent).toBe('Handmatig');
    const used = st().analysis!.nominalKw;
    act(() => fireEvent.click(document.activeElement as HTMLElement));
    expect(st().input.heatPump.sizingMode).toBe('manual');
    expect(st().input.heatPump.nominalKw).toBe(Math.round(used * 10) / 10);
    expect(summary.textContent).toBe('Verfijnen · 1 aangepast');
    const nominal = screen.getByLabelText('WP-vermogen (A7/W35)') as HTMLInputElement;
    await settle(analysisDone, 'doorrekening handmatig');
    const hintId = nominal.getAttribute('aria-describedby')!.split(' ').pop()!;
    expect(document.getElementById(hintId)?.textContent).toMatch(
      /^\d,\d\d × piekvermogen · benodigd \d+,\d kW$/,
    );
    // nog eens: nu het getalveld
    details.open = false;
    act(() => st().revealSetting('sizing'));
    expect(details.open).toBe(true);
    expect(document.activeElement).toBe(nominal);

    act(() => fireEvent.click(auto));
    expect(st().input.battery.powerKw).toBe(2.5);
    expect(screen.getByLabelText('Batterijvermogen (C-waarde)')).toBeTruthy();
    act(() => fireEvent.click(screen.getByRole('button', { name: 'Altijd' })));
    expect(st().input.buffer.strategy).toBe('always');
    expect(summary.textContent).toBe('Verfijnen · 3 aangepast');
    await settle(analysisDone, 'doorrekening verfijnd');
  });

  it('buffer en batterij krijgen de focus op verzoek; een veld van de Basis niet', () => {
    render(<WhatIfPanel />);
    act(() => st().revealSetting('battery'));
    expect(document.activeElement).toBe(batteryInput());
    act(() => st().revealSetting('buffer'));
    expect(document.activeElement).toBe(bufferInput());
    act(() => st().revealSetting('designLoad'));
    expect(document.activeElement).toBe(bufferInput());
  });
});
