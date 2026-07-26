"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactNode,
  type SVGProps,
} from "react";
import {
  BishopIcon,
  KingIcon,
  KnightIcon,
  PawnIcon,
  QueenIcon,
  RookIcon,
} from "@/components/pieces";
import {
  matchPieceIds,
  type BoardPiece,
} from "@/components/research/piece-match";
import { generateCode } from "@/lib/state-core";
import { cn } from "@/lib/utils";

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

type PieceIcon = FC<SVGProps<SVGSVGElement>>;

const PIECE_COMPONENT: Record<PieceKey, PieceIcon> = {
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

const FILES = "abcdefgh";
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1];
const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AFTER_E4_FEN =
  "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

/** Real June 2026 corpus positions used for the loops. */
const DEMO = {
  stm: {
    frames: [
      {
        fen: START_FEN,
        stm: "w" as const,
        highlights: [] as string[],
      },
      {
        fen: AFTER_E4_FEN,
        stm: "b" as const,
        highlights: ["e2", "e4"],
      },
    ],
  },
  ep: {
    frames: [
      {
        fen: "rnbq1rk1/ppp1p1bp/3p1np1/3P1p2/2P2B1P/4PN2/PP3PP1/RN1QKB1R b KQ - 0 7",
        focus: ["e7", "e5", "d5"],
        highlights: [],
        ep: null as string | null,
        tag: "ep -",
      },
      {
        fen: "rnbq1rk1/ppp1p1bp/3p1np1/3P1p2/2P2B1P/4PN2/PP3PP1/RN1QKB1R b KQ - 0 7",
        focus: ["e7", "e5", "d5"],
        highlights: ["e7", "e5"],
        ep: null,
        tag: "… e7e5",
      },
      {
        fen: "rnbq1rk1/ppp3bp/3p1np1/3Ppp2/2P2B1P/4PN2/PP3PP1/RN1QKB1R w KQ e6 0 8",
        focus: ["e5", "d5", "e6"],
        highlights: ["e7", "e5"],
        ep: "e6",
        tag: "ep e6",
      },
      {
        fen: "rnbq1rk1/ppp3bp/3p1np1/3Ppp2/2P2B1P/4PN2/PP3PP1/RN1QKB1R w KQ e6 0 8",
        focus: ["e5", "d5", "e6"],
        highlights: ["d5", "e6"],
        ep: "e6",
        tag: "ep e6 · capture?",
      },
      {
        fen: "rnbq1rk1/ppp3bp/3pPnp1/5p2/2P2B1P/4PN2/PP3PP1/RN1QKB1R b KQ - 0 8",
        focus: ["e6", "d5", "e5"],
        highlights: ["d5", "e6"],
        ep: null,
        tag: "ep -",
      },
    ],
  },
  castle: {
    frames: [
      {
        fen: "rn1qkb1r/1pp2ppp/p3pn2/3p4/2PP4/5BP1/PP2PP1P/RNBQK2R w KQkq - 0 7",
        focus: ["e1", "g1", "h1", "f1"],
        highlights: [],
        rights: "KQkq",
      },
      {
        fen: "rn1qkb1r/1pp2ppp/p3pn2/3p4/2PP4/5BP1/PP2PP1P/RNBQK2R w KQkq - 0 7",
        focus: ["e1", "g1", "h1", "f1"],
        highlights: ["e1", "g1", "h1", "f1"],
        rights: "KQkq",
      },
      {
        fen: "rn1qkb1r/1pp2ppp/p3pn2/3p4/2PP4/5BP1/PP2PP1P/RNBQ1RK1 b kq - 1 7",
        focus: ["e1", "g1", "h1", "f1"],
        highlights: ["e1", "g1", "h1", "f1"],
        rights: "kq",
      },
      {
        fen: "rn1qkb1r/1pp2ppp/p3pn2/3p4/2PP4/5BP1/PP2PP1P/RNBQ1RK1 b kq - 1 7",
        focus: ["e1", "g1", "h1", "f1"],
        highlights: [],
        rights: "kq",
      },
    ],
  },
  halfmove: {
    frames: [
      {
        fen: "rnb2b1r/pp1k2pp/2p1B3/6B1/3p4/8/PPP2PPP/RN2R1K1 b - - 3 13",
        focus: ["d7", "c7", "g5", "f4", "f8", "d6"],
        highlights: [],
        clock: 3,
        note: "quiet",
      },
      {
        fen: "rnb2b1r/ppk3pp/2p1B3/6B1/3p4/8/PPP2PPP/RN2R1K1 w - - 4 14",
        focus: ["d7", "c7", "g5", "f4", "f8", "d6"],
        highlights: ["d7", "c7"],
        clock: 4,
        note: "quiet",
      },
      {
        fen: "rnb2b1r/ppk3pp/2p1B3/8/3p1B2/8/PPP2PPP/RN2R1K1 b - - 5 14",
        focus: ["d7", "c7", "g5", "f4", "f8", "d6"],
        highlights: ["g5", "f4"],
        clock: 5,
        note: "quiet",
      },
      {
        fen: "rnb4r/ppk3pp/2pbB3/8/3p1B2/8/PPP2PPP/RN2R1K1 w - - 6 15",
        focus: ["d7", "c7", "g5", "f4", "f8", "d6"],
        highlights: ["f8", "d6"],
        clock: 6,
        note: "quiet",
      },
      {
        fen: "rnb4r/ppk3pp/2pBB3/8/3p4/8/PPP2PPP/RN2R1K1 b - - 0 15",
        focus: ["f4", "d6"],
        highlights: ["f4", "d6"],
        clock: 0,
        note: "capture resets",
      },
    ],
  },
  fullmove: {
    frames: [
      {
        fen: "rn2r1k1/ppp3pp/3bpq2/8/3P2n1/2P2N2/PP2QPPP/RNB2RK1 w - - 1 12",
        focus: [] as string[],
        highlights: [] as string[],
        stm: "w" as const,
        fullmove: 12,
      },
      {
        fen: "rn2r1k1/ppp3pp/3bpq2/6B1/3P2n1/2P2N2/PP2QPPP/RN3RK1 b - - 2 12",
        focus: ["c1", "g5"],
        highlights: ["c1", "g5"],
        stm: "b" as const,
        fullmove: 12,
      },
      {
        fen: "rn2r1k1/ppp3pp/3bp1q1/6B1/3P2n1/2P2N2/PP2QPPP/RN3RK1 w - - 3 13",
        focus: ["f6", "g6"],
        highlights: ["f6", "g6"],
        stm: "w" as const,
        fullmove: 13,
      },
      {
        fen: "rn2r1k1/ppp3pp/3bp1q1/6B1/3P2n1/2P2N1P/PP2QPP1/RN3RK1 b - - 0 13",
        focus: ["h2", "h3"],
        highlights: ["h2", "h3"],
        stm: "b" as const,
        fullmove: 13,
      },
    ],
  },
} as const;

