'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import type React from 'react';
import { PawnIcon, KnightIcon, BishopIcon, RookIcon, QueenIcon, KingIcon } from './pieces';
import { useRouter } from 'next/navigation';
import { makeMove, getLegalMoves, generateCode, type ParsedState } from '@/lib/state';
import { TurnIndicator, type GameInfo } from './turn-indicator';
import { Chess, type Move, type Square } from 'chess.js';

interface ChessBoardProps {
  initialState: ParsedState;
  perspective: 'white' | 'black';
  onStateChange?: (newState: ParsedState) => void;
}

type PieceKey = 'wP' | 'wN' | 'wB' | 'wR' | 'wQ' | 'wK' | 'bP' | 'bN' | 'bB' | 'bR' | 'bQ' | 'bK';
type PieceComponentType = React.FC<React.SVGProps<SVGSVGElement>>;

const PIECE_COMPONENT: Record<PieceKey, PieceComponentType> = {
  wP: PawnIcon,
  wN: KnightIcon,
  wB: BishopIcon,
  wR: RookIcon,
  wQ: QueenIcon,
  wK: KingIcon,
  bP: PawnIcon,
  bN: KnightIcon,
  bB: BishopIcon,
  bR: RookIcon,
  bQ: QueenIcon,
  bK: KingIcon,
};

