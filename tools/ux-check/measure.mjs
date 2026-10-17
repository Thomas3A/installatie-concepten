#!/usr/bin/env node
// UX-meting van de peakshaving-pagina (#/peakshaving), UX-plan §11 "Meetbaar met tools/ux-check/measure.mjs".
// Alleen desktop (1280×800, 1440×900, 1920×1080): de tool is bedoeld voor een pc of laptop.
//
// Het script start een eigen Vite-server voor een repo-map (of gebruikt een bestaande via --url), opent de pagina in
// Chromium (locale nl-NL, prefers-reduced-motion) en meet na de eerste doorrekening per breedte en toestand:
// woorden boven de vouw, zichtbare bedieningselementen, tabstops tot de oordeelkaart, de skip-link, de plek van de
// oordeelkop en de schuiven, horizontale overflow, geneste scroll en het aantal printpagina's (page.pdf, A4 staand).
// Werkt op de nieuwe opzet (H2 #ps-resultaat) en op de oude (regio "Resultaat"); toestanden die alleen in de nieuwe
// opzet bestaan (Basis ingeklapt, toast) zijn "n.v.t." voor de oude.
//
// Gebruik: zie tools/ux-check/README.md of `node tools/ux-check/measure.mjs --help`.
/* global process, console, setTimeout, fetch, URL,
   document, window, localStorage, sessionStorage, getComputedStyle, NodeFilter, SVGElement, Event */

