// Generieke solver voor parallelle strengen aan een verdeelleiding (direct retour of Tichelmann).
// Geen kennis van panelen of kleppen: de strengkarakteristiek en de leidingverliezen worden aangeleverd.

export interface NetworkInput {
  /** Drukval van streng i als functie van het debiet (Pa, m³/s). Monotoon stijgend. */
  strandDp: ((q: number) => number)[];
  /** Lengte van verdeelleidingsegment k (k = 0..n-1): x_1, hart-op-hart, ... (m). */
  segLen: number[];
  /** Drukval van één leiding (aanvoer of retour) voor debiet F en lengte l (Pa). */
  pipeDp: (q: number, len: number) => number;
  layout: 'direct' | 'tichelmann';
  /** Totaal debiet in m³/s (opgelegd door de klep). */
  qTot: number;
}

export interface NetworkResult {
  q: number[];
  /** Drukverschil direct na de klep (Pa), de "circuitkarakteristiek" bij qTot. */
  dp0: number;
  /** Drukverschil beschikbaar over streng i (Pa). */
  dpStrand: number[];
  iterations: number;
  converged: boolean;
  massError: number;
}

/** Drukverschil dat streng i "ziet" als functie van de stroomverdeling q en dp0. */
function stationPressures(inp: NetworkInput, q: number[], dp0: number): number[] {
  const n = q.length;
  const F: number[] = new Array(n); // F_k = som_{j>=k} q_j
  let acc = 0;
  for (let k = n - 1; k >= 0; k--) {
    acc += q[k];
    F[k] = acc;
  }
  const qTot = acc;
  const out = new Array<number>(n);
  if (inp.layout === 'direct') {
    let loss = 0;
    for (let i = 0; i < n; i++) {
      loss += 2 * inp.pipeDp(F[i], inp.segLen[i]);
      out[i] = dp0 - loss;
    }
    return out;
  }
  // Tichelmann: aanvoer als direct retour, retourverzamelleiding loopt mee van streng 1 naar n.
  const Ps = new Array<number>(n);
  let ps = dp0;
  for (let i = 0; i < n; i++) {
    ps -= inp.pipeDp(F[i], inp.segLen[i]);
    Ps[i] = ps;
  }
  let xn = 0;
  for (let i = 0; i < n; i++) xn += inp.segLen[i];
  const Pr = new Array<number>(n);
  Pr[n - 1] = inp.pipeDp(qTot, xn);
  let G = qTot; // wordt hieronder herberekend per segment
  for (let i = n - 2; i >= 0; i--) {
    // G_i = som_{j<=i} q_j
    G = 0;
    for (let j = 0; j <= i; j++) G += q[j];
    Pr[i] = Pr[i + 1] + inp.pipeDp(G, inp.segLen[i + 1]);
  }
  for (let i = 0; i < n; i++) out[i] = Ps[i] - Pr[i];
  return out;
}

function residuals(inp: NetworkInput, x: number[], qScale: number, pScale: number): number[] {
  const n = inp.strandDp.length;
  const q = x.slice(0, n).map((v) => Math.max(v * qScale, 1e-9));
  const dp0 = x[n] * pScale;
  const dpS = stationPressures(inp, q, dp0);
  const r = new Array<number>(n + 1);
  for (let i = 0; i < n; i++) r[i] = (dpS[i] - inp.strandDp[i](q[i])) / pScale;
  let s = 0;
  for (let i = 0; i < n; i++) s += q[i];
  r[n] = (s - inp.qTot) / qScale / n;
  return r;
}

/** Gauss-eliminatie met partiële pivotering. */
function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array<number>(n);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

const norm = (v: number[]): number => Math.sqrt(v.reduce((a, b) => a + b * b, 0));

/** Inverteer een monotone drukval-functie met bisectie: vind q met dp(q) = target. */
function invertDp(dp: (q: number) => number, target: number, qMax: number): number {
  if (target <= 0) return 1e-9;
  let lo = 1e-9;
  let hi = Math.max(qMax, 1e-6);
  while (dp(hi) < target && hi < 1) hi *= 2;
  for (let i = 0; i < 60; i++) {
    const mid = Math.sqrt(lo * hi);
    if (dp(mid) < target) lo = mid;
    else hi = mid;
  }
  return Math.sqrt(lo * hi);
}

