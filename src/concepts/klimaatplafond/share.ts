// Delen van de configuratie: compacte JSON (alleen afwijkingen van de standaard) → base64url.
import {
  fromBase64Url,
  jsonDiff as diff,
  jsonMerge as merge,
  toBase64Url,
  type Json,
} from '../../core/shareCodec';
import { defaultConfig, normalizeConfig, type KlimaatplafondConfig } from './model/config';

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
