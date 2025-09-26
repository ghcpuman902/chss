// lib/state.ts
import { Chess, Move, Square } from 'chess.js';
// manually cast type for chessmovepromotion
type ChessMovePromotion = 'n' | 'b' | 'r' | 'q';

import unifiedKeys from '@/lib/keys.json';

// Isomorphic base64url helpers (Edge/browser use atob/btoa; Node uses Buffer)
const btoaSafe = (str: string) =>
  typeof btoa === 'function' ? btoa(str) : Buffer.from(str, 'utf8').toString('base64');
const atobSafe = (str: string) =>
  typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('utf8');

const base64urlEncode = (s: string) => {
  const base64 = btoaSafe(s);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64urlDecode = (s: string) => {
  try {
    const rem = s.length % 4;
    const pad = rem === 2 ? '==' : rem === 3 ? '=' : rem === 1 ? '===' : '';
    const base64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
    return atobSafe(base64);
  } catch {
    return '';
  }
};


// Unified key map from short key -> FEN
const U_KEY_TO_FEN: Record<string, string> = unifiedKeys as unknown as Record<string, string>;

// Export the unified keys map
export const UNIFIED_KEYS_TO_FEN: Record<string, string> = U_KEY_TO_FEN;

// Fast reverse map: FEN string → short key
const FEN_TO_U_KEY: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [key, fen] of Object.entries(U_KEY_TO_FEN)) {
    map[fen] = key;
  }
  return map;
})();

// Tiny LRU cache for FEN → short key discovered during normal operation
class FenToKeyLruCache {
  private map: Map<string, string>;
  private readonly maxEntries: number;
  constructor(maxEntries = 2048) {
    this.map = new Map<string, string>();
    this.maxEntries = maxEntries;
  }
  get(fen: string): string | undefined {
    const val = this.map.get(fen);
    if (val === undefined) return undefined;
    // refresh recency
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

export type ParsedState = {
  fen: string;
  sideToMove: 'w'|'b';
  // Optional helpers to accelerate encode path
  uKey?: string;
  uci?: string;
};

export type MoveResult = {
  success: boolean;
  newState?: ParsedState;
  error?: string;
};

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function applyUciMoves(uci: string): ParsedState {
  const chess = new Chess();
  
  // chunk moves: 4 or 5 chars (promotion)
  for (let i = 0; i < uci.length;) {
    const from = uci.slice(i, i + 2);
    const to = uci.slice(i + 2, i + 4);
    const next = uci[i + 4];
    const promo = next && /[nbrq]/i.test(next) ? next.toLowerCase() : undefined;
    const step = promo ? 5 : 4;
    if (from.length < 2 || to.length < 2) break;
    
    const res = chess.move({ from, to, promotion: promo as ChessMovePromotion });
    if (!res) throw new Error('Illegal UCI sequence');
    
    i += step;
  }
  
  return { fen: chess.fen({ forceEnpassantSquare: true }), sideToMove: chess.turn(), uci };
}

export function parseCode(code: string): ParsedState {
  // Handle empty board case - if no code or empty string, return starting position
  if (!code || code === '') {
    return { 
      fen: START_FEN, 
      sideToMove: 'w'
    };
  }
  
  // formats: "u-<key>", "f-<b64url>"
  const kind = code.slice(0, 2); // "u-", "f-", "s-"
  const payload = code.slice(2);

  if (kind === 'u-') {
    // Treat payload as a unique short key across openings + midmoves
    const mapped = U_KEY_TO_FEN[payload];
    if (mapped) {
      const sideToMove = (mapped.split(' ')[1] as 'w'|'b') || 'w';
      const parsed = { fen: mapped, sideToMove, uKey: payload };
      // Seed LRU for faster encode
      FEN_TO_U_KEY_LRU.set(parsed.fen, payload);
      return parsed;
    }
    // Fallback: allow raw UCI if key not found
    const parsed = applyUciMoves(payload);
    const maybeKey = FEN_TO_U_KEY[parsed.fen];
    if (maybeKey) {
      parsed.uKey = maybeKey;
      FEN_TO_U_KEY_LRU.set(parsed.fen, maybeKey);
    }
    return parsed;
  }
  if (kind === 'f-') {
    const fenDecoded = base64urlDecode(payload);
    const fen = fenDecoded && fenDecoded.includes(' ') ? fenDecoded : START_FEN;
    const sideToMove = (fen.split(' ')[1] as 'w'|'b') || 'w';
    return { fen, sideToMove };
  }
  // Fallback: treat entire string as UCI
  const parsed = applyUciMoves(code);
  const maybeKey = FEN_TO_U_KEY[parsed.fen];
  if (maybeKey) {
    parsed.uKey = maybeKey;
    FEN_TO_U_KEY_LRU.set(parsed.fen, maybeKey);
  }
  return parsed;
}

export function generateCode(state: ParsedState): string {
  // Check if it's the starting position
  if (state.fen === START_FEN) {
    return ''; // Empty board
  }
  
  // Prefer short u-key if available, else fall back to FEN encoding
  if (state.uKey) return `u-${state.uKey}`;
  
  // Check if this FEN has a known short key
  const key = FEN_TO_U_KEY[state.fen];
  if (key) return `u-${key}`;
  
  // Check LRU cache for recently discovered keys
  const cachedKey = FEN_TO_U_KEY_LRU.get(state.fen);
  if (cachedKey) return `u-${cachedKey}`;
  
  // Fall back to FEN encoding
  return `f-${base64urlEncode(state.fen)}`;
}

export function makeMove(currentState: ParsedState, from: string, to: string, promotion?: string): MoveResult {
  try {
    const chess = new Chess(currentState.fen);
    const move = chess.move({ from, to, promotion: promotion as ChessMovePromotion });
    
    if (!move) {
      return { success: false, error: 'Invalid move' };
    }
    
    const newFen = chess.fen({ forceEnpassantSquare: true });
    const newState: ParsedState = {
      fen: newFen,
      sideToMove: chess.turn()
    };
    // Check if the new FEN has a known short key
    const maybeKey = FEN_TO_U_KEY[newFen];
    if (maybeKey) {
      newState.uKey = maybeKey;
      FEN_TO_U_KEY_LRU.set(newFen, maybeKey);
    } else {
      // Check LRU cache for recently discovered keys
      const cachedKey = FEN_TO_U_KEY_LRU.get(newFen);
      if (cachedKey) {
        newState.uKey = cachedKey;
      } else {
        newState.uKey = undefined;
      }
    }
    
    // Preserve UCI if we have it from the current state
    if (currentState.uci) {
      const promo = move.promotion ? String(move.promotion).toLowerCase() : (promotion ? String(promotion).toLowerCase() : undefined);
      const seg = `${String(from).toLowerCase()}${String(to).toLowerCase()}${promo ? promo : ''}`;
      newState.uci = `${currentState.uci}${seg}`;
    }
    
    return { success: true, newState };
  } catch (error) {
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

export function getLegalMoves(fen: string, from?: string): string[] {
  try {
    const chess = new Chess(fen);
    const moves = chess.moves({ square: from as Square, verbose: true });
    return moves.map((move: Move) => move.to);
  } catch {
    return [];
  }
}

export function isGameOver(fen: string): { isCheckmate: boolean; isDraw: boolean; isStalemate: boolean } {
  try {
    const chess = new Chess(fen);
    return {
      isCheckmate: chess.isCheckmate(),
      isDraw: chess.isDraw(),
      isStalemate: chess.isStalemate()
    };
  } catch {
    return { isCheckmate: false, isDraw: false, isStalemate: false };
  }
}
