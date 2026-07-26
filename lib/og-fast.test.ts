import { describe, expect, it } from "vitest";
import {
  START_BOARD64,
  buildLegacyOgCode,
  buildOgCode,
  fenToBoard64,
} from "@/lib/og-encoding";
import { decodeOgCode } from "@/lib/og-fast";

describe("og-fast codec", () => {
  const fenAfterE4 =
    "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1";

  it("encodes b- without base64 (len 67)", () => {
    const code = buildOgCode(fenAfterE4, "b");
    expect(code.startsWith("b-")).toBe(true);
    expect(code).toHaveLength(67);
    expect(code.endsWith("b")).toBe(true);
  });

  it("round-trips b- into matrix + perspective", () => {
    const code = buildOgCode(fenAfterE4, "b");
    const decoded = decodeOgCode(code);
    expect(decoded.perspective).toBe("b");
    expect(decoded.board64).toBe(fenToBoard64(fenAfterE4));
    // White pawn on e4 → index: file e=4, rank 4 → from a8: rank row 4 = index 4*8+4 = 36
    expect(decoded.matrix[4]![4]).toBe("wP");
  });

  it("still decodes legacy o- codes", () => {
    const legacy = buildLegacyOgCode(fenAfterE4, "w");
    expect(legacy.startsWith("o-")).toBe(true);
    const decoded = decodeOgCode(legacy);
    expect(decoded.perspective).toBe("w");
    expect(decoded.board64).toBe(fenToBoard64(fenAfterE4));
  });

  it("strips .png before decode", () => {
    const code = buildOgCode(fenAfterE4, "b");
    const decoded = decodeOgCode(`${code}.png`);
    expect(decoded.perspective).toBe("b");
    expect(decoded.board64).toHaveLength(64);
  });

  it("falls back to start on garbage", () => {
    const decoded = decodeOgCode("not-a-code");
    expect(decoded.board64).toBe(START_BOARD64);
    expect(decoded.perspective).toBe("w");
  });
});
