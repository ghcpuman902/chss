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

import { PawnIcon, KingIcon } from './pieces';
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
  const winnerColor = sideToMove === 'w' ? 'black' : 'white';
  const isViewerWinner = info.perspective ? info.perspective === winnerColor : false;
  const showTooltip = !info.isStalemate && !info.isDraw && (info.isCheckmate || info.isCheck || info.onlyMove);
  const sideLabel = sideToMove === 'w' ? 'White' : 'Black';
  const tooltipText = info.isCheckmate
    ? `Checkmate — ${isViewerWinner ? 'You win' : 'They win'}`
    : `${sideLabel}, ${info.isCheck ? 'Your king is in danger!\n Save the king!' : info.onlyMove ? 'there\'s only one move to save your king!' : ''}`;
  
  // Merge isCheck and isCheckmate logic - only difference is translate-y-2 for dead king
  const isKingInDanger = info.isCheck || info.onlyMove || info.isCheckmate;
  const isKingDead = info.isCheckmate;
  
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
          {(info.isStalemate || info.isDraw) ? (
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
                  info.perspective === 'white' && (isKingDead ? 'text-primary' : 'turn-minute text-primary') // deadking no need to count time
                )}
                aria-label="White indicator"
              >
                <div
                  className={cn(
                    'size-6 sm:size-8 rounded-full overflow-hidden flex items-center justify-center',
                    isKingInDanger && info.sideToMove === 'w'
                      ? isKingDead ? 'bg-red-800' : 'bg-red-300 animate-pulse-destructive'
                      : 'bg-gray-500/20'
                  )}
                  role="img"
                >
                  {isKingInDanger && info.sideToMove === 'w' ? (
                    <KingIcon 
                      className={cn(
                        "block size-24 chess-piece white brightness-125",
                        isKingDead ? "translate-y-4" : "cry-for-help"
                      )} 
                      aria-hidden 
                    />
                  ) : (
                    <PawnIcon className="block size-24 chess-piece white brightness-125" aria-hidden />
                  )}
                </div>
              </div>
              <div
                className={cn(
                  'inline-block size-6 sm:size-8 overflow-hidden',
                  info.perspective === 'black' && (isKingDead ? 'text-primary' : 'turn-minute text-primary') // deadking no need to count time
                )}
                aria-label="Black indicator"
              >
                <div
                  className={cn(
                    'size-6 sm:size-8 rounded-full overflow-hidden flex items-center justify-center',
                    isKingInDanger && info.sideToMove === 'b'
                      ? isKingDead ? 'bg-red-800' : 'bg-red-300 animate-pulse-destructive'
                      : 'bg-gray-500/20'
                  )}
                  role="img"
                >
                  {isKingInDanger && info.sideToMove === 'b' ? (
                    <KingIcon 
                      className={cn(
                        "block size-24 chess-piece black",
                        isKingDead ? "translate-y-4" : "cry-for-help"
                      )} 
                      aria-hidden 
                    />
                  ) : (
                    <PawnIcon className="block size-24 chess-piece black" aria-hidden />
                  )}
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


