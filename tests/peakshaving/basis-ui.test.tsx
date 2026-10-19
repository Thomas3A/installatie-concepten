// @vitest-environment jsdom
// Stap 1 · Basis (UX-plan §2.3, §2.5, §3, §10 WP-B): velden per gebouwfunctie, Nachtverlaging, limietbalk, de regel met
// het voorbeeld, Meer instellingen met badge, de ingeklapte strook (toolbar met roving tabindex, chips die de Basis
// openen en de focus op het veld zetten), "Bekijk het resultaat" en verzoeken van revealSetting.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultInputOfKind } from '../../src/concepts/peakshaving/data/defaults';
import type { Engine } from '../../src/concepts/peakshaving/model/engine';
import { findScenario } from '../../src/concepts/peakshaving/scenarios';
import { configureEngine, useStore } from '../../src/concepts/peakshaving/store';
import { CLIMATE_NOTE, HELP } from '../../src/concepts/peakshaving/texts';
import { BasisSection } from '../../src/concepts/peakshaving/ui/basis/BasisSection';
import { stripChips } from '../../src/concepts/peakshaving/ui/basis/BasisStrip';
import { STORAGE_KEYS } from '../../src/concepts/peakshaving/ui/storage';

/** Rekenmotor die niets doet: de Basis heeft geen doorrekening nodig. */
const idleEngine = (): Engine => ({
  handle: async () => undefined,
  climate: async () => {
    throw new Error('niet nodig in deze test');
  },
});

const scrollSpy = vi.fn();

beforeAll(() => {
  // jsdom kent scrollIntoView niet
  Element.prototype.scrollIntoView = scrollSpy;
});

beforeEach(() => {
  localStorage.clear();
  scrollSpy.mockClear();
  configureEngine({ mainThread: true, createEngine: idleEngine });
  act(() => {
    useStore.getState().applyScenario('woning-basis');
    useStore.setState({ basisOpen: true, reveal: null, ownInput: null, undo: null, notice: null });
  });
});

afterEach(() => {
  cleanup();
  configureEngine({ mainThread: true, createEngine: idleEngine });
});

const st = () => useStore.getState();

/** Basis met een stand-in voor de H2 "Resultaat" van de oordeelkaart (WP-D). */
function renderBasis() {
  return render(
    <>
      <BasisSection />
      <h2 id="ps-resultaat" tabIndex={-1}>
        Resultaat
      </h2>
    </>,
  );
}

function load(kind: 'single' | 'multi' | 'office'): void {
  act(() => useStore.getState().loadInput(defaultInputOfKind(kind), null));
}

function typeAndBlur(field: HTMLInputElement, text: string): void {
  act(() => {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: text } });
    fireEvent.blur(field);
  });
}

const click = (el: Element): void => {
  act(() => {
    fireEvent.click(el);
  });
};

const field = (label: string): HTMLInputElement => screen.getByLabelText(label) as HTMLInputElement;
const section = (): HTMLElement => screen.getByRole('region', { name: 'Invoer' });
const moreDetails = (): HTMLDetailsElement => section().querySelector('details')!;
const summaryText = (): string => moreDetails().querySelector('summary')!.textContent ?? '';

/** Labels van de velden in de open Basis (buiten Meer instellingen), in DOM-volgorde. */
function basisLabels(): string[] {
  return Array.from(section().querySelectorAll('label'))
    .filter((l) => !l.closest('details'))
    .map((l) => l.textContent ?? '');
}

/** Tekst die een element beschrijft (aria-describedby). */
function description(el: Element): string {
  const ids = (el.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean);
  return ids.map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
}

const chipNames = (): string[] =>
  within(screen.getByRole('toolbar', { name: 'Basis' }))
    .getAllByRole('button')
    .map((b) => b.getAttribute('aria-label') ?? '');

function collapse(): void {
  act(() => useStore.getState().setBasisOpen(false, false));
}

