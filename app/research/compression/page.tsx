import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import scoreboard from "@/lib/compression-url-scoreboard.json";
import { BishopIcon, KingIcon, KnightIcon, PawnIcon, QueenIcon, RookIcon } from "@/components/pieces";
import { ExtraStateDemos } from "@/components/research/extra-state-demos";
import { FenUciMappingDemo } from "@/components/research/fen-uci-mapping-demo";
import { ResearchExampleBoard } from "@/components/research/research-example-board";
import { UrlLengthLoopDemo } from "@/components/research/url-length-loop-demo";
import { UtfEncodingDemo } from "@/components/research/utf-encoding-demo";
import { fenToBoard64 } from "@/lib/og-encoding";
import {
  lookupBooksToIndex,
  parseResearchCode,
} from "@/lib/research-url-decode";
import { parseCode } from "@/lib/state-core";

export const metadata: Metadata = {
  title: "How small can a chess share link get?",
  description:
    "Why encoding a chess position for a pasteable URL is harder than it looks, and how packed, lookup, and hybrid codecs compare on real Lichess games.",
};

type MetricSpread = {
  mean: number;
  min?: number;
  max?: number;
  std?: number;
};

type ScoreRow = {
  method: string;
  family: string;
  label: string;
  bits: number;
  bits_min?: number;
  bits_max?: number;
  bits_std?: number;
  chars: number;
  chars_min?: number;
  chars_max?: number;
  chars_std?: number;
  url: number;
  url_min?: number;
  url_max?: number;
  url_std?: number;
  n: number;
};

type PhaseRow = {
  bits: number;
  bits_min?: number;
  bits_max?: number;
  bits_std?: number;
  chars: number;
  chars_min?: number;
  chars_max?: number;
  chars_std?: number;
  url: number;
  url_min?: number;
  url_max?: number;
  url_std?: number;
  n: number;
};

/** Sampled checkpoints only, not phase ranges. Labels come from scoreboard meta. */
const CHECKPOINTS = (
  (scoreboard.meta as { ply_points?: number[] }).ply_points ?? [2, 8, 16, 32, 64]
).map((ply) => ({
  key: `ply_${ply}` as const,
  label: `Ply ${ply}`,
  ply,
}));

const FAMILY_ORDER = ["raw", "packed", "gzip", "lookup", "hybrid"] as const;

const FAMILY_LABEL: Record<string, string> = {
  raw: "Raw / native",
  packed: "Packed binary → Base64URL",
  gzip: "gzip → Base64URL",
  lookup: "Lookup table",
  hybrid: "Hybrid",
};

/** Conceptual family for the compact comparison (not the scoreboard family key). */
const METHOD_KIND: Record<
  string,
  { kind: string; depends: string; keeps: string }
> = {
  native_fen: {
    kind: "State",
    depends: "None beyond chess.js",
    keeps: "Complete FEN state",
  },
  native_uci: {
    kind: "Path",
    depends: "Replay from start",
    keeps: "Full path from start",
  },
  trim_fen: {
    kind: "Variant",
    depends: "None beyond chess.js",
    keeps: "Playable fields only (no clocks)",
  },
  packed_uci: {
    kind: "Path",
    depends: "Replay from start",
    keeps: "Full path from start",
  },
  occupancy: {
    kind: "State",
    depends: "None beyond chess.js",
    keeps: "Complete FEN state",
  },
  naive_4bit: {
    kind: "State",
    depends: "None beyond chess.js",
    keeps: "Complete FEN state",
  },
  gzip_uci: {
    kind: "Path",
    depends: "gzip + replay",
    keeps: "Full path from start",
  },
  gzip_fen: {
    kind: "State",
    depends: "gzip + chess.js",
    keeps: "Complete FEN state",
  },
  lookup_k1024: {
    kind: "Frequency",
    depends: "Frozen codebook",
    keeps: "Full path from start",
  },
  hybrid_min: {
    kind: "Hybrid",
    depends: "Codebook if lookup wins",
    keeps: "Path or complete FEN state",
  },
};

/** Shared demo position: 1. e4 e5 */
const DEMO_UCI = "e2e4e7e5";
const DEMO_SAN = "1. e4 e5";

type MethodExample = {
  label: string;
  code: string;
  note?: string;
};

type MethodDetail = {
  id: string;
  method: string;
  how: string;
  when: string;
  examples: MethodExample[];
};

