/** Stable piece ids across FEN updates for animated research boards. */

export type PieceColor = "w" | "b";
export type PieceType = "p" | "n" | "b" | "r" | "q" | "k";

export type BoardPiece = {
  id: string;
  type: PieceType;
  color: PieceColor;
  square: string;
};

export type PieceMove = {
  from: string;
  to: string;
};

const FILES = "abcdefgh";

let idSeq = 0;

const allocId = (used: Set<string>): string => {
  let id: string;
  do {
    idSeq += 1;
    id = `p${idSeq}`;
  } while (used.has(id));
  used.add(id);
  return id;
};

export const fenBoardToPieces = (fen: string): Omit<BoardPiece, "id">[] => {
  const rows = fen.split(" ")[0].split("/");
  const out: Omit<BoardPiece, "id">[] = [];
  rows.forEach((row, ri) => {
    let file = 0;
    for (const ch of row) {
      if (ch >= "1" && ch <= "8") {
        file += Number(ch);
        continue;
      }
      const color: PieceColor = ch === ch.toUpperCase() ? "w" : "b";
      const type = ch.toLowerCase() as PieceType;
      const square = `${FILES[file]}${8 - ri}`;
      out.push({ type, color, square });
      file += 1;
    }
  });
  return out;
};

/**
 * Prefer an explicit from→to move, then square stays, then type+color.
 * Pass `prev = null` to force fresh ids (loop reset with no slide-back).
 */
export const matchPieceIds = (
  prev: BoardPiece[] | null,
  fen: string,
  move?: PieceMove | null,
): BoardPiece[] => {
  const next = fenBoardToPieces(fen);
  if (!prev || prev.length === 0) {
    const used = new Set<string>();
    return next.map((p) => ({ ...p, id: allocId(used) }));
  }

  const used = new Set<string>();
  const result: Array<BoardPiece | null> = next.map(() => null);

  if (move) {
    const mover = prev.find((p) => p.square === move.from && !used.has(p.id));
    const toIndex = next.findIndex((n) => n.square === move.to);
    if (mover && toIndex >= 0) {
      used.add(mover.id);
      result[toIndex] = { ...next[toIndex]!, id: mover.id };
    }
  }

  next.forEach((n, i) => {
    if (result[i]) return;
    const exact = prev.find(
      (p) =>
        !used.has(p.id) &&
        p.square === n.square &&
        p.type === n.type &&
        p.color === n.color,
    );
    if (!exact) return;
    used.add(exact.id);
    result[i] = { ...n, id: exact.id };
  });

  next.forEach((n, i) => {
    if (result[i]) return;
    const moved = prev.find(
      (p) => !used.has(p.id) && p.type === n.type && p.color === n.color,
    );
    if (moved) {
      used.add(moved.id);
      result[i] = { ...n, id: moved.id };
      return;
    }
    result[i] = { ...n, id: allocId(used) };
  });

  const seen = new Set<string>();
  return (result as BoardPiece[]).map((piece) => {
    if (!seen.has(piece.id)) {
      seen.add(piece.id);
      return piece;
    }
    return { ...piece, id: allocId(seen) };
  });
};
