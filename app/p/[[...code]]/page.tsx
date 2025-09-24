// app/p/[[...code]]/page.tsx

import { parseCode, generateCode } from '@/lib/state';
import { parseUrlSegment } from '@/lib/utils';
import { ChessBoard } from '@/components/chess-board';
import { redirect } from 'next/navigation';

export async function generateMetadata(props: PageProps<'/p/[[...code]]'>) {
  // Decode to get side-to-move → title + OG image path
  const { code } = await props.params;
  const codeString = parseUrlSegment(code);
  const { p } = (await (props.searchParams)) || {};

  let title = 'Your move';
  let ogCode = '';
  try {
    const parsed = parseCode(codeString);
    const { sideToMove } = parsed;

    // Derive last move destination when UCI is available (raw UCI or unknown u- payload)
    let lastToSquare: string | undefined;
    if (parsed.uci && parsed.uci.length >= 4) {
      const u = parsed.uci;
      // Handle promotion (5-char tail) vs normal (4-char tail)
      const maybePromo = u.slice(-5);
      const maybeNormal = u.slice(-4);
      const promoPattern = /^[a-h][1-8][a-h][1-8][nbrq]$/i;
      const normalPattern = /^[a-h][1-8][a-h][1-8]$/i;
      if (promoPattern.test(maybePromo)) {
        lastToSquare = maybePromo.slice(2, 4).toLowerCase();
      } else if (normalPattern.test(maybeNormal)) {
        lastToSquare = maybeNormal.slice(2, 4).toLowerCase();
      }
    }

    if (lastToSquare) {
      const movedColor = sideToMove === 'w' ? 'Black' : 'White';
      title = `${movedColor} moved to ${lastToSquare}, ${sideToMove === 'w' ? 'White' : 'Black'} to move`;
    } else {
      title = `${sideToMove === 'w' ? 'White' : 'Black'} to move`;
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

  // Canonicalize URL to prefer short u- codes when available
  const preferred = generateCode(gameState);
  if (codeString && preferred && codeString !== preferred) {
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
