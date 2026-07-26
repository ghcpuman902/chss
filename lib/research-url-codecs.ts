/** Research-only URL codecs mirroring benchmark/url_length_benchmark.py. */

import { Chess, type Move, type Square } from "chess.js";
import { base64urlEncode } from "@/lib/base64url";
import { readUciMoveAt } from "@/lib/uci";

export const URL_ORIGIN = "https://chss.chat/p/";

export const LOOKUP_DEPTHS = [2, 4, 6, 8, 10, 12] as const;
export const LOOKUP_K = 1024;

const PIECE_NIBBLE: Record<string, number> = {
  p: 1,
  n: 2,
  b: 3,
  r: 4,
  q: 5,
  k: 6,
};

export type CodecMethod = "packed_uci" | "occupancy" | "lookup_k1024";

export type EncodedUrl = {
  method: CodecMethod;
  label: string;
  prefix: string;
  /** Payload only (no method prefix). */
  payload: string;
  code: string;
  url: string;
  urlChars: number;
  /** Payload character count (what the bars scale). */
  chars: number;
};

export type HybridPick = {
  winner: CodecMethod;
  chars: number;
  payload: string;
};

export type PositionSample = {
  fen: string;
  ply: number;
  pieceCount: number;
  candidates: EncodedUrl[];
  hybrid: HybridPick;
};

class BitWriter {
  private bits: number[] = [];

  write(value: number, width: number) {
    for (let i = width - 1; i >= 0; i -= 1) {
      this.bits.push((value >> i) & 1);
    }
  }

  appendBits(other: BitWriter) {
    for (const bit of other.bits) this.bits.push(bit);
  }

  get bitLength() {
    return this.bits.length;
  }

  toBytes(): Uint8Array {
    const pad = (8 - (this.bits.length % 8)) % 8;
    const bits = pad ? [...this.bits, ...Array(pad).fill(0)] : this.bits;
    const out = new Uint8Array(bits.length / 8);
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j += 1) {
        byte = (byte << 1) | bits[i + j];
      }
      out[i / 8] = byte;
    }
    return out;
  }
}

const squareIndex = (sq: Square): number =>
  sq.charCodeAt(0) - 97 + (Number(sq[1]) - 1) * 8;

const base64urlEncodeBytes = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return base64urlEncode(binary);
};

const codeUrl = (prefix: string, payload: string) => {
  const code = `${prefix}${payload}`;
  return {
    code,
    chars: payload.length,
    urlChars: URL_ORIGIN.length + code.length,
    url: `${URL_ORIGIN}${code}`,
  };
};

const castlingNibble = (chess: Chess): number => {
  const fen = chess.fen().split(" ")[2] ?? "-";
  let bits = 0;
  if (fen.includes("K")) bits |= 1;
  if (fen.includes("Q")) bits |= 2;
  if (fen.includes("k")) bits |= 4;
  if (fen.includes("q")) bits |= 8;
  return bits;
};

const epNibble = (chess: Chess): number => {
  const ep = chess.fen().split(" ")[3];
  if (!ep || ep === "-") return 0;
  return ep.charCodeAt(0) - 97 + 1;
};

const writeMeta = (w: BitWriter, chess: Chess) => {
  w.write(chess.turn() === "w" ? 1 : 0, 1);
  w.write(castlingNibble(chess), 4);
  w.write(epNibble(chess), 4);
};

const packOccupancy = (chess: Chess): BitWriter => {
  const w = new BitWriter();
  const pieces: number[] = [];
  const lowBits: number[] = [];
  const highBits: number[] = [];

  for (let sq = 0; sq < 64; sq += 1) {
    const file = String.fromCharCode(97 + (sq % 8));
    const rank = Math.floor(sq / 8) + 1;
    const square = `${file}${rank}` as Square;
    const piece = chess.get(square);
    const occupied = Boolean(piece);
    if (sq < 32) lowBits.push(occupied ? 1 : 0);
    else highBits.push(occupied ? 1 : 0);
    if (!piece) continue;
    let nibble = PIECE_NIBBLE[piece.type] ?? 0;
    if (piece.color === "b") nibble |= 8;
    pieces.push(nibble);
  }

  const writeWord = (bits: number[]) => {
    let value = 0;
    for (let i = 0; i < 32; i += 1) {
      if (bits[i]) value |= 1 << i;
    }
    w.write(value >>> 0, 32);
  };
  writeWord(lowBits);
  writeWord(highBits);

  for (const n of pieces) w.write(n, 4);
  writeMeta(w, chess);
  return w;
};

const packUciPath = (moves: Move[]): BitWriter => {
  const w = new BitWriter();
  const promoMap: Record<string, number> = { q: 0, r: 1, b: 2, n: 3 };
  for (const m of moves) {
    w.write(squareIndex(m.from), 6);
    w.write(squareIndex(m.to), 6);
    if (m.promotion) {
      w.write(promoMap[m.promotion] ?? 0, 2);
    }
  }
  return w;
};

