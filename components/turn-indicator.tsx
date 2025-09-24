'use client';

// dont delete this, this is exmaple of the data that is passed to the turn indicator
// {
//   "fen": "rnbqkbnr/ppp1p2p/6Q1/3P1p2/8/8/PPPP1PPP/RNB1KBNR b KQkq - 0 4",
//   "sideToMove": "b",
//   "isCheck": true,
//   "isCheckmate": false,
//   "isStalemate": false,
//   "isDraw": false,
//   "onlyMove": false,
//   "legalMoves": [
//     {
//       "from": "e8",
//       "to": "d7",
//       "san": "Kd7",
//       "flags": "n"
//     },
//     {
//       "from": "h7",
//       "to": "g6",
//       "san": "hxg6",
//       "flags": "c"
//     }
//   ],
//   "lastMove": null,
//   "code": "f-cm5icWtibnIvcHBwMXAycC82UTEvM1AxcDIvOC84L1BQUFAxUFBQL1JOQjFLQk5SIGIgS1FrcSAtIDAgNA",
//   "perspective": "black"
// }

import { PawnIcon } from './pieces';
import { Handshake } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type GameInfo = {
  fen: string;
  sideToMove: 'w' | 'b';
  isCheck: boolean;
  isCheckmate: boolean;
  isStalemate: boolean;
  isDraw: boolean;
  onlyMove: boolean;
  legalMoves: Array<{ from: string; to: string; san?: string; flags?: string; promotion?: string }>;
  lastMove: { from: string; to: string } | null;
  code: string;
  perspective?: 'white' | 'black';
};

type TurnIndicatorProps = {
  info: GameInfo;
};

export const TurnIndicator = ({ info }: TurnIndicatorProps) => {
  const sideToMove = info.sideToMove;
  const winnerLabel = sideToMove === 'w' ? 'Black' : 'White';
  const winnerColorClass = sideToMove === 'w' ? 'black' : 'white brightness-125';
  const showTooltip = !info.isCheckmate && !info.isStalemate && !info.isDraw && (info.isCheck || info.onlyMove);
  const sideLabel = sideToMove === 'w' ? 'White' : 'Black';
  const tooltipText = `${sideLabel} to move${info.isCheck ? ' — in check' : info.onlyMove ? ' — only move' : ''}`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            `inline-flex ${info.perspective === 'white' ? 'flex-col-reverse' : 'flex-col'}`,
            `items-center gap-1 bg-gray-100/50 brightness-105 backdrop-blur-xs rounded-full shadow-xs p-1`,
            `absolute top-1/2 -translate-y-1/2 `,
            (info.perspective === 'white' ? '-left-4 sm:-left-8' : '-right-4 sm:-right-8')
          )}
          aria-label="Turn indicator"
        >
          {info.isCheckmate ? (
            <div className="px-3 py-2 rounded-full bg-sky-100 text-sky-800 text-xs font-medium">
              <div className="text-center leading-none">Checkmate</div>
              <div className="mt-0.5 flex items-center justify-center gap-1.5">
                <PawnIcon className={cn('block size-4 sm:size-5 chess-piece', winnerColorClass)} aria-hidden />
                <span className="leading-none">{winnerLabel} wins</span>
              </div>
            </div>
          ) : (info.isStalemate || info.isDraw) ? (
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center justify-center size-6 sm:size-8 rounded-full bg-sky-500 text-white">
                <Handshake className="size-5 sm:size-6" aria-hidden />
              </div>
              <div className="text-[10px] text-foreground">Draw</div>
            </div>
          ) : (
            <>
              <div
                className={cn(
                  'inline-block size-6 sm:size-8 overflow-hidden',
                  info.perspective === 'white' && 'turn-minute text-primary'
                )}
                aria-label="White to move indicator"
              >
                <div
                  className={cn(
                    'size-6 sm:size-8 rounded-full overflow-hidden flex items-center justify-center',
                    info.isCheck && info.sideToMove === 'w'
                      ? 'bg-red-500/20 animate-pulse'
                      : info.onlyMove && info.sideToMove === 'w'
                      ? 'bg-amber-500/20 animate-pulse'
                      : 'bg-primary/20'
                  )}
                  role="img"
                >
                  <PawnIcon className="block size-24 chess-piece white brightness-125" aria-hidden />
                </div>
              </div>
              <div
                className={cn(
                  'inline-block size-6 sm:size-8 overflow-hidden',
                  info.perspective === 'black' && 'turn-minute text-primary'
                )}
                aria-label="Black to move indicator"
              >
                <div
                  className={cn(
                    'size-6 sm:size-8 rounded-full overflow-hidden flex items-center justify-center',
                    info.isCheck && info.sideToMove === 'b'
                      ? 'bg-red-500/20 animate-pulse'
                      : info.onlyMove && info.sideToMove === 'b'
                      ? 'bg-amber-500/20 animate-pulse'
                      : 'bg-primary/20'
                  )}
                  role="img"
                >
                  <PawnIcon className="block size-24 chess-piece black" aria-hidden />
                </div>
              </div>
            </>
          )}
        </div>
      </TooltipTrigger>
      {showTooltip && (
        <TooltipContent>
          {tooltipText}
        </TooltipContent>
      )}
    </Tooltip>
  );
};


