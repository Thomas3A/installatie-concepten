// Getalnotatie en het teruglezen van getallen uit invoervelden (src/core/format.ts).
import { describe, expect, it } from 'vitest';
import { fmt, MINUS, parseNum } from '../../src/core/format';

describe('fmt: nl-NL met een echt minteken', () => {
  it('negatieve getallen krijgen U+2212 in plaats van het koppelteken', () => {
    expect(MINUS).toBe('−');
    expect(fmt(-4.2, 1)).toBe('−4,2');
    expect(fmt(-12, 0)).toBe('−12');
    expect(fmt(-1234.5, 1)).toBe('−1.234,5');
    expect(fmt(-4.2, 1)).not.toContain('-');
  });

  it('positieve getallen en niet-eindige waarden blijven gelijk', () => {
    expect(fmt(1234.567, 1)).toBe('1.234,6');
    expect(fmt(0.5, 2)).toBe('0,50');
    expect(fmt(NaN)).toBe('–');
    expect(fmt(Infinity)).toBe('–');
    expect(fmt(null)).toBe('–');
  });

  it('een waarde die op nul afrondt, krijgt geen minteken', () => {
    expect(fmt(-0.04, 1)).toBe('0,0');
    expect(fmt(-0, 0)).toBe('0');
    expect(fmt(-0.004, 2)).toBe('0,00');
    expect(fmt(-0.06, 1)).toBe('−0,1');
  });
});

describe('parseNum: getal uit een invoerveld', () => {
  it('leest komma en punt als decimaalteken', () => {
    expect(parseNum('8,5')).toBe(8.5);
    expect(parseNum('1.5')).toBe(1.5);
    expect(parseNum(' 12 ')).toBe(12);
    expect(parseNum('0.250')).toBe(0.25);
  });

  it('leest de duizendtalscheiding zoals fmt() die toont', () => {
    expect(parseNum('1.234')).toBe(1234);
    expect(parseNum('1.234,5')).toBe(1234.5);
    expect(parseNum(fmt(12345.6, 1))).toBe(12345.6);
  });

  it('accepteert het minteken van fmt() en het koppelteken', () => {
    expect(parseNum(fmt(-12, 0))).toBe(-12);
    expect(parseNum('−5,5')).toBe(-5.5);
    expect(parseNum('-5,5')).toBe(-5.5);
    expect(parseNum('– 3')).toBe(-3);
  });

  it('lege of ongeldige tekst geeft null (niet 0)', () => {
    expect(parseNum('')).toBeNull();
    expect(parseNum('   ')).toBeNull();
    expect(parseNum('abc')).toBeNull();
    expect(parseNum('1,2,3')).toBeNull();
    expect(parseNum('–')).toBeNull();
    expect(parseNum('5 kW')).toBeNull();
  });
});
