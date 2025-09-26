'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import type React from 'react';
import { PawnIcon, KnightIcon, BishopIcon, RookIcon, QueenIcon, KingIcon } from './pieces';
import { useRouter } from 'next/navigation';
import { makeMove, getLegalMoves, generateCode, type ParsedState } from '@/lib/state';
import { TurnIndicator, type GameInfo, type Outcome, type DrawReason } from './turn-indicator';
import { Chess, type Move, type Square } from 'chess.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

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

  // Promotion picker state
  const [promotionOpen, setPromotionOpen] = useState<boolean>(false);
  const [promotionFrom, setPromotionFrom] = useState<string | null>(null);
  const [promotionTo, setPromotionTo] = useState<string | null>(null);
  const [promotionAnchor, setPromotionAnchor] = useState<string | null>(null);
  const promotionBaseStateRef = useRef<ParsedState | null>(null);
  const promotionAppliedRef = useRef<boolean>(false);

  // Memoize chess instance for read-only queries
  const chessMemo = useMemo(() => new Chess(gameState.fen), [gameState.fen]);

  // Aggregate game info for the TurnIndicator (dynamic island)
  const indicatorInfo: GameInfo = useMemo(() => {
    const verboseMoves = chessMemo.moves({ verbose: true }) as Move[];
    const isCheck = typeof chessMemo.isCheck === 'function' ? chessMemo.isCheck() : (chessMemo.inCheck ? chessMemo.inCheck() : false);
    const isCheckmate = typeof chessMemo.isCheckmate === 'function' ? chessMemo.isCheckmate() : false;
    const isStalemate = typeof chessMemo.isStalemate === 'function' ? chessMemo.isStalemate() : false;
    const isThreefold = typeof (chessMemo as Chess).isThreefoldRepetition === 'function' ? (chessMemo as Chess).isThreefoldRepetition() : false;
    const isFifty = typeof (chessMemo as Chess).isDrawByFiftyMoves === 'function' ? (chessMemo as Chess).isDrawByFiftyMoves() : false;
    const isInsufficient = typeof chessMemo.isInsufficientMaterial === 'function' ? chessMemo.isInsufficientMaterial() : false;
    const isDraw = typeof chessMemo.isDraw === 'function' ? chessMemo.isDraw() : false;

    const outcome: Outcome = isCheckmate ? 'checkmate' : (isStalemate || isDraw || isThreefold || isFifty || isInsufficient) ? 'draw' : 'ongoing';
    const drawReason: DrawReason | undefined = outcome === 'draw'
      ? (isStalemate ? 'stalemate' : isFifty ? 'fifty-move' : isThreefold ? 'threefold' : isInsufficient ? 'insufficient' : 'other')
      : undefined;
    const info: GameInfo = {
      fen: gameState.fen,
      sideToMove: gameState.sideToMove,
      isCheck,
      isCheckmate,
      isStalemate,
      isDraw,
      outcome,
      drawReason,
      onlyMove: verboseMoves.length === 1,
      legalMoves: verboseMoves.map((m: Move) => ({ from: m.from, to: m.to, san: m.san, flags: m.flags, promotion: m.promotion })),
      lastMove,
      code: generateCode(gameState),
      perspective,
    };
    return info;
  }, [chessMemo, gameState, lastMove, perspective]);

  // Compute OG image URL for the current position and perspective
  const computeOgUrl = useCallback((): string => {
    const perspectiveLetter: 'w' | 'b' = perspective === 'white' ? 'w' : 'b';
    const piecePlacement = gameState.fen.split(' ')[0] ?? '';
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
      board64 = 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR'.replace(/\./g, '.');
    }
    const btoaSafe = (s: string) => (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'utf8').toString('base64'));
    const base64urlEncode = (s: string) => btoaSafe(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    const ogPayload = base64urlEncode(`${board64}|${perspectiveLetter}`);
    const ogCode = `o-${ogPayload}`;
    return `${window.location.origin}/og/${ogCode}.png`;
  }, [gameState.fen, perspective]);

  // Fire-and-forget prewarm for OG route, avoids blocking share sheet
  const lastWarmedOgRef = useRef<string | null>(null);
  const prewarmOg = useCallback(() => {
    try {
      const ogUrl = computeOgUrl();
      if (lastWarmedOgRef.current === ogUrl) return;
      lastWarmedOgRef.current = ogUrl;
      fetch(ogUrl, { cache: 'force-cache', keepalive: true }).catch(() => {});
    } catch {}
  }, [computeOgUrl]);

  // Opportunistically warm on state/perspective changes
  useEffect(() => {
    prewarmOg();
  }, [prewarmOg]);

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
      // Detect if this move is a promotion; if so, open promotion picker instead of moving immediately
      try {
        const verboseMoves = chessMemo.moves({ square: selectedSquare as Square, verbose: true }) as Move[];
        const candidate = verboseMoves.find((m: Move) => m.to === square);
        if (candidate && (candidate as Move).promotion) {
          // Initialize promotion context
          setPromotionFrom(selectedSquare);
          setPromotionTo(square);
          setPromotionAnchor(square);
          promotionBaseStateRef.current = gameState;
          promotionAppliedRef.current = false;
          setPromotionOpen(true);
          return;
        }
      } catch {}

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

        // Prewarm OG for the new position immediately after the move
        prewarmOg();
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
  }, [selectedSquare, legalMoves, gameState, onStateChange, chessMemo, prewarmOg]);

  // Apply a promotion choice; supports re-choosing while popover remains open
  const handleChoosePromotion = useCallback((piece: 'q' | 'r' | 'b' | 'n') => {
    if (!promotionFrom || !promotionTo) return;

    // If user already applied a choice while the popover is open, revert to base before re-applying
    if (promotionAppliedRef.current && historyRef.current.length > 1) {
      historyRef.current.pop();
    }

    const base = promotionBaseStateRef.current ?? gameState;
    const moveResult = makeMove(base, promotionFrom, promotionTo, piece);
    if (!moveResult.success || !moveResult.newState) return;

    setGameState(moveResult.newState);
    setLastMove({ from: promotionFrom, to: promotionTo });
    setSelectedSquare(null);
    setLegalMoves([]);

    // Maintain history: replace last if re-choosing, else push new
    historyRef.current.push(moveResult.newState);
    setCanUndo(historyRef.current.length > 1);

    // Update URL without navigation
    const newCode = generateCode(moveResult.newState);
    const newUrl = newCode ? `/p/${encodeURIComponent(newCode)}` : '/p';
    if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
      window.history.replaceState(null, '', newUrl);
    }

    onStateChange?.(moveResult.newState);
    promotionAppliedRef.current = true;

    // Prewarm OG for the promoted position
    prewarmOg();
  }, [gameState, onStateChange, promotionFrom, promotionTo, prewarmOg]);

  const handleShare = useCallback(async () => {
    // Prevent sharing before any move has been made
    if (historyRef.current.length <= 1) return;

    const url = window.location.href;
    // Warm OG non-blocking
    prewarmOg();

    // Build aligned title, e.g., "Black moved to e6, White to move"
    let alignedTitle = `${perspective === 'white' ? 'White' : 'Black'} to move`;
    if (lastMove && lastMove.to) {
      const movedColor = perspective === 'white' ? 'Black' : 'White';
      alignedTitle = `${movedColor} moved to ${lastMove.to.toLowerCase()}, ${perspective === 'white' ? 'White' : 'Black'} to move`;
    }

    const baseShare: ShareData = {
      title: alignedTitle,
      text: 'Open, make your move, and reply-share to keep the game going.',
      url,
    };

    type NavigatorWithShare = Navigator & {
      canShare?: (data?: ShareData) => boolean;
      share?: (data?: ShareData) => Promise<void>;
    };
    const nav = navigator as NavigatorWithShare;

    if (typeof nav.share === 'function') {
      try {
        await nav.share(baseShare);
        return; // Success
      } catch (error: unknown) {
        // If user explicitly cancelled the sheet, do nothing
        const name = (error as Error)?.name;
        if (name === 'AbortError') {
          return;
        }
        // For any other share error, do not fallback to copy when Web Share exists
        return;
      }
    }

    // No Web Share API available → copy the URL to clipboard only
    try {
      await navigator.clipboard.writeText(url);
    } catch {}
  }, [perspective, lastMove, prewarmOg]);

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

    // Prewarm OG for the undone position
    prewarmOg();
  }, [initialPageState, onStateChange, prewarmOg]);

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

        const squareDiv = (
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

        // Wrap with Popover trigger if this is the promotion anchor square
        if (promotionAnchor === square) {
          squares.push(
            <Popover key={`${square}-popover`} open={promotionOpen} onOpenChange={(o) => {
              setPromotionOpen(o);
              if (!o) {
                // Closing: clear context
                setPromotionAnchor(null);
                setPromotionFrom(null);
                setPromotionTo(null);
                promotionBaseStateRef.current = null;
                promotionAppliedRef.current = false;
              }
            }}>
              <PopoverTrigger asChild>
                {squareDiv}
              </PopoverTrigger>
              <PopoverContent align="center" side="top" className="w-auto p-2 rounded-xl">
                <div className="flex items-center gap-2">
                  {([
                    { k: 'q', Icon: QueenIcon, label: 'Promote to Queen' },
                    { k: 'r', Icon: RookIcon, label: 'Promote to Rook' },
                    { k: 'b', Icon: BishopIcon, label: 'Promote to Bishop' },
                    { k: 'n', Icon: KnightIcon, label: 'Promote to Knight' },
                  ] as const).map(({ k, Icon, label }) => (
                    <button
                      key={k}
                      type="button"
                      aria-label={label}
                      onClick={(e) => { e.stopPropagation(); handleChoosePromotion(k); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleChoosePromotion(k); } }}
                      className="h-12 w-12 rounded-full border border-border bg-neutral-200 inset-shadow-xs inset-shadow-neutral-300 hover:bg-muted flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <Icon className={cn( `size-7` , perspective===`white`?`text-white`:`text-black`)} />
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          );
        } else {
          squares.push(squareDiv);
        }
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

          const isTerminal = indicatorInfo.outcome !== 'ongoing';
          const isCheckmateTerminal = indicatorInfo.outcome === 'checkmate';
          const isAnyDraw = indicatorInfo.outcome === 'draw';
          const winnerColor = indicatorInfo.sideToMove === 'w' ? 'black' : 'white';
          const isViewerWinner = perspective === winnerColor;

          let shareText = 'Share';
          let shareDisabled = !canSharePosition;

          if (isTerminal) {
            if (isCheckmateTerminal) {
              if (isViewerWinner) {
                shareText = 'Checkmate — You win (share to them)';
                shareDisabled = !canSharePosition ? true : false;
              } else {
                shareText = 'Checkmate — They win';
                shareDisabled = true;
              }
            } else if (isAnyDraw) {
              const reasonMap: Record<DrawReason, string> = {
                'stalemate': 'Stalemate',
                'fifty-move': '50-move',
                'threefold': 'Threefold',
                'insufficient': 'Insufficient',
                'other': 'Draw',
              };
              const reasonLabel = indicatorInfo.drawReason ? reasonMap[indicatorInfo.drawReason] : 'Draw';
              shareText = `Draw — ${reasonLabel} (share result)`;
              shareDisabled = !canSharePosition ? true : false;
            }
          } else {
            const isInCheck = indicatorInfo.isCheck;
            shareText = canSharePosition
              ? isInCheck
                ? `Send to ${perspective === 'white' ? 'Black' : 'White'} (in check!)`
                : `Send to ${perspective === 'white' ? 'Black' : 'White'}`
              : 'Share';
            shareDisabled = !canSharePosition;
          }

          return (
            <button
              onClick={handleShare}
              disabled={shareDisabled}
              aria-disabled={shareDisabled}
              className={`px-8 py-3 bg-primary text-primary-foreground rounded-lg font-medium transition-colors ${!shareDisabled ? 'hover:bg-primary/90' : 'opacity-50'}`}
            >
              {shareText}
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
