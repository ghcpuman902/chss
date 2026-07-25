import { base64urlEncode } from '@/lib/base64url';

export const START_BOARD64 =
  'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR';

/** Convert FEN piece-placement field to a 64-char board string (a8..h1). */
export const fenToBoard64 = (fen: string): string => {
  const piecePlacement = fen.split(' ')[0] ?? '';
  let board64 = '';
  for (let i = 0; i < piecePlacement.length; i++) {
    const ch = piecePlacement[i] as string;
    if (ch === '/') continue;
    if (/^[1-8]$/.test(ch)) {
      board64 += '.'.repeat(Number.parseInt(ch, 10));
    } else {
      board64 += ch;
    }
  }
  if (board64.length !== 64) return START_BOARD64;
  return board64;
};

/** Build `o-<base64url(board64|w|b)>` code for OG routes. */
export const buildOgCode = (
  fen: string,
  perspective: 'w' | 'b',
): string => {
  const board64 = fenToBoard64(fen);
  const payload = base64urlEncode(`${board64}|${perspective}`);
  return `o-${payload}`;
};

/** Absolute or relative OG image path ending in `.png`. */
export const buildOgPath = (
  fen: string,
  perspective: 'w' | 'b',
  origin?: string,
): string => {
  const code = buildOgCode(fen, perspective);
  const path = `/og/${code}.png`;
  return origin ? `${origin}${path}` : path;
};

export const START_OG_CODE = buildOgCode(
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  'w',
);
