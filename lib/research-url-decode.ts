/**
 * Decode research URL prefixes (t-/p-/o-/n-/g-/z-/d-/h-) used on the
 * compression scoreboard. Mirrors benchmark/url_length_benchmark.py packing.
 *
 * Lookup hits (d-/h- mode 2 with a real codebook) need a shipped book; without
 * one we treat those payloads as packed-UCI misses (same bytes as p-).
 */

import { Chess, type Square } from "chess.js";
import { gunzipSync } from "fflate";
import { base64urlDecode, base64urlDecodeBytes } from "@/lib/base64url";
import { readUciMoveAt } from "@/lib/uci";

export type ResearchDecoded = {
  fen: string;
  sideToMove: "w" | "b";
  uci?: string;
};

const NIBBLE_TO_PIECE: Record<
  number,
  { type: "p" | "n" | "b" | "r" | "q" | "k"; color: "w" | "b" }
> = {
  1: { type: "p", color: "w" },
  2: { type: "n", color: "w" },
  3: { type: "b", color: "w" },
  4: { type: "r", color: "w" },
  5: { type: "q", color: "w" },
  6: { type: "k", color: "w" },
  9: { type: "p", color: "b" },
  10: { type: "n", color: "b" },
  11: { type: "b", color: "b" },
  12: { type: "r", color: "b" },
  13: { type: "q", color: "b" },
  14: { type: "k", color: "b" },
};

const PROMO_FROM_BITS = ["q", "r", "b", "n"] as const;

class BitReader {
  private i = 0;

  constructor(private readonly bits: number[]) {}

  get remaining() {
    return this.bits.length - this.i;
  }

  read(width: number): number {
    let value = 0;
    for (let j = 0; j < width; j += 1) {
      value = (value << 1) | (this.bits[this.i] ?? 0);
      this.i += 1;
    }
    return value >>> 0;
  }
}

const bitsFromBytes = (bytes: Uint8Array): number[] => {
  const bits: number[] = [];
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i -= 1) {
      bits.push((byte >> i) & 1);
    }
  }
  return bits;
};

const sqName = (index: number): Square => {
  const file = String.fromCharCode(97 + (index % 8));
  const rank = Math.floor(index / 8) + 1;
  return `${file}${rank}` as Square;
};

const castlingFromNibble = (n: number): string => {
  let s = "";
  if (n & 1) s += "K";
  if (n & 2) s += "Q";
  if (n & 4) s += "k";
  if (n & 8) s += "q";
  return s || "-";
};

const epFromNibble = (n: number, turn: "w" | "b"): string => {
  if (n === 0) return "-";
  const file = n - 1;
  if (file < 0 || file > 7) return "-";
  const rank = turn === "w" ? 6 : 3;
  return `${String.fromCharCode(97 + file)}${rank}`;
};

const readMeta = (r: BitReader): { turn: "w" | "b"; castling: string; ep: string } => {
  const turn = r.read(1) === 1 ? "w" : "b";
  const castling = castlingFromNibble(r.read(4));
  const ep = epFromNibble(r.read(4), turn);
  return { turn, castling, ep };
};

const boardToFen = (
  squares: Array<{ type: string; color: "w" | "b" } | null>,
  turn: "w" | "b",
  castling: string,
  ep: string,
): string | null => {
  const ranks: string[] = [];
  for (let rank = 7; rank >= 0; rank -= 1) {
    let row = "";
    let empty = 0;
    for (let file = 0; file < 8; file += 1) {
      const piece = squares[rank * 8 + file];
      if (!piece) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      const ch = piece.type;
      row += piece.color === "w" ? ch.toUpperCase() : ch;
    }
    if (empty > 0) row += String(empty);
    ranks.push(row);
  }
  const fen = `${ranks.join("/")} ${turn} ${castling} ${ep} 0 1`;
  try {
    const chess = new Chess(fen);
    // Drop impossible ep targets so the FEN matches u-/f- for the same board.
    return chess.fen();
  } catch {
    return null;
  }
};

const decodePackedUciBits = (r: BitReader): ResearchDecoded | null => {
  const chess = new Chess();
  let uci = "";
  while (r.remaining >= 12) {
    const from = r.read(6);
    const to = r.read(6);
    if (from > 63 || to > 63) return null;
    const fromSq = sqName(from);
    const toSq = sqName(to);
    const piece = chess.get(fromSq);
    let promo: (typeof PROMO_FROM_BITS)[number] | undefined;
    if (piece?.type === "p") {
      const toRank = Number(toSq[1]);
      const needs =
        (piece.color === "w" && toRank === 8) ||
        (piece.color === "b" && toRank === 1);
      if (needs) {
        if (r.remaining < 2) {
          // Padding after a complete path — not a real promotion.
          if (uci) break;
          return null;
        }
        promo = PROMO_FROM_BITS[r.read(2)] ?? "q";
      }
    }
    const move = chess.move({
      from: fromSq,
      to: toSq,
      promotion: promo,
    });
    if (!move) {
      // Byte padding is zero bits; a1a1 (and similar) is never legal.
      if (uci) break;
      return null;
    }
    uci += `${fromSq}${toSq}${promo ?? ""}`;
  }
  return {
    fen: chess.fen({ forceEnpassantSquare: true }),
    sideToMove: chess.turn(),
    uci,
  };
};

