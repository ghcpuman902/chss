import fs from "fs";
import path from "path";
import { cache } from "react";

// Pre-load fonts at module level to avoid repeated network requests
let fontCache: { interNormal: Buffer; interBold: Buffer } | null = null;

const loadFont = cache(async () => {
	// Return cached fonts if already loaded
	if (fontCache) {
		return fontCache;
	}

	try {
		// Check if we're in edge runtime (no fs available)
		const isEdgeRuntime = typeof fs === 'undefined' || !fs.readFileSync;
		
		if (isEdgeRuntime) {
			// Use fetch to load fonts from network in edge runtime
			const baseUrl = process.env.VERCEL_URL 
				? `https://${process.env.VERCEL_URL}` 
				: 'https://chss.chat';
			
			const [interNormalResponse, interBoldResponse] = await Promise.all([
				fetch(`${baseUrl}/fonts/inter-latin-ext-400-normal.woff`),
				fetch(`${baseUrl}/fonts/inter-latin-ext-700-normal.woff`)
			]);
			
			if (!interNormalResponse.ok || !interBoldResponse.ok) {
				throw new Error(`Failed to fetch fonts: ${interNormalResponse.status} ${interBoldResponse.status}`);
			}
			
			const [interNormalArrayBuffer, interBoldArrayBuffer] = await Promise.all([
				interNormalResponse.arrayBuffer(),
				interBoldResponse.arrayBuffer()
			]);
			
			const interNormalFont = Buffer.from(interNormalArrayBuffer);
			const interBoldFont = Buffer.from(interBoldArrayBuffer);
			
			// Cache the fonts
			fontCache = { interNormal: interNormalFont, interBold: interBoldFont };
			console.log("Fonts loaded and cached successfully from network");
			return fontCache;
		} else {
			// Use fs for Node.js runtime
			const interNormalFont = Buffer.from(
				fs.readFileSync(path.resolve("./public/fonts/inter-latin-ext-400-normal.woff")),
			);
			const interBoldFont = Buffer.from(
				fs.readFileSync(path.resolve("./public/fonts/inter-latin-ext-700-normal.woff")),
			);
			
			// Cache the fonts
			fontCache = { interNormal: interNormalFont, interBold: interBoldFont };
			console.log("Fonts loaded and cached successfully from filesystem");
			return fontCache;
		}
	} catch (error) {
		console.error("Error loading fonts:", error);
		return null;
	}
});

export default loadFont;