import { execFileSync, execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_DEFAULT = path.resolve(SCRIPT_DIR, '../..');
const ROUTE = '#/peakshaving';
const DEFAULT_VIEWPORTS = '1280x800,1440x900,1920x1080';
/** Breedte waarop print, "Bekijk het resultaat" en de doelen uit §11 worden gemeten. */
const MAIN_VIEWPORT = '1440x900';
const STORAGE_BASIS = 'ps-basis-v1';
const MAX_TAB_STOPS = 250;

const HELP = `UX-meting peakshaving (UX-plan §11), alleen desktop.

  node tools/ux-check/measure.mjs [opties]

Opties:
  --repo DIR          repo-map waarvoor een Vite-server start (standaard: deze repo)
  --url URL           bestaande server gebruiken (bijv. http://localhost:5173/); start dan geen eigen server
  --port N            poort voor de eigen server (standaard: een vrije poort)
  --label TEKST       naam in de uitvoer (standaard: branch en commit)
  --out BASIS         schrijf BASIS.json en BASIS.md (zonder --out: Markdown naar stdout)
  --compare FILE      vergelijk met een eerdere meting (bijv. tools/ux-check/baseline.json)
  --shots DIR         schermafdrukken (venster per toestand) en de print-PDF in DIR bewaren
  --viewports LIJST   standaard ${DEFAULT_VIEWPORTS}
  --baseline [REF]    meet REF (standaard origin/main) in een tijdelijke git worktree en schrijf
                      tools/ux-check/baseline.json en .md (tenzij --out); de worktree gaat daarna weg
  --worktree DIR      map voor die worktree (standaard ${path.join(os.tmpdir(), 'ux-baseline')})
  --help              deze tekst
`;

// ---------------------------------------------------------------- argumenten

function parseArgs(argv) {
  const o = { viewports: DEFAULT_VIEWPORTS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} verwacht een waarde`);
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--repo') o.repo = path.resolve(next());
    else if (a === '--url') o.url = next();
    else if (a === '--port') o.port = Number(next());
    else if (a === '--label') o.label = next();
    else if (a === '--out') o.out = path.resolve(next());
    else if (a === '--compare') o.compare = path.resolve(next());
    else if (a === '--shots') o.shots = path.resolve(next());
    else if (a === '--viewports') o.viewports = next();
    else if (a === '--worktree') o.worktree = path.resolve(next());
    else if (a === '--baseline') {
      // optionele ref direct erna
      o.baseline = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'origin/main';
    } else throw new Error(`Onbekende optie ${a} (zie --help)`);
  }
  o.viewportList = o.viewports.split(',').map((s) => {
    const m = /^(\d+)x(\d+)$/.exec(s.trim());
    if (!m) throw new Error(`Ongeldige viewport "${s}" (verwacht bijv. 1440x900)`);
    return { width: Number(m[1]), height: Number(m[2]), key: `${m[1]}x${m[2]}` };
  });
  return o;
}

// ---------------------------------------------------------------- hulpmiddelen (Node)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadChromium() {
  const req = createRequire(import.meta.url);
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright'];
  try {
    candidates.push(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
  } catch {
    // npm niet beschikbaar: alleen de andere kandidaten
  }
  for (const c of candidates.filter(Boolean)) {
    try {
      return req(c).chromium;
    } catch {
      // volgende kandidaat
    }
  }
  throw new Error('Playwright niet gevonden (lokaal, globaal of via PLAYWRIGHT_MODULE).');
}

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
}

function gitInfo(repo, ref) {
  try {
    const commit = git(repo, ['rev-parse', '--short', 'HEAD']);
    const branch = git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']);
    const dirty = git(repo, ['status', '--porcelain']).length > 0;
    return { ref: ref ?? (branch === 'HEAD' ? 'detached' : branch), commit, dirty };
  } catch {
    return { ref: ref ?? null, commit: null, dirty: null };
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Vite-server in `repo` starten; geeft de URL en een stopfunctie. */
async function startServer(repo, port) {
  const child = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: repo,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, BROWSER: 'none', FORCE_COLOR: '0' },
  });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  let exited = false;
  child.on('exit', () => (exited = true));
  const stop = () => {
    if (exited) return;
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // al gestopt
    }
  };
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (exited) throw new Error(`Vite stopte meteen in ${repo}:\n${log}`);
    try {
      const r = await fetch(url);
      if (r.ok) return { url, stop };
    } catch {
      // nog niet klaar
    }
    await sleep(250);
  }
  stop();
  throw new Error(`Vite kwam niet op in 90 s (${repo}):\n${log}`);
}

/** Git worktree van `ref` in `dir` met een symlink naar de node_modules van de repo. Geeft een opruimfunctie. */
function addWorktree(repo, ref, dir) {
  const listed = git(repo, ['worktree', 'list', '--porcelain'])
    .split('\n')
    .filter((l) => l.startsWith('worktree '))
    .map((l) => path.resolve(l.slice('worktree '.length)));
  if (listed.includes(path.resolve(dir))) {
    removeWorktree(repo, dir);
  } else if (fs.existsSync(dir)) {
    throw new Error(
      `${dir} bestaat al en is geen worktree van deze repo; kies een andere map met --worktree.`,
    );
  }
  git(repo, ['worktree', 'add', '--detach', dir, ref]);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
  return () => removeWorktree(repo, dir);
}

function removeWorktree(repo, dir) {
  // eerst de symlink zelf weg, zodat niets ooit de node_modules van de repo raakt
  try {
    const nm = path.join(dir, 'node_modules');
    if (fs.lstatSync(nm).isSymbolicLink()) fs.unlinkSync(nm);
  } catch {
    // geen symlink
  }
  try {
    git(repo, ['worktree', 'remove', '--force', dir]);
  } catch (e) {
    console.error(`Worktree ${dir} niet verwijderd: ${e.message}`);
  }
}

function pdfInfo(buf) {
  const s = buf.toString('latin1');
  const leaves = (s.match(/\/Type\s*\/Page(?![a-zA-Z])/g) ?? []).length;
  const counts = [...s.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  const box = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(s);
  const w = box ? Number(box[3]) - Number(box[1]) : null;
  const h = box ? Number(box[4]) - Number(box[2]) : null;
  return {
    pages: counts.length ? Math.max(...counts) : leaves,
    pageSizePt: box ? `${Math.round(w)}×${Math.round(h)}` : null,
    a4Portrait: box ? Math.abs(w - 595.28) < 3 && Math.abs(h - 841.89) < 3 : null,
  };
}

// ---------------------------------------------------------------- metingen in de pagina (geserialiseerd)

/**
 * Alles wat in één keer uit de DOM te halen is. Draait in de browser: geen verwijzingen naar de scope hierbuiten.
 * Telregel woorden (UX-plan §11): woorden met een letter of cijfer in tekstknopen waarvan het element zichtbaar is
 * (checkVisibility(), niet aria-hidden, niet in een gesloten <details> of [hidden], niet visueel verborgen) en waarvan
 * de rect het venster raakt, na afknippen door scrollende voorouders. <option> telt niet mee; SVG-tekst wel.
 */
function measureInPage() {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const VIEW = { left: 0, top: 0, right: vw, bottom: vh };
  const styles = new Map();
  const cs = (el) => {
    let s = styles.get(el);
    if (!s) styles.set(el, (s = getComputedStyle(el)));
    return s;
  };
  const meet = (a, b) => ({
    left: Math.max(a.left, b.left),
    top: Math.max(a.top, b.top),
    right: Math.min(a.right, b.right),
    bottom: Math.min(a.bottom, b.bottom),
  });
  const hasArea = (r) => r.right - r.left > 1 && r.bottom - r.top > 1;

  // deel van het venster waarin de inhoud van el zichtbaar is (afgeknipt door el en zijn voorouders)
  const clips = new Map();
  function contentClip(el) {
    if (!el || el === document.documentElement || el === document.body) return VIEW;
    let c = clips.get(el);
    if (c) return c;
    const s = cs(el);
    c = s.position === 'fixed' ? VIEW : contentClip(el.parentElement);
    const clipsContent = s.overflowX !== 'visible' || s.overflowY !== 'visible';
    if (clipsContent && s.display !== 'inline' && s.display !== 'contents') {
      const r = el.getBoundingClientRect();
      const left = r.left + el.clientLeft;
      const top = r.top + el.clientTop;
      c = meet(c, { left, top, right: left + el.clientWidth, bottom: top + el.clientHeight });
    }
    clips.set(el, c);
    return c;
  }
  // deel van het venster waarin el zelf zichtbaar is
  const outerClip = (el) => (cs(el).position === 'fixed' ? VIEW : contentClip(el.parentElement));

  // visueel verborgen (sr-only: clip rect(0 0 0 0) of clip-path inset(50%)), ook via een voorouder
  const srHidden = new Map();
  function visuallyHidden(el) {
    if (!el || el === document.body) return false;
    let v = srHidden.get(el);
    if (v !== undefined) return v;
    const s = cs(el);
    v =
      ((s.position === 'absolute' || s.position === 'fixed') &&
        /rect\(0(px)?,? 0(px)?,? 0(px)?,? 0(px)?\)/.test(s.clip)) ||
      /^inset\((50|100)%/.test(s.clipPath) ||
      visuallyHidden(el.parentElement);
    srHidden.set(el, v);
    return v;
  }
  // in een gesloten <details>, behalve in de eigen summary daarvan
  function inClosedDetails(el) {
    for (let a = el; a; a = a.parentElement) {
      if (a.tagName === 'DETAILS' && !a.open) {
        const summary = a.querySelector(':scope > summary');
        if (!summary || !summary.contains(el)) return true;
      }
    }
    return false;
  }
  const shownCache = new Map();
  function shown(el, respectAriaHidden) {
    const key = respectAriaHidden ? 1 : 0;
    let entry = shownCache.get(el);
    if (!entry) shownCache.set(el, (entry = [undefined, undefined]));
    if (entry[key] !== undefined) return entry[key];
    const v =
      el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) &&
      !el.closest('[hidden]') &&
      !(respectAriaHidden && el.closest('[aria-hidden="true"]')) &&
      !inClosedDetails(el) &&
      !visuallyHidden(el);
    entry[key] = v;
    return v;
  }
  const regionOf = (el) => {
    const sec = el.closest('section[aria-label]');
    if (sec) {
      // binnen "Resultaat": de buitenste benoemde sectie telt
      let top = sec;
      for (let a = sec.parentElement; a; a = a.parentElement) if (a.matches('section[aria-label]')) top = a;
      return top.getAttribute('aria-label');
    }
    if (el.closest('header')) return 'siteheader';
    if (el.closest('footer')) return 'footer';
    return 'overig';
  };

  // ---- woorden boven de vouw
  const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;
  const SKIP = 'option,optgroup,select,script,style,noscript,template,textarea,title,desc,metadata';
  const range = document.createRange();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let words = 0;
  const wordsByRegion = {};
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.nodeValue;
    if (!text || !HAS_WORD_CHAR.test(text)) continue;
    const el = n.parentElement;
    if (!el || el.closest(SKIP) || !shown(el, true)) continue;
    const clip = contentClip(el);
    if (!hasArea(clip)) continue;
    const isSvg = el instanceof SVGElement;
    for (const m of text.matchAll(/\S+/g)) {
      if (!HAS_WORD_CHAR.test(m[0])) continue;
      range.setStart(n, m.index);
      range.setEnd(n, m.index + m[0].length);
      let r = range.getBoundingClientRect();
      if ((r.width === 0 || r.height === 0) && isSvg) r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (!hasArea(meet(r, clip))) continue;
      words++;
      const reg = regionOf(el);
      wordsByRegion[reg] = (wordsByRegion[reg] ?? 0) + 1;
    }
  }

  // ---- zichtbare bedieningselementen in het venster
  const CONTROLS =
    'a[href],button,input:not([type="hidden"]),select,textarea,summary,[role="button"],[role="tab"],[role="slider"],' +
    '[role="checkbox"],[role="radio"],[role="switch"],[role="link"],[role="spinbutton"],[role="combobox"],[role="menuitem"]';
  const kinds = {};
  let controls = 0;
  let disabled = 0;
  for (const el of document.querySelectorAll(CONTROLS)) {
    if (!shown(el, false)) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1 || !hasArea(meet(r, outerClip(el)))) continue;
    controls++;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') disabled++;
    const role = el.getAttribute('role');
    const kind = role ?? el.tagName.toLowerCase() + (el.tagName === 'INPUT' ? `:${el.type}` : '');
    kinds[kind] = (kinds[kind] ?? 0) + 1;
  }

  // ---- posities
  const firstShown = (els) => els.find((e) => shown(e, false)) ?? els[0] ?? null;
  const h2 = document.getElementById('ps-resultaat');
  const region = document.querySelector('section[aria-label="Resultaat"]');
  const card = h2
    ? (document.getElementById('ps-oordeel') ?? h2.closest('[data-tour="verdict"]') ?? region)
    : null;
  let verdictEl = null;
  if (h2) {
    verdictEl = document.getElementById('ps-oordeel-kop') ?? card?.querySelector('p') ?? h2;
  } else if (region) {
    // oude opzet: de eerste KPI-kaart, anders het eerste zichtbare blok met tekst in de regio "Resultaat"
    verdictEl =
      region.querySelector('[aria-label="Kerngetallen"] > *') ??
      firstShown([...region.children].filter((c) => c.textContent.trim()));
  }
  const slider = (label) => {
    const ranges = [...document.querySelectorAll(`input[type="range"][aria-label="${label} (schuif)"]`)];
    if (ranges.length) return firstShown(ranges);
    const labels = [...document.querySelectorAll('label')].filter((l) => l.textContent.trim() === label);
    return firstShown(labels.map((l) => l.control).filter(Boolean));
  };
  const stepperBtn = firstShown([...document.querySelectorAll('button[aria-label="Grotere aansluiting"]')]);
  const stepperEl = stepperBtn ? (stepperBtn.closest('[role="group"]') ?? stepperBtn.parentElement) : null;
  const position = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const clip = outerClip(el);
    const visible = shown(el, false) && r.width > 0 && r.height > 0;
    return {
      top: Math.round(r.top + window.scrollY),
      bottom: Math.round(r.bottom + window.scrollY),
      height: Math.round(r.height),
      fullyInView:
        visible &&
        r.top >= clip.top - 0.5 &&
        r.bottom <= clip.bottom + 0.5 &&
        r.left >= clip.left - 0.5 &&
        r.right <= clip.right + 0.5,
      partlyInView: visible && hasArea(meet(r, clip)),
    };
  };

  // ---- geneste scroll: elementen met overflow-y auto/scroll die echt verticaal scrollen
  const describe = (el) => {
    const cls = (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)[0];
    const label = el.getAttribute('aria-label');
    return (
      el.tagName.toLowerCase() +
      (el.id ? `#${el.id}` : '') +
      (cls ? `.${cls}` : '') +
      (label ? `[aria-label="${label}"]` : '') +
      ` in "${regionOf(el)}"`
    );
  };
  const nestedScroll = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.matches('select,textarea,input,option')) continue;
    const s = cs(el);
    if (s.overflowY !== 'auto' && s.overflowY !== 'scroll') continue;
    if (el.scrollHeight <= el.clientHeight + 1 || !el.checkVisibility()) continue;
    // toegestaan (§11): ScrollRegion (role="region" met tabindex) en tabelomhullingen
    const allowed =
      (el.getAttribute('role') === 'region' && el.hasAttribute('tabindex')) ||
      !!el.querySelector(':scope > table') ||
      /tableWrap/i.test(el.getAttribute('class') ?? '');
    nestedScroll.push({
      element: describe(el),
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      allowed,
    });
  }

  const strip = document.querySelector('[role="toolbar"][aria-label="Basis"]');
  return {
    ui: h2 ? 'nieuw' : 'oud',
    basisCollapsed: !!strip && shown(strip, false),
    words,
    wordsByRegion,
    controls: { count: controls, disabled, kinds },
    positions: {
      verdict: position(verdictEl),
      buffer: position(slider('Buffervolume')),
      battery: position(slider('Batterijcapaciteit')),
      stepper: position(stepperEl),
    },
    horizontalOverflow: {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: vw,
      overflow: document.documentElement.scrollWidth > vw,
    },
    nestedScroll: { count: nestedScroll.filter((x) => !x.allowed).length, items: nestedScroll },
    pageHeight: document.documentElement.scrollHeight,
  };
}

