"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type ReactNode,
  type SVGProps,
} from "react";
import { Pause, Play } from "lucide-react";
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

const CASTLING_PLACEMENT =
  "rn1qkb1r/1pp2ppp/p3pn2/3p4/2PP4/5BP1/PP2PP1P/RNBQK2R";
const CASTLING_KING_AWAY =
  "rn1qkb1r/1pp2ppp/p3pn2/3p4/2PP4/5BP1/PP2PP1P/RNBQ1K1R";
const CASTLING_CASTLED =
  "rn1qkb1r/1pp2ppp/p3pn2/3p4/2PP4/5BP1/PP2PP1P/RNBQ1RK1";
const EN_PASSANT_PLACEMENT =
  "rnbq1rk1/ppp3bp/3p1np1/3Ppp2/2P2B1P/4PN2/PP3PP1/RN1QKB1R";
const BEFORE_EN_PASSANT_SINGLE =
  "rnbq1rk1/ppp3bp/3ppnp1/3P1p2/2P2B1P/4PN2/PP3PP1/RN1QKB1R";
const BEFORE_EN_PASSANT_DOUBLE =
  "rnbq1rk1/ppp1p1bp/3p1np1/3P1p2/2P2B1P/4PN2/PP3PP1/RN1QKB1R";
const AFTER_EN_PASSANT_CAPTURE =
  "rnbq1rk1/ppp3bp/3pPnp1/5p2/2P2B1P/4PN2/PP3PP1/RN1QKB1R";

const FRAME_MS = 1100;

const fileIndex = (square: string) => square.charCodeAt(0) - 97;

const usePrefersReducedMotion = () => {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => setReducedMotion(mediaQuery.matches);

    handleChange();
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return reducedMotion;
};

type BoardFrame = {
  fen: string;
  label: string;
};

const CASTLING_LEFT_FRAMES: BoardFrame[] = [
  {
    fen: `${CASTLING_KING_AWAY} b kq - 1 7`,
    label: "White king steps to g1",
  },
  {
    fen: `${CASTLING_PLACEMENT} w kq - 0 7`,
    label:
      "The king moved earlier; back on e1, but castling is lost",
  },
];

const CASTLING_RIGHT_FRAMES: BoardFrame[] = [
  {
    fen: `${CASTLING_PLACEMENT} w KQkq - 0 7`,
    label: "King and rook still on their home squares",
  },
  {
    fen: `${CASTLING_CASTLED} b kq - 1 7`,
    label: "White castles kingside",
  },
];

const EN_PASSANT_LEFT_FRAMES: BoardFrame[] = [
  {
    fen: `${BEFORE_EN_PASSANT_SINGLE} b KQ - 0 8`,
    label: "White pawn on d5; black pawn on e6",
  },
  {
    fen: `${EN_PASSANT_PLACEMENT} w KQ - 0 8`,
    label: "Black plays e6–e5; no en passant capture",
  },
];

const EN_PASSANT_RIGHT_FRAMES: BoardFrame[] = [
  {
    fen: `${BEFORE_EN_PASSANT_DOUBLE} b KQ - 0 7`,
    label: "White pawn on d5; black pawn on e7",
  },
  {
    fen: `${EN_PASSANT_PLACEMENT} w KQ e6 0 8`,
    label: "Black plays e7–e5; en passant target on e6",
  },
  {
    fen: `${AFTER_EN_PASSANT_CAPTURE} b KQ - 0 8`,
    label: "White captures d5×e6 on the empty square",
  },
];

const useBoardLoop = (frameCount: number, reducedMotion: boolean) => {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(() => !reducedMotion);
  const [skipTransition, setSkipTransition] = useState(false);
  const prevStepRef = useRef(0);

  // Derive play intent — reduced motion always wins (no prop→state sync effect)
  const isPlaying = reducedMotion ? false : playing;

  useEffect(() => {
    if (!isPlaying || frameCount <= 1) return;

    const interval = window.setInterval(() => {
      setStep((currentStep) => (currentStep + 1) % frameCount);
    }, FRAME_MS);

    return () => window.clearInterval(interval);
  }, [frameCount, isPlaying]);

  useEffect(() => {
    if (prevStepRef.current !== 0 && step === 0) {
      setSkipTransition(true);
    }
    prevStepRef.current = step;
  }, [step]);

  useEffect(() => {
    if (!skipTransition) return;
    setSkipTransition(false);
  }, [skipTransition, step]);

  const handleTogglePlay = () => {
    setPlaying((current) => !current);
  };

  return { step, playing: isPlaying, handleTogglePlay, skipTransition };
};

type FullBoardProps = {
  fen: string;
  label: string;
  reducedMotion?: boolean;
  animate?: boolean;
};

const PIECE_TRANSITION =
  "transform 420ms cubic-bezier(0.645, 0.045, 0.355, 1), opacity 220ms ease";

const FullBoard = ({
  fen,
  label,
  reducedMotion = false,
  animate = true,
}: FullBoardProps) => {
  const previousPiecesRef = useRef<BoardPiece[] | null>(null);
  const pieces = useMemo(
    () =>
      matchPieceIds(animate ? previousPiecesRef.current : null, fen),
    [animate, fen],
  );

  useLayoutEffect(() => {
    previousPiecesRef.current = pieces;
  }, [pieces]);

  return (
    <div
      className="relative aspect-square w-full overflow-hidden border border-border"
      role="img"
      aria-label={label}
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

        return (
          <span
            key={piece.id}
            className={cn(
              "chess-piece absolute inline-flex items-center justify-center pointer-events-none top-0 left-0",
              piece.color === "w" ? "white" : "black",
            )}
            style={{
              width: "12.5%",
              height: "12.5%",
              transform: `translate(${col * 100}%, ${row * 100}%)`,
              transition:
                reducedMotion || !animate ? "none" : PIECE_TRANSITION,
            }}
          >
            <Icon className="block size-[88%]" aria-hidden />
          </span>
        );
      })}
    </div>
  );
};

