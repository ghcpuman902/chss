import {
  BishopIcon,
  KingIcon,
  KnightIcon,
  PawnIcon,
  QueenIcon,
  RookIcon,
} from "@/components/pieces";

type PieceColor = "w" | "b";
type PieceType = "p" | "n" | "b" | "r" | "q" | "k";
type PieceKey =
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

const FILES = "abcdefgh";
const RANKS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

const PIECE_COMPONENT = {
  wP: PawnIcon,
  wN: KnightIcon,
  wB: BishopIcon,
  wR: RookIcon,
  wQ: QueenIcon,
  wK: KingIcon,
  bP: PawnIcon,
  bN: KnightIcon,
  bB: BishopIcon,
  bR: RookIcon,
  bQ: QueenIcon,
  bK: KingIcon,
} as const;

type BoardPiece = {
  type: PieceType;
  color: PieceColor;
  square: string;
};

const piecesFromFen = (fen: string): BoardPiece[] => {
  const rows = fen.split(" ")[0]?.split("/") ?? [];
  const out: BoardPiece[] = [];
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

/** Static mini board for research examples (server-safe). */
export const ResearchExampleBoard = ({
  fen,
  label,
}: {
  fen: string;
  label: string;
}) => {
  const pieces = piecesFromFen(fen);

  return (
    <div
      className="relative border border-border overflow-hidden rounded-none w-28 sm:w-32 aspect-square shrink-0"
      role="img"
      aria-label={label}
    >
      <div className="absolute inset-0 grid grid-cols-8 grid-rows-8">
        {RANKS.map((rank) =>
          FILES.split("").map((file, fi) => {
            const square = `${file}${rank}`;
            const isLight = (8 - rank + fi) % 2 === 0;
            return (
              <div
                key={square}
                className={`chess-square cursor-default ${isLight ? "light" : "dark"}`}
              />
            );
          }),
        )}
      </div>
      {pieces.map((piece) => {
        const key = (piece.color + piece.type.toUpperCase()) as PieceKey;
        const Icon = PIECE_COMPONENT[key];
        const col = piece.square.charCodeAt(0) - 97;
        const row = 8 - Number(piece.square[1]);
        return (
          <span
            key={`${piece.color}${piece.type}-${piece.square}`}
            className={`chess-piece absolute inline-flex items-center justify-center pointer-events-none top-0 left-0 ${
              piece.color === "w" ? "white" : "black"
            }`}
            style={{
              width: "12.5%",
              height: "12.5%",
              transform: `translate(${col * 100}%, ${row * 100}%)`,
            }}
          >
            <Icon className="block w-[72%] h-[72%]" aria-hidden />
          </span>
        );
      })}
    </div>
  );
};