describe('Basis: velden per gebouwfunctie (§3.1)', () => {
  it('woning 6, meerdere woningen 7, kantoor 8 velden; grootverbruik voegt het gecontracteerd vermogen toe', () => {
    renderBasis();
    expect(basisLabels()).toEqual([
      'Gebouwfunctie',
      'Piekvermogen verwarming',
      'Stooklijn (afgifte)',
      'Warm tapwater',
      'Aansluitwaarde',
      'Aandeel voor warmtepomp',
    ]);

    load('multi');
    expect(basisLabels()).toEqual([
      'Gebouwfunctie',
      'Aantal woningen',
      'Piekvermogen verwarming (totaal)',
      'Stooklijn (afgifte)',
      'Warm tapwater',
      'Aansluitwaarde',
      'Aandeel voor warmtepomp',
    ]);

    load('office');
    expect(basisLabels()).toEqual([
      'Gebouwfunctie',
      'Piekvermogen verwarming',
      'Stooklijn (afgifte)',
      'Gebruik vanaf',
      'Gebruik tot',
      'Nachtverlaging',
      'Aansluitwaarde',
      'Aandeel voor warmtepomp',
    ]);

    act(() =>
      useStore.getState().update((i) => ({ ...i, grid: { ...i.grid, connection: 'grootverbruik' } })),
    );
    expect(basisLabels()).toEqual([
      'Gebouwfunctie',
      'Piekvermogen verwarming',
      'Stooklijn (afgifte)',
      'Gebruik vanaf',
      'Gebruik tot',
      'Nachtverlaging',
      'Aansluitwaarde',
      'Gecontracteerd vermogen',
      'Aandeel voor warmtepomp',
    ]);
  });

  it('elk invoerveld van de oude blokken (behalve Wat als?) is bereikbaar, voor elke functie en bij grootverbruik', () => {
    const common = [
      'Gebouwfunctie',
      'Stooklijn (afgifte)',
      'Aansluitwaarde',
      'Aandeel voor warmtepomp',
      'Klimaatjaar',
      'Gebouwmassa',
      'Gebouwmassa (tijdconstante)',
      'Ontwerpbuitentemperatuur',
      'Ontwerpbinnentemperatuur',
      'Setpoint tijdens gebruik',
      'Setpoint buiten gebruik',
      'Stookgrens tijdens gebruik',
      'Traagheid gevel',
      'Opwarmfactor',
      'Warm tapwater',
      'Boilertemperatuur',
      'Max. aanvoertemperatuur warmtepomp',
      'Bijstookelement',
      'Carnot-rendement',
      'Toegestane overschrijdingsuren',
      'Toegestane comfortverliesuren',
    ];
    const perKind = {
      single: ['Piekvermogen verwarming', 'Tapwaterbehoefte', 'Boilervat'],
      multi: [
        'Aantal woningen',
        'Piekvermogen verwarming (totaal)',
        'Tapwaterbehoefte per woning',
        'Boilervat (collectief)',
      ],
      office: ['Piekvermogen verwarming', 'Gebruik vanaf', 'Gebruik tot', 'Opstooktijd', 'Nachtverlaging'],
    } as const;
    renderBasis();
    for (const kind of ['single', 'multi', 'office'] as const) {
      load(kind);
      // kantoor: tapwater staat standaard uit; de getallen verschijnen pas als het aan staat
      if (kind === 'office') {
        expect(screen.queryByLabelText('Tapwaterbehoefte')).toBeNull();
        click(field('Warm tapwater'));
        expect(st().input.building.dhw).toMatchObject({ enabled: true, dailyKwh: 20, tankLitre: 500 });
      }
      const labels = [
        ...common,
        ...perKind[kind],
        ...(kind === 'office' ? ['Tapwaterbehoefte', 'Boilervat'] : []),
      ];
      for (const label of labels)
        expect(() => screen.getByLabelText(label), `${kind}: ${label}`).not.toThrow();
      // grootverbruik: het gecontracteerd vermogen erbij
      act(() => st().update((i) => ({ ...i, grid: { ...i.grid, connection: 'grootverbruik' } })));
      expect(field('Gecontracteerd vermogen').value).toBe('100');
    }
    // Wat als? en Verdieping staan niet in de Basis
    for (const label of [
      'Buffervolume',
      'Batterijcapaciteit',
      'WP-vermogen',
      'Laadstrategie buffer',
      'Bedrijfsmodus',
    ])
      expect(screen.queryByLabelText(label)).toBeNull();
  });

  it('stooklijn als drie knoppen "LT 35", "MT 45", "HT 55"; de beschrijvingsregel is weg', () => {
    renderBasis();
    const group = screen.getByRole('group', { name: 'Stooklijn (afgifte)' });
    expect(
      within(group)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['LT 35', 'MT 45', 'HT 55']);
    expect(within(group).getByRole('button', { name: 'MT 45' }).getAttribute('aria-pressed')).toBe('true');
    click(within(group).getByRole('button', { name: 'LT 35' }));
    expect(st().input.heatPump.emitterPreset).toBe('LT');
    expect(screen.queryByText(/LT-radiatoren/)).toBeNull();
  });

  it('warm tapwater: de samenvatting beschrijft het vinkje; per woning bij meerdere woningen', () => {
    renderBasis();
    const check = field('Warm tapwater');
    expect(description(check)).toBe('10 kWh/dag · boiler 200 l');
    click(check);
    expect(st().input.building.dhw.enabled).toBe(false);
    expect(field('Warm tapwater').getAttribute('aria-describedby')).toBeNull();
    load('multi');
    expect(description(field('Warm tapwater'))).toBe('6,0 kWh/dag per woning · boiler 1.200 l');
  });
});

