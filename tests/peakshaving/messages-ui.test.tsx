// @vitest-environment jsdom
// Meldingen in de werkbank (UX-plan §4.6, §7 #24–25): filteren met include/exclude, compact zonder eigen regio,
// hideEmpty, de tekst zonder meldingen en de ernst in woorden ("✕ Kritiek", "! Let op", "i Info").
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Analysis } from '../../src/concepts/peakshaving/model/analysis';
import type { Message, Severity } from '../../src/concepts/peakshaving/model/messages';
import { useStore } from '../../src/concepts/peakshaving/store';
import type { MessageCode } from '../../src/concepts/peakshaving/texts';
import { Messages } from '../../src/concepts/peakshaving/ui/results/Messages';

function message(code: MessageCode, severity: Severity, title: string): Message {
  return {
    code,
    severity,
    title,
    summary: `${title}: kort`,
    why: [`Waarom ${title}.`],
    solutions: ['Iets doen.'],
  };
}

/** Gesorteerd op ernst, zoals het model ze aanlevert. */
const ALL: Message[] = [
  message('sizingFailed', 'error', 'Niet te dimensioneren'),
  message('comfortLoss', 'warning', 'Te koud met begrenzer'),
  message('dhwPeak', 'info', 'Tapwater veroorzaakt de piek'),
];

/** Alleen `messages` wordt gelezen; de rest van de doorrekening doet hier niet ter zake. */
function setMessages(messages: Message[] | null): void {
  useStore.setState({ analysis: messages ? ({ messages } as unknown as Analysis) : null });
}

const titles = (root: HTMLElement): string[] =>
  Array.from(root.querySelectorAll('strong'))
    .map((el) => el.textContent ?? '')
    .filter((t) => t !== 'Wat helpt');

beforeEach(() => {
  localStorage.clear();
  setMessages(ALL);
});

afterEach(() => {
  cleanup();
  setMessages(null);
});

describe('Meldingen', () => {
  it('zonder props: één regio "Meldingen" met alle meldingen en de ernst in woorden', () => {
    const { container } = render(<Messages />);
    const region = screen.getByRole('region', { name: 'Meldingen' });
    expect(titles(region)).toEqual([
      'Niet te dimensioneren',
      'Te koud met begrenzer',
      'Tapwater veroorzaakt de piek',
    ]);
    // ernst als tekstlabel; het teken is aria-hidden, dus kleur en teken zijn nooit de enige drager
    expect(screen.getByText('Kritiek').textContent).toBe('✕ Kritiek');
    expect(screen.getByText('Let op').textContent).toBe('! Let op');
    expect(screen.getByText('Info').textContent).toBe('i Info');
    for (const icon of ['✕', '!', 'i'])
      expect(screen.getByText(icon).getAttribute('aria-hidden')).toBe('true');
    // "Waarom?" per melding, ingeklapt
    const why = within(region).getAllByText('Waarom?');
    expect(why).toHaveLength(3);
    for (const s of why) expect(s.tagName).toBe('SUMMARY');
    expect(container.querySelectorAll('details[open]')).toHaveLength(0);
  });

  it('include: alleen die meldingen; compact: geen eigen regio', () => {
    const { container } = render(<Messages include={['dhwPeak', 'comfortLoss', 'preheatPeak']} compact />);
    expect(screen.queryByRole('region')).toBeNull();
    // volgorde van het model (op ernst), niet van include
    expect(titles(container)).toEqual(['Te koud met begrenzer', 'Tapwater veroorzaakt de piek']);
    expect(screen.queryByText('Kritiek')).toBeNull();
  });

  it('exclude: alle meldingen behalve die', () => {
    render(<Messages exclude={['sizingFailed']} />);
    const region = screen.getByRole('region', { name: 'Meldingen' });
    expect(titles(region)).toEqual(['Te koud met begrenzer', 'Tapwater veroorzaakt de piek']);
  });

  it('include en exclude samen: exclude wint', () => {
    const { container } = render(
      <Messages include={['comfortLoss', 'dhwPeak']} exclude={['dhwPeak']} compact />,
    );
    expect(titles(container)).toEqual(['Te koud met begrenzer']);
  });

  it('zonder meldingen: "Geen bijzonderheden.", in een regio of compact zonder regio', () => {
    setMessages([]);
    const full = render(<Messages />);
    expect(
      within(screen.getByRole('region', { name: 'Meldingen' })).getByText('Geen bijzonderheden.'),
    ).toBeTruthy();
    full.unmount();
    // ook als het filter niets overlaat
    setMessages(ALL);
    render(<Messages include={['bufferPlateau']} compact />);
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.getByText('Geen bijzonderheden.')).toBeTruthy();
  });

  it('hideEmpty: niets als er niets te melden is, anders gewoon de meldingen', () => {
    const empty = render(<Messages include={['bufferPlateau', 'smallBufferDeltaT']} compact hideEmpty />);
    expect(empty.container.firstChild).toBeNull();
    expect(screen.queryByText('Geen bijzonderheden.')).toBeNull();
    empty.unmount();
    const some = render(<Messages include={['comfortLoss']} compact hideEmpty />);
    expect(titles(some.container)).toEqual(['Te koud met begrenzer']);
  });

  it('zonder doorrekening: niets', () => {
    setMessages(null);
    const { container } = render(<Messages />);
    expect(container.firstChild).toBeNull();
  });
});
