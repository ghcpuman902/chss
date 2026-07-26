/** Shared UCI move chunking — promo only on rank 1/8 targets. */

export type UciPromotion = "n" | "b" | "r" | "q";

export type UciChunk = {
  from: string;
  to: string;
  promotion?: UciPromotion;
  /** Characters consumed (4, or 5 with promotion). */
  step: number;
};

const PROMO_RE = /^[nbrq]$/i;

/**
 * Read one UCI move at index `i`.
 * A following n/b/r/q is only a promotion when this looks like a pawn
 * advancing from rank 7→8 or 2→1. That avoids:
 * - `g1f3` + `b8c6` (b-file follow-up)
 * - `e1g1` + `b4c3` (castling onto rank 1)
 */
export const readUciMoveAt = (uci: string, i: number): UciChunk | null => {
  if (i < 0 || i + 4 > uci.length) return null;
  const from = uci.slice(i, i + 2);
  const to = uci.slice(i + 2, i + 4);
  if (from.length < 2 || to.length < 2) return null;

  const next = uci[i + 4];
  const fromRank = from[1];
  const toRank = to[1];
  const canPromote =
    (fromRank === "7" && toRank === "8") ||
    (fromRank === "2" && toRank === "1");
  const promotion =
    canPromote && next && PROMO_RE.test(next)
      ? (next.toLowerCase() as UciPromotion)
      : undefined;

  return { from, to, promotion, step: promotion ? 5 : 4 };
};

/** True when the string is a contiguous UCI move list (optional promos). */
export const isRawUciString = (value: string): boolean =>
  /^([a-h][1-8][a-h][1-8][nbrq]?)+$/i.test(value);
