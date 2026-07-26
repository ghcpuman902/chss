/**
 * OG-only board codec — intentionally separate from play-URL codecs (h-/p-/f-/…).
 *
 * Fast format (preferred): `b-<board64><w|b>`
 *   - board64: 64 URL-safe chars, a8→h1, PNBRQK / pnbrqk / .
 *   - last char: perspective w|b
 *   - decode = two slices, no base64, no chess.js
 *
 * Legacy: `o-<base64url(board64|w|b)>` still decodes for old crawler URLs.
 */

export type OgPerspective = "w" | "b";

export type OgPieceKey =
  | "wP"
  | "wN"
  | "wB"
  | "wR"
  | "wQ"
  | "wK"
  | "bP"
  | "bN"
  | "bB"
  | "bR"
  | "bQ"
  | "bK";

export type OgBoardMatrix = (OgPieceKey | null)[][];

export type OgDecoded = {
  matrix: OgBoardMatrix;
  perspective: OgPerspective;
  /** Raw 64-char placement string (a8→h1). */
  board64: string;
};

export const START_BOARD64 =
  "rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR";

const START_MATRIX: OgBoardMatrix = [
  ["bR", "bN", "bB", "bQ", "bK", "bB", "bN", "bR"],
  ["bP", "bP", "bP", "bP", "bP", "bP", "bP", "bP"],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  [null, null, null, null, null, null, null, null],
  ["wP", "wP", "wP", "wP", "wP", "wP", "wP", "wP"],
  ["wR", "wN", "wB", "wQ", "wK", "wB", "wN", "wR"],
];

const CHAR_TO_PIECE: Record<string, OgPieceKey> = {
  P: "wP",
  N: "wN",
  B: "wB",
  R: "wR",
  Q: "wQ",
  K: "wK",
  p: "bP",
  n: "bN",
  b: "bB",
  r: "bR",
  q: "bQ",
  k: "bK",
};

/** FEN piece-placement → 64-char board string (a8..h1). No chess.js. */
export const fenToBoard64 = (fen: string): string => {
  const placement = fen.split(" ")[0] ?? "";
  let out = "";
  for (let i = 0; i < placement.length; i += 1) {
    const ch = placement[i]!;
    if (ch === "/") continue;
    if (ch >= "1" && ch <= "8") {
      out += ".".repeat(ch.charCodeAt(0) - 48);
      continue;
    }
    out += ch;
  }
  return out.length === 64 ? out : START_BOARD64;
};

/** Preferred OG code: slice-decodeable, URL-safe, no base64. */
export const buildOgCode = (
  fen: string,
  perspective: OgPerspective,
): string => `b-${fenToBoard64(fen)}${perspective}`;

export const buildOgPath = (
  fen: string,
  perspective: OgPerspective,
  origin?: string,
): string => {
  const code = buildOgCode(fen, perspective);
  const path = `/og/${code}.png`;
  return origin ? `${origin}${path}` : path;
};

export const START_OG_CODE = buildOgCode(
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "w",
);

const board64ToMatrix = (board64: string): OgBoardMatrix | null => {
  if (board64.length !== 64) return null;
  const matrix: OgBoardMatrix = Array.from({ length: 8 }, () =>
    Array.from({ length: 8 }, () => null),
  );
  for (let i = 0; i < 64; i += 1) {
    const ch = board64[i]!;
    if (ch === ".") continue;
    const piece = CHAR_TO_PIECE[ch];
    if (!piece) return null;
    matrix[(i / 8) | 0]![i & 7] = piece;
  }
  return matrix;
};

const stripExtension = (raw: string): string => {
  // Board64 uses '.' for empty squares — only strip a trailing image suffix.
  return raw.trim().replace(/\.(png|jpe?g|webp|gif)$/i, "");
};

const atobSafe = (str: string) =>
  typeof atob === "function"
    ? atob(str)
    : Buffer.from(str, "base64").toString("utf8");

const base64urlDecode = (s: string): string => {
  try {
    const rem = s.length % 4;
    const pad = rem === 2 ? "==" : rem === 3 ? "=" : rem === 1 ? "===" : "";
    return atobSafe(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  } catch {
    return "";
  }
};

/**
 * Ultra-light OG decode. Never imports chess.js or play-URL codecs.
 * Returns start position on any failure.
 */
export const decodeOgCode = (rawCode: string | undefined): OgDecoded => {
  const fallback: OgDecoded = {
    matrix: START_MATRIX,
    perspective: "w",
    board64: START_BOARD64,
  };
  if (!rawCode) return fallback;

  const code = stripExtension(rawCode);
  if (!code) return fallback;

  // Fast path: b-<64><w|b>  (len 67)
  if (code.startsWith("b-") && code.length === 67) {
    const board64 = code.slice(2, 66);
    const persp = code[66];
    if (persp !== "w" && persp !== "b") return fallback;
    const matrix = board64ToMatrix(board64);
    if (!matrix) return fallback;
    return { matrix, perspective: persp, board64 };
  }

  // Legacy: o-<base64url(board64|w|b)>
  if (code.startsWith("o-")) {
    const decoded = base64urlDecode(code.slice(2));
    if (!decoded) return fallback;
    const sep = decoded.indexOf("|");
    if (sep !== 64) return fallback;
    const board64 = decoded.slice(0, 64);
    const persp = decoded[65] === "b" ? "b" : "w";
    const matrix = board64ToMatrix(board64);
    if (!matrix) return fallback;
    return { matrix, perspective: persp, board64 };
  }

  return fallback;
};