const METHOD_DETAILS: MethodDetail[] = [
  {
    id: "method-native-fen",
    method: "native_fen",
    how: "Stores the full FEN string, then Base64URL-encodes it for a path-safe payload. The decoder Base64URL-decodes and loads the position with chess.js.",
    when: "Use when you already have a mid-game FEN and no move path, or when interoperability with standard FEN matters. Every slash, space, field, and clock digit still has to pass through the URL alphabet.",
    examples: [
      {
        label: DEMO_SAN,
        code: "f-cm5icWtibnIvcHBwcDFwcHAvOC80cDMvNFAzLzgvUFBQUDFQUFAvUk5CUUtCTlIgdyBLUWtxIC0gMCAy",
        note: "Full FEN → Base64URL. About 102 characters for the share URL on this opening.",
      },
    ],
  },
  {
    id: "method-native-uci",
    method: "native_uci",
    how: "Appends raw UCI move text with no further encoding. e2e4e7e5 is already URL-safe ASCII, so the payload is the move string itself. The decoder replays from the start position.",
    when: "Included for the early-game edge only: openings and short games can be surprisingly compact. Grows by four characters per ply (five on promotions), stores full history, and is not the long-term share format.",
    examples: [
      {
        label: DEMO_SAN,
        code: `u-${DEMO_UCI}`,
        note: "30 characters for the full URL. By ply 16, the same format averages 86 characters.",
      },
      {
        label: "Italian, 6 plies",
        code: "u-e2e4e7e5g1f3b8c6f1c4g8f6",
        note: "Still readable. Length tracks the path, not board complexity.",
      },
    ],
  },
  {
    id: "method-trim-fen",
    method: "trim_fen",
    how: "Base64URL of FEN with the halfmove clock and fullmove number dropped. The result can restore a playable board, but not the original counters on its own.",
    when: "Useful as a lower bound on those two fields. Without a recovery rule, it describes less state than full FEN. It is also still text-shaped, so it never approaches the packed rows.",
    examples: [
      {
        label: DEMO_SAN,
        code: "t-cm5icWtibnIvcHBwcDFwcHAvOC80cDMvNFAzLzgvUFBQUDFQUFAvUk5CUUtCTlIgdyBLUWtxIC0",
        note: "Restores the board and immediate move rights, but not the original counters.",
      },
    ],
  },
  {
    id: "method-packed-uci",
    method: "packed_uci",
    how: "A path again, but each move is 12 bits (from-square + to-square) plus 2 bits when a promotion appears. Because the decoder replays the board, it knows when a move must include a promotion choice. The bit stream is then Base64URL-encoded.",
    when: "Wins while games are short. By ply 16, the packed path is already roughly level with occupancy on average. Hybrid exists largely to catch that crossover; packed UCI is not a serious late-game candidate on its own.",
    examples: [
      {
        label: DEMO_SAN,
        code: "p-Mc0k",
        note: "24 bits → four Base64URL characters. Full URL length 26.",
      },
      {
        label: "Italian, 6 plies",
        code: "p-Mc0kGV5qFa-t",
        note: "72 bits → 12 characters of payload.",
      },
    ],
  },
  {
    id: "method-occupancy",
    method: "occupancy",
    how: "A 64-bit occupancy mask (which squares are filled), then a 4-bit piece nibble per occupied square, then FEN-complete meta: side to move, castling, en passant, halfmove clock, and fullmove number. No move list. Size tracks piece count, not ply count.",
    when: "Among the standalone codecs, occupancy has the shortest overall mean on this held-out validation scoreboard. Middlegames and endgames stay near the same URL length while path codecs keep growing. Weak only in the opening, where a short path or dictionary entry is smaller.",
    examples: [
      {
        label: DEMO_SAN,
        code: "o-EADv___vABBCNWMkEREREZmZmZnKveus-AAAQA",
        note: "219 bits with 32 pieces plus clocks → 60 URL characters. By ply 64, occupancy shortens as captures remove pieces.",
      },
    ],
  },
  {
    id: "method-naive-4bit",
    method: "naive_4bit",
    how: "Every square gets a fixed 4-bit cell (empty or coloured piece), plus the same 27-bit FEN-complete meta used by the benchmark. The total is always 283 logical bits before Base64URL.",
    when: "A useful baseline for “store the grid literally.” Occupancy beats it because empty squares cost one bit in the mask instead of four in the grid.",
    examples: [
      {
        label: DEMO_SAN,
        code: "n-QjVjJBERAREAAAAAAAAQAAAAkAAAAAAAmZkJmcq966z4AABA",
        note: "Fixed 70-character URL on every position. Simple, never adaptive.",
      },
    ],
  },
  {
    id: "method-gzip-uci",
    method: "gzip_uci",
    how: "gzip the raw UCI ASCII string at maximum compression, then Base64URL the bytes. Same idea people reach for when a payload “should compress.”",
    when: "Almost always loses on share URLs. The gzip header alone is larger than a short opening path, and Base64URL expands the compressed bytes again. Even on long paths, generic gzip remains far behind the chess-aware packed representation in this benchmark.",
    examples: [
      {
        label: DEMO_SAN,
        code: "g-H4sIAAAAAAAC_0s1SjVJNU81BQCH6qitCAAAAA",
        note: "Two coordinate moves become a 60-character URL. The raw move string was 30.",
      },
    ],
  },
  {
    id: "method-gzip-fen",
    method: "gzip_fen",
    how: "gzip the full FEN text, then Base64URL. Same compressor tax as gzip(UCI), applied to a string that is already short and low-redundancy.",
    when: "gzip(FEN) produces the longest mean URL in this benchmark. Kept as a control so “just gzip it” has a measured answer.",
    examples: [
      {
        label: DEMO_SAN,
        code: "z-H4sIAAAAAAAC_yvKSyrMTsor0i8AAkMg1rfQNykw1jcJMAayAoDAEIj1g_ycAr2d_IIUyhW8A7MLFXQVDBSMAGXyLYs8AAAA",
        note: "Header + alphabet tax outweigh any FEN redundancy at this size.",
      },
    ],
  },
  {
    id: "method-lookup",
    method: "lookup_k1024",
    how: "Human openings repeat. A hit replaces familiar opening plies with a depth id and a 10-bit index, then appends any packed suffix. A miss stores the complete packed path. Every lookup payload starts with one discriminator bit (1 = hit, 0 = miss), counted in both logical length and the Base64URL payload. The benchmark book keeps a separate list of up to K = 1024 prefixes at each of depths 2, 4, 6, 8, 10, and 12 on the hash-train split; the index is fixed at 10 bits because each depth has at most 1,024 entries. Decode needs no network or remote fetch, but the decoder must ship the same frozen codebook; version it or old links break.",
    when: "Shines on openings people actually play. On the held-out validation split it lands near occupancy in the overall mean, but wins hard at plies 2 and 8 in the sampled checkpoints, where a short path is already small and occupancy still carries a full board.",
    examples: [
      {
        label: `${DEMO_SAN}, book hit`,
        code: "d-gAA",
        note: "Discriminator bit = hit, then depth id 0 and index 0 for e2e4e7e5. No packed suffix. Full URL length 25.",
      },
    ],
  },

  {
    id: "method-hybrid",
    method: "hybrid_min",
    how: "For each position, encode packed UCI, occupancy, and lookup, then keep the smallest of those three. A 2-bit mode tag rides in front of the winning payload. The decoder reads the tag and dispatches. This scoreboard hybrid includes lookup; a production-style hybrid without a codebook is only min(packed, occupancy).",
    when: "Wins across these tested positions and methods. Early games pick path or dictionary; later games pick occupancy. Mean URL falls to about 40 characters with a maximum of 60 characters in this sampled benchmark (an observed max, not a formal upper bound). The largest observed samples select a representation close to occupancy plus the mode tag.",
    examples: [
      {
        label: `${DEMO_SAN}, picks lookup`,
        code: "h-oAA",
        note: "Two-bit mode selects lookup. Shorter than packed path alone; much shorter than forcing occupancy.",
      },
      {
        label: "Sicilian ~19 plies, picks occupancy",
        code: "h-RA2z6yZ-jkQZDQRFREiMRmZupq5mc3sYAIBQ",
        note: "Mode selects occupancy. URL stays near 58 instead of a growing move path.",
      },
    ],
  },
];

/**
 * Tiny codebook sample for the method card: openings repeat.
 * Each depth has its own list of up to K = 1024 entries.
 * FEN trimmed to placement + side to move + castling + en passant.
 */
const LOOKUP_CODEBOOK_SAMPLE: {
  depth: number;
  index: number;
  uci: string;
  fen: string;
  label: string;
}[] = [
  {
    depth: 2,
    index: 0,
    uci: "e2e4e7e5",
    fen: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
    label: "Open game",
  },
  {
    depth: 2,
    index: 2,
    uci: "e2e4c7c5",
    fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
    label: "Sicilian",
  },
  {
    depth: 8,
    index: 0,
    uci: "e2e4c7c5g1f3d7d6d2d4c5d4f3d4g8f6",
    fen: "rnbqkb1r/pp2pppp/3p1n2/8/3NP3/8/PPP2PPP/RNBQKBNR w KQkq -",
    label: "Open Sicilian",
  },
];

/** Demo decode index so lookup/hybrid examples render the correct board. */
const DEMO_LOOKUP_INDEX = lookupBooksToIndex(
  LOOKUP_CODEBOOK_SAMPLE.reduce<Record<number, Record<string, number>>>(
    (books, row) => {
      books[row.depth] ??= {};
      books[row.depth]![row.uci] = row.index;
      return books;
    },
    {},
  ),
);

const resolveExamplePosition = (code: string) => {
  const research =
    parseResearchCode(code, { lookupIndex: DEMO_LOOKUP_INDEX }) ??
    parseResearchCode(code);
  if (research) {
    return {
      fen: research.fen,
      sideToMove: research.sideToMove,
      uci: research.uci,
    };
  }
  const parsed = parseCode(code);
  return {
    fen: parsed.fen,
    sideToMove: parsed.sideToMove,
    uci: parsed.uci,
  };
};

/** Prefer a playable product code when research lookup needs the codebook. */
const playableHrefForExample = (
  code: string,
  resolved: { fen: string; uci?: string },
) => {
  const product = parseCode(code);
  if (fenToBoard64(product.fen) === fenToBoard64(resolved.fen)) {
    return `/p/${code}`;
  }
  if (resolved.uci) return `/p/u-${resolved.uci}`;
  return `/p/${code}`;
};

/** Four codecs that make the state-vs-history crossover visible. */
const CROSSOVER_METHODS = [
  "packed_uci",
  "occupancy",
  "lookup_k1024",
  "hybrid_min",
] as const;

/** First scoreboard: story codecs only. trim_fen lives in the compact map. */
const BASELINE_METHODS = [
  "native_fen",
  "native_uci",
  "packed_uci",
  "occupancy",
  "naive_4bit",
  "gzip_uci",
  "gzip_fen",
] as const;

/** One-line gloss under scoreboard links. Avoids repeating title words. */
const METHOD_BLURB: Record<string, string> = {
  native_fen:
    "Keeps the whole printable board text so the decoder can reload any mid-game position.",
  native_uci:
    "Lists every ply from the start as from-to squares, readable as typed.",
  packed_uci:
    "Twelve bits per ply from the start, then padded into URL-safe characters.",
  occupancy:
    "Marks filled squares once, then names what sits on each, plus the clocks.",
  naive_4bit:
    "Assigns a fixed nibble to every square, empty or not, so length never changes.",
  gzip_uci:
    "Runs a general compressor on the move string, then expands bytes for the URL.",
  gzip_fen:
    "Runs a general compressor on the board string, then expands bytes for the URL.",
  lookup_k1024:
    "Replaces a familiar opening with a short index into a frozen codebook.",
  hybrid_min:
    "Tries three codecs and keeps whichever yields the shortest share link.",
};