export const ChessBoard = ({ initialState, perspective, onStateChange }: ChessBoardProps) => {
  const [gameState, setGameState] = useState<ParsedState>(initialState);
  const [initialPageState] = useState<ParsedState>(initialState);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoves, setLegalMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string, to: string } | null>(null);
  const historyRef = useRef<ParsedState[]>([initialState]);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const router = useRouter();

  // Memoize chess instance for read-only queries
  const chessMemo = useMemo(() => new Chess(gameState.fen), [gameState.fen]);

  // Aggregate game info for the TurnIndicator (dynamic island)
  const indicatorInfo: GameInfo = useMemo(() => {
    const verboseMoves = chessMemo.moves({ verbose: true }) as Move[];
    const isCheck = typeof chessMemo.isCheck === 'function' ? chessMemo.isCheck() : (chessMemo.inCheck ? chessMemo.inCheck() : false);
    const info: GameInfo = {
      fen: gameState.fen,
      sideToMove: gameState.sideToMove,
      isCheck,
      isCheckmate: typeof chessMemo.isCheckmate === 'function' ? chessMemo.isCheckmate() : false,
      isStalemate: typeof chessMemo.isStalemate === 'function' ? chessMemo.isStalemate() : false,
      isDraw: typeof chessMemo.isDraw === 'function' ? chessMemo.isDraw() : false,
      onlyMove: verboseMoves.length === 1,
      legalMoves: verboseMoves.map((m: Move) => ({ from: m.from, to: m.to, san: m.san, flags: m.flags, promotion: m.promotion })),
      lastMove,
      code: generateCode(gameState),
      perspective,
    };
    return info;
  }, [chessMemo, gameState, lastMove, perspective]);

  const handleSquareClick = useCallback((square: string) => {
    // If no square is selected, select this square if it has a piece of the current player
    if (!selectedSquare) {
      const piece = chessMemo.get(square as Square);

      if (piece && piece.color === gameState.sideToMove) {
        setSelectedSquare(square);
        const moves = getLegalMoves(gameState.fen, square);
        setLegalMoves(moves);
        return;
      }
    }

    // If a square is selected, try to make a move
    if (selectedSquare === square) {
      // Deselect if clicking the same square
      setSelectedSquare(null);
      setLegalMoves([]);
      return;
    }

    // Check if this is a legal move
    if (legalMoves.includes(square) && selectedSquare) {
      const moveResult = makeMove(gameState, selectedSquare, square);

      if (moveResult.success && moveResult.newState) {
        setGameState(moveResult.newState);
        setLastMove({ from: selectedSquare, to: square });
        setSelectedSquare(null);
        setLegalMoves([]);

        // Push to in-session history and update undo availability
        historyRef.current.push(moveResult.newState);
        setCanUndo(historyRef.current.length > 1);

        // Update URL without navigation to preserve in-session orientation
        const newCode = generateCode(moveResult.newState);
        const newUrl = newCode ? `/p/${encodeURIComponent(newCode)}` : '/p';
        if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
          window.history.replaceState(null, '', newUrl);
        }

        // Notify parent component
        onStateChange?.(moveResult.newState);
      }
    } else {
      // Try to select a different piece
      const piece = chessMemo.get(square as Square);

      if (piece && piece.color === gameState.sideToMove) {
        setSelectedSquare(square);
        const moves = getLegalMoves(gameState.fen, square);
        setLegalMoves(moves);
      } else {
        setSelectedSquare(null);
        setLegalMoves([]);
      }
    }
  }, [selectedSquare, legalMoves, gameState, onStateChange, chessMemo]);

  const handleShare = useCallback(async () => {
    // Prevent sharing before any move has been made
    if (historyRef.current.length <= 1) return;

    const url = window.location.href;
    const shareData: ShareData = {
      title: `${perspective === 'white' ? 'White' : 'Black'} to move`,
      text: "It’s your turn! Open, make your move, and reply-share the link to keep the game going.",
      url,
    };

    type NavigatorWithShare = Navigator & {
      canShare?: (data?: ShareData) => boolean;
      share?: (data?: ShareData) => Promise<void>;
    };
    const nav = navigator as NavigatorWithShare;

    if (typeof nav.share === 'function') {
      try {
        if (typeof nav.canShare === 'function' && !nav.canShare(shareData)) {
          throw new Error('Share data not supported by this browser');
        }
        await nav.share(shareData);
        return;
      } catch (error) {
        console.log('Share failed, falling back to clipboard:', error);
      }
    }

    // Fallbacks only if Web Share is unavailable or fails
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this link', url);
    }
  }, [perspective]);

  const handleUndo = useCallback(() => {
    // If there is no prior state, do nothing
    if (historyRef.current.length <= 1) return;

    // Remove current state and step back to previous
    historyRef.current.pop();
    const previousState = historyRef.current[historyRef.current.length - 1] ?? initialPageState;

    setGameState(previousState);
    setSelectedSquare(null);
    setLegalMoves([]);
    setLastMove(null);

    // Update undo availability
    setCanUndo(historyRef.current.length > 1);

    // Update URL without navigation
    const newCode = generateCode(previousState);
    const newUrl = newCode ? `/p/${encodeURIComponent(newCode)}` : '/p';
    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
      window.history.replaceState(null, '', newUrl);
    }

    onStateChange?.(previousState);
  }, [initialPageState, onStateChange]);

  const handleNewGame = useCallback(() => {
    router.push('/p');
  }, [router]);

  // Generate board squares (orientation via iteration order)
  const renderBoard = () => {
    const board = chessMemo.board();
    const squares = [] as React.ReactNode[];

    const rankOrder = perspective === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
    const fileOrder = perspective === 'white' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];

    for (const rank of rankOrder) {
      for (const file of fileOrder) {
        // Model-square coordinates (independent of visual perspective)
        const square = String.fromCharCode(97 + file) + (8 - rank);
        const piece = board[rank][file];
        const isLight = (rank + file) % 2 === 0;
        const isSelected = selectedSquare === square;
        const isLegalMove = legalMoves.includes(square);
        const isLastMove = lastMove && (lastMove.from === square || lastMove.to === square);

        squares.push(
          <div
            key={square}
            className={`chess-square ${isLight ? 'light' : 'dark'} ${isLegalMove ? 'legal-move' : ''} ${isLastMove ? 'last-move' : ''}`}
            onClick={() => handleSquareClick(square)}
          >
            <input
              type="radio"
              name="selected-square"
              checked={isSelected}
              onChange={() => { }}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <div className="square-content w-full h-full flex items-center justify-center">
              {piece && (() => {
                const key = (piece.color + piece.type.toUpperCase()) as PieceKey;
                const Icon = PIECE_COMPONENT[key];
                const isKing = piece.type === 'k';
                const kingInCheck = isKing && piece.color === gameState.sideToMove && indicatorInfo.isCheck;
                return (
                  <span className={`chess-piece inline-flex items-center justify-center ${isKing ? 'king ' : ''}${kingInCheck ? 'king-in-check ' : ''}${piece.color === 'w' ? 'white' : 'black'}`}>
                    <Icon className="block w-[72%] h-[72%]" />
                  </span>
                );
              })()}
            </div>
          </div>
        );
      }
    }

    return squares;
  };

  return (
    <div className="relative w-full">
      {/* Top-right New Game */}
      {/* Board + Side Indicator */
      /* Position indicator absolutely so the board stays centered */}
      <div className="relative mx-auto w-fit">
        <div className={`chess-board`}>
          {renderBoard()}
        </div>
          <TurnIndicator info={indicatorInfo} />
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          aria-disabled={!canUndo}
          className={`px-8 py-3 border border-border rounded-lg font-medium transition-colors ${canUndo ? 'hover:bg-muted' : 'opacity-50'}`}
        >
          Undo
        </button>
        {(() => {
          const canSharePosition = historyRef.current.length > 1;
          const isInCheck = indicatorInfo.isCheck;
          const shareText = canSharePosition 
            ? isInCheck 
              ? `Send to ${perspective === 'white' ? 'Black' : 'White'} (in check!)`
              : `Send to ${perspective === 'white' ? 'Black' : 'White'}`
            : 'Share';
          return (
            <button
              onClick={handleShare}
              disabled={!canSharePosition}
              aria-disabled={!canSharePosition}
              className={`px-8 py-3 bg-primary text-primary-foreground rounded-lg font-medium transition-colors ${canSharePosition ? 'hover:bg-primary/90' : 'opacity-50'}`}
            >
              {shareText}
              {/* always send to opponent */}
            </button>
          );
        })()}
      </div>

      <div className="mt-12 flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={handleNewGame}
            aria-label="New Game"
            className="px-8 py-3 border border-border rounded-lg font-medium"
          >
            <span className="text-lg">New Game</span>
          </button>
        </div>
    </div>
  );
};