/** Link to the playable board for this FEN (empty code = start). */
const playUrlForFen = (fen: string) => {
  const sideToMove = (fen.split(" ")[1] as "w" | "b") || "w";
  const code = generateCode({ fen, sideToMove });
  return code ? `/p/${code}` : "/p";
};

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setReduced(mq.matches);
    handleChange();
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, []);

  return reduced;
};

const useLoopStep = (length: number, ms: number, paused = false) => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (paused || length <= 1) return;
    const id = window.setInterval(() => {
      setStep((s) => (s + 1) % length);
    }, ms);
    return () => window.clearInterval(id);
  }, [length, ms, paused]);

  return paused ? 0 : step;
};

const fileIndex = (square: string) => square.charCodeAt(0) - 97;

type FullBoardProps = {
  fen: string;
  focusSquares?: string[];
  highlights?: string[];
  epSquare?: string | null;
  reduceMotion?: boolean;
  label: string;
  focusSide?: "w" | "b" | null;
  href?: string;
};

const FullBoard = ({
  fen,
  focusSquares = [],
  highlights = [],
  epSquare = null,
  reduceMotion = false,
  label,
  focusSide = null,
  href,
}: FullBoardProps) => {
  const prevPiecesRef = useRef<BoardPiece[] | null>(null);
  const pieces = useMemo(() => {
    const matched = matchPieceIds(prevPiecesRef.current, fen);
    prevPiecesRef.current = matched;
    return matched;
  }, [fen]);

  const focusSet = useMemo(() => new Set(focusSquares), [focusSquares]);
  const hasFocus = focusSet.size > 0 || focusSide !== null;

  const board = (
    <div
      className="relative border border-border overflow-hidden rounded-none shrink-0 w-[11.5rem] h-[11.5rem] sm:w-[13rem] sm:h-[13rem]"
      role={href ? undefined : "img"}
      aria-hidden={href ? true : undefined}
      aria-label={href ? undefined : label}
    >
      <div className="absolute inset-0 grid grid-cols-8 grid-rows-8">
        {RANKS.map((rank) =>
          FILES.split("").map((file, fi) => {
            const square = `${file}${rank}`;
            const isLight = (8 - rank + fi) % 2 === 0;
            return (
              <div
                key={square}
                className={cn(
                  "chess-square cursor-default",
                  isLight ? "light" : "dark",
                  highlights.includes(square) && "last-move",
                  epSquare === square && "legal-move",
                )}
              />
            );
          }),
        )}
      </div>

      {pieces.map((piece) => {
        const key = (piece.color + piece.type.toUpperCase()) as PieceKey;
        const Icon = PIECE_COMPONENT[key];
        const col = fileIndex(piece.square);
        const row = 8 - Number(piece.square[1]);
        const focused =
          !hasFocus ||
          focusSet.has(piece.square) ||
          focusSide === piece.color;

        return (
          <span
            key={piece.id}
            className={cn(
              "chess-piece absolute inline-flex items-center justify-center pointer-events-none top-0 left-0",
              piece.color === "w" ? "white" : "black",
              focused ? "opacity-100" : "opacity-[0.28]",
            )}
            style={{
              width: "12.5%",
              height: "12.5%",
              transform: `translate(${col * 100}%, ${row * 100}%)`,
              transition: reduceMotion
                ? "none"
                : "transform 420ms cubic-bezier(0.645, 0.045, 0.355, 1), opacity 280ms ease",
            }}
          >
            <Icon className="block w-[72%] h-[72%]" aria-hidden />
          </span>
        );
      })}
    </div>
  );

  if (!href) return board;

  return (
    <a
      href={href}
      className="block rounded-none outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      aria-label={`${label}. Open this position in chss.chat.`}
      title="Open this position in chss.chat"
    >
      {board}
    </a>
  );
};

