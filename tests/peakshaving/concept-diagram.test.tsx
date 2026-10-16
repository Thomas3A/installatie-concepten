// @vitest-environment jsdom
// Rooktest van het tabblad Concept: plaatshouder zonder resultaat, schema met toegankelijke samenvatting,
// en het schema volgt het uur van de scrubber.
import { act, cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import refJson from '../../src/concepts/peakshaving/data/referentiejaren.json';
import { analyze } from '../../src/concepts/peakshaving/model/analysis';
import { decodeReferenceYear, type ReferenceYearsJson } from '../../src/concepts/peakshaving/model/climate';
import { findScenario } from '../../src/concepts/peakshaving/scenarios';
import { useStore } from '../../src/concepts/peakshaving/store';
import { ConceptDiagram } from '../../src/concepts/peakshaving/ui/concept/ConceptDiagram';

afterEach(() => {
  cleanup();
  act(() => useStore.setState({ analysis: null, scrubHour: null }));
});

describe('ConceptDiagram', () => {
  it('toont een plaatshouder zolang er geen resultaat is', () => {
    act(() => useStore.setState({ analysis: null, scrubHour: null }));
    render(createElement(ConceptDiagram));
    expect(screen.getByText(/Het conceptschema verschijnt/)).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it.each(['woning-basis', 'kantoor-buffer-batterij'])('rendert %s en volgt het gekozen uur', (id) => {
    const climate = decodeReferenceYear(refJson as unknown as ReferenceYearsJson, 'T5');
    const a = analyze(findScenario(id)!.build(), climate);
    act(() => useStore.setState({ analysis: a, scrubHour: null }));
    render(createElement(ConceptDiagram));
    const label0 = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(label0).toMatch(/^Conceptschema op .+ aan de meter .+ kW/);
    expect(document.querySelector('.sr-only')?.textContent).toMatch(/Meterkast: aansluiting/);
    // het scrubber-bereik staat onder het schema
    expect(screen.getByLabelText('Uur in de koude week')).toBeTruthy();
    act(() => useStore.getState().setScrubHour(a.coldWeek.from + 3));
    expect(screen.getByRole('img').getAttribute('aria-label')).not.toBe(label0);
  });
});