const InteractiveBoardPanel = ({
  frames,
  reducedMotion,
  controlLabel,
}: {
  frames: BoardFrame[];
  reducedMotion: boolean;
  controlLabel: string;
}) => {
  const { step, playing, handleTogglePlay, skipTransition } = useBoardLoop(
    frames.length,
    reducedMotion,
  );
  const frame = frames[step] ?? frames[0];

  return (
    <div className="min-w-0">
      <FullBoard
        fen={frame.fen}
        label={frame.label}
        reducedMotion={reducedMotion}
        animate={!skipTransition}
      />
      <div className="mt-2 flex items-start gap-2">
        <button
          type="button"
          onClick={handleTogglePlay}
          aria-label={
            playing
              ? `Pause ${controlLabel} animation`
              : `Play ${controlLabel} animation`
          }
          aria-pressed={playing}
          className="inline-flex size-7 shrink-0 items-center justify-center border border-border bg-background text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {playing ? (
            <Pause className="size-3.5" aria-hidden />
          ) : (
            <Play className="size-3.5" aria-hidden />
          )}
        </button>
        <p
          className="min-h-[3.5lh] flex-1 pt-0.5 text-xs leading-snug text-muted-foreground"
          aria-live="polite"
        >
          {frame.label}
        </p>
      </div>
    </div>
  );
};

const StateComparison = ({
  title,
  leftPanel,
  rightPanel,
  children,
}: {
  title: string;
  leftPanel: ReactNode;
  rightPanel: ReactNode;
  children: ReactNode;
}) => (
  <li className="list-none  border-border/60 py-5 first:pt-0 last:border-0 last:pb-0">
    <p className="font-medium text-foreground">{title}</p>
    <div className="mt-3 grid grid-cols-2 gap-3 sm:gap-5">
      {leftPanel}
      {rightPanel}
    </div>
    <div className="mt-3 text-muted-foreground text-[0.98rem] leading-relaxed">
      {children}
    </div>
  </li>
);

const CompactStateNote = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <li className="list-none py-3.5 last:border-0 last:pb-0">
    <p className="font-medium text-foreground leading-none">{title}</p>
    <p className="mt-1.5 text-muted-foreground text-[0.95rem] leading-relaxed">
      {children}
    </p>
  </li>
);

const CastlingComparison = ({
  reducedMotion,
}: {
  reducedMotion: boolean;
}) => (
    <StateComparison
      title="Castling rights"
      leftPanel={
        <InteractiveBoardPanel
          frames={CASTLING_LEFT_FRAMES}
          reducedMotion={reducedMotion}
          controlLabel="castling history"
        />
      }
      rightPanel={
        <InteractiveBoardPanel
          frames={CASTLING_RIGHT_FRAMES}
          reducedMotion={reducedMotion}
          controlLabel="castling move"
        />
      }
    >
      Both histories reach the same arrangement, with the king and rook on their
      original squares. The difference is the invisible journey that came
      before: one history moved the king and permanently removed castling rights;
      the other never did.
    </StateComparison>
);

const EnPassantComparison = ({
  reducedMotion,
}: {
  reducedMotion: boolean;
}) => (
    <StateComparison
      title="En passant"
      leftPanel={
        <InteractiveBoardPanel
          frames={EN_PASSANT_LEFT_FRAMES}
          reducedMotion={reducedMotion}
          controlLabel="one-square pawn advance"
        />
      }
      rightPanel={
        <InteractiveBoardPanel
          frames={EN_PASSANT_RIGHT_FRAMES}
          reducedMotion={reducedMotion}
          controlLabel="two-square pawn advance"
        />
      }
    >
      Both boards end with a white pawn on d5 and a black pawn on e5. On the
      left, Black just played the normal one-square move e6–e5. On the right,
      Black jumped from e7 to e5, so White may capture on e6 for this move only.
    </StateComparison>
);

export const ExtraStateDemos = () => {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <ul className="mt-6 space-y-0">
      <CastlingComparison reducedMotion={reducedMotion} />
      <EnPassantComparison reducedMotion={reducedMotion} />

      <CompactStateNote title="Side to move">
        Whose turn it is. The same arrangement can belong to either player, so a
        snapshot has to say who moves next.
      </CompactStateNote>
      <CompactStateNote title="Halfmove clock">
        Counts each player&apos;s turn since the last pawn move or capture. A
        player can claim a draw when the count reaches 100 under the fifty-move
        rule, and the game is automatically drawn at 150 under the
        seventy-five-move rule unless the final move is checkmate. The pieces
        alone do not reveal this count.
      </CompactStateNote>
      <CompactStateNote title="Fullmove number">
        Numbers the turns in a written game. It starts at 1 and increases after
        each Black move, matching the move numbers used in scoresheets and chess
        notation. The rules do not use this number to decide whether a move is
        legal.
      </CompactStateNote>
    </ul>
  );
};
