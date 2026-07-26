"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FC,
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
  generateRandomSamples,
  type CodecMethod,
  type EncodedUrl,
  type PositionSample,
} from "@/lib/research-url-codecs";
import { cn } from "@/lib/utils";

type PieceColor = "w" | "b";
type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
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

type BoardPiece = {
  id: string;
  type: PieceType;
  color: PieceColor;
  square: string;
};

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
const SAMPLE_N = 36;
const FRAME_MS = 100; // 10 fps

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

const fenBoardToPieces = (fen: string): Omit<BoardPiece, "id">[] => {
  const rows = fen.split(" ")[0].split("/");
  const out: Omit<BoardPiece, "id">[] = [];
  rows.forEach((row, ri) => {
    let file = 0;
    for (const ch of row) {
      if (ch >= "1" && ch <= "8") {
        file += Number(ch);
        continue;
      }
      const color: PieceColor = ch === ch.toUpperCase() ? "w" : "b";
      const type = ch.toLowerCase() as PieceType;
      const square = `${FILES[file]}${8 - ri}`;
      out.push({ type, color, square });
      file += 1;
    }
  });
  return out;
};

const piecesFromFen = (fen: string): BoardPiece[] =>
  fenBoardToPieces(fen).map((p, i) => ({
    ...p,
    id: `${p.color}${p.type}-${p.square}-${i}`,
  }));

const MiniBoard = ({
  fen,
  reduceMotion,
}: {
  fen: string;
  reduceMotion: boolean;
}) => {
  const pieces = useMemo(() => piecesFromFen(fen), [fen]);

  return (
    <div
      className="relative border border-border overflow-hidden rounded-none w-full aspect-square"
      role="img"
      aria-label="Random sample board position"
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
              transition: reduceMotion
                ? "none"
                : "transform 90ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            }}
          >
            <Icon className="block w-[72%] h-[72%]" aria-hidden />
          </span>
        );
      })}
    </div>
  );
};

const MonoPayload = ({
  text,
  shortest,
}: {
  text: string;
  shortest: boolean;
}) => (
  <div className={cn("overflow-hidden", PAYLOAD_PREVIEW_CLASS)}>
    <p
      className={cn(
        "font-mono text-[10px] sm:text-[11px] leading-[1.35] break-all line-clamp-2",
        shortest ? "text-foreground" : "text-foreground/70",
      )}
      aria-label={text}
    >
      {text.split("").map((ch, i) => (
        <span key={`${i}-${ch}`} className="inline-block">
          {ch}
        </span>
      ))}
    </p>
  </div>
);

/** Full-URL length of a long native/gzip share link — 100% bar width. */
const SCALE_MAX_CHARS = 129;

const HYBRID_SHORT: Record<CodecMethod, string> = {
  packed_uci: "path",
  occupancy: "board",
  lookup_k1024: "dict",
};

const PAYLOAD_PREVIEW_CLASS =
  "min-h-[calc(2*1.35*0.625rem)] sm:min-h-[calc(2*1.35*0.6875rem)]";

const barWidthPct = (chars: number) =>
  Math.min(100, Math.max((chars / SCALE_MAX_CHARS) * 100, 1));

const EncodingRow = ({
  enc,
  highlighted,
}: {
  enc: EncodedUrl;
  highlighted: boolean;
}) => (
  <div className="space-y-1 min-w-0">
    <div className="flex items-baseline justify-between gap-2">
      <span
        className={cn(
          "text-xs",
          highlighted ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {enc.label}
      </span>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground shrink-0">
        {enc.chars}
      </span>
    </div>
    <div
      className="h-1 w-full rounded-full bg-muted/80"
      role="presentation"
      aria-hidden="true"
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-100 ease-out",
          highlighted ? "bg-primary" : "bg-foreground/25",
        )}
        style={{ width: `${barWidthPct(enc.chars)}%` }}
      />
    </div>
    <MonoPayload text={enc.payload} shortest={highlighted} />
  </div>
);

const HybridMinRow = ({
  winner,
  chars,
}: {
  winner: CodecMethod;
  chars: number;
}) => (
  <div className="space-y-1 min-w-0 border-t border-border/60 pt-2">
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs text-foreground">
        Hybrid best of 3
        <span className="text-muted-foreground">
          {" "}
          → {HYBRID_SHORT[winner]}
        </span>
      </span>
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground shrink-0">
        {chars}
      </span>
    </div>

    <div
      className="h-1 w-full rounded-full bg-muted/80"
      role="presentation"
      aria-hidden="true"
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-100 ease-out"
        style={{ width: `${barWidthPct(chars)}%` }}
      />
    </div>

    <div
      className={cn(
        "overflow-hidden font-mono text-[10px] sm:text-[11px] leading-[1.35] text-muted-foreground",
        PAYLOAD_PREVIEW_CLASS,
      )}
      aria-hidden="true"
    >
      <p className="line-clamp-2">min(path, board, dict)</p>
    </div>
  </div>
);

export const UrlLengthLoopDemo = () => {
  const reduced = usePrefersReducedMotion();
  const [samples, setSamples] = useState<PositionSample[]>([]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    setSamples(generateRandomSamples(SAMPLE_N));
  }, []);

  useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);

  useEffect(() => {
    if (!playing || reduced || samples.length <= 1) return;
    const id = window.setInterval(() => {
      setStep((s) => (s + 1) % samples.length);
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, [playing, reduced, samples.length]);

  const sample = samples[step] ?? samples[0];

  const handleTogglePlay = () => {
    setPlaying((prev) => !prev);
  };

  if (!sample) {
    return (
      <div
        className="rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground"
        aria-busy="true"
      >
        Sampling random positions…
      </div>
    );
  }

  return (
    <div
      className="space-y-3"
      aria-label="Board complexity mapped to URL length for the three shortest codecs"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          Board → URL length
        </p>
        <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
          ply {sample.ply}
          <span className="mx-1.5 text-border">·</span>
          {sample.pieceCount} pieces
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(10rem,13rem)_minmax(0,1fr)] sm:items-start">
        <div className="space-y-2">
          <MiniBoard fen={sample.fen} reduceMotion={reduced} />
          <button
            type="button"
            onClick={handleTogglePlay}
            aria-label={playing ? "Pause animation" : "Play animation"}
            aria-pressed={playing}
            className="inline-flex size-7 items-center justify-center border border-border bg-background text-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {playing ? (
              <Pause className="size-3.5" aria-hidden />
            ) : (
              <Play className="size-3.5" aria-hidden />
            )}
          </button>
        </div>

        <div className="min-w-0 space-y-2">
          {sample.candidates.map((enc) => (
            <EncodingRow
              key={enc.method}
              enc={enc}
              highlighted={enc.method === sample.hybrid.winner}
            />
          ))}
          <HybridMinRow
            winner={sample.hybrid.winner}
            chars={sample.hybrid.chars}
          />
        </div>
      </div>
    </div>
  );
};
