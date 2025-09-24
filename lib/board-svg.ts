// lib/board-svg.ts
import { Chess } from 'chess.js';

type Side = 'white'|'black';

const S = 48; // square size for internal SVG (384px total for 8x8)
const PAD = 12; // inner padding for letter fallback
const LIGHT = '#f0d9b5';
const DARK  = '#b58863';

const glyph = (t: string, color: 'w'|'b', squareSize: number, fontSize: number, yOffset: number) =>
  `<text x="${squareSize/2}" y="${squareSize/2+yOffset}" font-family="system-ui, sans-serif" font-size="${fontSize}" text-anchor="middle" fill="${color==='w'?'#111':'#eee'}">${t}</text>`;

const PIECE_GLYPH: Record<string,string> = {
  wP: '♙', wN: '♘', wB: '♗', wR: '♖', wQ: '♕', wK: '♔',
  bP: '♟', bN: '♞', bB: '♝', bR: '♜', bQ: '♛', bK: '♚',
};

export function svgFromFen(
  fen: string, 
  perspective: Side, 
  opts?: { 
    highlight?: {from:string,to:string}, 
    selectedSquare?: string,
    legalMoves?: string[],
    size?: 'sm' | 'md' | 'lg' 
  }
) {
  const chess = new Chess(fen);
  const board = chess.board(); // 8x8
  
  // Dynamic sizing based on breakpoints
  const sizeConfig = {
    sm: { square: 32, fontSize: 20, yOffset: 4 }, // 256px total
    md: { square: 40, fontSize: 24, yOffset: 5 }, // 320px total  
    lg: { square: 48, fontSize: 28, yOffset: 6 }  // 384px total
  };
  
  const config = sizeConfig[opts?.size || 'md'];
  const W = config.square * 8, H = config.square * 8;

  const rects: string[] = [];
  const marks: string[] = [];
  const pieces: string[] = [];

  // Helper function to get square coordinates
  const getSquareCoords = (sq: string) => {
    const file = sq.charCodeAt(0) - 97;           // a..h → 0..7
    const rank0 = Number(sq[1]) - 1;              // '1'..'8' → 0..7
    const fileV = perspective === 'white' ? file : 7 - file;
    const rankV = perspective === 'white' ? 7 - rank0 : rank0;
    return { x: fileV * config.square, y: rankV * config.square };
  };

  // Highlight last move
  const last = opts?.highlight;
  const hl = (sq: string) => {
    const { x, y } = getSquareCoords(sq);
    marks.push(`<rect x="${x}" y="${y}" width="${config.square}" height="${config.square}" fill="#ffd54f" opacity="0.35"/>`);
  };
  if (last) { hl(last.from); hl(last.to); }

  // Highlight selected square
  if (opts?.selectedSquare) {
    const { x, y } = getSquareCoords(opts.selectedSquare);
    marks.push(`<rect x="${x}" y="${y}" width="${config.square}" height="${config.square}" fill="#4fc3f7" opacity="0.4" stroke="#1976d2" stroke-width="2"/>`);
  }

  // Highlight legal moves
  if (opts?.legalMoves) {
    opts.legalMoves.forEach(sq => {
      const { x, y } = getSquareCoords(sq);
      const centerX = x + config.square / 2;
      const centerY = y + config.square / 2;
      const radius = config.square * 0.15;
      marks.push(`<circle cx="${centerX}" cy="${centerY}" r="${radius}" fill="#4caf50" opacity="0.6"/>`);
    });
  }

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const fileV = perspective === 'white' ? c : 7 - c;
      const rankV = perspective === 'white' ? 7 - r : r;
      const x = fileV * config.square, y = rankV * config.square;
      const dark = (r + c) % 2 === 1;
      rects.push(`<rect x="${x}" y="${y}" width="${config.square}" height="${config.square}" fill="${dark ? DARK : LIGHT}"/>`);
    }
  }

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      const fileV = perspective === 'white' ? c : 7 - c;
      const rankV = perspective === 'white' ? 7 - r : r;
      const x = fileV * config.square, y = rankV * config.square;
      const key = (piece.color === 'w' ? 'w' : 'b') + piece.type.toUpperCase();
      const g = PIECE_GLYPH[key];
      if (!g) continue;
      pieces.push(`<g transform="translate(${x},${y})">${glyph(g, piece.color === 'w' ? 'w' : 'b', config.square, config.fontSize, config.yOffset)}</g>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${rects.join('')}${marks.join('')}${pieces.join('')}</svg>`;
}