/** FNV-1a style hash → codebook index. Demo stand-in for a real opening book. */
const hashPrefixIndex = (uciPrefix: string, k: number): number => {
  let h = 2166136261;
  for (let i = 0; i < uciPrefix.length; i += 1) {
    h ^= uciPrefix.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % k;
};

/**
 * Simulated lookup hit at the longest eligible depth.
 * Length structure matches the benchmark; indices are deterministic hashes, not a real book.
 */
const packLookup = (moves: Move[]): BitWriter => {
  const depths = LOOKUP_DEPTHS.filter((d) => moves.length >= d);
  const bestDepth = depths.length > 0 ? depths[depths.length - 1]! : 0;
  const w = new BitWriter();
  const depthBits = Math.max(1, Math.ceil(Math.log2(LOOKUP_DEPTHS.length)));
  const indexBits = Math.max(1, Math.ceil(Math.log2(LOOKUP_K)));

  if (bestDepth === 0) {
    // Miss → packed path only (same size story as benchmark fallback)
    return packUciPath(moves);
  }

  const depthId = LOOKUP_DEPTHS.indexOf(
    bestDepth as (typeof LOOKUP_DEPTHS)[number],
  );
  const uciPrefix = moves
    .slice(0, bestDepth)
    .map((m) => `${m.from}${m.to}${m.promotion ?? ""}`)
    .join("");

  w.write(depthId, depthBits);
  w.write(hashPrefixIndex(uciPrefix, LOOKUP_K), indexBits);
  w.appendBits(packUciPath(moves.slice(bestDepth)));
  return w;
};

const pieceCountOf = (chess: Chess): number => {
  let n = 0;
  const board = chess.board();
  for (const row of board) {
    for (const cell of row) {
      if (cell) n += 1;
    }
  }
  return n;
};

export const encodeBestThree = (
  chess: Chess,
  moves: Move[],
): { candidates: EncodedUrl[]; hybrid: HybridPick } => {
  const occupancyBits = packOccupancy(chess);
  const occupancyPayload = base64urlEncodeBytes(occupancyBits.toBytes());
  const occupancy = codeUrl("o-", occupancyPayload);

  const lookupBits = packLookup(moves);
  const lookupPayload = base64urlEncodeBytes(lookupBits.toBytes());
  const lookup = codeUrl("d-", lookupPayload);

  const packedBits = packUciPath(moves);
  const packedPayload = base64urlEncodeBytes(packedBits.toBytes());
  const packed = codeUrl("p-", packedPayload);

  const candidates = [
    { key: "packed_uci" as const, urlChars: packed.urlChars, bits: packedBits },
    {
      key: "occupancy" as const,
      urlChars: occupancy.urlChars,
      bits: occupancyBits,
    },
    {
      key: "lookup_k1024" as const,
      urlChars: lookup.urlChars,
      bits: lookupBits,
    },
  ];
  const best = candidates.reduce((a, b) => (a.urlChars <= b.urlChars ? a : b));
  const modeMap = { packed_uci: 0, occupancy: 1, lookup_k1024: 2 };
  const hybridBits = new BitWriter();
  hybridBits.write(modeMap[best.key], 2);
  hybridBits.appendBits(best.bits);
  const hybridPayload = base64urlEncodeBytes(hybridBits.toBytes());
  const hybrid = codeUrl("h-", hybridPayload);

  return {
    candidates: [
      {
        method: "packed_uci",
        label: "Packed UCI path",
        prefix: "p-",
        payload: packedPayload,
        code: packed.code,
        url: packed.url,
        urlChars: packed.urlChars,
        chars: packed.chars,
      },
      {
        method: "occupancy",
        label: "Occupancy + pieces",
        prefix: "o-",
        payload: occupancyPayload,
        code: occupancy.code,
        url: occupancy.url,
        urlChars: occupancy.urlChars,
        chars: occupancy.chars,
      },
      {
        method: "lookup_k1024",
        label: "Lookup K=1024 + suffix",
        prefix: "d-",
        payload: lookupPayload,
        code: lookup.code,
        url: lookup.url,
        urlChars: lookup.urlChars,
        chars: lookup.chars,
      },
    ],
    hybrid: {
      winner: best.key,
      chars: hybrid.chars,
      payload: hybridPayload,
    },
  };
};

/**
 * Italian Game (Giuoco Piano) continuation — deterministic demo.
 * Long enough for path codecs to grow while occupancy stays flatter.
 */
export const MEASURE_DEMO_UCI =
  "e2e4e7e5g1f3b8c6f1c4f8c5c2c3g8f6d2d4e5d4c3d4c5b4b1c3f6e4e1g1b4c3d4d5c3f6f1e1c6e7e1e4d7d6c1g5f6g5f3g5e8g8g5h7g8h7d1h5h7g8e4h4f7f5h5h7g8f7h4h6e7g6h7g6f7g8";

/** Snapshot a fixed UCI game after every move (ordered progression). */
export const generateFixedGameSamples = (uci: string): PositionSample[] => {
  const chess = new Chess();
  const moves: Move[] = [];
  const samples: PositionSample[] = [];

  for (let i = 0; i < uci.length; ) {
    const chunk = readUciMoveAt(uci, i);
    if (!chunk) break;
    const move = chess.move({
      from: chunk.from,
      to: chunk.to,
      promotion: chunk.promotion,
    });
    if (!move) break;
    moves.push(move);
    i += chunk.step;

    const { candidates, hybrid } = encodeBestThree(chess, moves);
    samples.push({
      fen: chess.fen({ forceEnpassantSquare: true }),
      ply: moves.length,
      pieceCount: pieceCountOf(chess),
      candidates,
      hybrid,
    });
  }

  return samples;
};

/** Precomputed “What we measure” loop — no client-side random walks. */
export const MEASURE_DEMO_SAMPLES = generateFixedGameSamples(MEASURE_DEMO_UCI);