describe('Basis: Nachtverlaging (alleen kantoor)', () => {
  it('aan = setpoint buiten gebruik 2 K lager, uit = gelijk; een eigen waarde gaat bij uit en aan verloren', () => {
    renderBasis();
    expect(screen.queryByLabelText('Nachtverlaging')).toBeNull();
    load('office');
    const check = (): HTMLInputElement => field('Nachtverlaging');
    // standaard kantoor 21/19 °C: aan
    expect(st().input.building.setpointUseC).toBe(21);
    expect(st().input.building.setpointSetbackC).toBe(19);
    expect(check().checked).toBe(true);

    click(check());
    expect(check().checked).toBe(false);
    expect(st().input.building.setpointSetbackC).toBe(21);
    expect(field('Setpoint buiten gebruik').value).toBe('21,0');

    click(check());
    expect(check().checked).toBe(true);
    expect(st().input.building.setpointSetbackC).toBe(19);

    // eigen waarde in Meer instellingen › Gebouw: blijft "aan", maar uit- en weer aanvinken geeft 2 K
    typeAndBlur(field('Setpoint buiten gebruik'), '17');
    expect(st().input.building.setpointSetbackC).toBe(17);
    expect(check().checked).toBe(true);
    click(check());
    click(check());
    expect(st().input.building.setpointSetbackC).toBe(19);

    // het gebruikssetpoint verlagen tot het verlaagde setpoint: dan staat nachtverlaging uit
    typeAndBlur(field('Setpoint tijdens gebruik'), '19');
    expect(check().checked).toBe(false);
    click(check());
    expect(st().input.building.setpointSetbackC).toBe(17);
  });
});

