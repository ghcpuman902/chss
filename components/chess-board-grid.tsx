"use client";

import type React from "react";
import {
  BishopIcon,
  KingIcon,
  KnightIcon,
  PawnIcon,
  QueenIcon,
  RookIcon,
} from "./pieces";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Chess } from "chess.js";

type PieceKey =
  | "wP"
  | "wN"
  | "wB"
  | "wR"
  | "wQ"
  | "wK"
  | "bP"
  | "bN"
  | "bB"
  | "bR"
  | "bQ"
  | "bK";

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

const PROMOTION_CHOICES = [
  { k: "q" as const, Icon: QueenIcon, label: "Promote to Queen" },
  { k: "r" as const, Icon: RookIcon, label: "Promote to Rook" },
  { k: "b" as const, Icon: BishopIcon, label: "Promote to Bishop" },
  { k: "n" as const, Icon: KnightIcon, label: "Promote to Knight" },
];

type ChessBoardGridProps = {
  chess: Chess;
  perspective: "white" | "black";
  selectedSquare: string | null;
  legalMoves: string[];
  lastMove: { from: string; to: string } | null;
  sideToMove: "w" | "b";
  isCheck: boolean;
  isTerminal: boolean;
  promotionOpen: boolean;
  promotionAnchor: string | null;
  promotionSide: "w" | "b";
  onSquareClick: (square: string) => void;
  onSquareKeyDown: (
    event: React.KeyboardEvent<HTMLDivElement>,
    square: string,
  ) => void;
  onPromotionOpenChange: (open: boolean) => void;
  onChoosePromotion: (piece: "q" | "r" | "b" | "n") => void;
};

export const ChessBoardGrid = ({
  chess,
  perspective,
  selectedSquare,
  legalMoves,
  lastMove,
  sideToMove,
  isCheck,
  isTerminal,
  promotionOpen,
  promotionAnchor,
  promotionSide,
  onSquareClick,
  onSquareKeyDown,
  onPromotionOpenChange,
  onChoosePromotion,
}: ChessBoardGridProps) => {
  const board = chess.board();
  const squares: React.ReactNode[] = [];
  const legalMoveSet = new Set(legalMoves);

  const rankOrder =
    perspective === "white"
      ? ([0, 1, 2, 3, 4, 5, 6, 7] as const)
      : ([7, 6, 5, 4, 3, 2, 1, 0] as const);
  const fileOrder =
    perspective === "white"
      ? ([0, 1, 2, 3, 4, 5, 6, 7] as const)
      : ([7, 6, 5, 4, 3, 2, 1, 0] as const);

  for (const rank of rankOrder) {
    for (const file of fileOrder) {
      const square = String.fromCharCode(97 + file) + (8 - rank);
      const piece = board[rank]![file];
      const isLight = (rank + file) % 2 === 0;
      const isSelected = selectedSquare === square;
      const isLegalMove = legalMoveSet.has(square);
      const isLastMove =
        !!lastMove && (lastMove.from === square || lastMove.to === square);

      let pieceNode: React.ReactNode = null;
      if (piece) {
        const key = (piece.color + piece.type.toUpperCase()) as PieceKey;
        const Icon = PIECE_COMPONENT[key];
        const isKing = piece.type === "k";
        const kingInCheck =
          isKing && piece.color === sideToMove && isCheck;
        pieceNode = (
          <span
            className={`chess-piece inline-flex w-[88%] aspect-square items-end justify-center ${isKing ? "king " : ""}${kingInCheck ? "king-in-check " : ""}${piece.color === "w" ? "white" : "black"}`}
          >
            <Icon className="block size-full" />
          </span>
        );
      }

      const squareDiv = (
        <div
          key={square}
          role="button"
          tabIndex={0}
          aria-label={`Square ${square}`}
          aria-pressed={isSelected}
          className={`chess-square ${isLight ? "light" : "dark"} ${isLegalMove ? "legal-move" : ""} ${isLastMove ? "last-move" : ""} ${isSelected ? "selected" : ""} ${isTerminal ? "cursor-default" : ""}`}
          onClick={() => onSquareClick(square)}
          onKeyDown={(e) => onSquareKeyDown(e, square)}
        >
          <div className="square-content flex h-full w-full items-end justify-center">
            {pieceNode}
          </div>
        </div>
      );

      if (promotionAnchor === square) {
        squares.push(
          <Popover
            key={`${square}-popover`}
            open={promotionOpen}
            onOpenChange={onPromotionOpenChange}
          >
            <PopoverTrigger asChild>{squareDiv}</PopoverTrigger>
            <PopoverContent
              align="center"
              side="top"
              className="w-auto rounded-xl p-2"
            >
              <div className="flex items-center gap-2">
                {PROMOTION_CHOICES.map(({ k, Icon, label }) => (
                  <button
                    key={k}
                    type="button"
                    aria-label={label}
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChoosePromotion(k);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onChoosePromotion(k);
                      }
                    }}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-neutral-200 inset-shadow-xs inset-shadow-neutral-300 hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Icon
                      className={cn(
                        "size-7",
                        promotionSide === "w" ? "text-white" : "text-black",
                      )}
                    />
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>,
        );
      } else {
        squares.push(squareDiv);
      }
    }
  }

  return <div className="chess-board">{squares}</div>;
};