const methodAnchorId = (method: string) =>
  METHOD_DETAILS.find((d) => d.method === method)?.id ?? `method-${method}`;

const METRIC_BAR = {
  bits: "bg-sky-500/70",
  chars: "bg-amber-500/70",
  url: "bg-emerald-500/70",
} as const;

const format = (n: number, digits = 1) => n.toFixed(digits);

/**
 * Compact stats label: mean ± σ [min–max].
 * ± is standard deviation (σ), not variance (σ²). Brackets = observed range.
 */
const formatSpreadStat = (spread: MetricSpread, digits = 0) => {
  const mean = format(spread.mean, digits);
  const hasStd = spread.std !== undefined && spread.std > 0;
  const hasRange =
    spread.min !== undefined &&
    spread.max !== undefined &&
    (spread.min !== spread.mean || spread.max !== spread.mean);
  const head = hasStd ? `${mean} ± ${format(spread.std!, 1)}` : mean;
  if (!hasRange) return head;
  return `${head} [${format(spread.min!, digits)}–${format(spread.max!, digits)}]`;
};

const metricSpread = (
  mean: number,
  min?: number,
  max?: number,
  std?: number,
): MetricSpread => ({ mean, min, max, std });

const heatmapStyle = (value: number, min: number, max: number) => {
  if (max <= min) {
    return { backgroundColor: "transparent" };
  }
  const t = (value - min) / (max - min);
  const green = Math.round(34 + (1 - t) * 120);
  const red = Math.round(34 + t * 160);
  return {
    backgroundColor: `rgba(${red}, ${green}, 52, 0.22)`,
  };
};

/** Scale a value into [0, 100]% of a track. */
const pctOf = (v: number, scaleMin: number, scaleMax: number) => {
  const span = scaleMax - scaleMin;
  if (span <= 0) return 0;
  return Math.min(100, Math.max(0, ((v - scaleMin) / span) * 100));
};

/**
 * Layered error band in a shared track:
 * tallest = min–max, mid = ±σ, shortest = mean (coloured).
 * Label sits left of the track; mean ± σ [min–max] overlays it.
 */
const MetricBarRow = ({
  label,
  spread,
  max,
  barClass,
  highlight = false,
}: {
  label: string;
  spread: MetricSpread;
  max: number;
  barClass: string;
  highlight?: boolean;
}) => {
  const scaleMax = Math.max(max, spread.max ?? spread.mean, 1);
  const meanPct = pctOf(spread.mean, 0, scaleMax);
  const minPct = pctOf(spread.min ?? spread.mean, 0, scaleMax);
  const maxPct = pctOf(spread.max ?? spread.mean, 0, scaleMax);
  const std = spread.std ?? 0;
  const stdLo = pctOf(Math.max(0, spread.mean - std), 0, scaleMax);
  const stdHi = pctOf(spread.mean + std, 0, scaleMax);
  const hasRange =
    spread.min !== undefined &&
    spread.max !== undefined &&
    spread.max > spread.min;
  const hasStd = std > 0;
  const stat = formatSpreadStat(spread, 0);

  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="w-10 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div
        className="relative h-5 flex-1 min-w-0 rounded-sm bg-muted/50"
        role="img"
        aria-label={`${label} mean ${format(spread.mean, 0)}${
          hasRange
            ? `, range ${format(spread.min!, 0)}–${format(spread.max!, 0)}`
            : ""
        }${hasStd ? `, σ ${format(std, 1)}` : ""}`}
      >
        {/* Tallest: min–max */}
        {hasRange ? (
          <div
            className="absolute inset-y-0 rounded-sm bg-foreground/12"
            style={{
              left: `${minPct}%`,
              width: `${Math.max(maxPct - minPct, 0.8)}%`,
            }}
            aria-hidden="true"
          />
        ) : null}
        {/* Mid height: ±σ */}
        {hasStd ? (
          <div
            className="absolute top-[12.5%] bottom-[12.5%] rounded-sm bg-foreground/20"
            style={{
              left: `${stdLo}%`,
              width: `${Math.max(stdHi - stdLo, 0.8)}%`,
            }}
            aria-hidden="true"
          />
        ) : null}
        {/* Shortest: mean */}
        <div
          className={`absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full ${barClass}`}
          style={{ width: `${Math.max(meanPct, 2)}%` }}
          aria-hidden="true"
        />
        <span
          className={`absolute inset-y-0 right-0 z-10 flex items-center px-1.5 font-mono text-[11px] leading-none tabular-nums pointer-events-none [text-shadow:0_0_3px_var(--background),0_0_6px_var(--background),0_1px_0_var(--background)] ${
            highlight ? "font-semibold text-foreground" : "text-foreground"
          }`}
          aria-hidden="true"
        >
          {stat}
        </span>
      </div>
    </div>
  );
};

/** Compact layered band for table cells (phase / appendix). */
const ErrorBand = ({
  spread,
  scaleMin,
  scaleMax,
  className = "",
}: {
  spread: MetricSpread;
  scaleMin: number;
  scaleMax: number;
  className?: string;
}) => {
  const meanPct = pctOf(spread.mean, scaleMin, scaleMax);
  const minPct = pctOf(spread.min ?? spread.mean, scaleMin, scaleMax);
  const maxPct = pctOf(spread.max ?? spread.mean, scaleMin, scaleMax);
  const std = spread.std ?? 0;
  const stdLo = pctOf(
    Math.max(scaleMin, spread.mean - std),
    scaleMin,
    scaleMax,
  );
  const stdHi = pctOf(
    Math.min(scaleMax, spread.mean + std),
    scaleMin,
    scaleMax,
  );
  const hasRange =
    spread.min !== undefined &&
    spread.max !== undefined &&
    spread.max > spread.min;
  const hasStd = std > 0;

  return (
    <div
      className={`relative h-3.5 w-full min-w-[3.5rem] rounded-sm bg-muted/40 ${className}`}
      role="img"
      aria-label={`Range ${spread.min ?? spread.mean} to ${spread.max ?? spread.mean}, mean ${spread.mean}${hasStd ? `, σ ${std}` : ""}`}
    >
      {hasRange ? (
        <div
          className="absolute inset-y-0 rounded-sm bg-foreground/12"
          style={{
            left: `${minPct}%`,
            width: `${Math.max(maxPct - minPct, 0.8)}%`,
          }}
          aria-hidden="true"
        />
      ) : null}
      {hasStd ? (
        <div
          className="absolute top-[12.5%] bottom-[12.5%] rounded-sm bg-foreground/20"
          style={{
            left: `${stdLo}%`,
            width: `${Math.max(stdHi - stdLo, 0.8)}%`,
          }}
          aria-hidden="true"
        />
      ) : null}
      <div
        className="absolute top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/80"
        style={{ left: `${meanPct}%` }}
        aria-hidden="true"
      />
    </div>
  );
};

const PhaseCell = ({
  spread,
  scaleMin,
  scaleMax,
  heatMin,
  heatMax,
  meanOnly = false,
}: {
  spread: MetricSpread;
  scaleMin: number;
  scaleMax: number;
  heatMin: number;
  heatMax: number;
  meanOnly?: boolean;
}) => (
  <td
    className="py-2.5 px-2 align-middle"
    style={heatmapStyle(spread.mean, heatMin, heatMax)}
  >
    {meanOnly ? (
      <span className="block font-mono tabular-nums text-xs leading-tight text-right">
        {format(spread.mean, 0)}
      </span>
    ) : (
      <div className="flex flex-col items-end gap-1">
        <span className="font-mono tabular-nums text-xs leading-tight text-right">
          {formatSpreadStat(spread, 0)}
        </span>
        <ErrorBand spread={spread} scaleMin={scaleMin} scaleMax={scaleMax} />
      </div>
    )}
  </td>
);

