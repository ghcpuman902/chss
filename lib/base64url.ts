/** Isomorphic base64url helpers (Edge/browser use atob/btoa; Node uses Buffer). */

const btoaSafe = (str: string) =>
  typeof btoa === 'function' ? btoa(str) : Buffer.from(str, 'utf8').toString('base64');

const atobSafe = (str: string) =>
  typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('utf8');

export const base64urlEncode = (s: string) => {
  const base64 = btoaSafe(s);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

export const base64urlDecode = (s: string) => {
  try {
    const rem = s.length % 4;
    const pad = rem === 2 ? '==' : rem === 3 ? '=' : rem === 1 ? '===' : '';
    const base64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
    return atobSafe(base64);
  } catch {
    return '';
  }
};
