import type { Metadata } from "next";
import Link from "next/link";
import scoreboard from "@/lib/compression-url-scoreboard.json";
import { BishopIcon, KingIcon, KnightIcon, PawnIcon, QueenIcon, RookIcon } from "@/components/pieces";
import { ExtraStateDemos } from "@/components/research/extra-state-demos";
import { FenUciMappingDemo } from "@/components/research/fen-uci-mapping-demo";
import { ResearchExampleBoard } from "@/components/research/research-example-board";
import { UrlLengthLoopDemo } from "@/components/research/url-length-loop-demo";
import { UtfEncodingDemo } from "@/components/research/utf-encoding-demo";
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

const PHASES = [
  { key: "opening" as const, label: "Opening ≤8" },
  { key: "early" as const, label: "Early 9-24" },
  { key: "middlegame" as const, label: "Mid 25-40" },
  { key: "late" as const, label: "Late 41+" },
];

const FAMILY_ORDER = ["raw", "packed", "gzip", "lookup", "hybrid"] as const;

const FAMILY_LABEL: Record<string, string> = {
  raw: "Raw / native",
  packed: "Packed binary → Base64URL",
  gzip: "gzip → Base64URL",
  lookup: "Lookup table",
  hybrid: "Hybrid",
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
    how: "Stores the full FEN string, Base64URL-encoded, behind the production prefix f-. The decoder base64-decodes and loads the position with chess.js. Readable after decode, and identical to what chss.chat ships for arbitrary snapshots today.",
    when: "Use when you already have a mid-game FEN and no move history, or when you want a format humans can inspect with a base64 decoder. Pays for that convenience: every slash, space, and clock digit becomes URL characters.",
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
    when: "Cheap and clear early in a game. Grows by four characters per ply (five on promotions), so deep middlegames and endgames become long paste targets. That is the production history path today.",
    examples: [
      {
        label: DEMO_SAN,
        code: `u-${DEMO_UCI}`,
        note: "30 characters for the full URL. Same idea at ply 16 is already past 60.",
      },
      {
        label: "Italian, 6 plies",
        code: "u-e2e4e7e5g1f3b8c6f1c4g8f6",
        note: "Still readable. Length tracks history, not board complexity.",
      },
    ],
  },
  {
    id: "method-trim-fen",
    method: "trim_fen",
    how: "Same as native FEN, but drops the halfmove clock and fullmove number before Base64URL. Those fields matter for the fifty-move rule and PGN move numbers; most share previews can rebuild a playable board without them.",
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
    how: "History again, but each move is 12 bits (from-square + to-square) plus 2 bits when a promotion appears. The bit stream is Base64URL-encoded behind p-. The decoder walks the same path native UCI would, with far fewer characters.",
    when: "Wins while games are short. Around ply 15–16 the growing path usually loses to a fixed-size occupancy snapshot. Hybrid exists largely to catch that crossover.",
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
    when: "Best single practical codec on the full scoreboard. Middlegames and endgames stay near the same URL length while history codecs keep growing. Weak only in the opening, where a short path or dictionary entry is smaller.",
    examples: [
      {
        label: DEMO_SAN,
        code: "o-EADv___vABBCNWMkEREREZmZmZnKveus-oA",
        note: "Still ~57 URL characters with 32 pieces. The same row at ply 64 is almost the same length.",
      },
    ],
  },
  {
    id: "method-naive-4bit",
    method: "naive_4bit",
    how: "Every square gets a fixed 4-bit cell (empty or coloured piece), plus nine bits of side/castling/en passant. Always 265 bits before Base64URL. Prefix n-.",
    when: "A useful baseline for “store the grid literally.” Occupancy beats it because empty squares cost one bit in the mask instead of four in the grid. Included so the packed family has a clear floor and ceiling.",
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
    when: "Almost always loses on share URLs. The gzip header alone is larger than a short opening path, and Base64URL expands the compressed bytes again. Long endgame histories still rarely beat packed UCI after encoding.",
    examples: [
      {
        label: DEMO_SAN,
        code: "g-H4sIAAAAAAAC_0s1SjVJNU81BQCH6qitCAAAAA",
        note: "Eight ASCII moves become a 60-character URL. Native u- was 30.",
      },
    ],
  },
  {
    id: "method-gzip-fen",
    method: "gzip_fen",
    how: "gzip the full FEN text, Base64URL, prefix z-. Same compressor tax as gzip(UCI), applied to a string that is already short and low-redundancy.",
    when: "The worst row on the scoreboard for mean URL length. Kept as a control so “just gzip it” has a measured answer.",
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
    how: "Train a codebook of the K=1024 most frequent UCI prefixes at depths 2, 4, 6, 8, 10, and 12 on the hash-train split. A hit stores a small depth id, a 10-bit index, and a packed-UCI suffix for the rest of the path. A miss falls back to a packed path under the d- prefix.",
    when: "Shines on openings people actually play. On held-out val it lands near occupancy in the overall mean, but wins hard at ply ≤8 where native UCI is already short and occupancy still carries a full board. Needs the codebook shipped with the decoder.",
    examples: [
      {
        label: `${DEMO_SAN}, book miss`,
        code: "d-Mc0k",
        note: "Without a matching prefix the payload matches packed UCI. A hit replaces those opening plies with depth id + index (~13 bits before the suffix).",
      },
    ],
  },

  {
    id: "method-hybrid",
    method: "hybrid_min",
    how: "For each position, encode packed UCI, occupancy, and lookup, then keep the shortest. A 2-bit mode tag rides in front of the winning payload under h-. The decoder reads the tag and dispatches.",
    when: "The product-shaped row. Early games pick path or dictionary; later games pick occupancy. Mean URL falls to about 39 characters with a tight max near 57, because the worst case is roughly occupancy plus a tag.",
    examples: [
      {
        label: `${DEMO_SAN}, picks packed path`,
        code: "h-DHNJAA",
        note: "Two-bit mode + packed payload. Slightly longer than p- alone; much shorter than forcing occupancy.",
      },
      {
        label: "Sicilian ~20 plies, picks occupancy",
        code: "h-TAW12lp8j0QRUYRExEiMRmam6m5mc3OgAA",
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
 * Sample of the frequency codebook: per-depth rank → UCI prefix → FEN.
 * Top prefixes from the June 2026 aggregate (same ranking the K=1024 book uses).
 * FEN trimmed to placement + side + castling + en passant.
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
    index: 1,
    uci: "d2d4d7d5",
    fen: "rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq -",
    label: "Queen's pawn",
  },
  {
    depth: 2,
    index: 2,
    uci: "e2e4c7c5",
    fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
    label: "Sicilian",
  },
  {
    depth: 2,
    index: 3,
    uci: "e2e4d7d5",
    fen: "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
    label: "Scandinavian",
  },
  {
    depth: 2,
    index: 4,
    uci: "e2e4e7e6",
    fen: "rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
    label: "French",
  },
  {
    depth: 4,
    index: 0,
    uci: "e2e4e7e5g1f3b8c6",
    fen: "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq -",
    label: "1.e4 e5 2.Nf3 Nc6",
  },
  {
    depth: 4,
    index: 1,
    uci: "e2e4d7d5e4d5d8d5",
    fen: "rnb1kbnr/ppp1pppp/8/3q4/8/8/PPPP1PPP/RNBQKBNR w KQkq -",
    label: "Scandi …Qxd5",
  },
  {
    depth: 4,
    index: 2,
    uci: "e2e4c7c6d2d4d7d5",
    fen: "rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w KQkq -",
    label: "Caro-Kann",
  },
  {
    depth: 6,
    index: 0,
    uci: "e2e4e7e5g1f3b8c6d2d4e5d4",
    fen: "r1bqkbnr/pppp1ppp/2n5/8/3pP3/5N2/PPP2PPP/RNBQKB1R w KQkq -",
    label: "Scotch",
  },
  {
    depth: 6,
    index: 1,
    uci: "e2e4e7e5g1f3b8c6f1c4g8f6",
    fen: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -",
    label: "Two Knights",
  },
  {
    depth: 8,
    index: 0,
    uci: "e2e4c7c5g1f3d7d6d2d4c5d4f3d4g8f6",
    fen: "rnbqkb1r/pp2pppp/3p1n2/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq -",
    label: "Open Sicilian",
  },
];

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
}: {
  spread: MetricSpread;
  scaleMin: number;
  scaleMax: number;
  heatMin: number;
  heatMax: number;
}) => (
  <td
    className="py-2.5 px-2 align-middle"
    style={heatmapStyle(spread.mean, heatMin, heatMax)}
  >
    <div className="flex flex-col items-end gap-1">
      <span className="font-mono tabular-nums text-xs leading-tight text-right">
        {formatSpreadStat(spread, 0)}
      </span>
      <ErrorBand spread={spread} scaleMin={scaleMin} scaleMax={scaleMax} />
    </div>
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
      Codebook sample — index → FEN
    </figcaption>
    <p className="text-sm text-muted-foreground">
      Each depth keeps its own top-K list. Index{" "}
      <span className="font-mono text-foreground">0</span> is the most common
      prefix at that depth; the decoder replays the stored UCI to recover the
      FEN. Full book is K=1024 × six depths; rows below are the head of the
      frequency ranking.
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
  <article
    id={detail.id}
    className="scroll-mt-24 space-y-3 border-t border-border/70 pt-8 first:border-t-0 first:pt-0"
  >
    <h3 className="font-serif text-2xl tracking-tight text-balance">
      {row?.label ?? detail.method}
    </h3>
    {row ? (
      <p className="text-sm text-muted-foreground">
        Mean URL{" "}
        <span className="font-mono text-foreground">{format(row.url, 0)}</span>
        {" · "}
        payload{" "}
        <span className="font-mono text-foreground">
          {format(row.chars, 0)}
        </span>{" "}
        chars ·{" "}
        <span className="font-mono text-foreground">{format(row.bits, 0)}</span>{" "}
        bits · prefix{" "}
        <code className="text-foreground">
          {METHOD_PREFIX[detail.method] ?? "?"}
        </code>
      </p>
    ) : null}
    <p>{detail.how}</p>
    <p className="text-muted-foreground">{detail.when}</p>
    {detail.id === "method-lookup" ? <LookupCodebookSample /> : null}
    <div className="space-y-5">
      {detail.examples.map((ex) => {
        const parsed = parseCode(ex.code);
        const href = `/p/${ex.code}`;
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
                fen={parsed.fen}
                perspective={parsed.sideToMove}
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
  </article>
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
        Encoding starts from empty squares plus six piece types in two colours.
        That board picture still leaves out whose turn it is, and several rights
        that depend on earlier moves.
      </figcaption>
    </figure>
  );
};

export default function CompressionResearchPage() {
  const table = scoreboard.summary_table as ScoreRow[];
  const byPhase = scoreboard.by_phase as Record<string, Record<string, PhaseRow>>;
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

  const phaseUrlSpreads = PHASES.map((p) => {
    const values = table.map((row) => byPhase[row.method]?.[p.key]?.url ?? 0);
    return {
      key: p.key,
      heatMin: Math.min(...values),
      heatMax: Math.max(...values),
      whiskerMin: Math.min(
        ...table.map((row) => byPhase[row.method]?.[p.key]?.url_min ?? byPhase[row.method]?.[p.key]?.url ?? 0),
      ),
      whiskerMax: Math.max(
        ...table.map((row) => byPhase[row.method]?.[p.key]?.url_max ?? byPhase[row.method]?.[p.key]?.url ?? 0),
      ),
    };
  });
  const phaseUrlScaleMin = Math.min(...phaseUrlSpreads.map((p) => p.whiskerMin));
  const phaseUrlScaleMax = Math.max(...phaseUrlSpreads.map((p) => p.whiskerMax));

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

      <header className="space-y-4 mb-10">
        <p className="text-sm tracking-wide uppercase text-muted-foreground">
          Compression research · draft
        </p>
        <h1 className="font-serif text-5xl md:text-6xl leading-[1.05] tracking-tighter text-balance">
          How small can a chess share link get?
        </h1>
        <p className="text-lg text-muted-foreground text-pretty leading-relaxed">
          A share link has to carry a legal chess position through a messaging
          app, in characters the URL bar will accept, with no database on the
          other end. Those constraints fight each other.
        </p>
      </header>

      <aside className="mb-14 border-l-2 border-foreground/20 pl-5 space-y-4">
        <p className="font-serif text-2xl md:text-3xl leading-none tracking-tighter">
          TL;DR
        </p>
        <div className="space-y-3 text-[0.95rem] leading-relaxed text-muted-foreground">
          <p>
            We asked a simple question: what is the shortest possible
            self-contained URL that can represent a legal chess position?
          </p>
          <p>
            Testing over a million positions from real Lichess games shows that
            standard formats such as FEN are convenient but surprisingly
            wasteful. The best practical single codec, Occupancy + Pieces,
            nearly halves URL length (
            <span className="font-mono text-foreground">
              {format(nativeUrl, 0)}
            </span>{" "}
            →{" "}
            <span className="font-mono text-foreground">
              {format(occupancyUrl, 0)}
            </span>{" "}
            characters), while a hybrid that switches representation by position
            cuts it further to about{" "}
            <span className="font-mono text-foreground">
              {format(bestUrl, 0)}
            </span>{" "}
            characters on average.
          </p>
          <p>
            Optimising for bits, for characters, and for pasteable URLs are three
            different problems. For a product like chss.chat, the URL, not the
            binary payload, is the target.
          </p>
        </div>
      </aside>

      <article className="space-y-14 text-[1.05rem] leading-relaxed">
        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            Why the problem is interesting
          </h2>
          <p>
            Sixty-four squares, empty or occupied by a coloured piece, almost
            draw the picture. They do not continue the game: castling, en
            passant, and the clocks depend on history the eye
            cannot see. chss.chat has no database, so the URL is the whole
            payload. It must be pasteable into WhatsApp, safe in a path segment,
            and rich enough that the recipient can reply under standard FIDE
            rules. Variants change both the fields you store and the
            distribution of positions people share; I note that near the end.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            More than pieces on squares
          </h2>
          <p>
            Start with the board picture: empty, white, or black, and if occupied
            which piece type.
          </p>

          <BoardStateDiagram />

          <p>
            Two ways to carry a position in a URL.{" "}
            <strong>State</strong>: a snapshot of the board plus the rights and
            clocks the rules still need. <strong>History</strong>: the move list
            from the start; the decoder replays it. History reconstructs state,
            but history grows with every ply while a snapshot stays roughly
            fixed-size. FEN is the usual spelling of state (side to move,
            castling, en passant, clocks). Tap a board below to open that
            position in chss.chat:
          </p>
          <ExtraStateDemos />
          <p>
            Some invisible state can be inferred by replaying history; some
            cannot from a mid-game snapshot alone. Every codec here is a bet
            about what to store, what to infer, and how ugly the decoder may
            become.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            Why URL length is a different game
          </h2>
          <p>
            Bits are not the product metric. People paste the full URL (origin,
            path, payload); long links wrap, truncate, and feel like spam.
            Characters outside a small alphabet become{" "}
            <code className="text-sm">%xx</code>. Base64&apos;s{" "}
            <code className="text-sm">+</code>/<code className="text-sm">/</code>{" "}
            are hostile in paths, so most packed rows use Base64URL (
            <code className="text-sm">-</code>/<code className="text-sm">_</code>
            ), at the usual cost of four characters per three bytes. Three
            targets get blurred: minimum bits, minimum encoded characters, and
            minimum characters in the full pasteable link. The third is what
            wins. Text encodings make the gap vivid: a short binary blob can
            become a long, ugly string once UTF and percent-encoding meet a chat
            bubble.
          </p>
          <UtfEncodingDemo />
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            State, history, and cost
          </h2>
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,18rem)] lg:items-start">
            <div className="min-w-0">
              <p>
                FEN is <strong>state</strong>-based text; UCI is{" "}
                <strong>history</strong>-based text. Both are readable and
                wasteful. Inference stores less and makes the decoder replay
                history into state, which shrinks the URL and grows edge
                complexity. Between those poles sit packed binary, opening
                dictionaries, and hybrids that pick the shortest encoding per
                position. The rest of this page compares those bets on real
                games.
              </p>
            </div>
            <FenUciMappingDemo />
          </div>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            Data and methods
          </h2>
          <p>
            A flat index of every legal position is the theoretical floor, but
            real games are nothing like uniform: openings recur, middlegames fan
            out. So we train short codes on frequent positions using a hash
            sample of June 2026 Lichess standard rated games (train / val /
            test). Fixed-length packers barely need that distribution; lookup
            and hybrid methods do. Held-out hit rates for K=1024 agree within
            about 0.02%; one month is still not every month. The ladder below
            runs from naïve storage to a hybrid that picks the shortest of
            packed path, occupancy, and lookup. gzip is included because people
            expect it; on these short payloads the header usually costs more
            than it saves.
          </p>
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              <span className="font-medium text-foreground">
                Naïve fixed-length.
              </span>{" "}
              Every piece and rule field explicit.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Existing formats.
              </span>{" "}
              FEN (<strong>state</strong>) and UCI (<strong>history</strong>).
            </li>
            <li>
              <span className="font-medium text-foreground">
                Bit packs.
              </span>{" "}
              Occupancy, 4-bit grids, packed paths → Base64URL.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Indexed openings.
              </span>{" "}
              Short lookup for common prefixes; fallback otherwise.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Smart decoding.
              </span>{" "}
              Rebuild state the URL never stored.
            </li>
            <li>
              <span className="font-medium text-foreground">Hybrid.</span> Tiny
              tag + shortest of path, board, or dictionary.
            </li>
          </ol>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            What we measure
          </h2>
          <ul className="list-disc pl-5 space-y-2 text-muted-foreground">
            <li>
              <span className="text-foreground">Bits.</span> Codec floor before
              alphabet tricks.
            </li>
            <li>
              <span className="text-foreground">Chars.</span> Payload after
              Base64URL (native UCI stays ASCII).
            </li>
            <li>
              <span className="text-foreground">URL length.</span>{" "}
              <code className="text-sm">https://chss.chat/p/</code> + prefix +
              payload. What someone pastes.
            </li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Held-out sample: {meta.games.toLocaleString()} games ·{" "}
            {meta.positions.toLocaleString()} positions at plies{" "}
            {meta.ply_points.join(", ")} · codebook from hash-train (K=
            {meta.lookup_k}).
          </p>
          <UrlLengthLoopDemo />
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            Scoreboard: all positions
          </h2>
          <p>
            Lower is better. Hybrid lands around{" "}
            <span className="font-mono text-foreground">
              {format(bestUrl, 0)}
            </span>{" "}
            URL characters on average versus roughly {format(nativeUrl, 0)} for
            native FEN. Native rows match what chss.chat ships today (
            <code className="text-sm">f-</code> /{" "}
            <code className="text-sm">u-</code>); packed + lookup roughly halves
            that; gzip usually makes links longer. Click a method name to jump to
            how it works and a few example URLs.
          </p>

          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full min-w-[28rem] text-sm border-collapse">
              <caption className="caption-top text-left text-muted-foreground mb-3">
                Mean over all sampled plies. URL includes{" "}
                <code className="text-xs">{meta.url_origin}</code>. Overlay
                reads mean ± σ [min–max] (± = std, not variance). Tall band =
                min–max; mid = ±σ; coloured bar = mean. Each metric normalised
                to its own max.{" "}
                <span className="inline-flex items-center gap-3 ml-1">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`inline-block size-2 rounded-sm ${METRIC_BAR.bits}`}
                      aria-hidden="true"
                    />
                    Bits
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`inline-block size-2 rounded-sm ${METRIC_BAR.chars}`}
                      aria-hidden="true"
                    />
                    Chars
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className={`inline-block size-2 rounded-sm ${METRIC_BAR.url}`}
                      aria-hidden="true"
                    />
                    URL
                  </span>
                </span>
              </caption>
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium w-[38%]">Method</th>
                  <th className="py-2 pl-2 font-medium">Bits / Chars / URL</th>
                </tr>
              </thead>
              <tbody>
                {FAMILY_ORDER.map((family) => {
                  const rows = table.filter((r) => r.family === family);
                  return rows.map((row, i) => (
                    <tr
                      key={row.method}
                      className="border-b border-border/60"
                    >
                      <td className="py-3 pr-3 align-middle">
                        {i === 0 ? (
                          <span className="block text-xs text-muted-foreground mb-0.5">
                            {FAMILY_LABEL[family]}
                          </span>
                        ) : null}
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
                  ));
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-8" aria-labelledby="method-details-heading">
          <div className="space-y-5">
            <h2
              id="method-details-heading"
              className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance"
            >
              How each method works
            </h2>
            <p>
              Every row above is a bet about what to store. State snapshots
              (FEN, occupancy, 4-bit grid) stay roughly fixed-size. History paths
              (UCI, packed UCI, lookup+suffix) shrink early and grow with every
              ply. The examples use{" "}
              <span className="font-medium text-foreground">{DEMO_SAN}</span>
              {" "}
              (<code className="text-sm">{DEMO_UCI}</code>) unless noted. Example
              links are real{" "}
              <code className="text-sm">/p/…</code> codes. Play now writes hybrid{" "}
              <code className="text-sm">h-</code> by default (min of packed path and
              occupancy); short{" "}
              <code className="text-sm">u-</code> keys still win when the opening
              map hits. Lookup mode needs a shipped codebook.
            </p>
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
            Same table by game phase (URL chars)
          </h2>
          <p className="text-muted-foreground">
            Early positions favour history paths and the lookup
            table; late positions favour occupancy state. gzip
            loses on short payloads. Cell tint: greener = shorter URL in that
            phase column; redder = longer. Numbers: mean ± σ [min–max]. Tall
            band = min–max; mid = ±σ.
          </p>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full min-w-[40rem] text-sm border-collapse">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Method</th>
                  {PHASES.map((p) => (
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
                {table.map((row) => (
                  <tr key={row.method} className="border-b border-border/60">
                    <td className="py-2.5 pr-3">
                      <MethodNameLink method={row.method} label={row.label} />
                    </td>
                    {PHASES.map((p) => {
                      const cell = byPhase[row.method]?.[p.key];
                      const phaseScale = phaseUrlSpreads.find((s) => s.key === p.key);
                      return (
                        <PhaseCell
                          key={p.key}
                          spread={metricSpread(
                            cell?.url ?? 0,
                            cell?.url_min,
                            cell?.url_max,
                            cell?.url_std,
                          )}
                          scaleMin={phaseUrlScaleMin}
                          scaleMax={phaseUrlScaleMax}
                          heatMin={phaseScale?.heatMin ?? 0}
                          heatMax={phaseScale?.heatMax ?? 0}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            What this leaves us with
          </h2>
          <p>
            The question we started with was short. What is the smallest
            self-contained URL that can still represent a legal chess position,
            with no database on the far side and no cheating past the alphabet a
            messaging app will accept?
          </p>
          <p>
            On over a million positions from real Lichess games, the answer is
            sharper than &quot;use a better compressor.&quot; Native FEN is easy
            to read and surprisingly expensive in a pasteable link, around{" "}
            <span className="font-mono">{format(nativeUrl, 0)}</span>{" "}
            characters for a full share URL. Occupancy + Pieces, the best
            practical single codec here, nearly halves that to about{" "}
            <span className="font-mono">{format(occupancyUrl, 0)}</span>. A
            hybrid that picks packed path, occupancy, or opening lookup per
            position goes further still, to about{" "}
            <span className="font-mono">{format(bestUrl, 0)}</span> on average.
            That is small enough to feel like a product choice rather than a lab
            curiosity.
          </p>
          <p>
            The deeper finding is the metric split. Bits, encoded characters, and
            pasteable URL length are three different contests. A method that wins
            on the information floor can lose the moment Base64URL, path safety,
            or a gzip header enters the string someone actually copies. For
            chss.chat, the optimisation target is that string.
          </p>
          <p>
            Change the rules and the scoreboard moves. Chess960, crazyhouse, or
            anything with drops needs different state, different
            frequencies, and usually a thinner opening book. The URL constraints
            do not change. The next work is operational: which codebook ships on
            the edge, which prefixes we reserve, and how much decoder complexity
            another handful of characters is worth.
          </p>
        </section>

        <section className="space-y-5">
          <h2 className="font-serif text-3xl md:text-4xl leading-[1.15] tracking-tighter text-balance">
            Reproduce
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
            86.5M games). Do not fully decompress it — the scripts stream with{" "}
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
            deterministic train / val / test split. On our machine (Apple M3
            Pro, 18&nbsp;GB), that corpus pipeline took about 1&nbsp;h&nbsp;45&nbsp;m
            wall time — roughly an hour for the aggregate and about 41&nbsp;minutes
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
            as zstd-compressed train / val / test JSONL. Once those exist you
            can delete the raw{" "}
            <code className="text-xs text-foreground">.pgn.zst</code> to free
            ~26&nbsp;GB.
          </p>

          <h3 className="font-serif text-xl tracking-tight pt-2">
            4. Rebuild the scoreboard
          </h3>
          <p className="text-muted-foreground">
            Train the K=1024 opening codebook on the train split, evaluate at
            plies 2 / 8 / 16 / 32 / 64 on val, and write the slim JSON the page
            reads.
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
            characters, occupancy around{" "}
            <span className="font-mono">{format(occupancyUrl, 0)}</span>,
            native FEN around{" "}
            <span className="font-mono">{format(nativeUrl, 0)}</span>. Exact
            floats can shift a little with toolchain versions; the order should
            not.
          </p>
          <p className="text-sm text-muted-foreground">
            Design notes and earlier phase logs:{" "}
            <code className="text-xs">doc/chess-url-compression.md</code>.
          </p>
        </section>
      </article>
    </main>
  );
}
