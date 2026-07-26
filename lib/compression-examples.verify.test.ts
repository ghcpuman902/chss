import { Chess } from "chess.js";
import { describe, expect, it } from "vitest";
import { fenToBoard64, START_BOARD64 } from "@/lib/og-encoding";
import {
  lookupBooksToIndex,
  parseResearchCode,
} from "@/lib/research-url-decode";
import { parseCode } from "@/lib/state-core";

const fenCore = (fen: string) => fen.split(" ").slice(0, 4).join(" ");
const fullUrl = (code: string) => `https://chss.chat/p/${code}`;

const AFTER_E4_E5 = (() => {
  const chess = new Chess();
  chess.move("e4");
  chess.move("e5");
  return chess.fen();
})();

/** Mirrors LOOKUP_CODEBOOK_SAMPLE on the research page. */
const DEMO_LOOKUP_INDEX = lookupBooksToIndex({
  2: { e2e4e7e5: 0, e2e4c7c5: 2 },
  8: { e2e4c7c5g1f3d7d6d2d4c5d4f3d4g8f6: 0 },
});

const EXAMPLES: {
  name: string;
  code: string;
  expectE4E5?: boolean;
  needsBook?: boolean;
  urlLen?: number;
}[] = [
  {
    name: "native_fen",
    code: "f-cm5icWtibnIvcHBwcDFwcHAvOC80cDMvNFAzLzgvUFBQUDFQUFAvUk5CUUtCTlIgdyBLUWtxIC0gMCAy",
    expectE4E5: true,
  },
  { name: "native_uci", code: "u-e2e4e7e5", expectE4E5: true, urlLen: 30 },
  {
    name: "trim_fen",
    code: "t-cm5icWtibnIvcHBwcDFwcHAvOC80cDMvNFAzLzgvUFBQUDFQUFAvUk5CUUtCTlIgdyBLUWtxIC0",
    expectE4E5: true,
  },
  { name: "packed_uci", code: "p-Mc0k", expectE4E5: true, urlLen: 26 },
  {
    name: "occupancy",
    code: "o-EADv___vABBCNWMkEREREZmZmZnKveus-AAAQA",
    expectE4E5: true,
    urlLen: 60,
  },
  {
    name: "naive_4bit",
    code: "n-QjVjJBERAREAAAAAAAAQAAAAkAAAAAAAmZkJmcq966z4AABA",
    expectE4E5: true,
    urlLen: 70,
  },
  {
    name: "gzip_uci",
    code: "g-H4sIAAAAAAAC_0s1SjVJNU81BQCH6qitCAAAAA",
    expectE4E5: true,
  },
  {
    name: "gzip_fen",
    code: "z-H4sIAAAAAAAC_yvKSyrMTsor0i8AAkMg1rfQNykw1jcJMAayAoDAEIj1g_ycAr2d_IIUyhW8A7MLFXQVDBSMAGXyLYs8AAAA",
    expectE4E5: true,
  },
  {
    name: "lookup",
    code: "d-gAA",
    expectE4E5: true,
    needsBook: true,
    urlLen: 25,
  },
  {
    name: "hybrid_e4e5",
    code: "h-oAA",
    expectE4E5: true,
    needsBook: true,
    urlLen: 25,
  },
  {
    name: "hybrid_sicilian",
    code: "h-RA2z6yZ-jkQZDQRFREiMRmZupq5mc3sYAIBQ",
  },
  {
    name: "italian_uci",
    code: "u-e2e4e7e5g1f3b8c6f1c4g8f6",
  },
  { name: "italian_packed", code: "p-Mc0kGV5qFa-t" },
];

describe("compression research method-card examples", () => {
  for (const ex of EXAMPLES) {
    it(`${ex.name} decodes to a non-start board with correct URL length`, () => {
      const product = parseCode(ex.code);
      const research =
        parseResearchCode(ex.code, { lookupIndex: DEMO_LOOKUP_INDEX }) ??
        parseResearchCode(ex.code);
      const decoded = research ?? {
        fen: product.fen,
        sideToMove: product.sideToMove,
        uci: product.uci,
      };

      expect(fenToBoard64(decoded.fen)).not.toBe(START_BOARD64);
      if (ex.urlLen !== undefined) {
        expect(fullUrl(ex.code).length).toBe(ex.urlLen);
      }

      if (ex.expectE4E5) {
        expect(fenCore(decoded.fen)).toBe(fenCore(AFTER_E4_E5));
        expect(decoded.sideToMove).toBe("w");
      }

      if (ex.needsBook) {
        expect(fenToBoard64(product.fen)).toBe(START_BOARD64);
        expect(fenCore(decoded.fen)).toBe(fenCore(AFTER_E4_E5));
      }

      if (ex.name === "hybrid_sicilian") {
        expect(decoded.sideToMove).toMatch(/^[wb]$/);
        expect(parseResearchCode(ex.code)).toBeTruthy();
      }
    });
  }
});
