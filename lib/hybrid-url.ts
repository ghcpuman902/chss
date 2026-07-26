/**
 * Product hybrid URL codec: min(packed UCI path, occupancy snapshot) + 2-bit mode.
 * Prefix h-. Matches benchmark hybrid_min without the opening codebook (mode 2)
 * until a K=1024 book ships; short u- keys still win for mapped openings.
 */

import { Chess, type Move, type Square } from "chess.js";
import { base64urlEncode } from "@/lib/base64url";
import { readUciMoveAt } from "@/lib/uci";

const PIECE_NIBBLE: Record<string, number> = {
  p: 1,
  n: 2,
  b: 3,
  r: 4,
  q: 5,
  k: 6,
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

  toBytes(): Uint8Array {
    const pad = (8 - (this.bits.length % 8)) % 8;
    const bits = pad ? [...this.bits, ...Array(pad).fill(0)] : this.bits;
    const out = new Uint8Array(bits.length / 8);
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j += 1) {
        byte = (byte << 1) | bits[i + j]!;
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

const fenCore = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

/** Replay UCI from start; returns moves if the path reaches `fen`. */
const movesMatchingFen = (uci: string, fen: string): Move[] | null => {
  if (!uci) return null;
  try {
    const chess = new Chess();
    const moves: Move[] = [];
    for (let i = 0; i < uci.length; ) {
      const chunk = readUciMoveAt(uci, i);
      if (!chunk) return null;
      const move = chess.move({
        from: chunk.from,
        to: chunk.to,
        promotion: chunk.promotion,
      });
      if (!move) return null;
      moves.push(move);
      i += chunk.step;
    }
    if (fenCore(chess.fen()) !== fenCore(fen)) return null;
    return moves;
  } catch {
    return null;
  }
};

const wrapHybrid = (mode: 0 | 1, inner: BitWriter): string => {
  const w = new BitWriter();
  w.write(mode, 2);
  w.appendBits(inner);
  return `h-${base64urlEncodeBytes(w.toBytes())}`;
};

/**
 * Encode a position as the shortest hybrid code (packed path vs occupancy).
 * Prefers packed UCI while games are short; occupancy for deeper / no-history.
 */
export const encodeHybridCode = (fen: string, uci?: string): string => {
  const chess = new Chess(fen);
  const occupancy = wrapHybrid(1, packOccupancy(chess));

  const moves = uci ? movesMatchingFen(uci, fen) : null;
  if (!moves || moves.length === 0) return occupancy;

  const packed = wrapHybrid(0, packUciPath(moves));
  return packed.length <= occupancy.length ? packed : occupancy;
};
