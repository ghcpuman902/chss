import { getPieceDataUrl } from "@/lib/piece-svg-cache";
import { decodeOgCode } from "@/lib/og-fast";

interface OGTemplateProps {
  query?: string;
}

/** Square board pixels — smaller than 800 cuts Satori work for crawlers. */
export const OG_SIZE = 640;
const PIECE_PX = 58;

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

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
      }}
    >
      {rankOrder.map((rIdx) => (
        <div
          key={`rank-${rIdx}`}
          style={{
            display: "flex",
            flexDirection: "row",
            flex: 1,
          }}
        >
          {fileOrder.map((fIdx) => {
            const piece = matrix[rIdx]![fIdx];
            const isLight = (rIdx + fIdx) % 2 === 0;
            return (
              <div
                key={`sq-${rIdx}-${fIdx}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: 1,
                  height: "100%",
                  backgroundColor: isLight ? "#f0d9b5" : "#b58863",
                }}
              >
                {piece ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={getPieceDataUrl(piece)}
                    alt=""
                    width={PIECE_PX}
                    height={PIECE_PX}
                    style={{ display: "block" }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
