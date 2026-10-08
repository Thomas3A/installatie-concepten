// Delen van de configuratie: compacte JSON (alleen afwijkingen van de standaard) → base64url.
import { defaultConfig, normalizeConfig, type KlimaatplafondConfig } from './model/config';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function diff(a: Json, b: Json): Json | undefined {
  if (JSON.stringify(a) === JSON.stringify(b)) return undefined;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const out: { [k: string]: Json } = {};
    for (const k of Object.keys(a)) {
      const d = diff(a[k] as Json, (b as { [k: string]: Json })[k] as Json);
      if (d !== undefined) out[k] = d;
    }
    return out;
  }
  return a;
}

function merge(base: Json, patch: Json): Json {
  if (patch && base && typeof patch === 'object' && typeof base === 'object' && !Array.isArray(patch) && !Array.isArray(base)) {
    const out: { [k: string]: Json } = { ...(base as { [k: string]: Json }) };
    for (const k of Object.keys(patch)) out[k] = merge((base as { [k: string]: Json })[k] as Json, (patch as { [k: string]: Json })[k]);
    return out;
  }
  return patch;
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeConfig(cfg: KlimaatplafondConfig): string {
  const d = diff(cfg as unknown as Json, defaultConfig() as unknown as Json) ?? {};
  // valves altijd volledig meegeven (arrays worden atomair vergeleken)
  const payload = { ...(d as object), valves: cfg.valves, valveCount: cfg.valveCount };
  return toBase64Url(JSON.stringify(payload));
}

export function decodeConfig(code: string): KlimaatplafondConfig | null {
  try {
    const parsed = JSON.parse(fromBase64Url(code)) as Json;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const merged = merge(defaultConfig() as unknown as Json, parsed);
    return normalizeConfig(merged);
  } catch {
    return null;
  }
}

export function shareUrl(cfg: KlimaatplafondConfig, loc: Location = window.location): string {
  const base = loc.href.split('#')[0];
  return `${base}#/klimaatplafond?c=${encodeConfig(cfg)}`;
}
