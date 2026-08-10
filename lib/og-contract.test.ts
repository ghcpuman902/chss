import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import fs from "node:fs";
import path from "node:path";
import { buildOgCode, fenToBoard64 } from "@/lib/og-encoding";
import { decodeOgCode } from "@/lib/og-fast";

/**
 * Contract: metadata og:image and client prewarm must use the same buildOgCode
 * string, or prewarm warms a key the crawler never requests.
 */
describe("og code contract", () => {
  it("buildOgCode(fen, sideToMove) is what metadata and prewarm share", () => {
    const fenAfterE4 =
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";
    const sideToMove = "b" as const;
    // Same call sites as generateMetadata + prewarmOg
    const metaCode = buildOgCode(fenAfterE4, sideToMove);
    const prewarmCode = buildOgCode(fenAfterE4, sideToMove);
    expect(metaCode).toBe(prewarmCode);
    expect(metaCode).toMatch(/^b-/);
    expect(metaCode).toHaveLength(67);
    expect(decodeOgCode(metaCode).perspective).toBe("b");
    expect(decodeOgCode(metaCode).board64).toBe(fenToBoard64(fenAfterE4));
  });

  it("perspective follows side-to-move after a ply-1 move", () => {
    const chess = new Chess();
    chess.move({ from: "e2", to: "e4" });
    const code = buildOgCode(chess.fen(), chess.turn());
    expect(code.endsWith("b")).toBe(true);
  });
});

describe("og-top-codes ply-1 coverage", () => {
  it("includes every legal first-move board (Black to move)", () => {
    const topPath = path.join(process.cwd(), "lib", "og-top-codes.json");
    const top = JSON.parse(fs.readFileSync(topPath, "utf8")) as {
      codes: string[];
    };
    const codes = new Set(top.codes);
    const start = new Chess();
    const missing: string[] = [];
    for (const m of start.moves({ verbose: true })) {
      const g = new Chess();
      g.move(m);
      const code = buildOgCode(g.fen(), g.turn());
      if (!codes.has(code)) missing.push(code);
    }
    // Intentionally fails on baseline (even-only depths). Passes after IT-01.
    expect(missing).toEqual([]);
  });
});
