'use client';

import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import type React from 'react';
import { PawnIcon, KnightIcon, BishopIcon, RookIcon, QueenIcon, KingIcon } from './pieces';
import { useRouter } from 'next/navigation';
import { makeMove, getLegalMoves, generateCode, parseCode, type ParsedState } from '@/lib/state';
import { TurnIndicator, type GameInfo, type Outcome, type DrawReason } from './turn-indicator';
import { Chess, type Move, type Square } from 'chess.js';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Undo2 } from 'lucide-react';

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
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalMoves, setLegalMoves] = useState<string[]>([]);
  const [lastMove, setLastMove] = useState<{ from: string, to: string } | null>(null);
  const historyRef = useRef<ParsedState[]>([initialState]);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const historyStepRef = useRef<number>(0);
  const initialCodeRef = useRef<string>(generateCode(initialState));
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

  // Initialize history state and handle browser back/forward
  useEffect(() => {
    const computeLastMoveDetails = async (uci?: string): Promise<{ to?: string; pieceName?: string }> => {
      try {
        if (!uci || uci.length < 4) return {};
        const mod = await import('chess.js');
        const C = (mod as { Chess: typeof Chess }).Chess;
        const chess = new C();
        for (let i = 0; i < uci.length;) {
          const from = uci.slice(i, i + 2);
          const to = uci.slice(i + 2, i + 4);
          const next = uci[i + 4];
          const promo = next && /[nbrq]/i.test(next) ? next.toLowerCase() : undefined;
          const step = promo ? 5 : 4;
          const res = chess.move({ from, to, promotion: promo as Move['promotion'] });
          if (!res) break;
          i += step;
          if (i >= uci.length) {
            const pieceMap: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
            return { to: String(res.to).toLowerCase(), pieceName: pieceMap[String(res.piece).toLowerCase()] };
          }
        }
      } catch {}
      return {};
    };

    const setDocumentTitle = (state: ParsedState, details?: { to?: string; pieceName?: string }) => {
      try {
        const site = 'chss.chat';
        const nextColorLc = state.sideToMove === 'w' ? 'white' : 'black';
        if (details && details.to && details.pieceName) {
          const movedColor = state.sideToMove === 'w' ? 'Black' : 'White';
          document.title = `${movedColor} ${details.pieceName} to ${details.to}, ${nextColorLc}'s turn | ${site}`;
        } else {
          document.title = `${nextColorLc}'s turn | ${site}`;
        }
      } catch {}
    };

    const getCodeFromLocation = (): string => {
      try {
        const path = window.location.pathname || '';
        const prefix = '/p';
        const idx = path.indexOf(prefix);
        if (idx === -1) return '';
        const after = path.slice(idx + prefix.length);
        if (!after || after === '/') return '';
        const seg = after.startsWith('/') ? after.slice(1) : after;
        return decodeURIComponent(seg);
      } catch {
        return '';
      }
    };

    // Ensure current entry has a baseline state
    try {
      if (window.history && window.history.replaceState) {
        const current = window.history.state as { step?: number; code?: string } | null;
        if (!current || typeof current.step !== 'number') {
          window.history.replaceState({ step: 0, code: initialCodeRef.current }, '', window.location.pathname + window.location.search);
        } else {
          historyStepRef.current = current.step || 0;
        }
        setCanUndo(historyStepRef.current > 0);
        // Initialize title on mount
        setDocumentTitle(gameState, undefined);
      }
    } catch {}

    const onPopState = (event: PopStateEvent) => {
      try {
        const codeStr = getCodeFromLocation();
        const parsed = parseCode(codeStr);
        setGameState(parsed);
        setSelectedSquare(null);
        setLegalMoves([]);
        setLastMove(null);
        // Sync step and in-memory history
        const newStep = event.state && typeof event.state.step === 'number' ? event.state.step : (codeStr && codeStr !== initialCodeRef.current ? 1 : 0);
        historyStepRef.current = newStep;
        // Resize local history buffer to reflect step position
        const desiredLen = Math.max(1, newStep + 1);
        if (historyRef.current.length !== desiredLen) {
          historyRef.current.length = desiredLen;
        }
        historyRef.current[desiredLen - 1] = parsed;
        setCanUndo(historyStepRef.current > 0);
        onStateChange?.(parsed);
        prewarmOg();
        // Update title with best-effort last move details
        (async () => {
          const details = await computeLastMoveDetails(parsed.uci);
          setDocumentTitle(parsed, details);
        })();
      } catch {}
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
    };
  }, [onStateChange, prewarmOg, gameState]);

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

        // Update URL via pushState so browser back undoes the move
        const newCode = generateCode(moveResult.newState);
        const newUrl = newCode ? `/p/${encodeURIComponent(newCode)}` : '/p';
        if (typeof window !== 'undefined' && window.history && window.history.pushState) {
          const nextStep = (historyStepRef.current || 0) + 1;
          historyStepRef.current = nextStep;
          window.history.pushState({ step: nextStep, code: newCode }, '', newUrl);
        }
        setCanUndo((historyStepRef.current || 0) > 0);

        // Update page title: moved color is opposite of sideToMove after move
        try {
          const movedColor = moveResult.newState.sideToMove === 'w' ? 'Black' : 'White';
          document.title = `${movedColor} moved to ${square.toLowerCase()} | chss.chat`;
        } catch {}

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
    if (promotionAppliedRef.current) {
      // Replace current entry
      historyRef.current[historyRef.current.length - 1] = moveResult.newState;
    } else {
      historyRef.current.push(moveResult.newState);
    }

    // Update URL using push/replaceState aligned with promotion re-choose behavior
    const newCode = generateCode(moveResult.newState);
    const newUrl = newCode ? `/p/${encodeURIComponent(newCode)}` : '/p';
    if (typeof window !== 'undefined' && window.history) {
      if (promotionAppliedRef.current && window.history.replaceState) {
        window.history.replaceState({ step: historyStepRef.current, code: newCode }, '', newUrl);
      } else if (window.history.pushState) {
        const nextStep = (historyStepRef.current || 0) + 1;
        historyStepRef.current = nextStep;
        window.history.pushState({ step: nextStep, code: newCode }, '', newUrl);
      }
    }
    setCanUndo((historyStepRef.current || 0) > 0);

    // Update page title for promotion move
    try {
      const movedColor = moveResult.newState.sideToMove === 'w' ? 'Black' : 'White';
      document.title = `${movedColor} moved to ${promotionTo?.toLowerCase()} | chss.chat`;
    } catch {}

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
    try {
      if (typeof window !== 'undefined' && window.history) {
        window.history.back();
      }
    } catch {}
  }, []);

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
        <div className="relative group">
          <div className={`chess-board`}>
            {renderBoard()}
          </div>
          {(() => {
            const files = (perspective === 'white'
              ? ['a','b','c','d','e','f','g','h']
              : ['h','g','f','e','d','c','b','a']);
            const ranks = (perspective === 'white'
              ? ['8','7','6','5','4','3','2','1']
              : ['1','2','3','4','5','6','7','8']);
            return (
              <>
                <div className="pointer-events-none select-none absolute -bottom-5 left-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <div className="flex w-full justify-between text-[10px] sm:text-xs text-foreground/30 px-1">
                    {files.map((f) => (
                      <span key={`file-${f}`} className="w-[12.5%] text-center leading-none">{f}</span>
                    ))}
                  </div>
                </div>
                <div className="pointer-events-none select-none absolute top-0 bottom-0 -left-5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  <div className="flex h-full flex-col justify-between text-[10px] sm:text-xs text-foreground/30 py-1">
                    {ranks.map((r) => (
                      <span key={`rank-${r}`} className="h-[12.5%] flex items-center leading-none">{r}</span>
                    ))}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
          <TurnIndicator info={indicatorInfo} />
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex flex-row gap-4 justify-center">
        <button
          onClick={handleUndo}
          disabled={!canUndo}
          aria-disabled={!canUndo}
          aria-label="Undo move"
          className={`px-3 py-3 sm:px-8 border border-border rounded-lg font-medium transition-colors ${canUndo ? 'hover:bg-muted' : 'opacity-50'}`}
        >
          <Undo2 className="h-5 w-5 sm:hidden" />
          <span className="hidden sm:inline">Undo</span>
        </button>
        {(() => {
          const canSharePosition = (historyStepRef.current || 0) > 0;

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
              className={`px-3 py-3 sm:px-8 bg-primary text-primary-foreground rounded-lg font-medium transition-colors ${!shareDisabled ? 'hover:bg-primary/90' : 'opacity-50'}`}
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