const InferNote = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-foreground/80 mt-2">
    <span className="font-medium text-foreground">Inferable?</span> {children}
  </p>
);

const DemoCard = ({
  title,
  children,
  board,
}: {
  title: string;
  children: ReactNode;
  board: ReactNode;
}) => (
  <li className="list-none border-b border-border/60 py-5 first:pt-0 last:border-0 last:pb-0">
    <div className="flex flex-col sm:flex-row sm:items-start gap-4">
      <div className="sm:w-[14rem] flex flex-col items-center sm:items-start gap-1.5">
        {board}
        <p className="text-[10px] text-muted-foreground">
          Tap board to play this position
        </p>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="font-medium text-foreground leading-none">{title}</p>
        <div className="text-muted-foreground text-[0.98rem] leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  </li>
);

const SideToMoveDemo = ({ reduced }: { reduced: boolean }) => {
  const frames = DEMO.stm.frames;
  const step = useLoopStep(frames.length, 1600, reduced);
  const frame = frames[step];

  return (
    <DemoCard
      title="Side to move"
      board={
        <div className="space-y-2">
          <FullBoard
            fen={frame.fen}
            focusSide={frame.stm}
            highlights={[...frame.highlights]}
            reduceMotion={reduced}
            label="Side to move from the starting position"
            href={playUrlForFen(frame.fen)}
          />
          <p className="font-mono text-xs text-center tabular-nums">
            <span className="text-muted-foreground">stm </span>
            <span className="text-foreground font-semibold">{frame.stm}</span>
          </p>
        </div>
      }
    >
      <p>
        This one is simple: whose turn is it? White or Black. The starting
        position is always White to move. After 1.e4 it is Black&apos;s turn.
        A share link that omits this field cannot tell the recipient whether
        they are answering a move or making one.
      </p>
      <InferNote>
        Yes, if you store a move list from the start. The parity of the ply
        count is the side to move. Not inferable from a board snapshot alone.
      </InferNote>
    </DemoCard>
  );
};

