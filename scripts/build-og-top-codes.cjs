/**
 * Build-time: Lookup K=1024 prefix table → OG board codes.
 *
 * Reads lib/lookup-k1024-top.json (UCI prefixes ranked like the scoreboard
 * "Lookup K=1024 + suffix" book), replays each prefix with chess.js, writes
 * lib/og-top-codes.json for generateStaticParams on /og/[[...code]].
 *
 * Regenerate the prefix table from the Lichess aggregate:
 *   node scripts/build-og-top-codes.cjs --from-aggregate
 *
 * Then (or on every build via prebuild):
 *   node scripts/build-og-top-codes.cjs
 */

const fs = require("fs");
const path = require("path");
const { Chess } = require("chess.js");

const ROOT = path.resolve(__dirname, "..");
const LOOKUP_PATH = path.join(ROOT, "lib", "lookup-k1024-top.json");
const OUT_PATH = path.join(ROOT, "lib", "og-top-codes.json");
const AGGREGATE_PATH = path.join(
  ROOT,
  "benchmark",
  "results",
  "aggregate_2026-06.json",
);

/**
 * Depths present in the Lichess aggregate / lookup table (even plies only).
 * Odd plies (Black to move) are derived while replaying: every intermediate
 * position along each prefix is emitted, plus all legal ply-1 moves.
 */
const LOOKUP_DEPTHS = [2, 4, 6, 8, 10, 12];
/** Snapshot every ply along a prefix so Black-to-move boards prerender. */
const SNAPSHOT_INTERMEDIATE_PLIES = true;

const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const fenToBoard64 = (fen) => {
  const placement = String(fen).split(" ")[0] ?? "";
  let out = "";
  for (const ch of placement) {
    if (ch === "/") continue;
    if (ch >= "1" && ch <= "8") {
      out += ".".repeat(Number(ch));
      continue;
    }
    out += ch;
  }
  return out.length === 64 ? out : null;
};

const buildOgCode = (fen, perspective) => {
  const board64 = fenToBoard64(fen);
  if (!board64) return null;
  return `b-${board64}${perspective}`;
};

/**
 * Split concatenated UCI. Only treat a 5th char as promotion when the move
 * is a pawn arriving on the last rank — otherwise `b8c6` / `b1c3` steal a `b`.
 */
const splitUci = (uci) => {
  const moves = [];
  let i = 0;
  const s = String(uci);
  while (i + 4 <= s.length) {
    const fromRank = s[i + 1];
    const toRank = s[i + 3];
    const maybePromo = s[i + 4];
    const pawnPromo =
      i + 5 <= s.length &&
      /[qrbn]/i.test(maybePromo) &&
      ((fromRank === "7" && toRank === "8") ||
        (fromRank === "2" && toRank === "1"));
    const len = pawnPromo ? 5 : 4;
    moves.push(s.slice(i, i + len));
    i += len;
  }
  if (i !== s.length) return null;
  return moves;
};


const writeLookupFromAggregate = () => {
  if (!fs.existsSync(AGGREGATE_PATH)) {
    throw new Error(
      `Missing ${path.relative(ROOT, AGGREGATE_PATH)} — run the corpus aggregate first.`,
    );
  }
  const agg = JSON.parse(fs.readFileSync(AGGREGATE_PATH, "utf8"));
  const top = agg.top_prefixes || {};
  const by_depth = {};
  for (const d of LOOKUP_DEPTHS) {
    const rows = top[`depth_${d}`] || [];
    // Head of the frequency ranking (same ordering the K=1024 book trains on).
    by_depth[String(d)] = rows.slice(0, 1024).map((row, index) => ({
      index,
      uci: row.key,
      count: row.count,
      pct: row.pct,
    }));
  }
  const out = {
    meta: {
      label: "Lookup K=1024 + suffix — prefix head table",
      k: 1024,
      depths: LOOKUP_DEPTHS,
      source: path.relative(ROOT, AGGREGATE_PATH),
      note: "Top UCI prefixes per lookup depth from the June 2026 hash aggregate. Used at build to prerender OG boards.",
    },
    by_depth,
  };
  fs.writeFileSync(LOOKUP_PATH, `${JSON.stringify(out, null, 2)}\n`);
  console.log(
    `[og-top] wrote ${path.relative(ROOT, LOOKUP_PATH)} (${LOOKUP_DEPTHS.map((d) => `${d}:${by_depth[String(d)].length}`).join(", ")})`,
  );
};