const decodeOccupancyBits = (r: BitReader): ResearchDecoded | null => {
  if (r.remaining < 64 + 9) return null;
  const low = r.read(32);
  const high = r.read(32);
  const squares: Array<{ type: string; color: "w" | "b" } | null> = Array(
    64,
  ).fill(null);
  let occCount = 0;
  for (let sq = 0; sq < 64; sq += 1) {
    const bit = sq < 32 ? (low >>> sq) & 1 : (high >>> (sq - 32)) & 1;
    if (!bit) continue;
    occCount += 1;
  }
  if (r.remaining < occCount * 4 + 9) return null;
  for (let sq = 0; sq < 64; sq += 1) {
    const bit = sq < 32 ? (low >>> sq) & 1 : (high >>> (sq - 32)) & 1;
    if (!bit) continue;
    const nibble = r.read(4);
    const piece = NIBBLE_TO_PIECE[nibble];
    if (!piece) return null;
    squares[sq] = piece;
  }
  const meta = readMeta(r);
  const fen = boardToFen(squares, meta.turn, meta.castling, meta.ep);
  if (!fen) return null;
  return { fen, sideToMove: meta.turn };
};

const decodeNaiveBits = (r: BitReader): ResearchDecoded | null => {
  if (r.remaining < 256 + 9) return null;
  const squares: Array<{ type: string; color: "w" | "b" } | null> = Array(
    64,
  ).fill(null);
  for (let sq = 0; sq < 64; sq += 1) {
    const nibble = r.read(4);
    if (nibble === 0) continue;
    const piece = NIBBLE_TO_PIECE[nibble];
    if (!piece) return null;
    squares[sq] = piece;
  }
  const meta = readMeta(r);
  const fen = boardToFen(squares, meta.turn, meta.castling, meta.ep);
  if (!fen) return null;
  return { fen, sideToMove: meta.turn };
};

const applyUciAscii = (uci: string): ResearchDecoded | null => {
  const chess = new Chess();
  let i = 0;
  while (i < uci.length) {
    const chunk = readUciMoveAt(uci, i);
    if (!chunk) return null;
    if (
      !chess.move({
        from: chunk.from,
        to: chunk.to,
        promotion: chunk.promotion,
      })
    ) {
      return null;
    }
    i += chunk.step;
  }
  return {
    fen: chess.fen({ forceEnpassantSquare: true }),
    sideToMove: chess.turn(),
    uci,
  };
};

const gunzipPayload = (payload: string): string | null => {
  try {
    const bytes = base64urlDecodeBytes(payload);
    if (bytes.length === 0) return null;
    const out = gunzipSync(bytes);
    return new TextDecoder().decode(out);
  } catch {
    return null;
  }
};

const decodeTrimFen = (payload: string): ResearchDecoded | null => {
  const trimmed = base64urlDecode(payload);
  if (!trimmed || !trimmed.includes(" ")) return null;
  const fen = `${trimmed} 0 1`;
  try {
    const chess = new Chess(fen);
    return {
      fen: chess.fen({ forceEnpassantSquare: true }),
      sideToMove: chess.turn(),
    };
  } catch {
    return null;
  }
};

const readerFromPayload = (payload: string): BitReader | null => {
  const bytes = base64urlDecodeBytes(payload);
  if (bytes.length === 0) return null;
  return new BitReader(bitsFromBytes(bytes));
};

/**
 * Parse a research codec code (`t-…`, `p-…`, …). Returns null if the prefix
 * is unknown or the payload is invalid.
 */
export const parseResearchCode = (code: string): ResearchDecoded | null => {
  if (!code || code.length < 3) return null;
  const kind = code.slice(0, 2);
  const payload = code.slice(2);

  if (kind === "t-") return decodeTrimFen(payload);

  if (kind === "p-" || kind === "d-") {
    const r = readerFromPayload(payload);
    if (!r) return null;
    return decodePackedUciBits(r);
  }

  if (kind === "o-") {
    const r = readerFromPayload(payload);
    if (!r) return null;
    return decodeOccupancyBits(r);
  }

  if (kind === "n-") {
    const r = readerFromPayload(payload);
    if (!r) return null;
    return decodeNaiveBits(r);
  }

  if (kind === "g-") {
    const uci = gunzipPayload(payload);
    if (!uci) return null;
    return applyUciAscii(uci);
  }

  if (kind === "z-") {
    const fen = gunzipPayload(payload);
    if (!fen || !fen.includes(" ")) return null;
    try {
      const chess = new Chess(fen);
      return {
        fen: chess.fen({ forceEnpassantSquare: true }),
        sideToMove: chess.turn(),
      };
    } catch {
      return null;
    }
  }

  if (kind === "h-") {
    const r = readerFromPayload(payload);
    if (!r || r.remaining < 2) return null;
    const mode = r.read(2);
    if (mode === 0 || mode === 2) return decodePackedUciBits(r);
    if (mode === 1) return decodeOccupancyBits(r);
    return null;
  }

  return null;
};
