import { describe, expect, it } from "vitest";
import { isRawUciString, readUciMoveAt } from "@/lib/uci";
import { parseCode, START_FEN } from "@/lib/state-core";

describe("readUciMoveAt", () => {
  it("does not treat b-file follow-ups as promotions", () => {
    const uci = "e2e4e7e5g1f3b8c6";
    // g1f3 starts at index 8; next char is 'b' from b8c6
    const chunk = readUciMoveAt(uci, 8);
    expect(chunk).toEqual({
      from: "g1",
      to: "f3",
      promotion: undefined,
      step: 4,
    });
  });

  it("accepts promotion only for pawn advances 7→8 / 2→1", () => {
    const promo = readUciMoveAt("e7e8q", 0);
    expect(promo).toEqual({
      from: "e7",
      to: "e8",
      promotion: "q",
      step: 5,
    });

    const quiet = readUciMoveAt("e2e4", 0);
    expect(quiet?.promotion).toBeUndefined();
    expect(quiet?.step).toBe(4);
  });

  it("does not treat castling + b-file follow-up as a promotion", () => {
    const uci = "e1g1b4c3";
    expect(readUciMoveAt(uci, 0)).toEqual({
      from: "e1",
      to: "g1",
      promotion: undefined,
      step: 4,
    });
  });
});

describe("Italian 6-ply native UCI", () => {
  const ITALIAN = "u-e2e4e7e5g1f3b8c6f1c4g8f6";
  const TWO_KNIGHTS_CORE =
    "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -";

  it("decodes to Two Knights, not the start position", () => {
    const parsed = parseCode(ITALIAN);
    expect(parsed.fen).not.toBe(START_FEN);
    expect(parsed.fen.split(" ").slice(0, 4).join(" ")).toBe(TWO_KNIGHTS_CORE);
    expect(parsed.uci).toBe("e2e4e7e5g1f3b8c6f1c4g8f6");
    expect(parsed.sideToMove).toBe("w");
  });
});

describe("isRawUciString", () => {
  it("accepts contiguous UCI including promotions", () => {
    expect(isRawUciString("e2e4e7e5g1f3b8c6")).toBe(true);
    expect(isRawUciString("e7e8q")).toBe(true);
    expect(isRawUciString("not-uci")).toBe(false);
  });
});

// samples smoke — kept near UCI tests
import { MEASURE_DEMO_SAMPLES } from '@/lib/research-url-codecs';

describe('MEASURE_DEMO_SAMPLES', () => {
  it('is a non-empty fixed Italian progression', () => {
    expect(MEASURE_DEMO_SAMPLES.length).toBeGreaterThan(20);
    expect(MEASURE_DEMO_SAMPLES[0]!.ply).toBe(1);
    expect(MEASURE_DEMO_SAMPLES.at(-1)!.ply).toBe(MEASURE_DEMO_SAMPLES.length);
    // ply increases monotonically
    for (let i = 1; i < MEASURE_DEMO_SAMPLES.length; i += 1) {
      expect(MEASURE_DEMO_SAMPLES[i]!.ply).toBe(MEASURE_DEMO_SAMPLES[i - 1]!.ply + 1);
    }
  });
});
