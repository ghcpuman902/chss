import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { matchPieceIds } from "./piece-match";

describe("matchPieceIds move continuity", () => {
  it("keeps the same id for white and black movers", () => {
    const chess = new Chess();
    let prev = matchPieceIds(null, chess.fen(), null);

    for (const m of ["e2e4", "e7e5", "g1f3", "b8c6", "f1c4"] as const) {
      const from = m.slice(0, 2);
      const to = m.slice(2, 4);
      const fromId = prev.find((p) => p.square === from)?.id;
      chess.move({ from, to });
      const next = matchPieceIds(prev, chess.fen(), { from, to });
      const toId = next.find((p) => p.square === to)?.id;
      expect(fromId, `${m} from id`).toBeTruthy();
      expect(toId, `${m} to id`).toBe(fromId);
      prev = next;
    }
  });

  it("keeps sibling order stable when a piece changes rank", () => {
    const chess = new Chess();
    let prev = matchPieceIds(null, chess.fen(), null);

    for (const m of ["e2e4", "e7e5"] as const) {
      const from = m.slice(0, 2);
      const to = m.slice(2, 4);
      chess.move({ from, to });
      const next = matchPieceIds(prev, chess.fen(), { from, to });
      expect(next.map((p) => p.id)).toEqual(prev.map((p) => p.id));
      prev = next;
    }
  });
});
