// app/p/[[...code]]/page.tsx

import { parseCode, generateCode } from '@/lib/state';
import { parseUrlSegment } from '@/lib/utils';
import { ChessBoard } from '@/components/chess-board';
import { redirect } from 'next/navigation';
import { Move } from 'chess.js';

export async function generateMetadata(props: PageProps<'/p/[[...code]]'>) {
  // Decode to get side-to-move → title + OG image path
  const { code } = await props.params;
  const codeString = parseUrlSegment(code);
  const { p } = (await (props.searchParams)) || {};

  let title = "Your move";
  let ogCode = '';
  try {
    const parsed = parseCode(codeString);
    const { sideToMove } = parsed;

    // Derive last move details (piece + to-square) when UCI is available
    let lastToSquare: string | undefined;
    let lastPieceName: string | undefined;
    // Try to reconstruct from URL when it encodes raw UCI directly
    const uciCandidate = (() => {
      if (!codeString) return '';
      if (codeString.startsWith('u-')) return codeString.slice(2);
      if (codeString.startsWith('f-')) return '';
      return codeString;
    })();
    const uciPattern = /^([a-h][1-8][a-h][1-8][nbrq]?)+$/i;
    const useUci = uciCandidate && uciPattern.test(uciCandidate);
    const uciToSimulate = useUci ? uciCandidate : (parsed.uci || '');
    if (uciToSimulate && uciToSimulate.length >= 4) {
      const { Chess } = await import('chess.js');
      const chess = new Chess();
      for (let i = 0; i < uciToSimulate.length;) {
        const from = uciToSimulate.slice(i, i + 2);
        const to = uciToSimulate.slice(i + 2, i + 4);
        const next = uciToSimulate[i + 4];
        const promo = next && /[nbrq]/i.test(next) ? next.toLowerCase() : undefined;
        const step = promo ? 5 : 4;
        const res = chess.move({ from, to, promotion: promo as Move['promotion'] });
        if (!res) break;
        i += step;
        if (i >= uciToSimulate.length) {
          lastToSquare = String(res.to).toLowerCase();
          const pieceMap: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
          lastPieceName = pieceMap[String(res.piece).toLowerCase()] || undefined;
        }
      }
    }

    if (lastToSquare && lastPieceName) {
      const movedColor = sideToMove === 'w' ? 'Black' : 'White';
      const nextColor = sideToMove === 'w' ? "white" : "black";
      title = `${movedColor} ${lastPieceName} to ${lastToSquare}, ${nextColor}'s turn`;
    } else {
      // Fallback: we don't know the last move detail (e.g., short u-keys)
      const nextColor = sideToMove === 'w' ? "White" : "Black";
      title = `${nextColor}'s turn`;
    }
    // Determine perspective for OG: query param overrides, else side-to-move; empty code -> white
    const perspectiveLetter: 'w' | 'b' = p === 'w' || p === 'b' ? p : (codeString ? sideToMove : 'w');
    // Convert FEN piece placement to 64-char board string (a8..h1)
    const fen = parsed.fen;
    const piecePlacement = fen.split(' ')[0] ?? '';
    let board64 = '';
    for (let i = 0; i < piecePlacement.length; i++) {
      const ch = piecePlacement[i] as string;
      if (ch === '/') continue;
      if (/^[1-8]$/.test(ch)) {
        const n = Number.parseInt(ch, 10);
        board64 += '.'.repeat(n);
      } else {
        board64 += ch;
      }
    }
    if (board64.length !== 64) {
      // Fallback to start position
      board64 = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR'.replace(/\./g, '.');
    }
    // base64url encode without padding
    const btoaSafe = (s: string) => (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'utf8').toString('base64'));
    const base64urlEncode = (s: string) => btoaSafe(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const payload = base64urlEncode(`${board64}|${perspectiveLetter}`);
    ogCode = `o-${payload}`;
  } catch { }
  return {
    title,
    openGraph: { title, images: [`https://chss.chat/og/${ogCode}.png`] },
    twitter: { card: 'summary_large_image', title, images: [`https://chss.chat/og/${ogCode}.png`] },
  };
}

export default async function Page(props: PageProps<'/p/[[...code]]'>) {
  const { code } = await props.params;
  const codeString = parseUrlSegment(code);
  const { p } = await props.searchParams

  let gameState;
  try {
    gameState = parseCode(codeString);
  } catch {
    // Fallback to initial position
    gameState = {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      sideToMove: 'w' as const
    };
  }

  // Canonicalize URL:
  // - If incoming looks like raw UCI (keep as-is for detailed titles), do NOT redirect
  // - Otherwise, prefer short u- codes when available
  const preferred = generateCode(gameState);
  const uciPattern = /^([a-h][1-8][a-h][1-8][nbrq]?)+$/i;
  const isRawUci = !!codeString && !codeString.startsWith('u-') && !codeString.startsWith('f-') && uciPattern.test(codeString);
  if (!isRawUci && codeString && preferred && codeString !== preferred) {
    const search = p === 'w' || p === 'b' ? `?p=${p}` : '';
    redirect(`/p/${encodeURIComponent(preferred)}${search}`);
  }

  // Determine perspective:
  // 1. If 'p' parameter is provided, use it
  // 2. For empty board (no code), default to white perspective
  // 3. Otherwise, use side-to-move perspective (opponent's view)
  let perspective: 'white' | 'black';
  if (p === 'w' || p === 'b') {
    perspective = p === 'w' ? 'white' : 'black';
  } else if (!codeString || codeString === '') {
    perspective = 'white'; // Default to white for empty board
  } else {
    perspective = gameState.sideToMove === 'w' ? 'white' : 'black';
  }

  return (
    <main className="bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="container max-w-2xl mx-auto px-4 py-24">
          <ChessBoard
            initialState={gameState}
            perspective={perspective}
          />
        </div>
      </section>
    </main>
  );
}