const CastlingDemo = ({ reduced }: { reduced: boolean }) => {
  const frames = DEMO.castle.frames;
  const step = useLoopStep(frames.length, 1100, reduced);
  const frame = frames[step];

  return (
    <DemoCard
      title="Castling rights"
      board={
        <div className="space-y-2">
          <FullBoard
            fen={frame.fen}
            focusSquares={[...frame.focus]}
            highlights={[...frame.highlights]}
            reduceMotion={reduced}
            label="Castling rights before White castles kingside"
            href={playUrlForFen(DEMO.castle.frames[0].fen)}
          />
          <p className="font-mono text-xs text-center tabular-nums">
            <span className="text-muted-foreground">rights </span>
            <span
              className={cn(
                frame.rights === "kq"
                  ? "text-amber-700 dark:text-amber-400"
                  : "text-foreground",
              )}
            >
              {frame.rights}
            </span>
          </p>
        </div>
      }
    >
      <p>
        Castling is a special king move: the king slides two squares toward a
        rook, and that rook jumps to the square the king crossed. You may only
        do it if neither the king nor that rook has moved earlier in the game,
        the squares between them are empty, and the king is not in check and
        does not pass through or land on a checked square.
      </p>
      <p className="mt-2">
        That history is invisible on the board. A king and rook can sit on their
        home squares after wandering away and back, yet castling is gone forever.
        So the rights (KQkq in FEN) are real game state, not decoration: without
        them a link can show a legal-looking board that still forbids the reply
        the opponent intended.
      </p>
      <InferNote>
        Yes from a full move list from the start (track whether king/rook have
        moved). No from a mid-game snapshot of pieces alone.
      </InferNote>
    </DemoCard>
  );
};

const EnPassantDemo = ({ reduced }: { reduced: boolean }) => {
  const frames = DEMO.ep.frames;
  const step = useLoopStep(frames.length, 1000, reduced);
  const frame = frames[step];

  return (
    <DemoCard
      title="En passant availability"
      board={
        <div className="space-y-2">
          <FullBoard
            fen={frame.fen}
            focusSquares={[...frame.focus]}
            highlights={[...frame.highlights]}
            epSquare={frame.ep}
            reduceMotion={reduced}
            label="En passant available after a double pawn push"
            href={playUrlForFen(
              "rnbq1rk1/ppp3bp/3p1np1/3Ppp2/2P2B1P/4PN2/PP3PP1/RN1QKB1R w KQ e6 0 8",
            )}
          />
          <p className="font-mono text-xs text-center tabular-nums">
            <span
              className={cn(
                frame.ep
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-foreground",
              )}
            >
              {frame.tag}
            </span>
          </p>
        </div>
      }
    >
      <p>
        When a pawn advances two squares and lands beside an enemy pawn, that
        enemy may capture it &quot;in passing&quot; as if it had moved only one
        square. The chance lasts for one reply only. After any other move, the
        opportunity expires.
      </p>
      <p className="mt-2">
        Two pawns side by side on the 4th/5th rank look the same whether the
        double-step just happened or happened ten moves ago. Encoding must
        record the ephemeral target square (or clear it) or the recipient loses
        a capture that was legal in the real game.
      </p>
      <InferNote>
        Yes from the previous ply of a move list. No from a static board without
        knowing that the last move was a double pawn push.
      </InferNote>
    </DemoCard>
  );
};

