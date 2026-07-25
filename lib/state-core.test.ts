import { describe, expect, it } from 'vitest';
import {
  START_FEN,
  generateCode,
  makeMove,
  parseCode,
  type KeyLookup,
  type ParsedState,
} from '@/lib/state-core';
import { base64urlEncode } from '@/lib/base64url';
import { buildOgCode, fenToBoard64 } from '@/lib/og-encoding';
import { buildShareTitle } from '@/lib/share-title';

const tinyKeys: KeyLookup = {
  keyToFen: (key) => (key === 'abc' ? 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1' : undefined),
  fenToKey: (fen) =>
    fen === 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1' ? 'abc' : undefined,
};

describe('parseCode', () => {
  it('returns start position for empty code', () => {
    const parsed = parseCode('');
    expect(parsed.fen).toBe(START_FEN);
    expect(parsed.sideToMove).toBe('w');
  });

  it('parses raw UCI and preserves uci', () => {
    const parsed = parseCode('e2e4');
    expect(parsed.sideToMove).toBe('b');
    expect(parsed.uci).toBe('e2e4');
    expect(parsed.fen).toContain('4P3');
  });

  it('round-trips f- FEN encoding', () => {
    const after = parseCode('e2e4e7e5');
    const code = generateCode(after);
    expect(code.startsWith('f-')).toBe(true);
    const again = parseCode(code);
    expect(again.fen).toBe(after.fen);
    expect(again.sideToMove).toBe(after.sideToMove);
  });

  it('resolves u- keys when lookup is provided', () => {
    const parsed = parseCode('u-abc', tinyKeys);
    expect(parsed.uKey).toBe('abc');
    expect(parsed.sideToMove).toBe('b');
  });

  it('falls back safely on invalid UCI', () => {
    const parsed = parseCode('zzzz');
    expect(parsed.fen).toBe(START_FEN);
  });

  it('falls back safely on invalid f- FEN', () => {
    const bad = `f-${base64urlEncode('not-a-fen')}`;
    const parsed = parseCode(bad);
    expect(parsed.fen).toBe(START_FEN);
  });
});

describe('generateCode', () => {
  it('returns empty string for start position', () => {
    expect(generateCode({ fen: START_FEN, sideToMove: 'w' })).toBe('');
  });

  it('prefers u- key when lookup finds FEN', () => {
    const state: ParsedState = {
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      sideToMove: 'b',
    };
    expect(generateCode(state, tinyKeys)).toBe('u-abc');
  });

  it('uses f- when no key map (client path)', () => {
    const state = parseCode('e2e4');
    const code = generateCode(state);
    expect(code.startsWith('f-')).toBe(true);
  });
});

describe('makeMove', () => {
  it('applies a quiet move and always appends UCI', () => {
    const start: ParsedState = { fen: START_FEN, sideToMove: 'w' };
    const result = makeMove(start, 'e2', 'e4');
    expect(result.success).toBe(true);
    expect(result.newState?.sideToMove).toBe('b');
    expect(result.newState?.uci).toBe('e2e4');
  });

  it('rejects illegal moves', () => {
    const start: ParsedState = { fen: START_FEN, sideToMove: 'w' };
    const result = makeMove(start, 'e2', 'e5');
    expect(result.success).toBe(false);
  });

  it('supports castling', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const result = makeMove({ fen, sideToMove: 'w' }, 'e1', 'g1');
    expect(result.success).toBe(true);
    expect(result.newState?.fen.startsWith('r3k2r/8/8/8/8/8/8/R4RK1')).toBe(true);
  });

  it('supports en passant', () => {
    const fen = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
    const result = makeMove({ fen, sideToMove: 'w' }, 'e5', 'd6');
    expect(result.success).toBe(true);
    expect(result.newState?.uci).toBe('e5d6');
  });

  it('supports promotion', () => {
    const fen = '8/P7/8/8/8/8/8/4K2k w - - 0 1';
    const result = makeMove({ fen, sideToMove: 'w' }, 'a7', 'a8', 'q');
    expect(result.success).toBe(true);
    expect(result.newState?.uci).toBe('a7a8q');
    expect(result.newState?.fen.includes('Q')).toBe(true);
  });

  it('chains UCI across multiple moves', () => {
    const first = makeMove({ fen: START_FEN, sideToMove: 'w' }, 'e2', 'e4');
    expect(first.success).toBe(true);
    const second = makeMove(first.newState!, 'e7', 'e5');
    expect(second.success).toBe(true);
    expect(second.newState?.uci).toBe('e2e4e7e5');
  });
});

describe('OG encoding parity', () => {
  it('builds the same o- code for FEN + sideToMove', () => {
    const parsed = parseCode('e2e4');
    const code = buildOgCode(parsed.fen, parsed.sideToMove);
    expect(code.startsWith('o-')).toBe(true);
    expect(fenToBoard64(parsed.fen)).toHaveLength(64);
    // Recipient view after e2e4 is black
    expect(code).toBe(buildOgCode(parsed.fen, 'b'));
  });

  it('matches start-position board64 length', () => {
    expect(fenToBoard64(START_FEN)).toHaveLength(64);
  });
});

describe('buildShareTitle', () => {
  it('uses side-to-move, not board perspective', () => {
    // After White moved, Black to move
    expect(buildShareTitle('b', 'e4')).toBe('White moved to e4, Black to move');
    // After Black moved, White to move
    expect(buildShareTitle('w', 'e5')).toBe('Black moved to e5, White to move');
  });

  it('falls back without last move', () => {
    expect(buildShareTitle('w')).toBe('White to move');
    expect(buildShareTitle('b', null)).toBe('Black to move');
  });
});
