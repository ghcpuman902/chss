"use client";

import { Undo2 } from "lucide-react";
import type { DrawReason, GameInfo } from "./turn-indicator";

type ChessBoardActionsProps = {
  canUndo: boolean;
  perspective: "white" | "black";
  indicatorInfo: GameInfo;
  isTerminal: boolean;
  onUndo: () => void;
  onShare: () => void;
  onNewGame: () => void;
};

const DRAW_REASON_LABEL: Record<DrawReason, string> = {
  stalemate: "Stalemate",
  "fifty-move": "50-move",
  threefold: "Threefold",
  insufficient: "Insufficient",
  other: "Draw",
};

const resolveShareLabel = ({
  canUndo,
  perspective,
  indicatorInfo,
  isTerminal,
}: Pick<
  ChessBoardActionsProps,
  "canUndo" | "perspective" | "indicatorInfo" | "isTerminal"
>): { shareText: string; shareDisabled: boolean } => {
  const canSharePosition = canUndo;
  const winnerColor = indicatorInfo.sideToMove === "w" ? "black" : "white";
  const isViewerWinner = perspective === winnerColor;

  if (isTerminal) {
    if (indicatorInfo.outcome === "checkmate") {
      if (isViewerWinner) {
        return {
          shareText: "Checkmate — You win (share to them)",
          shareDisabled: !canSharePosition,
        };
      }
      return { shareText: "Checkmate — They win", shareDisabled: true };
    }
    if (indicatorInfo.outcome === "draw") {
      const reasonLabel = indicatorInfo.drawReason
        ? DRAW_REASON_LABEL[indicatorInfo.drawReason]
        : "Draw";
      return {
        shareText: `Draw — ${reasonLabel} (share result)`,
        shareDisabled: !canSharePosition,
      };
    }
  }

  if (!canSharePosition) {
    return { shareText: "Share", shareDisabled: true };
  }

  const opponent = perspective === "white" ? "Black" : "White";
  return {
    shareText: indicatorInfo.isCheck
      ? `Send to ${opponent} (in check!)`
      : `Send to ${opponent}`,
    shareDisabled: false,
  };
};

export const ChessBoardActions = ({
  canUndo,
  perspective,
  indicatorInfo,
  isTerminal,
  onUndo,
  onShare,
  onNewGame,
}: ChessBoardActionsProps) => {
  const { shareText, shareDisabled } = resolveShareLabel({
    canUndo,
    perspective,
    indicatorInfo,
    isTerminal,
  });

  return (
    <>
      <div className="mt-6 flex flex-row justify-center gap-4">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-disabled={!canUndo}
          aria-label="Undo move"
          className={`rounded-lg border border-border px-3 py-3 font-medium transition-colors sm:px-8 ${canUndo ? "hover:bg-muted" : "opacity-50"}`}
        >
          <Undo2 className="h-5 w-5 sm:hidden" />
          <span className="hidden sm:inline">Undo</span>
        </button>
        <button
          type="button"
          onClick={onShare}
          disabled={shareDisabled}
          aria-disabled={shareDisabled}
          aria-label={shareText}
          className={`rounded-lg bg-primary px-3 py-3 font-medium text-primary-foreground transition-colors sm:px-8 ${!shareDisabled ? "hover:bg-primary/90" : "opacity-50"}`}
        >
          {shareText}
        </button>
      </div>

      <div className="mt-12 flex flex-col justify-center gap-4 sm:flex-row">
        <button
          type="button"
          onClick={onNewGame}
          aria-label="New Game"
          className="rounded-lg border border-border px-8 py-3 font-medium"
        >
          <span className="text-lg">New Game</span>
        </button>
      </div>
    </>
  );
};