// ---------------------------------------------------------------- stappen per pagina

/** Wacht op de eerste doorrekening en daarna op rust (ook het gevoeligheidsraster van de nieuwe opzet). */
async function waitForResult(page) {
  await page.waitForFunction(
    () => {
      const region = document.querySelector('section[aria-label="Resultaat"]');
      if (!region || region.getAttribute('aria-busy') === 'true') return false;
      return !!(
        document.getElementById('ps-oordeel-kop') || region.querySelector('[aria-label="Kerngetallen"]')
      );
    },
    null,
    { timeout: 90_000, polling: 100 },
  );
  const firstResultAt = Date.now();
  // rust: de tekst buiten de tabbladen verandert 1 s niet, niets is bezig en er staat geen "wordt berekend" meer
  const signature = () =>
    page.evaluate(() => {
      const region = document.querySelector('section[aria-label="Resultaat"]');
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) =>
          n.parentElement?.closest('[role="tabpanel"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
      });
      let text = '';
      for (let n = walker.nextNode(); n; n = walker.nextNode()) text += n.nodeValue;
      const busy = region?.getAttribute('aria-busy') === 'true' || /wordt berekend|Rekent…/.test(text);
      return busy ? null : text;
    });
  let last = null;
  let same = 0;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const sig = await signature();
    same = sig !== null && sig === last ? same + 1 : 0;
    last = sig;
    if (same >= 4) return { firstResultAt, settled: true };
    await sleep(250);
  }
  return { firstResultAt, settled: false };
}

