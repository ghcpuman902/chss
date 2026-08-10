"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
  type Reducer,
} from "react";
import { useRouter } from "next/navigation";
import { Chess, type Move, type Square } from "chess.js";
import { makeMove, generateCode, type ParsedState } from "@/lib/state-core";
import { buildOgCode, buildOgPath } from "@/lib/og-encoding";
import { prewarmOgImage } from "@/app/actions/prewarm-og";
import { buildShareTitle } from "@/lib/share-title";
import type { DrawReason, GameInfo, Outcome } from "./turn-indicator";
import {
  useChessBoardHistory,
  type BoardUiAction,
} from "./use-chess-board-history";

type BoardUiState = {
  selectedSquare: string | null;
  legalMoves: string[];
  lastMove: { from: string; to: string } | null;
  canUndo: boolean;
  promotionOpen: boolean;
  promotionAnchor: string | null;
  promotionSide: "w" | "b";
};

const INITIAL_UI: BoardUiState = {
  selectedSquare: null,
  legalMoves: [],
  lastMove: null,
  canUndo: false,
  promotionOpen: false,
  promotionAnchor: null,
  promotionSide: "w",
};

type LocalBoardUiAction =
  | BoardUiAction
  | { type: "select"; square: string; legalMoves: string[] }
  | { type: "clear_selection" }
  | {
      type: "move_applied";
      from: string;
      to: string;
      canUndo: boolean;
    }
  | {
      type: "open_promotion";
      anchor: string;
      side: "w" | "b";
    }
  | { type: "close_promotion" }
  | { type: "set_can_undo"; value: boolean };

const boardUiReducer: Reducer<BoardUiState, LocalBoardUiAction> = (
  state,
  action,
) => {
  switch (action.type) {
    case "select":
      return {
        ...state,
        selectedSquare: action.square,
        legalMoves: action.legalMoves,
      };
    case "clear_selection":
      return { ...state, selectedSquare: null, legalMoves: [] };
    case "move_applied":
      return {
        ...state,
        selectedSquare: null,
        legalMoves: [],
        lastMove: { from: action.from, to: action.to },
        canUndo: action.canUndo,
        promotionOpen: false,
        promotionAnchor: null,
      };
    case "open_promotion":
      return {
        ...state,
        promotionOpen: true,
        promotionAnchor: action.anchor,
        promotionSide: action.side,
      };
    case "close_promotion":
      return {
        ...state,
        promotionOpen: false,
        promotionAnchor: null,
      };
    case "set_can_undo":
      return { ...state, canUndo: action.value };
    case "hydrate_from_history":
      return {
        ...state,
        selectedSquare: null,
        legalMoves: [],
        lastMove: null,
        promotionOpen: false,
        promotionAnchor: null,
      };
    default:
      return state;
  }
};

const legalTargetsFrom = (chess: Chess, from: string): string[] => {
  try {
    const moves = chess.moves({
      square: from as Square,
      verbose: true,
    }) as Move[];
    return moves.map((m) => m.to);
  } catch {
    return [];
  }
};