describe('Basis: limietbalk, voorbeeldregel en ankers', () => {
  it('limietbalk als hint van het aandeel: "WP-limiet 3,22 kW · overig gebruik 4,83 kW", ook bij grootverbruik', () => {
    renderBasis();
    const share = field('Aandeel voor warmtepomp');
    expect(description(share)).toBe('% WP-limiet 3,22 kW · overig gebruik 4,83 kW');
    expect(screen.getByText('3,22 kW').tagName).toBe('STRONG');
    typeAndBlur(share, '60');
    expect(description(field('Aandeel voor warmtepomp'))).toBe(
      '% WP-limiet 4,83 kW · overig gebruik 3,22 kW',
    );

    load('office');
    act(() =>
      st().update((i) => ({ ...i, grid: { ...i.grid, connection: 'grootverbruik', contractedKw: 100 } })),
    );
    expect(description(field('Aandeel voor warmtepomp'))).toBe(
      '% WP-limiet 50,0 kW · overig gebruik 50,0 kW',
    );
  });

  it('toelichting bij het aandeel: de aanvulling voor meerdere woningen alleen bij meerdere woningen', () => {
    renderBasis();
    const tip = (): string =>
      screen.getByRole('button', { name: 'Toelichting: Aandeel voor warmtepomp' }).title;
    expect(tip()).toBe(HELP.share);
    load('multi');
    expect(tip()).toBe(`${HELP.share} ${HELP.shareMulti}`);
    load('office');
    expect(tip()).toBe(HELP.share);
  });

  it('regel boven de velden: het voorbeeld, of "Eigen invoer." na een wijziging', () => {
    renderBasis();
    expect(
      screen.getByText(
        "Ingevuld met voorbeeld „Woning jaren '70 · zonder maatregelen”. Pas het aan naar je eigen gebouw.",
      ),
    ).toBeTruthy();
    typeAndBlur(field('Piekvermogen verwarming'), '9');
    expect(st().scenarioId).toBeNull();
    expect(screen.getByText('Eigen invoer.')).toBeTruthy();
  });

  it('data-tour: "basis" op de sectie, "budget" om het aandeel; H2 "Basis" met het stapnummer verborgen', () => {
    renderBasis();
    expect(section().getAttribute('data-tour')).toBe('basis');
    const budget = document.querySelector('[data-tour="budget"]')!;
    expect(budget.contains(field('Aandeel voor warmtepomp'))).toBe(true);
    expect(screen.getByRole('heading', { level: 2, name: 'Basis' })).toBeTruthy();
    expect(section().classList.contains('noPrint')).toBe(true);
  });
});

