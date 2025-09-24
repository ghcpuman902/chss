import { PreSatori } from "@/lib/pre-satori";
import { parseCode, type ParsedState } from "@/lib/state";

interface OGTemplateProps {
	query?: string;
}

type PieceKey =
	| "wP" | "wN" | "wB" | "wR" | "wQ" | "wK"
	| "bP" | "bN" | "bB" | "bR" | "bQ" | "bK";

const getPieceSvg = (piece: PieceKey): string => {
	const isWhite = piece.startsWith("w");
	const color = isWhite ? "#ffffff" : "#000000";
	switch (piece) {
		case "wP":
		case "bP":
			return `<?xml version="1.0" encoding="UTF-8"?>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
				<path d="M95.5,500l111.79-223.57c-31.3-15.67-52.79-48.04-52.79-85.43,0-52.74,42.76-95.5,95.5-95.5s95.5,42.76,95.5,95.5c0,37.39-21.49,69.76-52.79,85.43l111.79,223.57H95.5Z" fill="${color}"/>
			</svg>`;
		case "wR":
		case "bR":
			return `<?xml version="1.0" encoding="UTF-8"?>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
				<polygon points="350.72 71.17 350.72 500 148.87 500 148.87 71.17 208.87 71.17 208.87 166.67 219.73 166.67 219.73 71.17 279.73 71.17 279.73 166.67 290.72 166.67 290.72 71.17 350.72 71.17" fill="${color}"/>
			</svg>`;
		case "wN":
		case "bN":
			return `<?xml version="1.0" encoding="UTF-8"?>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
				<path d="M95.5,500l101.46-202.91-77.39,46.16-65.33-77.85L182.33,117.07h.01c2.87-3.33,6.04-6.46,9.52-9.38l-21-25.03c2.28-.19,4.6-.29,6.93-.29,14.07,0,27.33,3.49,38.96,9.66,42.8-19.34,94.88-8.84,126.56,28.9,38.16,45.48,32.23,113.29-13.25,151.45-6.37,5.34-13.17,9.82-20.28,13.45l-21.9-42.98h-.01l-9.2,5.49,125.83,251.66H95.5Z" fill="${color}"/>
			</svg>`;
		case "wB":
		case "bB":
			return `<?xml version="1.0" encoding="UTF-8"?>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
				<path d="M95.5,500l127.35-254.71c-32.6-11.25-56.02-42.2-56.02-78.62,0-15.15,4.05-29.36,11.13-41.59L250,.34l72.04,124.74c7.08,12.23,11.13,26.44,11.13,41.59,0,36.42-23.42,67.37-56.02,78.62l127.35,254.71H95.5Z" fill="${color}"/>
			</svg>`;
		case "wQ":
		case "bQ":
			return `<?xml version="1.0" encoding="UTF-8"?>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
				<path d="M404.5,500l-71.2-333.3L368.9,0h-237.8l35.6,166.7-71.2,333.3h309ZM250,24.7c20.9,0,40,7.7,54.6,20.5h0c17.5,15.2,28.5,37.7,28.5,62.7s-9.3,43.8-24.4,58.8c-15,15-35.8,24.3-58.8,24.3s-43.7-9.3-58.8-24.3c-15.1-15-24.4-35.8-24.4-58.8s11.1-47.5,28.5-62.7h0c14.6-12.8,33.7-20.5,54.6-20.5Z" fill="${color}"/>
			</svg>`;
		case "wK":
		case "bK":
			return `<?xml version="1.0" encoding="UTF-8"?>
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
				<polygon points="220.6 166.67 220.6 113.5 163.95 113.5 163.95 53.5 220.6 53.5 220.6 -.43 280.6 -.43 280.6 53.5 336.05 53.5 336.05 113.5 280.6 113.5 280.6 166.67 332.8 166.67 404.5 500 95.5 500 166.67 166.67 220.6 166.67" fill="${color}"/>
			</svg>`;
		default:
			return "";
	}
};

// Convert FEN to a matrix using model coordinates: rank 8 at index 0, file 'a' at index 0
const fenToMatrix = (fen: string): (PieceKey | null)[][] => {
	try {
		const piecePlacement = fen.split(" ")[0] ?? "";
		const ranks = piecePlacement.split("/");
		if (ranks.length !== 8) throw new Error("Invalid FEN ranks");
		const matrix: (PieceKey | null)[][] = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
		for (let r = 0; r < 8; r++) {
			const rankStr = ranks[r] ?? "";
			let file = 0;
			for (let i = 0; i < rankStr.length; i++) {
				const ch = rankStr[i] as string;
				if (/^[1-8]$/.test(ch)) {
					file += Number.parseInt(ch, 10);
					continue;
				}
				const isUpper = ch === ch.toUpperCase();
				const color = isUpper ? "w" : "b";
				const type = ch.toUpperCase();
				const key = (color + type) as PieceKey; // e.g., wP, bK
				matrix[r][file] = key;
				file += 1;
			}
			if (file !== 8) throw new Error("Invalid FEN file count");
		}
		return matrix;
	} catch {
		// Fallback to starting position
		return [
			["bR", "bN", "bB", "bQ", "bK", "bB", "bN", "bR"],
			["bP", "bP", "bP", "bP", "bP", "bP", "bP", "bP"],
			[null, null, null, null, null, null, null, null],
			[null, null, null, null, null, null, null, null],
			[null, null, null, null, null, null, null, null],
			[null, null, null, null, null, null, null, null],
			["wP", "wP", "wP", "wP", "wP", "wP", "wP", "wP"],
			["wR", "wN", "wB", "wQ", "wK", "wB", "wN", "wR"],
		];
	}
};

export default function OGTemplate({ query }: OGTemplateProps) {
	// Clean query like "u-d.png" -> "u-d"
	const raw = (query ?? "").trim();
	const codeInput = raw ? raw.split(".")[0] ?? "" : "";
	let parsed: ParsedState = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', sideToMove: 'w' };
	try {
		parsed = parseCode(codeInput);
	} catch {}
	const matrix = fenToMatrix(parsed.fen);
	const sideToMove = parsed.sideToMove;
	const rankOrder = sideToMove === 'w' ? [0,1,2,3,4,5,6,7] as const : [7,6,5,4,3,2,1,0] as const;
	const fileOrder = sideToMove === 'w' ? [0,1,2,3,4,5,6,7] as const : [7,6,5,4,3,2,1,0] as const;
	return (
		<PreSatori>
			{(transform) => (
				<>
					{transform(
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
									// No rounded corners, no gap, no shadow for OG board
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
													{piece && (() => {
														const svg = getPieceSvg(piece);
														const toBase64 = (str: string): string => {
															try {
																// Prefer global Buffer when available
																if (typeof Buffer !== "undefined") {
																	return Buffer.from(str, "utf-8").toString("base64");
																}
																if (typeof btoa !== "undefined") {
																	return btoa(unescape(encodeURIComponent(str)));
																}
																return "";
															} catch {
																return "";
															}
														};
														const dataUrl = `data:image/svg+xml;base64,${toBase64(svg)}`;
														return (
															<img
																src={dataUrl}
																alt=""
																width={72}
																height={72}
																style={{ display: "block" }}
															/>
														);
													})()}
												</div>
											);
										})}
									</div>
								))}
							</div>
						</div>,
					)}
				</>
			)}
		</PreSatori>
	);
}
