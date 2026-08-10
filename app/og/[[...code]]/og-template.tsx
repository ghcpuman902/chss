import { getPieceDataUrl } from "@/lib/piece-svg-cache";
import { decodeOgCode, type OgPieceKey } from "@/lib/og-fast";

interface OGTemplateProps {
  query?: string;
}

/** Square board pixels — smaller than 800 cuts layout work for crawlers. */
export const OG_SIZE = 640;
const PIECE_PX = 58;
const CELL = OG_SIZE / 8;
const PIECE_PAD = (CELL - PIECE_PX) / 2;

const LIGHT = "#f0d9b5";
const DARK = "#b58863";

/** Single SVG checkerboard — one <img> instead of 64 flex cells. */
const buildBoardBackgroundDataUrl = (): string => {
  const rects: string[] = [];
  for (let r = 0; r < 8; r += 1) {
    for (let f = 0; f < 8; f += 1) {
      const fill = (r + f) % 2 === 0 ? LIGHT : DARK;
      rects.push(
        `<rect x="${f}" y="${r}" width="1" height="1" fill="${fill}"/>`,
      );
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">${rects.join("")}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const BOARD_BG = buildBoardBackgroundDataUrl();

type PlacedPiece = {
  key: string;
  piece: OgPieceKey;
  left: number;
  top: number;
};

export default function OGTemplate({ query }: OGTemplateProps) {
  const { matrix, perspective } = decodeOgCode(query);
  const rankOrder =
    perspective === "w"
      ? ([0, 1, 2, 3, 4, 5, 6, 7] as const)
      : ([7, 6, 5, 4, 3, 2, 1, 0] as const);
  const fileOrder =
    perspective === "w"
      ? ([0, 1, 2, 3, 4, 5, 6, 7] as const)
      : ([7, 6, 5, 4, 3, 2, 1, 0] as const);

  const pieces: PlacedPiece[] = [];
  for (let displayRank = 0; displayRank < 8; displayRank += 1) {
    const rIdx = rankOrder[displayRank]!;
    for (let displayFile = 0; displayFile < 8; displayFile += 1) {
      const fIdx = fileOrder[displayFile]!;
      const piece = matrix[rIdx]![fIdx];
      if (!piece) continue;
      pieces.push({
        key: `${rIdx}-${fIdx}`,
        piece,
        left: displayFile * CELL + PIECE_PAD,
        top: displayRank * CELL + PIECE_PAD,
      });
    }
  }

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        position: "relative",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={BOARD_BG}
        alt=""
        width={OG_SIZE}
        height={OG_SIZE}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: OG_SIZE,
          height: OG_SIZE,
        }}
      />
      {pieces.map(({ key, piece, left, top }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={key}
          src={getPieceDataUrl(piece)}
          alt=""
          width={PIECE_PX}
          height={PIECE_PX}
          style={{
            position: "absolute",
            left,
            top,
            width: PIECE_PX,
            height: PIECE_PX,
            display: "block",
          }}
        />
      ))}
    </div>
  );
}