async function newPage(browser, vp, { collapsed }) {
  const context = await browser.newContext({
    locale: 'nl-NL',
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'light',
  });
  await context.addInitScript(
    ({ collapsed, key }) => {
      // alleen bij het eerste laden van deze context: een schone start (eerste bezoek of terugkerend)
      try {
        if (!sessionStorage.getItem('ux-check')) {
          sessionStorage.setItem('ux-check', '1');
          localStorage.clear();
          if (collapsed) localStorage.setItem(key, 'dicht');
        }
      } catch {
        // geen opslag: de pagina gebruikt dan haar standaard
      }
      // printen zonder dialoog: beforeprint zoals een echte browser; afterprint stuurt het script na page.pdf
      window.__uxPrintCalls = 0;
      window.print = () => {
        window.__uxPrintCalls++;
        window.dispatchEvent(new Event('beforeprint'));
      };
    },
    { collapsed, key: STORAGE_BASIS },
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return { context, page, errors };
}

async function load(page, base) {
  const t0 = Date.now();
  await page.goto(new URL(ROUTE, base).href);
  const { firstResultAt, settled } = await waitForResult(page);
  return { firstResultMs: firstResultAt - t0, settled };
}

/** Focus terug naar het begin van de pagina (body), zodat de volgende Tab bij het eerste element begint. */
async function focusTop(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    const b = document.body;
    b.tabIndex = -1;
    b.focus();
    b.removeAttribute('tabindex');
  });
}

/** Tabstops vanaf de bovenkant tot het eerste focusbare element in de oordeelkaart (oud: in de regio "Resultaat"). */
async function tabWalk(page) {
  await focusTop(page);
  const stops = [];
  let reached = null;
  let skipStop = null;
  for (let i = 1; i <= MAX_TAB_STOPS; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return null;
      const h2 = document.getElementById('ps-resultaat');
      const region = document.querySelector('section[aria-label="Resultaat"]');
      const card = h2
        ? (document.getElementById('ps-oordeel') ?? h2.closest('[data-tour="verdict"]') ?? region)
        : region;
      const name = (a.getAttribute('aria-label') ?? a.labels?.[0]?.textContent ?? a.textContent ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 60);
      const kind = a.tagName.toLowerCase() + (a.tagName === 'INPUT' ? `:${a.type}` : '');
      return {
        text: `${kind} "${name}"`,
        inTarget: !!card && card !== a && card.contains(a),
        skip: /^Naar resultaat/.test(name),
      };
    });
    if (!info) break; // focus de pagina uit: niets meer te vinden
    stops.push(info.text);
    if (info.skip && skipStop === null) skipStop = i;
    if (info.inTarget) {
      reached = i;
      break;
    }
  }
  return {
    tabStops: reached,
    firstStops: stops.slice(0, 5),
    targetStop: reached ? stops[reached - 1] : null,
    skipStop,
  };
}

/** Skip-link activeren: staat de focus daarna op H2 "Resultaat" en is de oordeelkop in beeld? */
async function skipLinkCheck(page, stop) {
  await focusTop(page);
  for (let i = 0; i < stop; i++) await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await sleep(400);
  return page.evaluate(() => {
    const head = document.getElementById('ps-oordeel-kop');
    const r = head?.getBoundingClientRect();
    return {
      focusOnResult: document.activeElement?.id === 'ps-resultaat',
      verdictInView: !!r && r.top >= 0 && r.bottom <= document.documentElement.clientHeight,
    };
  });
}

/** "Bekijk het resultaat": klapt in, zet de focus op H2 "Resultaat", bewaart 'dicht'; na herladen nog dicht? */
async function showResultCheck(page) {
  const btn = page.getByRole('button', { name: 'Bekijk het resultaat' });
  if ((await btn.count()) === 0) return null;
  await btn.first().click();
  await sleep(600);
  const after = await page.evaluate((key) => {
    const strip = document.querySelector('[role="toolbar"][aria-label="Basis"]');
    const head = document.getElementById('ps-oordeel-kop');
    const r = head?.getBoundingClientRect();
    let stored = null;
    try {
      stored = localStorage.getItem(key);
    } catch {
      // geen opslag
    }
    return {
      focusOnResult: document.activeElement?.id === 'ps-resultaat',
      collapsed: !!strip,
      stored,
      verdictInView: !!r && r.top >= 0 && r.bottom <= document.documentElement.clientHeight,
    };
  }, STORAGE_BASIS);
  await page.reload();
  await waitForResult(page);
  const collapsedAfterReload = await page.evaluate(
    () => !!document.querySelector('[role="toolbar"][aria-label="Basis"]'),
  );
  return { ...after, collapsedAfterReload };
}

