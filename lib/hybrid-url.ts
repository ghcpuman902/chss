/**
 * Product hybrid URL codec: min(packed UCI path, occupancy snapshot) + 2-bit mode.
 * Prefix h-. Matches benchmark hybrid_min without the opening codebook (mode 2)
 * until a K=1024 book ships; short u- keys still win for mapped openings.
 *
 * Occupancy is FEN-complete (placement, side, castling, ep, halfmove, fullmove).
 */

import { Chess, type Move } from "chess.js";
import { base64urlEncode } from "@/lib/base64url";
import {
  BitWriter,
  packOccupancy,
  packUciPath,
} from "@/lib/research-url-codecs";
import { readUciMoveAt } from "@/lib/uci";

const base64urlEncodeBytes = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return base64urlEncode(binary);
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
