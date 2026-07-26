/** Isomorphic base64url helpers (Edge/browser use atob/btoa; Node uses Buffer). */

const btoaSafe = (str: string) =>
  typeof btoa === 'function' ? btoa(str) : Buffer.from(str, 'utf8').toString('base64');

const atobSafe = (str: string) =>
  typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('utf8');

export const base64urlEncode = (s: string) => {
  const base64 = btoaSafe(s);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const padBase64url = (s: string) => {
  const rem = s.length % 4;
  const pad = rem === 2 ? '==' : rem === 3 ? '=' : rem === 1 ? '===' : '';
  return s.replace(/-/g, '+').replace(/_/g, '/') + pad;
};

export const base64urlDecode = (s: string) => {
  try {
    return atobSafe(padBase64url(s));
  } catch {
    return '';
  }
};

/** Decode Base64URL to raw bytes (for packed / gzip payloads). */
export const base64urlDecodeBytes = (s: string): Uint8Array => {
  try {
    const base64 = padBase64url(s);
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(base64, 'base64'));
    }
    const bin = atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return new Uint8Array();
  }
};