/** Printversie via de knop "Print / PDF" (window.print is vervangen), dan page.pdf op A4 staand. */
async function printCheck(page, shotsDir, label) {
  const btn = page.getByRole('button', { name: /^Print \/ PDF/ });
  if ((await btn.count()) === 0) return { pages: null, error: 'knop "Print / PDF" niet gevonden' };
  await btn.first().click();
  try {
    await page.waitForFunction(() => window.__uxPrintCalls > 0, null, { timeout: 60_000 });
  } catch {
    return { pages: null, error: 'de printversie riep window.print() niet aan binnen 60 s' };
  }
  const pdf = await page.pdf({
    format: 'A4',
    landscape: false,
    printBackground: true,
    preferCSSPageSize: true,
  });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  if (shotsDir) fs.writeFileSync(path.join(shotsDir, `${label}-print.pdf`), pdf);
  return pdfInfo(pdf);
}

/** Melding onderaan (toast) oproepen met de eerste knop bij het oordeel en dan meten. */
async function toastCheck(page) {
  const handle = await page.evaluateHandle(() => {
    const h2 = document.getElementById('ps-resultaat');
    const card = h2 && (document.getElementById('ps-oordeel') ?? h2.closest('[data-tour="verdict"]'));
    if (!card) return null;
    const groups = [...card.querySelectorAll('[role="group"]')];
    const labelOf = (g) =>
      (g.getAttribute('aria-labelledby') ?? '')
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ') ||
      (g.getAttribute('aria-label') ?? '');
    const fixGroup = groups.find((g) =>
      /^(Wat helpt|Kleinere aansluiting volstaat ook)/.test(labelOf(g).trim()),
    );
    const usable = (b) => b.checkVisibility() && !b.disabled && b.getAttribute('aria-disabled') !== 'true';
    return [...(fixGroup ?? card).querySelectorAll('button')].find(usable) ?? null;
  });
  const btn = handle.asElement();
  if (!btn) return { reached: false, reason: 'geen knop bij het oordeel gevonden' };
  const clicked = (await btn.textContent())?.trim() ?? '';
  await btn.click();
  try {
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('[role="status"]')].some((s) =>
          [...s.querySelectorAll('button')].some((b) =>
            /Ongedaan maken|Terug naar/.test(b.textContent ?? ''),
          ),
        ),
      null,
      { timeout: 5000 },
    );
  } catch {
    return { reached: false, reason: `geen melding na een klik op "${clicked}"` };
  }
  // de doorrekening na de knop afwachten (de melding staat 8 s)
  await page
    .waitForFunction(
      () => document.querySelector('section[aria-label="Resultaat"]')?.getAttribute('aria-busy') !== 'true',
      null,
      { timeout: 5000 },
    )
    .catch(() => {});
  const m = await page.evaluate(measureInPage);
  const toast = await page.evaluate(() => {
    const s = [...document.querySelectorAll('[role="status"]')].find((x) =>
      [...x.querySelectorAll('button')].some((b) => /Ongedaan maken|Terug naar/.test(b.textContent ?? '')),
    );
    const r = s?.firstElementChild?.getBoundingClientRect() ?? s?.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    return {
      text: s?.textContent?.trim().replace(/\s+/g, ' ') ?? null,
      fullyInView: !!r && r.left >= 0 && r.top >= 0 && r.right <= vw && r.bottom <= vh,
    };
  });
  return {
    reached: true,
    clicked,
    toast,
    horizontalOverflow: m.horizontalOverflow,
    nestedScroll: m.nestedScroll,
  };
}

// ---------------------------------------------------------------- meten per breedte

async function measureViewport(browser, base, vp, opts, log, extras) {
  const out = { viewport: vp.key, states: {} };
  const shot = async (page, name, fullPage = false) => {
    if (opts.shots)
      await page.screenshot({
        path: path.join(opts.shots, `${opts.fileLabel}-${vp.key}-${name}.png`),
        fullPage,
      });
  };

  // ---- Basis open (eerste bezoek: geen opgeslagen voorkeur, geen ?c=)
  {
    const { context, page, errors } = await newPage(browser, vp, { collapsed: false });
    const timing = await load(page, base);
    const m = await page.evaluate(measureInPage);
    await shot(page, 'open');
    if (vp.key === MAIN_VIEWPORT) await shot(page, 'open-volledig', true);
    const tabs = await tabWalk(page);
    const skip = tabs.skipStop
      ? { stop: tabs.skipStop, ...(await skipLinkCheck(page, tabs.skipStop)) }
      : null;
    out.ui = m.ui;
    out.states.open = { ...timing, ...m, tab: tabs, skipLink: skip };
    if (vp.key === MAIN_VIEWPORT) {
      log(`  print (${vp.key})…`);
      extras.print = await printCheck(page, opts.shots, `${opts.fileLabel}-${vp.key}`);
      if (m.ui === 'nieuw') extras.showResult = await showResultCheck(page);
    }
    out.states.open.errors = errors;
    await context.close();
  }

  // ---- Basis ingeklapt (terugkerend) en de toast: alleen in de nieuwe opzet
  if (out.ui !== 'nieuw') {
    const na = { status: 'n.v.t.', reason: 'bestaat niet in de oude opzet' };
    out.states.dicht = na;
    out.states.toast = na;
    return out;
  }
  {
    const { context, page, errors } = await newPage(browser, vp, { collapsed: true });
    const timing = await load(page, base);
    const m = await page.evaluate(measureInPage);
    await shot(page, 'dicht');
    const tabs = await tabWalk(page);
    out.states.dicht = { ...timing, ...m, tab: tabs, errors };
    if (!m.basisCollapsed) out.states.dicht.warning = 'Basis niet ingeklapt na laden met ps-basis-v1 = dicht';
    await focusTop(page);
    const t = await toastCheck(page);
    if (t.reached) await shot(page, 'toast');
    out.states.toast = t;
    await context.close();
  }
  return out;
}

