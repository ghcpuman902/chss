// app/p/[[...code]]/page.tsx

import { Suspense, cache } from "react";
import { parseCode, generateCode, START_FEN, type ParsedState } from "@/lib/state";
import { parseUrlSegment } from "@/lib/utils";
import { buildOgCode } from "@/lib/og-encoding";
import { ChessBoard } from "@/components/chess-board";
import { redirect } from "next/navigation";
import type { Move } from "chess.js";
import { isRawUciString, readUciMoveAt } from "@/lib/uci";

type SearchP = string | string[] | undefined;

/** Per-request dedupe between generateMetadata + page (server-cache-react). */
const resolveGameState = cache((codeString: string): ParsedState => {
  try {
    return parseCode(codeString);
  } catch {
    return {
      fen: START_FEN,
      sideToMove: "w",
    };
  }
});

const PIECE_NAME: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

const resolvePerspective = (
  codeString: string,
  sideToMove: "w" | "b",
  p: SearchP,
): "white" | "black" => {
  if (p === "w" || p === "b") return p === "w" ? "white" : "black";
  if (!codeString) return "white";
  return sideToMove === "w" ? "white" : "black";
};

const pickSearchP = (p: SearchP): "w" | "b" | undefined =>
  p === "w" || p === "b" ? p : undefined;

export async function generateMetadata(props: PageProps<"/p/[[...code]]">) {
  const [{ code }, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);
  const codeString = parseUrlSegment(code);
  const p = pickSearchP(searchParams?.p);

  let title = "Your move";
  let ogCode = "";
  try {
    const parsed = resolveGameState(codeString);
    const { sideToMove } = parsed;

    let lastToSquare: string | undefined;
    let lastPieceName: string | undefined;
    const uciCandidate = (() => {
      if (!codeString) return "";
      if (codeString.startsWith("u-")) return codeString.slice(2);
      if (codeString.startsWith("f-")) return "";
      if (/^[tponzgdh]-/.test(codeString)) return parsed.uci || "";
      return codeString;
    })();
    const useUci = !!uciCandidate && isRawUciString(uciCandidate);
    const uciToSimulate = useUci ? uciCandidate : parsed.uci || "";
    if (uciToSimulate && uciToSimulate.length >= 4) {
      const { Chess } = await import("chess.js");
      const chess = new Chess();
      for (let i = 0; i < uciToSimulate.length; ) {
        const chunk = readUciMoveAt(uciToSimulate, i);
        if (!chunk) break;
        const res = chess.move({
          from: chunk.from,
          to: chunk.to,
          promotion: chunk.promotion as Move["promotion"] | undefined,
        });
        if (!res) break;
        i += chunk.step;
        if (i >= uciToSimulate.length) {
          lastToSquare = String(res.to).toLowerCase();
          lastPieceName = PIECE_NAME[String(res.piece).toLowerCase()];
        }
      }
    }

    if (lastToSquare && lastPieceName) {
      const movedColor = sideToMove === "w" ? "Black" : "White";
      const nextColor = sideToMove === "w" ? "white" : "black";
      title = `${movedColor} ${lastPieceName} to ${lastToSquare}, ${nextColor}'s turn`;
    } else {
      const nextColor = sideToMove === "w" ? "White" : "Black";
      title = `${nextColor}'s turn`;
    }
    const perspectiveLetter: "w" | "b" =
      p ?? (codeString ? sideToMove : "w");
    ogCode = buildOgCode(parsed.fen, perspectiveLetter);
  } catch {
    /* keep defaults */
  }
  return {
    title,
    openGraph: { title, images: [`https://chss.chat/og/${ogCode}.png`] },
    twitter: {
      card: "summary_large_image" as const,
      title,
      images: [`https://chss.chat/og/${ogCode}.png`],
    },
  };
}

const BoardFallback = () => (
  <main className="bg-background">
    <section className="relative overflow-hidden">
      <div className="container mx-auto max-w-2xl px-4 py-24">
        <div
          className="mx-auto aspect-square w-full max-w-md animate-pulse rounded-sm bg-muted"
          aria-hidden="true"
        />
      </div>
    </section>
  </main>
);

async function PlayPage({
  params,
  searchParams,
}: {
  params: Promise<{ code?: string[] }>;
  searchParams: Promise<{ p?: string | string[] }>;
}) {
  const [{ code }, { p: rawP }] = await Promise.all([params, searchParams]);
  const codeString = parseUrlSegment(code);
  const p = pickSearchP(rawP);
  const gameState = resolveGameState(codeString);

  // Canonicalize URL:
  // - Bare UCI and native u-<UCI> history: keep as-is for detailed titles / demos
  // - Research codecs (compression scoreboard): keep prefix so demos stay honest
  // - Otherwise prefer short u- codes when available
  const preferred = generateCode(gameState);
  const isBareUci =
    !!codeString &&
    !codeString.startsWith("u-") &&
    !codeString.startsWith("f-") &&
    isRawUciString(codeString);
  const isNativeUciHistory =
    !!codeString &&
    codeString.startsWith("u-") &&
    isRawUciString(codeString.slice(2));
  const isResearchCode = /^[tponzgdh]-/.test(codeString);
  if (
    !isBareUci &&
    !isNativeUciHistory &&
    !isResearchCode &&
    codeString &&
    preferred &&
    codeString !== preferred
  ) {
    const search = p === "w" || p === "b" ? `?p=${p}` : "";
    redirect(`/p/${encodeURIComponent(preferred)}${search}`);
  }

  const perspective = resolvePerspective(
    codeString,
    gameState.sideToMove,
    p,
  );

  return (
    <main className="bg-background">
      <section className="relative overflow-hidden">
        <div className="container mx-auto max-w-2xl px-4 py-24">
          <ChessBoard initialState={gameState} perspective={perspective} />
        </div>
      </section>
    </main>
  );
}

export default function Page(props: PageProps<"/p/[[...code]]">) {
  return (
    <Suspense fallback={<BoardFallback />}>
      <PlayPage params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}
