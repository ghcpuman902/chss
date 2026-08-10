import type { FC, ReactNode, SVGProps } from "react";
import {
  BishopIcon,
  KingIcon,
  KnightIcon,
  PawnIcon,
  QueenIcon,
  RookIcon,
} from "./pieces";

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

const PIECE_COMPONENT: Record<PieceKey, FC<SVGProps<SVGSVGElement>>> = {
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

const START_BOARD: ReadonlyArray<ReadonlyArray<PieceKey | null>> = [
  ["bR", "bN", "bB", "bQ", "bK", "bB", "bN", "bR"],
  ["bP", "bP", "bP", "bP", "bP", "bP", "bP", "bP"],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  ["wP", "wP", "wP", "wP", "wP", "wP", "wP", "wP"],
  ["wR", "wN", "wB", "wQ", "wK", "wB", "wN", "wR"],
];

export const ChessBoardSkeleton = () => {
  const squares: ReactNode[] = [];

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const isLight = (rank + file) % 2 === 0;
      const piece = START_BOARD[rank]![file];
      const key = `${rank}-${file}`;

      let pieceNode: ReactNode = null;
      if (piece) {
        const Icon = PIECE_COMPONENT[piece];
        const isWhite = piece.startsWith("w");
        pieceNode = (
          <span
            className={`chess-piece inline-flex w-[88%] aspect-square items-end justify-center opacity-50 ${isWhite ? "white" : "black"}`}
          >
            <Icon className="block size-full" />
          </span>
        );
      }

      squares.push(
        <div
          key={key}
          className={`chess-square ${isLight ? "light" : "dark"} cursor-default`}
          aria-hidden="true"
        >
          <div className="square-content flex h-full w-full items-end justify-center">
            {pieceNode}
          </div>
        </div>,
      );
    }
  }

  return (
    <div className="relative w-full" aria-busy="true" aria-label="Loading board">
      <div className="relative mx-auto w-fit">
        <div className="chess-board">{squares}</div>
      </div>
    </div>
  );
};