async function measure(base, opts, log) {
  const chromium = loadChromium();
  const browser = await chromium.launch();
  try {
    // opwarmen: Vite bundelt de afhankelijkheden bij het eerste bezoek (en laadt dan soms opnieuw)
    log('opwarmen…');
    {
      const { context, page } = await newPage(browser, opts.viewportList[0], { collapsed: false });
      await load(page, base).catch(() => {});
      await sleep(1000);
      await load(page, base);
      await context.close();
    }
    const viewports = [];
    // print en "Bekijk het resultaat" alleen op MAIN_VIEWPORT
    const extras = { print: null, showResult: null };
    for (const vp of opts.viewportList) {
      log(`meten op ${vp.key}…`);
      viewports.push(await measureViewport(browser, base, vp, opts, log, extras));
    }
    return {
      tool: 'tools/ux-check/measure.mjs',
      measuredAt: new Date().toISOString(),
      browser: `Chromium ${browser.version()}`,
      route: ROUTE,
      ui: (viewports.find((v) => v.viewport === MAIN_VIEWPORT) ?? viewports[0]).ui,
      ...extras,
      viewports,
    };
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------- rapport (Markdown)

const nf = new Intl.NumberFormat('nl-NL');
const num = (x) => (x === null || x === undefined ? '–' : nf.format(x));
const yes = (b) => (b ? 'ja' : 'nee');
const vpTitle = (key) => key.replace('x', '×');

function stateCell(state, fn) {
  if (!state) return '–';
  if (state.status === 'n.v.t.') return 'n.v.t.';
  if (state.reached === false) return `niet bereikt (${state.reason})`;
  return fn(state);
}
const posCell = (p) =>
  p
    ? `y ${num(p.top)}–${num(p.bottom)} · ${p.fullyInView ? 'in beeld' : p.partlyInView ? 'deels' : 'niet in beeld'}`
    : 'ontbreekt';

const ROWS = {
  open: [
    ['Woorden boven de vouw', (s) => num(s.words)],
    ['Zichtbare bedieningselementen bij laden', (s) => num(s.controls.count)],
    ['Tabstops tot de oordeelkaart', (s) => (s.tab.tabStops ? num(s.tab.tabStops) : `> ${MAX_TAB_STOPS}`)],
    [
      'Skip-link (tabstop · focus op H2)',
      (s) => (s.skipLink ? `${s.skipLink.stop} · ${yes(s.skipLink.focusOnResult)}` : 'geen'),
    ],
    ['Oordeelkop / eerste resultaat', (s) => posCell(s.positions.verdict)],
    ['Bufferschuif', (s) => posCell(s.positions.buffer)],
    ['Batterijschuif', (s) => posCell(s.positions.battery)],
    ['Stapper aansluiting', (s) => posCell(s.positions.stepper)],
    [
      'Horizontale overflow',
      (s) =>
        s.horizontalOverflow.overflow
          ? `ja (${num(s.horizontalOverflow.scrollWidth)} > ${num(s.horizontalOverflow.clientWidth)})`
          : 'nee',
    ],
    ['Geneste scroll', (s) => num(s.nestedScroll.count)],
    ['Paginahoogte (px)', (s) => num(s.pageHeight)],
    ['Eerste doorrekening (ms, indicatief)', (s) => num(s.firstResultMs)],
  ],
  toast: [
    ['Knop', (s) => `"${s.clicked}"`],
    ['Melding volledig in beeld', (s) => yes(s.toast.fullyInView)],
    [
      'Horizontale overflow',
      (s) =>
        s.horizontalOverflow.overflow
          ? `ja (${num(s.horizontalOverflow.scrollWidth)} > ${num(s.horizontalOverflow.clientWidth)})`
          : 'nee',
    ],
    ['Geneste scroll', (s) => num(s.nestedScroll.count)],
  ],
};
ROWS.dicht = ROWS.open.filter(([name]) => !name.startsWith('Skip-link'));

const STATE_TITLES = {
  open: 'Basis open (eerste bezoek)',
  dicht: 'Basis ingeklapt (terugkerend of deellink)',
  toast: 'Melding onderaan zichtbaar (na een knop bij het oordeel)',
};

/** Doelen uit UX-plan §11 die op desktop gelden. */
function goals(cur, base) {
  const v = (r, key) => r?.viewports.find((x) => x.viewport === key);
  const st = (r, key, state) => {
    const s = v(r, key)?.states[state];
    return s && s.status !== 'n.v.t.' && s.reached !== false ? s : null;
  };
  const allStates = (r) =>
    (r?.viewports ?? []).flatMap((x) =>
      Object.entries(x.states)
        .filter(([, s]) => s && s.status !== 'n.v.t.' && s.reached !== false)
        .map(([name, s]) => ({ name: `${x.viewport} ${name}`, s })),
    );
  const verdict = (ok) => (ok === null ? '–' : ok ? 'gehaald' : 'niet gehaald');
  const rows = [];
  const add = (title, norm, measure, check) => {
    const c = measure(cur);
    const b = base ? measure(base) : null;
    rows.push([
      title,
      norm,
      c ?? 'n.v.t.',
      base ? (b ?? 'n.v.t.') : '–',
      verdict(c === null ? null : check(cur, base)),
    ]);
  };
  const wordsOpen = (r) => st(r, '1440x900', 'open')?.words ?? null;
  // de oude opzet heeft één toestand: die is de vergelijking voor "ingeklapt" (UX-plan: "nu 46", "nu 56")
  const stOrOpen = (r, key, state) => st(r, key, state) ?? (r?.ui === 'oud' ? st(r, key, 'open') : null);
  add(
    'Woorden, 1440×900, Basis open',
    '≤ 230 en ≤ 40 % van de baseline',
    (r) => (wordsOpen(r) === null ? null : num(wordsOpen(r))),
    (c, b) => wordsOpen(c) <= 230 && (!b || wordsOpen(b) === null || wordsOpen(c) <= 0.4 * wordsOpen(b)),
  );
  add(
    'Woorden, 1440×900, ingeklapt',
    '≤ 180',
    (r) => (st(r, '1440x900', 'dicht') ? num(st(r, '1440x900', 'dicht').words) : null),
    (c) => st(c, '1440x900', 'dicht').words <= 180,
  );
  add(
    'Zichtbare bedieningselementen, 1440×900 ingeklapt',
    '≤ 35',
    (r) => (stOrOpen(r, '1440x900', 'dicht') ? num(stOrOpen(r, '1440x900', 'dicht').controls.count) : null),
    (c) => stOrOpen(c, '1440x900', 'dicht').controls.count <= 35,
  );
  add(
    'Tabstops tot de oordeelkaart, 1440×900 ingeklapt',
    '≤ 15',
    (r) => {
      const s = stOrOpen(r, '1440x900', 'dicht');
      return s ? (s.tab.tabStops ? num(s.tab.tabStops) : `> ${MAX_TAB_STOPS}`) : null;
    },
    (c) => (stOrOpen(c, '1440x900', 'dicht').tab.tabStops ?? Infinity) <= 15,
  );
  add(
    'Skip-link, 1440×900 Basis open',
    'tabstop 2 of 3; focus op H2 "Resultaat"',
    (r) => {
      const s = st(r, '1440x900', 'open');
      if (!s) return null;
      return s.skipLink ? `tabstop ${s.skipLink.stop} · focus ${yes(s.skipLink.focusOnResult)}` : 'geen';
    },
    (c) => {
      const k = st(c, '1440x900', 'open').skipLink;
      return !!k && k.stop >= 2 && k.stop <= 3 && k.focusOnResult;
    },
  );
  const inView = (s, keys) => keys.every((k) => s.positions[k]?.fullyInView);
  const viewText = (s, keys) =>
    keys.map((k) => `${k} ${s.positions[k]?.fullyInView ? 'ja' : 'nee'}`).join(' · ');
  for (const [title, key, state, keys] of [
    [
      'Scrolldiepte 1440×900 open: oordeelkop en bufferschuif in beeld',
      '1440x900',
      'open',
      ['verdict', 'buffer'],
    ],
    [
      'Scrolldiepte 1440×900 ingeklapt: oordeel, buffer, batterij en stapper in beeld',
      '1440x900',
      'dicht',
      ['verdict', 'buffer', 'battery', 'stepper'],
    ],
    [
      'Scrolldiepte 1280×800 ingeklapt: oordeel en bufferschuif in beeld',
      '1280x800',
      'dicht',
      ['verdict', 'buffer'],
    ],
  ]) {
    add(
      title,
      'zonder scrollen',
      (r) => (stOrOpen(r, key, state) ? viewText(stOrOpen(r, key, state), keys) : null),
      (c) => inView(stOrOpen(c, key, state), keys),
    );
  }
  add(
    'Geen horizontale overflow (alle breedtes en toestanden)',
    'scrollWidth ≤ breedte',
    (r) => {
      const list = allStates(r);
      if (!list.length) return null;
      const bad = list.filter((x) => x.s.horizontalOverflow.overflow).map((x) => x.name);
      return bad.length ? `overflow: ${bad.join(', ')}` : 'geen';
    },
    (c) => allStates(c).every((x) => !x.s.horizontalOverflow.overflow),
  );
  add(
    'Geen geneste scroll (alle breedtes en toestanden)',
    '0 buiten ScrollRegion en tabellen',
    (r) => {
      const list = allStates(r);
      if (!list.length) return null;
      const bad = list
        .filter((x) => x.s.nestedScroll.count > 0)
        .map((x) => `${x.name} (${x.s.nestedScroll.count})`);
      return bad.length ? bad.join(', ') : 'geen';
    },
    (c) => allStates(c).every((x) => x.s.nestedScroll.count === 0),
  );
  add(
    'Print (page.pdf, A4 staand)',
    'hoogstens 1 pagina meer dan de baseline',
    (r) => (r?.print?.pages ? `${num(r.print.pages)} pagina's` : null),
    (c, b) => (b?.print?.pages ? c.print.pages <= b.print.pages + 1 : null),
  );
  return rows;
}

function table(header, rows) {
  const esc = (x) => String(x).replace(/\|/g, '\\|');
  return [
    `| ${header.map(esc).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`),
  ].join('\n');
}

function markdown(r, base) {
  const lines = [];
  const src = r.source;
  lines.push(`# UX-meting peakshaving: ${r.label}`);
  lines.push('');
  lines.push(
    `Gemeten op ${r.measuredAt.slice(0, 16).replace('T', ' ')} UTC met \`${r.tool}\` · ` +
      `${src.ref ?? '?'} @ ${src.commit ?? '?'}${src.dirty ? ' (met lokale wijzigingen)' : ''} · ` +
      `opzet: ${r.ui} · ${r.browser} · locale nl-NL · prefers-reduced-motion: reduce.`,
  );
  lines.push('');
  lines.push(
    'Telregels (UX-plan §11): woorden met een letter of cijfer in zichtbare tekst die het venster raakt ' +
      '(niet aria-hidden, niet in een gesloten `<details>`, `<option>` telt niet, SVG-tekst wel). ' +
      'Bedieningselementen: knoppen, velden, keuzelijsten, summaries, links en tabs die zichtbaar in het venster staan. ' +
      'Tabstops: aantal keer Tab vanaf de bovenkant tot de focus in de oordeelkaart staat (oude opzet: in de regio ' +
      '"Resultaat"). Posities: documentcoördinaat (y) en of het element zonder scrollen volledig in beeld is. ' +
      'Geneste scroll: elementen met `overflow-y: auto/scroll` die verticaal scrollen, buiten ScrollRegion en tabellen.',
  );
  const keys = r.viewports.map((v) => v.viewport);
  for (const state of ['open', 'dicht', 'toast']) {
    lines.push('');
    lines.push(`## ${STATE_TITLES[state]}`);
    lines.push('');
    const states = r.viewports.map((v) => v.states[state]);
    if (states.every((s) => s?.status === 'n.v.t.')) {
      lines.push(`n.v.t.: ${states[0].reason}.`);
      continue;
    }
    lines.push(
      table(
        ['Meting', ...keys.map(vpTitle)],
        ROWS[state].map(([name, fn]) => [name, ...states.map((s) => stateCell(s, fn))]),
      ),
    );
    const notes = [];
    r.viewports.forEach((v) => {
      const s = v.states[state];
      if (!s || s.status === 'n.v.t.' || s.reached === false) return;
      if (s.warning) notes.push(`${vpTitle(v.viewport)}: ${s.warning}.`);
      if (s.settled === false)
        notes.push(`${vpTitle(v.viewport)}: de pagina kwam niet binnen 30 s tot rust.`);
      for (const n of s.nestedScroll?.items ?? [])
        notes.push(
          `${vpTitle(v.viewport)}: scrollt verticaal: \`${n.element}\` (${num(n.scrollHeight)} in ${num(n.clientHeight)} px)` +
            (n.allowed ? ', toegestaan' : ''),
        );
      if (s.errors?.length)
        notes.push(`${vpTitle(v.viewport)}: fouten in de console: ${s.errors.slice(0, 3).join(' / ')}`);
    });
    if (state === 'open') {
      const s = r.viewports.find((v) => v.viewport === MAIN_VIEWPORT)?.states.open;
      if (s?.tab?.targetStop)
        notes.push(`Eerste tabstop in de oordeelkaart (${vpTitle(MAIN_VIEWPORT)}): ${s.tab.targetStop}.`);
      if (s?.wordsByRegion)
        notes.push(
          `Woorden per gebied (${vpTitle(MAIN_VIEWPORT)}): ` +
            Object.entries(s.wordsByRegion)
              .map(([k, n]) => `${k} ${num(n)}`)
              .join(' · ') +
            '.',
        );
    }
    if (notes.length) {
      lines.push('');
      notes.forEach((n) => lines.push(`- ${n}`));
    }
  }
  lines.push('');
  lines.push(`## Print en "Bekijk het resultaat" (${vpTitle(MAIN_VIEWPORT)})`);
  lines.push('');
  const p = r.print;
  lines.push(
    p?.pages
      ? `- Print (page.pdf via de knop "Print / PDF"): ${num(p.pages)} pagina's, ${p.pageSizePt} pt` +
          (p.a4Portrait ? ' (A4 staand).' : ' (niet A4 staand!).')
      : `- Print: niet gemeten (${p?.error ?? 'onbekend'}).`,
  );
  const sr = r.showResult;
  lines.push(
    sr
      ? `- Bekijk het resultaat: ingeklapt ${yes(sr.collapsed)} · focus op H2 ${yes(sr.focusOnResult)} · ` +
          `oordeelkop in beeld ${yes(sr.verdictInView)} · bewaard "${sr.stored}" · na herladen dicht ${yes(sr.collapsedAfterReload)}.`
      : '- Bekijk het resultaat: n.v.t. (geen knop in deze opzet).',
  );
  lines.push('');
  lines.push('## Doelen (UX-plan §11, alleen desktop)');
  lines.push('');
  if (base) lines.push(`Baseline: ${base.label}.`);
  else if (r.ui === 'oud') lines.push('Dit is de oude opzet: de kolom "Oordeel" is alleen ter informatie.');
  lines.push('');
  lines.push(table(['Doel', 'Norm', 'Gemeten', 'Baseline', 'Oordeel'], goals(r, base)));
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------- hoofdprogramma

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(HELP);
    return;
  }
  const log = (s) => process.stderr.write(`${s}\n`);
  const cleanups = [];
  const cleanup = () => {
    while (cleanups.length) cleanups.pop()();
  };
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });

  try {
    let repo = opts.repo ?? REPO_DEFAULT;
    let source;
    if (opts.baseline) {
      const dir = opts.worktree ?? path.join(os.tmpdir(), 'ux-baseline');
      log(`worktree van ${opts.baseline} in ${dir}…`);
      cleanups.push(addWorktree(repo, opts.baseline, dir));
      source = gitInfo(dir, opts.baseline);
      repo = dir;
      opts.out ??= path.join(SCRIPT_DIR, 'baseline');
    } else {
      source =
        opts.url && !opts.repo ? { ref: null, commit: null, dirty: null, url: opts.url } : gitInfo(repo);
    }
    let base = opts.url;
    if (!base) {
      const port = opts.port || (await freePort());
      log(`Vite starten in ${repo} op poort ${port}…`);
      const server = await startServer(repo, port);
      cleanups.push(server.stop);
      base = server.url;
    }
    const label = opts.label ?? (source.ref ? `${source.ref} (${source.commit})` : base);
    opts.fileLabel = label.replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
    if (opts.shots) fs.mkdirSync(opts.shots, { recursive: true });

    const result = { label, source, ...(await measure(base, opts, log)) };
    const compare = opts.compare ? JSON.parse(fs.readFileSync(opts.compare, 'utf8')) : null;
    const md = markdown(result, compare);
    if (opts.out) {
      fs.mkdirSync(path.dirname(opts.out), { recursive: true });
      fs.writeFileSync(`${opts.out}.json`, `${JSON.stringify(result, null, 2)}\n`);
      fs.writeFileSync(`${opts.out}.md`, md);
      log(`geschreven: ${opts.out}.json en ${opts.out}.md`);
    } else {
      process.stdout.write(md);
    }
  } finally {
    cleanup();
  }
}

main().catch((e) => {
  console.error(e?.stack ?? String(e));
  process.exit(1);
});
