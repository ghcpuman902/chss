import { getPieceDataUrl } from "@/lib/piece-svg-cache";

interface OGTemplateProps {
    query?: string;
}

type PieceKey =
    | "wP" | "wN" | "wB" | "wR" | "wQ" | "wK"
    | "bP" | "bN" | "bB" | "bR" | "bQ" | "bK";

// Local base64url decode without importing chess.js or state utilities
const atobSafe = (str: string) =>
    typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('utf8');

const base64urlDecode = (s: string) => {
    try {
        const rem = s.length % 4;
        const pad = rem === 2 ? '==' : rem === 3 ? '=' : rem === 1 ? '===' : '';
        const base64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
        return atobSafe(base64);
    } catch {
        return '';
    }
};

// Decode compact board encoding into a matrix
// Encoding format: "o-" + base64url( board64 + "|" + perspective )
// - board64: 64 chars row-major from a8..h1 using symbols: P N B R Q K (white), p n b r q k (black), . (empty)
// - perspective: "w" or "b"
const decodeBoardEncoding = (rawCode: string): { matrix: (PieceKey | null)[][]; perspective: 'w' | 'b' } => {
    const fallbackMatrix: (PieceKey | null)[][] = [
        ["bR", "bN", "bB", "bQ", "bK", "bB", "bN", "bR"],
        ["bP", "bP", "bP", "bP", "bP", "bP", "bP", "bP"],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        ["wP", "wP", "wP", "wP", "wP", "wP", "wP", "wP"],
        ["wR", "wN", "wB", "wQ", "wK", "wB", "wN", "wR"],
    ];
    const fallback = { matrix: fallbackMatrix, perspective: 'w' as const };

    const cleaned = (rawCode || '').trim();
    const code = cleaned.split('.')[0] ?? '';
    if (!code.startsWith('o-')) return fallback;
    const payload = code.slice(2);
    const decoded = base64urlDecode(payload);
    if (!decoded) return fallback;
    const [board64, persp] = decoded.split('|');
    if (!board64 || board64.length !== 64) return fallback;
    const perspective = (persp === 'b' ? 'b' : 'w');
    const matrix: (PieceKey | null)[][] = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
    for (let i = 0; i < 64; i++) {
        const ch = board64[i] as string;
        const r = Math.floor(i / 8);
        const f = i % 8;
        if (ch === '.') {
            matrix[r][f] = null;
            continue;
        }
        const isUpper = ch === ch.toUpperCase();
        const color = isUpper ? 'w' : 'b';
        const type = ch.toUpperCase(); // P N B R Q K
        const key = (color + type) as PieceKey;
        matrix[r][f] = key;
    }
    return { matrix, perspective };
};

export default function OGTemplate({ query }: OGTemplateProps) {
    const { matrix, perspective } = decodeBoardEncoding(query ?? '');
    const rankOrder = perspective === 'w' ? [0,1,2,3,4,5,6,7] as const : [7,6,5,4,3,2,1,0] as const;
    const fileOrder = perspective === 'w' ? [0,1,2,3,4,5,6,7] as const : [7,6,5,4,3,2,1,0] as const;
	
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				width: "100%",
				height: "100%",
				padding: "0px",
				boxSizing: "border-box",
			}}
		>
			{/* Board container (square) */}
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					width: "100%",
					height: "100%",
					maxWidth: "800px",
					maxHeight: "800px",
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
                            const piece = matrix[rIdx][fIdx];
							const isLight = (rIdx + fIdx) % 2 === 0;
							const bg = isLight ? "#f0d9b5" : "#b58863";
							return (
								<div
									key={`sq-${rIdx}-${fIdx}`}
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "center",
										flex: 1,
										height: "100%",
										backgroundColor: bg,
									}}
								>
									{piece && (
										<img
											src={getPieceDataUrl(piece)}
											alt=""
											width={72}
											height={72}
											style={{ display: "block" }}
										/>
									)}
								</div>
							);
						})}
					</div>
				))}
			</div>
		</div>
	);
}
