'use client';

import type { ParsedState } from '@/lib/state-core';
import { TurnIndicator } from './turn-indicator';
import { ChessBoardGrid } from './chess-board-grid';
import { ChessBoardActions } from './chess-board-actions';
import { useChessBoardController } from './use-chess-board-controller';

interface ChessBoardProps {
  initialState: ParsedState;
  perspective: 'white' | 'black';
  onStateChange?: (newState: ParsedState) => void;
}

const FILES_WHITE = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const FILES_BLACK = ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] as const;
const RANKS_WHITE = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;
const RANKS_BLACK = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

export const ChessBoard = ({
  initialState,
  perspective,
  onStateChange,
}: ChessBoardProps) => {
  const {
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
  } = useChessBoardController({ initialState, perspective, onStateChange });

  const files = perspective === 'white' ? FILES_WHITE : FILES_BLACK;
  const ranks = perspective === 'white' ? RANKS_WHITE : RANKS_BLACK;

  return (
    <div className="relative w-full">
      <div className="relative mx-auto w-fit">
        <div className="group relative">
          <ChessBoardGrid
            chess={chessMemo}
            perspective={perspective}
            selectedSquare={ui.selectedSquare}
            legalMoves={ui.legalMoves}
            lastMove={ui.lastMove}
            sideToMove={gameState.sideToMove}
            isCheck={indicatorInfo.isCheck}
            isTerminal={isTerminal}
            promotionOpen={ui.promotionOpen}
            promotionAnchor={ui.promotionAnchor}
            promotionSide={ui.promotionSide}
            onSquareClick={handleSquareClick}
            onSquareKeyDown={handleSquareKeyDown}
            onPromotionOpenChange={handlePromotionOpenChange}
            onChoosePromotion={handleChoosePromotion}
          />
          <div className="pointer-events-none absolute -bottom-5 right-0 left-0 select-none px-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <div className="flex w-full justify-between text-[10px] text-foreground/30 sm:text-xs">
              {files.map((f) => (
                <span key={`file-${f}`} className="w-[12.5%] text-center leading-none">
                  {f}
                </span>
              ))}
            </div>
          </div>
          <div className="pointer-events-none absolute top-0 -left-5 bottom-0 select-none py-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            <div className="flex h-full flex-col justify-between text-[10px] text-foreground/30 sm:text-xs">
              {ranks.map((r) => (
                <span key={`rank-${r}`} className="flex h-[12.5%] items-center leading-none">
                  {r}
                </span>
              ))}
            </div>
          </div>
        </div>
        <TurnIndicator info={indicatorInfo} />
      </div>

      <ChessBoardActions
        canUndo={ui.canUndo}
        perspective={perspective}
        indicatorInfo={indicatorInfo}
        isTerminal={isTerminal}
        onUndo={handleUndo}
        onShare={handleShare}
        onNewGame={handleNewGame}
      />
    </div>
  );
};
