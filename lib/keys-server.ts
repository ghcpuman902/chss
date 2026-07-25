import 'server-only';
import unifiedKeys from '@/lib/keys.json';
import type { KeyLookup } from '@/lib/state-core';

const U_KEY_TO_FEN: Record<string, string> = unifiedKeys as unknown as Record<string, string>;

const FEN_TO_U_KEY: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [key, fen] of Object.entries(U_KEY_TO_FEN)) {
    map[fen] = key;
  }
  return map;
})();

/** Tiny LRU for FEN → short key discovered during normal operation. */
class FenToKeyLruCache {
  private map = new Map<string, string>();
  constructor(private readonly maxEntries = 4096) {}

  get(fen: string): string | undefined {
    const val = this.map.get(fen);
    if (val === undefined) return undefined;
    this.map.delete(fen);
    this.map.set(fen, val);
    return val;
  }

  set(fen: string, key: string) {
    if (this.map.has(fen)) this.map.delete(fen);
    this.map.set(fen, key);
    if (this.map.size > this.maxEntries) {
      const oldestKey = this.map.keys().next().value as string | undefined;
      if (oldestKey !== undefined) this.map.delete(oldestKey);
    }
  }
}

const FEN_TO_U_KEY_LRU = new FenToKeyLruCache(4096);

export const serverKeyLookup: KeyLookup = {
  keyToFen: (key: string) => {
    const fen = U_KEY_TO_FEN[key];
    if (fen) FEN_TO_U_KEY_LRU.set(fen, key);
    return fen;
  },
  fenToKey: (fen: string) => {
    const direct = FEN_TO_U_KEY[fen];
    if (direct) {
      FEN_TO_U_KEY_LRU.set(fen, direct);
      return direct;
    }
    return FEN_TO_U_KEY_LRU.get(fen);
  },
};

export const UNIFIED_KEYS_TO_FEN: Record<string, string> = U_KEY_TO_FEN;
