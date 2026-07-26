// lib/state-core.ts — chess URL state without the short-key map (client-safe).
import { Chess, Move, Square } from 'chess.js';
import { base64urlDecode, base64urlEncode } from '@/lib/base64url';
import { encodeHybridCode } from '@/lib/hybrid-url';
import { parseResearchCode } from '@/lib/research-url-decode';

type ChessMovePromotion = 'n' | 'b' | 'r' | 'q';

export type ParsedState = {
  fen: string;
  sideToMove: 'w' | 'b';
  // Optional helpers to accelerate encode path
  uKey?: string;
  uci?: string;
};

export type MoveResult = {
  success: boolean;
  newState?: ParsedState;
  error?: string;
};

export type KeyLookup = {
  keyToFen: (key: string) => string | undefined;
  fenToKey: (fen: string) => string | undefined;
};

export const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const startState = (): ParsedState => ({
  fen: START_FEN,
  sideToMove: 'w',
});

const isValidFen = (fen: string): boolean => {
  try {
    // chess.js throws on obviously invalid FENs
    new Chess(fen);
    return true;
  } catch {
    return false;
  }
};

function applyUciMoves(uci: string): ParsedState {
  const chess = new Chess();

  for (let i = 0; i < uci.length; ) {
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

  return {
    fen: chess.fen({ forceEnpassantSquare: true }),
    sideToMove: chess.turn(),
    uci,
  };
}

export function parseCode(code: string, keys?: KeyLookup): ParsedState {
  if (!code || code === '') return startState();

  const kind = code.slice(0, 2);
  const payload = code.slice(2);

  if (kind === 'u-') {
    const mapped = keys?.keyToFen(payload);
    if (mapped && isValidFen(mapped)) {
      const sideToMove = (mapped.split(' ')[1] as 'w' | 'b') || 'w';
      return { fen: mapped, sideToMove, uKey: payload };
    }
    // Fallback: allow raw UCI if key not found
    try {
      const parsed = applyUciMoves(payload);
      const maybeKey = keys?.fenToKey(parsed.fen);
      if (maybeKey) parsed.uKey = maybeKey;
      return parsed;
    } catch {
      return startState();
    }
  }

  if (kind === 'f-') {
    const fenDecoded = base64urlDecode(payload);
    if (!fenDecoded || !fenDecoded.includes(' ') || !isValidFen(fenDecoded)) {
      return startState();
    }
    const sideToMove = (fenDecoded.split(' ')[1] as 'w' | 'b') || 'w';
    return { fen: fenDecoded, sideToMove };
  }

  // Research codecs from the compression scoreboard (t-/p-/o-/n-/g-/z-/d-/h-)
  const research = parseResearchCode(code);
  if (research) {
    return {
      fen: research.fen,
      sideToMove: research.sideToMove,
      uci: research.uci,
    };
  }

  // Fallback: treat entire string as UCI
  try {
    const parsed = applyUciMoves(code);
    const maybeKey = keys?.fenToKey(parsed.fen);
    if (maybeKey) parsed.uKey = maybeKey;
    return parsed;
  } catch {
    return startState();
  }
}

export function generateCode(state: ParsedState, keys?: KeyLookup): string {
  if (state.fen === START_FEN) return '';

  // Ultra-short opening keys still win when the server map has a hit.
  if (state.uKey) return `u-${state.uKey}`;

  const key = keys?.fenToKey(state.fen);
  if (key) return `u-${key}`;

  // Default product codec: hybrid min(packed UCI, occupancy).
  try {
    return encodeHybridCode(state.fen, state.uci);
  } catch {
    return `f-${base64urlEncode(state.fen)}`;
  }
}

export function makeMove(
  currentState: ParsedState,
  from: string,
  to: string,
  promotion?: string,
  keys?: KeyLookup,
): MoveResult {
  try {
    const chess = new Chess(currentState.fen);
    const move = chess.move({
      from,
      to,
      promotion: promotion as ChessMovePromotion,
    });

    if (!move) {
      return { success: false, error: 'Invalid move' };
    }

    const newFen = chess.fen({ forceEnpassantSquare: true });
    const newState: ParsedState = {
      fen: newFen,
      sideToMove: chess.turn(),
    };

    const maybeKey = keys?.fenToKey(newFen);
    if (maybeKey) newState.uKey = maybeKey;

    // Always append UCI so undo/title/last-move stay coherent
    const promo = move.promotion
      ? String(move.promotion).toLowerCase()
      : promotion
        ? String(promotion).toLowerCase()
        : undefined;
    const seg = `${String(from).toLowerCase()}${String(to).toLowerCase()}${promo ? promo : ''}`;
    newState.uci = `${currentState.uci ?? ''}${seg}`;

    return { success: true, newState };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
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

export function isGameOver(fen: string): {
  isCheckmate: boolean;
  isDraw: boolean;
  isStalemate: boolean;
} {
  try {
    const chess = new Chess(fen);
    return {
      isCheckmate: chess.isCheckmate(),
      isDraw: chess.isDraw(),
      isStalemate: chess.isStalemate(),
    };
  } catch {
    return { isCheckmate: false, isDraw: false, isStalemate: false };
  }
}
