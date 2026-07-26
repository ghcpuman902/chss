type PieceKey =
	| "wP" | "wN" | "wB" | "wR" | "wQ" | "wK"
	| "bP" | "bN" | "bB" | "bR" | "bQ" | "bK";

/** Shared 500×500 artboard; glyphs bottom-aligned (Q/K touch ceiling). */
const pieceSvgs: Record<PieceKey, string> = {
	wP: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
	<g transform="translate(95.5 95.5)">
		<path d="M0,404.5l111.79-223.57c-31.3-15.67-52.79-48.04-52.79-85.43C59,42.76,101.76,0,154.5,0s95.51,42.76,95.51,95.5c0,37.39-21.49,69.76-52.7899,85.43l111.7799,223.57H0Z" fill="#ffffff"/>
	</g>
</svg>`,
	bP: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
	<g transform="translate(95.5 95.5)">
		<path d="M0,404.5l111.79-223.57c-31.3-15.67-52.79-48.04-52.79-85.43C59,42.76,101.76,0,154.5,0s95.51,42.76,95.51,95.5c0,37.39-21.49,69.76-52.7899,85.43l111.7799,223.57H0Z" fill="#000000"/>
	</g>
</svg>`,
	wR: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
	<g transform="translate(131.215 103.73)">
		<polygon points="0 396.27 33.43 83.17 23.42 83.17 23.42 0 63.45 0 63.45 43.14 98.91 43.14 98.91 0 138.93 0 138.93 43.14 174.39 43.14 174.39 0 214.42 0 214.42 83.17 204.15 83.17 237.57 396.27 0 396.27" fill="#ffffff"/>
	</g>
</svg>`,
	bR: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
	<g transform="translate(131.215 103.73)">
		<polygon points="0 396.27 33.43 83.17 23.42 83.17 23.42 0 63.45 0 63.45 43.14 98.91 43.14 98.91 0 138.93 0 138.93 43.14 174.39 43.14 174.39 0 214.42 0 214.42 83.17 204.15 83.17 237.57 396.27 0 396.27" fill="#000000"/>
	</g>
</svg>`,
	wN: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
	<g transform="translate(108.66005 83.5)">
		<polygon points="157.11 230.55 250 416.5 0 416.5 0 125 125 0 154.5 0 154.5 59 282.6799 187.48 239.5 230.55 157.11 230.55" fill="#ffffff"/>
	</g>
</svg>`,
	bN: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
	<g transform="translate(108.66005 83.5)">
		<polygon points="157.11 230.55 250 416.5 0 416.5 0 125 125 0 154.5 0 154.5 59 282.6799 187.48 239.5 230.55 157.11 230.55" fill="#000000"/>
	</g>
</svg>`,
	wB: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
	<g transform="translate(131.215 83.63)">
		<polygon points="237.57 416.37 0 416.37 35.59 83.04 118.65 .14 118.79 0 118.92 .14 201.99 83.04 202.05 83.64 118.92 166.77 150.18 198.03 208.08 140.13 237.57 416.37" fill="#ffffff"/>
	</g>
</svg>`,
	bB: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
	<g transform="translate(131.215 83.63)">
		<polygon points="237.57 416.37 0 416.37 35.59 83.04 118.65 .14 118.79 0 118.92 .14 201.99 83.04 202.05 83.64 118.92 166.77 150.18 198.03 208.08 140.13 237.57 416.37" fill="#000000"/>
	</g>
</svg>`,
	wQ: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
	<g transform="translate(95.5 0.335)">
		<polygon points="71.1667 166.3316 237.3019 166.3316 231.75 249.6636 309 499.665 0 499.665 77.25 249.6636 71.1667 166.3316" fill="#ffffff"/>
		<circle cx="154.5011" cy="83.1658" r="83.1658" fill="#ffffff"/>
	</g>
</svg>`,
	bQ: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
	<g transform="translate(95.5 0.335)">
		<polygon points="71.1667 166.3316 237.3019 166.3316 231.75 249.6636 309 499.665 0 499.665 77.25 249.6636 71.1667 166.3316" fill="#000000"/>
		<circle cx="154.5011" cy="83.1658" r="83.1658" fill="#000000"/>
	</g>
</svg>`,
	wK: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
	<g transform="translate(95.5 0.34)">
		<polygon points="0 499.66 77.25 249.66 71.17 166.33 134.48 166.33 134.48 103.18 71.33 103.18 71.33 63.15 134.48 63.15 134.48 0 174.51 0 174.51 63.15 237.66 63.15 237.66 103.18 174.51 103.18 174.51 166.33 237.3 166.33 231.75 249.66 309 499.66 0 499.66" fill="#ffffff"/>
	</g>
</svg>`,
	bK: `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500">
	<g transform="translate(95.5 0.34)">
		<polygon points="0 499.66 77.25 249.66 71.17 166.33 134.48 166.33 134.48 103.18 71.33 103.18 71.33 63.15 134.48 63.15 134.48 0 174.51 0 174.51 63.15 237.66 63.15 237.66 103.18 174.51 103.18 174.51 166.33 237.3 166.33 231.75 249.66 309 499.66 0 499.66" fill="#000000"/>
	</g>
</svg>`,
};

// Edge-safe: create utf8 data URLs without Buffer
const encodeForDataUrl = (svg: string): string => {
    // Minimal escaping for data URL
    return encodeURIComponent(svg)
        .replace(/%20/g, ' ')
        .replace(/%22/g, '\"')
        .replace(/%3D/g, '=')
        .replace(/%3A/g, ':')
        .replace(/%2F/g, '/')
        .replace(/%3B/g, ';')
        .replace(/%2C/g, ',')
        .replace(/%0A/g, '')
        .replace(/%09/g, '')
        .replace(/%23/g, '#');
};

const pieceDataUrls: Record<PieceKey, string> = Object.fromEntries(
    Object.entries(pieceSvgs).map(([key, svg]) => [
        key,
        `data:image/svg+xml;utf8,${encodeForDataUrl(svg)}`,
    ])
) as Record<PieceKey, string>;

export const getPieceDataUrl = (piece: PieceKey): string => pieceDataUrls[piece];
