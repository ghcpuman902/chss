"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FC,
  type SVGProps,
} from "react";
import { Chess } from "chess.js";
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

type Frame = {
  fen: string;
  uci: string;
  lastMove: string | null;
  highlights: string[];
  ply: number;
};

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

/** Italian Game: five plies from the start. */
const MOVES = ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"] as const;

const buildFrames = (): Frame[] => {
  const chess = new Chess();
  const frames: Frame[] = [
    {
      fen: chess.fen(),
      uci: "",
      lastMove: null,
      highlights: [],
      ply: 0,
    },
  ];

  for (const uciMove of MOVES) {
    const from = uciMove.slice(0, 2);
    const to = uciMove.slice(2, 4);
    chess.move({ from, to });
    const uci = frames[frames.length - 1].uci + uciMove;
    frames.push({
      fen: chess.fen(),
      uci,
      lastMove: uciMove,
      highlights: [from, to],
      ply: frames.length,
    });
  }

  return frames;
};

const FRAMES = buildFrames();

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

const STEP_MS = 1400;

const fileIndex = (square: string) => square.charCodeAt(0) - 97;

const MiniBoard = ({
  fen,
  highlights,
  lastMove,
  reduceMotion,
}: {
  fen: string;
  highlights: string[];
  /** Null on the starting frame — fresh ids, no slide-back animation. */
  lastMove: string | null;
  reduceMotion: boolean;
}) => {
  const prevPiecesRef = useRef<BoardPiece[] | null>(null);
  const animate = Boolean(lastMove) && !reduceMotion;
  const highlightSet = useMemo(() => new Set(highlights), [highlights]);

  const pieces = useMemo(() => {
    const move =
      lastMove && lastMove.length >= 4
        ? { from: lastMove.slice(0, 2), to: lastMove.slice(2, 4) }
        : null;

    // Loop reset / start: new identities so pieces don't tween home.
    return matchPieceIds(move ? prevPiecesRef.current : null, fen, move);
  }, [fen, lastMove]);

  useEffect(() => {
    prevPiecesRef.current = pieces;
  }, [pieces]);

  return (
    <div
      className="relative border border-border overflow-hidden rounded-none w-full aspect-square max-w-[14rem] mx-auto"
      role="img"
      aria-label="Board position for the current FEN and UCI example"
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
                  highlightSet.has(square) && "last-move",
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
              "absolute inline-flex items-center justify-center pointer-events-none top-0 left-0",
              piece.color === "w" ? "text-white" : "text-gray-800",
            )}
            style={{
              width: "12.5%",
              height: "12.5%",
              transform: `translate(${col * 100}%, ${row * 100}%)`,
              transition: animate
                ? "transform 420ms cubic-bezier(0.645, 0.045, 0.355, 1)"
                : "none",
            }}
          >
            <Icon className="block w-[72%] h-[72%]" aria-hidden />
          </span>
        );
      })}
    </div>
  );
};

const LONGEST_FEN = FRAMES.reduce(
  (longest, frame) => (frame.fen.length > longest.length ? frame.fen : longest),
  "",
);
const LONGEST_UCI = FRAMES[FRAMES.length - 1]?.uci ?? "";

const EncodingRow = ({
  label,
  value,
  accent,
  emptyLabel,
  reserveValue,
}: {
  label: string;
  value: string;
  accent?: string;
  emptyLabel: string;
  /** Longest value across frames — keeps the box height stable while animating. */
  reserveValue: string;
}) => {
  const base = accent ? value.slice(0, -accent.length) : value;
  const hasValue = value.length > 0;
  const reserveText =
    reserveValue.length >= emptyLabel.length ? reserveValue : emptyLabel;

  return (
    <div className="space-y-1 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground w-[4.5rem] text-right">
          {hasValue ? `${value.length} chars` : "—"}
        </span>
      </div>
      <div className="relative font-mono text-[11px] sm:text-xs leading-snug break-all rounded-none border bg-muted/40 px-2.5 py-2">
        <p className="invisible select-none" aria-hidden="true">
          {reserveText}
        </p>
        <p className="absolute inset-0 px-2.5 py-2">
          {hasValue ? (
            <>
              <span className="text-foreground/70">{base}</span>
              {accent ? (
                <span className="text-foreground font-semibold">{accent}</span>
              ) : null}
            </>
          ) : (
            <span className="text-muted-foreground">{emptyLabel}</span>
          )}
        </p>
      </div>
    </div>
  );
};

export const FenUciMappingDemo = () => {
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);

  useEffect(() => {
    if (!playing || reduced || FRAMES.length <= 1) return;
    const id = window.setInterval(() => {
      setStep((s) => (s + 1) % FRAMES.length);
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [playing, reduced]);

  const frame = FRAMES[step];
  const prevUci = step > 0 ? FRAMES[step - 1].uci : "";
  const accent = frame.uci.slice(prevUci.length);

  const handleSliderChange = (event: ChangeEvent<HTMLInputElement>) => {
    setStep(Number(event.target.value));
    setPlaying(false);
  };

  const handleTogglePlay = () => {
    setPlaying((prev) => !prev);
  };

  return (
    <aside
      className="space-y-3 sticky top-6"
      aria-label="Animated mapping from board to FEN and UCI"
    >
      <MiniBoard
        fen={frame.fen}
        highlights={frame.highlights}
        lastMove={frame.lastMove}
        reduceMotion={reduced}
      />

      <EncodingRow
        label="FEN"
        value={frame.fen}
        emptyLabel="empty"
        reserveValue={LONGEST_FEN}
      />
      <EncodingRow
        label="UCI"
        value={frame.uci}
        accent={accent || undefined}
        emptyLabel="(start · empty path)"
        reserveValue={LONGEST_UCI}
      />

      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={FRAMES.length - 1}
          step={1}
          value={step}
          onChange={handleSliderChange}
          aria-label="Scrub through game plies"
          aria-valuetext={
            frame.ply === 0
              ? "Starting position"
              : `Ply ${frame.ply} of ${MOVES.length}${frame.lastMove ? `, ${frame.lastMove}` : ""}`
          }
          className="fen-uci-scrubber flex-1 min-w-0 h-1.5 appearance-none cursor-pointer bg-muted accent-primary rounded-none"
        />
        <button
          type="button"
          onClick={handleTogglePlay}
          aria-label={playing ? "Pause animation" : "Play animation"}
          aria-pressed={playing}
          className="shrink-0 inline-flex size-7 items-center justify-center border border-border bg-background text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {playing ? (
            <Pause className="size-3.5" aria-hidden />
          ) : (
            <Play className="size-3.5" aria-hidden />
          )}
        </button>
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">
        Italian Game, five moves. Drag to scrub; play/pause on the right. FEN
        rewrites the whole state each ply; UCI only appends to the history.
      </p>
    </aside>
  );
};
