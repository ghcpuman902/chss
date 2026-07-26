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
    keeps: "FEN-equivalent snapshot",
  },
  native_uci: {
    kind: "Path",
    depends: "Replay from start",
    keeps: "Full path from start",
  },
  trim_fen: {
    kind: "State",
    depends: "None beyond chess.js",
    keeps: "Playable snapshot",
  },
  packed_uci: {
    kind: "Path",
    depends: "Replay from start",
    keeps: "Full path from start",
  },
  occupancy: {
    kind: "State",
    depends: "None beyond chess.js",
    keeps: "Playable snapshot",
  },
  naive_4bit: {
    kind: "State",
    depends: "None beyond chess.js",
    keeps: "Playable snapshot",
  },
  gzip_uci: {
    kind: "Path",
    depends: "gzip + replay",
    keeps: "Full path from start",
  },
  gzip_fen: {
    kind: "State",
    depends: "gzip + chess.js",
    keeps: "FEN-equivalent snapshot",
  },
  lookup_k1024: {
    kind: "Frequency",
    depends: "Frozen codebook",
    keeps: "Full path from start",
  },
  hybrid_min: {
    kind: "Hybrid",
    depends: "Codebook if lookup wins",
    keeps: "Path or playable snapshot",
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
    how: "Stores the full FEN string, Base64URL-encoded, behind the production prefix f-. The decoder Base64URL-decodes and loads the position with chess.js. Identical to what chss.chat ships for arbitrary snapshots today.",
    when: "Use when you already have a mid-game FEN and no move path, or when interoperability with standard FEN matters. Every slash, space, field, and clock digit still has to pass through Base64URL.",
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
    how: "Appends raw UCI move text after u- with no further encoding. e2e4e7e5 is already URL-safe ASCII, so the payload is the move string itself. The decoder replays from the start position.",
    when: "Cheap and clear early in a game. Grows by four characters per ply (five on promotions), so deep middlegames and endgames become long paste targets. That is the production move-path format today.",
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
    how: "Same as native FEN, but drops the halfmove clock and fullmove number before Base64URL. Those fields matter for draw-claim clocks and move-number bookkeeping; most share previews can rebuild a playable board without them.",
    when: "A small win over full FEN when you insist on a state snapshot. Still text-shaped, so it never approaches the packed rows.",
    examples: [
      {
        label: DEMO_SAN,
        code: "t-cm5icWtibnIvcHBwcDFwcHAvOC80cDMvNFAzLzgvUFBQUDFQUFAvUk5CUUtCTlIgdyBLUWtxIC0",
        note: "Trimmed to board + side + castling + en passant. Saves a handful of characters vs f-.",
      },
    ],
  },
  {
    id: "method-packed-uci",
    method: "packed_uci",
    how: "A path again, but each move is 12 bits (from-square + to-square) plus 2 bits when a promotion appears. Because the decoder replays the board, it knows when a move must include a promotion choice. The bit stream is Base64URL-encoded behind p-.",
    when: "Wins while games are short. By ply 16, the packed path is already roughly level with occupancy on average. Hybrid exists largely to catch that crossover.",
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
    how: "A 64-bit occupancy mask (which squares are filled), then a 4-bit piece nibble per occupied square, then side-to-move, castling, and en passant. No move list. Prefix o-. Size tracks piece count, not ply count.",
    when: "Among the standalone codecs, occupancy has the shortest overall mean on this held-out validation scoreboard. Middlegames and endgames stay near the same URL length while path codecs keep growing. Weak only in the opening, where a short path or dictionary entry is smaller.",
    examples: [
      {
        label: DEMO_SAN,
        code: "o-EADv___vABBCNWMkEREREZmZmZnKveus-AA",
        note: "Still ~57 URL characters with 32 pieces. By ply 64, occupancy averages about 46 characters because captures have removed pieces.",
      },
    ],
  },
  {
    id: "method-naive-4bit",
    method: "naive_4bit",
    how: "Every square gets a fixed 4-bit cell (empty or coloured piece), plus nine bits of side to move, castling, and en passant. Always 265 bits before Base64URL. Prefix n-.",
    when: "A useful baseline for “store the grid literally.” Occupancy beats it because empty squares cost one bit in the mask instead of four in the grid. Included as a literal-grid baseline against which occupancy can be measured.",
    examples: [
      {
        label: DEMO_SAN,
        code: "n-QjVjJBERAREAAAAAAAAQAAAAkAAAAAAAmZkJmcq966z6gA",
        note: "Fixed 68-character URL on every position. Simple, never adaptive.",
      },
    ],
  },
  {
    id: "method-gzip-uci",
    method: "gzip_uci",
    how: "gzip the raw UCI ASCII string at maximum compression, then Base64URL the bytes behind g-. Same idea people reach for when a payload “should compress.”",
    when: "Almost always loses on share URLs. The gzip header alone is larger than a short opening path, and Base64URL expands the compressed bytes again. Even on long paths, generic gzip remains far behind the chess-aware packed representation in this benchmark.",
    examples: [
      {
        label: DEMO_SAN,
        code: "g-H4sIAAAAAAAC_0s1SjVJNU81BQCH6qitCAAAAA",
        note: "Two coordinate moves become a 60-character URL. Native u- was 30.",
      },
    ],
  },
  {
    id: "method-gzip-fen",
    method: "gzip_fen",
    how: "gzip the full FEN text, Base64URL, prefix z-. Same compressor tax as gzip(UCI), applied to a string that is already short and low-redundancy.",
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
    how: "Human openings repeat. A hit replaces familiar opening plies with a depth id and a 10-bit index, then appends any packed suffix. A miss stores the complete packed path. Every d- payload starts with one discriminator bit (1 = hit, 0 = miss), counted in both logical length and the Base64URL payload. The benchmark book keeps a separate list of up to K = 1024 prefixes at each of depths 2, 4, 6, 8, 10, and 12 on the hash-train split; the index is fixed at 10 bits because each depth has at most 1,024 entries. Decode needs no network or remote fetch, but the decoder must ship the same frozen codebook; version it or old links break.",
    when: "Shines on openings people actually play. On the held-out validation split it lands near occupancy in the overall mean, but wins hard at plies 2 and 8 in the sampled checkpoints, where a short path is already small and occupancy still carries a full board. Research-only prefix today; product decode does not yet ship the book.",
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
    how: "For each position, encode packed UCI, occupancy, and lookup, then keep the smallest of those three. A 2-bit mode tag rides in front of the winning payload under h-. The decoder reads the tag and dispatches. This scoreboard hybrid includes lookup; production h- today is only min(packed, occupancy), with no codebook.",
    when: "Wins across these tested positions and methods. Early games pick path or dictionary; later games pick occupancy. Mean URL falls to about 39 characters with a maximum of 57 characters in this sampled benchmark (an observed max, not a formal upper bound). The largest observed samples select a representation close to occupancy plus the mode tag.",
    examples: [
      {
        label: `${DEMO_SAN}, picks lookup`,
        code: "h-oAA",
        note: "Two-bit mode selects lookup. Shorter than p- alone; much shorter than forcing occupancy.",
      },
      {
        label: "Sicilian ~18 plies, picks occupancy",
        code: "h-RAW92lr8jkQRUYRExESIxmZupuZnK3OgAA",
        note: "Mode selects occupancy. URL stays near 56 instead of a 60+ character move path.",
      },
    ],
  },
];