const buildOgTopCodes = () => {
  if (!fs.existsSync(LOOKUP_PATH)) {
    throw new Error(
      `Missing ${path.relative(ROOT, LOOKUP_PATH)}. Run: pnpm build:og:top:from-aggregate`,
    );
  }
  const book = JSON.parse(fs.readFileSync(LOOKUP_PATH, "utf8"));
  const seen = new Set();
  const entries = [];

  const addFen = (fen, perspective, meta) => {
    const code = buildOgCode(fen, perspective);
    if (!code || seen.has(code)) return;
    seen.add(code);
    entries.push({
      code,
      fen,
      perspective,
      ...meta,
    });
  };

  addFen(START_FEN, "w", {
    source: "start",
    depth: 0,
    index: 0,
    uci: "",
    count: Number.MAX_SAFE_INTEGER,
  });

  // Every legal first move → Black to move (the first-share cold-miss gap).
  {
    const root = new Chess();
    let ply1Index = 0;
    for (const m of root.moves({ verbose: true })) {
      const g = new Chess();
      g.move(m);
      const uci = `${m.from}${m.to}${m.promotion || ""}`;
      addFen(g.fen(), g.turn(), {
        source: "legal_ply1",
        depth: 1,
        index: ply1Index,
        uci,
        count: Number.MAX_SAFE_INTEGER - 1 - ply1Index,
      });
      ply1Index += 1;
    }
  }

  for (const d of book.meta?.depths || LOOKUP_DEPTHS) {
    const rows = book.by_depth?.[String(d)] || [];
    for (const row of rows) {
      const parts = splitUci(row.uci);
      if (!parts) {
        console.warn(
          `[og-top] skip bad uci depth=${d} index=${row.index} uci=${row.uci}`,
        );
        continue;
      }
      const chess = new Chess();
      let prefix = "";
      let ok = true;
      for (let i = 0; i < parts.length; i += 1) {
        const mv = parts[i];
        if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(mv)) {
          ok = false;
          break;
        }
        try {
          if (
            !chess.move({
              from: mv.slice(0, 2),
              to: mv.slice(2, 4),
              promotion: mv.length === 5 ? mv[4] : undefined,
            })
          ) {
            ok = false;
            break;
          }
        } catch {
          ok = false;
          break;
        }
        prefix += mv;
        const ply = i + 1;
        const isTerminal = ply === parts.length;
        if (!SNAPSHOT_INTERMEDIATE_PLIES && !isTerminal) continue;
        addFen(chess.fen(), chess.turn(), {
          source: isTerminal
            ? `lookup_k1024/depth_${d}`
            : `lookup_k1024/depth_${d}/ply_${ply}`,
          depth: ply,
          index: row.index,
          uci: prefix,
          count: row.count ?? 0,
          pct: row.pct ?? 0,
        });
      }
      if (!ok) {
        console.warn(
          `[og-top] skip illegal prefix depth=${d} index=${row.index} uci=${row.uci}`,
        );
      }
    }
  }

  entries.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  const out = {
    meta: {
      source: path.relative(ROOT, LOOKUP_PATH),
      lookup_k: book.meta?.k ?? 1024,
      depths: book.meta?.depths ?? LOOKUP_DEPTHS,
      n: entries.length,
      format: "b-<board64><w|b>",
      note: "Prerendered by generateStaticParams on /og/[[...code]] at next build. Includes start, all legal ply-1, and intermediate plies along lookup prefixes (odd = Black to move).",
    },
    codes: entries.map((e) => e.code),
    entries,
  };
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);
  console.log(
    `[og-top] wrote ${path.relative(ROOT, OUT_PATH)} (${entries.length} OG codes)`,
  );
};

const main = () => {
  if (process.argv.includes("--from-aggregate")) {
    writeLookupFromAggregate();
  }
  buildOgTopCodes();
};

main();