export const useChessBoardController = ({
  initialState,
  perspective,
  onStateChange,
}: {
  initialState: ParsedState;
  perspective: "white" | "black";
  onStateChange?: (newState: ParsedState) => void;
}) => {
  const [gameState, setGameState] = useState<ParsedState>(initialState);
  const [ui, dispatchUi] = useReducer(boardUiReducer, INITIAL_UI);
  const historyRef = useRef<ParsedState[]>([initialState]);
  const historyStepRef = useRef(0);
  const [initialCode] = useState(() => generateCode(initialState));
  const gameStateRef = useRef<ParsedState>(initialState);
  const onStateChangeRef = useRef(onStateChange);
  const router = useRouter();

  const promotionFromRef = useRef<string | null>(null);
  const promotionToRef = useRef<string | null>(null);
  const promotionBaseStateRef = useRef<ParsedState | null>(null);
  const promotionAppliedRef = useRef(false);
  const lastWarmedOgRef = useRef<string | null>(null);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    onStateChangeRef.current = onStateChange;
  }, [onStateChange]);

  useChessBoardHistory({
    initialCode,
    gameStateRef,
    historyRef,
    historyStepRef,
    onStateChangeRef,
    setGameState,
    dispatchUi,
  });

  const chessMemo = useMemo(() => {
    try {
      return new Chess(gameState.fen);
    } catch {
      return new Chess();
    }
  }, [gameState.fen]);

  const indicatorInfo: GameInfo = useMemo(() => {
    const moveCount = chessMemo.moves().length;
    const isCheck =
      typeof chessMemo.isCheck === "function" ? chessMemo.isCheck() : false;
    const isCheckmate =
      typeof chessMemo.isCheckmate === "function"
        ? chessMemo.isCheckmate()
        : false;
    const isStalemate =
      typeof chessMemo.isStalemate === "function"
        ? chessMemo.isStalemate()
        : false;
    const isThreefold =
      typeof chessMemo.isThreefoldRepetition === "function"
        ? chessMemo.isThreefoldRepetition()
        : false;
    const isFifty =
      typeof chessMemo.isDrawByFiftyMoves === "function"
        ? chessMemo.isDrawByFiftyMoves()
        : false;
    const isInsufficient =
      typeof chessMemo.isInsufficientMaterial === "function"
        ? chessMemo.isInsufficientMaterial()
        : false;
    const isDraw =
      typeof chessMemo.isDraw === "function" ? chessMemo.isDraw() : false;

    const outcome: Outcome = isCheckmate
      ? "checkmate"
      : isStalemate || isDraw || isThreefold || isFifty || isInsufficient
        ? "draw"
        : "ongoing";
    const drawReason: DrawReason | undefined =
      outcome === "draw"
        ? isStalemate
          ? "stalemate"
          : isFifty
            ? "fifty-move"
            : isThreefold
              ? "threefold"
              : isInsufficient
                ? "insufficient"
                : "other"
        : undefined;

    return {
      fen: gameState.fen,
      sideToMove: gameState.sideToMove,
      isCheck,
      isCheckmate,
      isStalemate,
      isDraw,
      outcome,
      drawReason,
      onlyMove: moveCount === 1,
      legalMoves: [],
      lastMove: ui.lastMove,
      code: generateCode(gameState),
      perspective,
    };
  }, [chessMemo, gameState, ui.lastMove, perspective]);

  const isTerminal = indicatorInfo.outcome !== "ongoing";

  const prewarmOg = useCallback(
    (fen?: string, side?: "w" | "b") => {
      const nextFen = fen ?? gameState.fen;
      const nextSide = side ?? gameState.sideToMove;
      const code = buildOgCode(nextFen, nextSide);
      const ogUrl = buildOgPath(
        nextFen,
        nextSide,
        typeof window !== "undefined" ? window.location.origin : "",
      );
      if (lastWarmedOgRef.current === code) return;
      lastWarmedOgRef.current = code;
      void prewarmOgImage(code).catch(() => {});
      if (typeof window !== "undefined") {
        fetch(ogUrl, { cache: "force-cache", keepalive: true }).catch(() => {});
      }
    },
    [gameState.fen, gameState.sideToMove],
  );

  useEffect(() => {
    prewarmOg();
  }, [prewarmOg]);

  const pushMoveUrl = useCallback((newState: ParsedState, replace: boolean) => {
    const newCode = generateCode(newState);
    const newUrl = newCode ? `/p/${encodeURIComponent(newCode)}` : "/p";
    if (typeof window === "undefined" || !window.history) return;

    const historyPayload = {
      code: newCode,
      fen: newState.fen,
      sideToMove: newState.sideToMove,
      uci: newState.uci,
      uKey: newState.uKey,
    };

    if (replace && window.history.replaceState) {
      window.history.replaceState(
        { ...historyPayload, step: historyStepRef.current },
        "",
        newUrl,
      );
      return;
    }

    if (window.history.pushState) {
      const nextStep = (historyStepRef.current || 0) + 1;
      historyStepRef.current = nextStep;
      window.history.pushState(
        { ...historyPayload, step: nextStep },
        "",
        newUrl,
      );
    }
  }, []);

  const handleSquareClick = useCallback(
    (square: string) => {
      if (isTerminal) return;

      if (!ui.selectedSquare) {
        const piece = chessMemo.get(square as Square);
        if (piece && piece.color === gameState.sideToMove) {
          dispatchUi({
            type: "select",
            square,
            legalMoves: legalTargetsFrom(chessMemo, square),
          });
        }
        return;
      }

      if (ui.selectedSquare === square) {
        dispatchUi({ type: "clear_selection" });
        return;
      }

      if (ui.legalMoves.includes(square) && ui.selectedSquare) {
        try {
          const verboseMoves = chessMemo.moves({
            square: ui.selectedSquare as Square,
            verbose: true,
          }) as Move[];
          const candidate = verboseMoves.find((m: Move) => m.to === square);
          if (candidate?.promotion) {
            promotionFromRef.current = ui.selectedSquare;
            promotionToRef.current = square;
            promotionBaseStateRef.current = gameState;
            promotionAppliedRef.current = false;
            dispatchUi({
              type: "open_promotion",
              anchor: square,
              side: gameState.sideToMove,
            });
            return;
          }
        } catch {
          /* ignore */
        }

        const moveResult = makeMove(gameState, ui.selectedSquare, square);
        if (!moveResult.success || !moveResult.newState) return;

        setGameState(moveResult.newState);
        historyRef.current.push(moveResult.newState);
        pushMoveUrl(moveResult.newState, false);
        dispatchUi({
          type: "move_applied",
          from: ui.selectedSquare,
          to: square,
          canUndo: (historyStepRef.current || 0) > 0,
        });

        try {
          const movedColor =
            moveResult.newState.sideToMove === "w" ? "Black" : "White";
          document.title = `${movedColor} moved to ${square.toLowerCase()} | chss.chat`;
        } catch {
          /* ignore */
        }

        onStateChange?.(moveResult.newState);
        prewarmOg(moveResult.newState.fen, moveResult.newState.sideToMove);
        return;
      }

      const piece = chessMemo.get(square as Square);
      if (piece && piece.color === gameState.sideToMove) {
        dispatchUi({
          type: "select",
          square,
          legalMoves: legalTargetsFrom(chessMemo, square),
        });
      } else {
        dispatchUi({ type: "clear_selection" });
      }
    },
    [
      ui.selectedSquare,
      ui.legalMoves,
      gameState,
      onStateChange,
      chessMemo,
      isTerminal,
      prewarmOg,
      pushMoveUrl,
    ],
  );

  const handleChoosePromotion = useCallback(
    (piece: "q" | "r" | "b" | "n") => {
      const promotionFrom = promotionFromRef.current;
      const promotionTo = promotionToRef.current;
      if (!promotionFrom || !promotionTo || isTerminal) return;

      if (promotionAppliedRef.current && historyRef.current.length > 1) {
        historyRef.current.pop();
      }

      const base = promotionBaseStateRef.current ?? gameState;
      const moveResult = makeMove(base, promotionFrom, promotionTo, piece);
      if (!moveResult.success || !moveResult.newState) return;

      setGameState(moveResult.newState);

      if (promotionAppliedRef.current) {
        historyRef.current[historyRef.current.length - 1] = moveResult.newState;
      } else {
        historyRef.current.push(moveResult.newState);
      }

      pushMoveUrl(moveResult.newState, promotionAppliedRef.current);
      dispatchUi({
        type: "move_applied",
        from: promotionFrom,
        to: promotionTo,
        canUndo: (historyStepRef.current || 0) > 0,
      });

      try {
        const movedColor =
          moveResult.newState.sideToMove === "w" ? "Black" : "White";
        document.title = `${movedColor} moved to ${promotionTo.toLowerCase()} | chss.chat`;
      } catch {
        /* ignore */
      }

      onStateChange?.(moveResult.newState);
      prewarmOg(moveResult.newState.fen, moveResult.newState.sideToMove);
      promotionAppliedRef.current = true;
    },
    [gameState, onStateChange, isTerminal, prewarmOg, pushMoveUrl],
  );

  const handleShare = useCallback(async () => {
    if (historyRef.current.length <= 1) return;
    const url = window.location.href;
    prewarmOg();

    const alignedTitle = buildShareTitle(gameState.sideToMove, ui.lastMove?.to);
    const baseShare: ShareData = {
      title: alignedTitle,
      text: "Open, make your move, and reply-share to keep the game going.",
      url,
    };

    type NavigatorWithShare = Navigator & {
      share?: (data?: ShareData) => Promise<void>;
    };
    const nav = navigator as NavigatorWithShare;

    if (typeof nav.share === "function") {
      try {
        await nav.share(baseShare);
      } catch (error: unknown) {
        if ((error as Error)?.name === "AbortError") return;
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  }, [gameState.sideToMove, ui.lastMove, prewarmOg]);

  const handleUndo = useCallback(() => {
    try {
      window.history?.back();
    } catch {
      /* ignore */
    }
  }, []);

  const handleNewGame = useCallback(() => {
    router.push("/p");
  }, [router]);

  const handleSquareKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>, square: string) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleSquareClick(square);
      }
    },
    [handleSquareClick],
  );

  const handlePromotionOpenChange = useCallback((open: boolean) => {
    if (open) {
      dispatchUi({
        type: "open_promotion",
        anchor: promotionToRef.current ?? "",
        side: promotionBaseStateRef.current?.sideToMove ?? "w",
      });
      return;
    }
    dispatchUi({ type: "close_promotion" });
    promotionFromRef.current = null;
    promotionToRef.current = null;
    promotionBaseStateRef.current = null;
    promotionAppliedRef.current = false;
  }, []);

  return {
    gameState,
    ui,
    chessMemo,
    indicatorInfo,
    isTerminal,
    handleSquareClick,
    handleSquareKeyDown,
    handleChoosePromotion,
    handlePromotionOpenChange,
    handleShare,
    handleUndo,
    handleNewGame,
  };
};
