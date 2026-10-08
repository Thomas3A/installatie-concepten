import { describe, expect, it } from 'vitest';
import { cp, lambda, mu, rho } from '../src/core/water';
import { dewPoint } from '../src/core/psychro';
import { churchill, pipeDp, reynolds } from '../src/core/hydraulics/friction';
import { nusselt } from '../src/core/hydraulics/heatTransfer';
import { prandtl } from '../src/core/water';

const near = (a: number, b: number, tol: number) => expect(Math.abs(a / b - 1)).toBeLessThan(tol);

describe('stofwaarden water', () => {
  it('20 °C', () => {
    near(rho(20), 998.23, 0.01);
    near(cp(20), 4181.6, 0.01);
    near(mu(20), 1.0017e-3, 0.01);
    near(lambda(20), 0.599, 0.01);
  });
  it('35 °C', () => {
    near(rho(35), 994.06, 0.01);
    near(cp(35), 4177.9, 0.01);
    near(mu(35), 7.185e-4, 0.01);
    near(lambda(35), 0.6206, 0.01);
  });
});

describe('dauwpunt', () => {
  it('referentiewaarden', () => {
    expect(dewPoint(24, 50)).toBeCloseTo(12.93, 1);
    expect(dewPoint(26, 60)).toBeCloseTo(17.63, 1);
    expect(dewPoint(24, 65)).toBeCloseTo(17.01, 1);
  });
});

describe('wrijving en drukval', () => {
  it('Di 7 mm, 10 m, 60 l/h, 17,5 °C', () => {
    const q = 60 / 3.6e6;
    const Re = reynolds(q, 0.007, 17.5);
    near(Re, 2841, 0.01);
    const f = churchill(Re, 0.0015e-3 / 0.007);
    near(f, 0.0419, 0.02);
    const dp = pipeDp({ q, d: 0.007, len: 10, eps: 0.0015e-3, T: 17.5 });
    near(dp, 5610, 0.03);
  });
  it('laminair: f = 64/Re bij 20 l/h', () => {
    const Re = reynolds(20 / 3.6e6, 0.007, 17.5);
    near(churchill(Re, 2e-4), 64 / Re, 0.005);
  });
});

describe('Nusselt', () => {
  it('referentiewaarden', () => {
    near(nusselt(1500, 7), 3.66, 1e-9);
    near(nusselt(4000, prandtl(17.5)), 20.9, 0.03);
    near(nusselt(10000, prandtl(17.5)), 81.5, 0.02);
  });
});