const HalfmoveDemo = ({ reduced }: { reduced: boolean }) => {
  const frames = DEMO.halfmove.frames;
  const step = useLoopStep(frames.length, 1100, reduced);
  const frame = frames[step];

  return (
    <DemoCard
      title="Halfmove clock"
      board={
        <div className="space-y-2">
          <FullBoard
            fen={frame.fen}
            focusSquares={[...frame.focus]}
            highlights={[...frame.highlights]}
            reduceMotion={reduced}
            label="Halfmove clock before a capture resets it"
            href={playUrlForFen(DEMO.halfmove.frames[3].fen)}
          />
          <p className="font-mono text-xs text-center tabular-nums">
            <span className="text-muted-foreground">halfmove </span>
            <span
              className={cn(
                frame.clock === 0
                  ? "text-amber-700 dark:text-amber-400 font-semibold"
                  : "text-foreground",
              )}
            >
              {frame.clock}
            </span>
            <span className="text-muted-foreground"> · {frame.note}</span>
          </p>
        </div>
      }
    >
      <p>
        The fifty-move rule says a player may claim a draw if fifty full moves
        pass with no capture and no pawn move. FEN tracks that with a halfmove
        clock: it ticks up on quiet piece moves and resets to zero on a capture
        or pawn push.
      </p>
      <p className="mt-2">
        For casual share links this rarely matters. For exact FEN round-trips,
        and for engines that honour draw claims, it is part of the position.
      </p>
      <InferNote>
        Yes if you replay from the start and count. No from a snapshot unless
        you also store the clock (or accept dropping fifty-move accuracy).
      </InferNote>
    </DemoCard>
  );
};

const FullmoveDemo = ({ reduced }: { reduced: boolean }) => {
  const frames = DEMO.fullmove.frames;
  const step = useLoopStep(frames.length, 1200, reduced);
  const frame = frames[step];

  return (
    <DemoCard
      title="Fullmove number"
      board={
        <div className="space-y-2">
          <FullBoard
            fen={frame.fen}
            focusSquares={
              frame.highlights.length > 0 ? [...frame.highlights] : []
            }
            highlights={[...frame.highlights]}
            reduceMotion={reduced}
            label="Fullmove number ticking in a middlegame"
            href={playUrlForFen(DEMO.fullmove.frames[0].fen)}
          />
          <p className="font-mono text-xs text-center tabular-nums">
            <span className="text-muted-foreground">fullmove </span>
            <span className="text-foreground font-semibold">
              {frame.fullmove}
            </span>
            <span className="text-muted-foreground">
              {" "}
              · {frame.stm === "w" ? "White" : "Black"} to move
            </span>
          </p>
        </div>
      }
    >
      <p>
        The fullmove number starts at 1 and increments after Black moves. It is
        bookkeeping for scoresheets and for bit-identical FEN. It does not
        change what moves are legal.
      </p>
      <p className="mt-2">
        A reply-share product can usually drop it. Keep it only when you care
        about reproducing FEN exactly.
      </p>
      <InferNote>
        Yes from a move list (count Black replies). Optional for playability;
        required only for exact FEN identity.
      </InferNote>
    </DemoCard>
  );
};

export const ExtraStateDemos = () => {
  const reduced = usePrefersReducedMotion();

  return (
    <ul className="mt-6 space-y-0 border-y border-border/60">
      <SideToMoveDemo reduced={reduced} />
      <CastlingDemo reduced={reduced} />
      <EnPassantDemo reduced={reduced} />
      <HalfmoveDemo reduced={reduced} />
      <FullmoveDemo reduced={reduced} />
    </ul>
  );
};
