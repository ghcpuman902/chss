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
import { MEASURE_DEMO_UCI } from "@/lib/research-url-codecs";
import { readUciMoveAt } from "@/lib/uci";
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
  ply: number;
  pieceCount: number;
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
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;
const FRAME_MS = 700;

/** Cap UCI preview height; overflow scrolls so a full-game path stays readable. */
const UCI_PREVIEW_CLASS =
  "max-h-[calc(3*1.35*0.625rem)] sm:max-h-[calc(3*1.35*0.6875rem)] overflow-y-auto";

const FEN_PREVIEW_CLASS =
  "min-h-[calc(2*1.35*0.625rem)] sm:min-h-[calc(2*1.35*0.6875rem)]";

const pieceCountOf = (fen: string) =>
  fen
    .split(" ")[0]
    .replace(/\d/g, "")
    .replace(/\//g, "").length;

const buildFrames = (): Frame[] => {
  const chess = new Chess();
  const frames: Frame[] = [
    {
      fen: chess.fen(),
      uci: "",
      lastMove: null,
      ply: 0,
      pieceCount: pieceCountOf(chess.fen()),
    },
  ];

  let uci = "";
  for (let i = 0; i < MEASURE_DEMO_UCI.length; ) {
    const chunk = readUciMoveAt(MEASURE_DEMO_UCI, i);
    if (!chunk) break;
    const move = chess.move({
      from: chunk.from,
      to: chunk.to,
      promotion: chunk.promotion,
    });
    if (!move) break;
    const lastMove = `${chunk.from}${chunk.to}${chunk.promotion ?? ""}`;
    uci += lastMove;
    i += chunk.step;
    frames.push({
      fen: chess.fen(),
      uci,
      lastMove,
      ply: frames.length,
      pieceCount: pieceCountOf(chess.fen()),
    });
  }

  return frames;
};

const FRAMES = buildFrames();
const FINAL_PLY = FRAMES.length - 1;

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

const fileIndex = (square: string) => square.charCodeAt(0) - 97;

const MiniBoard = ({
  fen,
  lastMove,
  reduceMotion,
}: {
  fen: string;
  lastMove: string | null;
  reduceMotion: boolean;
}) => {
  const prevPiecesRef = useRef<BoardPiece[] | null>(null);
  const animate = Boolean(lastMove) && !reduceMotion;
  const highlights = useMemo(() => {
    if (!lastMove || lastMove.length < 4) return [] as string[];
    return [lastMove.slice(0, 2), lastMove.slice(2, 4)];
  }, [lastMove]);
  const highlightSet = useMemo(() => new Set(highlights), [highlights]);

  const pieces = useMemo(() => {
    const move =
      lastMove && lastMove.length >= 4
        ? { from: lastMove.slice(0, 2), to: lastMove.slice(2, 4) }
        : null;

    return matchPieceIds(move ? prevPiecesRef.current : null, fen, move);
  }, [fen, lastMove]);

  useEffect(() => {
    prevPiecesRef.current = pieces;
  }, [pieces]);

  return (
    <div
      className="relative border border-border overflow-hidden rounded-none w-full aspect-square"
      role="img"
      aria-label="Opera Game board position for the current ply"
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
              "chess-piece absolute inline-flex items-center justify-center pointer-events-none top-0 left-0",
              piece.color === "w" ? "white" : "black",
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
            <Icon className="block size-[88%]" aria-hidden />
          </span>
        );
      })}
    </div>
  );
};

const EncodingRow = ({
  label,
  notation,
  value,
  accent,
  emptyLabel,
  scrollable,
}: {
  label: string;
  notation?: { abbr: string; fullName: string };
  value: string;
  accent?: string;
  emptyLabel: string;
  /** When true, wrap to a capped height then scroll (UCI path growth). */
  scrollable?: boolean;
}) => {
  const base = accent ? value.slice(0, -accent.length) : value;
  const hasValue = value.length > 0;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollable || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [scrollable, value]);

  return (
    <div className="space-y-1 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-foreground">
          {label}
          {notation ? (
            <span className="text-muted-foreground font-normal">
              {" "}
              ({notation.abbr}, {notation.fullName})
            </span>
          ) : null}
        </span>
        <span
          className="font-mono text-[11px] tabular-nums text-muted-foreground shrink-0"
          aria-label={
            hasValue ? `${value.length} characters` : "empty"
          }
        >
          {hasValue ? `${value.length} chars` : "—"}
        </span>
      </div>
      <div
        ref={scrollRef}
        className={cn(
          "font-mono text-[10px] sm:text-[11px] leading-[1.35] break-all",
          scrollable ? UCI_PREVIEW_CLASS : cn("overflow-hidden", FEN_PREVIEW_CLASS),
        )}
      >
        {hasValue ? (
          <p>
            <span className="text-foreground/70">{base}</span>
            {accent ? (
              <span className="text-foreground font-semibold">{accent}</span>
            ) : null}
          </p>
        ) : (
          <p className="text-muted-foreground">{emptyLabel}</p>
        )}
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
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, [playing, reduced]);

  const frame = FRAMES[step] ?? FRAMES[0];
  const prevUci = step > 0 ? (FRAMES[step - 1]?.uci ?? "") : "";
  const accent = frame.uci.slice(prevUci.length);

  const handleSliderChange = (event: ChangeEvent<HTMLInputElement>) => {
    setStep(Number(event.target.value));
    setPlaying(false);
  };

  const handleTogglePlay = () => {
    setPlaying((prev) => !prev);
  };

  const plyLabel =
    frame.ply === 0
      ? "start"
      : frame.ply === FINAL_PLY
        ? `ply ${frame.ply} · mate`
        : `ply ${frame.ply}`;

  return (
    <div
      className="space-y-3"
      aria-label="Opera Game mapped to board text and move list length"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          Board → text snapshot / move list
        </p>
        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {frame.pieceCount} pieces
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(10rem,13rem)_minmax(0,1fr)] sm:items-start">
        <MiniBoard
          fen={frame.fen}
          lastMove={frame.lastMove}
          reduceMotion={reduced}
        />

        <div className="min-w-0 space-y-2">
          <EncodingRow
            label="Board text"
            notation={{
              abbr: "FEN",
              fullName: "Forsyth–Edwards Notation",
            }}
            value={frame.fen}
            emptyLabel="empty"
          />
          <EncodingRow
            label="Move list"
            notation={{
              abbr: "UCI",
              fullName: "Universal Chess Interface protocol",
            }}
            value={frame.uci}
            accent={accent || undefined}
            emptyLabel="(start · empty path)"
            scrollable
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleTogglePlay}
          aria-label={playing ? "Pause animation" : "Play animation"}
          aria-pressed={playing}
          className="inline-flex size-7 shrink-0 items-center justify-center border border-border bg-background text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {playing ? (
            <Pause className="size-3.5" aria-hidden />
          ) : (
            <Play className="size-3.5" aria-hidden />
          )}
        </button>
        <input
          type="range"
          min={0}
          max={FINAL_PLY}
          step={1}
          value={step}
          onChange={handleSliderChange}
          aria-label="Scrub through Opera Game plies"
          aria-valuetext={
            frame.ply === 0
              ? "Starting position"
              : `Ply ${frame.ply} of ${FINAL_PLY}${frame.lastMove ? `, ${frame.lastMove}` : ""}`
          }
          className="fen-uci-scrubber min-w-0 flex-1 h-2 appearance-none cursor-pointer bg-muted accent-primary rounded-none"
        />
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {plyLabel}
        </span>
      </div>
    </div>
  );
};
