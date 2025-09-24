// app/og/[code]/route.ts
export const runtime = 'edge';

import { ImageResponse } from 'next/og';
import { parseCode } from '@/lib/state';
import { parseUrlSegment } from '@/lib/utils';
import { Chess } from 'chess.js';
import { PreSatori } from '@/lib/pre-satori';

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

  // Generate board rows (pure flex) in opponent's view (side-to-move at bottom)
  const renderBoardRows = () => {
    const chess = new Chess(fen);
    const board = chess.board();
    const rows: React.ReactNode[] = [];

    const indices = [...Array(8).keys()];
    const rankIndices = sideToMove === 'w' ? indices : [...indices].reverse();
    const fileIndices = sideToMove === 'w' ? indices : [...indices].reverse();

    for (const rank of rankIndices) {
      const squares: React.ReactNode[] = [];
      for (const file of fileIndices) {
        const piece = board[rank][file];
        const isLight = (rank + file) % 2 === 0;
        squares.push(
          <div
            key={`sq-${rank}-${file}`}
            style={{
              width: '60px',
              height: '60px',
              backgroundColor: isLight ? '#f0d9b5' : '#b58863',
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
      rows.push(
        <div key={`row-${rank}`} style={{ flexDirection: 'row' }}>
          {squares}
        </div>
      );
    }

    return rows;
  };

  const imageResponse = new ImageResponse(
    (
      <PreSatori>
        {(transform) => (
          <>
            {transform(
              <div className="flex flex-row h-full w-full items-center justify-center gap-10 p-12 bg-white">
                <div style={{ border: '2px solid #333', padding: '2px' }}>
                  <div style={{ flexDirection: 'column' }}>
                    {renderBoardRows()}
                  </div>
                </div>
                <div className="flex flex-col">
                  <div style={{ fontSize: 48, fontWeight: 700 }}>
                    {sideToMove === 'w' ? 'White' : 'Black'} to move
                  </div>
                  <div style={{ fontSize: 24, opacity: 0.7, marginTop: 12 }}>
                    Tap to reply with your move
                  </div>
                </div>
              </div>,
            )}
          </>
        )}
      </PreSatori>
    ),
    { width: 1200, height: 630 }
  );

  imageResponse.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return imageResponse;
}