describe('Meer instellingen', () => {
  it('groepen als H3; dicht, maar de velden staan in de DOM', () => {
    renderBasis();
    expect(moreDetails().open).toBe(false);
    expect(
      within(moreDetails())
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['Klimaat', 'Gebouw', 'Tapwater', 'Warmtepomp', 'Beoordeling']);
    expect(moreDetails().contains(field('Toegestane overschrijdingsuren'))).toBe(true);
    // zonder tapwater (woning) geen lege groep Tapwater
    click(field('Warm tapwater'));
    expect(within(moreDetails()).queryByRole('heading', { name: 'Tapwater' })).toBeNull();
  });

  it('badge: "standaardwaarden", daarna het aantal aangepaste velden', () => {
    renderBasis();
    expect(summaryText()).toBe('Meer instellingen · standaardwaarden');
    act(() => {
      fireEvent.change(field('Klimaatjaar'), { target: { value: 'T5' } });
    });
    expect(st().input.climateYear).toBe('T5');
    expect(summaryText()).toBe('Meer instellingen · 1 aangepast');
    typeAndBlur(field('Ontwerpbuitentemperatuur'), '−12');
    expect(summaryText()).toBe('Meer instellingen · 2 aangepast');
    // Basis-velden tellen niet mee
    typeAndBlur(field('Piekvermogen verwarming'), '9');
    expect(summaryText()).toBe('Meer instellingen · 2 aangepast');
    // meerdere woningen: tapwater per woning tegen de standaard per woning
    load('multi');
    expect(summaryText()).toBe('Meer instellingen · standaardwaarden');
    typeAndBlur(field('Tapwaterbehoefte per woning'), '7');
    expect(summaryText()).toBe('Meer instellingen · 1 aangepast');
  });

  it('klimaat: alle 80 jaren; de statistiekregel beschrijft de keuzelijst en begint met "Klimaatjaar T1:"', () => {
    renderBasis();
    const select = screen.getByLabelText('Klimaatjaar') as HTMLSelectElement;
    expect(select.options).toHaveLength(80);
    // volgorde en labels van spec §4.3, in drie groepen
    const groups = Array.from(select.querySelectorAll('optgroup'));
    expect(groups.map((g) => g.label)).toEqual([
      'Referentiejaren (reconstructie NEN 5060:2018)',
      'Stresstest strenge winter (T1 met een werkelijk stookseizoen)',
      'Werkelijk jaar KNMI De Bilt (stresstest met echt weer)',
    ]);
    const options = Array.from(select.options);
    expect(options.slice(0, 5).map((o) => [o.value, o.textContent])).toEqual([
      ['T1', 'Ontwerpjaar T1 — strenge winter'],
      ['T5', 'Ontwerpjaar T5 — gemiddelde winter'],
      ['energie', 'Energiejaar — langjarig gemiddeld'],
      ['winter1979', 'Stresstest strenge winter 1978/79 (≈ 1× per 25 jaar)'],
      ['winter1963', 'Stresstest extreme winter 1962/63 (≈ 1× per eeuw)'],
    ]);
    // tooltip: de omschrijving uit de meta plus de statistiekregel
    const w79 = options.find((o) => o.value === 'winter1979')!;
    expect(w79.title).toMatch(
      /^Stresstest strenge winter 1978\/79 \(koudste week −10 °C; ≈ 1× per 25 jaar in 1951–2025\)/,
    );
    expect(w79.title).toContain('koudste week −10,2 °C');
    expect(options.find((o) => o.value === 'winter1963')!.title).toContain('Hellmann 346');
    // werkelijke jaren 1951 t/m 2025, de aanbevolen stresstestjaren met ★
    const real = options.slice(5);
    expect(real).toHaveLength(75);
    expect(real[0].value).toBe('knmi-1951');
    expect(real[74].value).toBe('knmi-2025');
    const starred = real.filter((o) => o.textContent?.includes('★')).map((o) => o.value);
    expect(starred).toEqual(
      [1956, 1963, 1979, 1985, 1986, 1987, 1996, 1997, 2010, 2012].map((y) => `knmi-${y}`),
    );
    expect(Array.from(select.options).some((o) => o.textContent?.startsWith('1997 ★'))).toBe(true);
    expect(select.getAttribute('aria-describedby')).toBe('ps-klimaat-statistiek');
    const stats = (): string => document.getElementById('ps-klimaat-statistiek')?.textContent ?? '';
    expect(stats()).toMatch(/^Klimaatjaar T1: /);
    expect(stats()).toContain('1.395 uur < 0 °C');
    expect(select.title).toContain('1.395 uur < 0 °C');
    expect(select.title).toMatch(/^Ontwerpjaar T1, 1 % \(≈ NEN 5060:2018 ref T1\); winter streng/);
    expect(screen.getByText(CLIMATE_NOTE)).toBeTruthy();
    expect(CLIMATE_NOTE).toContain(
      'Dimensioneer op T1 (strenge winter, 1 %-ontwerpjaar) en controleer met de stresstest 1978/79.',
    );
    act(() => {
      fireEvent.change(select, { target: { value: 'winter1979' } });
    });
    expect(stats()).toMatch(/^Klimaatjaar winter 1978\/79: /);
    expect(select.title).toMatch(/^Stresstest strenge winter 1978\/79/);
    act(() => {
      fireEvent.change(select, { target: { value: 'knmi-2012' } });
    });
    expect(stats()).toMatch(/^Klimaatjaar 2012: /);
    expect(stats()).toContain('T min −18,8 °C');
  });
});

