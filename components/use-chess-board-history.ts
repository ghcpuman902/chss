"use client";

import { useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { Chess, type Move } from "chess.js";
import { parseCode, type ParsedState } from "@/lib/state-core";
import { readUciMoveAt } from "@/lib/uci";

type BoardUiAction =
  | { type: "clear_selection" }
  | { type: "set_can_undo"; value: boolean }
  | { type: "hydrate_from_history"; state: ParsedState };

type UseChessBoardHistoryArgs = {
  initialCode: string;
  gameStateRef: MutableRefObject<ParsedState>;
  historyRef: MutableRefObject<ParsedState[]>;
  historyStepRef: MutableRefObject<number>;
  onStateChangeRef: MutableRefObject<((state: ParsedState) => void) | undefined>;
  setGameState: Dispatch<SetStateAction<ParsedState>>;
  dispatchUi: Dispatch<BoardUiAction>;
};

const computeLastMoveDetails = (
  uci?: string,
): { to?: string; pieceName?: string } => {
  try {
    if (!uci || uci.length < 4) return {};
    const chess = new Chess();
    for (let i = 0; i < uci.length; ) {
      const chunk = readUciMoveAt(uci, i);
      if (!chunk) break;
      const res = chess.move({
        from: chunk.from,
        to: chunk.to,
        promotion: chunk.promotion as Move["promotion"] | undefined,
      });
      if (!res) break;
      i += chunk.step;
      if (i >= uci.length) {
        const pieceMap: Record<string, string> = {
          p: "pawn",
          n: "knight",
          b: "bishop",
          r: "rook",
          q: "queen",
          k: "king",
        };
        return {
          to: String(res.to).toLowerCase(),
          pieceName: pieceMap[String(res.piece).toLowerCase()],
        };
      }
    }
  } catch {
    /* ignore */
  }
  return {};
};

const setDocumentTitle = (
  state: ParsedState,
  details?: { to?: string; pieceName?: string },
) => {
  try {
    const site = "chss.chat";
    const nextColorLc = state.sideToMove === "w" ? "white" : "black";
    if (details?.to && details.pieceName) {
      const movedColor = state.sideToMove === "w" ? "Black" : "White";
      document.title = `${movedColor} ${details.pieceName} to ${details.to}, ${nextColorLc}'s turn | ${site}`;
    } else {
      document.title = `${nextColorLc}'s turn | ${site}`;
    }
  } catch {
    /* ignore */
  }
};

const getCodeFromLocation = (): string => {
  try {
    const path = window.location.pathname || "";
    const prefix = "/p";
    const idx = path.indexOf(prefix);
    if (idx === -1) return "";
    const after = path.slice(idx + prefix.length);
    if (!after || after === "/") return "";
    const seg = after.startsWith("/") ? after.slice(1) : after;
    return decodeURIComponent(seg);
  } catch {
    return "";
  }
};

/** Browser history sync for undo / back-forward on `/p/[code]`. */
export const useChessBoardHistory = ({
  initialCode,
  gameStateRef,
  historyRef,
  historyStepRef,
  onStateChangeRef,
  setGameState,
  dispatchUi,
}: UseChessBoardHistoryArgs) => {
  useEffect(() => {
    try {
      if (window.history?.replaceState) {
        // Always start this mount at step 0. Leftover history.state.step from a
        // prior pushState (e.g. refresh) must not enable Undo/Share — the
        // in-memory move stack is only [initialState] until the user moves.
        historyStepRef.current = 0;
        window.history.replaceState(
          {
            step: 0,
            code: initialCode,
            fen: gameStateRef.current.fen,
            sideToMove: gameStateRef.current.sideToMove,
            uci: gameStateRef.current.uci,
          },
          "",
          window.location.pathname + window.location.search,
        );
        dispatchUi({ type: "set_can_undo", value: false });
        setDocumentTitle(gameStateRef.current, undefined);
      }
    } catch {
      /* ignore */
    }

    const onPopState = (event: PopStateEvent) => {
      try {
        const codeStr = getCodeFromLocation();
        const step =
          event.state && typeof event.state.step === "number"
            ? event.state.step
            : codeStr && codeStr !== initialCode
              ? 1
              : 0;
        historyStepRef.current = step;
        const desiredLen = Math.max(1, step + 1);
        if (historyRef.current.length !== desiredLen) {
          historyRef.current.length = desiredLen;
        }

        const fromHistory = historyRef.current[desiredLen - 1];
        const stateFromHistoryApi =
          event.state && typeof event.state.fen === "string"
            ? {
                fen: event.state.fen as string,
                sideToMove: (event.state.sideToMove === "b" ? "b" : "w") as
                  | "w"
                  | "b",
                uci:
                  typeof event.state.uci === "string"
                    ? (event.state.uci as string)
                    : undefined,
                uKey:
                  typeof event.state.uKey === "string"
                    ? (event.state.uKey as string)
                    : undefined,
              }
            : null;
        const parsed = fromHistory ?? stateFromHistoryApi ?? parseCode(codeStr);
        historyRef.current[desiredLen - 1] = parsed;

        setGameState(parsed);
        dispatchUi({ type: "hydrate_from_history", state: parsed });
        dispatchUi({
          type: "set_can_undo",
          value: historyStepRef.current > 0,
        });
        onStateChangeRef.current?.(parsed);
        setDocumentTitle(parsed, computeLastMoveDetails(parsed.uci));
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [
    initialCode,
    dispatchUi,
    gameStateRef,
    historyRef,
    historyStepRef,
    onStateChangeRef,
    setGameState,
  ]);
};

export type { BoardUiAction };
