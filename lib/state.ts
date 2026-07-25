// lib/state.ts — server-aware wrappers with short-key map (do not import from client components).
import 'server-only';
import { serverKeyLookup, UNIFIED_KEYS_TO_FEN } from '@/lib/keys-server';
import {
  generateCode as generateCodeCore,
  makeMove as makeMoveCore,
  parseCode as parseCodeCore,
  type MoveResult,
  type ParsedState,
} from '@/lib/state-core';

export type { ParsedState, MoveResult };
export {
  START_FEN,
  getLegalMoves,
  isGameOver,
} from '@/lib/state-core';
export { UNIFIED_KEYS_TO_FEN };

export function parseCode(code: string): ParsedState {
  return parseCodeCore(code, serverKeyLookup);
}

export function generateCode(state: ParsedState): string {
  return generateCodeCore(state, serverKeyLookup);
}

export function makeMove(
  currentState: ParsedState,
  from: string,
  to: string,
  promotion?: string,
): MoveResult {
  return makeMoveCore(currentState, from, to, promotion, serverKeyLookup);
}
