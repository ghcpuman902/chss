"use client";

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";
import { buildOgPath, type OgPerspective } from "@/lib/og-encoding";
import {
  MEASURE_DEMO_SAMPLES,
  type CodecMethod,
  type EncodedUrl,
  type PositionSample,
} from "@/lib/research-url-codecs";
import { cn } from "@/lib/utils";

const FRAME_MS = 700;
const SAMPLES: PositionSample[] = MEASURE_DEMO_SAMPLES;

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

const OgMiniBoard = ({ fen }: { fen: string }) => {
  const stm = (fen.split(" ")[1] === "b" ? "b" : "w") as OgPerspective;
  const src = buildOgPath(fen, stm);

  return (
    <img
      src={src}
      alt="Fixed progression board position"
      width={208}
      height={208}
      className="block w-full aspect-square border border-border rounded-none bg-muted/30"
      decoding="async"
    />
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
      {text}
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
          "h-full rounded-full transition-[width] duration-300 ease-out",
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
        className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
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
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (reduced) setPlaying(false);
  }, [reduced]);

  useEffect(() => {
    if (!playing || reduced || SAMPLES.length <= 1) return;
    const id = window.setInterval(() => {
      setStep((s) => (s + 1) % SAMPLES.length);
    }, FRAME_MS);
    return () => window.clearInterval(id);
  }, [playing, reduced]);

  const sample = SAMPLES[step] ?? SAMPLES[0];

  const handleTogglePlay = () => {
    setPlaying((prev) => !prev);
  };

  if (!sample) {
    return (
      <div
        className="rounded-lg border bg-muted/30 p-6 text-sm text-muted-foreground"
        aria-busy="true"
      >
        Loading progression…
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
          <OgMiniBoard fen={sample.fen} />
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
