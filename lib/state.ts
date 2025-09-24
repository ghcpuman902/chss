// lib/state.ts
import { Chess } from 'chess.js';

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
  const rem = s.length % 4;
  const pad = rem === 2 ? '==' : rem === 3 ? '=' : rem === 1 ? '===' : '';
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return atobSafe(base64);
};

// Optional tiny book (expand later)
const BOOK: Record<string, string> = {
  // 'r': 'e2e4e7e5g1f3', // e4 e5 Nf3 (example)
};

// Static frequency-ordered u-key mapping (approximate popularity)
// Maps short keys to compact UCI sequences from the starting position
const U_KEY_TO_UCI: Record<string, string> = {
  a: 'e2e4',               // King pawn
  b: 'd2d4',               // Queen pawn
  c: 'g1f3',               // Reti
  d: 'c2c4',               // English
  e: 'e2e4e7e5',           // Open game
  f: 'e2e4c7c5',           // Sicilian
  g: 'd2d4d7d5',           // Queen's Gambit decline baseline
  h: 'c2c4e7e5',           // English ... e5
  i: 'g1f3d7d5',           // Reti ... d5
  j: 'e2e4e7e5g1f3',       // King knight
  k: 'd2d4g8f6',           // Indian defenses
  l: 'c2c4g8f6',           // English ... Nf6
  m: 'e2e4e7e5g1f3b8c6',   // Three knights
  n: 'd2d4d7d5c2c4',       // Queen's Gambit
};

// Reverse map computed from UCI → FEN using chess.js
const FEN_TO_U_KEY: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [key, uci] of Object.entries(U_KEY_TO_UCI)) {
    try {
      const { fen } = applyUciMoves(uci);
      map.set(fen, key);
    } catch {
      // ignore invalid sequences
    }
  }
  return map;
})();

export type ParsedState = {
  fen: string;
  sideToMove: 'w'|'b';
};

export type MoveResult = {
  success: boolean;
  newState?: ParsedState;
  error?: string;
};

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
    
    const res = chess.move({ from, to, promotion: promo as any });
    if (!res) throw new Error('Illegal UCI sequence');
    
    i += step;
  }
  
  return { fen: chess.fen(), sideToMove: chess.turn() };
}

export function parseCode(code: string): ParsedState {
  // Handle empty board case - if no code or empty string, return starting position
  if (!code || code === '') {
    return { 
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 
      sideToMove: 'w'
    };
  }
  
  // formats: "u-<moves>", "f-<b64url>", "s-<bookKey>"
  const kind = code.slice(0, 2); // "u-", "f-", "s-"
  const payload = code.slice(2);

  if (kind === 'u-') {
    // Try mapped short key first, else fall back to raw UCI sequence
    const mapped = U_KEY_TO_UCI[payload];
    if (mapped) return applyUciMoves(mapped);
    return applyUciMoves(payload);
  }
  if (kind === 'f-') {
    const fen = base64urlDecode(payload);
    const sideToMove = fen.split(' ')[1] as 'w'|'b';
    return { fen, sideToMove };
  }
  if (kind === 's-') {
    const uci = BOOK[payload];
    if (!uci) throw new Error('Unknown book code');
    return applyUciMoves(uci);
  }
  // Fallback: treat entire string as UCI
  return applyUciMoves(code);
}

export function generateCode(state: ParsedState): string {
  // Check if it's the starting position
  const startingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  if (state.fen === startingFen) {
    return ''; // Empty board
  }
  
  // Prefer short u-key if available, else fall back to FEN encoding
  const uKey = FEN_TO_U_KEY.get(state.fen);
  if (uKey) return `u-${uKey}`;
  return `f-${base64urlEncode(state.fen)}`;
}

export function makeMove(currentState: ParsedState, from: string, to: string, promotion?: string): MoveResult {
  try {
    const chess = new Chess(currentState.fen);
    const move = chess.move({ from, to, promotion: promotion as any });
    
    if (!move) {
      return { success: false, error: 'Invalid move' };
    }
    
    const newState: ParsedState = {
      fen: chess.fen(),
      sideToMove: chess.turn()
    };
    
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
    const moves = chess.moves({ square: from as any, verbose: true });
    return moves.map((move: any) => move.to);
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