describe('Basis ingeklapt: de strook', () => {
  it('de strook rendert alleen als de Basis dicht is; het open paneel is dan verborgen', () => {
    renderBasis();
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Wijzig' })).toBeNull();
    expect(field('Piekvermogen verwarming').closest('[hidden]')).toBeNull();
    collapse();
    expect(screen.getByRole('toolbar', { name: 'Basis' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Wijzig' })).toBeTruthy();
    expect(field('Piekvermogen verwarming').closest('[hidden]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Bekijk het resultaat' })).toBeNull();
    expect(screen.getByText("Voorbeeld · Woning jaren '70 · zonder maatregelen")).toBeTruthy();
    // de sectie blijft de regio "Invoer" met data-tour="basis"
    expect(section().getAttribute('data-tour')).toBe('basis');
  });

  it('woning: chips met de naam "{label}: {waarde}, wijzigen"', () => {
    renderBasis();
    collapse();
    expect(chipNames()).toEqual([
      'Gebouwfunctie: Woning, wijzigen',
      'Piekvermogen verwarming: 8,0 kW, wijzigen',
      'Stooklijn (afgifte): MT 45/35, wijzigen',
      'Warm tapwater: tapwater 10 kWh/dag, wijzigen',
      'Aansluitwaarde: 1×35 A, wijzigen',
      'Aandeel voor warmtepomp: limiet 3,22 kW · 40 %, wijzigen',
      'Klimaatjaar: T1, wijzigen',
    ]);
    const toolbar = screen.getByRole('toolbar', { name: 'Basis' });
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual([
      'Woning',
      '8,0 kW',
      'MT 45/35',
      'tapwater 10 kWh/dag',
      '1×35 A',
      'limiet 3,22 kW · 40 %',
      'T1',
    ]);
  });

  it('meerdere woningen: "kW/woning" in de strook, nooit "≈ … kW per woning"', () => {
    renderBasis();
    load('multi');
    collapse();
    const toolbar = screen.getByRole('toolbar', { name: 'Basis' });
    expect(chipNames()).toContain('Piekvermogen verwarming (totaal): 50,0 kW (5,0 kW/woning), wijzigen');
    expect(chipNames()).toContain('Gebouwfunctie: 10 woningen, wijzigen');
    expect(chipNames()).toContain('Warm tapwater: tapwater 6,0 kWh/dag per woning, wijzigen');
    expect(chipNames()).toContain('Aandeel voor warmtepomp: limiet 19,40 kW · 80 %, wijzigen');
    expect(toolbar.textContent).toContain('kW/woning');
    expect(toolbar.textContent).not.toMatch(/≈/);
    expect(toolbar.textContent).not.toMatch(/kW per woning/);
  });

  it('kantoor: gebruikstijden en nachtverlaging, geen tapwater; nergens "per woning"', () => {
    renderBasis();
    load('office');
    expect(screen.queryByText(/per woning/)).toBeNull();
    collapse();
    expect(chipNames()).toEqual([
      'Gebouwfunctie: Kantoor, wijzigen',
      'Piekvermogen verwarming: 100,0 kW, wijzigen',
      'Stooklijn (afgifte): MT 45/35, wijzigen',
      'Gebruikstijden: gebruik 7–18 uur, wijzigen',
      'Nachtverlaging: nachtverlaging, wijzigen',
      'Aansluitwaarde: 3×80 A, wijzigen',
      'Aandeel voor warmtepomp: limiet 27,7 kW · 50 %, wijzigen',
      'Klimaatjaar: T1, wijzigen',
    ]);
    expect(screen.queryByText(/per woning/)).toBeNull();
    expect(screen.getByRole('toolbar').textContent).not.toMatch(/woning/);
  });

  it('grootverbruik en een ander klimaatjaar in de chips', () => {
    const input = defaultInputOfKind('office');
    input.grid.connection = 'grootverbruik';
    input.grid.contractedKw = 95;
    input.climateYear = 'knmi-1997';
    input.building.dhw = { enabled: true, dailyKwh: 20, tankLitre: 500, tankTempC: 55 };
    const names = stripChips(input).map((c) => `${c.label}: ${c.value}`);
    expect(names).toContain('Aansluitwaarde: Grootverbruik 95 kW');
    expect(names).toContain('Klimaatjaar: 1997');
    expect(names).toContain('Warm tapwater: tapwater 20 kWh/dag');
    expect(stripChips(input).find((c) => c.key === 'dhw')?.target).toBe('dhw');
  });

  it('Meer instellingen afwijkend (naast het klimaatjaar): een chip "Meer instellingen · n aangepast"', () => {
    const input = defaultInputOfKind('single');
    expect(stripChips(input).some((c) => c.key === 'moreSettings')).toBe(false);
    // alleen een ander klimaatjaar: dat heeft al een eigen chip
    input.climateYear = 'T5';
    expect(stripChips(input).some((c) => c.key === 'moreSettings')).toBe(false);
    input.grid.allowedExceedanceH = 5;
    input.heatPump.carnotEfficiency = 0.42;
    const chip = stripChips(input).find((c) => c.key === 'moreSettings')!;
    // zelfde telling als de kop van Meer instellingen in de open Basis (met het klimaatjaar)
    expect(chip.value).toBe('Meer instellingen · 3 aangepast');
    expect(chip.target).toBe('climate');
    renderBasis();
    act(() => st().loadInput(input, null));
    collapse();
    expect(chipNames()).toContain('Meer instellingen: 3 aangepast, wijzigen');
  });

  it('één tabstop; pijltjes, Home en End verplaatsen de focus tussen de chips (rondgaand)', () => {
    renderBasis();
    collapse();
    const toolbar = screen.getByRole('toolbar', { name: 'Basis' });
    const chips = within(toolbar).getAllByRole('button');
    const tabStops = (): HTMLElement[] => chips.filter((c) => c.tabIndex === 0);
    expect(tabStops()).toEqual([chips[0]]);
    act(() => chips[0].focus());
    act(() => {
      fireEvent.keyDown(chips[0], { key: 'ArrowRight' });
    });
    expect(document.activeElement).toBe(chips[1]);
    expect(tabStops()).toEqual([chips[1]]);
    act(() => {
      fireEvent.keyDown(chips[1], { key: 'End' });
    });
    expect(document.activeElement).toBe(chips[chips.length - 1]);
    act(() => {
      fireEvent.keyDown(chips[chips.length - 1], { key: 'ArrowRight' });
    });
    expect(document.activeElement).toBe(chips[0]);
    act(() => {
      fireEvent.keyDown(chips[0], { key: 'ArrowLeft' });
    });
    expect(document.activeElement).toBe(chips[chips.length - 1]);
    act(() => {
      fireEvent.keyDown(chips[chips.length - 1], { key: 'Home' });
    });
    expect(document.activeElement).toBe(chips[0]);
    expect(tabStops()).toEqual([chips[0]]);
    // de knop Wijzig staat na de toolbar en is een eigen tabstop
    const edit = screen.getByRole('button', { name: 'Wijzig' });
    expect(toolbar.contains(edit)).toBe(false);
    expect(edit.tabIndex).toBe(0);
  });

  it('een chip opent de Basis (bewaard) en zet de focus op het veld', () => {
    renderBasis();
    collapse();
    click(screen.getByRole('button', { name: 'Piekvermogen verwarming: 8,0 kW, wijzigen' }));
    expect(st().basisOpen).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.basis)).toBe('open');
    expect(screen.queryByRole('toolbar')).toBeNull();
    expect(document.activeElement).toBe(field('Piekvermogen verwarming'));
    expect(scrollSpy).toHaveBeenCalled();

    collapse();
    click(screen.getByRole('button', { name: 'Aandeel voor warmtepomp: limiet 3,22 kW · 40 %, wijzigen' }));
    expect(document.activeElement).toBe(field('Aandeel voor warmtepomp'));

    collapse();
    click(screen.getByRole('button', { name: 'Aansluitwaarde: 1×35 A, wijzigen' }));
    expect(document.activeElement).toBe(field('Aansluitwaarde'));

    // Gebouwfunctie: de gekozen knop van de groep
    collapse();
    click(screen.getByRole('button', { name: 'Gebouwfunctie: Woning, wijzigen' }));
    expect(document.activeElement?.textContent).toBe('Woning');
    expect(document.activeElement?.getAttribute('aria-pressed')).toBe('true');
  });

  it('chip "Klimaatjaar": eerst Meer instellingen open, dan de focus op de keuzelijst', () => {
    renderBasis();
    collapse();
    expect(moreDetails().open).toBe(false);
    click(screen.getByRole('button', { name: 'Klimaatjaar: T1, wijzigen' }));
    expect(st().basisOpen).toBe(true);
    expect(moreDetails().open).toBe(true);
    expect(document.activeElement).toBe(field('Klimaatjaar'));
  });

  it('kantoor: chips voor gebruikstijden en nachtverlaging zetten de focus op hun veld', () => {
    renderBasis();
    load('office');
    collapse();
    click(screen.getByRole('button', { name: 'Gebruikstijden: gebruik 7–18 uur, wijzigen' }));
    expect(document.activeElement).toBe(field('Gebruik vanaf'));
    collapse();
    click(screen.getByRole('button', { name: 'Nachtverlaging: nachtverlaging, wijzigen' }));
    expect(document.activeElement).toBe(field('Nachtverlaging'));
  });

  it('Wijzig opent de Basis met de focus op Gebouwfunctie', () => {
    renderBasis();
    collapse();
    click(screen.getByRole('button', { name: 'Wijzig' }));
    expect(st().basisOpen).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.basis)).toBe('open');
    const group = screen.getByRole('group', { name: 'Gebouwfunctie' });
    expect(group.contains(document.activeElement)).toBe(true);
  });
});