const METHOD_PREFIX: Record<string, string> = {
  native_fen: "f-",
  native_uci: "u-",
  trim_fen: "t-",
  packed_uci: "p-",
  occupancy: "o-",
  naive_4bit: "n-",
  gzip_uci: "g-",
  gzip_fen: "z-",
  lookup_k1024: "d-",
  hybrid_min: "h-",
};

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
}: {
  method: string;
  label: string;
}) => (
  <a
    href={`#${methodAnchorId(method)}`}
    className="font-medium underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    aria-label={`${label}, jump to explanation`}
  >
    {label}
  </a>
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
          {format(row.url, 0)} mean URL chars ·{" "}
          <code className="text-foreground">
            {METHOD_PREFIX[detail.method] ?? "?"}
          </code>
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
    table.find((r) => r.method === "occupancy")?.url ?? 54;
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
    <main className="container mx-auto max-w-3xl px-4 py-12 md:py-16 [font-family:var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif]">
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
          You make a move. You want to send the board to a friend. The URL has
          to carry a legal position through WhatsApp with no database on the
          far side. Pasteable. Self-contained. As short as we can honestly make
          it.
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
            Except the board is hiding things from us. Whose side it is to move.
            Whether each side may still castle. Whether an en passant capture
            is legal this ply. That state is not painted on the squares. It
            depends on how the game arrived here.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            The board has invisible state
          </h2>
          <p>
            For encoding, three nested levels of &quot;the position&quot; matter:
          </p>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>
              <strong className="font-medium text-foreground">Playable position.</strong>{" "}
              Placement, side to move, castling rights, and en passant. Enough
              for legal replies. Trimmed FEN and occupancy aim here.
            </li>
            <li>
              <strong className="font-medium text-foreground">FEN-equivalent snapshot.</strong>{" "}
              Playable state plus the halfmove clock and fullmove number. Full
              FEN lives here.
            </li>
            <li>
              <strong className="font-medium text-foreground">Exact continuing game history.</strong>{" "}
              A path of moves from the start. Enough to recover repetition claims
              and automatic draw outcomes that a mid-game snapshot alone cannot.
            </li>
          </ul>
          <p>
            Tap a board below to open that position in chss.chat. A move path
            can reconstruct some of this automatically. A snapshot has to carry
            it explicitly.
          </p>
          <ExtraStateDemos />
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            Should we store the board, or the moves?
          </h2>
          <p>
            Two familiar building blocks sit side by side. Scrub through
            Morphy&apos;s Opera Game: FEN rewrites the whole state each ply; a
            UCI-style path only appends the next coordinate move.
          </p>
          <FenUciMappingDemo />
          <p>
            FEN is readable <strong>state</strong>. Every chess library speaks
            it. Put it behind <code className="text-sm">f-</code>,
            Base64URL-encoded, and you have a snapshot. That is what chss.chat
            ships for arbitrary positions today. Readability costs bytes. Every
            slash, space, field, and clock digit still has to pass through
            Base64URL. Trimmed FEN drops the halfmove and fullmove fields and
            saves a handful. On the held-out validation scoreboard, native FEN
            still averages about{" "}
            <span className="font-mono text-foreground">
              {format(nativeUrl, 0)}
            </span>{" "}
            characters for a complete{" "}
            <code className="text-sm text-foreground">chss.chat/p/…</code> URL.
          </p>
          <p>
            A UCI-style path is the <strong>move path</strong>: concatenated
            coordinate moves such as <code className="text-sm">e2e4e7e5…</code>.
            The decoder replays from the start. Early in a game that is almost
            free. Native <code className="text-sm">u-</code> is already
            URL-safe ASCII. Packed <code className="text-sm">p-</code> squeezes
            each move into 12 bits (plus promotion bits) and Base64URL-encodes
            the stream.
          </p>
          <p>
            Path encodings win while games are short. By ply 16, packed history
            and occupancy are roughly level on average; after that, the growing
            path falls behind quickly. That crossover is why a hybrid encoder
            exists. Both native formats are still text-shaped, though. The next
            bets pack the same ideas into bits.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            Can we just assign every square four bits?
          </h2>
          <p>
            Sure. Empty or a coloured piece type fits in a nibble. Add a few
            bits for side to move, castling, and en passant. Always 265 bits
            before Base64URL. Simple. Never adaptive. Prefix{" "}
            <code className="text-sm">n-</code>.
          </p>
          <p>
            Then notice the empty squares. Most of the board is air. A 64-bit
            occupancy mask says which squares are filled; each occupied square
            then gets a 4-bit piece. Empty costs one bit in the mask instead of
            four in the grid. That is Occupancy + Pieces (
            <code className="text-sm">o-</code>). Size tracks piece count, not
            ply count. Middlegames and endgames stay near the same URL length
            while path codecs keep growing.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            Surely gzip can make it smaller?
          </h2>
          <p>
            gzip works best when it has enough material to find repeated
            patterns and enough payload to repay its own header.
          </p>
          <p>
            A chess share payload gives gzip very little room to do that. UCI
            paths do contain structure, but each individual share string is too
            short for generic gzip to exploit efficiently. The gzip header alone
            can outweigh the opening moves, and Base64URL expands the compressed
            bytes again before they sit in a URL. Two coordinate moves become a
            longer link than native <code className="text-sm">u-</code>.{" "}
            gzip(FEN) produces the longest mean URL in this benchmark. Kept as a
            control so &quot;just gzip it&quot; has a measured answer: on these
            strings, gzip makes the pasteable URL longer.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            Fewer bits can still make a longer link
          </h2>
          <p>
            A codec has at least three lengths. Logical bits are the information
            written before padding. Payload characters are what survive
            Base64URL, or raw ASCII for native UCI. Full URL length includes the
            origin, route, prefix, and payload: the thing someone actually pastes
            into WhatsApp.
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
            For a product like chss.chat, the third length is the target. We
            score a complete share URL so the comparison stays concrete. The
            fixed route and short codec prefixes are dispatch, not wasted
            payload. Changing them is not the research question. The same
            trade-offs apply to path segments, query params, QR codes, and other
            apps.
          </p>
          <p>
            If the score is characters rather than bits, a dense Unicode symbol
            looks like a cheat code. Try it.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            Can Unicode cheat the scoreboard?
          </h2>
          <p>
            How many bits should one character hold? Pick a symbol below. Watch
            the displayed glyph, its code point, the UTF-8 bytes, the UTF-16
            code units, and what survives serialisation in a URL path. A visible
            character, its code point, its encoded bytes, and percent-encoding
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
            What if the decoder already knows common openings?
          </h2>
          <p>
            Human openings repeat. Instead of spelling out a familiar first
            dozen moves, the URL can point to an opening the decoder already
            knows, then append only the unfamiliar suffix.
          </p>
          <p>
            The benchmark builds a separate list of up to{" "}
            <span className="font-mono text-foreground">K = {meta.lookup_k}</span>{" "}
            prefixes at each of depths {meta.lookup_depths.join(", ")}. A
            dictionary hit stores the depth, index, and packed suffix. A miss
            stores the complete packed path. One discriminator bit tells the
            decoder which form it received. Prefix{" "}
            <code className="text-sm">d-</code>.
          </p>
          <p>
            No database or remote fetch is needed, but the codebook must ship
            with the decoder and remain frozen or versioned. The URL gets shorter
            by moving shared knowledge into the software; the link itself does
            not carry the dictionary. Research-only prefix today; product decode
            does not yet ship the book. The book contains familiar prefixes such
            as <code className="text-sm">e2e4e7e5</code>, the Sicilian{" "}
            <code className="text-sm">e2e4c7c5</code>, and longer recurring lines
            such as an Open Sicilian. Expand the lookup method card below for
            three concrete codebook rows.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            Where does history stop winning?
          </h2>
          <p>
            Before seeing the numbers, make a bet. At ply 2, should we describe
            the entire board or replay two moves? At ply 64, should we replay the
            whole move path or record the pieces that remain?
          </p>
          <p>
            Path-based encodings start cheap and grow with every move.
            Board-state encodings stay relatively stable and may shrink after
            captures. Dictionaries help when openings are predictable. A hybrid
            that encodes packed path, occupancy, and lookup, then keeps the
            smallest of those three, should ride the cheap side of that curve.
          </p>
          <p className="text-sm text-muted-foreground">
            Demo: Morphy&apos;s Opera Game from the starting position through
            mate, with URL length for each ply. Held-out sample:{" "}
            {meta.games.toLocaleString()} games ·{" "}
            {meta.positions.toLocaleString()} positions at plies{" "}
            {meta.ply_points.join(", ")} · codebook from hash-train.
          </p>
          <UrlLengthLoopDemo />
          <p>
            Same codecs, measured only at sampled checkpoints. Early columns
            favour paths and lookup. Later columns favour occupancy. Hybrid hugs
            the cheaper explanation. Cell tint: greener = shorter in that column.
          </p>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full min-w-[32rem] text-sm border-collapse">
              <caption className="caption-top text-left text-muted-foreground mb-3">
                Mean URL length at plies {CHECKPOINTS.map((c) => c.ply).join(", ")}.
                Four codecs that show the crossover. Full distributions live in
                the aggregate scoreboard below.
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
          </div>
          <p className="text-muted-foreground">
            At ply 2, hybrid and lookup sit near 25 characters while occupancy
            still carries a full board near 57. By ply 32, occupancy and hybrid
            converge near 52, and packed paths have ballooned past 80. The
            crossover is now visible. Opening history is cheap because it is
            short or familiar. Later, occupancy wins because the board no longer
            cares how many moves it took to get there. Lookup shadows the hybrid
            in the opening, then occupancy takes over as the path diverges from
            familiar openings and paths grow.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            The hybrid keeps the cheapest explanation
          </h2>
          <p>
            This benchmark is not a proof of the shortest chess encoding
            possible. It compares a practical family of state, path, dictionary,
            and hybrid approaches on sampled positions from real games. Across
            sampled checkpoint positions, hybrid lands around{" "}
            <span className="font-mono text-foreground">
              {format(bestUrl, 0)}
            </span>{" "}
            URL characters versus roughly {format(nativeUrl, 0)} for native FEN.
            Among the standalone codecs, occupancy has the shortest overall mean
            at about{" "}
            <span className="font-mono text-foreground">
              {format(occupancyUrl, 0)}
            </span>
            .{" "}
            <span className="text-muted-foreground">
              Equal-weighting games instead of checkpoint observations changes
              the hybrid mean only slightly, from about {format(bestUrl, 0)} to{" "}
              {format(bestPerGameUrl, 1)} characters.
            </span>
          </p>
          <p>
            Production today uses <code className="text-sm">f-</code> /{" "}
            <code className="text-sm">u-</code> and a no-codebook{" "}
            <code className="text-sm">h-</code> (
            <code className="text-sm">min(packed, occupancy)</code>). The{" "}
            <code className="text-sm">d-</code> row and the scoreboard hybrid
            that also tries lookup are research codecs.
          </p>

          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full min-w-[28rem] text-sm border-collapse">
              <caption className="caption-top text-left text-muted-foreground mb-3">
                Mean across sampled checkpoint positions. Full URL includes{" "}
                <code className="text-xs">{meta.url_origin}</code>; these are
                not averages over complete games.
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
                  const rows = table.filter((r) => r.family === family);
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
                                highlight={row.url === bestUrl}
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
          </div>
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
            (<code className="text-sm">{DEMO_UCI}</code>) unless noted. Mean
            full URL is the corpus checkpoint average; bits and payload lengths
            live in the aggregate scoreboard above.
          </p>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full min-w-[32rem] text-sm border-collapse">
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
          </div>
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
            One position, several truthful descriptions
          </h2>
          <p>
            Native FEN describes the destination in readable text. A move path
            describes how we got there. Occupancy ignores the path and records
            only what remains. A dictionary recognises a familiar route.
          </p>
          <p>
            The hybrid wins because it does not insist that one description must
            always be best. Early positions are cheap as history; later positions
            are cheap as state; familiar openings are cheap as references.
            Compression here is choosing the cheapest truthful explanation for
            each position.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            What should we try next?
          </h2>
          <ul className="list-disc pl-5 space-y-3 text-muted-foreground">
            <li>
              <strong className="font-medium text-foreground">Smarter paths.</strong>{" "}
              Rank each move among legal moves rather than storing source and
              destination squares.
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
            You should land near the same ranking: hybrid around{" "}
            <span className="font-mono">{format(bestUrl, 0)}</span> URL
            characters as a checkpoint mean, occupancy around{" "}
            <span className="font-mono">{format(occupancyUrl, 0)}</span>,
            native FEN around{" "}
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
    </main>
  );
}
