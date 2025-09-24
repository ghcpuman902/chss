// app/og/[code]/route.ts
export const runtime = 'edge';

import { ImageResponse } from 'next/og';
import { parseCode } from '@/lib/state';
import { parseUrlSegment } from '@/lib/utils';
import { Chess } from 'chess.js';

const PIECE_GLYPH: Record<string, string> = {
  wP: '♙', wN: '♘', wB: '♗', wR: '♖', wQ: '♕', wK: '♔',
  bP: '♟', bN: '♞', bB: '♝', bR: '♜', bQ: '♛', bK: '♚',
};

export async function GET(_req: Request, { params }: { params: Promise<{ code?: string[] }> }) {
  const resolvedParams = await params;
  const codeString = parseUrlSegment(resolvedParams.code);
  
  let gameState;
  try {
    gameState = parseCode(codeString);
  } catch {
    // Fallback to initial position for invalid codes
    gameState = { 
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 
      sideToMove: 'w' as const
    };
  }
  
  const { fen, sideToMove } = gameState;
  const perspective = sideToMove === 'w' ? 'white' : 'black';

  // Generate board squares for OG image
  const renderBoardSquares = () => {
    const chess = new Chess(fen);
    const board = chess.board();
    const squares = [];

    for (let rank = 0; rank < 8; rank++) {
      for (let file = 0; file < 8; file++) {
        const piece = board[rank][file];
        const isLight = (rank + file) % 2 === 0;

        squares.push(
          <div
            key={`${rank}-${file}`}
            style={{
              width: '60px',
              height: '60px',
              backgroundColor: isLight ? '#f0d9b5' : '#b58863',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '32px',
              color: piece && piece.color === 'w' ? '#111' : '#eee',
            }}
          >
            {piece && PIECE_GLYPH[piece.color + piece.type.toUpperCase()]}
          </div>
        );
      }
    }

    return squares;
  };

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          background: 'white',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px',
          gap: '40px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(8, 60px)',
            gridTemplateRows: 'repeat(8, 60px)',
            border: '2px solid #333',
          }}
        >
          {renderBoardSquares()}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 48, fontWeight: 700 }}>
            {sideToMove === 'w' ? 'White' : 'Black'} to move
          </div>
          <div style={{ fontSize: 24, opacity: 0.7, marginTop: 12 }}>
            Tap to reply with your move
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