/** Fallback: successieve onderrelaxatie met bisectie op dp0. */
function fallback(inp: NetworkInput, q0: number[]): number[] {
  const n = q0.length;
  let q = q0.slice();
  let dp0 = 0;
  for (let it = 0; it < 400; it++) {
    // kies dp0 zodat sum(q_new) = qTot
    const qNew = (d0: number): number[] => {
      const dpS = stationPressures(inp, q, d0);
      return dpS.map((p, i) => invertDp(inp.strandDp[i], p, inp.qTot));
    };
    let lo = 0;
    let hi = Math.max(1, inp.strandDp.reduce((a, f) => a + f(inp.qTot), 0));
    for (let k = 0; k < 60; k++) {
      const mid = 0.5 * (lo + hi);
      const s = qNew(mid).reduce((a, b) => a + b, 0);
      if (s < inp.qTot) lo = mid;
      else hi = mid;
    }
    dp0 = 0.5 * (lo + hi);
    const target = qNew(dp0);
    const sum = target.reduce((a, b) => a + b, 0);
    const scaled = target.map((v) => (v * inp.qTot) / sum);
    let diff = 0;
    for (let i = 0; i < n; i++) {
      const nq = 0.5 * q[i] + 0.5 * scaled[i];
      diff = Math.max(diff, Math.abs(nq - q[i]) / inp.qTot);
      q[i] = nq;
    }
    if (diff < 1e-10) break;
  }
  void dp0;
  return q;
}

export function solveNetwork(inp: NetworkInput): NetworkResult {
  const n = inp.strandDp.length;
  if (n === 0 || inp.qTot <= 0) {
    return { q: new Array(n).fill(0), dp0: 0, dpStrand: new Array(n).fill(0), iterations: 0, converged: true, massError: 0 };
  }
  const qScale = inp.qTot / n;
  // Drukschaal: de gemiddelde strengdrukval bij gelijke verdeling
  const pScale = Math.max(inp.strandDp[0](qScale), 1);
  // Startwaarde: gelijke verdeling
  let x: number[] = [...new Array<number>(n).fill(1), 0];
  const q0 = x.slice(0, n).map((v) => v * qScale);
  x[n] = Math.max(...stationPressures(inp, q0, 0).map((p) => -p), 0) / pScale + inp.strandDp[0](qScale) / pScale;

  let converged = false;
  let it = 0;
  let r = residuals(inp, x, qScale, pScale);
  for (; it < 50; it++) {
    const rn = norm(r);
    if (rn < 1e-9) {
      converged = true;
      break;
    }
    // Numerieke Jacobiaan
    const J: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(n + 1).fill(0));
    for (let j = 0; j <= n; j++) {
      const h = 1e-6 * Math.max(Math.abs(x[j]), 1e-3);
      const xp = x.slice();
      xp[j] += h;
      const rp = residuals(inp, xp, qScale, pScale);
      for (let i = 0; i <= n; i++) J[i][j] = (rp[i] - r[i]) / h;
    }
    const dx = solveLinear(J, r.map((v) => -v));
    if (!dx) break;
    // Gedempte stap (backtracking) met q >= 1e-9
    let lam = 1;
    let accepted = false;
    for (let k = 0; k < 30; k++) {
      const xn = x.map((v, i) => v + lam * dx[i]);
      let ok = true;
      for (let i = 0; i < n; i++) if (xn[i] * qScale < 1e-9) ok = false;
      if (ok) {
        const rnn = residuals(inp, xn, qScale, pScale);
        if (norm(rnn) < rn || k === 29) {
          x = xn;
          r = rnn;
          accepted = true;
          break;
        }
      }
      lam *= 0.5;
    }
    if (!accepted) break;
  }
  if (!converged && norm(r) < 1e-9) converged = true;

  let q = x.slice(0, n).map((v) => Math.max(v * qScale, 1e-9));
  if (!converged) {
    q = fallback(inp, q);
    converged = true;
  }
  const sum = q.reduce((a, b) => a + b, 0);
  // exacte massabalans
  q = q.map((v) => (v * inp.qTot) / sum);
  const dpS0 = x[n] * pScale;
  // dp0 zo bepalen dat gemiddeld verschil klopt: herbereken uit streng 1
  const dpAt = stationPressures(inp, q, 0);
  const dp0 = inp.strandDp[0](q[0]) - dpAt[0];
  const dpStrand = dpAt.map((p) => p + dp0);
  void dpS0;
  return { q, dp0, dpStrand, iterations: it, converged, massError: Math.abs(q.reduce((a, b) => a + b, 0) - inp.qTot) / inp.qTot };
}