describe('Bekijk het resultaat', () => {
  it('klapt in (bewaard), scrolt naar het oordeel en zet de focus op H2 "Resultaat"', () => {
    renderBasis();
    const heading = screen.getByRole('heading', { name: 'Resultaat' });
    click(screen.getByRole('button', { name: 'Bekijk het resultaat' }));
    expect(st().basisOpen).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.basis)).toBe('dicht');
    expect(screen.getByRole('toolbar', { name: 'Basis' })).toBeTruthy();
    expect(document.activeElement).toBe(heading);
    expect(scrollSpy.mock.contexts).toContain(heading);
  });

  it('zonder oordeelkaart blijft de focus in de strook', () => {
    render(<BasisSection />);
    click(screen.getByRole('button', { name: 'Bekijk het resultaat' }));
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Gebouwfunctie: Woning, wijzigen' }),
    );
  });
});

describe('revealSetting van elders', () => {
  it('veld in Meer instellingen: Basis en Meer instellingen open, focus op het veld', () => {
    renderBasis();
    collapse();
    act(() => st().revealSetting('allowedHours'));
    expect(st().basisOpen).toBe(true);
    expect(moreDetails().open).toBe(true);
    expect(document.activeElement).toBe(field('Toegestane overschrijdingsuren'));
  });

  it('kantoor: "Warm tapwater" staat in Meer instellingen › Tapwater', () => {
    renderBasis();
    load('office');
    act(() => st().revealSetting('dhw'));
    expect(moreDetails().open).toBe(true);
    expect(document.activeElement).toBe(field('Warm tapwater'));
  });

  it('een veld in Wat als? laat de Basis met rust', () => {
    renderBasis();
    collapse();
    const before = document.activeElement;
    act(() => st().revealSetting('buffer'));
    act(() => st().revealSetting('connectionStepper'));
    expect(st().basisOpen).toBe(false);
    expect(screen.getByRole('toolbar', { name: 'Basis' })).toBeTruthy();
    expect(document.activeElement).toBe(before);
    expect(moreDetails().open).toBe(false);
  });

  it('een verzoek van vóór het tekenen zet de focus niet', () => {
    act(() => st().revealSetting('designLoad'));
    renderBasis();
    expect(document.activeElement).toBe(document.body);
    // een nieuw verzoek voor hetzelfde veld wel
    act(() => st().revealSetting('designLoad'));
    expect(document.activeElement).toBe(field('Piekvermogen verwarming'));
  });
});

describe('voorbeeld in de regel', () => {
  it('elk voorbeeld met een korte titel', () => {
    renderBasis();
    act(() => st().applyScenario('kantoor-winter1979'));
    const sc = findScenario('kantoor-winter1979')!;
    expect(
      screen.getByText(`Ingevuld met voorbeeld „${sc.shortTitle}”. Pas het aan naar je eigen gebouw.`),
    ).toBeTruthy();
    // de beschrijving als tooltip
    expect(screen.getByText(/^Ingevuld met voorbeeld/).getAttribute('title')).toContain(sc.description);
    collapse();
    expect(screen.getByText(`Voorbeeld · ${sc.shortTitle}`)).toBeTruthy();
  });
});
