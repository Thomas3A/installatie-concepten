// Generieke hulpfuncties voor deelbare links: alleen afwijkingen van de standaard, compacte JSON → base64url.

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function isPlainObject(x: Json | undefined): x is { [k: string]: Json } {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

/** Verschil van `a` ten opzichte van `b` (arrays worden atomair vergeleken); undefined als gelijk. */
export function jsonDiff(a: Json, b: Json): Json | undefined {
  if (JSON.stringify(a) === JSON.stringify(b)) return undefined;
  if (isPlainObject(a) && isPlainObject(b)) {
    const out: { [k: string]: Json } = {};
    for (const k of Object.keys(a)) {
      const d = jsonDiff(a[k], b[k]);
      if (d !== undefined) out[k] = d;
    }
    return out;
  }
  return a;
}

/** Leg `patch` over `base` (diep voor objecten, atomair voor arrays en waarden). */
export function jsonMerge(base: Json, patch: Json): Json {
  if (isPlainObject(patch) && isPlainObject(base)) {
    const out: { [k: string]: Json } = { ...base };
    for (const k of Object.keys(patch)) out[k] = jsonMerge(base[k], patch[k]);
    return out;
  }
  return patch;
}

export function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
