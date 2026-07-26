import { describe, expect, it } from "vitest";
import { parseCode, START_FEN } from "@/lib/state-core";

/** Compare piece placement + side + castling + ep (ignore clocks). */
const fenCore = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

describe("research URL decode via parseCode", () => {
  const cases: Array<{ code: string; core: string; uci?: string }> = [
    {
      code: "f-cm5icWtibnIvcHBwcDFwcHAvOC80cDMvNFAzLzgvUFBQUDFQUFAvUk5CUUtCTlIgdyBLUWtxIC0gMCAy",
      core: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
    },
    {
      code: "u-e2e4e7e5",
      core: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
      uci: "e2e4e7e5",
    },
    {
      code: "t-cm5icWtibnIvcHBwcDFwcHAvOC80cDMvNFAzLzgvUFBQUDFQUFAvUk5CUUtCTlIgdyBLUWtxIC0",
      core: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
    },
    {
      code: "p-Mc0k",
      core: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
      uci: "e2e4e7e5",
    },
    {
      code: "p-Mc0kGV5qFa-t",
      core: "r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq -",
      uci: "e2e4e7e5g1f3b8c6f1c4g8f6",
    },
    {
      code: "o-EADv___vABBCNWMkEREREZmZmZnKveus-oA",
      core: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
    },
    {
      code: "n-QjVjJBERAREAAAAAAAAQAAAAkAAAAAAAmZkJmcq966z6gA",
      core: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
    },
    {
      code: "g-H4sIAAAAAAAC_0s1SjVJNU81BQCH6qitCAAAAA",
      core: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
      uci: "e2e4e7e5",
    },
    {
      code: "z-H4sIAAAAAAAC_yvKSyrMTsor0i8AAkMg1rfQNykw1jcJMAayAoDAEIj1g_ycAr2d_IIUyhW8A7MLFXQVDBSMAGXyLYs8AAAA",
      core: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
    },
    {
      code: "d-Mc0k",
      core: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
      uci: "e2e4e7e5",
    },
    {
      code: "h-DHNJAA",
      core: "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq -",
      uci: "e2e4e7e5",
    },
    {
      code: "h-TAW12lp8j0QRUYRExEiMRmam6m5mc3OgAA",
      core: "r2q1rk1/1p2bppp/p1npbn2/4p3/4PP2/1NN1B3/PPP1B1PP/R2Q1RK1 w - -",
    },
  ];

  for (const { code, core, uci } of cases) {
    it(`decodes ${code.slice(0, 12)}…`, () => {
      const parsed = parseCode(code);
      expect(parsed.fen).not.toBe(START_FEN);
      expect(fenCore(parsed.fen)).toBe(core);
      if (uci) expect(parsed.uci).toBe(uci);
    });
  }
});