const MethodNameLink = ({
  method,
  label,
  showBlurb = false,
}: {
  method: string;
  label: string;
  showBlurb?: boolean;
}) => {
  const blurb = showBlurb ? METHOD_BLURB[method] : undefined;
  return (
    <div className={blurb ? "space-y-1" : undefined}>
      <a
        href={`#${methodAnchorId(method)}`}
        className="font-medium underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`${label}, jump to explanation`}
      >
        {label}
      </a>
      {blurb ? (
        <p className="text-xs text-muted-foreground leading-snug">
          {blurb}
        </p>
      ) : null}
    </div>
  );
};

/**
 * Prose stays max-w-3xl; scoreboard tables may use up to max-w-5xl.
 * Horizontal scroll only when the viewport is narrower than the table floor.
 */
const WideTableScroll = ({ children }: { children: React.ReactNode }) => (
  <div className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 px-4 overflow-x-auto">
    <div className="mx-auto w-full max-w-5xl">{children}</div>
  </div>
);

const LookupCodebookSample = () => (
  <figure className="space-y-2">
    <figcaption className="text-sm font-medium">
      Codebook sample: a few frequent prefixes
    </figcaption>
    <p className="text-sm text-muted-foreground">
      Index <span className="font-mono text-foreground">0</span> is the most
      common prefix at that depth. The decoder replays the stored UCI. Each depth
      has its own list of up to <span className="font-mono text-foreground">K = 1024</span>{" "}
      entries; these three rows are enough to see that openings repeat.
    </p>
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full min-w-xl text-sm border-collapse">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-2 font-medium">Depth</th>
            <th className="py-2 pr-2 font-medium">Idx</th>
            <th className="py-2 pr-2 font-medium">Opening</th>
            <th className="py-2 pr-2 font-medium">UCI prefix</th>
            <th className="py-2 font-medium">FEN</th>
          </tr>
        </thead>
        <tbody>
          {LOOKUP_CODEBOOK_SAMPLE.map((row) => (
            <tr
              key={`${row.depth}-${row.index}`}
              className="border-b border-border/60 align-top"
            >
              <td className="py-2 pr-2 font-mono tabular-nums">{row.depth}</td>
              <td className="py-2 pr-2 font-mono tabular-nums">{row.index}</td>
              <td className="py-2 pr-2 whitespace-nowrap">{row.label}</td>
              <td className="py-2 pr-2 font-mono text-xs break-all">
                {row.uci}
              </td>
              <td className="py-2 font-mono text-xs break-all text-muted-foreground">
                {row.fen}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </figure>
);

const MethodExplainBlock = ({
  detail,
  row,
}: {
  detail: MethodDetail;
  row: ScoreRow | undefined;
}) => (
  <details
    id={detail.id}
    className="scroll-mt-24 group border-t border-border/70 py-4 first:border-t-0"
  >
    <summary className="cursor-pointer list-none marker:content-none flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm">
      <span className="font-serif text-xl tracking-tight text-balance">
        <span className="text-muted-foreground mr-2 group-open:hidden" aria-hidden="true">
          +
        </span>
        <span className="text-muted-foreground mr-2 hidden group-open:inline" aria-hidden="true">
          −
        </span>
        {row?.label ?? detail.method}
      </span>
      {row ? (
        <span className="text-sm text-muted-foreground font-mono tabular-nums">
          {format(row.url, 0)} mean URL chars
        </span>
      ) : null}
    </summary>
    <div className="mt-4 space-y-3">
      <p>{detail.how}</p>
      <p className="text-muted-foreground">{detail.when}</p>
      {detail.id === "method-lookup" ? <LookupCodebookSample /> : null}
      <div className="space-y-5">
        {detail.examples.map((ex) => {
          const resolved = resolveExamplePosition(ex.code);
          const href = playableHrefForExample(ex.code, resolved);
          const url = `https://chss.chat/p/${ex.code}`;
          return (
            <figure
              key={`${detail.id}-${ex.label}-${ex.code}`}
              className="flex items-start gap-4"
            >
              <Link
                href={href}
                className="shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={`${ex.label}. Open this position in chss.chat.`}
              >
                <ResearchExampleBoard
                  fen={resolved.fen}
                  perspective={resolved.sideToMove}
                  label={`Board for ${ex.label}`}
                />
              </Link>
              <div className="min-w-0 flex-1 space-y-1.5 pt-0.5">
                <figcaption className="text-sm font-medium">{ex.label}</figcaption>
                <Link
                  href={href}
                  className="block break-all font-mono text-sm leading-snug text-foreground underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {url}
                </Link>
                {ex.note ? (
                  <p className="text-sm text-muted-foreground">{ex.note}</p>
                ) : null}
              </div>
            </figure>
          );
        })}
      </div>
    </div>
  </details>
);

type BoardStatePieceIcon = typeof PawnIcon;
type BoardStateCell =
  | { kind: "empty" }
  | { kind: "piece"; color: "w" | "b"; Icon: BoardStatePieceIcon };

const BOARD_STATE_BLACK_PIECES: BoardStatePieceIcon[] = [
  KingIcon,
  QueenIcon,
  RookIcon,
  BishopIcon,
  KnightIcon,
  PawnIcon,
];
const BOARD_STATE_WHITE_PIECES: BoardStatePieceIcon[] = [
  KingIcon,
  QueenIcon,
  RookIcon,
  BishopIcon,
  KnightIcon,
  PawnIcon,
];
const BOARD_STATE_GRID: BoardStateCell[][] = [
  [
    { kind: "empty" },
    ...BOARD_STATE_BLACK_PIECES.map((Icon) => ({
      kind: "piece" as const,
      color: "b" as const,
      Icon,
    })),
  ],
  [
    { kind: "empty" },
    ...BOARD_STATE_WHITE_PIECES.map((Icon) => ({
      kind: "piece" as const,
      color: "w" as const,
      Icon,
    })),
  ],
];

/** Legend board: every piece type once per colour, plus empty squares. */
const BoardStateDiagram = () => {
  const grid = BOARD_STATE_GRID;

  return (
    <figure className="my-6">
      <div
        className="inline-grid grid-cols-7 border border-border overflow-hidden rounded-none"
        role="img"
        aria-label="Diagram showing empty squares and every chess piece type in white and black"
      >
        {grid.map((rank, ri) =>
          rank.map((cell, fi) => {
            const isLight = (ri + fi) % 2 === 0;
            return (
              <div
                key={`${ri}-${fi}`}
                className={`size-10 sm:size-12 flex items-center justify-center ${
                  isLight ? "bg-stone-200" : "bg-stone-500"
                }`}
              >
                {cell.kind === "piece" ? (
                  <cell.Icon
                    className={`block w-[68%] h-[68%] ${
                      cell.color === "w"
                        ? "text-stone-50 drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]"
                        : "text-stone-950"
                    }`}
                  />
                ) : null}
              </div>
            );
          }),
        )}
      </div>
      <figcaption className="mt-3 text-sm text-muted-foreground max-w-lg">
        Empty squares and every piece type, once per colour.
      </figcaption>
    </figure>
  );
};

export default function CompressionResearchPage() {
  const table = scoreboard.summary_table as ScoreRow[];
  const byPly = (scoreboard as { by_ply?: Record<string, Record<string, PhaseRow>> })
    .by_ply;
  const meta = scoreboard.meta;

  /** Prefer real min/max/σ; fall back to spread across ply buckets until regen lands. */
  const enrichSpread = (
    method: string,
    metric: "bits" | "chars" | "url",
    mean: number,
    min?: number,
    max?: number,
    std?: number,
  ): MetricSpread => {
    if (min !== undefined && max !== undefined && std !== undefined) {
      return { mean, min, max, std };
    }
    const plyRows = byPly?.[method];
    if (!plyRows) return { mean, min, max, std };
    const vals = Object.values(plyRows).map((r) => r[metric]);
    if (vals.length === 0) return { mean, min, max, std };
    const plyMin = Math.min(...vals);
    const plyMax = Math.max(...vals);
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    const variance =
      vals.reduce((a, b) => a + (b - avg) ** 2, 0) / vals.length;
    return {
      mean,
      min: min ?? plyMin,
      max: max ?? plyMax,
      std: std ?? Math.sqrt(variance),
    };
  };

  const bestUrl = Math.min(...table.map((r) => r.url));
  let bestBaselineUrl = Number.POSITIVE_INFINITY;
  for (const r of table) {
    if (!(BASELINE_METHODS as readonly string[]).includes(r.method)) continue;
    if (r.url < bestBaselineUrl) bestBaselineUrl = r.url;
  }
  const maxUrl = Math.max(
    ...table.map((r) =>
      Math.max(r.url, enrichSpread(r.method, "url", r.url, r.url_min, r.url_max, r.url_std).max ?? r.url),
    ),
  );
  const maxBitsScale = Math.max(
    ...table.map((r) =>
      Math.max(
        r.bits,
        enrichSpread(r.method, "bits", r.bits, r.bits_min, r.bits_max, r.bits_std).max ??
          r.bits,
      ),
    ),
  );
  const maxCharsScale = Math.max(
    ...table.map((r) =>
      Math.max(
        r.chars,
        enrichSpread(r.method, "chars", r.chars, r.chars_min, r.chars_max, r.chars_std)
          .max ?? r.chars,
      ),
    ),
  );
  const nativeUrl =
    table.find((r) => r.method === "native_fen")?.url ??
    table.find((r) => r.family === "raw")?.url ??
    100;
  const occupancyUrl =
    table.find((r) => r.method === "occupancy")?.url ?? 57;
  const perGameTable = (
    scoreboard as { summary_table_per_game?: ScoreRow[] }
  ).summary_table_per_game;
  const bestPerGameUrl =
    perGameTable?.find((r) => r.method === "hybrid_min")?.url ??
    Math.min(...(perGameTable?.map((r) => r.url) ?? [bestUrl]));

  const crossoverTable = table.filter((row) =>
    (CROSSOVER_METHODS as readonly string[]).includes(row.method),
  );
  const crossoverUrlSpreads = CHECKPOINTS.map((p) => {
    const values = crossoverTable.map(
      (row) => byPly?.[row.method]?.[p.key]?.url ?? 0,
    );
    return {
      key: p.key,
      heatMin: Math.min(...values),
      heatMax: Math.max(...values),
    };
  });

  return (
    <main className="overflow-x-clip py-12 md:py-16 [font-family:var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif]">
      <div className="container mx-auto max-w-3xl px-4">
      <p className="text-sm text-muted-foreground mb-6">
        <Link
          href="/"
          className="underline underline-offset-2 hover:text-foreground"
        >
          chss.chat
        </Link>
        <span className="mx-2">/</span>
        research
      </p>

      <header className="space-y-4 mb-12">
        <p className="text-sm tracking-wide uppercase text-muted-foreground">
          Compression research · draft
        </p>
        <h1 className="font-serif text-5xl md:text-6xl leading-[1.05] tracking-tighter text-balance">
          How small can a chess share link get?
        </h1>
        <p className="text-lg text-muted-foreground text-pretty leading-relaxed">
          chss.chat shares a chess board as a link, with no account or database
          on the far side. You make a move, paste the URL into WhatsApp, and
          your friend sees the same game from the other side. That leaves one
          question: how short can the link become while still carrying the game
          with it?
        </p>
      </header>

      <article className="space-y-16 text-[1.05rem] leading-relaxed">
        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            Isn&apos;t a chess position just 64 squares?
          </h2>
          <p>
            That is the obvious starting point: 64 squares, each empty or
            occupied by one of six piece types in one of two colours. The
            picture looks complete.
          </p>
          <BoardStateDiagram />
          <p>
            Except the picture is not quite enough to resume the same game.
            Some rules depend on what happened before this moment, and that
            information is not painted on the squares.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            The board has invisible state
          </h2>
          <p>
            Put the pieces in the same places and two boards can still behave
            differently. Castling and en passant are the clearest examples: the
            boards replay what happened just before, or what becomes legal next.
            Side to move and the two move counters are harder to show visually,
            so those are named in text below.
          </p>
          <ExtraStateDemos />
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            Should we store the board, or the moves?
          </h2>
          <p>
            Watch how the two common representations evolve during a standard
            game, such as Morphy&apos;s Opera Game.
          </p>
          <FenUciMappingDemo />
          <p>
            The first string is <strong>FEN</strong>, the standard readable
            snapshot used by chess libraries. It records the pieces, whose turn
            it is, castling and en passant rights, and two move counters. Those
            extra fields are how the text preserves a game that the 64 squares
            cannot describe alone. Once every slash, space, and digit has to
            live in a URL, though, a FEN share averages about{" "}
            <span className="font-mono text-foreground">
              {format(nativeUrl, 0)}
            </span>{" "}
            characters in the held-out benchmark.
          </p>
          <p>
            FEN includes those fields for different reasons. Side to move,
            castling rights, and en passant can change which move is legal next.
            The halfmove clock carries the fifty-move rule, while the fullmove
            number preserves move numbering. Together they make one snapshot
            sufficient to restore the standard state used by chess software.
            Later, we will ask whether a more specialised encoding can derive
            any of that state instead of spelling it all out.
          </p>
          <p>
            The second string is the <strong>UCI move path</strong>: coordinate
            moves such as <code className="text-sm">e2e4e7e5…</code>. Replaying
            it from the starting board recovers the same state without writing
            each field separately. It begins wonderfully short, then grows with
            every move and preserves more history than a board preview needs.
          </p>
          <p>
            That early advantage is why paths remain in the comparison. For an
            opening or a short game, the move list can be smaller than a packed
            board. Later, its unbounded growth becomes the problem. This gives
            us two useful ideas to compress: the state we have now, or the route
            that brought us here.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            Packing the grid into bits
          </h2>
          <p>
            The most literal binary approach gives every square a four-bit cell
            for empty or a coloured piece type. That fixed grid costs 256 bits.
            The tested codec adds the same 27-bit meta block used by occupancy:
            side to move, castling, en passant, halfmove clock, and fullmove
            number. Its logical payload is therefore always 283 bits before the
            URL alphabet. It never adapts to how empty the board becomes.
          </p>
          <p>
            Most of the board is air, though, and that is where Occupancy +
            Pieces wins. A 64-bit mask marks which squares are filled; each
            occupied square then gets a four-bit piece. Empty costs one bit in
            the mask instead of four in the grid. The same FEN-complete meta
            rides at the end. Size now tracks piece count rather than ply count,
            so middlegames and endgames stay near the same URL length while path
            codecs keep growing.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            Generic compression does not save the day
          </h2>
          <p>
            gzip works best when it has enough material to find repeated patterns
            and enough payload to repay its own header. A chess share string
            gives it very little of either.
          </p>
          <p>
            Move lists do contain structure, but each individual share is too
            short for generic gzip to exploit efficiently. The header alone can
            outweigh the opening moves, and turning the compressed bytes into a
            URL-safe alphabet expands them again. Two coordinate moves become a
            longer link than the raw move string. gzip(FEN) produces the longest
            mean URL in this benchmark. It stays as a control so &quot;just gzip
            it&quot; has a measured answer: on these strings, gzip makes the
            pasteable URL longer.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            Fewer bits can still make a longer link
          </h2>
          <p>
            A codec has at least three lengths. Logical bits are the information
            written before padding. Payload characters are what survive a
            URL-safe alphabet, or raw ASCII for a plain move list. Full URL
            length includes the origin, route, and payload: the thing someone
            actually pastes into WhatsApp.
          </p>
          <p>
            Those three do not move in lockstep. A bitstream is first rounded to
            complete bytes. Unpadded Base64URL usually needs about four
            characters for every three bytes, with visible jumps at byte
            boundaries. Saving one or two logical bits may therefore save no
            characters at all.
          </p>
          <p>
            The alphabet matters too. Ordinary Base64 uses{" "}
            <code className="text-sm">+</code> and{" "}
            <code className="text-sm">/</code>, which are awkward in URL paths.
            Characters outside a conservative URL-safe alphabet may be
            percent-encoded, normalised, or treated differently across URL
            implementations. Packed rows use Base64URL (
            <code className="text-sm">-</code>/<code className="text-sm">_</code>
            ) so the payload stays path-safe.
          </p>
          <p>
            We score a complete share URL so the comparison stays concrete. The
            fixed route is scaffolding, not the research question. The same
            trade-offs apply to path segments, query params, QR codes, and other
            apps.
          </p>
          <p>
            If the score is characters rather than bits, a dense Unicode symbol
            can look like a cheat. The demo below shows why the displayed glyph,
            its code point, its encoded bytes, and what survives in a URL path
            can all disagree.
          </p>
          <UtfEncodingDemo />
          <p>
            One displayed glyph can occupy several bytes and many serialised URL
            characters. The alphabet is part of the codec, and every symbol comes
            with rules.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            What can the decoder infer?
          </h2>
          <p>
            Occupancy still writes a full FEN-complete meta block. Before seeing
            how that compares on the scoreboard, ask how much of that meta the
            decoder could recover from the pieces alone. A shorter state
            encoding can exploit what the current arrangement makes impossible.
            It cannot treat hidden state as if the pieces uniquely determine it.
            The paired boards near the beginning show exactly where that
            assumption fails.
          </p>
          <ul className="list-disc pl-5 space-y-3 text-muted-foreground">
            <li>
              <strong className="font-medium text-foreground">
                Castling rights are partly constrained.
              </strong>{" "}
              If a king or rook is absent from its home square, that castling
              right is certainly gone. If both have returned home, the board
              still cannot reveal whether they moved earlier. The encoder can
              omit impossible rights, but must distinguish the remaining cases.
            </li>
            <li>
              <strong className="font-medium text-foreground">
                En passant is usually impossible, but not always inferable.
              </strong>{" "}
              Pawn geometry and side to move sharply limit when a target square
              could exist. When the geometry permits one, identical pieces can
              still result from a one-square or two-square pawn move. The
              relevant detail of the previous move remains genuinely hidden.
            </li>
            <li>
              <strong className="font-medium text-foreground">
                Side to move is generally independent.
              </strong>{" "}
              Some arrangements constrain which side could legally move, but
              many are valid with either player to move. A general snapshot
              therefore needs to preserve the distinction.
            </li>
            <li>
              <strong className="font-medium text-foreground">
                Neither move counter has an exact answer on the board.
              </strong>{" "}
              The same pieces can appear after different numbers of quiet plies
              and at different fullmove numbers. Common values can receive
              shorter codes, but recovering the original values requires
              carrying equivalent information somewhere in the state payload.
            </li>
          </ul>
          <p>
            The useful saving is conditional: avoid bits when the board proves a
            value, and encode the ambiguity when it does not. Simply deleting a
            field produces a different state rather than a better compression
            of the same one. The first scoreboard therefore compares codecs that
            preserve the chosen target: a restorable FEN snapshot, including
            legal-move state and both counters. Occupancy carries its full meta
            block in that comparison.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            At ply 2, who should win?
          </h2>
          <p>
            Before the numbers: at two plies, should replaying{" "}
            <code className="text-sm">e2e4e7e5</code> beat carrying an entire
            board? Should occupancy already beat native FEN once empty squares
            cost one bit instead of four? And can gzip repay its header on a
            string this short?
          </p>
          <p>
            The benchmark samples positions from real Lichess games and measures
            the complete URL, not just the payload. Make a prediction, then read
            the means.
          </p>
          <WideTableScroll>
            <table className="w-full min-w-md text-sm border-collapse">
              <caption className="caption-top text-left text-muted-foreground mb-3">
                Checkpoint means from a random Lichess hash sample (
                {meta.games.toLocaleString()} games,{" "}
                {meta.positions.toLocaleString()} observations at plies{" "}
                {meta.ply_points.join(", ")}). Not full-game averages—chss.chat
                is DB-less, and a complete Lichess month is too large to score;
                a smaller draw reran to check stability before scaling N. Full
                URL includes{" "}
                <code className="text-xs">{meta.url_origin}</code>.
              </caption>
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium w-[38%]">Method</th>
                  <th className="py-2 pl-2 font-medium">
                    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={`inline-block size-2 rounded-sm ${METRIC_BAR.bits}`}
                          aria-hidden="true"
                        />
                        Bits
                      </span>
                      <span className="text-border" aria-hidden="true">
                        /
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={`inline-block size-2 rounded-sm ${METRIC_BAR.chars}`}
                          aria-hidden="true"
                        />
                        Chars
                      </span>
                      <span className="text-border" aria-hidden="true">
                        /
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className={`inline-block size-2 rounded-sm ${METRIC_BAR.url}`}
                          aria-hidden="true"
                        />
                        URL
                      </span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {FAMILY_ORDER.map((family) => {
                  const rows = table.filter(
                    (r) =>
                      r.family === family &&
                      (BASELINE_METHODS as readonly string[]).includes(r.method),
                  );
                  if (rows.length === 0) return null;
                  return (
                    <Fragment key={family}>
                      <tr className="border-b border-border/40 bg-muted/20">
                        <td
                          colSpan={2}
                          className="py-2 pr-3 text-xs font-medium tracking-wide text-muted-foreground"
                        >
                          {FAMILY_LABEL[family]}
                        </td>
                      </tr>
                      {rows.map((row) => (
                        <tr
                          key={row.method}
                          className="border-b border-border/60"
                        >
                          <td className="py-3 pr-3 align-middle">
                            <MethodNameLink
                              method={row.method}
                              label={row.label}
                              showBlurb
                            />
                          </td>
                          <td className="py-3 pl-2 align-middle">
                            <div className="flex flex-col gap-1.5">
                              <MetricBarRow
                                label="Bits"
                                spread={enrichSpread(
                                  row.method,
                                  "bits",
                                  row.bits,
                                  row.bits_min,
                                  row.bits_max,
                                  row.bits_std,
                                )}
                                max={maxBitsScale}
                                barClass={METRIC_BAR.bits}
                              />
                              <MetricBarRow
                                label="Chars"
                                spread={enrichSpread(
                                  row.method,
                                  "chars",
                                  row.chars,
                                  row.chars_min,
                                  row.chars_max,
                                  row.chars_std,
                                )}
                                max={maxCharsScale}
                                barClass={METRIC_BAR.chars}
                              />
                              <MetricBarRow
                                label="URL"
                                spread={enrichSpread(
                                  row.method,
                                  "url",
                                  row.url,
                                  row.url_min,
                                  row.url_max,
                                  row.url_std,
                                )}
                                max={maxUrl}
                                barClass={METRIC_BAR.url}
                                highlight={row.url === bestBaselineUrl}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              Overlay reads mean ± σ [min–max]. Tall band = observed min–max;
              mid band = ±σ; coloured bar = mean.
            </p>
          </WideTableScroll>
          <p>
            Occupancy lands around{" "}
            <span className="font-mono text-foreground">
              {format(occupancyUrl, 0)}
            </span>{" "}
            URL characters as a standalone mean, against roughly{" "}
            {format(nativeUrl, 0)} for native FEN. The fixed square-by-square
            encoding sits between those ideas and never adapts: every position
            costs the same. Packed paths win early and lose later. gzip loses
            throughout. Among the standalone codecs, occupancy has the shortest
            overall mean because it stores the current state without growing
            with the move count.
          </p>
          <p>
            Inference can trim some meta later. The next leap is different:
            move shared opening knowledge into the decoder so familiar prefixes
            need not be spelled out at all.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            What if the decoder already knows common openings?
          </h2>
          <p>
            Human openings repeat. Instead of spelling out a familiar first
            dozen moves, the URL can point to an opening the decoder already
            knows, then append only the unfamiliar suffix. The information still
            restores a full path, and therefore a full FEN state; the savings
            come from moving shared knowledge into the software.
          </p>
          <p>
            Think of the codebook as a row of small lookup tables, one for each
            opening depth. Here, depth counts plies, or individual turns by one
            player. Depth 2 means White and Black have each moved once; depth 12
            means six full moves have been played. A depth-2 table might contain{" "}
            <code className="text-sm">e2e4e7e5</code>, while a depth-8 table can
            name a much longer branch of the same opening.
          </p>
          <p>
            The letter <span className="font-mono text-foreground">K</span> sets
            how many of the most frequent prefixes each table may keep. The
            benchmark uses up to{" "}
            <a
              href="#method-lookup"
              className="font-mono text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={`K = ${meta.lookup_k}, jump to the lookup method details`}
            >
              K = {meta.lookup_k}
            </a>{" "}
            entries at each of depths {meta.lookup_depths.join(", ")}. Since{" "}
            <span className="font-mono text-foreground">2¹⁰ = 1024</span>, a
            10-bit index can select any entry in one table. The depth ID selects
            the table. Together, those two numbers tell the decoder which known
            sequence to replay.
          </p>
          <p>
            The encoder uses the longest prefix it finds, then packs any moves
            that came after it as a suffix. A dictionary miss stores the complete
            packed path instead. One discriminator bit tells the decoder which
            form it received. No network fetch is required, but the codebook must
            ship with the decoder and remain frozen or versioned, or old links
            break.
          </p>
          <p>
            Familiar lines such as <code className="text-sm">e2e4e7e5</code>, the
            Sicilian <code className="text-sm">e2e4c7c5</code>, and longer Open
            Sicilian stretches land in the book. Expand the lookup method card
            below for three concrete codebook rows.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            How far could a dictionary go?
          </h2>
          <p>
            The opening book suggests an extreme version of the same idea. If
            the decoder contained every possible position, the URL could be
            little more than an index. Common positions could receive the
            shortest indices, while rare positions would receive longer ones.
            That is the theoretical direction in which a frequency-aware codec
            points.
          </p>
          <p>
            The decoder would be doing most of the work. Tromp and Österlund
            estimate about{" "}
            <a
              href="https://github.com/tromp/ChessPositionRanking"
              className="underline underline-offset-2 hover:text-foreground"
            >
              4.8 × 10<sup>44</sup> legal chess positions
            </a>
            . Even if real games visit only a tiny fraction of them, a complete
            catalogue is far beyond anything a web client could sensibly ship.
          </p>
          <p>
            Our corpus shows where the smaller version stops paying. At depth 2,
            a 1,024-entry book covers essentially every observed opening prefix.
            By depth 8, more than 600,000 prefixes appear and the same book covers
            about a quarter of them by frequency. At depth 12, over 1.5 million
            appear and coverage falls below 5%. The first few moves repeat;
            middlegames quickly fan out.
          </p>
          <p>
            A full position database is therefore a useful limit, not a useful
            product. The practical design keeps the small, high-value opening
            book and falls back to packed moves or occupancy when a game leaves
            it. That combination is the hybrid in the next section.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            Where does history stop winning?
          </h2>
          <p>
            Paths start cheap and grow with every move. Board-state encodings
            stay relatively stable and may shrink after captures. Dictionaries
            help when openings are predictable. A hybrid that tries packed path,
            occupancy, and lookup, then keeps the smallest, rides the cheap side
            of that curve.
          </p>
          <p>
            Before the loop and the table: at ply 2, should lookup beat
            occupancy by a wide margin? By ply 32, should that answer reverse?
            Where do you expect the hybrid to sit relative to both?
          </p>
          <p className="text-sm text-muted-foreground">
            Morphy&apos;s Opera Game from the starting position through mate,
            with URL length for each ply. Held-out sample:{" "}
            {meta.games.toLocaleString()} games ·{" "}
            {meta.positions.toLocaleString()} positions at plies{" "}
            {meta.ply_points.join(", ")} · codebook from hash-train.
          </p>
          <UrlLengthLoopDemo />
          <p>
            Measured only at sampled checkpoints, the same pattern appears in
            the table. Early columns favour paths and lookup. Later columns
            favour occupancy. Hybrid hugs the cheaper explanation. Greener cells
            are shorter within each column.
          </p>
          <WideTableScroll>
            <table className="w-full min-w-lg text-sm border-collapse">
              <caption className="caption-top text-left text-muted-foreground mb-3">
                Mean URL length at plies {CHECKPOINTS.map((c) => c.ply).join(", ")}.
                Four codecs that show the crossover once dictionaries and hybrid
                selection are allowed.
              </caption>
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Method</th>
                  {CHECKPOINTS.map((p) => (
                    <th
                      key={p.key}
                      className="py-2 px-2 font-medium text-right"
                    >
                      {p.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {crossoverTable.map((row) => (
                  <tr key={row.method} className="border-b border-border/60">
                    <td className="py-2.5 pr-3">
                      <MethodNameLink method={row.method} label={row.label} />
                    </td>
                    {CHECKPOINTS.map((p) => {
                      const cell = byPly?.[row.method]?.[p.key];
                      const scale = crossoverUrlSpreads.find(
                        (s) => s.key === p.key,
                      );
                      return (
                        <PhaseCell
                          key={p.key}
                          spread={metricSpread(cell?.url ?? 0)}
                          scaleMin={0}
                          scaleMax={1}
                          heatMin={scale?.heatMin ?? 0}
                          heatMax={scale?.heatMax ?? 0}
                          meanOnly
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </WideTableScroll>
          <p className="text-muted-foreground">
            At ply 2, hybrid and lookup sit near 25 characters while occupancy
            still carries a full board near 60. By ply 32, occupancy and hybrid
            converge near 55, and packed paths have ballooned past 80. Opening
            history is cheap because it is short or familiar. Later, occupancy
            wins because the board no longer cares how many moves it took to get
            there.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            The hybrid keeps the cheapest explanation
          </h2>
          <p>
            Across sampled checkpoint positions, hybrid lands around{" "}
            <span className="font-mono text-foreground">
              {format(bestUrl, 0)}
            </span>{" "}
            URL characters versus roughly {format(nativeUrl, 0)} for native FEN.
            Equal-weighting games instead of checkpoint observations changes the
            hybrid mean only slightly, from about {format(bestUrl, 0)} to{" "}
            {format(bestPerGameUrl, 1)} characters.
          </p>
          <p>
            That is not proof of the shortest chess encoding possible. It is the
            best result among the practical methods tested here. The durable
            lesson is not one winning representation. The winning system chooses
            the cheapest truthful description for each case: a short path while
            history is cheap, a known opening when the codebook hits, and a
            board snapshot once the journey costs more than the destination.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            What to try next
          </h2>
          <ul className="list-disc pl-5 space-y-3 text-muted-foreground">
            <li>
              <strong className="font-medium text-foreground">Smarter paths.</strong>{" "}
              Rank each move among legal moves rather than storing source and
              destination squares.
            </li>
            <li>
              <strong className="font-medium text-foreground">
                Compressed move sequences.
              </strong>{" "}
              Measure whether UCI or PGN becomes more competitive once wrapped in
              Zstandard or Brotli as well as gzip. Raw gzip already loses on
              short share strings; a fuller bake-off would still keep the
              comparison honest.
            </li>
            <li>
              <strong className="font-medium text-foreground">Smarter snapshots.</strong>{" "}
              Use variable-length piece coding or rank legal board
              configurations. Flat position ranking may improve bounded or
              worst-case size; it does not automatically minimise
              frequency-weighted average length on real shares.
            </li>
            <li>
              <strong className="font-medium text-foreground">Smarter alphabets.</strong>{" "}
              Write directly into URL-safe six-bit symbols instead of padding
              through bytes.
            </li>
            <li>
              <strong className="font-medium text-foreground">Prior art and variants.</strong>{" "}
              Compare specialised position encodings from the literature, plus
              Chess960 and crazyhouse. The numbers would move. The same
              URL-safety and character-count constraints would still apply.
            </li>
          </ul>
          <p>
            The open question is not whether a shorter link exists in principle.
            It is which of these mechanisms still pays once every share must
            remain pasteable, self-contained, and truthful.
          </p>
        </section>

        <section className="space-y-5" aria-labelledby="method-compare-heading">
          <h2
            id="method-compare-heading"
            className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance"
          >
            A compact map of the bets
          </h2>
          <p>
            Each row is a bet about what to store. Expand a method for the
            mechanism and a real example link. Examples use{" "}
            <span className="font-medium text-foreground">{DEMO_SAN}</span>{" "}
            (<code className="text-sm">{DEMO_UCI}</code>) unless noted.
          </p>
          <WideTableScroll>
            <table className="w-full min-w-lg text-sm border-collapse">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Method</th>
                  <th className="py-2 pr-3 font-medium">Kind</th>
                  <th className="py-2 pr-3 font-medium text-right">
                    Mean full URL
                  </th>
                  <th className="py-2 pr-3 font-medium">Depends on</th>
                  <th className="py-2 font-medium">Keeps</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row) => {
                  const kind = METHOD_KIND[row.method];
                  return (
                    <tr key={row.method} className="border-b border-border/60">
                      <td className="py-2.5 pr-3">
                        <MethodNameLink
                          method={row.method}
                          label={row.label}
                        />
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground">
                        {kind?.kind ?? row.family}
                      </td>
                      <td className="py-2.5 pr-3 font-mono tabular-nums text-right">
                        {format(row.url, 0)}
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground">
                        {kind?.depends ?? "n/a"}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {kind?.keeps ?? "n/a"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </WideTableScroll>
          <div className="space-y-0">
            {METHOD_DETAILS.map((detail) => (
              <MethodExplainBlock
                key={detail.id}
                detail={detail}
                row={table.find((r) => r.method === detail.method)}
              />
            ))}
          </div>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            How chss.chat multiplexes formats
          </h2>
          <p>
            The compression question is which representation is smallest. The
            product question is how one app ships several of them behind one
            route. chss.chat answers that with a short letter prefix before the
            payload: <code className="text-sm">f-</code> for full FEN,{" "}
            <code className="text-sm">u-</code> for raw UCI,{" "}
            <code className="text-sm">t-</code> for trimmed FEN,{" "}
            <code className="text-sm">p-</code> for packed moves,{" "}
            <code className="text-sm">o-</code> for occupancy,{" "}
            <code className="text-sm">n-</code> for the naive 4-bit grid, and so
            on. The decoder reads the prefix and dispatches.
          </p>
          <p>
            Production today uses <code className="text-sm">f-</code> /{" "}
            <code className="text-sm">u-</code> and a no-codebook{" "}
            <code className="text-sm">h-</code> that keeps{" "}
            <code className="text-sm">min(packed, occupancy)</code>. The
            dictionary row and the scoreboard hybrid that also tries lookup are
            research codecs. Prefixes are dispatch, not the representation.
            Changing them is not the research question; finding the smallest
            trustworthy payload is.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            Reproduce the benchmark
          </h2>
          <p>
            The scoreboard is not a black box. Anyone can rebuild it from the
            public Lichess dump and the scripts in this repository. The product
            metric is pasteable URL length; the pipeline exists so that claim
            can be checked, not trusted.
          </p>
          <p>
            Full commands, disk estimates, and sampling details live in{" "}
            <a
              href="https://github.com/ghcpuman902/chss/tree/main/benchmark"
              className="underline underline-offset-2 hover:text-foreground"
            >
              benchmark/README.md
            </a>{" "}
            on{" "}
            <a
              href="https://github.com/ghcpuman902/chss"
              className="underline underline-offset-2 hover:text-foreground"
            >
              github.com/ghcpuman902/chss
            </a>
            . The short path is below.
          </p>

          <h3 className="font-serif text-xl tracking-tight pt-2">
            1. Clone and install
          </h3>
          <p className="text-muted-foreground">
            You need Python 3.11+,{" "}
            <code className="text-sm text-foreground">zstd</code> /
            <code className="text-sm text-foreground">zstdcat</code>, roughly
            30&nbsp;GB free disk, and about 5&nbsp;GB+ free RAM while the
            month is streaming.
          </p>
          <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-sm font-mono leading-snug">
            {`git clone https://github.com/ghcpuman902/chss.git
cd chss
python3 -m venv .venv-benchmark
.venv-benchmark/bin/pip install -r benchmark/requirements.txt`}
          </pre>

          <h3 className="font-serif text-xl tracking-tight pt-2">
            2. Download a Lichess month
          </h3>
          <p className="text-muted-foreground">
            Standard rated games are{" "}
            <a
              href="https://database.lichess.org/"
              className="underline underline-offset-2 hover:text-foreground"
            >
              CC0 on database.lichess.org
            </a>
            . The published table used June 2026 (~26&nbsp;GB compressed,
            86.5M games). Do not fully decompress it. The scripts stream with{" "}
            <code className="text-sm text-foreground">zstdcat</code>.
          </p>
          <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-sm font-mono leading-snug">
            {`mkdir -p data/standard
curl -L --continue-at - \\
  -o data/standard/lichess_db_standard_rated_2026-06.pgn.zst \\
  https://database.lichess.org/standard/lichess_db_standard_rated_2026-06.pgn.zst`}
          </pre>

          <h3 className="font-serif text-xl tracking-tight pt-2">
            3. Stream, convert, and split
          </h3>
          <p className="text-muted-foreground">
            One helper runs the three passes: full-month frequency aggregate,
            a 3% hash sample of games turned into compact UCI JSONL, then a
            deterministic train / validation / test split. On our machine (Apple M3
            Pro, 18&nbsp;GB), that corpus pipeline took about 1&nbsp;h&nbsp;45&nbsp;m
            wall time, roughly an hour for the aggregate and about 41&nbsp;minutes
            for the hash extract.
          </p>
          <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-sm font-mono leading-snug">
            {`bash benchmark/run_corpus.sh`}
          </pre>
          <p className="text-sm text-muted-foreground">
            Outputs land under{" "}
            <code className="text-xs text-foreground">
              data/standard/corpus/hash/
            </code>{" "}
            as zstd-compressed train / validation / test JSONL. Once those exist you
            can delete the raw{" "}
            <code className="text-xs text-foreground">.pgn.zst</code> to free
            ~26&nbsp;GB.
          </p>

          <h3 className="font-serif text-xl tracking-tight pt-2">
            4. Rebuild the scoreboard
          </h3>
          <p className="text-muted-foreground">
            Train the <span className="font-mono text-foreground">K = 1024</span>{" "}
            opening codebook on the train split, evaluate at
            plies 2 / 8 / 16 / 32 / 64 on the held-out validation split, and write
            the slim JSON the page reads.
          </p>
          <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-4 text-sm font-mono leading-snug">
            {`bash benchmark/run_scoreboard.sh

# same as:
.venv-benchmark/bin/python benchmark/url_length_benchmark.py \\
  --train data/standard/corpus/hash/2026-06.train.compact.jsonl.zst \\
  --eval data/standard/corpus/hash/2026-06.val.compact.jsonl.zst \\
  --out benchmark/results/url_length_hash_val.json \\
  --slim-out lib/compression-url-scoreboard.json`}
          </pre>
          <p>
            You should land near the same ranking: hybrid shortest among the
            tested methods, occupancy next among standalone state codecs, native
            FEN much longer. Approximate checkpoint means on this page are hybrid{" "}
            <span className="font-mono">{format(bestUrl, 0)}</span>, occupancy{" "}
            <span className="font-mono">{format(occupancyUrl, 0)}</span>, and
            native FEN{" "}
            <span className="font-mono">{format(nativeUrl, 0)}</span>. Exact
            floats can shift a little with toolchain versions; the order should
            not.
          </p>
          <p className="text-sm text-muted-foreground">
            Design notes and earlier bake-off logs:{" "}
            <code className="text-xs">doc/chess-url-compression.md</code>.
          </p>
        </section>
      </article>
      </div>
    </main>
  );
}
